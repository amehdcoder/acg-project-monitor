// LQAS rounds and lots (Global Standard phase 2). Lots are the child units one
// level below the Evaluation Unit, built from real microplan rows. Risk flags
// use only recorded evidence — no invented predictions.
import { binomCdf, decisionRule, euKey, euName, INSECURE_CLEARANCE, type PlanEntry } from "./lqas";

export type RoundEuLevel = "state" | "lga" | "ward" | "flhf";
export const ROUND_EU_LEVELS: { id: RoundEuLevel; label: string; child: string }[] = [
  { id: "state", label: "State", child: "LGA" },
  { id: "lga", label: "LGA", child: "Ward" },
  { id: "ward", label: "Ward", child: "Community" },
  { id: "flhf", label: "FLHF", child: "Community" },
];
export const DISEASES = [
  { id: "Trachoma", drug: "Azithromycin" },
  { id: "Onchocerciasis", drug: "Ivermectin" },
  { id: "Lymphatic filariasis", drug: "Ivermectin + Albendazole" },
  { id: "Schistosomiasis", drug: "Praziquantel" },
  { id: "STH", drug: "Albendazole / Mebendazole" },
  { id: "Integrated", drug: "Multiple" },
];

export interface RoundEntry extends PlanEntry {
  accessibility?: string | null;
  community_latitude?: number | null; community_longitude?: number | null;
}

const CHILD_LEVEL = { state: "lga", lga: "ward", ward: "community", flhf: "community" } as const;
const SECURITY_RED = new Set(["not_cleared"]);
const HARD_TO_REACH = new Set(["hard_to_reach", "inaccessible", "seasonal_access", "seasonal"]);

export type RiskFlag = "Previous FAIL" | "Hard-to-Reach" | "Security Red" | "Security Yellow";

export interface LotDraft {
  lot_key: string; lot_name: string; lot_type: string;
  population: number; households: number; lat: number | null; lng: number | null;
  security_status: "Green" | "Yellow" | "Red"; risk_flags: RiskFlag[];
}

/** Two-threshold design: d from the upper threshold (α ≤ 10%), with the
 * risks shown so supervisors can see how well n separates upper vs lower. */
export function roundDesign(n: number, upper: number, lower: number) {
  const d = decisionRule(n, upper / 100);
  return {
    d,
    alpha: binomCdf(d - 1, n, upper / 100), // wrongly FAIL a lot at the upper threshold
    beta: 1 - binomCdf(d - 1, n, lower / 100), // wrongly PASS a lot at the lower threshold
  };
}

export function evaluationUnits(entries: RoundEntry[], level: RoundEuLevel) {
  const m = new Map<string, string>();
  for (const e of entries) if (e.state && e.lga) { const k = euKey(e, level); m.set(k, euName(k)); }
  return [...m].map(([key, name]) => ({ key, name })).sort((a, b) => a.key.localeCompare(b.key));
}

export function buildLots(entries: RoundEntry[], level: RoundEuLevel, eu: string, previousFails: Set<string> = new Set()): LotDraft[] {
  const child = CHILD_LEVEL[level];
  const groups = new Map<string, RoundEntry[]>();
  for (const e of entries) {
    if (!e.state || !e.lga || euKey(e, level) !== eu) continue;
    const k = euKey(e, child);
    const group = groups.get(k) ?? [];
    group.push(e); groups.set(k, group);
  }
  const lots: LotDraft[] = [];
  for (const [key, rows] of groups) {
    const located = rows.filter((r) => r.community_latitude != null && r.community_longitude != null && Number.isFinite(Number(r.community_latitude)) && Number.isFinite(Number(r.community_longitude)) && Number(r.community_latitude) >= 4 && Number(r.community_latitude) <= 14 && Number(r.community_longitude) >= 2 && Number(r.community_longitude) <= 15);
    const red = rows.some((r) => SECURITY_RED.has(String(r.security_clearance || "")));
    const yellow = !red && rows.some((r) => INSECURE_CLEARANCE.has(String(r.security_clearance || "")));
    const flags: RiskFlag[] = [];
    const name = euName(key);
    if (previousFails.has(key)) flags.push("Previous FAIL");
    if (red) flags.push("Security Red"); else if (yellow) flags.push("Security Yellow");
    if (rows.some((r) => HARD_TO_REACH.has(String(r.accessibility || "")))) flags.push("Hard-to-Reach");
    lots.push({
      lot_key: key, lot_name: name, lot_type: child === "lga" ? "LGA" : child === "ward" ? "Ward" : "Community",
      population: rows.reduce((s, r) => s + (Number(r.estimated_total_population) || 0), 0),
      households: rows.reduce((s, r) => s + (Number(r.number_of_households) || 0), 0),
      lat: located.length ? located.reduce((s, r) => s + Number(r.community_latitude), 0) / located.length : null,
      lng: located.length ? located.reduce((s, r) => s + Number(r.community_longitude), 0) / located.length : null,
      security_status: red ? "Red" : yellow ? "Yellow" : "Green", risk_flags: flags,
    });
  }
  return lots.sort((a, b) => b.risk_flags.length - a.risk_flags.length || a.lot_name.localeCompare(b.lot_name));
}
