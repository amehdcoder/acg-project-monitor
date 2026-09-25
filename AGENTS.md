# Architecture rules

- Route all DHIS2 LGA reporting through the existing `health-exchange` function so credentials, authorization, scoped aggregation, and audit logging remain server-side.