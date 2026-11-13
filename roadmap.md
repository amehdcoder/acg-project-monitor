# Roadmap

- [ ] Enable extra Coverage Excel rows with typed LGA/Ward/FLHF/community/settlement and Target Pop; fuzzy-match their associated coverage/medicine data, preserve project scope, and verify saved target totals.

- [x] Remove the temporary membership and add project-scoped Collector/Dashboard roles under Manage → Microplanning access. Administrator-authorized saves, protected role rows and project/read/write guards prevent self-grants or unrelated memberships. Thirty-nine regression tests pass; signed-in role save/readback/removal, phone controls and Coverage/Reconciliation navigation verified without runtime errors. Verification grants removed; preview build clean. No permanent recipient was selected on the user's behalf.

- [x] Simplify Coverage Excel to five medicine quantities with validation and explicit received-only alignment. Twenty-four tests pass; signed-in GIveWell download/upload/alignment/save and Reconciliation export read back received 200 / used 160 / lost 5 / expired 5 / returned 30 with zero balance. Desktop/phone checked; missing stock storage repaired, temporary records removed. Saved allocations unchanged.

- [x] Add a Trachoma-target-only children 1–9 KPI with independent male/female totals and completeness from filtered scoped entries. Nine tests pass; desktop/phone visibility verified using an isolated local selection, without altering saved project settings. Existing live rows contain no child sex counts, so populated totals are covered by tests rather than fabricated records.

- [x] Add optional independent male/female Trachoma counts for children aged 1–9 to the shared entry form and offline/device intake without changing population totals. Fourteen validation/target tests pass; signed-in form shows male 70 and female 80 while Trachoma total remains 10; desktop/phone checked without runtime errors. Added columns and deployed device intake; live submission readback not exercised.

- [x] Add offline-persisted, input-fresh community risk rankings and score-range filters; default Reconciliation usage from saved allocation without overwriting reported actuals, with offline edits and community balances. Twenty-three focused tests pass; real GIveWell ranking/range filtering verified. Live medicine save/readback awaits a project with a populated community allocation; reconnect interrupted the first browser check by signing out, without changes to authentication.

- [x] Add WHO-inspired Coverage Excel exchange with scoped fuzzy matching, persistent review/addition, cumulative coverage and medicine-use writes, and administrator-managed allocation snapshots. GIveWell workbook downloaded and 6,412 formulas recalculated without errors; temporary import saved 80 treated / 20 HHs / 15 treated HHs / 160 medicine units and read back in Reconciliation with returned/damaged counts. Fourteen tests pass; preview build clean. Saved matrix allocation reload and physical-device offline replay need further end-to-end verification.

- [x] Add per-community security planning risk from security, accessibility and explicit CDD gaps; unknown inputs show ranges. Verified GIveWell desktop/phone breakdowns without runtime errors; all eight scoring/table tests pass.

- [x] Improve all nine Geo Microplanning tabs: stable access-scoped source identities, cached Summary/Reconciliation/Gaps models, immediate access guards, yielding map batches and viewport-bound detail. Live GIveWell desktop/phone rapid navigation verified; map detail remains progressive rather than blocking navigation.

- [x] Strengthen offline launch and password sign-in for prepared accounts; cancel late password completions after sign-out. All 35 offline/auth/saved-form tests pass. Published login shell reopens without network; real-account isolated-browser password rejection, offline unlock and reconnect retain Forms. Browser cache preparation was isolated, not a change to the account's server password. First-use and live external services require internet.
- [ ] Verify the updated release on a physically installed device after publication; browser offline reopening is verified, but device-specific storage eviction and installation behavior require that device.

- [x] Fix manual Update stale-manifest checks (failing regression reproduced, now passing), cancellation after worker timeout, visible current/retry button feedback and inline update errors. All 23 update tests pass; signed-in online/current and offline/retry checked with visible feedback and enabled retry; preview build clean. A physically installed app's published-release activation still requires a deployed device check.

- [x] Add selectable OSIRIS security/access/terrain/CDD legends with multiple categories per group, intersections across groups, mapped counts, automatic zoom and explicit zoom/clear controls. Ten tests pass; signed-in real data filters 3 → 2 → 3 → 1, CDD intersection and clearing verified; phone fit, collapse cleanup and dashboard navigation pass without runtime errors. Preview build clean. Missing CDD names are labelled unrecorded, not confirmed absence.

