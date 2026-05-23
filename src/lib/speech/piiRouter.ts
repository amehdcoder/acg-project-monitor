/**
 * PII routing — Batch 11.
 *
 * Some questions collect personally identifiable information (names, phone
 * numbers, NIN/BVN, addresses, raw GPS). For these we MUST NOT ship the
 * audio to a cloud STT provider — even if quota allows. Instead we route
 * to the on-device Whisper engine (or the browser's Web Speech engine,
 * which on Chrome/Android can be served by an on-device pack).
 *
 * Detection is conservative: any one signal flips the bit.
 *   • question.type ∈ { geopoint, geotrace, geoshape, phone }
 *   • question.appearance contains "sensitive"
 *   • question.name or label matches a PII regex (covers Nigerian context:
 *     NIN, BVN, plus standard name/phone/address/email/DOB).
 */

import type { Question } from "@/components/FormBuilder/types";

const PII_TYPES = new Set(["geopoint", "geotrace", "geoshape", "phone"]);

const PII_RX =
  /\b(name|full[_\s-]?name|first[_\s-]?name|last[_\s-]?name|surname|phone|mobile|tel|telephone|whatsapp|address|street|email|e[_\s-]?mail|nin|bvn|passport|id[_\s-]?number|national[_\s-]?id|dob|date[_\s-]?of[_\s-]?birth|gps|coordinates|latitude|longitude|household[_\s-]?head)\b/i;

export function isSensitiveQuestion(q: Question | null | undefined): boolean {
  if (!q) return false;
  if (PII_TYPES.has(q.type as string)) return true;
  if (typeof q.appearance === "string" && /sensitive|pii|private/i.test(q.appearance)) return true;
  const haystack = `${q.name || ""} ${q.label || ""}`;
  return PII_RX.test(haystack);
}
