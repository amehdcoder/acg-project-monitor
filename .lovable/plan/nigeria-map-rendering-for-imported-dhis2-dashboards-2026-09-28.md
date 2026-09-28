# Nigeria map rendering for imported DHIS2 dashboards

## Goal
Replace the current bar-chart fallback for every imported DHIS2 map with an interactive Nigeria choropleth that clearly shows national, state, and LGA boundaries while preserving the dashboard’s data and layout.

## Implementation
- Extend the existing DHIS2 dashboard reader to return the selected map layer’s geography and visual settings alongside its analytics results.
- Build a dedicated imported-dashboard map renderer using the app’s existing Nigeria LGA boundary file and tolerant State/LGA name matching.
- Render three distinct boundary levels: a strong national outline, clear state divisions, and fine LGA borders. Shade the appropriate areas from the live DHIS2 values using a polished data legend.
- Add professional map interactions: hover details, clickable State/LGA drill-down and zoom, reset-to-Nigeria control, visible reporting period/data-item context, and a clear unmatched-location notice when DHIS2 names cannot be resolved.
- Use the map renderer for both dashboard tiles and full-screen views. Keep the existing pivot-table action available for the same map data.
- Preserve non-map charts, tables, dashboard positioning, authentication, and all existing push/pull workflows unchanged.

## Technical details
- Reuse `public/nigeria-lga.geojson` and the existing cached boundary loader/name resolver.
- Generate lightweight state and national outline layers from the same source so borders remain consistent and no external map service is required for the thematic data.
- Aggregate analytics by the DHIS2 `ou` dimension and retain multiple series through a selectable data-item/period control when required.
- Keep all DHIS2 requests inside `health-exchange`; no credentials or protected calls move into the browser.
- Verify the imported dashboard in tile and full-screen layouts, including resize behavior and error-free loading.
