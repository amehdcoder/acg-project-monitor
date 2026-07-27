/**
 * Kobo submission normalizer — schema-driven.
 *
 * Fixes historic bugs where a naive "string contains spaces → tokenize" rule
 * (a) split single administrative names like "Birnin Kudu" into ["Birnin","Kudu"]
 *     (which later rendered as "Birnin, Kudu"),
 * (b) split ALL-CAPS values like "KAFIN" into "Kafin", and
 * (c) flagged declared-but-unanswered form fields as schema drift.
 *
 * The normalizer now:
 *  - Uses the Kobo asset survey to know which fields are truly `select_multiple`.
 *    ONLY those get token-split — every other text value is preserved byte-for-byte.
 *  - Flattens repeat groups (e.g. `respondent_interview/medicine[]`) into
 *    indexed leaf columns (`respondent_interview.medicine[0].name`) plus a
 *    `<path>.count` numeric summary. No data loss.
 *  - Seeds the data dictionary from the declared survey so a column exists for
 *    every declared field (null when no submission answered it). Column keys
 *    are strictly unique — duplicate paths (e.g. `_uuid` vs `formhub/uuid`) map
 *    to their own canonical key, they never overwrite each other.
 */

export type KoboFieldType =
  | "text"
  | "number"
  | "date"
  | "geo"
  | "boolean"
  | "array"
  | "object";

export interface KoboColumn {
  key: string;          // flattened dotted path used as the row key
  path: string;         // original slash path from Kobo
  label: string;        // beautified label (or resolver label upstream)
  type: KoboFieldType;
  system: boolean;      // starts with `_`
  samples: unknown[];
}

export interface KoboAssetField { name: string; type: string; label?: string; $xpath?: string }

const SYS_META = new Set([
  "_id", "_uuid", "_submission_time", "_submitted_by", "_geolocation",
  "_validation_status", "_status", "_attachments", "_tags", "_notes",
  "meta/instanceID", "formhub/uuid", "__version__",
]);

const isLikelyDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?/.test(s);

