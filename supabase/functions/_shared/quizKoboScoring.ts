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
  /** Choice list of the participant-name question, so codes resolve to labels. */
  nameChoices?: KoboChoice[] | null;
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
    // Match on the FIELD NAME only — question labels legitimately contain
    // wording like "name of the medicine" and must never be treated as the
    // participant identifier (that silently shrinks the denominator).
    const probe = name.trim()
      ? normalizeKey(name)
      : groupStack.length === 0 ? normalizeKey(label) : "";
    if (probe) {
      if (/assessment.?type/.test(probe)) { identity.assessmentField = name || identity.assessmentField; continue; }
      if (NAME_FIELD_RE.test(probe)) {
        identity.nameField = name || identity.nameField;
        identity.nameChoices =
          choiceMap.get(String(row?.select_from_list_name ?? row?.["select from list name"] ?? listName ?? "")) ?? null;
        continue;
      }
      if (/^intervention$|mda.?intervention/.test(probe)) { identity.interventionField = name || identity.interventionField; continue; }
    }

    if (META_TYPES.has(kind) || KOBO_META_FIELDS.has(name)) continue;
    if (!SUPPORTED_TYPES.has(kind)) continue;
    if (!name.trim()) continue;
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

/** Prettify a Kobo choice name / raw answer into a human name. */
const humanizeName = (raw: string): string =>
  raw.replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim()
    .split(" ")
    .map((w) => (/[a-z]/.test(w) && /^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");

const NAME_FIELD_RE = /independent.?monitor|monitor.?name|participant.?name|respondent.?name|interviewer.?name|full.?name|^name$|name of/;

/** Identity / classification fields that must never be scored as questions. */
export const IDENTITY_FIELD_RE =
  /independent.?monitor|monitor.?name|participant.?name|respondent.?name|interviewer.?name|full.?name|^name$|name of|assessment.?type|^intervention$|mda.?intervention/;

/**
 * True when a configured "question" is really a participant identifier or a
 * classification field (name, assessment type, MDA intervention) — or a blank
 * row. These must never contribute points, otherwise a perfect participant
 * scores 100/101 = 99%.
 */
export function isIdentityQuestion(
  q: { name?: string | null; label?: string | null },
  identity?: QuizKoboIdentityFields | null,
): boolean {
  const name = String(q?.name ?? "").trim();
  if (!name) return true;
  const leaf = leafName(name);
  if (identity) {
    for (const f of [identity.nameField, identity.assessmentField, identity.interventionField]) {
      if (f && leafName(String(f)) === leaf) return true;
    }
  }
  // Name only — labels legitimately contain phrases like "name of the medicine".
  return IDENTITY_FIELD_RE.test(normalizeKey(leaf));
}

/**
 * Resolve the participant's actual name from the Kobo submission.
 * Order: configured name field (choice label first) → any name-like field in
 * the payload → Kobo submitter username. Never silently returns "Unknown"
 * when the payload carries a usable answer.
 */
export function resolveParticipantName(
  payload: Record<string, any>,
  identity: QuizKoboIdentityFields,
  choiceLabelFor?: (field: string, value: string) => string,
): string {
  const fromChoices = (raw: string): string =>
    identity.nameChoices?.find((c) => String(c.name) === raw)?.label ?? "";

  const fromField = (field: string, raw: string): string => {
    if (!raw) return "";
    const label = fromChoices(raw) || (choiceLabelFor ? choiceLabelFor(field, raw) : "");
    return humanizeName(label || raw);
  };

  if (identity.nameField) {
    const direct = fromField(identity.nameField, asAnswerString(readField(payload, identity.nameField)));
    if (direct) return direct;
  }

  for (const [key, value] of Object.entries(payload)) {
    const leaf = leafName(key);
    if (KOBO_META_FIELDS.has(leaf) || leaf.startsWith("_")) continue;
    if (!NAME_FIELD_RE.test(normalizeKey(leaf))) continue;
    const candidate = fromField(leaf, asAnswerString(value));
    if (candidate) return candidate;
  }

  const submitter = asAnswerString(payload?._submitted_by ?? payload?.username);
  if (submitter) return humanizeName(submitter);
  return "Unknown";
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

  const enabled = questions.filter((q) => q.enabled !== false && !isIdentityQuestion(q, identity));
  const relevant = enabled.filter((q) => {
    const key = questionGroupKey(q);
    if (key === "general") return true;
    if (!interventionRaw) return readField(payload, q.name) !== undefined;
    if (q.interventionCode) return q.interventionCode === interventionRaw;
    return readField(payload, q.name) !== undefined;
  });

  const answers: Record<string, string> = {};
  // Keep the identity answers so names stay recoverable from stored rows.
  if (identity.nameField) answers[identity.nameField] = asAnswerString(readField(payload, identity.nameField));
  const perQuestion: PerQuestionScore[] = [];
  let score = 0;
  let maxScore = 0;


  for (const q of relevant) {
    const raw = asAnswerString(readField(payload, q.name));
    answers[q.name] = raw;
    const points = Number(q.points) || 0;
    // Authority for correctness: the configured answer key, else the form's own
    // `<field>_score` calculate column shipped by the XLSForm. A question with
    // neither is unscoreable and is excluded from the denominator entirely, so
    // it can never silently deflate a participant's percentage.
    const koboScoreRaw = readField(payload, `${q.name}_score`);
    const hasKoboScore =
      koboScoreRaw !== undefined && koboScoreRaw !== null && String(koboScoreRaw).trim() !== "" &&
      Number.isFinite(Number(koboScoreRaw));
    if (!q.correct?.length && !hasKoboScore) continue;
    const ok = q.correct?.length ? answerMatches(q, raw) : Number(koboScoreRaw) > 0;
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
