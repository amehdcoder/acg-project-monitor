/**
 * Kobo submission normalizer.
 * - Recursively flattens grouped questions (`group_info/state` → `group_info.state`)
 * - Produces a beautified label ("State") plus the raw path
 * - Splits `select_multiple` (space-delimited strings) into arrays
 * - Preserves system fields (`_id`, `_uuid`, `_submission_time`, `_geolocation`,
 *   `_submitted_by`, `_validation_status`, `_attachments`, `_status`)
 * - Infers a semantic type per column: text | number | date | geo | boolean | array | object
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
  label: string;        // beautified label
  type: KoboFieldType;
  system: boolean;      // starts with `_`
  samples: unknown[];
}

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

/**
 * Flatten a Kobo submission into `{path → value}` pairs. Groups reachable via
 * `group_info/state` and objects are un-nested. `select_multiple` fields (space
 * delimited strings) are split into arrays so filters/legends work.
 */
export function flattenKoboSubmission(row: any, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (row == null || typeof row !== "object") { out[prefix] = row; return out; }

  for (const [rawKey, value] of Object.entries(row)) {
    const key = prefix ? `${prefix}.${rawKey}` : rawKey;

    // Keep the raw system fields as first-class keys so consumers can still address them.
    if (!prefix && SYS_META.has(rawKey)) { out[rawKey] = value; continue; }

    if (Array.isArray(value)) {
      // _geolocation stays as [lat, lng]; _attachments stays as-is; group repeats we keep as array
      out[key] = value;
      continue;
    }
    if (value && typeof value === "object") {
      // Preserve the object under its key AND flatten children.
      out[key] = value;
      Object.assign(out, flattenKoboSubmission(value, key));
      continue;
    }
    if (typeof value === "string" && value.includes(" ") && /^[\w\-]+(\s+[\w\-]+)+$/.test(value)) {
      // Likely select_multiple → tokenize into array of choices.
      out[key] = value.split(/\s+/).filter(Boolean);
      continue;
    }
    out[key] = value;
  }
  return out;
}

export function flattenAll(rows: any[]): Record<string, unknown>[] {
  return (rows ?? []).map((r) => flattenKoboSubmission(r));
}

/**
 * Build a full data dictionary from the flattened rows. Every field seen in ANY
 * row is included — guarantees no column is silently dropped.
 */
export function buildDataDictionary(flatRows: Record<string, unknown>[]): KoboColumn[] {
  const map = new Map<string, KoboColumn>();
  for (const row of flatRows) {
    for (const [key, v] of Object.entries(row)) {
      if (v == null || v === "") continue;
      let col = map.get(key);
      if (!col) {
        col = {
          key,
          path: key.replace(/\./g, "/"),
          label: beautifyLabel(key),
          type: inferType(v),
          system: key.startsWith("_") || SYS_META.has(key),
          samples: [],
        };
        map.set(key, col);
      } else if (col.type === "text") {
        const t = inferType(v);
        if (t !== "text") col.type = t;
      }
      if (col.samples.length < 3) col.samples.push(v);
    }
  }
  // Stable order: system last, alphabetical within groups.
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

export interface KoboAssetField { name: string; type: string; label?: string }

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
  errors: SchemaValidationIssue[];   // hard blocks (empty dictionary)
  warnings: SchemaValidationIssue[]; // non-blocking drift
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
 * Compare the computed data dictionary against the Kobo asset's declared survey
 * fields. Ensures rendering/exports don't silently drop or mis-type columns.
 * Empty/absent inputs degrade gracefully into a single warning.
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
      // Kobo asset names use `group/leaf`; our dictionary uses `group.leaf`.
      const key = f.name.replace(/\//g, ".");
      seen.add(key);
      const col = colByKey.get(key) ?? colByKey.get(f.name);
      if (!col) {
        issues.push({
          code: "missing_in_data",
          key,
          message: `Field "${f.label || f.name}" declared in Kobo form but not present in any submission.`,
        });
        continue;
      }
      const expected = koboTypeToSemantic(f.type);
      if (expected !== "text" && col.type !== "text" && expected !== col.type) {
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
      if (!seen.has(c.key)) {
        issues.push({
          code: "extra_in_data",
          key: c.key,
          message: `Column "${c.label}" appears in submissions but is not in the current Kobo form schema.`,
        });
      }
    }
  }

  const errors = issues.filter((i) => i.code === "empty_dictionary");
  const warnings = issues.filter((i) => i.code !== "empty_dictionary");

  return {
    ok: errors.length === 0,
    checkedAt: new Date().toISOString(),
    fieldCount: surveyFields.length,
    columnCount: columns.length,
    issues,
    errors,
    warnings,
  };
}

