import { useCallback, useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Video, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CallDialog } from "./CallDialog";
import type { ChatGroup, ChatGroupMember } from "@/hooks/useProjectChat";

interface IncomingCall {
  id: string; // active_calls row id
  chatGroupId: string;
  callType: "voice" | "video";
  callerName: string;
  groupName: string;
}

interface ActiveCall {
  type: "voice" | "video";
  group: ChatGroup;
  members: ChatGroupMember[];
}

/**
 * Global WhatsApp-style incoming call experience. Renders a full-screen ringing
 * overlay (with ringtone + vibration) whenever another member starts a voice or
 * video call in any chat group the current user belongs to, and lets them join
 * the live call directly — no need to manually navigate to the chat first.
 */
export function IncomingCallManager() {
  const { user } = useAuth();
  const [incoming, setIncoming] = useState<IncomingCall[]>([]);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const seenRef = useRef<Set<string>>(new Set());

  // --- Ringtone (Web Audio, no asset required) ---
  const audioCtxRef = useRef<AudioContext | null>(null);
  const ringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vibrateIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRingtone = useCallback(() => {
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
    if (vibrateIntervalRef.current) {
      clearInterval(vibrateIntervalRef.current);
      vibrateIntervalRef.current = null;
    }
    try {
      navigator.vibrate?.(0);
    } catch {
      /* noop */
    }
  }, []);

  const playRingPattern = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        audioCtxRef.current = new Ctx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const now = ctx.currentTime;
      // Two short tones — classic ring cadence.
      [0, 0.4].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(480, now + offset);
        osc.frequency.setValueAtTime(620, now + offset + 0.18);
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.18, now + offset + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.32);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + 0.34);
      });
    } catch {
      /* audio not available */
    }
  }, []);

  const startRingtone = useCallback(() => {
    if (ringIntervalRef.current) return; // already ringing
    playRingPattern();
    ringIntervalRef.current = setInterval(playRingPattern, 2500);
    try {
      navigator.vibrate?.([400, 200, 400]);
      vibrateIntervalRef.current = setInterval(() => {
        navigator.vibrate?.([400, 200, 400]);
      }, 2500);
    } catch {
      /* noop */
    }
  }, [playRingPattern]);

  // Ring while there is at least one pending incoming call (and not already in a call).
  useEffect(() => {
    if (incoming.length > 0 && !activeCall) {
      startRingtone();
    } else {
      stopRingtone();
    }
  }, [incoming.length, activeCall, startRingtone, stopRingtone]);

  useEffect(() => () => stopRingtone(), [stopRingtone]);

  // Shared ingest: turns a raw active_calls row into a ringing prompt (idempotent).
  const ingestCall = useCallback(
    async (call: Record<string, unknown> | null) => {
      if (!call || !user?.id) return;
      const callId = call.id as string;
      if (!callId) return;
      if (call.started_by === user.id || seenRef.current.has(callId)) return;
      if (call.is_active === false) return;
      // Ignore stale rows from previous, never-ended sessions.
      const startedAt = call.started_at ? new Date(call.started_at as string).getTime() : Date.now();
      if (Date.now() - startedAt > 120000) return;
      seenRef.current.add(callId);

      const chatGroupId = call.chat_group_id as string;

      // Only ring if the user is a member of the group.
      const { data: membership } = await supabase
        .from("chat_group_members")
        .select("id")
        .eq("chat_group_id", chatGroupId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!membership) return;

      const [callerRes, groupRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("user_id", call.started_by as string)
          .maybeSingle(),
        supabase
          .from("chat_groups")
          .select("name")
          .eq("id", chatGroupId)
          .maybeSingle(),
      ]);

      const callerName = callerRes.data
        ? `${callerRes.data.first_name ?? ""} ${callerRes.data.last_name ?? ""}`.trim() ||
          "Someone"
        : "Someone";

      setIncoming((prev) =>
        prev.some((c) => c.id === callId)
          ? prev
          : [
              ...prev,
              {
                id: callId,
                chatGroupId,
                callType: (call.call_type as "voice" | "video") || "voice",
                callerName,
                groupName: groupRes.data?.name || "Group call",
              },
            ]
      );
    },
    [user?.id]
  );

  // Polling fallback: catches calls that started while the realtime socket was
  // mid-reconnect or before this manager finished mounting, so members still ring.
  const scanForActiveCalls = useCallback(async () => {
    if (!user?.id) return;
    const { data: memberships } = await supabase
      .from("chat_group_members")
      .select("chat_group_id")
      .eq("user_id", user.id);
    const groupIds = (memberships || []).map((m) => m.chat_group_id);
    if (!groupIds.length) return;

    const { data: calls } = await (supabase as any)
      .from("active_calls")
      .select("*")
      .eq("is_active", true)
      .in("chat_group_id", groupIds)
      .order("started_at", { ascending: false })
      .limit(20);

    ((calls as Record<string, unknown>[]) || []).forEach((c) => void ingestCall(c));
  }, [user?.id, ingestCall]);

  // --- Realtime subscription to calls across the user's groups ---
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("incoming-call-manager")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "active_calls" },
        (payload: { new: Record<string, unknown> }) => {
          void ingestCall(payload.new);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "active_calls" },
        (payload: { new: Record<string, unknown> }) => {
          const call = payload.new;
          if (!call || call.is_active !== false) return;
          // Caller ended/cancelled before we answered — dismiss the ring.
          setIncoming((prev) => prev.filter((c) => c.id !== call.id));
        }
      )
      .subscribe();

    // Immediate scan + lightweight polling fallback for missed realtime events.
    void scanForActiveCalls();
    const poll = setInterval(() => void scanForActiveCalls(), 6000);
    const onFocus = () => void scanForActiveCalls();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, [user?.id, ingestCall, scanForActiveCalls]);

  const current = incoming[0] ?? null;

  const handleDecline = useCallback(() => {
    if (!current) return;
    setIncoming((prev) => prev.filter((c) => c.id !== current.id));
  }, [current]);

  const handleAccept = useCallback(async () => {
    if (!current) return;
    const callToAnswer = current;
    setIncoming((prev) => prev.filter((c) => c.id !== callToAnswer.id));
    stopRingtone();

    // Load the group + its members so the call UI is fully populated.
    const { data: groupRow } = await supabase
      .from("chat_groups")
      .select("*")
      .eq("id", callToAnswer.chatGroupId)
      .maybeSingle();
    if (!groupRow) return;

    const { data: memberRows } = await supabase
      .from("chat_group_members")
      .select("*")
      .eq("chat_group_id", callToAnswer.chatGroupId);

    const userIds = (memberRows || []).map((m) => m.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, avatar_url, email")
      .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));

    const members: ChatGroupMember[] = (memberRows || []).map((m) => ({
      ...(m as ChatGroupMember),
      user: profileMap.get(m.user_id) || undefined,
    }));

    setActiveCall({
      type: callToAnswer.callType,
      group: groupRow as ChatGroup,
      members,
    });
  }, [current, stopRingtone]);

  return (
    <>
      {/* Incoming call ringing overlay */}
      {current && !activeCall && (
        <div className="fixed inset-0 z-[200] flex flex-col items-center justify-between bg-gradient-to-b from-card via-background to-card px-6 py-16 animate-in fade-in">
          <div className="flex flex-col items-center gap-4 mt-8">
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              Incoming {current.callType === "video" ? "video" : "voice"} call
            </p>
            <div className="relative">
              <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              <Avatar className="h-28 w-28 ring-4 ring-primary/30 shadow-card">
                <AvatarFallback className="bg-primary/10 text-primary text-3xl font-semibold">
                  {current.callerName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground">
                {current.callerName}
              </h2>
              <p className="text-sm text-muted-foreground mt-1 flex items-center justify-center gap-1.5">
                {current.callType === "video" ? (
                  <Video className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
                {current.groupName}
              </p>
              {incoming.length > 1 && (
                <p className="text-xs text-muted-foreground mt-2">
                  +{incoming.length - 1} more incoming call
                  {incoming.length - 1 > 1 ? "s" : ""}
                </p>
              )}
            </div>
          </div>

          <div className="flex w-full max-w-xs items-center justify-between">
            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={handleDecline}
                size="icon"
                className="h-16 w-16 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-card animate-pulse"
                aria-label="Decline call"
              >
                <PhoneOff className="h-7 w-7" />
              </Button>
              <span className="text-xs text-muted-foreground">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <Button
                onClick={handleAccept}
                size="icon"
                className="h-16 w-16 rounded-full bg-green-600 text-white hover:bg-green-700 shadow-card animate-bounce"
                aria-label="Accept call"
              >
                {current.callType === "video" ? (
                  <Video className="h-7 w-7" />
                ) : (
                  <Phone className="h-7 w-7" />
                )}
              </Button>
              <span className="text-xs text-muted-foreground">Accept</span>
            </div>
          </div>
        </div>
      )}

      {/* Live call after accepting */}
      {activeCall && (
        <CallDialog
          type={activeCall.type}
          group={activeCall.group}
          members={activeCall.members}
          isOpen={!!activeCall}
          onClose={() => setActiveCall(null)}
        />
      )}
    </>
  );
}
