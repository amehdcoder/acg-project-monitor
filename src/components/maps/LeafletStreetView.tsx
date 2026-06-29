import { useCallback, useEffect, useState } from "react";
import type L from "leaflet";
import { useMap } from "react-leaflet";
import GoogleStreetViewPanel from "@/components/maps/GoogleStreetViewPanel";
import { attachStreetViewControl } from "@/lib/maps/leafletStreetViewControl";

type SvPoint = { lat: number; lng: number; accuracy?: number | null } | null;

/**
 * Reusable Street View wiring for imperative (vanilla Leaflet) maps.
 *
 * Usage:
 *   const { attach, panel } = useLeafletStreetView();
 *   // after `const map = L.map(...)`:
 *   const detach = attach(map);
 *   // on cleanup: detach();
 *   // in JSX (anywhere): {panel}
 */
export function useLeafletStreetView(title = "Street View") {
  const [sv, setSv] = useState<SvPoint>(null);

  const attach = useCallback(
    (map: L.Map) =>
      attachStreetViewControl(map, {
        onPick: (lat, lng) => setSv({ lat, lng }),
      }),
    [],
  );

  const panel = (
    <GoogleStreetViewPanel
      open={!!sv}
      onOpenChange={(o) => !o && setSv(null)}
      lat={sv?.lat ?? null}
      lng={sv?.lng ?? null}
      accuracy={sv?.accuracy ?? null}
      title={title}
    />
  );

  return { attach, panel, openStreetView: setSv };
}

/**
 * Drop-in Street View control + panel for react-leaflet `<MapContainer>` maps.
 * Render it as a child of `<MapContainer>`:
 *   <MapContainer>...<StreetViewLayer /></MapContainer>
 */
export function StreetViewLayer({ title = "Street View" }: { title?: string }) {
  const map = useMap();
  const [sv, setSv] = useState<SvPoint>(null);

  useEffect(() => {
    if (!map) return;
    const detach = attachStreetViewControl(map, {
      onPick: (lat, lng) => setSv({ lat, lng }),
    });
    return detach;
  }, [map]);

  return (
    <GoogleStreetViewPanel
      open={!!sv}
      onOpenChange={(o) => !o && setSv(null)}
      lat={sv?.lat ?? null}
      lng={sv?.lng ?? null}
      title={title}
    />
  );
}
