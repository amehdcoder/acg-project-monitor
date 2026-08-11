import { useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ChevronRight, MapPin, Users, Home, Building2, Search, Sparkles,
  Compass, AlertTriangle, CheckCircle2, Loader2, Layers,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { DISABILITY_TYPES, pwdTotalFor, pwdValue } from "@/lib/microplanning/disabilityTypes";
import {
  resolveMissingCoordinates, resolutionToUpdate, rowNeedsGeocoding,
  type RowResolution, type MicroplanGeoRow,
} from "@/lib/microplanning/settlementResolver";
import { effectiveDistanceKm } from "@/lib/microplanning/distance";
import LargePopulationFlags from "./LargePopulationFlags";

interface Props {
  entries: any[];
  readOnly?: boolean;
  onRefresh?: () => void;
}

interface Agg {
  name: string;
  communities: number;
  settlements: number;
  households: number;
  population: number;
  children04: number;
  children514: number;
  adults15: number;
  pwd: number;
  geotagged: number;
  hardToReach: number;
  distSum: number;
  distCount: number;
  pwdByType: Record<string, number>;
}

const blank = (name: string): Agg => ({
  name, communities: 0, settlements: 0, households: 0, population: 0,
  children04: 0, children514: 0, adults15: 0, pwd: 0, geotagged: 0,
  hardToReach: 0, distSum: 0, distCount: 0, pwdByType: {},
});

const accumulate = (a: Agg, e: any) => {
  a.communities += 1;
  if (e.settlement_name) a.settlements += 1;
  a.households += e.number_of_households || 0;
  a.population += e.estimated_total_population || 0;
  a.children04 += e.estimated_children_0_4 || 0;
  a.children514 += e.estimated_children_5_14 || 0;
  a.adults15 += e.estimated_adults_15_plus || 0;
  a.pwd += pwdTotalFor(e);
  for (const d of DISABILITY_TYPES) a.pwdByType[d.key] = (a.pwdByType[d.key] || 0) + pwdValue(e, d.field);
  if (e.community_latitude && e.community_longitude) a.geotagged += 1;
  if (e.accessibility === "hard_to_reach" || e.accessibility === "inaccessible") a.hardToReach += 1;
  const dist = effectiveDistanceKm(e);
  if (typeof dist === "number" && dist > 0) { a.distSum += dist; a.distCount += 1; }
};

const n = (v: number) => v.toLocaleString();
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

const MetricPill = ({ icon: Icon, label, value, tone = "muted" }: { icon: any; label: string; value: string; tone?: string }) => (
  <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-muted/30 px-2 py-1">
    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
    <span className="text-[10px] text-muted-foreground">{label}</span>
    <span className="text-[11px] font-bold tabular-nums text-foreground">{value}</span>
  </div>
);

const MicroplanSummaryView = ({ entries, readOnly = false, onRefresh }: Props) => {
  const [query, setQuery] = useState("");
  const [openLga, setOpenLga] = useState<Record<string, boolean>>({});
  const [openWard, setOpenWard] = useState<Record<string, boolean>>({});
  const [resolving, setResolving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resolutions, setResolutions] = useState<RowResolution[] | null>(null);
  const [saving, setSaving] = useState(false);

  // Alphabetical LGA → Ward → Health Facility ordering for the resolution list.
  const sortedResolutions = useMemo(() => {
    if (!resolutions) return null;
    const flhfOf = new Map<string, string>(
      entries.map((e: any) => [e.id, String(e.flhf_name ?? "")]),
    );
    const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });
    return [...resolutions].sort((a, b) =>
      cmp(a.lga || "", b.lga || "") ||
      cmp(a.ward || "", b.ward || "") ||
      cmp(flhfOf.get(a.id ?? "") || "", flhfOf.get(b.id ?? "") || "") ||
      cmp(String(a.id ?? ""), String(b.id ?? "")),
    );
  }, [resolutions, entries]);


  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) =>
      [e.lga, e.ward, e.flhf_name, e.community_name, e.settlement_name]
        .some((v: string) => v?.toLowerCase?.().includes(q)),
    );
  }, [entries, query]);

  const tree = useMemo(() => {
    const lgas = new Map<string, { agg: Agg; wards: Map<string, { agg: Agg; flhfs: Map<string, Agg> }> }>();
    const overall = blank("Overall");
    for (const e of rows) {
      const lgaName = e.lga || "Unassigned LGA";
      const wardName = e.ward || "Unassigned Ward";
      const flhfName = e.flhf_name || "Unassigned Health Facility";
      if (!lgas.has(lgaName)) lgas.set(lgaName, { agg: blank(lgaName), wards: new Map() });
      const lgaNode = lgas.get(lgaName)!;
      if (!lgaNode.wards.has(wardName)) lgaNode.wards.set(wardName, { agg: blank(wardName), flhfs: new Map() });
      const wardNode = lgaNode.wards.get(wardName)!;
      if (!wardNode.flhfs.has(flhfName)) wardNode.flhfs.set(flhfName, blank(flhfName));
      accumulate(overall, e);
      accumulate(lgaNode.agg, e);
      accumulate(wardNode.agg, e);
      accumulate(wardNode.flhfs.get(flhfName)!, e);
    }
    const list = Array.from(lgas.values())
      .map((l) => ({
        agg: l.agg,
        wards: Array.from(l.wards.values())
          .map((w) => ({ agg: w.agg, flhfs: Array.from(w.flhfs.values()).sort((a, b) => b.population - a.population) }))
          .sort((a, b) => b.agg.population - a.agg.population),
      }))
      .sort((a, b) => b.agg.population - a.agg.population);
    return { overall, list };
  }, [rows]);

  const missing = useMemo(() => rows.filter((e) => rowNeedsGeocoding(e as MicroplanGeoRow)), [rows]);

  const runResolve = useCallback(async () => {
    setResolving(true);
    setProgress(0);
    setResolutions(null);
    try {
      const res = await resolveMissingCoordinates(missing as MicroplanGeoRow[], (done, total) =>
        setProgress(total ? Math.round((done / total) * 100) : 100),
      );
      setResolutions(res);
      toast.success(`Resolved ${res.length} of ${missing.length} records from GRID3`);
    } catch (err) {
      toast.error("Could not resolve coordinates: " + (err as Error).message);
    } finally {
      setResolving(false);
    }
  }, [missing]);

  const applyResolutions = useCallback(async () => {
    if (!resolutions?.length) return;
    setSaving(true);
    let ok = 0;
    try {
      for (const r of resolutions) {
        if (!r.id) continue;
        const patch = resolutionToUpdate(r);
        if (!Object.keys(patch).length) continue;
        const { error } = await supabase.from("microplan_entries").update(patch as any).eq("id", r.id);
        if (!error) ok++;
      }
      toast.success(`Saved coordinates for ${ok} record${ok === 1 ? "" : "s"}`);
      setResolutions(null);
      onRefresh?.();
    } catch (err) {
      toast.error("Save failed: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  }, [resolutions, onRefresh]);

  const o = tree.overall;

  return (
    <div className="space-y-4">
      {/* Overall banner */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Microplan Summary</h3>
              <Badge variant="secondary" className="text-[10px]">LGA → Ward → Health Facility</Badge>
            </div>
            <div className="relative w-[220px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search LGA, ward, facility…" className="pl-8 h-8 text-xs" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {[
              // Placeholder buckets ("Unassigned …") are excluded so these
              // counts match the Planning dashboard KPIs exactly.
              { label: "LGAs", value: n(tree.list.filter((l) => l.agg.name !== "Unassigned LGA").length) },
              { label: "Wards", value: n(tree.list.reduce((s, l) => s + l.wards.filter((w) => w.agg.name !== "Unassigned Ward").length, 0)) },
              { label: "Facilities", value: n(tree.list.reduce((s, l) => s + l.wards.reduce((t, w) => t + w.flhfs.filter((f) => f.name !== "Unassigned Health Facility").length, 0), 0)) },
              { label: "Communities", value: n(o.communities) },
              { label: "Households", value: n(o.households) },
              { label: "Population", value: n(o.population) },
              { label: "Persons w/ Disability", value: n(o.pwd) },
            ].map((k) => (
              <div key={k.label} className="rounded-lg border border-border/50 bg-background/60 p-2">
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{k.label}</p>
                <p className="text-base font-bold tabular-nums text-foreground">{k.value}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {DISABILITY_TYPES.map((d) => (
              <div key={d.key} className="flex items-center gap-1.5 rounded-full border border-border/50 bg-background/70 px-2 py-0.5">
                <d.icon className="h-3 w-3" style={{ color: d.color }} />
                <span className="text-[10px] text-muted-foreground">{d.label}</span>
                <span className="text-[10px] font-bold tabular-nums text-foreground">{n(o.pwdByType[d.key] || 0)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Oversized population watchlist */}
      <LargePopulationFlags entries={rows} />



      {/* Missing coordinates resolver */}
      <Card className="border-amber-500/30">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-bold text-foreground">Missing Coordinates — GRID3 Fuzzy Resolution</h3>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={missing.length ? "destructive" : "secondary"} className="text-[10px]">
                {missing.length} record{missing.length === 1 ? "" : "s"} without GPS
              </Badge>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1" disabled={resolving || !missing.length} onClick={runResolve}>
                {resolving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                {resolving ? `Resolving ${progress}%` : "Resolve from GRID3"}
              </Button>
              {!!resolutions?.length && !readOnly && (
                <Button size="sm" className="h-8 text-xs gap-1" disabled={saving} onClick={applyResolutions}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Apply {resolutions.length}
                </Button>
              )}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Names are matched fuzzily inside the reported LGA → Ward → Health Facility → Community → Settlement scope.
            When no GRID3 name clears the confidence bar, the point is geolocated at the ward centroid so it always falls inside the indicated ward.
          </p>
          {resolving && <Progress value={progress} className="h-1.5" />}
          {!!resolutions?.length && (
            <div className="max-h-[280px] overflow-auto rounded-md border border-border/50">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                  <tr className="text-left">
                    {["LGA", "Ward", "Slot", "Matched GRID3 name", "Method", "Confidence", "Lat", "Lng"].map((h) => (
                      <th key={h} className="px-2 py-1.5 font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(sortedResolutions ?? []).flatMap((r) =>
                    (["flhf", "community", "settlement"] as const)
                      .filter((slot) => r[slot])
                      .map((slot) => {
                        const p = r[slot]!;
                        return (
                          <tr key={`${r.id}-${slot}`} className="border-t border-border/40">
                            <td className="px-2 py-1">{r.lga}</td>
                            <td className="px-2 py-1">{r.ward}</td>
                            <td className="px-2 py-1 capitalize">{slot === "flhf" ? "Health Facility" : slot}</td>
                            <td className="px-2 py-1">{p.matchedName ?? <span className="text-muted-foreground">— ward centroid —</span>}</td>
                            <td className="px-2 py-1 text-muted-foreground">{p.method.replace(/_/g, " ")}</td>
                            <td className="px-2 py-1">
                              <span className={p.confidence >= 0.85 ? "text-emerald-600 font-semibold" : p.confidence > 0 ? "text-amber-600" : "text-muted-foreground"}>
                                {p.confidence > 0 ? `${Math.round(p.confidence * 100)}%` : "estimated"}
                              </span>
                            </td>
                            <td className="px-2 py-1 tabular-nums">{p.latitude.toFixed(5)}</td>
                            <td className="px-2 py-1 tabular-nums">{p.longitude.toFixed(5)}</td>
                          </tr>
                        );
                      }),
                  )}
                </tbody>
              </table>
            </div>
          )}
          {resolutions?.length === 0 && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> No GRID3 candidates found for the missing records in this scope.</p>
          )}
        </CardContent>
      </Card>

      {/* Hierarchical rollup */}
      <div className="space-y-2">
        {tree.list.map((lga) => {
          const isOpen = openLga[lga.agg.name] ?? false;
          const a = lga.agg;
          return (
            <Card key={a.name} className="border-border/50 overflow-hidden">
              <button
                onClick={() => setOpenLga((s) => ({ ...s, [a.name]: !isOpen }))}
                className="w-full text-left p-3 hover:bg-muted/40 transition-colors"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                  <span className="text-sm font-bold text-foreground">{a.name}</span>
                  <Badge variant="outline" className="text-[10px]">{lga.wards.length} wards</Badge>
                  <div className="ml-auto flex flex-wrap gap-1.5">
                    <MetricPill icon={MapPin} label="Communities" value={n(a.communities)} />
                    <MetricPill icon={Home} label="Households" value={n(a.households)} />
                    <MetricPill icon={Users} label="Population" value={n(a.population)} />
                    <MetricPill icon={Users} label="PWD" value={n(a.pwd)} />
                    <MetricPill icon={Compass} label="Geotagged" value={`${pct(a.geotagged, a.communities)}%`} />
                  </div>
                </div>
              </button>

              {isOpen && (
                <CardContent className="p-3 pt-0 space-y-2">
                  {lga.wards.map((ward) => {
                    const wKey = `${a.name}::${ward.agg.name}`;
                    const wOpen = openWard[wKey] ?? false;
                    const w = ward.agg;
                    return (
                      <div key={wKey} className="rounded-lg border border-border/40 bg-muted/20">
                        <button
                          onClick={() => setOpenWard((s) => ({ ...s, [wKey]: !wOpen }))}
                          className="w-full text-left px-3 py-2 hover:bg-muted/40 transition-colors rounded-lg"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${wOpen ? "rotate-90" : ""}`} />
                            <span className="text-xs font-semibold text-foreground">{w.name}</span>
                            <Badge variant="secondary" className="text-[9px]">{ward.flhfs.length} facilities</Badge>
                            <div className="ml-auto flex flex-wrap gap-1.5">
                              <MetricPill icon={MapPin} label="Comm." value={n(w.communities)} />
                              <MetricPill icon={Home} label="HH" value={n(w.households)} />
                              <MetricPill icon={Users} label="Pop." value={n(w.population)} />
                              <MetricPill icon={Users} label="PWD" value={n(w.pwd)} />
                            </div>
                          </div>
                        </button>

                        {wOpen && (
                          <div className="px-3 pb-3 space-y-2">
                            {ward.flhfs.map((f) => (
                              <div key={f.name} className="rounded-md border border-border/40 bg-background p-2.5">
                                <div className="flex items-center gap-2 flex-wrap mb-2">
                                  <Building2 className="h-3.5 w-3.5 text-primary" />
                                  <span className="text-[11px] font-semibold text-foreground">{f.name}</span>
                                  <div className="ml-auto flex flex-wrap gap-1.5">
                                    <MetricPill icon={MapPin} label="Communities" value={n(f.communities)} />
                                    <MetricPill icon={MapPin} label="Settlements" value={n(f.settlements)} />
                                    <MetricPill icon={Home} label="Households" value={n(f.households)} />
                                    <MetricPill icon={Users} label="Population" value={n(f.population)} />
                                  </div>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                                  {[
                                    { l: "Children 0–4", v: f.children04 },
                                    { l: "Children 5–14", v: f.children514 },
                                    { l: "Adults 15+", v: f.adults15 },
                                    { l: "Avg distance to FLHF", v: f.distCount ? `${(f.distSum / f.distCount).toFixed(1)} km` : "—" },
                                  ].map((m) => (
                                    <div key={m.l} className="rounded border border-border/40 px-2 py-1">
                                      <p className="text-[9px] text-muted-foreground">{m.l}</p>
                                      <p className="text-[11px] font-bold tabular-nums text-foreground">{typeof m.v === "number" ? n(m.v) : m.v}</p>
                                    </div>
                                  ))}
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                  {DISABILITY_TYPES.filter((d) => (f.pwdByType[d.key] || 0) > 0).map((d) => (
                                    <div key={d.key} className="flex items-center gap-1 rounded-full border border-border/40 px-1.5 py-0.5">
                                      <d.icon className="h-3 w-3" style={{ color: d.color }} />
                                      <span className="text-[9px] text-muted-foreground">{d.label}</span>
                                      <span className="text-[9px] font-bold tabular-nums text-foreground">{n(f.pwdByType[d.key])}</span>
                                    </div>
                                  ))}
                                  {f.hardToReach > 0 && (
                                    <div className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5">
                                      <AlertTriangle className="h-3 w-3 text-amber-600" />
                                      <span className="text-[9px] text-amber-700 dark:text-amber-500">{f.hardToReach} hard-to-reach</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              )}
            </Card>
          );
        })}
        {tree.list.length === 0 && (
          <Card><CardContent className="p-8 text-center text-xs text-muted-foreground">No data to summarize for the current filters.</CardContent></Card>
        )}
      </div>
    </div>
  );
};

export default MicroplanSummaryView;
