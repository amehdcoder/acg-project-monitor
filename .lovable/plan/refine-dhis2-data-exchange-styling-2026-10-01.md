# Refine DHIS2 Data Exchange styling

## Build
- Give the Integrations DHIS2 area a scoped ocean-blue DHIS2 visual treatment while preserving the app theme elsewhere.
- Standardize the exchange and dashboard-import cards with rounded-xl corners, subtle slate borders, and light shadows.
- Add three live project-level counters above the cards: data sets synced, active mappings, and submissions transferred.
- Refresh the counters after connection and exchange activity without changing sync behavior or permissions.

## Technical details
- Use semantic CSS variables scoped to the Integrations exchange section for the DHIS2 blue accents.
- Calculate counters from the active Integrations connection, saved mappings, detected data sets, and successful/partial transfer logs.
- Preserve all existing pull, push, schema exploration, dashboard import, and access-control flows.

## Validation
- Check the current diagnostics and verify the Integrations page at desktop and mobile widths.
