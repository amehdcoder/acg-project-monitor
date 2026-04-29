import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Save, MapPin, AlertTriangle, CheckCircle2, Target, TrendingUp, Eye } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface CoverageEntry {
  id: string;
  state: string;
  lga: string;
  ward: string;
  flhf_name: string;
  community_name: string;
  settlement_name: string | null;
  community_latitude: number | null;
  community_longitude: number | null;
  settlement_latitude: number | null;
  settlement_longitude: number | null;
  flhf_latitude: number | null;
  flhf_longitude: number | null;
  estimated_total_population: number | null;
  estimated_children_5_14: number | null;
  estimated_adults_15_plus: number | null;
  total_treated: number | null;
  medicine_used?: number | null;
  year_of_microplanning: number | null;
  campaign_type: string | null;
}

interface CoverageViewProps {
  entries: CoverageEntry[];
  onRefresh: () => void;
}

const CoverageView = ({ entries, onRefresh }: CoverageViewProps) => {
  const [editedTreated, setEditedTreated] = useState<Record<string, string>>({});
  const [editedUsed, setEditedUsed] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [filterLga, setFilterLga] = useState<string>("all");
  const [filterWard, setFilterWard] = useState<string>("all");
  const [showMap, setShowMap] = useState(false);
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);

  const getTargetPop = (e: CoverageEntry) =>
    ((e.estimated_children_5_14 || 0) + (e.estimated_adults_15_plus || 0)) || (e.estimated_total_population || 0);

  // Cascading filters
  const allLgas = useMemo(() => [...new Set(entries.map(e => e.lga))].sort(), [entries]);
  const filteredWards = useMemo(() => {
    const base = filterLga !== "all" ? entries.filter(e => e.lga === filterLga) : entries;
    return [...new Set(base.map(e => e.ward))].sort();
  }, [entries, filterLga]);

  const filtered = useMemo(() => {
    let e = entries;
    if (filterLga !== "all") e = e.filter(x => x.lga === filterLga);
    if (filterWard !== "all") e = e.filter(x => x.ward === filterWard);
    return e;
  }, [entries, filterLga, filterWard]);

  // Reset ward when LGA changes
  useEffect(() => { setFilterWard("all"); }, [filterLga]);

  // KPIs
  const kpis = useMemo(() => {
    const totalTarget = filtered.reduce((s, e) => s + getTargetPop(e), 0);
    const totalTreated = filtered.reduce((s, e) => s + (e.total_treated || 0), 0);
    const totalMedicineUsed = filtered.reduce((s, e) => s + (e.medicine_used || 0), 0);
    const withCoverage = filtered.filter(e => e.total_treated != null && e.total_treated > 0);
    const missed = filtered.filter(e => !e.total_treated || e.total_treated === 0);
    const geotagged = filtered.filter(e => e.community_latitude && e.community_longitude);
    const coveredGeo = withCoverage.filter(e => e.community_latitude && e.community_longitude);
    const geoCoverage = geotagged.length > 0 ? (coveredGeo.length / geotagged.length) * 100 : 0;
    const therapeuticCoverage = totalTarget > 0 ? (totalTreated / totalTarget) * 100 : 0;

    return {
      totalTarget,
      totalTreated,
      totalMedicineUsed,
      therapeuticCoverage,
      geoCoverage,
      communitiesCovered: withCoverage.length,
      communitiesMissed: missed.length,
      totalCommunities: filtered.length,
    };
  }, [filtered]);

  const handleSave = async (id: string) => {
    const treatedVal = editedTreated[id];
    const usedVal = editedUsed[id];
    if (treatedVal === undefined && usedVal === undefined) return;
    setSaving(id);
    const patch: Record<string, number | null> = {};
    if (treatedVal !== undefined) patch.total_treated = treatedVal === "" ? null : Number(treatedVal);
    if (usedVal !== undefined) patch.medicine_used = usedVal === "" ? null : Number(usedVal);
    const { error } = await supabase
      .from("microplan_entries")
      .update(patch as any)
      .eq("id", id);
    if (error) {
      toast({ title: "Error saving", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "✅ Saved" });
      setEditedTreated(prev => { const n = { ...prev }; delete n[id]; return n; });
      setEditedUsed(prev => { const n = { ...prev }; delete n[id]; return n; });
      onRefresh();
    }
    setSaving(null);
  };

  // Map rendering
  useEffect(() => {
    if (!showMap || !mapContainerRef.current) return;
    if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }

    const map = L.map(mapContainerRef.current, { zoomControl: true, attributionControl: true });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;

    const geoEntries = filtered.filter(e => e.community_latitude && e.community_longitude);
    if (geoEntries.length === 0) {
      map.setView([9.06, 7.49], 6);
      return;
    }

    const bounds: L.LatLngTuple[] = [];

    geoEntries.forEach(e => {
      const lat = e.community_latitude!;
      const lng = e.community_longitude!;
      bounds.push([lat, lng]);

      const target = getTargetPop(e);
      const treated = e.total_treated || 0;
      const coverage = target > 0 ? (treated / target) * 100 : 0;
      const isMissed = treated === 0;

      // Color based on coverage
      let color = "#ef4444"; // red - missed
      let fillOpacity = 0.85;
      if (!isMissed) {
        if (coverage >= 80) { color = "#10b981"; } // green
        else if (coverage >= 50) { color = "#f59e0b"; } // amber
        else { color = "#f97316"; } // orange
      }

      const radius = Math.max(6, Math.min(18, Math.sqrt(target / 50)));

      const marker = L.circleMarker([lat, lng], {
        radius,
        fillColor: color,
        fillOpacity,
        color: isMissed ? "#991b1b" : "#fff",
        weight: isMissed ? 2.5 : 1.5,
        className: isMissed ? "coverage-missed-marker" : "",
      });

      const popupHtml = `
        <div style="min-width:200px;font-family:inherit;">
          <div style="font-weight:700;font-size:14px;margin-bottom:6px;">${e.community_name}</div>
          ${e.settlement_name ? `<div style="font-size:11px;color:#6b7280;margin-bottom:4px;">Settlement: ${e.settlement_name}</div>` : ""}
          <div style="font-size:11px;color:#6b7280;margin-bottom:8px;">${e.ward} · ${e.lga} · ${e.state}</div>
          <div style="display:flex;gap:8px;margin-bottom:6px;">
            <div style="flex:1;background:${isMissed ? '#fef2f2' : coverage >= 80 ? '#ecfdf5' : '#fffbeb'};padding:6px 8px;border-radius:8px;text-align:center;">
              <div style="font-size:10px;color:#6b7280;">Coverage</div>
              <div style="font-size:16px;font-weight:800;color:${color};">${target > 0 ? coverage.toFixed(1) + '%' : 'N/A'}</div>
            </div>
            <div style="flex:1;background:#f3f4f6;padding:6px 8px;border-radius:8px;text-align:center;">
              <div style="font-size:10px;color:#6b7280;">Treated</div>
              <div style="font-size:14px;font-weight:700;">${treated.toLocaleString()}</div>
            </div>
            <div style="flex:1;background:#f3f4f6;padding:6px 8px;border-radius:8px;text-align:center;">
              <div style="font-size:10px;color:#6b7280;">Target</div>
              <div style="font-size:14px;font-weight:700;">${target.toLocaleString()}</div>
            </div>
          </div>
          ${isMissed ? '<div style="background:#fef2f2;border:1px solid #fecaca;padding:4px 8px;border-radius:6px;font-size:11px;color:#991b1b;text-align:center;font-weight:600;">⚠️ MISSED — No treatment recorded</div>' : ''}
        </div>
      `;
      marker.bindPopup(popupHtml, { maxWidth: 300 });
      marker.addTo(map);

      // Add pulsing ring for missed communities
      if (isMissed) {
        L.circleMarker([lat, lng], {
          radius: radius + 6,
          fillColor: "transparent",
          fillOpacity: 0,
          color: "#ef4444",
          weight: 1.5,
          opacity: 0.5,
          dashArray: "4,4",
          className: "coverage-pulse-ring",
        }).addTo(map);
      }
    });

    // Add FLHF markers
    const flhfMap = new Map<string, CoverageEntry>();
    geoEntries.forEach(e => {
      if (e.flhf_latitude && e.flhf_longitude && !flhfMap.has(e.flhf_name)) {
        flhfMap.set(e.flhf_name, e);
      }
    });
    flhfMap.forEach((e, name) => {
      const lat = e.flhf_latitude!;
      const lng = e.flhf_longitude!;
      bounds.push([lat, lng]);
      L.marker([lat, lng], {
        icon: L.divIcon({
          className: "coverage-flhf-icon",
          html: `<div style="background:#2563eb;color:white;width:22px;height:22px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);">🏥</div>`,
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
      }).bindPopup(`<b>${name}</b><br/><span style="font-size:11px;color:#6b7280;">Health Facility</span>`).addTo(map);
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
    }

    return () => { map.remove(); mapRef.current = null; };
  }, [showMap, filtered]);

  const getCoverageColor = (coverage: number) => {
    if (coverage >= 80) return "text-emerald-600 dark:text-emerald-400";
    if (coverage >= 50) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getCoverageBg = (coverage: number) => {
    if (coverage >= 80) return "bg-emerald-100 dark:bg-emerald-900/30";
    if (coverage >= 50) return "bg-amber-100 dark:bg-amber-900/30";
    return "bg-red-100 dark:bg-red-900/30";
  };

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border/50 bg-gradient-to-br from-blue-50 to-background dark:from-blue-950/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-blue-600" />
              <p className="text-[10px] text-muted-foreground font-medium">Therapeutic Coverage</p>
            </div>
            <p className={`text-2xl font-black tabular-nums ${getCoverageColor(kpis.therapeuticCoverage)}`}>
              {kpis.therapeuticCoverage.toFixed(1)}%
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {kpis.totalTreated.toLocaleString()} treated / {kpis.totalTarget.toLocaleString()} target
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-emerald-50 to-background dark:from-emerald-950/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <MapPin className="h-4 w-4 text-emerald-600" />
              <p className="text-[10px] text-muted-foreground font-medium">Geographic Coverage</p>
            </div>
            <p className={`text-2xl font-black tabular-nums ${getCoverageColor(kpis.geoCoverage)}`}>
              {kpis.geoCoverage.toFixed(1)}%
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {kpis.communitiesCovered} of {kpis.totalCommunities} geotagged communities reached
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-green-50 to-background dark:from-green-950/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <p className="text-[10px] text-muted-foreground font-medium">Communities Covered</p>
            </div>
            <p className="text-2xl font-black tabular-nums text-green-600">
              {kpis.communitiesCovered}
            </p>
            <div className="w-full h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${kpis.totalCommunities > 0 ? (kpis.communitiesCovered / kpis.totalCommunities) * 100 : 0}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50 bg-gradient-to-br from-red-50 to-background dark:from-red-950/20">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <p className="text-[10px] text-muted-foreground font-medium">Communities Missed</p>
            </div>
            <p className="text-2xl font-black tabular-nums text-red-600">
              {kpis.communitiesMissed}
            </p>
            <div className="w-full h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
              <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${kpis.totalCommunities > 0 ? (kpis.communitiesMissed / kpis.totalCommunities) * 100 : 0}%` }} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Map Toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={filterLga} onValueChange={setFilterLga}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="All LGAs" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All LGAs</SelectItem>
            {allLgas.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterWard} onValueChange={setFilterWard}>
          <SelectTrigger className="w-[160px] h-8 text-xs"><SelectValue placeholder="All Wards" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Wards</SelectItem>
            {filteredWards.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={showMap ? "default" : "outline"}
          onClick={() => setShowMap(!showMap)}
          className="gap-1.5"
        >
          <Eye className="h-3.5 w-3.5" />
          {showMap ? "Hide Coverage Map" : "Show Coverage Map"}
        </Button>
      </div>

      {/* Coverage Map */}
      {showMap && (
        <Card className="border-border/50 overflow-hidden">
          <div ref={mapContainerRef} style={{ height: "500px", width: "100%" }} className="rounded-lg" />
          {/* Legend */}
          <div className="p-3 border-t border-border bg-muted/20">
            <p className="text-[10px] font-semibold text-muted-foreground mb-2">COVERAGE LEGEND</p>
            <div className="flex flex-wrap gap-4">
              {[
                { color: "#10b981", label: "≥ 80% Coverage", shape: "circle" },
                { color: "#f59e0b", label: "50–79% Coverage", shape: "circle" },
                { color: "#f97316", label: "< 50% Coverage", shape: "circle" },
                { color: "#ef4444", label: "Missed (0%)", shape: "circle-dashed" },
                { color: "#2563eb", label: "Health Facility", shape: "square" },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-1.5 text-[11px]">
                  {item.shape === "square" ? (
                    <div className="w-3.5 h-3.5 rounded-sm flex items-center justify-center text-[8px]" style={{ background: item.color, color: "white" }}>🏥</div>
                  ) : item.shape === "circle-dashed" ? (
                    <div className="w-3.5 h-3.5 rounded-full" style={{ background: item.color, border: "2px dashed #991b1b" }} />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full" style={{ background: item.color }} />
                  )}
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-muted-foreground mt-1.5">Circle size represents target population. Dashed rings highlight missed communities.</p>
          </div>
        </Card>
      )}

      {/* Data Entry Table */}
      <Card className="border-border/50">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="px-3 py-2.5 text-left font-semibold border-r border-primary/70">State</th>
                  <th className="px-3 py-2.5 text-left font-semibold border-r border-primary/70">LGA</th>
                  <th className="px-3 py-2.5 text-left font-semibold border-r border-primary/70">Ward</th>
                  <th className="px-3 py-2.5 text-left font-semibold border-r border-primary/70">FLHF</th>
                  <th className="px-3 py-2.5 text-left font-semibold border-r border-primary/70">Community</th>
                  <th className="px-3 py-2.5 text-left font-semibold border-r border-primary/70">Settlement</th>
                  <th className="px-3 py-2.5 text-right font-semibold border-r border-primary/70">Target Pop</th>
                  <th className="px-3 py-2.5 text-right font-semibold border-r border-primary/70 w-[130px]">Total Treated</th>
                  <th className="px-3 py-2.5 text-right font-semibold border-r border-primary/70">Coverage %</th>
                  <th className="px-3 py-2.5 text-center font-semibold w-[60px]">Save</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, i) => {
                  const target = getTargetPop(e);
                  const currentTreated = editedTreated[e.id] !== undefined ? Number(editedTreated[e.id]) || 0 : (e.total_treated || 0);
                  const coverage = target > 0 ? (currentTreated / target) * 100 : 0;
                  const isMissed = currentTreated === 0;

                  return (
                    <tr
                      key={e.id}
                      className={`border-b border-border/30 transition-colors ${
                        isMissed ? "bg-red-50/50 dark:bg-red-950/10" : i % 2 === 0 ? "bg-background" : "bg-muted/20"
                      } hover:bg-muted/40`}
                    >
                      <td className="px-3 py-2 border-r border-border/20">{e.state}</td>
                      <td className="px-3 py-2 border-r border-border/20">{e.lga}</td>
                      <td className="px-3 py-2 border-r border-border/20">{e.ward}</td>
                      <td className="px-3 py-2 border-r border-border/20">{e.flhf_name}</td>
                      <td className="px-3 py-2 border-r border-border/20 font-medium">{e.community_name}</td>
                      <td className="px-3 py-2 border-r border-border/20 text-muted-foreground">{e.settlement_name || "—"}</td>
                      <td className="px-3 py-2 border-r border-border/20 text-right tabular-nums">{target.toLocaleString()}</td>
                      <td className="px-2 py-1 border-r border-border/20">
                        <Input
                          type="number"
                          min={0}
                          value={editedTreated[e.id] !== undefined ? editedTreated[e.id] : (e.total_treated ?? "")}
                          onChange={(ev) => setEditedTreated(prev => ({ ...prev, [e.id]: ev.target.value }))}
                          className="h-7 text-xs text-right tabular-nums w-full"
                          placeholder="0"
                        />
                      </td>
                      <td className="px-3 py-2 border-r border-border/20 text-right">
                        <span className={`font-bold tabular-nums ${getCoverageColor(coverage)}`}>
                          {target > 0 ? coverage.toFixed(1) + "%" : "—"}
                        </span>
                        {isMissed && target > 0 && (
                          <Badge variant="outline" className="ml-1 text-[8px] border-red-300 text-red-600 px-1">MISSED</Badge>
                        )}
                      </td>
                      <td className="px-2 py-1 text-center">
                        {editedTreated[e.id] !== undefined && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => handleSave(e.id)}
                            disabled={saving === e.id}
                          >
                            <Save className="h-3 w-3 text-primary" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center py-8 text-muted-foreground">
                      No entries found for selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-primary text-primary-foreground font-bold">
                    <td colSpan={6} className="px-3 py-2.5 border-r border-primary/70">TOTAL</td>
                    <td className="px-3 py-2.5 text-right tabular-nums border-r border-primary/70">
                      {filtered.reduce((s, e) => s + getTargetPop(e), 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums border-r border-primary/70">
                      {filtered.reduce((s, e) => s + (e.total_treated || 0), 0).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums border-r border-primary/70">
                      {kpis.therapeuticCoverage.toFixed(1)}%
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      <style>{`
        .coverage-pulse-ring {
          animation: coverage-pulse 2s ease-in-out infinite;
        }
        @keyframes coverage-pulse {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.8; }
        }
      `}</style>
    </div>
  );
};

export default CoverageView;
