# Offline authentication

- Recover only the active persisted account; absent a session require the saved password, lock locally before remote sign-out, and reject stale auth completions — why: shared devices must never silently open the latest cached identity.
- Coverage and Reconciliation realtime channels use mount-unique names — why: overlapping tab mounts must not register callbacks on an already subscribed channel.- Signed-in screens never query as a signed-out visitor: `src/lib/auth/liveSessionGuard.ts` (first import in main.tsx) refuses anon-token data requests while a user is shown; useAuth restores the live session then re-reads via `LIVE_SESSION_RESTORED`/focus — why: lost sessions made RLS return empty lists and hid admin controls.
