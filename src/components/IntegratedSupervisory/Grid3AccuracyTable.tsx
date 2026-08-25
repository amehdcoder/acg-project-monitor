/**
 * GRID3 Coordinate Accuracy Audit (WHO-standard supervisory register).
 *
 * Every community visit captured by an Independent Monitor / Supervisor is
 * compared against the authoritative GRID3 Nigeria settlement registry:
 *
 *   • the community name is looked up in the registry (exact, then fuzzy),
 *     constrained to the declared State / LGA;
 *   • the registry coordinate is compared with the captured GPS fix using the
 *     Haversine distance, against a CONFIGURABLE supervisory accuracy radius
 *     (5 / 10 / 15 / 25 km) — changing it instantly re-flags the register
 *     without re-running the registry lookups;
 *   • the nearest registry settlement to the captured point is also resolved,
 *     so a wrong-name capture can be named, not just flagged.
 *
 * Every verdict carries audit provenance (matched registry record, match
 * method, lookup timestamp) and drills down to the exact submissions,
 * coordinates, timestamps and evidence attachments behind it.
 *
 * Only NON-CONFORMING records are listed — a clean capture never occupies
 * supervisory attention.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  AlertTriangle, Compass, Download, Loader2, MapPin, RefreshCw, Ruler, Search, ShieldAlert,
  ShieldCheck,
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
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  findGrid3Named, nearestGrid3InWard, grid3WardSettlementCount, warmGrid3Index, norm,
  type NamedGrid3Match, type NearestSettlement,
} from "@/lib/isc/grid3Nearest";

import Grid3MismatchDetailDialog, { type Grid3DrillSpec } from "./Grid3MismatchDetailDialog";
import Grid3SupervisorSummary from "./Grid3SupervisorSummary";

type Row = Record<string, unknown>;

const s = (v: unknown) => String(v ?? "").trim();

const RADIUS_OPTIONS = [5000, 10000, 15000, 25000];
const RADIUS_KEY = "isc.grid3.radiusM";
const REGISTRY_SOURCE = "GRID3 Nigeria settlement registry (/data/grid3_settlements.json)";

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
    label: "Outside accuracy radius",
    note: "The registry settlement of the same name sits further than the supervisory accuracy radius from the captured fix.",
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

/** A resolved capture — radius-independent (lookups run once). */
interface ResolvedRow {
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
  /** ISO timestamp of the registry lookup (audit provenance). */
  lookupAt: string;
  /** All supervisor submissions that produced this capture. */
  sources: Row[];
}

/** A resolved capture classified against the radius currently in force. */
interface AuditRow extends ResolvedRow {
  verdict: Verdict;
  distanceM: number | null;
  method: string;
}

const km = (m: number | null) =>
  m == null ? "—" : m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;

const METHOD_LABEL: Record<string, string> = {
  exact: "Registry name lookup — exact match",
  fuzzy: "Registry name lookup — fuzzy match",
  nearest: "Nearest-neighbour spatial match (no name in registry)",
  none: "No registry candidate found",
};

/** Administrative scope in which the registry name match was found. */
const SCOPE_LABEL: Record<string, string> = {
  ward: "same ward",
  lga: "same LGA",
  state: "same state",
  unscoped: "unscoped",
};

const SCOPE_NOTE: Record<string, string> = {
  ward: "matched inside the declared Ward of the declared LGA and State — no widening",
  lga: "widened to the declared LGA",
  state: "widened to the declared State",
  unscoped: "no administrative labels on the record",
};



type SortKey = "distance" | "community" | "lga" | "monitor" | "date";

const SORTERS: Record<SortKey, (a: AuditRow, b: AuditRow) => number> = {
  distance: (a, b) => (b.distanceM ?? 0) - (a.distanceM ?? 0),
  community: (a, b) => a.community.localeCompare(b.community),
  lga: (a, b) => (a.lga || "~").localeCompare(b.lga || "~") || a.community.localeCompare(b.community),
  monitor: (a, b) => a.monitor.localeCompare(b.monitor) || (b.distanceM ?? 0) - (a.distanceM ?? 0),
  date: (a, b) => (b.date || "").localeCompare(a.date || ""),
};

