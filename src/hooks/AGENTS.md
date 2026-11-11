# Offline authentication

- Recover only the active persisted account; absent a session require the saved password, lock locally before remote sign-out, and reject stale auth completions — why: shared devices must never silently open the latest cached identity.
- Coverage and Reconciliation realtime channels use mount-unique names — why: overlapping tab mounts must not register callbacks on an already subscribed channel.