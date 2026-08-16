/**
 * Collaborator Presence — Google-Workspace-style live presence.
 *
 * Presence is PROJECT-SCOPED for privacy: every authenticated user silently
 * "tracks" themselves on the presence channel of each project they are
 * assigned to (or on a dedicated `presence:project:none` channel when they
 * have no active assignment). A user can therefore only ever observe the
 * collaborators of their own projects — admins subscribe to every project
 * channel and keep the full organisation-wide roster.
 *
 * The list of active collaborators is only ever *rendered* for the Owner /
 * Super Admins via `<CollaboratorPresence />`.
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

const UNASSIGNED_TOPIC = "presence:project:none";
const topicFor = (projectId: string) => `presence:project:${projectId}`;
/** Safety cap so a user assigned to everything never opens dozens of sockets. */
const MAX_CHANNELS = 24;

export function usePresenceTracking(enabled: boolean) {
  const { user, profile, isOwner, isSuperAdmin } = useAuth();
  const isAdminViewer = !!(isOwner || isSuperAdmin);
  const [collaborators, setCollaborators] = useState<ActiveCollaborator[]>([]);
  const channelsRef = useRef<ReturnType<typeof supabase.channel>[]>([]);
  const rosterRef = useRef<Map<string, Map<string, ActiveCollaborator>>>(new Map());

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
      rosterRef.current.clear();
      return;
    }

    const initialSelf = buildSelf();
    if (initialSelf) setCollaborators([initialSelf]);

    let cancelled = false;
    rosterRef.current = new Map();

    const flush = () => {
      const merged = new Map<string, ActiveCollaborator>();
      for (const perTopic of rosterRef.current.values()) {
        for (const [uid, c] of perTopic) {
          const prev = merged.get(uid);
          if (!prev || prev.online_at < c.online_at) merged.set(uid, c);
        }
      }
      const self = buildSelf();
      if (self && !merged.has(self.user_id)) merged.set(self.user_id, self);
      setCollaborators(Array.from(merged.values()).sort((a, b) => a.name.localeCompare(b.name)));
    };

    /** Topics this user is authorised to observe. */
    const resolveTopics = async (): Promise<{ subscribe: string[]; track: string[] }> => {
      const nowIso = new Date().toISOString();
      const { data: mine } = await supabase
        .from("user_project_assignments")
        .select("project_id, starts_at, expires_at")
        .eq("user_id", user.id);

      const myProjects = (mine ?? [])
        .filter((a) => (!a.starts_at || a.starts_at <= nowIso) && (!a.expires_at || a.expires_at > nowIso))
        .map((a) => a.project_id)
        .filter(Boolean) as string[];

      const track = myProjects.length ? myProjects.map(topicFor) : [UNASSIGNED_TOPIC];

      if (!isAdminViewer) return { subscribe: track.slice(0, MAX_CHANNELS), track };

      // Admins keep the organisation-wide roster: every project + unassigned.
      const { data: projects } = await supabase.from("projects").select("id");
      const all = new Set<string>([UNASSIGNED_TOPIC, ...track]);
      for (const p of projects ?? []) if (p?.id) all.add(topicFor(p.id as string));
      return { subscribe: Array.from(all).slice(0, MAX_CHANNELS), track };
    };

    void (async () => {
      let topics: { subscribe: string[]; track: string[] };
      try {
        topics = await resolveTopics();
      } catch (e) {
        console.warn("[presence] could not resolve presence scope", e);
        topics = { subscribe: [UNASSIGNED_TOPIC], track: [UNASSIGNED_TOPIC] };
      }
      if (cancelled) return;

      for (const topic of topics.subscribe) {
        const { allowed, reason } = await authorizeRealtimeSubscription(topic);
        if (cancelled) return;
        if (!allowed) {
          console.warn(`[presence] subscription denied for ${topic}: ${reason}`);
          continue;
        }

        const ch = supabase.channel(topic, {
          config: { presence: { key: user.id }, private: true },
        });
        channelsRef.current.push(ch);

        const syncState = () => {
          const state = ch.presenceState<ActiveCollaborator>();
          const perTopic = new Map<string, ActiveCollaborator>();
          Object.values(state).forEach((entries) => {
            const latest = (entries as ActiveCollaborator[])
              .slice()
              .sort((a, b) => (a.online_at < b.online_at ? 1 : -1))[0];
            if (latest?.user_id) perTopic.set(latest.user_id, latest);
          });
          rosterRef.current.set(topic, perTopic);
          flush();
        };

        ch
          .on("presence", { event: "sync" }, syncState)
          .on("presence", { event: "join" }, syncState)
          .on("presence", { event: "leave" }, syncState)
          .subscribe(async (status) => {
            if (status === "SUBSCRIBED" && topics.track.includes(topic)) {
              const self = buildSelf();
              if (self) void ch.track(self).catch((err) => console.warn("[presence] track failed", err));
            }
          });
      }
    })();

    return () => {
      cancelled = true;
      for (const ch of channelsRef.current) {
        ch.untrack();
        supabase.removeChannel(ch);
      }
      channelsRef.current = [];
      rosterRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, user?.id, isAdminViewer]);

  // Keep our own presence payload fresh (route changes / profile updates).
  useEffect(() => {
    if (!enabled || channelsRef.current.length === 0) return;
    const self = buildSelf();
    if (!self) return;
    setCollaborators((prev) => {
      const rest = prev.filter((c) => c.user_id !== self.user_id);
      return [...rest, self].sort((a, b) => a.name.localeCompare(b.name));
    });
    for (const ch of channelsRef.current) {
      if (ch.state !== "joined") continue;
      void ch.track(self).catch(() => { /* transient */ });
    }
  }, [enabled, buildSelf]);

  return { collaborators };
}

