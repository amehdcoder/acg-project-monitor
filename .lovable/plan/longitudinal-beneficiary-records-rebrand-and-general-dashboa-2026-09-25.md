# Longitudinal Beneficiary Records rebrand and General Dashboard

## What will change

- Replace the crowded row of workspace tabs and mixed administrative buttons with a clear application shell: a compact section navigator for day-to-day work, grouped menus for analytics and specialist services, and a separate administration menu shown only to authorised users.
- Keep every existing records feature and permission rule intact, including facility scoping, safeguarding restrictions, offline sync, module configuration, deletion approvals, project assignment, and team management.
- Make **General dashboard** the first view for users who can view dashboards; users without dashboard access will continue to land on Beneficiary records.

## General dashboard

- Build a live, project-scoped dashboard following the supplied CiSKuLA reference: welcome/reporting header, two rows of coloured KPI tiles, beneficiary journey stages, key alerts, service-uptake bars, outcome and referral ring charts, facility-performance ranking, geographic summaries, recent records, and quick actions.
- Use real project records only. Metrics will be derived from beneficiaries, services, follow-ups, referrals, programme components, facilities, safeguarding counts, livelihoods, household/WASH and MDA data where available. Empty datasets will show truthful zero/empty states rather than invented values.
- Preserve facility focal-person scope so dashboards never expose beneficiaries or facilities outside a user’s access.
- Match the reference’s crisp pale report canvas, deep health-blue headings, teal/green/amber/red/purple chart language, square professional icons, thin borders, compact density, and desktop arrangement, while adapting cleanly for tablets and phones.
- Make dashboard actions functional: open records, open follow-ups, open referrals/facility work, open reporting views, and drill into a beneficiary where the user has access.

## Navigation structure

- **Overview:** General dashboard, Beneficiary journey, Facility dashboard, Community clusters.
- **People & care:** Beneficiary records, Follow-ups & referrals, Households & MDA, CDD case search, Livelihood & empowerment.
- **Intelligence:** Transmission network, Follow-up risk & CHEW visits, Data exchange.
- **Protection:** Safeguarding and Safeguarding dashboard, visible only to authorised officers.
- **Administration:** Health facilities, Facility teams, Project team, Safeguarding officers, Configure module, Records on projects, Deletion requests, and Add module, each retaining its current role checks.

## Technical details and verification

- Add a focused dashboard component and a reusable grouped workspace navigation component, using existing design-system buttons, menus, cards, charts, project data hooks, and semantic colour tokens.
- Avoid changing backend schemas or record workflows; this is a presentation and aggregation update over existing data.
- Add focused tests for navigation visibility, permission filtering, KPI derivation, and empty states.
- Verify the signed-in Cases workspace at desktop and mobile sizes, including dashboard drill-downs, menu access, readable chart labels, no overlap, and a clean build.
