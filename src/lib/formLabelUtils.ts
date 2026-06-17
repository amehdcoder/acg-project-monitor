/**
 * Utility to build a mapping from question IDs to human-readable labels
 * using the form definition's questions array.
 */

export interface QuestionLabelMap {
  [questionId: string]: string;
}

/**
 * Build a map from question ID → label from form questions JSON.
 * Supports both flat arrays and grouped (FormGroup) structures.
 */
export const buildLabelMap = (questions: any[]): QuestionLabelMap => {
  const map: QuestionLabelMap = {};

  if (!Array.isArray(questions)) return map;

  const processQuestion = (q: any) => {
    if (q?.id && q?.label) {
      map[q.id] = q.label;
    }
  };

  for (const item of questions) {
    // If it's a group with nested questions
    if (item?.questions && Array.isArray(item.questions)) {
      for (const q of item.questions) {
        processQuestion(q);
      }
    } else {
      // It's a flat question
      processQuestion(item);
    }
  }

  return map;
};

/**
 * Clean a raw question key into a readable label (fallback when no form definition available).
 */
export const cleanFieldKey = (key: string): string => {
  return key
    // Remove common prefixes like q-, q_
    .replace(/^q[-_]/i, "")
    // Remove trailing numeric IDs (e.g., -1770456173817)
    .replace(/[-_]\d{10,}$/g, "")
    // Replace underscores/hyphens with spaces
    .replace(/[_-]/g, " ")
    // Title case
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .trim();
};

/**
 * Get label for a field key, preferring the form definition label, falling back to cleaned key.
 */
export const getFieldLabel = (key: string, labelMap?: QuestionLabelMap): string => {
  if (labelMap && labelMap[key]) {
    return labelMap[key];
  }
  return cleanFieldKey(key);
};

/**
 * Prettify an administrative-unit option code (state / LGA / ward / community)
 * into a human-readable label, e.g. "bauchi" → "Bauchi",
 * "akwa_ibom" → "Akwa Ibom". When `stripPrefix` is provided (typically the
 * parent code such as the state code for an LGA), it is removed first so that
 * "bauchi_ganjuwa" with prefix "bauchi" → "Ganjuwa".
 */
export const prettyAdminLabel = (
  code: string | null | undefined,
  stripPrefix?: string | null,
): string => {
  let raw = String(code ?? "").trim();
  if (!raw) return "";
  if (stripPrefix) {
    const p = String(stripPrefix).trim();
    if (p && raw.toLowerCase().startsWith(p.toLowerCase() + "_")) {
      raw = raw.slice(p.length + 1);
    }
  }
  return raw
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase())
    .trim();
};
