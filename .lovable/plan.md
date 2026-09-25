# Repair sign-in and complete ADX/SDMX exchange

## Sign-in
- Restore email/password and Google provider configuration against the app's existing Lovable Cloud authentication endpoint.
- Correct redirect handling and surface a clear temporary-service message when the hosted database is unavailable.
- Verify both sign-in actions from the authentication page once the hosted database is active.

## ADX and SDMX
- Extend the health-exchange service with standards-based ADX XML and SDMX-JSON/SDMX-ML generation, parsing, validation, and secure push/pull actions.
- Add mapping and period/category support needed for DHIS2 aggregate reporting without exposing stored credentials.
- Add on-screen controls to validate, preview, download, import, and transmit ADX/SDMX payloads, with clear accepted/rejected results and audit history.
- Add focused automated tests for payload structure, validation, and response parsing; deploy and test the exchange service when the hosted database is available.

## Validation
- Check type safety, current diagnostics, and the live authentication and data-exchange screens on desktop and mobile.
- Confirm remaining external dependency: real production data exchange requires the target server address, mappings, and valid credentials configured by an administrator.
