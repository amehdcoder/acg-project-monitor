import { supabase } from "@/integrations/supabase/client";
import { LIVE_SESSION_RESTORED } from "@/lib/auth/liveSessionGuard";
import { warmCacheUserFormsDetailed } from "./offlineFormCache";

// One app-wide worker keeps each signed-in account's offline form library
// complete and current. Realtime is the fast path; focus/reconnect/session
// recovery and a quiet one-minute poll cover missed realtime notifications.
const POLL_MS = 60_000;
const REALTIME_DEBOUNCE_MS = 350;

let started = false;
let activeUserId: string | null = null;
let channel: ReturnType<typeof supabase.channel> | null = null;
let pollTimer: number | null = null;
let realtimeTimer: number | null = null;
let running = false;
let rerunRequested = false;

const online = () => typeof navigator === "undefined" || navigator.onLine;

async function runForActiveUser() {
  if (!activeUserId || !online()) return;
  if (running) {
    rerunRequested = true;
    return;
  }
  running = true;
  try {
    do {
      rerunRequested = false;
      const userId = activeUserId;
      await warmCacheUserFormsDetailed({ userId });
      // A late completion from an old account must never become the active one;
      // if a new account signed in meanwhile, its requested refresh still runs.
      if (activeUserId !== userId) rerunRequested = !!activeUserId;
    } while (rerunRequested && activeUserId && online());
  } finally {
    running = false;
  }
}

export function requestOfflineFormSync() {
  if (!activeUserId || !online()) return;
  void runForActiveUser();
}

function stopChannel() {
  if (realtimeTimer !== null) {
    window.clearTimeout(realtimeTimer);
    realtimeTimer = null;
  }
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
}

function startChannel(userId: string) {
  stopChannel();
  channel = supabase
    .channel(`offline-form-definitions:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "forms" },
      () => {
        if (realtimeTimer !== null) window.clearTimeout(realtimeTimer);
        realtimeTimer = window.setTimeout(() => {
          realtimeTimer = null;
          requestOfflineFormSync();
        }, REALTIME_DEBOUNCE_MS);
      },
    )
    .subscribe();
}

function setActiveUser(userId: string | null) {
  if (activeUserId === userId) {
    if (userId) requestOfflineFormSync();
    return;
  }
  activeUserId = userId;
  rerunRequested = false;
  stopChannel();
  if (userId) {
    startChannel(userId);
    requestOfflineFormSync();
  }
}

export function initOfflineFormAutoSync() {
  if (started || typeof window === "undefined") return;
  started = true;

  // Never await backend work inside Supabase's auth callback; deferring avoids
  // deadlocking token refresh and sign-in while the form download starts at once.
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    const userId = session?.user?.id || null;
    window.setTimeout(() => {
      if (event === "SIGNED_OUT") setActiveUser(null);
      else if (userId) setActiveUser(userId);
      else if (event === "INITIAL_SESSION") setActiveUser(null);
    }, 0);
  });
  void data;

  window.addEventListener("online", requestOfflineFormSync);
  window.addEventListener("focus", requestOfflineFormSync);
  window.addEventListener("project-access-updated", requestOfflineFormSync);
  window.addEventListener(LIVE_SESSION_RESTORED, requestOfflineFormSync);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") requestOfflineFormSync();
  });
  pollTimer = window.setInterval(requestOfflineFormSync, POLL_MS);
  void pollTimer;
}
