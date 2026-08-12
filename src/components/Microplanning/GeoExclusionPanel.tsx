/**
 * Geography exclusion / archive control.
 *
 * Drop entire LGAs or individual Wards out of a computation. Excluded
 * geographies are archived (never deleted) and can be restored at any time —
 * every KPI, chart, table and export recomputes instantly against the
 * remaining selection.
 */
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Archive, ArchiveRestore, ChevronDown, ChevronRight, EyeOff, Filter, Layers, Redo2, RotateCcw, Search, Undo2,
} from "lucide-react";
import { exKeyLga, exKeyWard, type ExcludedRef } from "@/lib/microplanning/geoExclusions";

export interface ExclusionRow { state?: unknown; lga?: unknown; ward?: unknown; [k: string]: unknown }

interface Props {
  rows: ExclusionRow[];
  /** population accessor used for the impact figures */
  getPop?: (r: ExclusionRow) => number;
  archived: ExcludedRef[];
  keys: Set<string>;
  exclude: (refs: ExcludedRef[]) => void;
  restore: (keys: string[]) => void;
  restoreAll: () => void;
  /** step one exclusion change back */
  undo?: () => void;
  /** step one exclusion change forward */
  redo?: () => void;
  /** clear all exclusions and history — recompute against the full scope */
  reset?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  title?: string;
  subtitle?: string;
  accent?: "sky" | "violet";
  disabled?: boolean;
}

const n0 = (v: number) => Math.round(v || 0).toLocaleString();

