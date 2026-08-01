/**
 * Universal Kobo Dashboard Hub — automated schema inference engine.
 *
 * Takes a raw KoboToolbox asset (`content.survey` + `content.choices`) plus its
 * submissions and derives, with zero configuration:
 *   • field list with human-readable labels and normalised types
 *   • choice-list value → label maps (single & multiple select)
 *   • the geographic hierarchy (State → LGA → Ward → Community) inferred from
 *     question names/labels
 *   • a flattened repeat store: every `begin_repeat` child row is emitted as a
 *     relational record keyed to its parent `_uuid`
 *
 * Nothing here requires an uploaded XLSForm — everything is read from the API.
 */

export type HubFieldType =
  | "select_one" | "select_multiple" | "integer" | "decimal"
  | "text" | "geopoint" | "geotrace" | "date" | "datetime"
  | "repeat" | "note" | "meta" | "boolean";

export interface HubField {
  /** Full dotted path as it appears in flattened rows. */
  name: string;
  /** Leaf question name. */
  leaf: string;
  label: string;
  type: HubFieldType;
  /** Choice list name (select_* only). */
  listName?: string;
  /** Repeat block this field belongs to (undefined = parent level). */
  repeat?: string;
}

export interface HubRepeatBlock {
  name: string;      // dotted path of the begin_repeat
  leaf: string;
  label: string;
  fields: HubField[];
}

export interface HubSchema {
  fields: HubField[];                       // parent-level fields
  repeats: HubRepeatBlock[];
  choices: Record<string, Record<string, string>>;  // list -> value -> label
  geo: { state?: string; lga?: string; ward?: string; community?: string };
  personName?: string;                      // collector / monitor name field
  designation?: string;
  title: string;
}

/* ------------------------------------------------------------------ utils */

const s = (v: unknown) => String(v ?? "").trim();

export function labelOf(node: any): string {
  const l = node?.label;
  if (Array.isArray(l)) return s(l[0]) || s(node?.name);
  if (l && typeof l === "object") return s(Object.values(l)[0]) || s(node?.name);
  return s(l) || s(node?.name);
}

const TYPE_MAP: Record<string, HubFieldType> = {
  select_one: "select_one",
  select_one_from_file: "select_one",
  select_multiple: "select_multiple",
  select_multiple_from_file: "select_multiple",
  integer: "integer",
  decimal: "decimal",
  range: "decimal",
  calculate: "decimal",
  text: "text",
  geopoint: "geopoint",
  geotrace: "geotrace",
  geoshape: "geotrace",
  date: "date",
  datetime: "datetime",
  today: "date",
  start: "datetime",
  end: "datetime",
  note: "note",
  acknowledge: "boolean",
  begin_repeat: "repeat",
};

export function normaliseType(t: string): HubFieldType {
  const key = s(t).toLowerCase();
  return TYPE_MAP[key] ?? (/^select_one/.test(key) ? "select_one"
    : /^select_multiple/.test(key) ? "select_multiple" : "text");
}

/* ------------------------------------------------------- choice extraction */

export function buildChoiceMap(choices: any[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const c of choices ?? []) {
    const list = s(c?.list_name);
    if (!list) continue;
    out[list] = out[list] ?? {};
    out[list][s(c?.name)] = labelOf(c);
  }
  return out;
}

/* ------------------------------------------------- geography autodetection */

const GEO_PATTERNS: [keyof HubSchema["geo"], RegExp][] = [
  ["state", /\b(state|province|region)\b/i],
  ["lga", /\b(lga|l\.g\.a|local\s*government|district|county)\b/i],
  ["ward", /\b(ward|sub[-\s]?district|zone)\b/i],
  ["community", /\b(community|village|settlement|locality|hamlet|school|facility)\b/i],
];

const NAME_PATTERNS: RegExp[] = [
  /monitor.*name|name.*monitor|enumerator|collector|interviewer|supervisor.*name/i,
];
const DESIGNATION_PATTERNS: RegExp[] = [/designation|role|cadre|position/i];

function detect(fields: HubField[], patterns: RegExp[]): string | undefined {
  for (const p of patterns) {
    const hit = fields.find((f) => p.test(f.label) || p.test(f.leaf));
    if (hit) return hit.name;
  }
  return undefined;
}

function detectGeo(fields: HubField[]): HubSchema["geo"] {
  const geo: HubSchema["geo"] = {};
  for (const [key, re] of GEO_PATTERNS) {
    const hit = fields.find(
      (f) => (f.type === "select_one" || f.type === "text") && (re.test(f.label) || re.test(f.leaf)),
    );
    if (hit) geo[key] = hit.name;
  }
  return geo;
}

/* -------------------------------------------------------- survey traversal */

/**
 * Walk the flat Kobo `survey` array (begin_group / begin_repeat markers) and
 * emit parent fields plus repeat blocks with their own child fields.
 */
