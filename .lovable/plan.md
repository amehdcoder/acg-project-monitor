# Geographic Distribution Map

## Goal
Replace the compact location bars on the Cases General Dashboard with a prominent, interactive Nigeria map that makes beneficiary concentration easy to understand.

## Changes
- Add a live LGA-level choropleth using the project’s existing Nigeria boundaries and the beneficiaries already visible to the signed-in user.
- Use a vivid multi-step color scale for beneficiary concentration, with a clear legend from no records to highest concentration.
- Add location icons and summary counters for covered states, LGAs, wards, and beneficiaries with recorded geography.
- Show State, LGA, beneficiary count, and share of mapped records when a boundary is selected.
- Keep the current Explore action and facility-access restrictions intact.
- Preserve a ranked location summary beside the map and show a truthful empty state when geography is missing.

## Verification
- Check the signed-in General Dashboard on desktop and mobile.
- Confirm map colors, legend, popups, controls, and empty states render without overlap.
- Confirm the build remains clean.

## Technical details
- Reuse the cached `NigeriaChoropleth` and tolerant State/LGA matching helpers.
- Derive all map cells locally from the already-scoped beneficiary list; no database or workflow changes.
- Escape popup content and use semantic dashboard color tokens for surrounding UI.
