import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Users, Accessibility, Home, Settings2, Save, Download, Filter } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { pwdTotalFor } from "@/lib/microplanning/disabilityTypes";

export const COMMUNITY_POP_FLAG = 30000;
export const SETTLEMENT_POP_FLAG = 10000;
export const PWD_FLAG = 50;
export const HOUSEHOLD_FLAG = 2000;

/** Standard demographic split applied when an estimated total population is corrected. */
export const AGE_SPLIT = { children_0_4: 0.2, children_5_14: 0.28, adults_15_plus: 0.52 };

const SETTINGS_KEY = "microplan-flag-thresholds";
type HhRule = "greater" | "greater_equal" | "off";
interface Thresholds {
  householdFlag: number;
  hhRule: HhRule;
}
const DEFAULTS: Thresholds = { householdFlag: HOUSEHOLD_FLAG, hhRule: "greater" };

const readSettings = (): Thresholds => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw);
    return {
      householdFlag: Number(p.householdFlag) > 0 ? Number(p.householdFlag) : DEFAULTS.householdFlag,
      hhRule: ["greater", "greater_equal", "off"].includes(p.hhRule) ? p.hhRule : DEFAULTS.hhRule,
    };
  } catch {
    return DEFAULTS;
  }
};

interface Props {
  entries: Record<string, any>[];
  readOnly?: boolean;
  onRefresh?: () => void;
}

type Kind = "Community" | "Settlement" | "PWD" | "Households" | "HH > Pop";

type FlagRow = {
  id: string;
  recordId: string;
  kind: Kind;
  name: string;
  state: string;
  lga: string;
  ward: string;
  flhf: string;
  population: number;
  pwd: number;
  households: number;
  threshold: number;
  reason: string;
  household: boolean;
  risk: number;
};

/**
 * Oversized-population watchlist with in-place correction of estimated population
 * (auto age-disaggregated 20 / 28 / 52 %) and household counts.
 */
