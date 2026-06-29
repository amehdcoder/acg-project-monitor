import L from "leaflet";

interface StreetViewControlOptions {
  position?: L.ControlPosition;
  onPick: (lat: number, lng: number) => void;
}

/**
 * Adds a beautiful "Street View" toggle button to a Leaflet map.
 * When activated, the cursor becomes a crosshair and the next map click opens
 * Street View at that point (via the supplied onPick callback).
 *
 * Returns a cleanup function that removes the control and listeners.
 */
export function attachStreetViewControl(
  map: L.Map,
  { position = "topright", onPick }: StreetViewControlOptions,
): () => void {
  let active = false;

  const StreetViewControl = L.Control.extend({
    options: { position },
    onAdd() {
      const container = L.DomUtil.create("div", "leaflet-bar sv-control");
      const btn = L.DomUtil.create("a", "sv-control-btn", container) as HTMLAnchorElement;
      btn.href = "#";
      btn.title = "Street View — click the map to drop a pegman";
      btn.setAttribute("role", "button");
      btn.setAttribute("aria-label", "Toggle Street View");
      btn.innerHTML = `
        <span class="sv-pegman">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <circle cx="12" cy="6" r="3.2" fill="currentColor"/>
            <path d="M8.5 11h7l1.2 5.2-2.1.5-.9-3.4-.2 6.7h-2.6l-.2-6.7-.9 3.4-2.1-.5z" fill="currentColor"/>
          </svg>
        </span>
        <span class="sv-label">Street View</span>`;

      const setState = (on: boolean) => {
        active = on;
        if (on) {
          L.DomUtil.addClass(container, "sv-active");
          L.DomUtil.addClass(map.getContainer(), "sv-picking");
        } else {
          L.DomUtil.removeClass(container, "sv-active");
          L.DomUtil.removeClass(map.getContainer(), "sv-picking");
        }
      };

      L.DomEvent.on(btn, "click", (e) => {
        L.DomEvent.stop(e);
        setState(!active);
      });
      L.DomEvent.disableClickPropagation(container);

      (container as any)._svSetState = setState;
      return container;
    },
  });

  const control = new StreetViewControl();
  control.addTo(map);

  const onMapClick = (e: L.LeafletMouseEvent) => {
    if (!active) return;
    onPick(e.latlng.lat, e.latlng.lng);
    const el = (control as any)._container;
    if (el && el._svSetState) el._svSetState(false);
  };
  map.on("click", onMapClick);

  return () => {
    map.off("click", onMapClick);
    L.DomUtil.removeClass(map.getContainer(), "sv-picking");
    try { control.remove(); } catch { /* noop */ }
  };
}
