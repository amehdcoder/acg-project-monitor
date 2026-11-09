# Offline authentication

- Recover only the active persisted account; absent a session require the saved password, lock locally before remote sign-out, and reject stale auth completions — why: shared devices must never silently open the latest cached identity.