const LargePopulationFlags = ({ entries, readOnly = false, onRefresh }: Props) => {
  const [settings, setSettings] = useState<Thresholds>(readSettings);
  const [hhOnly, setHhOnly] = useState(false);
  const [sortDesc, setSortDesc] = useState<boolean | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { pop?: string; hh?: string }>>({});
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);

  const rows = useMemo<FlagRow[]>(() => {
    const out: FlagRow[] = [];
    for (const e of entries) {
      const pop = Number(e.estimated_total_population) || 0;
      const pwd = pwdTotalFor(e);
      const hh = Number(e.number_of_households) || 0;
      const base = {
        recordId: String(e.id),
        state: e.state || "—",
        lga: e.lga || "—",
        ward: e.ward || "—",
        flhf: e.flhf_name || "—",
        population: pop,
        pwd,
        households: hh,
      };
      const name = e.settlement_name || e.community_name || "—";
      if (pop) {
        if (e.settlement_name && pop >= SETTLEMENT_POP_FLAG) {
          out.push({ id: `${e.id}-s`, kind: "Settlement", name: e.settlement_name, threshold: SETTLEMENT_POP_FLAG, reason: `Settlement population ≥ ${SETTLEMENT_POP_FLAG.toLocaleString()}`, household: false, risk: pop / SETTLEMENT_POP_FLAG, ...base });
        } else if (pop >= COMMUNITY_POP_FLAG) {
          out.push({ id: `${e.id}-c`, kind: "Community", name: e.community_name || "—", threshold: COMMUNITY_POP_FLAG, reason: `Community population ≥ ${COMMUNITY_POP_FLAG.toLocaleString()}`, household: false, risk: pop / COMMUNITY_POP_FLAG, ...base });
        }
      }
      if (pwd >= PWD_FLAG) {
        out.push({ id: `${e.id}-p`, kind: "PWD", name, threshold: PWD_FLAG, reason: `Persons with disability ≥ ${PWD_FLAG}`, household: false, risk: pwd / PWD_FLAG, ...base });
      }
      const hhCut = hh >= settings.householdFlag;
      const hhOverPop =
        settings.hhRule !== "off" &&
        hh > 0 &&
        pop > 0 &&
        (settings.hhRule === "greater" ? hh > pop : hh >= pop);
      if (hhCut && hhOverPop) {
        out.push({ id: `${e.id}-hb`, kind: "Households", name, threshold: settings.householdFlag, reason: `Both: households ≥ ${settings.householdFlag.toLocaleString()} AND households ${settings.hhRule === "greater" ? ">" : "≥"} estimated population`, household: true, risk: 2 + hh / Math.max(1, pop), ...base });
      } else if (hhCut) {
        out.push({ id: `${e.id}-h`, kind: "Households", name, threshold: settings.householdFlag, reason: `Households ≥ ${settings.householdFlag.toLocaleString()}`, household: true, risk: hh / settings.householdFlag, ...base });
      } else if (hhOverPop) {
        out.push({ id: `${e.id}-hp`, kind: "HH > Pop", name, threshold: pop, reason: `Households ${settings.hhRule === "greater" ? ">" : "≥"} estimated total population`, household: true, risk: 1 + hh / Math.max(1, pop), ...base });
      }
    }
    const filtered = hhOnly ? out.filter((r) => r.household) : out;
    if (sortDesc !== null) {
      return [...filtered].sort((a, b) => (sortDesc ? b.households - a.households : a.households - b.households));
    }
    return filtered.sort((a, b) => b.risk - a.risk || b.population - a.population || b.households - a.households);
  }, [entries, settings, hhOnly, sortDesc]);

  const communities = rows.filter((r) => r.kind === "Community").length;
  const settlements = rows.filter((r) => r.kind === "Settlement").length;
  const pwdFlags = rows.filter((r) => r.kind === "PWD").length;
  const hhFlags = rows.filter((r) => r.kind === "Households").length;
  const hhOverPop = rows.filter((r) => r.kind === "HH > Pop").length;
  const maxRisk = rows.reduce((m, r) => Math.max(m, r.risk), 0);

  const setDraft = (id: string, patch: { pop?: string; hh?: string }) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const updateRow = async (r: FlagRow) => {
    const draft = drafts[r.id] || {};
    const patch: Record<string, number> = {};
    if (draft.pop !== undefined && draft.pop !== "") {
      const pop = Math.max(0, Math.round(Number(draft.pop)));
      if (!Number.isFinite(pop)) return toast.error("Enter a valid population");
      patch.estimated_total_population = pop;
      patch.estimated_children_0_4 = Math.round(pop * AGE_SPLIT.children_0_4);
      patch.estimated_children_5_14 = Math.round(pop * AGE_SPLIT.children_5_14);
      patch.estimated_adults_15_plus = pop - patch.estimated_children_0_4 - patch.estimated_children_5_14;
    }
    if (draft.hh !== undefined && draft.hh !== "") {
      const hh = Math.max(0, Math.round(Number(draft.hh)));
      if (!Number.isFinite(hh)) return toast.error("Enter a valid household count");
      patch.number_of_households = hh;
    }
    if (!Object.keys(patch).length) return toast.info("Nothing to update");
    setSaving(r.id);
    try {
      const { error } = await supabase.from("microplan_entries").update(patch as never).eq("id", r.recordId);
      if (error) throw error;
      toast.success(`Updated ${r.name}`);
      setDrafts((d) => {
        const n = { ...d };
        delete n[r.id];
        return n;
      });
      onRefresh?.();
    } catch (err) {
      toast.error("Update failed: " + (err as Error).message);
    } finally {
      setSaving(null);
    }
  };

  const exportRows = () => {
    const data = rows.map((r) => ({
      "Flag Type": r.kind,
      "Flag Reason": r.reason,
      Name: r.name,
      State: r.state,
      LGA: r.lga,
      Ward: r.ward,
      "Health Facility": r.flhf,
      "Estimated Total Population": r.population,
      Households: r.households,
      PWD: r.pwd,
      Threshold: r.threshold,
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data.length ? data : [{ Note: "No flagged records" }]);
    ws["!cols"] = [{ wch: 14 }, { wch: 52 }, { wch: 24 }, { wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 26 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws, "Population Flags");
    XLSX.writeFile(wb, `Population-Flags-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <Card className="border-amber-500/40">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold text-foreground">Oversized Population Flags</h3>
            <Badge variant="outline" className="text-[10px]">
              Communities ≥ {COMMUNITY_POP_FLAG.toLocaleString()} · Settlements ≥ {SETTLEMENT_POP_FLAG.toLocaleString()} · PWD ≥ {PWD_FLAG} · HH ≥ {settings.householdFlag.toLocaleString()}
              {settings.hhRule !== "off" ? ` · HH ${settings.hhRule === "greater" ? ">" : "≥"} Population` : ""}
            </Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 rounded-md border border-border/60 px-2 py-1">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <Label htmlFor="hh-only" className="text-[11px] cursor-pointer">Household flags only</Label>
              <Switch id="hh-only" checked={hhOnly} onCheckedChange={setHhOnly} />
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-[11px]">
                  <Settings2 className="h-3.5 w-3.5 mr-1" /> Thresholds
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Household cutoff</Label>
                  <Input
                    type="number"
                    min={1}
                    value={settings.householdFlag}
                    onChange={(e) => setSettings((s) => ({ ...s, householdFlag: Math.max(1, Number(e.target.value) || 1) }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Households vs estimated population</Label>
                  <Select value={settings.hhRule} onValueChange={(v) => setSettings((s) => ({ ...s, hhRule: v as HhRule }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="greater">Flag when households &gt; population</SelectItem>
                      <SelectItem value="greater_equal">Flag when households ≥ population</SelectItem>
                      <SelectItem value="off">Do not flag this rule</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button variant="ghost" size="sm" className="w-full h-7 text-[11px]" onClick={() => setSettings(DEFAULTS)}>
                  Reset to defaults
                </Button>
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={exportRows}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {communities} communities · {settlements} settlements
          </span>
          <span className="flex items-center gap-1.5">
            <Accessibility className="h-3.5 w-3.5" />
            {pwdFlags} PWD flags
          </span>
          <span className="flex items-center gap-1.5">
            <Home className="h-3.5 w-3.5" />
            {hhFlags} HH ≥ {settings.householdFlag.toLocaleString()} · {hhOverPop} HH &gt; population
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">No record crosses the current flag thresholds in this scope.</p>
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-md border border-border/60">
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                <tr className="text-left text-muted-foreground">
                  {["Type", "Flag Reason", "Name", "State", "LGA", "Ward", "Health Facility", "Population"].map((h) => (
                    <th key={h} className="px-2 py-1.5 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                  <th className="px-2 py-1.5 font-semibold whitespace-nowrap">Correct Population</th>
                  <th
                    className="px-2 py-1.5 font-semibold whitespace-nowrap cursor-pointer select-none"
                    onClick={() => setSortDesc((s) => (s === null ? true : s ? false : null))}
                  >
                    Households {sortDesc === null ? "↕" : sortDesc ? "↓" : "↑"}
                  </th>
                  <th className="px-2 py-1.5 font-semibold whitespace-nowrap">Correct Households</th>
                  <th className="px-2 py-1.5 font-semibold whitespace-nowrap">PWD</th>
                  {!readOnly && <th className="px-2 py-1.5 font-semibold whitespace-nowrap">Action</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const highest = maxRisk > 0 && r.risk >= maxRisk * 0.85;
                  return (
                    <tr
                      key={r.id}
                      className={`border-t border-border/40 hover:bg-muted/30 ${highest ? "bg-rose-50/70 dark:bg-rose-950/20 border-l-2 border-l-rose-500" : ""}`}
                    >
                      <td className="px-2 py-1.5">
                        <Badge
                          variant={r.kind === "Community" ? "destructive" : r.kind === "Settlement" ? "secondary" : "outline"}
                          className={`text-[9px] ${r.kind === "PWD" ? "border-purple-400 text-purple-700" : ""} ${r.kind === "Households" ? "border-sky-400 text-sky-700" : ""} ${r.kind === "HH > Pop" ? "border-rose-500 text-rose-700" : ""}`}
                        >
                          {r.kind}
                        </Badge>
                      </td>
                      <td className="px-2 py-1.5 text-muted-foreground max-w-[240px]">{r.reason}</td>
                      <td className="px-2 py-1.5 font-medium text-foreground">{r.name}</td>
                      <td className="px-2 py-1.5">{r.state}</td>
                      <td className="px-2 py-1.5">{r.lga}</td>
                      <td className="px-2 py-1.5">{r.ward}</td>
                      <td className="px-2 py-1.5">{r.flhf}</td>
                      <td className="px-2 py-1.5 text-right font-bold tabular-nums text-amber-700">{r.population.toLocaleString()}</td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          min={0}
                          disabled={readOnly}
                          placeholder="Actual"
                          value={drafts[r.id]?.pop ?? ""}
                          onChange={(e) => setDraft(r.id, { pop: e.target.value })}
                          className="h-7 w-24 text-[11px]"
                        />
                      </td>
                      <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${r.household ? "text-rose-700" : "text-muted-foreground"}`}>{r.households.toLocaleString()}</td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          min={0}
                          disabled={readOnly}
                          placeholder="Actual"
                          value={drafts[r.id]?.hh ?? ""}
                          onChange={(e) => setDraft(r.id, { hh: e.target.value })}
                          className="h-7 w-24 text-[11px]"
                        />
                      </td>
                      <td className={`px-2 py-1.5 text-right font-bold tabular-nums ${r.pwd >= PWD_FLAG ? "text-purple-700" : "text-muted-foreground"}`}>{r.pwd.toLocaleString()}</td>
                      {!readOnly && (
                        <td className="px-2 py-1.5">
                          <Button
                            size="sm"
                            className="h-7 text-[10px]"
                            disabled={saving === r.id || (!drafts[r.id]?.pop && !drafts[r.id]?.hh)}
                            onClick={() => updateRow(r)}
                          >
                            <Save className="h-3 w-3 mr-1" /> {saving === r.id ? "Saving…" : "Update"}
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">
          Updating a population applies the standard split: 0–4 yrs 20%, 5–14 yrs 28%, 15+ yrs 52%.
        </p>
      </CardContent>
    </Card>
  );
};

export default LargePopulationFlags;
