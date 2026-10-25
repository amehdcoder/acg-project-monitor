# Roadmap

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
