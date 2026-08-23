/**
 * GRID3 Coordinate Accuracy Audit (WHO-standard supervisory register).
 *
 * Every community visit captured by an Independent Monitor / Supervisor is
 * compared against the authoritative GRID3 Nigeria settlement registry:
 *
 *   • the community name is looked up in the registry (exact, then fuzzy),
 *     constrained to the declared State / LGA;
 *   • the registry coordinate is compared with the captured GPS fix using the
 *     Haversine distance, against a 10 km supervisory accuracy radius;
 *   • the nearest registry settlement to the captured point is also resolved,
 *     so a wrong-name capture can be named, not just flagged.
 *
 * Only NON-CONFORMING records are listed — a clean capture never occupies
 * supervisory attention.
 */
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Compass, Download, Loader2, MapPin, RefreshCw, Search, ShieldAlert, ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  findGrid3Named, nearestGrid3Settlement, warmGrid3Index, norm,
  type NamedGrid3Match, type NearestSettlement,
} from "@/lib/isc/grid3Nearest";

type Row = Record<string, unknown>;

const s = (v: unknown) => String(v ?? "").trim();
const RADIUS_M = 10000;

function parsePoint(v: unknown): { lat: number; lng: number } | null {
  if (!v) return null;
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const lat = Number(o.lat ?? (o as any).latitude);
    const lng = Number((o as any).long ?? (o as any).lon ?? (o as any).longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
  const p = s(v).split(/[\s,]+/).map(Number);
  if (p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return null;
  if (p[0] === 0 && p[1] === 0) return null;
  return { lat: p[0], lng: p[1] };
}

type Verdict = "out_of_radius" | "name_mismatch" | "not_in_registry" | "admin_mismatch" | "match";

const VERDICT_META: Record<Exclude<Verdict, "match">, { label: string; note: string; cls: string; dot: string }> = {
  out_of_radius: {
    label: "Outside 10 km radius",
    note: "The registry settlement of the same name sits further than the 10 km supervisory accuracy radius from the captured fix.",
    cls: "bg-rose-50 text-rose-700 border-rose-300",
    dot: "#E11D48",
  },
  not_in_registry: {
    label: "Not in GRID3 registry",
    note: "No settlement carrying this community name exists in the GRID3 registry for the declared State / LGA.",
    cls: "bg-amber-50 text-amber-700 border-amber-300",
    dot: "#F59E0B",
  },
  name_mismatch: {
    label: "Name does not match point",
    note: "The nearest GRID3 settlement to the captured coordinate carries a different name.",
    cls: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-300",
    dot: "#C026D3",
  },
  admin_mismatch: {
    label: "Ward / LGA disagreement",
    note: "The registry places this coordinate in a different Ward or LGA than the one declared on the checklist.",
    cls: "bg-indigo-50 text-indigo-700 border-indigo-300",
    dot: "#4F46E5",
  },
};

interface AuditRow {
  id: string;
  community: string;
  flhf: string;
  ward: string;
  lga: string;
  state: string;
  monitor: string;
  date: string;
  lat: number;
  lng: number;
  named: NamedGrid3Match | null;
  nearest: NearestSettlement | null;
  verdict: Verdict;
  distanceM: number | null;
}

const km = (m: number | null) => (m == null ? "—" : m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`);

export default function Grid3AccuracyTable({ parents }: { parents: Row[] }) {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [running, setRunning] = useState(false);
  const [query, setQuery] = useState("");
  const [verdictFilter, setVerdictFilter] = useState<"all" | Exclude<Verdict, "match">>("all");
  const [nonce, setNonce] = useState(0);

  useEffect(() => { warmGrid3Index(); }, []);

  const points = useMemo(() => {
    const out: Omit<AuditRow, "named" | "nearest" | "verdict" | "distanceM">[] = [];
    const seen = new Set<string>();
    parents.forEach((p, i) => {
      const g = parsePoint(p.GPS ?? p._geolocation);
      if (!g) return;
      const community = s(p.COMMUNITIES) || "Unnamed community";
      const key = `${community.toLowerCase()}|${g.lat.toFixed(4)}|${g.lng.toFixed(4)}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        id: s(p._id) || `${i}`,
        community,
        flhf: s(p.FLHF) || "—",
        ward: s(p.Ward),
        lga: s(p.LGA),
        state: s(p.State),
        monitor: s(p.Independent_Monitor_s_Name) || s(p.Name_of_Supervisor) || s(p.Designation) || "Unspecified",
        date: s(p._submission_time).slice(0, 10),
        lat: g.lat, lng: g.lng,
      });
    });
    return out;
  }, [parents]);

  /* ------------------------------------------------------------- the audit */
  useEffect(() => {
    let cancelled = false;
    if (!points.length) { setRows([]); return; }

    (async () => {
      setRunning(true);
      setProgress({ done: 0, total: points.length });
      const out: AuditRow[] = [];
      for (let i = 0; i < points.length; i++) {
        if (cancelled) return;
        const p = points[i];
        const named = await findGrid3Named(p.community, p.lat, p.lng, { lga: p.lga, state: p.state });
        const nearest = await nearestGrid3Settlement(p.lat, p.lng, 25000);

        let verdict: Verdict = "match";
        if (!named) verdict = "not_in_registry";
        else if (named.distanceM > RADIUS_M) verdict = "out_of_radius";
        else if (nearest && norm(nearest.settlement) !== norm(p.community) && nearest.distanceM < 1500) {
          verdict = "name_mismatch";
        } else if (
          named &&
          ((p.ward && norm(named.ward) !== norm(p.ward)) || (p.lga && norm(named.lga) !== norm(p.lga)))
        ) {
          verdict = "admin_mismatch";
        }

        out.push({ ...p, named, nearest, verdict, distanceM: named?.distanceM ?? nearest?.distanceM ?? null });
        if (i % 15 === 0) {
          setProgress({ done: i + 1, total: points.length });
          await new Promise((r) => setTimeout(r, 0)); // keep the tab responsive
        }
      }
      if (cancelled) return;
      setRows(out);
      setProgress({ done: points.length, total: points.length });
      setRunning(false);
    })();

    return () => { cancelled = true; };
  }, [points, nonce]);

  const mismatches = useMemo(() => rows.filter((r) => r.verdict !== "match"), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mismatches
      .filter((r) => verdictFilter === "all" || r.verdict === verdictFilter)
      .filter((r) => !q || [r.community, r.flhf, r.ward, r.lga, r.state, r.monitor].join(" ").toLowerCase().includes(q))
      .sort((a, b) => (b.distanceM ?? 0) - (a.distanceM ?? 0));
  }, [mismatches, verdictFilter, query]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    mismatches.forEach((r) => { c[r.verdict] = (c[r.verdict] ?? 0) + 1; });
    return c;
  }, [mismatches]);

  const conformity = rows.length ? (rows.length - mismatches.length) / rows.length : 0;

  const exportCsv = () => {
    const head = [
      "Community (Kobo)", "FLHF", "Ward", "LGA", "State", "Independent Monitor / Supervisor",
      "Visit date", "Captured latitude", "Captured longitude",
      "GRID3 settlement (name lookup)", "GRID3 ward", "GRID3 LGA",
      "Distance to registry (m)", "Nearest GRID3 settlement to point", "Nearest distance (m)",
      "Verdict", "Interpretation",
    ];
    const lines = filtered.map((r) => [
      r.community, r.flhf, r.ward, r.lga, r.state, r.monitor, r.date, r.lat, r.lng,
      r.named?.settlement ?? "", r.named?.ward ?? "", r.named?.lga ?? "",
      r.named ? Math.round(r.named.distanceM) : "",
      r.nearest?.settlement ?? "", r.nearest ? Math.round(r.nearest.distanceM) : "",
      VERDICT_META[r.verdict as Exclude<Verdict, "match">].label,
      VERDICT_META[r.verdict as Exclude<Verdict, "match">].note,
    ]);
    const csv = [head, ...lines]
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `grid3-coordinate-accuracy-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="overflow-hidden border-primary/30">
      <CardHeader className="border-b bg-gradient-to-r from-sky-500/10 via-emerald-500/5 to-transparent py-3 px-4">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <Compass className="h-4 w-4 text-sky-600" />
          GRID3 Coordinate Accuracy Audit — Community vs Registry (10 km standard)
          <Badge variant="outline" className="text-[10px] font-normal">
            {rows.length.toLocaleString()} georeferenced visits
          </Badge>
          <Badge className="border-emerald-300 bg-emerald-50 text-[10px] font-medium text-emerald-700">
            {Math.round(conformity * 100)}% conform
          </Badge>
          <Badge className="border-rose-300 bg-rose-50 text-[10px] font-medium text-rose-700">
            {mismatches.length.toLocaleString()} non-conforming
          </Badge>
        </CardTitle>
        <CardDescription className="text-[11px]">
          Every supervisor-captured coordinate is matched to the GRID3 Nigeria settlement registry.
          Only records that fail the 10 km accuracy standard or contradict the registry are listed below.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 p-4">
        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {(Object.keys(VERDICT_META) as Exclude<Verdict, "match">[]).map((k) => (
            <button
              key={k}
              onClick={() => setVerdictFilter(verdictFilter === k ? "all" : k)}
              className={`rounded-lg border p-2.5 text-left transition ${VERDICT_META[k].cls} ${verdictFilter === k ? "ring-2 ring-offset-1" : "opacity-90 hover:opacity-100"}`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide">{VERDICT_META[k].label}</p>
              <p className="text-xl font-bold leading-tight">{counts[k] ?? 0}</p>
            </button>
          ))}
        </div>

        {/* toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search community, FLHF, ward, LGA or monitor…"
              className="h-8 pl-7 text-[12px]"
            />
          </div>
          <Select value={verdictFilter} onValueChange={(v) => setVerdictFilter(v as typeof verdictFilter)}>
            <SelectTrigger className="h-8 w-[210px] text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All non-conforming records</SelectItem>
              {(Object.keys(VERDICT_META) as Exclude<Verdict, "match">[]).map((k) => (
                <SelectItem key={k} value={k}>{VERDICT_META[k].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="mr-1 h-3.5 w-3.5" /> Export audit
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-[11px]" onClick={() => setNonce((n) => n + 1)} disabled={running}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} /> Re-audit
          </Button>
        </div>

        {running && (
          <div className="space-y-1">
            <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} className="h-1.5" />
            <p className="text-[10px] text-muted-foreground">
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
              Matching {progress.done.toLocaleString()} / {progress.total.toLocaleString()} coordinates against the GRID3 registry…
            </p>
          </div>
        )}

        {/* table */}
        {!running && !mismatches.length ? (
          <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-[12px] text-emerald-800">
            <ShieldCheck className="h-4 w-4" />
            Every captured coordinate falls inside the 10 km accuracy radius of its GRID3 registry settlement — no exceptions to review.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[1080px] border-collapse text-[11.5px]">
              <thead>
                <tr className="bg-gradient-to-r from-slate-800 to-slate-700 text-white">
                  {["#", "Community (captured)", "FLHF", "Ward", "LGA", "State", "Independent Monitor / Supervisor",
                    "Captured GPS", "GRID3 registry match", "Distance", "Nearest registry settlement", "Verdict"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2.5 py-2 text-left font-semibold uppercase tracking-wide text-[10px]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => {
                  const meta = VERDICT_META[r.verdict as Exclude<Verdict, "match">];
                  return (
                    <tr
                      key={`${r.id}-${i}`}
                      className={`border-t transition-colors ${i % 2 ? "bg-muted/30" : "bg-background"} hover:bg-sky-50/70`}
                    >
                      <td className="px-2.5 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-2.5 py-2 font-semibold text-slate-900">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full" style={{ background: meta.dot }} />
                          {r.community}
                        </span>
                        {r.date && <span className="ml-1 text-[10px] text-muted-foreground">· {r.date}</span>}
                      </td>
                      <td className="px-2.5 py-2">{r.flhf}</td>
                      <td className="px-2.5 py-2">{r.ward || "—"}</td>
                      <td className="px-2.5 py-2 font-medium text-indigo-700">{r.lga || "—"}</td>
                      <td className="px-2.5 py-2 text-teal-700">{r.state || "—"}</td>
                      <td className="px-2.5 py-2">{r.monitor}</td>
                      <td className="whitespace-nowrap px-2.5 py-2 font-mono text-[10.5px] text-slate-600">
                        <MapPin className="mr-0.5 inline h-3 w-3 text-rose-500" />
                        {r.lat.toFixed(5)}, {r.lng.toFixed(5)}
                      </td>
                      <td className="px-2.5 py-2">
                        {r.named ? (
                          <>
                            <span className="font-medium">{r.named.settlement}</span>
                            <span className="block text-[10px] text-muted-foreground">
                              {r.named.ward} · {r.named.lga} ({r.named.how})
                            </span>
                          </>
                        ) : (
                          <span className="text-[10.5px] italic text-amber-700">no registry entry</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2">
                        <span
                          className={`rounded px-1.5 py-0.5 font-semibold ${
                            (r.distanceM ?? 0) > RADIUS_M ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {km(r.distanceM)}
                        </span>
                      </td>
                      <td className="px-2.5 py-2">
                        {r.nearest ? (
                          <>
                            <span className="font-medium">{r.nearest.settlement}</span>
                            <span className="block text-[10px] text-muted-foreground">
                              {km(r.nearest.distanceM)} away · {r.nearest.ward}
                            </span>
                          </>
                        ) : "—"}
                      </td>
                      <td className="px-2.5 py-2">
                        <Badge variant="outline" className={`text-[10px] ${meta.cls}`}>
                          {r.verdict === "out_of_radius" ? <ShieldAlert className="mr-1 h-3 w-3" /> : <AlertTriangle className="mr-1 h-3 w-3" />}
                          {meta.label}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-[10.5px] leading-relaxed text-muted-foreground">
          <strong>How to read this register.</strong> Distances are great-circle (Haversine) separations between the
          supervisor's device fix and the GRID3 Nigeria settlement registry coordinate. A capture is conforming when a
          registry settlement of the same name lies within {RADIUS_M / 1000} km of the fix and the registry agrees on
          the Ward and LGA. “Not in GRID3 registry” usually signals a locally-used community alias; “Name does not match
          point” signals the monitor stood in a different settlement than the one recorded.
        </p>
      </CardContent>
    </Card>
  );
}
