# Offline Test Checklist — Amehnities (KoboCollect-style field readiness)

Purpose: confirm the app can be **loaded, logged in, and used for data
collection with the internet fully disabled**, and that queued work syncs
correctly and **exactly once** when connectivity returns.

Automated coverage for these flows lives in:
- `src/lib/offlineSmoke.test.ts` — offline draft → ready → sent lifecycle + flaky reconnect.
- `src/lib/savedFormAutoSync.test.ts` — exactly-once sync stress test.
- `src/lib/savedFormMerge.test.ts` — multi-device conflict detection & deterministic merge.

Run with: `bunx vitest run src/lib/offlineSmoke.test.ts src/lib/savedFormAutoSync.test.ts src/lib/savedFormMerge.test.ts`

---

## How to simulate offline
- Chrome DevTools → Network tab → set throttling to **Offline**, OR
- Toggle the device's Wi-Fi/mobile data off, OR
- DevTools → Application → Service Workers → check **Offline**.

Always do a first **online** load once so the PWA shell, forms, and cascade
lists are cached before going offline.

---

## 1. App load (offline)
- [ ] Kill the network, hard-reload the app URL.
- [ ] The app shell renders (no browser "no internet" page).
- [ ] No infinite loading spinner; the login screen or dashboard appears.

## 2. Login (offline)
- [ ] Enter valid credentials used at least once while online.
- [ ] Login completes from the offline auth cache (no long hang).
- [ ] `login_duration` metric recorded (see `window.__amehnitiesMetrics`).

## 3. Project / form loading (offline)
- [ ] Forms page lists the user's assigned projects and forms.
- [ ] Only forms matching the user's access grants appear.
- [ ] Downloaded/cached forms open and render fully.

## 4. GPS capture (offline)
- [ ] Open a form with a GPS field.
- [ ] Location seeds instantly from the warm fix (no indefinite wait).
- [ ] Manual tap-to-place fallback works if no satellite fix.

## 5. Draft saving (offline)
- [ ] Fill part of a form, choose **Save as draft**.
- [ ] Draft appears in the **Draft** tab and survives a reload (offline).
- [ ] Re-open the draft; previously entered answers are intact and editable.

## 6. Finalize → Ready to send (offline)
- [ ] Finalize a draft; it moves to the **Ready to send** tab.
- [ ] Item shows respondent name and timestamp.
- [ ] Nothing is transmitted while offline (no network requests).

## 7. Auto-sync on reconnect
- [ ] Re-enable the network.
- [ ] Ready-to-send items move to **Sent** automatically.
- [ ] Each item appears in **Sent** with name + sent timestamp.
- [ ] `saved_form_sync_batch` metric recorded.

## 8. Exactly-once guarantee (flaky network)
- [ ] Toggle network on/off rapidly while a batch is syncing.
- [ ] Every item ends in **Sent** exactly once — no duplicates on the server.
- [ ] Re-check the dashboard submission count matches items sent.

## 9. Multi-device conflict (drafts/finalized)
- [ ] Edit the same record on two devices while both are offline.
- [ ] Bring both online.
- [ ] Merge is deterministic: non-conflicting answers from both devices survive;
      conflicting fields resolve to the newer edit; a finalized/sent copy is
      never demoted back to draft.
- [ ] A conflict notice is available describing which fields were merged.

---

## Sign-off
| Area | Tester | Date | Pass/Fail | Notes |
|------|--------|------|-----------|-------|
| Load offline | | | | |
| Login offline | | | | |
| Forms load offline | | | | |
| GPS offline | | | | |
| Draft save | | | | |
| Ready → Sent sync | | | | |
| Exactly-once | | | | |
| Multi-device merge | | | | |
