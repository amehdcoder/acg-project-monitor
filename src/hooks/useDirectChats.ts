import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { SpecialPayload } from "@/components/ProjectChat/specialMessages";

export interface DirectChat {
  conversation_id: string;
  other_id: string;
  other_name: string;
  status: string;
  archived: boolean;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_id: string | null;
  unread_count: number;
  updated_at: string;
}

export interface DirectMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  message_type: string;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
}

/**
 * Lists the current user's one-on-one (Proximity) conversations so they can be
 * shown in the WhatsApp-style chat list and continued even when the other
 * person is no longer nearby.
 */
export function useDirectChats(enabled: boolean) {
  const { user } = useAuth();
  const [chats, setChats] = useState<DirectChat[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchChats = useCallback(async () => {
    if (!user?.id || !enabled) return;
    setLoading(true);
    const { data, error } = await supabase.rpc("get_proximity_conversations");
    if (!error && data) {
      // Deduplicate so each person appears only once across all chats. The RPC
      // already returns rows newest-first, so the first row per `other_id` is the
      // most recent conversation; we keep that and fold any unread counts from
      // older duplicate threads into it so nothing is silently lost.
      const seen = new Map<string, DirectChat>();
      for (const row of data as DirectChat[]) {
        const existing = seen.get(row.other_id);
        if (existing) {
          existing.unread_count += row.unread_count || 0;
        } else {
          seen.set(row.other_id, { ...row });
        }
      }
      setChats(Array.from(seen.values()));
    }
    setLoading(false);
  }, [user?.id, enabled]);

  useEffect(() => {
    if (!enabled) return;
    fetchChats();
  }, [enabled, fetchChats]);

  // Immediately zero a conversation's unread badge when its thread is opened
  // (before the realtime read-receipt round-trip completes), so badges reset
  // the instant the user views a chat.
  const markRead = useCallback((conversationId: string) => {
    setChats((prev) =>
      prev.map((c) =>
        c.conversation_id === conversationId ? { ...c, unread_count: 0 } : c
      )
    );
  }, []);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const handler = (e: Event) => {
      const id = (e as CustomEvent).detail?.conversationId as string | undefined;
      if (id) markRead(id);
    };
    window.addEventListener("amehnities:direct-read", handler as EventListener);
    return () =>
      window.removeEventListener("amehnities:direct-read", handler as EventListener);
  }, [enabled, markRead]);

  // Refresh the list whenever a relevant message arrives/changes.
  useEffect(() => {
    if (!user?.id || !enabled) return;
    const channel = supabase
      .channel(`direct-chats-list-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "proximity_messages" },
        () => fetchChats()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "proximity_conversations" },
        () => fetchChats()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, enabled, fetchChats]);

  const setFlag = useCallback(
    async (conversationId: string, action: "archive" | "unarchive" | "delete") => {
      const { error } = await supabase.rpc("set_proximity_conversation_flag", {
        _conversation_id: conversationId,
        _action: action,
      });
      if (error) {
        toast.error("Action failed. Please try again.");
        return;
      }
      if (action === "delete") {
        toast.success("Chat deleted");
        setChats((prev) => prev.filter((c) => c.conversation_id !== conversationId));
      } else {
        toast.success(action === "archive" ? "Chat archived" : "Chat unarchived");
        setChats((prev) =>
          prev.map((c) =>
            c.conversation_id === conversationId
              ? { ...c, archived: action === "archive" }
              : c
          )
        );
      }
    },
    []
  );

  return { chats, loading, fetchChats, setFlag, markRead };
}

/**
 * Loads, subscribes to and sends messages within a single direct conversation.
 */
export function useDirectThread(conversation: DirectChat | null) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  const convId = conversation?.conversation_id ?? null;

  useEffect(() => {
    if (!convId || !user?.id) {
      setMessages([]);
      return;
    }
    let active = true;
    setLoading(true);

    (async () => {
      const { data } = await supabase
        .from("proximity_messages")
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });
      if (!active) return;
      setMessages((data as DirectMessage[]) ?? []);
      setLoading(false);

      // Mark incoming messages delivered + read, then immediately reset this
      // conversation's unread badges everywhere (list + global counter).
      const nowIso = new Date().toISOString();
      supabase
        .from("proximity_messages")
        .update({ delivered_at: nowIso, read_at: nowIso })
        .eq("conversation_id", convId)
        .eq("recipient_id", user.id)
        .is("read_at", null);
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("amehnities:direct-read", { detail: { conversationId: convId } })
        );
      }
    })();

    const channel = supabase
      .channel(`direct-thread-${convId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "proximity_messages", filter: `conversation_id=eq.${convId}` },
        (payload) => {
          const msg = payload.new as DirectMessage;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          setOtherTyping(false);
          if (msg.recipient_id === user.id) {
            supabase
              .from("proximity_messages")
              .update({ delivered_at: new Date().toISOString(), read_at: new Date().toISOString() })
              .eq("id", msg.id);
            // The thread is open, so this arrives already-read — keep badges at 0.
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("amehnities:direct-read", { detail: { conversationId: convId } })
              );
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "proximity_messages", filter: `conversation_id=eq.${convId}` },
        (payload) => {
          const msg = payload.new as DirectMessage;
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
        }
      )
      .on("broadcast", { event: "typing" }, (payload) => {
        if (payload.payload?.from && payload.payload.from !== user.id) {
          setOtherTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 3500);
        }
      })
      .subscribe();
    channelRef.current = channel;

    return () => {
      active = false;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [convId, user?.id]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 1500) return;
    lastTypingSentRef.current = now;
    channelRef.current?.send({ type: "broadcast", event: "typing", payload: { from: user?.id } });
  }, [user?.id]);

  const sendMessage = useCallback(
    async (text: string) => {
      const body = text.trim();
      if (!body || !convId || !conversation || !user?.id) return;
      setSending(true);
      const { data, error } = await supabase
        .from("proximity_messages")
        .insert({
          conversation_id: convId,
          sender_id: user.id,
          recipient_id: conversation.other_id,
          body,
        })
        .select()
        .single();
      // Reactivate the conversation if it was previously ended.
      supabase
        .from("proximity_conversations")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", convId);
      setSending(false);
      if (error) {
        toast.error("Message failed to send.");
        return;
      }
      setMessages((prev) =>
        prev.some((m) => m.id === (data as DirectMessage).id) ? prev : [...prev, data as DirectMessage]
      );
    },
    [convId, conversation, user?.id]
  );

  // Send a structured message (poll / location / event). Payload is JSON in body.
  const sendSpecial = useCallback(
    async (messageType: "poll" | "location" | "event", payload: SpecialPayload) => {
      if (!convId || !conversation || !user?.id) return;
      setSending(true);
      const { data, error } = await supabase
        .from("proximity_messages")
        .insert({
          conversation_id: convId,
          sender_id: user.id,
          recipient_id: conversation.other_id,
          body: JSON.stringify(payload),
          message_type: messageType,
        } as never)
        .select()
        .single();
      supabase
        .from("proximity_conversations")
        .update({ status: "active", updated_at: new Date().toISOString() })
        .eq("id", convId);
      setSending(false);
      if (error) {
        toast.error("Couldn't send. Please try again.");
        return;
      }
      setMessages((prev) =>
        prev.some((m) => m.id === (data as DirectMessage).id) ? prev : [...prev, data as DirectMessage]
      );
    },
    [convId, conversation, user?.id]
  );

  return { messages, loading, sending, otherTyping, notifyTyping, sendMessage, sendSpecial };
}
