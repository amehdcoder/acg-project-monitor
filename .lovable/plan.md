# DHIS2-linked Geographic Distribution map

## Goal
Turn each LGA on the General Dashboard map into a safe DHIS2 reporting entry point. Clicking an LGA will prepare its reporting package automatically, but transmission will require the chosen review-and-send confirmation.

## Build
- Open a focused DHIS2 reporting panel from a selected LGA without leaving the General Dashboard.
- Use the active live DHIS2 connection to search the signed-in account’s organisation-unit hierarchy for that State/LGA, rank exact matches, and require the administrator to confirm the target when more than one match exists.
- Load the selected DHIS2 data set and its live data elements/category breakdowns, showing which app indicators are mapped and which still need configuration.
- Calculate the selected month’s totals for only beneficiaries and linked programme activity in the clicked LGA, including sex breakdowns where available.
- Provide a validation step and a clear review summary before enabling **Send to DHIS2**. Never transmit from the initial map click.
- Send to the explicitly selected DHIS2 organisation unit, preserve DHIS2 import conflicts/messages, and write the existing exchange audit log.
- Keep the feature restricted to users already authorized to manage Data Exchange; other users retain the map’s normal geographic summary.

## Technical details
- Extend the existing health-exchange service with validated State/LGA filters for monthly aggregation, keeping credentials and remote requests server-side.
- Reuse the current DHIS2 browser, indicator mappings, `dataValueSets` sender, and project/facility access rules rather than creating a second exchange path.
- Pass the clicked geography from the dashboard to the review panel and keep the project’s configured default DHIS2 location unchanged.
- Add focused tests for LGA scoping, exact/ambiguous DHIS2 location matching, unmapped indicators, dry-run validation, and guarded sending.

## Verification
- Verify a signed-in administrator can click an LGA, review the matching DHIS2 location and mapped elements, validate, and send.
- Verify ambiguous/no-match, missing mapping, closed-period, and permission states are clearly handled.
- Verify ordinary users cannot transmit and the dashboard remains usable on desktop and mobile.
