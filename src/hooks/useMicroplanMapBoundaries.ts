import { useEffect, type RefObject } from "react";
import type L from "leaflet";
import { drawNigeriaAdminBoundaries } from "@/lib/microplanning/leafletAdminBoundaries";
import { adminStateKey, loadNigeriaAdminBoundaries, selectAdminBoundaries } from "@/lib/microplanning/nigeriaAdminBoundaries";

/** Boundary loads are shared across maps and independent of live record changes. */
export function useMicroplanMapBoundaries(mapRef: RefObject<L.Map | null>, states: (string | null | undefined)[], enabled = true) {
  const stateKey = JSON.stringify([...new Set(states.map(adminStateKey).filter(Boolean))].sort());
  useEffect(() => {
    const map = mapRef.current;
    if (!enabled || !map) return;
    let live = true;
    let remove: (() => void) | undefined;
    let notice: L.Control | undefined;
    void loadNigeriaAdminBoundaries().then(data => {
      if (!live) return;
      remove = drawNigeriaAdminBoundaries(map, selectAdminBoundaries(data, JSON.parse(stateKey))).remove;
    }).catch(() => {
      if (!live) return;
      // Never silently substitute a coarse/different source on a failed load.
      void import("leaflet").then(({ default: leaflet }) => {
        if (!live) return;
        notice = new leaflet.Control({ position: "bottomleft" });
        notice.onAdd = () => {
          const element = leaflet.DomUtil.create("div", "geo-admin-load-notice");
          element.setAttribute("role", "status");
          element.textContent = "State/LGA outlines unavailable — reconnect and reopen.";
          return element;
        };
        notice.addTo(map);
      });
    });
    return () => { live = false; remove?.(); notice?.remove(); };
  }, [mapRef, stateKey, enabled]);
}