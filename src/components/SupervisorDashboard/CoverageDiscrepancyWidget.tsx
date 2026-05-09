import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, MapPin } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import {
  findOpsDiscrepancies,
  type OpsDiscrepancy,
  type CESVisitRow,
  type CESSegmentRow,
  type MicroplanRow,
} from "@/lib/ces/discrepancy";

/**
 * Operations-tab widget: lists Communities and Settlements where coverage
 * computed from persons-treated against Target Population is statistically
 * significantly different from the Therapeutic Coverage from CES — and where
 * Geographic Coverage (CES) is below 100%.
 */
const CoverageDiscrepancyWidget = () => {
  const [visits, setVisits] = useState<CESVisitRow[]>([]);
  const [segments, setSegments] = useState<CESSegmentRow[]>([]);
  const [microplan, setMicroplan] = useState<MicroplanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<L.Map | null>(null);
  const mapEl = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      // Pull CES visits joined with their survey context (location fields live on the survey)
      const [{ data: surveys }, { data: segs }, { data: mp }] = await Promise.all([
        supabase.from("ces_surveys" as any).select("id,state,lga,ward,flhf_name,community_name,settlement_name").limit(1000),
        supabase.from("ces_segments" as any).select("survey_id,total_hh_in_segment,hh_treated_in_segment").not("total_hh_in_segment", "is", null).limit(2000),
        supabase.from("microplan_entries" as any).select("state,lga,ward,flhf_name,community_name,settlement_name,estimated_total_population,estimated_children_5_14,estimated_adults_15_plus,total_treated,number_of_households,households_treated,community_latitude,community_longitude,settlement_latitude,settlement_longitude").limit(2000),
      ]);
      const { data: hhs } = await supabase
        .from("ces_household_visits" as any)
        .select("survey_id,eligible_persons,treated_persons")
        .not("eligible_persons", "is", null)
        .limit(5000);

      if (cancelled) return;
      const surveyById = new Map<string, any>();
      ((surveys as any[]) ?? []).forEach((s) => surveyById.set(s.id, s));

      const visitsRows: CESVisitRow[] = ((hhs as any[]) ?? []).map((h) => {
        const s = surveyById.get(h.survey_id) ?? {};
        return {
          state: s.state, lga: s.lga, ward: s.ward,
          flhf_name: s.flhf_name, community_name: s.community_name, settlement_name: s.settlement_name,
          eligible_persons: h.eligible_persons, treated_persons: h.treated_persons,
        };
      });
      const segRows: CESSegmentRow[] = ((segs as any[]) ?? []).map((g) => {
        const s = surveyById.get(g.survey_id) ?? {};
        return {
          state: s.state, lga: s.lga, ward: s.ward,
          flhf_name: s.flhf_name, community_name: s.community_name, settlement_name: s.settlement_name,
          total_hh_in_segment: g.total_hh_in_segment, hh_treated_in_segment: g.hh_treated_in_segment,
        };
      });

      setVisits(visitsRows);
      setSegments(segRows);
      setMicroplan(((mp as any[]) ?? []) as MicroplanRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const discrepancies = useMemo<OpsDiscrepancy[]>(
    () => findOpsDiscrepancies(visits, segments, microplan, "community"),
    [visits, segments, microplan],
  );

  // Render map
  useEffect(() => {
    if (!mapEl.current) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    const map = L.map(mapEl.current, { zoomControl: true });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; CARTO', maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;

    const bounds: L.LatLngTuple[] = [];
    discrepancies.forEach((d) => {
      const m: any = d.microplan;
      const lat = m.community_latitude ?? m.settlement_latitude;
      const lng = m.community_longitude ?? m.settlement_longitude;
      if (lat == null || lng == null) return;
      bounds.push([lat, lng]);
      L.circleMarker([lat, lng], {
        radius: 9, fillColor: "#dc2626", color: "#7f1d1d", weight: 2, fillOpacity: 0.85,
      })
        .bindPopup(
          `<div style="min-width:200px;font-family:inherit;font-size:12px">
            <div style="font-weight:700;margin-bottom:4px">${d.rollup.community_name ?? "—"}</div>
            <div style="color:#6b7280;margin-bottom:6px">${d.rollup.ward ?? ""} · ${d.rollup.lga ?? ""} · ${d.rollup.state ?? ""}</div>
            <div>Target-pop coverage: <b>${d.targetPopCoveragePct.toFixed(1)}%</b></div>
            <div>CES therapeutic: <b>${d.cesTherapeuticPct.toFixed(1)}%</b></div>
            <div>Geographic (CES): <b>${d.geographicPct.toFixed(1)}%</b></div>
            <div style="margin-top:4px;color:#7f1d1d">z=${d.z.toFixed(2)}, p=${d.pValue.toFixed(3)}</div>
          </div>`,
        )
        .addTo(map);
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11 });
    else map.setView([9.06, 7.49], 6);
  }, [discrepancies]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          Coverage Discrepancies
          <Badge variant="destructive" className="ml-auto">{discrepancies.length}</Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          Communities/settlements where Target-Population coverage differs significantly from CES Therapeutic
          Coverage (p&lt;0.05) <em>and</em> CES Geographic Coverage is below 100%.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div ref={mapEl} className="w-full rounded-md border border-border" style={{ height: 280 }} />
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Community</TableHead>
                <TableHead>Settlement</TableHead>
                <TableHead>Ward · LGA</TableHead>
                <TableHead className="text-right">Target-Pop %</TableHead>
                <TableHead className="text-right">CES Therapeutic %</TableHead>
                <TableHead className="text-right">Geographic %</TableHead>
                <TableHead className="text-right">z / p</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
              )}
              {!loading && discrepancies.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">
                  <MapPin className="inline h-4 w-4 mr-1" /> No statistically significant discrepancies detected.
                </TableCell></TableRow>
              )}
              {discrepancies.map((d) => (
                <TableRow key={d.rollup.key}>
                  <TableCell className="font-medium">{d.rollup.community_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{d.rollup.settlement_name ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{d.rollup.ward} · {d.rollup.lga}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.targetPopCoveragePct.toFixed(1)}%</TableCell>
                  <TableCell className="text-right tabular-nums">{d.cesTherapeuticPct.toFixed(1)}%</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <span className={d.geographicPct < 80 ? "text-red-600 font-semibold" : ""}>{d.geographicPct.toFixed(1)}%</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs">{d.z.toFixed(2)} / {d.pValue.toFixed(3)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};

export default CoverageDiscrepancyWidget;