export function beautifyLabel(path: string): string {
  const leaf = path.split(/[/.]/).pop() ?? path;
  return leaf
    .replace(/^_+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function inferType(value: unknown): KoboFieldType {
  if (value == null) return "text";
  if (Array.isArray(value)) {
    if (value.length === 2 && value.every((n) => typeof n === "number")) return "geo";
    return "array";
  }
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "object";
  const s = String(value).trim();
  if (!s) return "text";
  if (["yes", "no", "true", "false"].includes(s.toLowerCase())) return "boolean";
  if (isLikelyDate(s)) return "date";
  if (/^-?\d+(\.\d+)?$/.test(s)) return "number";
  return "text";
}

/** Build a { canonicalKey → question } lookup from an asset survey list. */
export function buildFieldIndex(fields: KoboAssetField[] | null | undefined) {
  const byKey = new Map<string, KoboAssetField>();
  const multi = new Set<string>();
  const koboTypeMap = new Map<string, KoboFieldType>();
  for (const f of fields ?? []) {
    if (!f?.name) continue;
    const rawPath = String(f.$xpath || f.name);
    const key = rawPath.replace(/\//g, ".");
    byKey.set(key, f);
    byKey.set(f.name, f);
    const t = String(f.type || "").toLowerCase();
    if (/select_multiple/.test(t)) { multi.add(key); multi.add(f.name); }
    koboTypeMap.set(key, koboTypeToSemantic(t));
    koboTypeMap.set(f.name, koboTypeToSemantic(t));
  }
  return { byKey, multi, koboTypeMap };
}

const koboTypeToSemantic = (t: string): KoboFieldType => {
  const v = String(t || "").toLowerCase();
  if (/(integer|decimal|calculate|range)/.test(v)) return "number";
  if (/(date|time)/.test(v)) return "date";
  if (/(geopoint|geoshape|geotrace)/.test(v)) return "geo";
  if (/select_multiple/.test(v)) return "array";
  if (/^acknowledge$|^bool/.test(v)) return "boolean";
  return "text";
};

/**
 * Flatten a Kobo submission into `{path → value}` pairs.
 *
 * - Groups (`group_info/state` → `group_info.state`) are un-nested.
 * - Repeats (`respondent_interview/medicine: []`) are indexed
 *   (`respondent_interview.medicine[0].name`) plus a `<path>.count`.
 * - `select_multiple` values are split into arrays ONLY when the field is
 *   actually declared as select_multiple in the asset survey. Every other
 *   string is preserved verbatim — including administrative names that
 *   contain spaces (e.g. "Birnin Kudu").
 */
export function flattenKoboSubmission(
  row: any,
  opts?: { multi?: Set<string>; prefix?: string },
): Record<string, unknown> {
  const multi = opts?.multi ?? new Set<string>();
  const prefix = opts?.prefix ?? "";
  const out: Record<string, unknown> = {};
  if (row == null || typeof row !== "object") { out[prefix] = row; return out; }

  for (const [rawKey, value] of Object.entries(row)) {
    const key = prefix ? `${prefix}.${rawKey}` : rawKey;

    // Preserve raw system fields at top level under their exact key.
    if (!prefix && SYS_META.has(rawKey)) { out[rawKey] = value; continue; }

    if (Array.isArray(value)) {
      // Geolocation stays as [lat, lng]; attachments stays as-is.
      if (rawKey === "_geolocation" || rawKey === "_attachments" || rawKey === "_tags" || rawKey === "_notes") {
        out[key] = value;
        continue;
      }
      // Repeat group: array of objects → indexed flatten + count.
      if (value.length > 0 && value.every((v) => v && typeof v === "object" && !Array.isArray(v))) {
        out[`${key}.count`] = value.length;
        value.forEach((item, i) => {
          const child = flattenKoboSubmission(item, { multi, prefix: `${key}[${i}]` });
          Object.assign(out, child);
        });
        continue;
      }
      // Native array of primitives (rare): keep as array.
      out[key] = value;
      continue;
    }

    if (value && typeof value === "object") {
      // Un-nest child leaves; do NOT keep the parent object under `key` — that
      // was producing duplicate/noisy columns.
      Object.assign(out, flattenKoboSubmission(value, { multi, prefix: key }));
      continue;
    }

    // select_multiple values: tokenize ONLY when declared as multi in schema.
    // Byte-for-byte preservation of every other value (LGA, community names,
    // free text, dates, geo strings).
    if (
      typeof value === "string" &&
      value.includes(" ") &&
      (multi.has(key) || multi.has(rawKey)) &&
      /^[\w\-]+(\s+[\w\-]+)+$/.test(value)
    ) {
      out[key] = value.split(/\s+/).filter(Boolean);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function flattenAll(
  rows: any[],
  fields?: KoboAssetField[] | null,
): Record<string, unknown>[] {
  const { multi } = buildFieldIndex(fields);
  return (rows ?? []).map((r) => flattenKoboSubmission(r, { multi }));
}

/**
 * Build a full data dictionary. Seeds columns from the declared survey so
 * every declared field has a column (even when no submission answered it),
 * then augments with any additional columns actually seen in the data.
 * Column keys are strictly unique.
 */
export function buildDataDictionary(
  flatRows: Record<string, unknown>[],
  fields?: KoboAssetField[] | null,
): KoboColumn[] {
  const map = new Map<string, KoboColumn>();

  // Seed from declared schema — this clears "field declared but missing" drift.
  for (const f of fields ?? []) {
    if (!f?.name) continue;
    const rawPath = String(f.$xpath || f.name);
    const key = rawPath.replace(/\//g, ".");
    if (map.has(key)) continue;
    map.set(key, {
      key,
      path: rawPath,
      label: beautifyLabel(key),
      type: koboTypeToSemantic(f.type || "text"),
      system: false,
      samples: [],
    });
  }

  // Augment / refine from actual data.
  for (const row of flatRows) {
    for (const [key, v] of Object.entries(row)) {
      let col = map.get(key);
      if (!col) {
        col = {
          key,
          path: key.replace(/\./g, "/"),
          label: beautifyLabel(key),
          type: v == null || v === "" ? "text" : inferType(v),
          system: key.startsWith("_") || SYS_META.has(key),
          samples: [],
        };
        map.set(key, col);
      } else if (col.type === "text" && v != null && v !== "") {
        const t = inferType(v);
        if (t !== "text") col.type = t;
      }
      if (v != null && v !== "" && col.samples.length < 3) col.samples.push(v);
    }
  }

  return [...map.values()].sort((a, b) => {
    if (a.system !== b.system) return a.system ? 1 : -1;
    return a.label.localeCompare(b.label);
  });
}

/** Coarse dimension/metric split for the Looker-style Data panel. */
export function partitionDimensionsMetrics(cols: KoboColumn[]) {
  const dimensions = cols.filter((c) => c.type !== "number");
  const metrics = cols.filter((c) => c.type === "number");
  return { dimensions, metrics };
}

export function typeIcon(t: KoboFieldType): string {
  switch (t) {
    case "number":  return "123";
    case "date":    return "📅";
    case "geo":     return "📍";
    case "boolean": return "✓";
    case "array":   return "≡";
    case "object":  return "{}";
    default:        return "ABC";
  }
}

export function coerceNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  return 0;
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

export interface SchemaValidationIssue {
  code: "missing_in_data" | "extra_in_data" | "type_mismatch" | "empty_dictionary" | "no_fields_metadata";
  key: string;
  message: string;
  expected?: string;
  actual?: string;
}

export interface SchemaValidationReport {
  ok: boolean;
  checkedAt: string;
  fieldCount: number;
  columnCount: number;
  issues: SchemaValidationIssue[];
  errors: SchemaValidationIssue[];   // hard blocks
  warnings: SchemaValidationIssue[]; // real drift (type mismatches only)
  info: SchemaValidationIssue[];     // benign (declared but unanswered)
}

/**
 * Compare the computed data dictionary against the Kobo asset's declared survey
 * fields.
 *
 * Because `buildDataDictionary` now seeds columns from the schema, declared-but-
 * unanswered fields are NOT drift — they surface as `info`, not warnings, so
 * the banner clears once the schema aligns.
 */
export function validateDataDictionary(
  columns: KoboColumn[],
  fields: KoboAssetField[] | null | undefined,
): SchemaValidationReport {
  const issues: SchemaValidationIssue[] = [];

  if (!columns || columns.length === 0) {
    issues.push({ code: "empty_dictionary", key: "*", message: "Data dictionary is empty — no columns to render or export." });
  }

  const colByKey = new Map(columns.map((c) => [c.key, c]));
  const surveyFields = Array.isArray(fields) ? fields.filter((f) => f?.name) : [];

  if (surveyFields.length === 0) {
    issues.push({
      code: "no_fields_metadata",
      key: "*",
      message: "Kobo asset did not return survey fields; skipping strict schema check.",
    });
  } else {
    const seen = new Set<string>();
    for (const f of surveyFields) {
      const key = String(f.$xpath || f.name).replace(/\//g, ".");
      seen.add(key);
      const col = colByKey.get(key) ?? colByKey.get(f.name);
      if (!col) {
        // Should not happen now that we seed the dictionary — surface as info.
        issues.push({
          code: "missing_in_data",
          key,
          message: `Field "${f.label || f.name}" declared in Kobo form but not present in any submission.`,
        });
        continue;
      }
      const expected = koboTypeToSemantic(f.type);
      // Only real semantic mismatches count. Unanswered fields keep type=text;
      // that's expected and NOT a mismatch.
      if (
        expected !== "text" && col.type !== "text" &&
        expected !== col.type &&
        col.samples.length > 0
      ) {
        issues.push({
          code: "type_mismatch",
          key: col.key,
          expected,
          actual: col.type,
          message: `"${col.label}" expected ${expected} but data looks like ${col.type}.`,
        });
      }
    }
    for (const c of columns) {
      if (c.system) continue;
      // Repeat-group indexed columns look like `path[0].leaf`; the parent path
      // IS in the schema, so treat them as expected.
      const parent = c.key.replace(/\[\d+\]\..*$/, "").replace(/\.count$/, "");
      if (!seen.has(c.key) && !seen.has(parent)) {
        issues.push({
          code: "extra_in_data",
          key: c.key,
          message: `Column "${c.label}" appears in submissions but is not in the current Kobo form schema.`,
        });
      }
    }
  }

  const errors = issues.filter((i) => i.code === "empty_dictionary");
  // Real drift = type_mismatch only. Everything else is informational.
  const warnings = issues.filter((i) => i.code === "type_mismatch");
  const info = issues.filter((i) =>
    i.code === "missing_in_data" ||
    i.code === "extra_in_data" ||
    i.code === "no_fields_metadata"
  );

  return {
    ok: errors.length === 0,
    checkedAt: new Date().toISOString(),
    fieldCount: surveyFields.length,
    columnCount: columns.length,
    issues,
    errors,
    warnings,
    info,
  };
}
