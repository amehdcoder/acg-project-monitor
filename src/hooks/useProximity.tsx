import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useCallback,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const PROXIMITY_RADIUS_KM = 10;
const PRESENCE_PUSH_MS = 20000; // upsert own location at most every 20s
const NEARBY_REFRESH_MS = 25000; // re-scan nearby users
const PRESENCE_FRESH_MS = 5 * 60 * 1000; // ignore stale presence (>5 min)

export interface NearbyUser {
  user_id: string;
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
}

export interface ProximityMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
}

interface ActiveChat {
  conversationId: string;
  otherId: string;
  otherName: string;
  distanceKm: number | null;
  ended: boolean;
}

interface ProximityContextValue {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  nearby: NearbyUser[];
  activeChat: ActiveChat | null;
  messages: ProximityMessage[];
  otherTyping: boolean;
  notifyTyping: () => void;
  openChat: (u: { user_id: string; name: string; distanceKm?: number }) => Promise<void>;
  closeChatWindow: () => void;
  endChat: () => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
}

const ProximityContext = createContext<ProximityContextValue | null>(null);

function readEnabledFromSettings(): boolean {
  try {
    const saved = localStorage.getItem("app_settings");
    if (!saved) return true; // default on
    const parsed = JSON.parse(saved);
    return parsed?.enableProximityDetection !== false;
  } catch {
    return true;
  }
}

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const lat1 = (aLat * Math.PI) / 180;
  const lat2 = (bLat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const ProximityProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile } = useAuth();
  const [enabled, setEnabledState] = useState<boolean>(readEnabledFromSettings());
  const [nearby, setNearby] = useState<NearbyUser[]>([]);
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
  const [messages, setMessages] = useState<ProximityMessage[]>([]);
  const [otherTyping, setOtherTyping] = useState(false);

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  const posRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastPushRef = useRef<number>(0);
  const watchIdRef = useRef<number | null>(null);
  const seenNearbyRef = useRef<Set<string>>(new Set());
  const activeChatRef = useRef<ActiveChat | null>(null);
  const chatChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  const displayName = useCallback(() => {
    const n = `${profile?.first_name ?? ""} ${profile?.last_name ?? ""}`.trim();
    return n || profile?.email || "A nearby user";
  }, [profile]);

  // ---- React to settings toggle changes (same tab + cross tab) ----
  useEffect(() => {
    const sync = () => setEnabledState(readEnabledFromSettings());
    window.addEventListener("storage", sync);
    window.addEventListener("app-settings-changed", sync as EventListener);
    window.addEventListener("focus", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("app-settings-changed", sync as EventListener);
      window.removeEventListener("focus", sync);
    };
  }, []);

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v);
    try {
      const saved = localStorage.getItem("app_settings");
      const parsed = saved ? JSON.parse(saved) : {};
      parsed.enableProximityDetection = v;
      localStorage.setItem("app_settings", JSON.stringify(parsed));
      window.dispatchEvent(new Event("app-settings-changed"));
    } catch {
      /* ignore */
    }
  }, []);

  const pushPresence = useCallback(
    async (lat: number, lng: number, isEnabled: boolean) => {
      if (!user?.id) return;
      await supabase.from("proximity_presence").upsert(
        {
          user_id: user.id,
          display_name: displayName(),
          lat,
          lng,
          enabled: isEnabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    },
    [user?.id, displayName]
  );

  // ---- Geolocation watch + presence upsert ----
  useEffect(() => {
    if (!user?.id) return;

    if (!enabled) {
      // Opt-out: stop watching and remove presence so peers can't see us.
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setNearby([]);
      seenNearbyRef.current.clear();
      supabase.from("proximity_presence").delete().eq("user_id", user.id);
      return;
    }

    if (!("geolocation" in navigator)) return;

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        posRef.current = { lat, lng };
        const now = Date.now();
        if (now - lastPushRef.current > PRESENCE_PUSH_MS) {
          lastPushRef.current = now;
          pushPresence(lat, lng, true);
        }
      },
      () => {
        /* ignore geolocation errors silently */
      },
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 27000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [enabled, user?.id, pushPresence]);

  // ---- Scan for nearby users ----
  const scanNearby = useCallback(async () => {
    if (!user?.id || !enabled || !posRef.current) return;
    const { lat, lng } = posRef.current;
    const since = new Date(Date.now() - PRESENCE_FRESH_MS).toISOString();
    const { data, error } = await supabase
      .from("proximity_presence")
      .select("user_id, display_name, lat, lng, updated_at")
      .eq("enabled", true)
      .neq("user_id", user.id)
      .gte("updated_at", since);
    if (error || !data) return;

    const list: NearbyUser[] = [];
    for (const row of data) {
      if (row.lat == null || row.lng == null) continue;
      const d = haversineKm(lat, lng, row.lat, row.lng);
      if (d <= PROXIMITY_RADIUS_KM) {
        list.push({
          user_id: row.user_id,
          name: row.display_name || "A nearby user",
          lat: row.lat,
          lng: row.lng,
          distanceKm: d,
        });
      }
    }
    list.sort((a, b) => a.distanceKm - b.distanceKm);

    // Announce newcomers with a friendly popup.
    for (const u of list) {
      if (!seenNearbyRef.current.has(u.user_id)) {
        seenNearbyRef.current.add(u.user_id);
        toast(`📍 ${u.name} is nearby`, {
          description: `About ${u.distanceKm.toFixed(u.distanceKm < 1 ? 2 : 1)} km away`,
          action: {
            label: "Say hi",
            onClick: () =>
              openChat({ user_id: u.user_id, name: u.name, distanceKm: u.distanceKm }),
          },
        });
      }
    }
    // Drop users no longer in range from the "seen" set so re-entry re-announces.
    const inRange = new Set(list.map((u) => u.user_id));
    for (const id of Array.from(seenNearbyRef.current)) {
      if (!inRange.has(id)) seenNearbyRef.current.delete(id);
    }

    setNearby(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, enabled]);

  useEffect(() => {
    if (!enabled || !user?.id) return;
    const t = setInterval(scanNearby, NEARBY_REFRESH_MS);
    const first = setTimeout(scanNearby, 4000);
    return () => {
      clearInterval(t);
      clearTimeout(first);
    };
  }, [enabled, user?.id, scanNearby]);

  // ---- Incoming message popups (global) ----
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`proximity-inbox-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "proximity_messages",
          filter: `recipient_id=eq.${user.id}`,
        },
        async (payload) => {
          const msg = payload.new as ProximityMessage;
          // If the relevant chat is open, append, mark delivered + read.
          if (activeChatRef.current?.conversationId === msg.conversation_id) {
            setMessages((prev) =>
              prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
            );
            setOtherTyping(false);
            supabase
              .from("proximity_messages")
              .update({
                delivered_at: msg.delivered_at ?? new Date().toISOString(),
                read_at: new Date().toISOString(),
              })
              .eq("id", msg.id);
            return;
          }
          // Recipient is online (received this push) → mark as delivered (double tick).
          supabase
            .from("proximity_messages")
            .update({ delivered_at: new Date().toISOString() })
            .eq("id", msg.id)
            .is("delivered_at", null);
          // Look up sender name from presence.
          const { data: senderRow } = await supabase
            .from("proximity_presence")
            .select("display_name")
            .eq("user_id", msg.sender_id)
            .maybeSingle();
          const senderName = senderRow?.display_name || "A nearby user";
          toast(`💬 ${senderName}`, {
            description: msg.body,
            duration: 10000,
            action: {
              label: "Reply",
              onClick: () =>
                openChat({ user_id: msg.sender_id, name: senderName }),
            },
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const subscribeToConversation = useCallback(
    (conversationId: string) => {
      if (chatChannelRef.current) {
        supabase.removeChannel(chatChannelRef.current);
        chatChannelRef.current = null;
      }
      const channel = supabase
        .channel(`proximity-chat-${conversationId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "proximity_messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const msg = payload.new as ProximityMessage;
            setMessages((prev) =>
              prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
            );
            setOtherTyping(false);
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "proximity_messages",
            filter: `conversation_id=eq.${conversationId}`,
          },
          (payload) => {
            const msg = payload.new as ProximityMessage;
            setMessages((prev) =>
              prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m))
            );
          }
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "proximity_conversations",
            filter: `id=eq.${conversationId}`,
          },
          (payload) => {
            const conv = payload.new as { status: string };
            if (conv.status === "ended") {
              setActiveChat((prev) =>
                prev && prev.conversationId === conversationId
                  ? { ...prev, ended: true }
                  : prev
              );
            }
          }
        )
        .on("broadcast", { event: "typing" }, (payload) => {
          if (payload.payload?.from && payload.payload.from !== user?.id) {
            setOtherTyping(true);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 3500);
          }
        })
        .subscribe();
      chatChannelRef.current = channel;
    },
    [user?.id]
  );

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1500) return; // throttle
    lastTypingSentRef.current = now;
    chatChannelRef.current?.send({
      type: "broadcast",
      event: "typing",
      payload: { from: user?.id },
    });
  }, [user?.id]);

  const openChat = useCallback(
    async (u: { user_id: string; name: string; distanceKm?: number }) => {
      if (!user?.id) return;
      const { data: convId, error } = await supabase.rpc(
        "start_proximity_conversation",
        { _other: u.user_id }
      );
      if (error || !convId) {
        toast.error("Could not start the chat. Please try again.");
        return;
      }
      const conversationId = convId as unknown as string;
      setActiveChat({
        conversationId,
        otherId: u.user_id,
        otherName: u.name,
        distanceKm: u.distanceKm ?? null,
        ended: false,
      });
      // Load history
      const { data: history } = await supabase
        .from("proximity_messages")
        .select("*")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true });
      setMessages((history as ProximityMessage[]) ?? []);
      // Mark received messages as read
      supabase
        .from("proximity_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("recipient_id", user.id)
        .is("read_at", null);
      subscribeToConversation(conversationId);
    },
    [user?.id, subscribeToConversation]
  );

  const closeChatWindow = useCallback(() => {
    if (chatChannelRef.current) {
      supabase.removeChannel(chatChannelRef.current);
      chatChannelRef.current = null;
    }
    setActiveChat(null);
    setMessages([]);
  }, []);

  const endChat = useCallback(async () => {
    const chat = activeChatRef.current;
    if (!chat || !user?.id) return;
    await supabase
      .from("proximity_conversations")
      .update({ status: "ended", ended_by: user.id })
      .eq("id", chat.conversationId);
    setActiveChat((prev) => (prev ? { ...prev, ended: true } : prev));
  }, [user?.id]);

  const sendMessage = useCallback(
    async (text: string) => {
      const chat = activeChatRef.current;
      const body = text.trim();
      if (!chat || !user?.id || !body || chat.ended) return;
      const { data, error } = await supabase
        .from("proximity_messages")
        .insert({
          conversation_id: chat.conversationId,
          sender_id: user.id,
          recipient_id: chat.otherId,
          body,
        })
        .select()
        .single();
      if (error) {
        toast.error("Message failed to send.");
        return;
      }
      // Re-activate conversation if it was ended on our side (defensive).
      setMessages((prev) =>
        prev.some((m) => m.id === (data as ProximityMessage).id)
          ? prev
          : [...prev, data as ProximityMessage]
      );
    },
    [user?.id]
  );

  const value: ProximityContextValue = {
    enabled,
    setEnabled,
    nearby,
    activeChat,
    messages,
    openChat,
    closeChatWindow,
    endChat,
    sendMessage,
  };

  return <ProximityContext.Provider value={value}>{children}</ProximityContext.Provider>;
};

export const useProximity = () => {
  const ctx = useContext(ProximityContext);
  if (!ctx) throw new Error("useProximity must be used within ProximityProvider");
  return ctx;
};