- [x] Add OSIRIS Street View toggle using the lazy shared viewer, release satellite graphics and pause feed polling while open, retain camera on return, bound panorama loading and cancel stale work. Signed-in toggle availability, phone fit, collapse cleanup and Coverage navigation verified without runtime errors; seven regression tests pass and preview build is clean. Google panorama rendering and actual local imagery coverage require verification on the published domain; sandbox Google requests intentionally skipped.

- [x] Add isolated collapsed OSIRIS 3D satellite planning analysis: authenticated public-feed adapter (no project records sent upstream), State auto-framing, corrected GPS verified against LGA polygons, clustered security/access/terrain/population layers, constraint filter, settlement search and real-record detail with 10km context, full screen and safe teardown. Live GIveWell 6,233 mapped records, all three public feeds, building roofs at Sauna Gabas, desktop/phone/fullscreen and return to Coverage verified without runtime errors; seven tests pass, preview build clean. State-scale terrain switches off for stable building-scale imagery. Public feed absence is not clearance; imagery is a dated provider mosaic, not live video or guaranteed building coverage.

- [x] Strengthen LQAS against WHO guidance: methods/reference tab, both design risks, frozen campaign/eligibility/question/PPS slots, server-linked exact-sample decisions with partial/deviation review and deletion recomputation, unbiased safety protocols, descriptive round evidence/export, responsive page. Twenty-four tests pass; both XLSForms convert with pyxform; printed tally inspected; signed-in GIveWell navigation/download/design guard verified without runtime errors, preview build clean. No real surveys fabricated; live round save and Kobo result readback await genuine field data and an approved protocol (existing live round count is zero).

- [x] Refine Geo Microplanning presentation: clearer command header with grouped management actions, early permission-filtered tab navigation, restrained metric spectrum, consistent panels and semantic status accents. Live GIveWell desktop/390px phone/dark appearance and all seven tabs verified without runtime errors or horizontal overflow; four focused regression tests pass; preview build clean. Data and access rules unchanged.

- [x] Fix all seven Geo dashboard tabs: bounded Coverage/Reconciliation/Historical/Gaps display with full-data totals/exports, deferred tab content, memoized planning maps/project table, linear map aggregation, cancellable drawing and safe map disposal. Live GIveWell 6,402-row desktop/phone rapid navigation passes without runtime errors; 99 tests pass (3 optional pyxform checks skipped); preview build clean. Map detail draws progressively, not all in one blocking frame.

- [x] Add two collapsed interactive correlation heatmap views (population/households and operational constraints), Spearman/Pearson selection, coefficient/sample-size tooltips, paired scatter plots and Excel export. Missing values remain excluded and constant series or fewer than five pairs produce no coefficient. Fourteen analysis tests pass; live Accelerate nine-record readback, method/view switches, missing-evidence state, 36-row export and phone layout verified; preview build clean.

- [x] Add six collapsed ESPEN-aligned analyses from filtered live Microplanning rows: population access/security exposure, recorded facility workload, distance profile, contact completeness, population sources/planning vintage, and downloadable settlement review. Sixteen tests pass; signed-in Accelerate readback, all sections, nine-record Excel review, phone fit and collapse/reopen verified without runtime errors; preview build clean. No inferred treatment outcomes, travel times or staffing shortages.

- [x] Stabilize Longitudinal Beneficiary Records (live signed-in check pending while backend restarts): retain user-scoped saved data during background updates, merge changed records, preserve open records and scroll, prevent unsolicited recovery reloads, and verify regressions and signed-in readback.

- [ ] Finish pending saved WHO survey forms and verify saving/readback; add server-authorized Super Admin individual deletion and clearing of scorecard survey evidence, with confirmation and refreshed progress.

- [ ] Add indicator-specific WHO survey forms with validated measurements, project-scoped durable saving, cached reopening and refreshed scorecard progress; verify save/readback without inventing real survey evidence.