const SORT_LABEL: Record<SortKey, string> = {
  distance: "Largest separation first",
  community: "Community A → Z",
  lga: "LGA A → Z",
  monitor: "Monitor A → Z",
  date: "Most recent visit first",
};

export default function Grid3AccuracyTable({ parents }: { parents: Row[] }) {
  const [resolved, setResolved] = useState<ResolvedRow[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [running, setRunning] = useState(false);
  const [query, setQuery] = useState("");
  const [verdictFilter, setVerdictFilter] = useState<"all" | Exclude<Verdict, "match">>("all");
  const [nonce, setNonce] = useState(0);
  const [drill, setDrill] = useState<Grid3DrillSpec | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("distance");
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [radiusM, setRadiusM] = useState<number>(() => {
    const stored = Number(localStorage.getItem(RADIUS_KEY));
    return RADIUS_OPTIONS.includes(stored) ? stored : 10000;
  });

  useEffect(() => { warmGrid3Index(); }, []);
  useEffect(() => { localStorage.setItem(RADIUS_KEY, String(radiusM)); }, [radiusM]);

  /* ------------------------------------------------- captures to audit */
  const points = useMemo(() => {
    const byKey = new Map<string, Omit<ResolvedRow, "named" | "nearest" | "lookupAt">>();
    parents.forEach((p, i) => {
      const g = parsePoint(p.GPS ?? p._geolocation);
      if (!g) return;
      const community = s(p.COMMUNITIES) || "Unnamed community";
      const key = `${community.toLowerCase()}|${g.lat.toFixed(4)}|${g.lng.toFixed(4)}`;
      const tagged = { ...p, __lat: g.lat, __lng: g.lng };
      const existing = byKey.get(key);
      if (existing) { existing.sources.push(tagged); return; }
      byKey.set(key, {
        id: s(p._id) || `${i}`,
        community,
        flhf: s(p.FLHF) || "—",
        ward: s(p.Ward),
        lga: s(p.LGA),
        state: s(p.State),
        monitor: s(p.Independent_Monitor_s_Name) || s(p.Name_of_Supervisor) || s(p.Designation) || "Unspecified",
        date: s(p._submission_time).slice(0, 10),
        lat: g.lat, lng: g.lng,
        sources: [tagged],
      });
    });
    return [...byKey.values()];
  }, [parents]);

  /* --------------------------------- registry resolution (radius-free) */
  useEffect(() => {
    let cancelled = false;
    if (!points.length) { setResolved([]); return; }

    (async () => {
      setRunning(true);
      setProgress({ done: 0, total: points.length });
      const out: ResolvedRow[] = [];
      for (let i = 0; i < points.length; i++) {
        if (cancelled) return;
        const p = points[i];
        const named = await findGrid3Named(p.community, p.lat, p.lng, {
          ward: p.ward, lga: p.lga, state: p.state, strict: true, wardOnly: true,
        });
        // Spatial evidence is likewise confined to the declared Ward/LGA/State.
        const nearest = await nearestGrid3InWard(p.lat, p.lng, {
          ward: p.ward, lga: p.lga, state: p.state,
        });
        out.push({ ...p, named, nearest, lookupAt: new Date().toISOString() });
        if (i % 15 === 0) {
          setProgress({ done: i + 1, total: points.length });
          await new Promise((r) => setTimeout(r, 0)); // keep the tab responsive
        }
      }
      if (cancelled) return;
      setResolved(out);
      setProgress({ done: points.length, total: points.length });
      setRunning(false);
    })();

    return () => { cancelled = true; };
  }, [points, nonce]);

  /* --------------------------- classification against the chosen radius */
  const rows: AuditRow[] = useMemo(
    () =>
      resolved.map((r) => {
        const { named, nearest } = r;
        let verdict: Verdict = "match";
        if (!named) verdict = "not_in_registry";
        else if (named.distanceM > radiusM) verdict = "out_of_radius";
        else if (nearest && norm(nearest.settlement) !== norm(r.community) && nearest.distanceM < 1500) {
          verdict = "name_mismatch";
        } else if ((r.ward && norm(named.ward) !== norm(r.ward)) || (r.lga && norm(named.lga) !== norm(r.lga))) {
          verdict = "admin_mismatch";
        }
        return {
          ...r,
          verdict,
          distanceM: named?.distanceM ?? nearest?.distanceM ?? null,
          method: named ? named.how : nearest ? "nearest" : "none",
        };
      }),
    [resolved, radiusM],
  );

  const mismatches = useMemo(() => rows.filter((r) => r.verdict !== "match"), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return mismatches
      .filter((r) => verdictFilter === "all" || r.verdict === verdictFilter)
      .filter((r) => !q || [r.community, r.flhf, r.ward, r.lga, r.state, r.monitor].join(" ").toLowerCase().includes(q))
      .sort(SORTERS[sortKey]);
  }, [mismatches, verdictFilter, query, sortKey]);

  /* ------------------------- server-style pagination + row virtualization */
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const paged = useMemo(
    () => filtered.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [filtered, safePage, pageSize],
  );

  useEffect(() => { setPage(0); scrollRef.current?.scrollTo({ top: 0 }); }, [query, verdictFilter, sortKey, pageSize, radiusM]);

  const virtualizer = useVirtualizer({
    count: paged.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 64,
    overscan: 14,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const padTop = virtualRows.length ? virtualRows[0].start : 0;
  const padBottom = virtualRows.length
    ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
    : 0;

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    mismatches.forEach((r) => { c[r.verdict] = (c[r.verdict] ?? 0) + 1; });
    return c;
  }, [mismatches]);

  const conformity = rows.length ? (rows.length - mismatches.length) / rows.length : 0;

  const openDrill = (r: AuditRow) => {
    const meta = VERDICT_META[r.verdict as Exclude<Verdict, "match">];
    const registry = r.named ?? r.nearest;
    setDrill({
      title: `${r.community} — ${r.ward || "—"}, ${r.lga || "—"}`,
      verdictLabel: meta.label,
      verdictNote: meta.note,
      accent: meta.dot,
      radiusKm: radiusM / 1000,
      distanceM: r.distanceM,
      capture: { lat: r.lat, lng: r.lng, label: r.community },
      provenance: registry
        ? {
            settlement: registry.settlement,
            ward: registry.ward,
            lga: registry.lga,
            state: registry.state,
            lat: registry.lat,
            lng: registry.lng,
            method: METHOD_LABEL[r.method] ?? r.method,
            lookupAt: r.lookupAt,
            source: REGISTRY_SOURCE,
          }
        : null,
      rows: r.sources,
    });
  };

  const exportCsv = () => {
    const head = [
      "Community (Kobo)", "FLHF", "Ward", "LGA", "State", "Independent Monitor / Supervisor",
      "Visit date", "Submissions behind row", "Captured latitude", "Captured longitude",
      "GRID3 settlement (name lookup)", "GRID3 ward", "GRID3 LGA", "GRID3 latitude", "GRID3 longitude",
      "Distance to registry (m)", "Radius in force (m)",
      "Nearest GRID3 settlement to point", "Nearest distance (m)",
      "Match method", "Lookup timestamp", "Registry source", "Verdict", "Interpretation",
    ];
    const lines = filtered.map((r) => [
      r.community, r.flhf, r.ward, r.lga, r.state, r.monitor, r.date, r.sources.length, r.lat, r.lng,
      r.named?.settlement ?? "", r.named?.ward ?? "", r.named?.lga ?? "",
      r.named?.lat ?? "", r.named?.lng ?? "",
      r.named ? Math.round(r.named.distanceM) : "", radiusM,
      r.nearest?.settlement ?? "", r.nearest ? Math.round(r.nearest.distanceM) : "",
      METHOD_LABEL[r.method] ?? r.method, r.lookupAt, REGISTRY_SOURCE,
      VERDICT_META[r.verdict as Exclude<Verdict, "match">].label,
      VERDICT_META[r.verdict as Exclude<Verdict, "match">].note,
    ]);
    const csv = [head, ...lines]
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `grid3-coordinate-accuracy-audit-${radiusM / 1000}km-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
    <Card className="overflow-hidden border-primary/30">
      <CardHeader className="border-b bg-gradient-to-r from-sky-500/10 via-emerald-500/5 to-transparent py-3 px-4">
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <Compass className="h-4 w-4 text-sky-600" />
          GRID3 Coordinate Accuracy Audit — Community vs Registry ({radiusM / 1000} km standard)
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
          Only records that fail the accuracy standard in force or contradict the registry are listed below —
          click any row to open the submissions, timestamps and evidence behind it.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 p-4">
        {/* supervisor-level aggregation */}
        <Grid3SupervisorSummary
          rows={rows.map((r) => ({
            monitor: r.monitor, flhf: r.flhf, ward: r.ward, lga: r.lga,
            state: r.state, date: r.date, verdict: r.verdict,
          }))}
        />

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

          <div className="flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1">
            <Ruler className="h-3.5 w-3.5 text-sky-600" />
            <span className="text-[10.5px] font-medium text-muted-foreground">Accuracy radius</span>
            <Select value={String(radiusM)} onValueChange={(v) => setRadiusM(Number(v))}>
              <SelectTrigger className="h-7 w-[92px] text-[11.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RADIUS_OPTIONS.map((m) => (
                  <SelectItem key={m} value={String(m)}>{m / 1000} km</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="h-8 w-[190px] text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <SelectItem key={k} value={k}>{SORT_LABEL[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
            <SelectTrigger className="h-8 w-[120px] text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[50, 100, 250, 500].map((n) => (
                <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
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
            Every captured coordinate falls inside the {radiusM / 1000} km accuracy radius of its GRID3 registry
            settlement — no exceptions to review at this threshold.
          </div>
        ) : (
          <TooltipProvider delayDuration={200}>
          <div ref={scrollRef} className="max-h-[600px] overflow-auto rounded-xl border border-slate-300 shadow-sm">
            <table className="w-full min-w-[1180px] table-fixed border-collapse text-[11.5px] leading-snug">
              <colgroup>
                <col className="w-[38px]" />
                <col className="w-[150px]" />
                <col className="w-[130px]" />
                <col className="w-[110px]" />
                <col className="w-[110px]" />
                <col className="w-[92px]" />
                <col className="w-[140px]" />
                <col className="w-[118px]" />
                <col className="w-[150px]" />
                <col className="w-[86px]" />
                <col className="w-[150px]" />
                <col className="w-[136px]" />
                <col className="w-[132px]" />
                <col className="w-[86px]" />
              </colgroup>
              <thead className="sticky top-0 z-10">
                <tr className="bg-gradient-to-r from-slate-900 via-slate-800 to-sky-900 text-white">
                  {["#", "Community (captured)", "FLHF", "Ward", "LGA", "State", "Independent Monitor / Supervisor",
                    "Captured GPS", "GRID3 registry match", "Distance", "Nearest registry settlement",
                    "Audit provenance", "Verdict", ""].map((h, hi) => (
                    <th
                      key={h || `sp-${hi}`}
                      className={`border-b border-slate-600/60 px-2.5 py-2.5 align-bottom text-[9.5px] font-semibold uppercase tracking-wide ${
                        hi === 9 ? "text-right" : "text-left"
                      }`}
                    >
                      <span className="block break-words hyphens-auto">{h}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {padTop > 0 && <tr style={{ height: padTop }} />}
                {virtualRows.map((v) => {
                  const r = paged[v.index];
                  const i = safePage * pageSize + v.index;
                  const meta = VERDICT_META[r.verdict as Exclude<Verdict, "match">];
                  return (
                    <tr
                      key={`${r.id}-${i}`}
                      onClick={() => openDrill(r)}
                      className={`cursor-pointer border-t border-slate-200 align-top transition-colors ${i % 2 ? "bg-slate-50/70" : "bg-background"} hover:bg-sky-50`}
                    >
                      <td className="px-2 py-2.5 text-right tabular-nums text-[10.5px] text-muted-foreground">{i + 1}</td>
                      <td className="px-2.5 py-2.5">
                        <span className="flex items-start gap-1.5">
                          <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ background: meta.dot }} />
                          <span className="break-words font-semibold text-slate-900">{r.community}</span>
                        </span>
                        <span className="mt-0.5 block text-[9.5px] text-muted-foreground">
                          {r.date || "—"} · <span className="text-sky-700">{r.sources.length} submission{r.sources.length === 1 ? "" : "s"}</span>
                        </span>
                      </td>
                      <td className="break-words px-2.5 py-2.5 text-slate-700">{r.flhf}</td>
                      <td className="break-words px-2.5 py-2.5 text-slate-700">{r.ward || "—"}</td>
                      <td className="break-words px-2.5 py-2.5 font-medium text-indigo-700">{r.lga || "—"}</td>
                      <td className="break-words px-2.5 py-2.5 text-teal-700">{r.state || "—"}</td>
                      <td className="break-words px-2.5 py-2.5 text-slate-700">{r.monitor}</td>
                      <td className="px-2.5 py-2.5 font-mono text-[10px] text-slate-600">
                        <span className="flex items-start gap-1">
                          <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-rose-500" />
                          <span className="break-all">{r.lat.toFixed(5)},<br />{r.lng.toFixed(5)}</span>
                        </span>
                      </td>
                      <td className="px-2.5 py-2.5">
                        {r.named ? (
                          <>
                            <span className="block break-words font-medium text-slate-900">{r.named.settlement}</span>
                            <span className="mt-0.5 block break-words text-[9.5px] text-muted-foreground">
                              {r.named.ward} · {r.named.lga}
                            </span>
                          </>
                        ) : (
                          <span className="block break-words text-[10.5px] italic text-amber-700">
                            no same-name entry in this Ward / LGA
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <span
                          className={`inline-block rounded-md px-1.5 py-1 text-[10.5px] font-bold tabular-nums ${
                            (r.distanceM ?? 0) > radiusM
                              ? "bg-rose-100 text-rose-700 ring-1 ring-rose-200"
                              : "bg-amber-100 text-amber-800 ring-1 ring-amber-200"
                          }`}
                        >
                          {km(r.distanceM)}
                        </span>
                      </td>
                      <td className="px-2.5 py-2.5">
                        {r.nearest ? (
                          <>
                            <span className="block break-words font-medium text-slate-900">{r.nearest.settlement}</span>
                            <span className="mt-0.5 block break-words text-[9.5px] text-muted-foreground">
                              {km(r.nearest.distanceM)} away · {r.nearest.ward}
                            </span>
                          </>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      {/* audit provenance */}
                      <td className="px-2.5 py-2.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="cursor-help space-y-0.5">
                              <Badge
                                variant="outline"
                                className={`text-[9px] ${
                                  r.method === "exact"
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                    : r.method === "fuzzy"
                                      ? "border-amber-300 bg-amber-50 text-amber-700"
                                      : "border-slate-300 bg-slate-50 text-slate-600"
                                }`}
                              >
                                {r.method === "exact" ? "exact name" : r.method === "fuzzy" ? "fuzzy name" : r.method === "nearest" ? "spatial only" : "no candidate"}
                              </Badge>
                              {r.named && (
                                <Badge
                                  variant="outline"
                                  className={`ml-0.5 text-[9px] ${
                                    r.named.scope === "ward"
                                      ? "border-sky-300 bg-sky-50 text-sky-700"
                                      : r.named.scope === "lga"
                                        ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                                        : "border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700"
                                  }`}
                                >
                                  {SCOPE_LABEL[r.named.scope]}
                                </Badge>
                              )}
                              <span className="block break-all font-mono text-[9.5px] text-muted-foreground">
                                {(r.named ?? r.nearest)
                                  ? `${(r.named ?? r.nearest)!.lat.toFixed(4)}, ${(r.named ?? r.nearest)!.lng.toFixed(4)}`
                                  : "—"}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[300px] text-[11px]">
                            <p className="font-semibold">{METHOD_LABEL[r.method] ?? r.method}</p>
                            {r.named && <p className="mt-1">Scope enforced: {SCOPE_NOTE[r.named.scope]}</p>}
                            <p className="mt-1">Source: {REGISTRY_SOURCE}</p>
                            {(r.named ?? r.nearest) && (
                              <p className="mt-1">
                                Registry record: {(r.named ?? r.nearest)!.settlement} —{" "}
                                {(r.named ?? r.nearest)!.ward}, {(r.named ?? r.nearest)!.lga},{" "}
                                {(r.named ?? r.nearest)!.state}
                              </p>
                            )}
                            <p className="mt-1">Looked up {new Date(r.lookupAt).toLocaleString()}</p>
                            <p className="mt-1">Radius in force: {radiusM / 1000} km</p>
                          </TooltipContent>
                        </Tooltip>
                      </td>
                      <td className="px-2.5 py-2.5">
                        <Badge variant="outline" className={`whitespace-normal text-left text-[9.5px] leading-tight ${meta.cls}`}>
                          {r.verdict === "out_of_radius" ? <ShieldAlert className="mr-1 h-3 w-3 shrink-0" /> : <AlertTriangle className="mr-1 h-3 w-3 shrink-0" />}
                          <span className="break-words">{meta.label}</span>
                        </Badge>
                      </td>
                      <td className="px-1.5 py-2.5 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-[10.5px]"
                          onClick={(e) => { e.stopPropagation(); openDrill(r); }}
                        >
                          Evidence
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {padBottom > 0 && <tr style={{ height: padBottom }} />}
              </tbody>
            </table>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="text-muted-foreground">
              Showing {filtered.length ? safePage * pageSize + 1 : 0}–
              {Math.min(filtered.length, (safePage + 1) * pageSize)} of {filtered.length.toLocaleString()} exceptions
              (page {safePage + 1} of {pageCount}) · rows rendered on demand
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 text-[10.5px]" disabled={safePage === 0}
                onClick={() => { setPage(0); scrollRef.current?.scrollTo({ top: 0 }); }}>First</Button>
              <Button size="sm" variant="outline" className="h-7 text-[10.5px]" disabled={safePage === 0}
                onClick={() => { setPage((p) => Math.max(0, p - 1)); scrollRef.current?.scrollTo({ top: 0 }); }}>Prev</Button>
              <Button size="sm" variant="outline" className="h-7 text-[10.5px]" disabled={safePage >= pageCount - 1}
                onClick={() => { setPage((p) => Math.min(pageCount - 1, p + 1)); scrollRef.current?.scrollTo({ top: 0 }); }}>Next</Button>
              <Button size="sm" variant="outline" className="h-7 text-[10.5px]" disabled={safePage >= pageCount - 1}
                onClick={() => { setPage(pageCount - 1); scrollRef.current?.scrollTo({ top: 0 }); }}>Last</Button>
            </div>
          </div>
          </TooltipProvider>
        )}

        <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-[10.5px] leading-relaxed text-muted-foreground">
          <strong>How to read this register.</strong> Every community is compared <strong>only with GRID3 settlements
          inside the same Ward, of the same LGA and State declared on the checklist</strong> — the search never widens
          to a neighbouring ward, LGA or state, so a same-name settlement elsewhere is never used as the comparison
          point. Distances are great-circle (Haversine) separations between the supervisor's device fix and the GRID3
          registry coordinate. A capture is conforming when a same-name registry settlement in that ward lies within
          {" "}{radiusM / 1000} km of the fix. “Not in GRID3 registry” means no settlement of that name exists in the
          declared ward (a local alias, or an incomplete Ward/LGA on the record); “Name does not match point” means the
          nearest registry settlement in that same ward carries a different name than the one recorded.
        </p>

      </CardContent>
    </Card>
    <Grid3MismatchDetailDialog spec={drill} onClose={() => setDrill(null)} />
    </>
  );
}
