/**
 * Collaborator Presence — Google-Workspace-style live presence.
 *
 * EVERY authenticated user silently "tracks" themselves on a shared Realtime
 * presence channel while the app is open. The list of active collaborators is
 * only ever *read* (and rendered) for the Owner / Super Admins via the
 * `<CollaboratorPresence />` component, so regular users never see each other.
 *
 * Presence is fully ephemeral (no DB writes) — when a tab closes or the network
 * drops, Supabase Realtime removes the user automatically.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { authorizeRealtimeSubscription } from "@/lib/realtimeGuard";

export interface ActiveCollaborator {
  user_id: string;
  name: string;
  email: string | null;
  avatar_url: string | null;
  designation: string | null;
  route: string;
  online_at: string;
}

const PRESENCE_CHANNEL = "app-collaborator-presence";

export function usePresenceTracking(enabled: boolean) {
  const { user, profile } = useAuth();
  const [collaborators, setCollaborators] = useState<ActiveCollaborator[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const buildSelf = useCallback((): ActiveCollaborator | null => {
    if (!user) return null;
    const name =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
      profile?.email ||
      user.email ||
      "User";
    return {
      user_id: user.id,
      name,
      email: profile?.email ?? user.email ?? null,
      avatar_url: profile?.avatar_url ?? null,
      designation: (profile?.designation as string) ?? null,
      route: window.location.pathname + window.location.hash,
      online_at: new Date().toISOString(),
    };
  }, [user, profile]);

  useEffect(() => {
    if (!enabled || !user) {
      setCollaborators([]);
      return;
    }

    const initialSelf = buildSelf();
    if (initialSelf) setCollaborators([initialSelf]);

    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    authorizeRealtimeSubscription(PRESENCE_CHANNEL).then(({ allowed, reason }) => {
      if (cancelled || !allowed) {
        if (!allowed) console.warn(`[presence] subscription denied: ${reason}`);
        return;
      }
      const ch = supabase.channel(PRESENCE_CHANNEL, {
        config: { presence: { key: user.id }, private: true },
      });
      channel = ch;
      channelRef.current = ch;

      const syncState = () => {
        const state = ch.presenceState<ActiveCollaborator>();
        const flat: ActiveCollaborator[] = [];
        const seen = new Set<string>();
        Object.values(state).forEach((entries) => {
          // Most recent entry per user wins (a user may have multiple tabs).
          const latest = (entries as ActiveCollaborator[])
            .slice()
            .sort((a, b) => (a.online_at < b.online_at ? 1 : -1))[0];
          if (latest && !seen.has(latest.user_id)) {
            seen.add(latest.user_id);
            flat.push(latest);
          }
        });
        const self = buildSelf();
        if (self && !seen.has(self.user_id)) flat.push(self);
        flat.sort((a, b) => a.name.localeCompare(b.name));
        setCollaborators(flat);
      };

      ch
        .on("presence", { event: "sync" }, syncState)
        .on("presence", { event: "join" }, syncState)
        .on("presence", { event: "leave" }, syncState)
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            const self = buildSelf();
            if (self) void ch.track(self).catch((err) => console.warn("[presence] track failed", err));
          }
        });
    });

    return () => {
      cancelled = true;
      if (channel) {
        channel.untrack();
        supabase.removeChannel(channel);
      }
      channelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user?.id]);

  // Keep our own presence payload fresh (route changes / profile updates).
  useEffect(() => {
    if (!enabled || !channelRef.current) return;
    const self = buildSelf();
    if (self) {
      setCollaborators((prev) => {
        const rest = prev.filter((c) => c.user_id !== self.user_id);
        return [...rest, self].sort((a, b) => a.name.localeCompare(b.name));
      });
      void channelRef.current.track(self).catch((err) => console.warn("[presence] refresh failed", err));
    }
  }, [enabled, buildSelf]);

  return { collaborators };
}
