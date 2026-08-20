/**
 * Quiz ⇄ KoboToolbox scoring engine.
 *
 * Shared, dependency-free logic used by BOTH the browser (schema import,
 * manual pull/backfill, analytics recompute) and the `kobo-quiz-webhook`
 * edge function (realtime ingestion). Keep the mirror in
 * `supabase/functions/_shared/quizKoboScoring.ts` byte-identical.
 */

export interface KoboChoice { name: string; label: string }

export interface QuizKoboQuestion {
  /** Kobo field name (leaf, without group path). */
  name: string;
  label: string;
  /** Kobo begin_group name that wraps the question, when any. */
  group?: string | null;
  /** Human label of the intervention group (e.g. "SCHISTOSOMIASIS MDA"). */
  groupLabel?: string | null;
  /** Intervention code parsed from relevance (e.g. "ONCHO", "SCH"). */
  interventionCode?: string | null;
  type: "select_one" | "select_multiple" | "integer";
  choices: KoboChoice[];
  /** Correct choice name(s). select_multiple → all must match. */
  correct: string[];
  points: number;
  enabled: boolean;
}

export interface QuizKoboIdentityFields {
  nameField?: string | null;
  assessmentField?: string | null;
  interventionField?: string | null;
}

export type ScoreBand = "excellent" | "good" | "moderate" | "needs_training";

export const BAND_LABELS: Record<ScoreBand, string> = {
  excellent: "Excellent",
  good: "Good",
  moderate: "Moderate",
  needs_training: "Needs additional training",
};

export function scoreBand(percentage: number): ScoreBand {
  if (percentage >= 80) return "excellent";
  if (percentage >= 70) return "good";
  if (percentage >= 60) return "moderate";
  return "needs_training";
}

/** Kobo system fields that are never quiz questions. */
export const KOBO_META_FIELDS = new Set([
  "start", "end", "today", "deviceid", "subscriberid", "simserial", "phonenumber",
  "username", "email", "audit", "geopoint", "meta", "instanceID", "__version__",
  "_id", "_uuid", "_submission_time", "_validation_status", "_notes", "_status",
  "_submitted_by", "_tags", "_attachments", "_geolocation", "_xform_id_string",
]);

const META_TYPES = new Set([
  "start", "end", "today", "deviceid", "subscriberid", "simserial", "phonenumber",
  "username", "email", "audit", "geopoint", "note", "calculate", "begin_group",
  "end_group", "begin_repeat", "end_repeat", "acknowledge", "hidden",
]);

const SUPPORTED_TYPES = new Set(["select_one", "select_multiple", "integer"]);

export const normalizeKey = (v: unknown): string =>
  String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

const labelOf = (v: unknown): string => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return String(v[0] ?? "");
  if (v && typeof v === "object") {
    const first = Object.values(v as Record<string, unknown>)[0];
    return typeof first === "string" ? first : "";
  }
  return "";
};

/** Strip a Kobo group path: "group_x/oncho_q1" → "oncho_q1". */
export const leafName = (field: string): string => {
  const parts = String(field).split("/");
  return parts[parts.length - 1];
};

/** Parse `${intervention} = 'ONCHO'` style relevance into the option code. */
export function parseInterventionCode(relevant: unknown): string | null {
  const s = String(relevant ?? "");
  const m = s.match(/=\s*'([^']+)'/) || s.match(/=\s*"([^"]+)"/);
  return m ? m[1] : null;
}

export interface ParsedKoboForm {
  questions: QuizKoboQuestion[];
  identity: QuizKoboIdentityFields;
  groups: { code: string; label: string; count: number }[];
}

/**
 * Parse a Kobo asset `content.survey` + `content.choices` into quiz questions,
 * ignoring metadata/calculate/note rows, and grouping by MDA intervention.
 */
export function parseKoboForm(survey: any[], choices: any[]): ParsedKoboForm {
  const choiceMap = new Map<string, KoboChoice[]>();
  for (const c of choices ?? []) {
    const list = String(c?.list_name ?? c?.["list name"] ?? "");
    if (!list) continue;
    const arr = choiceMap.get(list) ?? [];
    arr.push({ name: String(c?.name ?? ""), label: labelOf(c?.label) || String(c?.name ?? "") });
    choiceMap.set(list, arr);
  }

  const questions: QuizKoboQuestion[] = [];
  const identity: QuizKoboIdentityFields = {};
  const groupStack: { name: string; label: string }[] = [];

  for (const row of survey ?? []) {
    const rawType = String(row?.type ?? "").trim();
    const [kind, listName] = rawType.split(/\s+/);
    const name = String(row?.name ?? "");
    const label = labelOf(row?.label);

    if (kind === "begin_group" || kind === "begin_repeat") {
      groupStack.push({ name, label: label || name });
      continue;
    }
    if (kind === "end_group" || kind === "end_repeat") {
      groupStack.pop();
      continue;
    }

    // Identity / classification fields (kept out of the scored set).
    const nk = normalizeKey(name);
    if (kind === "select_one" && /assessment.?type/.test(nk)) { identity.assessmentField = name; continue; }
    if (/independent.?monitor|participant.?name|monitor.?name/.test(nk)) { identity.nameField = name; continue; }
    if (kind === "select_one" && /^intervention$|mda.?intervention/.test(nk)) { identity.interventionField = name; continue; }

    if (META_TYPES.has(kind) || KOBO_META_FIELDS.has(name)) continue;
    if (!SUPPORTED_TYPES.has(kind)) continue;
    if (/_score$/.test(name)) continue;

    const group = groupStack[groupStack.length - 1] ?? null;
    questions.push({
      name,
      label: label || name,
      group: group?.name ?? null,
      groupLabel: group?.label ?? null,
      interventionCode: parseInterventionCode(row?.relevant),
      type: kind as QuizKoboQuestion["type"],
      choices: choiceMap.get(String(row?.select_from_list_name ?? row?.["select from list name"] ?? listName ?? "")) ?? [],
      correct: [],
      points: 10,
      enabled: true,
    });
  }

  return { questions, identity, groups: groupsOf(questions) };
}

