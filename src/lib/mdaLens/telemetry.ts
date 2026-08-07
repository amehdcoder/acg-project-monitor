/**
 * MDA Lens access telemetry.
 *
 * Records how the lens grant resolved on every navigation so that access
 * "flicker" (a page rendering, then flipping to Access Restricted) and
 * fail-closed behaviour are detectable in production instead of only being
 * reported anecdotally by users.
 *
 * Events are buffered and flushed in small batches so a navigation burst never
 * turns into a request storm. Failures are swallowed — telemetry must never
 * affect the user's access.
 */
import { supabase } from "@/integrations/supabase/client";

export type LensEventType =
  | "lens_resolved"          // grant read successfully (cached or verified)
  | "lens_fetch_failed"      // network/RLS/timeout failure; last grant retained
  | "lens_flicker"           // access was granted, then withdrawn in-session
  | "lens_fail_closed"       // user ended up restricted with no verified grant
  | "access_denied"          // route guard bounced a requested tab
  | "export_blocked"         // an export was refused by scope/can_export
  | "cache_invalidated";     // grant cache dropped (revocation/refresh)

export type LensGrantState = "loading" | "cached" | "verified" | "failed" | "none";

export interface LensEvent {
  event_type: LensEventType;
  page?: string | null;
  tab?: string | null;
  access_granted?: boolean | null;
  grant_state?: LensGrantState | null;
  latency_ms?: number | null;
  detail?: Record<string, unknown>;
}

interface QueuedEvent extends LensEvent {
  at: number;
}

const MAX_TRAIL = 50;
const FLUSH_DELAY = 1500;

const queue: QueuedEvent[] = [];
/** In-memory trail, also exposed on `window` for E2E assertions. */
const trail: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function pushTrail(event: QueuedEvent) {
  trail.push(event);
  if (trail.length > MAX_TRAIL) trail.shift();
  if (typeof window !== "undefined") {
    (window as unknown as { __MDA_LENS_TELEMETRY__?: QueuedEvent[] }).__MDA_LENS_TELEMETRY__ = trail;
  }
}

async function flush() {
  timer = null;
  if (!queue.length) return;
  const batch = queue.splice(0, queue.length);
  try {
    const { data } = await supabase.auth.getUser();
    const userId = data.user?.id;
    if (!userId) return; // anonymous/offline: keep the local trail only
    await supabase.from("mda_lens_access_events").insert(
      batch.map((e) => ({
        user_id: userId,
        event_type: e.event_type,
        page: e.page ?? null,
        tab: e.tab ?? null,
        access_granted: e.access_granted ?? null,
        grant_state: e.grant_state ?? null,
        latency_ms: e.latency_ms ?? null,
        detail: { ...(e.detail || {}), client_at: new Date(e.at).toISOString() },
      })),
    );
  } catch {
    /* telemetry is best-effort */
  }
}

/** Record a lens access event (buffered; safe to call on every render path). */
export function logLensEvent(event: LensEvent) {
  const queued: QueuedEvent = { ...event, at: Date.now() };
  pushTrail(queued);
  // Surface in the console too so support can read it from a user's session.
  const level = event.event_type === "lens_resolved" ? "debug" : "warn";
  // eslint-disable-next-line no-console
  console[level]("[MDA Lens]", event.event_type, {
    page: event.page,
    tab: event.tab,
    granted: event.access_granted,
    state: event.grant_state,
    latency_ms: event.latency_ms,
    ...event.detail,
  });
  queue.push(queued);
  if (!timer) timer = setTimeout(() => void flush(), FLUSH_DELAY);
}

/** Local, in-session event trail (newest last). Used by diagnostics and tests. */
export const lensTelemetryTrail = (): QueuedEvent[] => [...trail];

/** Force any buffered events out (e.g. before a hard navigation). */
export const flushLensTelemetry = () => flush();

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => void flush());
}