export function inferSchema(survey: any[], choices: any[], title = "Kobo form"): HubSchema {
  const choiceMap = buildChoiceMap(choices ?? []);
  const fields: HubField[] = [];
  const repeats: HubRepeatBlock[] = [];

  const path: string[] = [];
  const repeatStack: HubRepeatBlock[] = [];

  for (const node of survey ?? []) {
    const type = s(node?.type).toLowerCase();
    const name = s(node?.name ?? node?.$autoname);
    if (!type) continue;

    if (type === "begin_group") { if (name) path.push(name); continue; }
    if (type === "end_group") { path.pop(); continue; }

    if (type === "begin_repeat") {
      if (name) path.push(name);
      const block: HubRepeatBlock = {
        name: path.join("/"),
        leaf: name,
        label: labelOf(node),
        fields: [],
      };
      repeats.push(block);
      repeatStack.push(block);
      continue;
    }
    if (type === "end_repeat") { repeatStack.pop(); path.pop(); continue; }
    if (!name || type === "end") continue;

    const t = normaliseType(type);
    if (t === "note") continue;

    const field: HubField = {
      name: [...path, name].join("/"),
      leaf: name,
      label: labelOf(node),
      type: t,
      listName: s(node?.select_from_list_name) || undefined,
      repeat: repeatStack.length ? repeatStack[repeatStack.length - 1].name : undefined,
    };
    if (repeatStack.length) repeatStack[repeatStack.length - 1].fields.push(field);
    else fields.push(field);
  }

  return {
    fields,
    repeats,
    choices: choiceMap,
    geo: detectGeo(fields),
    personName: detect(fields, NAME_PATTERNS),
    designation: detect(fields, DESIGNATION_PATTERNS),
    title,
  };
}

/**
 * Fallback inference when the asset has no survey definition: derive fields
 * from the submission payload itself.
 */
export function inferSchemaFromRows(rows: Record<string, unknown>[], title = "Kobo form"): HubSchema {
  const fields: HubField[] = [];
  const seen = new Set<string>();
  for (const row of rows.slice(0, 300)) {
    for (const [k, v] of Object.entries(row ?? {})) {
      if (k.startsWith("_") || k.startsWith("formhub") || k.startsWith("meta")) continue;
      if (seen.has(k)) continue;
      seen.add(k);
      const leaf = k.split("/").pop() as string;
      let type: HubFieldType = "text";
      const str = s(v);
      if (typeof v === "number") type = Number.isInteger(v) ? "integer" : "decimal";
      else if (/^-?\d+$/.test(str)) type = "integer";
      else if (/^-?\d+\.\d+$/.test(str)) type = "decimal";
      else if (/^-?\d+(\.\d+)?\s-?\d+(\.\d+)?\s/.test(str)) type = "geopoint";
      else if (/^\d{4}-\d{2}-\d{2}T/.test(str)) type = "datetime";
      else if (/^\d{4}-\d{2}-\d{2}$/.test(str)) type = "date";
      else if (str && str.length < 40) type = "select_one";
      fields.push({ name: k, leaf, label: leaf.replace(/_/g, " "), type });
    }
  }
  return { fields, repeats: [], choices: {}, geo: detectGeo(fields), title };
}

/* ------------------------------------------------------- value resolution */

export function resolveValue(schema: HubSchema, field: HubField, raw: unknown): string {
  const val = s(raw);
  if (!val) return "";
  const list = field.listName ? schema.choices[field.listName] : undefined;
  if (!list) return val;
  if (field.type === "select_multiple") {
    return val.split(/\s+/).map((v) => list[v] ?? v).join(", ");
  }
  return list[val] ?? val;
}

/** Read a value from a submission tolerating group-prefix drift. */
export function getFlat(row: Record<string, unknown>, path: string): unknown {
  if (row == null) return undefined;
  if (path in row) return (row as any)[path];
  const leaf = path.split("/").pop() as string;
  if (leaf in row) return (row as any)[leaf];
  for (const [k, v] of Object.entries(row)) {
    if (k.split("/").pop() === leaf) return v;
  }
  return undefined;
}

/* -------------------------------------------- repeat group flattening ---- */

export interface FlatRepeatRow extends Record<string, unknown> {
  __parentUuid: string;
  __parentId: string | number;
  __repeat: string;
  __index: number;
}

function findRepeatArray(row: any, repeatName: string): any[] {
  const leaf = repeatName.split("/").pop() as string;
  const direct = row?.[repeatName] ?? row?.[leaf];
  if (Array.isArray(direct)) return direct;
  for (const [k, v] of Object.entries(row ?? {})) {
    if (Array.isArray(v) && k.split("/").pop() === leaf) return v as any[];
  }
  return [];
}

export function flattenRepeats(
  rows: any[],
  repeat: HubRepeatBlock,
): FlatRepeatRow[] {
  const out: FlatRepeatRow[] = [];
  for (const row of rows ?? []) {
    const arr = findRepeatArray(row, repeat.name);
    arr.forEach((child, i) => {
      const flat: FlatRepeatRow = {
        __parentUuid: s(row?._uuid),
        __parentId: row?._id ?? "",
        __repeat: repeat.name,
        __index: i + 1,
        _submission_time: row?._submission_time,
      };
      for (const [k, v] of Object.entries(child ?? {})) flat[k] = v;
      // carry parent geography/meta for child-level slicing
      for (const [k, v] of Object.entries(row ?? {})) {
        if (Array.isArray(v) || (v && typeof v === "object")) continue;
        if (!(k in flat)) flat[`__parent__${k}`] = v;
      }
      out.push(flat);
    });
  }
  return out;
}

/** Count repeat children per submission across all repeat blocks. */
export function repeatCounts(rows: any[], repeats: HubRepeatBlock[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const r of repeats) {
    totals[r.name] = rows.reduce((acc, row) => acc + findRepeatArray(row, r.name).length, 0);
  }
  return totals;
}

export { findRepeatArray };