export default function GeoExclusionPanel({
  rows, getPop, archived, keys, exclude, restore, restoreAll,
  title = "Include / exclude geographies",
  subtitle = "Drop LGAs or wards from every figure on this page. Excluded geographies are archived and can be restored at any time.",
  accent = "sky",
  disabled,
}: Props) {
  const [openPanel, setOpenPanel] = useState(false);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const pop = getPop ?? ((r: ExclusionRow) => Number((r as any).estimated_total_population) || 0);

  const tree = useMemo(() => {
    const map = new Map<string, { key: string; state: string; lga: string; records: number; population: number; wards: Map<string, { key: string; ward: string; records: number; population: number }> }>();
    for (const r of rows) {
      const state = String(r.state ?? "").trim() || "—";
      const lga = String(r.lga ?? "").trim();
      if (!lga) continue;
      const ward = String(r.ward ?? "").trim() || "—";
      const lk = exKeyLga(state, lga);
      let L = map.get(lk);
      if (!L) { L = { key: lk, state, lga, records: 0, population: 0, wards: new Map() }; map.set(lk, L); }
      L.records++; L.population += pop(r);
      const wk = exKeyWard(state, lga, ward);
      let W = L.wards.get(wk);
      if (!W) { W = { key: wk, ward, records: 0, population: 0 }; L.wards.set(wk, W); }
      W.records++; W.population += pop(r);
    }
    return [...map.values()]
      .sort((a, b) => a.state.localeCompare(b.state) || a.lga.localeCompare(b.lga))
      .map((L) => ({ ...L, wardList: [...L.wards.values()].sort((a, b) => a.ward.localeCompare(b.ward)) }));
  }, [rows, pop]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tree;
    return tree
      .map((L) => {
        const hit = `${L.state} ${L.lga}`.toLowerCase().includes(q);
        const wardList = hit ? L.wardList : L.wardList.filter((w) => w.ward.toLowerCase().includes(q));
        return wardList.length || hit ? { ...L, wardList } : null;
      })
      .filter(Boolean) as typeof tree;
  }, [tree, search]);

  const impact = useMemo(() => {
    let records = 0, population = 0;
    for (const a of archived) { records += a.records; population += a.population; }
    return { records, population };
  }, [archived]);

  const now = () => new Date().toISOString();

  const toggleLga = (L: typeof tree[number]) => {
    if (keys.has(L.key)) { restore([L.key, ...L.wardList.map((w) => w.key)]); return; }
    exclude([{ key: L.key, level: "LGA", state: L.state, lga: L.lga, records: L.records, population: L.population, archivedAt: now() }]);
  };

  const toggleWard = (L: typeof tree[number], w: typeof tree[number]["wardList"][number]) => {
    if (keys.has(w.key)) { restore([w.key]); return; }
    exclude([{ key: w.key, level: "Ward", state: L.state, lga: L.lga, ward: w.ward, records: w.records, population: w.population, archivedAt: now() }]);
  };

  const head = accent === "violet"
    ? "from-violet-700 via-fuchsia-600 to-rose-500"
    : "from-indigo-700 via-sky-600 to-teal-500";

  return (
    <Card className="border-border/60 overflow-hidden">
      <div className={`bg-gradient-to-r ${head} px-4 py-2.5 text-white`}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="rounded-lg bg-white/20 p-2 shrink-0"><Filter className="h-4 w-4" /></div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold leading-tight flex items-center gap-2">
                {title}
                {archived.length > 0 && (
                  <Badge className="bg-white text-rose-700 hover:bg-white text-[10px] border-0">
                    {archived.length} archived
                  </Badge>
                )}
              </h3>
              <p className="text-[11px] text-white/85 max-w-2xl">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {archived.length > 0 && (
              <Button size="sm" variant="ghost" disabled={disabled} onClick={restoreAll}
                className="h-8 text-[11px] gap-1 text-white hover:bg-white/20">
                <RotateCcw className="h-3.5 w-3.5" /> Restore all
              </Button>
            )}
            <Button size="sm" onClick={() => setOpenPanel((o) => !o)}
              className="h-8 gap-1.5 bg-white/95 text-indigo-800 hover:bg-white font-semibold">
              <Layers className="h-3.5 w-3.5" /> {openPanel ? "Hide selection" : "Manage selection"}
            </Button>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { l: "LGAs in view", v: n0(tree.filter((L) => !keys.has(L.key)).length) },
            { l: "LGAs / wards archived", v: n0(archived.length) },
            { l: "Records excluded", v: n0(impact.records) },
            { l: "Population excluded", v: n0(impact.population) },
          ].map((k) => (
            <div key={k.l} className="rounded-lg bg-white/15 px-2.5 py-1.5">
              <p className="text-[9px] uppercase tracking-wide text-white/80">{k.l}</p>
              <p className="text-sm font-bold tabular-nums">{k.v}</p>
            </div>
          ))}
        </div>
      </div>

      {archived.length > 0 && (
        <div className="px-3 py-2 bg-rose-50 dark:bg-rose-950/25 border-b border-rose-200 dark:border-rose-900">
          <div className="flex items-start gap-2 flex-wrap">
            <Archive className="h-3.5 w-3.5 text-rose-600 mt-1 shrink-0" />
            <span className="text-[10px] font-bold uppercase tracking-wide text-rose-700 dark:text-rose-300 mt-0.5">Archive</span>
            {archived.map((a) => (
              <button key={a.key} disabled={disabled} onClick={() => restore([a.key])}
                className="group flex items-center gap-1 rounded-full bg-white dark:bg-background border border-rose-300 dark:border-rose-800 px-2 py-0.5 text-[10.5px] text-rose-800 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-colors">
                <EyeOff className="h-3 w-3" />
                <span className="font-semibold">{a.level === "Ward" ? `${a.lga} → ${a.ward}` : a.lga}</span>
                <span className="text-rose-500">· {n0(a.records)} rec</span>
                <ArchiveRestore className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            ))}
            <span className="text-[10px] text-rose-600/80 dark:text-rose-400/80 mt-0.5">Click a chip to restore it.</span>
          </div>
        </div>
      )}

      {openPanel && (
        <div className="p-3 space-y-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search LGA or ward…" className="h-8 pl-8 text-xs" />
          </div>
          <ScrollArea className="h-[320px] rounded-lg border border-border/60">
            <div className="divide-y divide-border/50">
              {visible.map((L) => {
                const isOpen = open[L.key] ?? false;
                const off = keys.has(L.key);
                return (
                  <div key={L.key} className={off ? "bg-rose-50/70 dark:bg-rose-950/20" : ""}>
                    <div className="flex items-center gap-2 px-2.5 py-1.5">
                      <button onClick={() => setOpen((p) => ({ ...p, [L.key]: !isOpen }))} className="text-muted-foreground">
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={`text-xs font-semibold truncate ${off ? "line-through text-rose-700 dark:text-rose-300" : ""}`}>{L.lga}</p>
                        <p className="text-[10px] text-muted-foreground">{L.state} · {n0(L.wardList.length)} wards · {n0(L.records)} records · {n0(L.population)} pop</p>
                      </div>
                      <Button size="sm" variant={off ? "outline" : "ghost"} disabled={disabled} onClick={() => toggleLga(L)}
                        className={`h-7 text-[10.5px] gap-1 ${off ? "text-emerald-700 border-emerald-300" : "text-rose-600 hover:text-rose-700 hover:bg-rose-50"}`}>
                        {off ? <><Undo2 className="h-3 w-3" /> Restore</> : <><EyeOff className="h-3 w-3" /> Exclude LGA</>}
                      </Button>
                    </div>
                    {isOpen && (
                      <div className="pl-9 pr-2.5 pb-1.5 space-y-0.5">
                        {L.wardList.map((w) => {
                          const woff = off || keys.has(w.key);
                          return (
                            <div key={w.key} className="flex items-center gap-2">
                              <div className="min-w-0 flex-1">
                                <p className={`text-[11px] truncate ${woff ? "line-through text-rose-600/80" : ""}`}>{w.ward}</p>
                                <p className="text-[9.5px] text-muted-foreground">{n0(w.records)} records · {n0(w.population)} pop</p>
                              </div>
                              <Button size="sm" variant="ghost" disabled={disabled || off} onClick={() => toggleWard(L, w)}
                                className={`h-6 text-[10px] gap-1 ${keys.has(w.key) ? "text-emerald-700" : "text-rose-600"}`}>
                                {keys.has(w.key) ? <><Undo2 className="h-3 w-3" /> Restore</> : <><EyeOff className="h-3 w-3" /> Exclude</>}
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {visible.length === 0 && (
                <p className="text-center text-[11px] text-muted-foreground py-8">No geography matches “{search}”.</p>
              )}
            </div>
          </ScrollArea>
          <p className="text-[10px] text-muted-foreground">
            Excluding an LGA also archives all of its wards. Nothing is deleted — restoring puts every record straight back into the figures.
          </p>
        </div>
      )}
    </Card>
  );
}
