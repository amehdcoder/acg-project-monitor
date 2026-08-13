import { Fragment, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Database, Download, ChevronRight, ChevronDown, Search, Users, Home,
  Building2, MapPin, Accessibility, Route, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  buildProjectAggregates, exportProjectDataWorkbook, type AggRow,
} from "@/lib/microplanning/projectDataExcel";

interface Props {
  entries: any[];
  projectName?: string;
  scopeLabel?: string;
  campaignLabel?: string;
  exclusions?: { level: "LGA" | "Ward"; state: string; lga: string; ward?: string }[];
}

const n = (v: number) => Math.round(v).toLocaleString();

const KPIS = [
  { key: "records", label: "Records", icon: Database, tone: "from-sky-500 to-sky-600" },
  { key: "wards", label: "Wards", icon: MapPin, tone: "from-indigo-500 to-indigo-600" },
  { key: "flhfs", label: "Facilities", icon: Building2, tone: "from-violet-500 to-violet-600" },
  { key: "communities", label: "Communities", icon: Home, tone: "from-emerald-500 to-emerald-600" },
  { key: "settlements", label: "Settlements", icon: MapPin, tone: "from-teal-500 to-teal-600" },
  { key: "households", label: "Households", icon: Home, tone: "from-amber-500 to-amber-600" },
  { key: "population", label: "Population", icon: Users, tone: "from-rose-500 to-rose-600" },
  { key: "pwd", label: "PWD", icon: Accessibility, tone: "from-fuchsia-500 to-fuchsia-600" },
] as const;

/**
 * Colourful WHO/NTD-standard project data table for the Geo Microplanning
 * dashboard: LGA rollups that expand into wards, with a one-click complete
 * project data export (multi-sheet, print-ready workbook).
 */