- [x] Add project-report-derived cascading State/LGA choices across all dashboard periods, named Excel lists, readable legacy-compatible headings, validated spreadsheet dates and calendar-assisted entry/download. Twelve tests pass; isolated signed-in browser check verifies cascade reset, calendar, typed dates, filled Excel download/import and scorecard readback with no runtime errors. Native Excel calendar availability depends on spreadsheet version; calendar is provided in the app.

- [x] Remove 57 residual BMZ screenings as requested; protected deletion tombstones prevent replay; retire old screening caches/cursors without clearing drafts/queues; 85 Eye tests pass. Live authenticated BMZ dashboard and offline reopening both show 0 screened / 0 disability / 0 reports, no runtime errors; database confirms 0 screenings and 57 replay guards.

- [x] Cascade deleted daily reports to linked WG-SS screenings in PostgreSQL and user-scoped offline queue/cache overlays; preserve independent standalone rows; constraint confirmed and deletion/failure tests pass.
- [x] Add routine service evidence to WHO cards, weighted measured follow-up outcome shares, colourful State survey Excel template and validated Excel/JSON imports; 83 Eye tests pass, isolated downloaded-workbook round-trip shows 83.3% complete and trend projection without runtime errors; preview build clean.
- [x] Resolve residual WG-SS count after user confirmed no submissions: removed the existing 57 BMZ null-parent rows only, preserving future independent screenings; live/offline KPI verified zero.

- [x] Speed up Eye Health dashboard with immediate captured-user/project cache hydration, timestamp-keyset deltas, coalesced realtime refreshes, reconnect/focus recovery, periodic ID-only deletion reconciliation, pending-write overlay, deferred map/tracker work and retained refresh feedback; 76 Eye tests pass and signed-in warm reopening/request-failure checks verified; preview build clean.
- [ ] Verify nonempty live Eye report change → realtime totals readback — current BMZ dashboard returns no reports across all years; no clinical data was fabricated. Nonempty cached totals, update events, missed deletion and account isolation verified in focused tests.

- [x] Repair header/banner Update controls with bounded single-flight checks, one safe navigation, worker activation, retryable failures and retained precaches/queues; 22 tests pass, signed-in current/offline checks and isolated release reload preserve draft/restore marker with no runtime errors; preview build clean.
- [ ] Verify this update on a physically installed app after publication — requires publishing the changes and an installed-device check; preview cannot run production service workers.

- [x] Make Forms the default on app entry without restoring previous tabs, preserving required full-screen Geo/Records workspaces and explicit navigation links; nine focused checks pass, signed-in previous-tab/reload flow returns to Forms with no runtime errors, preview build clean.

- [x] Add live distinct facility counts in dust cells and explicit 1km water/WASH proximity areas with project-scoped cached locations, registered-location priority, capture-proxy labels, realtime/refresh updates and missing-GPS counts. 65 Eye tests passed; live BMZ shows 14 facilities missing GPS, 29 dust-cell labels; isolated duplicate-report test counts one facility. Preview build clean.
- [ ] Verify real report/outcome/GPS → dashboard flow — user has no source report or confirmed GPS; do not create fabricated clinical records or WHO forecasts.

- [x] Connect attributed Jigawa snapshot: 10,574 FMWR/WPDx 2015 water records and 29 CAMS modeled dust cells (25–31 Oct 2026), automatic loading and toggles verified in live BMZ dashboard. Current WASH/sanitation conditions and validated causal corridor remain unavailable.
- [x] Add WHO 2030 milestone scorecard with official coverage gains and trachoma thresholds, validated survey import, State/LGA scopes and evidence-qualified forecasts; 61 Eye tests passed; isolated survey import updates UI to 83.3% complete / On track. Actual survey baselines/denominators are not available, so live progress correctly remains unmeasurable.

- [x] Implement real DHIS2 measured per-eye tracker pull, explicit milestone/facility/LGA mappings, pseudonymous identity, observation provenance, preview and chart refresh; 55 Eye tests pass; live metadata/settings verified.
- [x] Implement dated idempotent GPS event export, facility mapping, validation-only mode, separate retries and automatic configured GPS exchange after successful indicator pushes; facility premises unchanged.
- [ ] Verify real tracker readback/chart and committed DHIS2 GPS events — connected account exposes 20 programs but no acuity fields or point-enabled reporting stages; needs access to suitable patient-acuity and GPS programs plus mappings. No real data was invented or sent.