/** Distinct MDA intervention groups present in a question set. */
export function groupsOf(questions: QuizKoboQuestion[]): { code: string; label: string; count: number }[] {
  const map = new Map<string, { code: string; label: string; count: number }>();
  for (const q of questions) {
    const code = q.interventionCode || q.group || "";
    if (!code) continue;
    const entry = map.get(code) ?? { code, label: q.groupLabel || code, count: 0 };
    entry.count += 1;
    if (!entry.label && q.groupLabel) entry.label = q.groupLabel;
    map.set(code, entry);
  }
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Group key for a question — intervention code first, then group name. */
export const questionGroupKey = (q: QuizKoboQuestion): string =>
  q.interventionCode || q.group || "general";

/** Read a Kobo payload field regardless of its group-path prefix. */
export function readField(payload: Record<string, any>, field?: string | null): any {
  if (!field) return undefined;
  if (field in payload) return payload[field];
  const leaf = leafName(field);
  for (const [k, v] of Object.entries(payload)) {
    if (leafName(k) === leaf) return v;
  }
  return undefined;
}

export interface PerQuestionScore {
  name: string;
  label: string;
  group: string;
  answer: string;
  correct: string;
  isCorrect: boolean;
  earned: number;
  points: number;
}

export interface ScoredSubmission {
  participantName: string;
  participantKey: string;
  assessmentType: "pre" | "post";
  interventionGroup: string | null;
  answers: Record<string, string>;
  perQuestion: PerQuestionScore[];
  score: number;
  maxScore: number;
  percentage: number;
  band: ScoreBand;
  submittedAt: string;
}

const asAnswerString = (v: unknown): string =>
  Array.isArray(v) ? v.join(" ") : v == null ? "" : String(v).trim();

function answerMatches(q: QuizKoboQuestion, raw: string): boolean {
  if (!q.correct.length || !raw) return false;
  if (q.type === "select_multiple") {
    const given = new Set(raw.split(/\s+/).filter(Boolean).map((s) => s.toLowerCase()));
    const want = new Set(q.correct.map((s) => s.toLowerCase()));
    if (given.size !== want.size) return false;
    for (const w of want) if (!given.has(w)) return false;
    return true;
  }
  const given = raw.toLowerCase();
  return q.correct.some((c) => c.toLowerCase() === given);
}

export function detectAssessmentType(value: unknown): "pre" | "post" {
  const s = normalizeKey(value);
  return /post/.test(s) ? "post" : "pre";
}

/**
 * Score one Kobo submission payload against the configured question set.
 * Only questions relevant to the submission's intervention group count towards
 * the maximum, so percentages stay comparable across interventions.
 */
export function scoreSubmission(
  payload: Record<string, any>,
  questions: QuizKoboQuestion[],
  identity: QuizKoboIdentityFields,
  choiceLabelFor?: (field: string, value: string) => string,
): ScoredSubmission {
  const participantName = resolveParticipantName(payload, identity, choiceLabelFor);


  const assessmentType = detectAssessmentType(readField(payload, identity.assessmentField));
  const interventionRaw = asAnswerString(readField(payload, identity.interventionField)) || null;

  const enabled = questions.filter((q) => q.enabled !== false);
  const relevant = enabled.filter((q) => {
    const key = questionGroupKey(q);
    if (key === "general") return true;
    if (!interventionRaw) return readField(payload, q.name) !== undefined;
    if (q.interventionCode) return q.interventionCode === interventionRaw;
    return readField(payload, q.name) !== undefined;
  });

  const answers: Record<string, string> = {};
  const perQuestion: PerQuestionScore[] = [];
  let score = 0;
  let maxScore = 0;

  for (const q of relevant) {
    const raw = asAnswerString(readField(payload, q.name));
    answers[q.name] = raw;
    const points = Number(q.points) || 0;
    const ok = answerMatches(q, raw);
    maxScore += points;
    if (ok) score += points;
    perQuestion.push({
      name: q.name,
      label: q.label,
      group: questionGroupKey(q),
      answer: raw,
      correct: q.correct.join(" "),
      isCorrect: ok,
      earned: ok ? points : 0,
      points,
    });
  }

  const percentage = maxScore > 0 ? Math.round((score / maxScore) * 10000) / 100 : 0;
  const submittedAt = String(
    payload?._submission_time || payload?.end || payload?.start || new Date().toISOString(),
  );

  return {
    participantName,
    participantKey: normalizeKey(participantName) || "unknown",
    assessmentType,
    interventionGroup: interventionRaw,
    answers,
    perQuestion,
    score,
    maxScore,
    percentage,
    band: scoreBand(percentage),
    submittedAt: new Date(submittedAt).toISOString(),
  };
}
