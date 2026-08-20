/**
 * Independent Monitor roster from the live KoboToolbox form schema.
 *
 * The performance tables are built from submissions, so a monitor who has not
 * yet submitted anything is invisible — exactly the person supervisors need to
 * see. This module reads the choice list backing the monitor question in the
 * synced Kobo asset and returns every configured monitor, so zero-submission
 * monitors can be merged into the table as explicit 0-row entries.
 */
import { isHumanName } from "./nameQuality";

export interface KoboSurveyNode {
  name?: string;
  $autoname?: string;
  type?: string;
  select_from_list_name?: string;
  /** Compact asset form ("n" holds the list name). */
  n?: string;
  label?: string[] | string;
}

export interface KoboChoiceNode {
  list_name?: string;
  n?: string;
  name?: string;
  label?: string[] | string;
}

const firstLabel = (l: string[] | string | undefined, fallback: string): string => {
  if (!l) return fallback;
  if (Array.isArray(l)) return String(l.find((x) => x != null && String(x).trim() !== "") ?? fallback);
  return String(l);
};

/** Normalised comparison key so "Musa  A. Bello" === "musa a bello". */
export const rosterKey = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** List name backing a question, tolerating both Kobo asset shapes. */
function listNameFor(survey: KoboSurveyNode[], field: string): string | null {
  const leaf = field.split(/[/.]/).pop()!;
  for (const q of survey ?? []) {
    const name = String(q?.name ?? q?.$autoname ?? "");
    if (name !== field && name !== leaf) continue;
    const list = q?.select_from_list_name ?? q?.n;
    if (list) return String(list);
  }
  return null;
}

/**
 * Every monitor configured on the form, in schema order.
 * Placeholder entries ("IM 12", "Option 3") are dropped so the table only ever
 * shows real people.
 */
export function rosterFromSchema(
  survey: KoboSurveyNode[] | null | undefined,
  choices: KoboChoiceNode[] | null | undefined,
  field: string,
): string[] {
  const list = listNameFor(survey ?? [], field);
  if (!list) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of choices ?? []) {
    const cList = String(c?.list_name ?? c?.n ?? "");
    if (cList !== list) continue;
    const code = String(c?.name ?? "");
    const label = firstLabel(c?.label, code).trim();
    if (!label || !isHumanName(label)) continue;
    const key = rosterKey(label);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export interface RosterMergeRow {
  name: string;
  submissions: number;
  respondents: number;
  avgRespondents: number;
  days: number;
  /** True when the monitor exists on the form but has never submitted. */
  noSubmissions?: boolean;
}

/**
 * Merge the schema roster into computed performance rows: active monitors keep
 * their metrics, configured-but-silent monitors are appended with zeros and
 * flagged so the UI can highlight them.
 */
export function mergeRoster<T extends { name: string; submissions: number }>(
  rows: T[],
  roster: string[],
): (T | RosterMergeRow)[] {
  if (!roster.length) return rows;
  const present = new Set(rows.map((r) => rosterKey(r.name)));
  const missing: RosterMergeRow[] = roster
    .filter((n) => !present.has(rosterKey(n)))
    .map((name) => ({
      name,
      submissions: 0,
      respondents: 0,
      avgRespondents: 0,
      days: 0,
      noSubmissions: true,
    }));
  return [...rows, ...missing.sort((a, b) => a.name.localeCompare(b.name))];
}