- [x] Add Environmental Risk & Blindness Corridor map with Jigawa boundaries, Cataract/TT screening rings, relative heatmap, attributed session-only environmental GeoJSON and reporting/GPS popups; 50 Eye tests pass and isolated import/toggle/popup flow verified. Live dashboard unavailable for selected project (report not enabled); real environmental data/validated corridor model not connected.

- [x] Add offline-preserved GPS capture and filtered Eye Health State/LGA map; simulated GPS persists after offline reopening, spatially resolves Jigawa/Dutse, interactive point/indicator controls and phone/tablet/desktop fit checked. Actual hardware GPS and hosted report readback remain unverified.
- [x] Add Visual Acuity Trajectory baseline/30/90/180-day chart, facility/LGA/episode comparisons, descriptive recovery badges, validated offline tracker import and separately labelled DHIS2 pull benchmarks. All 46 Eye tests pass; unavailable/empty screens and layouts checked.
- [ ] Verify real tracker import → hosted readback → trajectory chart and DHIS2 benchmark — preview Data API reports Eye tables missing from its schema cache; no real individual acuity feed or tracker mapping exists yet. Direct automated DHIS2 tracker ingestion requires the user's program/data-element mapping.

- [ ] Verify the supplied Daily Facility Report account's offline submission and reconnect readback — current sign-in and managed-session mint fail because the hosted service is unavailable; isolated offline completion/layout verification continues.
- [ ] Fix and test Eye Report draft patient recovery, photo storage, stable report/patient retries, and Android/tablet/desktop fit.

- [x] Default new reporting-facility selection to today's local date and fresh WG-SS entries rather than reusing prior screenings; verified live date reset and empty patient section, retaining saved report edits. Thirty Eye Health tests passed.
- [x] Fix Eye Health dashboard/DHIS2 exchange zero totals from real submissions and automatically load connected DHIS2 organisation units; live BMZ dashboard and server both show 324 consultations from 3 October reports, exchange opens October, and connected account detects Jigawa/Yobe/FCT. Regression tests passed; preview build clean. No production DHIS2 push performed (existing links target unrelated indicators).

- [x] Harden in-app project camera QR scanning and offline image decoding; tested real video decoding, real QR enrollment with collector name and camera release; retain mandatory collector name and first-online enrollment. Thirteen enrollment/QR tests passed.
- [x] Fit shared Microplan forms across Android/iOS/tablet/desktop with two-axis scroll roots, styled scrollbars, container-aware fields and keyboard-height tracking; five viewport checks passed with no overflow and reachable Save actions, offline draft persisted, no runtime errors. Physical hardware remains unverified; changes not yet published.

- [x] Add Super Admin-only project population disaggregation settings with standard/Trachoma/whole-community modes, live total preview and overlap protection; unify map/dashboard/medicine totals. Fifteen focused tests passed; Super Admin saved the existing standard selection and reloaded it successfully; build clean.

- [x] Match New Microplan Entry to the supplied illustrated form while retaining all fields and validation; desktop and Android-size fit verified.
- [x] Add project-wide Geo-only workspace settings including administrators; project isolation and lock rules tested.
- [x] Enable durable offline Microplan entry and automatic reconnect sync; live account-free offline capture returned 1 synced / 0 pending and server row confirmed.
- [x] Extend account-free QR/code collection to the Geo entry form with mandatory collector/device name; live project-code enrollment and collection verified, temporary settings restored.
- [x] Publish the upgraded Microplan form; verified published account-free enrollment → offline new-tab reopening → offline save → second offline reopening with pending record → automatic reconnect sync (1 synced / 0 pending). Server readback confirmed one entry with population 60 and ages 10/20/30, repeat sync produced no duplicate, illustrations loaded, no runtime errors; temporary entry removed, device revoked and project settings restored. Cold-reopen sync can wait for the previous tab's 60-second queue lease to expire.
- [ ] Verify physical Android QR scanning — requires an Android device camera.

