/**
 * Value-quality guards for field data.
 *
 * Flattened KoboToolbox submissions mix people, places and answers in the same
 * flat key/value bag, so a naive "any field whose name contains `name`" sweep
 * pulls in answers like "Yes All Are Sufficient" as if they were actors, and
 * numeric answers ("800", "114") or booleans ("No") as if they were community
 * names. These predicates keep analyses honest by accepting only values that
 * can plausibly be a human name or a place name.
 */

const SENTENCE_WORDS = new Set([
  "yes", "no", "n/a", "na", "nil", "none", "null", "true", "false", "other", "others",
  "all", "are", "is", "am", "was", "were", "be", "been", "being", "the", "a", "an",
  "and", "or", "but", "not", "with", "within", "without", "for", "from", "into", "onto",
  "of", "to", "at", "on", "in", "by", "as", "that", "this", "these", "those", "there",
  "here", "it", "its", "they", "them", "their", "we", "our", "you", "your", "he", "she",
  "his", "her", "have", "has", "had", "do", "does", "did", "doing", "done", "well",
  "good", "bad", "poor", "job", "work", "working", "worked", "sufficient", "insufficient",
  "available", "unavailable", "adequate", "inadequate", "enough", "school", "schools",
  "class", "classroom", "pupil", "pupils", "student", "students", "teacher", "teachers",
  "training", "trained", "untrained", "present", "absent", "active", "inactive",
  "male", "female", "yes/no", "ok", "okay", "fine", "very", "much", "some", "most",
  "few", "many", "always", "never", "sometimes", "often", "daily", "weekly", "monthly",
  "completed", "complete", "incomplete", "pending", "ongoing", "started", "stopped",
  "received", "receive", "given", "give", "taken", "take", "test", "testing", "sample",
  "unknown", "dont", "know", "cannot", "cant", "will", "would", "should", "can", "could",
  "because", "due", "reason", "reasons", "issue", "issues", "problem", "problems",
]);

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

const tokensOf = (s: string) =>
  s.toLowerCase().split(/[\s,./\\|]+/).map((t) => t.replace(/[^a-z']/g, "")).filter(Boolean);

/**
 * True when the value looks like a person's name rather than an answer to a
 * question. Requires 1–4 alphabetic tokens, none of which are common
 * response/sentence words, and no digits.
 */
export function isHumanName(value: unknown): boolean {
  const s = clean(value);
  if (!s || s.length < 3 || s.length > 60) return false;
  if (/\d/.test(s)) return false;
  if (/^https?:/i.test(s)) return false;
  if (/[<>{}[\]@#$%^*=+~`"]/.test(s)) return false;
  if (/\.(png|jpe?g|webp|gif|pdf|mp3|mp4|3gp|amr|csv|xlsx?)$/i.test(s)) return false;
  const t = tokensOf(s);
  if (!t.length || t.length > 4) return false;
  if (t.some((x) => SENTENCE_WORDS.has(x))) return false;
  // at least one token of real length (initials alone are not identifying)
  if (!t.some((x) => x.length >= 3)) return false;
  // every token must be alphabetic and reasonably short
  if (t.some((x) => x.length > 20)) return false;
  return true;
}

/**
 * True when the value looks like a place (State / LGA / Ward / Facility /
 * Community) rather than a number or a questionnaire answer.
 */
export function isPlaceName(value: unknown): boolean {
  const s = clean(value);
  if (!s || s.length < 2 || s.length > 80) return false;
  if (/^[\d\s.,%/-]+$/.test(s)) return false;              // pure numbers
  if (!/[a-z]/i.test(s)) return false;
  if (/^https?:/i.test(s)) return false;
  if (/\.(png|jpe?g|webp|gif|pdf|mp3|mp4|3gp|amr)$/i.test(s)) return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return false;
  const t = tokensOf(s);
  if (!t.length || t.length > 6) return false;
  // a place name is not a yes/no or a sentence: reject when the majority of
  // tokens are generic response words, or when the first token is one.
  if (SENTENCE_WORDS.has(t[0])) return false;
  const generic = t.filter((x) => SENTENCE_WORDS.has(x)).length;
  if (generic / t.length >= 0.5) return false;
  return true;
}

export default isHumanName;
