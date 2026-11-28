# Offline authentication

- Forms definition writes go through `downloadSelectedUserForms` only after explicit selection, with fresh authorization and account-guarded atomic writes; boot/auth/list/reconnect never download definitions, while submission workers remain independent — why: user-selected versions and queued answers must survive offline updates without disabling delivery.

- Heartbeat IP lookup uses a bounded public-key request to the exact public `get-client-ip` endpoint; private writes still require a live session — why: optional connection metadata must not trigger session errors or bypass record protection.

- Recover only the active persisted account; absent a session require the saved password, lock locally before remote sign-out, and reject stale auth completions — why: shared devices must never silently open the latest cached identity.
- Coverage and Reconciliation realtime channels use mount-unique names — why: overlapping tab mounts must not register callbacks on an already subscribed channel.- Signed-in screens never query as a signed-out visitor: `src/lib/auth/liveSessionGuard.ts` (first import in main.tsx) refuses anon-token data requests while a user is shown; useAuth restores the live session then re-reads via `LIVE_SESSION_RESTORED`/focus — why: lost sessions made RLS return empty lists and hid admin controls.
