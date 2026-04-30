---
name: Microplanning Permissions & Allocation History
description: Designation-based scope assignments and persistent medicine allocation audit trail in Geo Microplanning
type: feature
---
Tables:
- `microplan_designation_assignments` — user × designation (state_supervisor, lga_supervisor, ward_supervisor, flhf, cdd, partner, other) × scope arrays (states/lgas/wards/flhfs/communities/settlements). Empty array at any level = ALL within parent scope.
- `microplan_medicine_allocations` — persisted per-LGA medicine allocations (project, year, lga, amount). Admin-only writes.
- `microplan_allocation_history` — audit trail (create/update/delete) populated by trigger `track_microplan_allocation_changes`.

Helpers:
- DB function `user_has_microplan_scope(user, state, lga, ward, flhf, community, settlement)` returns boolean.
- React hook `useMicroplanScope(bypassForAdmin)` returns `{ isInScope, hasNoRestriction, designations }`. Non-admins with no assignment see all (legacy); with assignments are filtered.

UI:
- Default tab order in MicroplanningView: Planning (list) → Medicine → Coverage → Reconciliation → Map → Routes. Default = Planning.
- DesignationManagerDialog (admin) — assign users with cascading multi-selects.
- AllocationHistoryDialog — read-only audit log view.
- Coverage & Reconciliation receive scope-filtered displayEntries automatically.