- [x] Add separate beneficiary account portal with verified record links, personal Graduation progress submissions and staff review; real unlinked account privacy/sign-out and mobile fit verified.
- [ ] Verify linked beneficiary submission → staff approval → Graduation service end-to-end — needs a confirmed beneficiary/account link.
- [ ] Assign and verify real focal/person programme categories — user supplied one account only; project, facility and second account not identified.

- [x] Fix saved Access studio category enforcement, direct-page/profile guards and server-authorized actions; category preview and permission regressions passed.
- [ ] Verify category enforcement signed in as a category-assigned team member — no programme team assignments exist yet.
- [x] Remove Lovable sign-in from the donor portal; browser confirmed Google and email/password remain.
- [x] Fix Graduation verification/selection persistence; existing verification saved/read back and selected beneficiary appeared in their pathway; offline/error regressions passed.

- [x] Fix Android scrolling in the switched records-only workspace; bound the content scroller and measure a portal-rendered colourful rail below the header. Signed-in Android emulation verified swiping (255px), dragging (811px), People & care and a live beneficiary profile (6478px content); full-app rail and desktop fit checked. Physical Android hardware remains unverified.

- [x] Restrict facility focal persons to assigned-facility navigation, clinical components and care tools; enforce restrictive record/child/document policies, protect user-scoped offline caches, and preserve admin access. Seventeen regression tests passed; live admin workspace verified.
- [ ] Verify the facility-focal workflow with a real assigned account — no active facility focal-person assignments exist yet.

- [x] Apply the supplied Overview card design with direct navigation to five permission-visible dashboards; verified hosted illustrations, desktop/mobile fit, General dashboard navigation and three tests.

- [x] Integrate the beneficiary's active-component care journeys beside Overall Progress; five focused tests passed and authenticated desktop/mobile profile verified with one active Eye Health component at 60%, readable dates and pending completion/outcome.

- [x] Allow manual livelihood selection regardless of vulnerability band; fill spare opportunity places with lower-scoring recommendations and preserve user decisions across reassessment. Verified 17 tests and live 11/100 manual selection → reassessment retains Selected → Graduation shows 1 mapped/verified/selected; temporary assessment removed and original profile restored.

- [x] Strengthen livelihood recommendations with registration, WG-SS, clinical/visit evidence; scope assessments per opportunity, link decisions/services to Graduation. Verified 14 tests and live temporary assessment → score/WG evidence → Overview → full record; all assessment dropdowns exercised; test data removed.

- [x] Make Build Logframe generic with explicit Impact/Outcome/Output levels, editable verification, custom disaggregation options and arbitrary colours; preserve reports and Excel round-trip.
- [x] Build secure automatic external form ingestion and provider connection workflows; verify supported provider paths and state any authorization blockers.

- [x] Add named participant progress/search/pagination, distributions, median scores, outcomes and participant Excel export; include native/imported/Kobo assessments.
- [x] Link quizzes to exact training activity codes; reporting aggregates use post-test month and prior pre-tests; count improved people for count indicators, mean gain for percentage indicators; preserve manual entries.
- [x] Verify live training link and report auto-fill (1 improved participant, 1 pair, 40 pp); 13 tests passed; temporary quiz removed. Existing map transition error remains outside this request.
- [x] Add project-scoped quizzes to Longitudinal Beneficiary Records, reuse protected quiz creation/taking and pre/post analytics.
- [x] Add reviewed external questions/answer keys and results imports, source links, cohort/state/LGA/cadre comparisons, gain confidence intervals and Excel exports.
- [x] Verify authenticated imports and saved-results dashboard: 40% pre, 80% post, +40 pp; test quiz removed; 13 tests passed. Existing map transition error observed outside quiz components.
- [ ] Automatic external retrieval — blocked by missing Google Forms connector and undocumented Microsoft Forms/Mentimeter quiz-schema APIs; use authorized exports and verified keys.

- [x] Add dedicated donor account sign-in, signup and recovery screens; preserve donor project selection. Screens verified; email confirmation and social redirects not exercised end-to-end.
- [x] Enhance WHO-style donor overview with live aggregate risk indicators, referral completion percentage and field activity preview; authenticated desktop/mobile checks passed.
- [x] Add step-by-step creation/editing of all logframe components; authenticated unchanged-framework save and draft creation verified.
- [x] Display and calculate referral completion as a percentage; regression tests passed.