const ProjectDataTable = ({ entries, projectName = "All projects", scopeLabel = "All data", campaignLabel, exclusions }: Props) => {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const { lgas, wards, totals } = useMemo(() => buildProjectAggregates(entries || []), [entries]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return lgas;
    return lgas.filter((r) => `${r.state} ${r.lga}`.toLowerCase().includes(s));
  }, [lgas, q]);

  const wardsOf = (lga: AggRow) => wards.filter((w) => w.key.startsWith(`${lga.key}||`));

  const maxPop = Math.max(1, ...lgas.map((r) => r.population));

  const download = async () => {
    setBusy(true);
    try {
      const file = await exportProjectDataWorkbook(entries || [], {
        project: projectName,
        scope: scopeLabel,
        campaign: campaignLabel,
        exclusions,
      });
      toast.success(`Exported ${file}`);
    } catch (err) {
      toast.error("Export failed: " + (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="overflow-hidden border-primary/25">
      <div className="bg-gradient-to-r from-[hsl(207,100%,18%)] via-[hsl(199,100%,32%)] to-[hsl(190,80%,42%)] px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Database className="h-4 w-4" /> Complete Project Data
            </h3>
            <p className="text-[11px] text-white/80 truncate">
              {projectName} · {scopeLabel} · WHO / Nigeria NTD Programme standard
            </p>
          </div>
          <Button size="sm" onClick={download} disabled={busy || !entries?.length}
            className="h-8 gap-1.5 bg-white text-[hsl(207,100%,18%)] hover:bg-white/90">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export complete data (Excel)
          </Button>
        </div>
      </div>

      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {KPIS.map((k) => (
            <div key={k.key} className={`rounded-lg bg-gradient-to-br ${k.tone} p-2 text-white shadow-sm`}>
              <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-90">
                <k.icon className="h-3 w-3" /> {k.label}
              </div>
              <div className="text-base font-bold tabular-nums leading-tight">{n((totals as any)[k.key])}</div>
            </div>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search state or LGA..." className="pl-8 h-8 text-xs" />
        </div>

        <div className="max-h-[520px] overflow-auto rounded-lg border border-border/60">
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 z-10 bg-[hsl(207,100%,18%)] text-white">
              <tr className="text-left">
                <th className="px-2.5 py-2 font-semibold">State / LGA</th>
                <th className="px-2.5 py-2 font-semibold text-right">Records</th>
                <th className="px-2.5 py-2 font-semibold text-right">Wards</th>
                <th className="px-2.5 py-2 font-semibold text-right">FLHF</th>
                <th className="px-2.5 py-2 font-semibold text-right">Communities</th>
                <th className="px-2.5 py-2 font-semibold text-right">Settlements</th>
                <th className="px-2.5 py-2 font-semibold text-right">Households</th>
                <th className="px-2.5 py-2 font-semibold">Population</th>
                <th className="px-2.5 py-2 font-semibold text-right">0–4</th>
                <th className="px-2.5 py-2 font-semibold text-right">5–14</th>
                <th className="px-2.5 py-2 font-semibold text-right">15+</th>
                <th className="px-2.5 py-2 font-semibold text-right">PWD</th>
                <th className="px-2.5 py-2 font-semibold text-right">Avg km</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isOpen = !!open[r.key];
                const kids = isOpen ? wardsOf(r) : [];
                return (
                  <Fragment key={r.key}>
                    <tr className="border-t border-border/50 bg-sky-50/60 dark:bg-sky-950/20 hover:bg-sky-100/70 dark:hover:bg-sky-900/30 cursor-pointer"
                      onClick={() => setOpen((s) => ({ ...s, [r.key]: !s[r.key] }))}>
                      <td className="px-2.5 py-1.5">
                        <span className="inline-flex items-center gap-1 font-semibold text-foreground">
                          {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-primary" /> : <ChevronRight className="h-3.5 w-3.5 text-primary" />}
                          {r.lga || "—"}
                          <Badge variant="secondary" className="text-[9px] uppercase">{r.state}</Badge>
                        </span>
                      </td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">{n(r.records)}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">{n(r.wards)}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">{n(r.flhfs)}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">{n(r.communities)}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">{n(r.settlements)}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">{n(r.households)}</td>
                      <td className="px-2.5 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="tabular-nums font-semibold w-14 text-right">{n(r.population)}</span>
                          <span className="h-1.5 flex-1 min-w-[36px] rounded-full bg-muted overflow-hidden">
                            <span className="block h-full rounded-full bg-gradient-to-r from-sky-500 to-emerald-500"
                              style={{ width: `${Math.round((r.population / maxPop) * 100)}%` }} />
                          </span>
                        </div>
                      </td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">{n(r.age0_4)}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">{n(r.age5_14)}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">{n(r.age15p)}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums text-fuchsia-600 font-semibold">{n(r.pwd)}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">
                        {r.avgDistanceKm == null ? "—" : r.avgDistanceKm.toFixed(1)}
                      </td>
                    </tr>
                    {kids.map((w) => (
                      <tr key={w.key} className="border-t border-border/30 hover:bg-muted/40">
                        <td className="px-2.5 py-1.5 pl-8">
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <Route className="h-3 w-3 text-emerald-600" /> {w.ward || "—"}
                          </span>
                        </td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{n(w.records)}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">—</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{n(w.flhfs)}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{n(w.communities)}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{n(w.settlements)}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{n(w.households)}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{n(w.population)}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{n(w.age0_4)}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{n(w.age5_14)}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{n(w.age15p)}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">{n(w.pwd)}</td>
                        <td className="px-2.5 py-1.5 text-right tabular-nums">
                          {w.avgDistanceKm == null ? "—" : w.avgDistanceKm.toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              {!filtered.length && (
                <tr><td colSpan={13} className="px-2.5 py-6 text-center text-muted-foreground">No records in the current scope</td></tr>
              )}
            </tbody>
            {!!filtered.length && (
              <tfoot className="sticky bottom-0 bg-[hsl(207,100%,18%)] text-white">
                <tr>
                  <td className="px-2.5 py-2 font-bold">TOTAL</td>
                  <td className="px-2.5 py-2 text-right font-bold tabular-nums">{n(totals.records)}</td>
                  <td className="px-2.5 py-2 text-right font-bold tabular-nums">{n(totals.wards)}</td>
                  <td className="px-2.5 py-2 text-right font-bold tabular-nums">{n(totals.flhfs)}</td>
                  <td className="px-2.5 py-2 text-right font-bold tabular-nums">{n(totals.communities)}</td>
                  <td className="px-2.5 py-2 text-right font-bold tabular-nums">{n(totals.settlements)}</td>
                  <td className="px-2.5 py-2 text-right font-bold tabular-nums">{n(totals.households)}</td>
                  <td className="px-2.5 py-2 text-right font-bold tabular-nums">{n(totals.population)}</td>
                  <td className="px-2.5 py-2 text-right font-bold tabular-nums">{n(totals.age0_4)}</td>
                  <td className="px-2.5 py-2 text-right font-bold tabular-nums">{n(totals.age5_14)}</td>
                  <td className="px-2.5 py-2 text-right font-bold tabular-nums">{n(totals.age15p)}</td>
                  <td className="px-2.5 py-2 text-right font-bold tabular-nums">{n(totals.pwd)}</td>
                  <td className="px-2.5 py-2" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <p className="text-[10px] text-muted-foreground">
          Click any LGA to expand its wards. The workbook contains Cover &amp; Method, LGA Summary, Ward Summary,
          Age &amp; Disability, the Complete Register and Data Quality checks — all colour-coded to WHO presentation
          standards and aligned with Nigeria NTD Programme microplanning norms.
        </p>
      </CardContent>
    </Card>
  );
};

export default ProjectDataTable;
