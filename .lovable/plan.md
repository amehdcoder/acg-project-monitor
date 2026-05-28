This is a large 4-part build. Confirming scope before I start so nothing gets cut.

## 1. GPS write-back as overrides (Geo Microplanning)

Add **override columns** alongside the original GRID3 values — never overwrite the source.

- Migration on `microplan_entries`:
  - `settlement_lat_override`, `settlement_lng_override`
  - `community_lat_override`, `community_lng_override`
  - `flhf_lat_override`, `flhf_lng_override`
  - `gps_overridden_by uuid`, `gps_overridden_at timestamptz`
- In Map / Coverage / Dashboard, **effective coordinate** = override ?? grid3 original. Add a small "modified" pin badge when an override exists, with a "Revert to GRID3" action (sets override back to NULL).
- Map "Save GPS" action writes override columns only.

## 2. Mesh Sync — fully functional transports

Default order, auto-chosen by a transport manager:

```text
1. WiFi-Direct + WebRTC LAN  (default for >5KB, peer-to-peer)
2. Server relay              (when ConnectivityManager sees any internet)
3. BLE beacon sync           (only for records < 5KB, header/heartbeat/tiny submissions)
```

- New `src/lib/meshSync/transportManager.ts` with `pickTransport(payloadBytes, network)`.
- WebRTC LAN: signaling over a new `mesh_signaling` Supabase table (offer/answer/ICE rows, auto-expire 60s) — works while devices share a LAN even without internet, by also broadcasting a local SDP via mDNS-style hash.
- Server relay: reuse existing `mesh_sync_transfers` table for chunked uploads; chunks ≤ 256KB.
- BLE: Web Bluetooth advertise/scan of a 20-byte beacon (form_id hash + record_id + 1-byte status). On detect, request full record over WebRTC if peer is in range.
- Rebuild `MeshSyncManagerView.tsx`:
  - Live transport status (which is active, peers seen, queue size)
  - Per-record progress
  - "Force transport" override
  - Retry / pause / resume queue

## 3. Owner-defined page & form access with timeframe

Owner only (amehjoey1@gmail.com) — extend the existing `admin_page_access` model to **all users** (not just super admins) and add **time bounds**.

- Migration:
  - `user_page_access` table: `user_id`, `page_id`, `granted_by`, `starts_at`, `expires_at` (nullable = no expiry), `created_at`. Unique on `(user_id, page_id)`.
  - Add `starts_at`, `expires_at` to `user_form_assignments` and `user_project_assignments`.
  - SECURITY DEFINER `public.has_page_access(_uid, _page)` that checks owner / super_admin grant / user grant within `now()` window.
  - `pg_cron` nightly job to auto-revoke expired grants + emit notification.
- New UI in `UsersView`: per-user "Access Manager" dialog (pages, forms, projects, each with optional start/expiry datetime). Visible only to owner.
- `usePageAccess` extended to also honor `user_page_access` for non-admins, with expiry checked client-side and a realtime channel for live revoke (already present pattern).
- Sidebar/NavLink hides items the user can't see.

## 4. Offline-first auto-login (Kobo/ODK style)

Goal: opening the app offline shows the full UI logged in as the last user, but **sync to the server requires a fresh sign-in** when connectivity returns.

- `src/lib/auth/offlineSession.ts`:
  - On successful login, persist a sanitized snapshot (`user_id`, `email`, `profile`, `roles`, `page_grants`, `assigned_forms`, `last_login_at`) to IndexedDB (encrypted with WebCrypto, key derived from a device secret).
  - On app boot, if `navigator.onLine === false` **and** Supabase session is missing/expired, hydrate `AuthProvider` from the snapshot, set `isOfflineMode = true`.
- `AuthProvider` exposes `isOfflineMode`. ProtectedRoute lets the user through in offline mode.
- All write paths queue to the existing offline form queue. The sync worker **refuses to push** while `isOfflineMode === true`; on `online` event it forces a `supabase.auth.refreshSession()` — if it fails, shows a non-blocking banner: "Sign in to sync your X pending submissions" with a sign-in button.
- After successful re-auth, queue is drained.
- Snapshot TTL: 30 days (configurable) — after that, offline boot falls back to sign-in screen.

## 5. Quiet fix
Runtime error `_leaflet_pos undefined` — guard marker/layer operations in `MapVisualization` against null `_map`/`_icon` refs that occur when a marker is removed mid-render.

---

### Order of execution

1. Run migrations (#1, #3 schema, #2 signaling table).
2. Build override read/write in Microplanning.
3. Build transport manager + new MeshSync UI.
4. Build access manager UI + hook extensions.
5. Build offline session + auth hydration + sync gate.
6. Patch Leaflet guard.

Approve and I'll execute end-to-end.