// Round-specific field tools: a 19-household KoboCollect phone form whose lot
// choices are the saved lots (so submissions link straight to the lot), the
// matching printed pack, and the mop-up plan after a failed lot.
import * as XLSX from "xlsx";
import { buildPlan, euKey, INSECURE_CLEARANCE, type EuLevel } from "./lqas";
import { buildPaperPack, type FormContext } from "./forms";
import type { RoundEntry, RoundEuLevel } from "./rounds";

export const CHILD_OF: Record<RoundEuLevel, EuLevel> = { state: "lga", lga: "ward", ward: "community", flhf: "community" };
export const MOP_UP_DAYS = 7;

export interface RoundInfo { id: string; disease: string; drug: string | null; eu_level: string; eu_key?: string | null; eu_name: string; upper_threshold: number; sample_n: number; decision_rule: number }
export interface LotInfo { id: string; lot_key: string; lot_name: string; security_status: string }

/** Kobo choice name for a lot: XML-safe, decoded back to the UUID by the webhook. */
export const lotChoice = (id: string) => `L${id.replace(/-/g, "")}`;

export function roundEntries(entries: RoundEntry[], round: RoundInfo) {
  const lvl = round.eu_level as RoundEuLevel;
  return entries.filter((e) => e.state && e.lga && euKey(e, lvl) === (round.eu_key ?? round.eu_name));
}

export function buildRoundXlsForm(round: RoundInfo, lots: LotInfo[], projectName: string, indicator: string) {
  const H = ["type", "name", "label", "required", "constraint", "constraint_message", "relevant", "calculation", "repeat_count", "appearance", "default"];
  const row = (o: Record<string, string>) => H.map((h) => o[h] ?? "");
  const n = round.sample_n;
  const survey = [H,
    row({ type: "start", name: "start" }), row({ type: "end", name: "end" }),
    row({ type: "calculate", name: "round_id", calculation: `'${round.id}'` }),
    row({ type: "calculate", name: "eu_level", calculation: `'${CHILD_OF[round.eu_level as RoundEuLevel]}'` }),
    row({ type: "note", name: "intro", label: `${round.disease} LQAS · ${round.eu_name}. Visit ${n} households, one eligible person each. PASS if ${round.decision_rule}+ covered.` }),
    row({ type: "select_one lot", name: "lot", label: "Lot (as printed on the tally sheet)", required: "yes", appearance: "minimal" }),
    row({ type: "calculate", name: "eu_name", calculation: "jr:choice-name(${lot}, '${lot}')" }),
    row({ type: "text", name: "team", label: "Team number", required: "yes" }),
    row({ type: "date", name: "collection_date", label: "Date of visit", required: "yes" }),
    row({ type: "select_one yn", name: "security_mode", label: "Collected under security-restricted protocol?", required: "yes" }),
    row({ type: "begin_repeat", name: "lqas_respondents", label: "Household", repeat_count: String(n) }),
    row({ type: "calculate", name: "slot", calculation: "position(..)" }),
    row({ type: "text", name: "community", label: "Household ${slot} of " + n + " — community / sampling point", required: "yes" }),
    row({ type: "select_one yn", name: "received", label: indicator, required: "yes" }),
    row({ type: "select_one reason", name: "reason", label: "Reason not covered", relevant: "${received} = 'no'", required: "yes" }),
    row({ type: "end_repeat", name: "lqas_respondents" }),
    row({ type: "calculate", name: "covered", calculation: "count(${lqas_respondents}[received = 'yes'])" }),
    row({ type: "note", name: "result", label: `Covered: \${covered} of ${n}. Pass mark: ${round.decision_rule}.` }),
  ];
  const choices: string[][] = [["list_name", "name", "label"]];
  lots.forEach((l) => choices.push(["lot", lotChoice(l.id), `${l.lot_name}${l.security_status !== "Green" ? ` (security ${l.security_status})` : ""}`]));
  choices.push(["yn", "yes", "Yes"], ["yn", "no", "No"]);
  ["Absent", "Refused", "Not aware", "Fear of side-effects", "Ineligible/sick", "Not visited", "Other"].forEach((r, i) => choices.push(["reason", String(i + 1), r]));
  const short = round.id.slice(0, 8);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(survey), "survey");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(choices), "choices");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["form_title", "form_id", "version"], [`${projectName} — LQAS ${round.disease} · ${round.eu_name}`, `lqas_round_${short}`, new Date().toISOString().slice(0, 10).replace(/-/g, "")]]), "settings");
  return new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function buildRoundPaperPack(round: RoundInfo, entries: RoundEntry[], projectName: string, indicator: string, securityOnly = false) {
  const child = CHILD_OF[round.eu_level as RoundEuLevel];
  const plans = buildPlan(roundEntries(entries, round), child, round.sample_n, round.id);
  const ctx: FormContext = { projectName: `${projectName} · ${round.disease} · ${round.eu_name}`, level: child, target: round.upper_threshold / 100, sample: round.sample_n, indicator };
  return { blob: buildPaperPack(plans, ctx, { securityOnly }), lots: plans.length, restricted: plans.filter((p) => p.securityMode).length };
}

export interface MopUpCommunity { community: string; ward: string; population: number; households: number; restricted: boolean }

/** Every community in a failed lot is revisited (LQAS cannot say which households were missed), largest first. */
export function mopUpCommunities(entries: RoundEntry[], round: RoundInfo, lotKey: string): MopUpCommunity[] {
  const child = CHILD_OF[round.eu_level as RoundEuLevel];
  return roundEntries(entries, round).filter((e) => euKey(e, child) === lotKey)
    .map((e) => ({ community: e.community_name || "Unnamed", ward: e.ward || "", population: Number(e.estimated_total_population) || 0, households: Number(e.number_of_households) || 0, restricted: INSECURE_CLEARANCE.has(String(e.security_clearance || "")) }))
    .sort((a, b) => b.population - a.population);
}

export function mopUpWindow(resultAt: string | null, due: string | null) {
  const start = resultAt ? resultAt.slice(0, 10) : null;
  const end = due ?? (start ? new Date(new Date(start).getTime() + MOP_UP_DAYS * 864e5).toISOString().slice(0, 10) : null);
  return { start, end };
}

export interface RoundSummary { lots: number; reported: number; passed: number; failed: number; passRate: number | null; coverage: number | null }
export function summariseRound(lots: { population: number; status: string; covered_count: number | null; sampled_count: number | null }[]): RoundSummary {
  const rep = lots.filter((l) => (l.status === "PASS" || l.status === "FAIL") && (l.sampled_count ?? 0) > 0);
  const passed = rep.filter((l) => l.status === "PASS").length;
  const pop = rep.reduce((s, l) => s + (l.population || 1), 0);
  const cov = rep.length ? rep.reduce((s, l) => s + (l.population || 1) * ((l.covered_count ?? 0) / (l.sampled_count || 1)), 0) / pop : null;
  return { lots: lots.length, reported: rep.length, passed, failed: rep.length - passed, passRate: rep.length ? passed / rep.length : null, coverage: cov };
}
