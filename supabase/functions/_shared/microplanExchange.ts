// Microplanning <-> DHIS2 exchange: KPI catalogue, name matching and aggregation.
// Pure module (no Deno APIs) so it can be unit-tested from vitest.

export type MicroplanKpi = {
  key: string;
  label: string;
  column: string | null; // microplan_entries column summed; null = row count
  terms: string[];       // must-have concept words
  disagg?: string[];     // words expected in a category option combo
};

export const MICROPLAN_KPIS: MicroplanKpi[] = [
  { key: "total_population", label: "Total population", column: "estimated_total_population", terms: ["population", "total"] },
  { key: "children_0_4", label: "Children 0–4 yrs", column: "estimated_children_0_4", terms: ["population", "children"], disagg: ["0-4", "<5", "under 5", "0 - 4"] },
  { key: "children_5_14", label: "Children 5–14 yrs", column: "estimated_children_5_14", terms: ["population", "children", "sac"], disagg: ["5-14", "5 - 14", "school"] },
  { key: "adults_15_plus", label: "Adults 15+ yrs", column: "estimated_adults_15_plus", terms: ["population", "adult"], disagg: ["15+", "15 +", ">=15", "15 and above", "adult"] },
  { key: "households", label: "Households", column: "number_of_households", terms: ["household"] },
  { key: "communities", label: "Communities", column: null, terms: ["communit", "village", "settlement"] },
  { key: "total_treated", label: "Total treated", column: "total_treated", terms: ["treated", "treatment", "mda"] },
  { key: "households_treated", label: "Households treated", column: "total_households_treated", terms: ["household", "treated"] },
  { key: "medicine_used", label: "Medicine used", column: "medicine_used", terms: ["medicine", "drug", "tablet", "used", "consumed"] },
  { key: "trachoma_0_5_months", label: "Trachoma 0–5 months", column: "trachoma_0_5_months", terms: ["trachoma", "tetracycline", "teo"], disagg: ["0-5 m", "0-6 m", "<6 m", "month"] },
  { key: "trachoma_6m_6y", label: "Trachoma 6 m–6 yrs", column: "trachoma_6m_6y", terms: ["trachoma", "azithromycin", "zithromax"], disagg: ["6m", "6 m", "6-6"] },
  { key: "trachoma_7_14y", label: "Trachoma 7–14 yrs", column: "trachoma_7_14y", terms: ["trachoma", "azithromycin", "zithromax"], disagg: ["7-14", "7 - 14"] },
  { key: "trachoma_15_plus", label: "Trachoma 15+ yrs", column: "trachoma_15_plus", terms: ["trachoma", "azithromycin", "zithromax"], disagg: ["15+", "15 +", ">=15"] },
];

export const norm = (s: unknown) =>
  String(s ?? "").toLowerCase().replace(/local government( area)?|\blga\b|\bstate\b/g, " ")
    .replace(/[^a-z0-9+<>=]+/g, " ").trim().replace(/\s+/g, " ");

function tokens(s: string) { return new Set(norm(s).split(" ").filter(Boolean)); }

/** Score 0..1: how well a DHIS2 name describes a KPI. */
export function scoreName(kpi: MicroplanKpi, name: string) {
  const n = norm(name);
  const label = tokens(kpi.label);
  let hits = 0;
  for (const t of kpi.terms) if (n.includes(t)) hits++;
  const termScore = kpi.terms.length ? Math.min(1, hits / Math.min(2, kpi.terms.length)) : 0;
  let overlap = 0;
  const nt = tokens(name);
  label.forEach((t) => { if (nt.has(t)) overlap++; });
  const labelScore = label.size ? overlap / label.size : 0;
  const disaggScore = kpi.disagg?.some((d) => n.includes(norm(d))) ? 0.25 : 0;
  return Math.min(1, termScore * 0.6 + labelScore * 0.3 + disaggScore);
}

export type RemoteElement = {
  id: string; name: string; kind: "dataElement" | "indicator"; dataSet?: string | null;
  categoryOptionCombos?: { id: string; name: string }[];
};

export type Suggestion = { remote_id: string; remote_name: string; kind: RemoteElement["kind"]; coc_id: string | null; coc_name: string | null; score: number };

/** Best category option combo for a KPI (age / sex disaggregation). */
export function suggestCoc(kpi: MicroplanKpi, cocs: { id: string; name: string }[] = []) {
  if (!cocs.length) return null;
  const scored = cocs.map((c) => {
    const n = norm(c.name);
    let s = /default|total/.test(n) ? 0.3 : 0;
    if (kpi.disagg?.some((d) => n.includes(norm(d)))) s = 1;
    return { c, s };
  }).sort((a, b) => b.s - a.s);
  return scored[0].s > 0 ? scored[0].c : cocs.length === 1 ? cocs[0] : null;
}

export function suggestMappings(elements: RemoteElement[], limit = 5): Record<string, Suggestion[]> {
  const out: Record<string, Suggestion[]> = {};
  for (const kpi of MICROPLAN_KPIS) {
    out[kpi.key] = elements
      .map((e) => {
        const coc = e.kind === "dataElement" ? suggestCoc(kpi, e.categoryOptionCombos) : null;
        const score = scoreName(kpi, e.name) + (coc && kpi.disagg && coc.name !== "default" ? 0.1 : 0);
        return { remote_id: e.id, remote_name: e.name, kind: e.kind, coc_id: coc?.id ?? null, coc_name: coc?.name ?? null, score: Math.min(1, Number(score.toFixed(3))) };
      })
      .filter((s) => s.score >= 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
  return out;
}

export type EntryRow = Record<string, unknown> & { state: string; lga: string; ward: string };

/** Sum microplan KPIs by state+LGA (or state). */
export function aggregateEntries(rows: EntryRow[], level: "lga" | "state") {
  const groups = new Map<string, { state: string; lga: string | null; values: Record<string, number> }>();
  for (const r of rows) {
    const k = level === "lga" ? `${norm(r.state)}|${norm(r.lga)}` : norm(r.state);
    const g = groups.get(k) ?? { state: r.state, lga: level === "lga" ? r.lga : null, values: {} };
    for (const kpi of MICROPLAN_KPIS) {
      const v = kpi.column ? Number(r[kpi.column] ?? 0) : 1;
      if (Number.isFinite(v)) g.values[kpi.key] = (g.values[kpi.key] ?? 0) + v;
    }
    groups.set(k, g);
  }
  return [...groups.values()];
}