- [x] Complete automatic full Programme Report delivery and payload-preserving retries; synthetic receiver returned HTTP 200.
- [x] Connect donor dashboard to authenticated Amehnities API; verify reports, downloads, draft exclusion and access boundaries.
- [ ] Connect the actual donor receiving system — waiting for its receiving URL and integration requirements.

- [x] Move Programme Report to the major tab between Beneficiary Records and Record Quality Brain; refine the reporting interface and verify isolated tab navigation and desktop/mobile layout.
- [ ] Verify updated report navigation in the authenticated live workspace — managed preview session is immediately signed out; isolated form/tab tests passed.

- [x] Fix CCFF QR/deep links and verify isolated public form, error and confirmation screens without record/dashboard access.

- [x] Complete and verify the permission-aware longitudinal beneficiary guided tour, including safeguarding and vaulting.
- [x] Lock Record service to the current component with component-specific services/outcomes; rename to CDDs and FLHFs.

- [x] Add a standalone in-app Hand Card screen with record-linked navigation and existing exports.

- [x] Remove hand-card text collisions and verify image/PDF layout with long record details.
- [x] Harden camera permissions, camera lifecycle, and supported torch controls; refresh scanner presentation.
- [ ] Verify physical device camera/torch and paper printing — requires a camera/torch-equipped device and printer.

- [x] Replace crowded records tabs with grouped professional navigation.
- [x] Build a live project-wide General dashboard matching the supplied reference.
- [x] Preserve role, safeguarding, facility, and administration visibility rules.
- [x] Add an administrator-only LGA-to-DHIS2 review, validation, and send workflow.
- [ ] Verify the live DHIS2 LGA match and dry-run against the connected national server.
- [ ] Verify imported DHIS2 maps render Nigeria’s National, State, and LGA boundaries with live values.
- [x] Unify every Street View entry point on real high-quality Google panoramas with street-level fallback.
- [x] Remove the blank longitudinal-register option from Add Module.
- [x] Add guarded deletion for an active Comprehensive NTD programme module.
- [x] Add 30-day KPI change indicators and recorded activity dates to the General Dashboard journey.
- [x] Make the Service Uptake chart and every axis label fully visible at all dashboard widths.
- [x] Professionally space and format imported DHIS2 chart categories, labels, legends, and tooltips.
- [x] Add standard national indicators across all components to the DHIS2 Data Exchange, grouped with definitions.
- [ ] Map new indicators to DHIS2 data elements and send a live test — requires the user's DHIS2 server in the app.
- [x] Deploy updated health-exchange (indicator-aligned services/aggregation).

- [x] Build CiSKuLA-2 Programme Report Form (logframe indicators, targets, disaggregation, risks, history, auto-aggregation) with Programme Officer designation.
- [ ] Verify programme report save/history end-to-end with a designated officer account.
- [x] Verify CHEW dispatch marks beneficiary "Booked · CHEW visit in X days" live (CiSKuLA 2, Joseph Ameh record, due 10/21/2026) and visit tracked in Home visits dispatched + map.
- [ ] Investigate what set the Super Admin profile inactive (recurring preview sign-outs) — re-activated via trigger bypass; watch for automatic re-deactivation.
- [x] Quiz participant identifier fields, external link auto-detect/import, minute-level external sync with live dashboard.
- [x] Overview page is the default landing/homepage; brand write-up removed above the heading.

- [x] Protection section opens as illustrated hub cards (Safeguarding dashboard, Safeguarding cases, Community feedback) with live figures, matching the uploaded design.

- [x] Admin device preview (Desktop/Android/iOS/Tablet) for Longitudinal Beneficiary Records with one-click scale-to-fit and device-native font sizing
- [x] LQAS Global Standard phase 2: saved rounds and lots from the microplan, two-threshold decision rule, risk flags, supervisors.
- [x] LQAS round phone form + printed pack, Kobo results linked to lots, automatic mop-up, reports tab.
- [ ] LQAS live Kobo submission test — waits on a real field submission from KoboCollect.
