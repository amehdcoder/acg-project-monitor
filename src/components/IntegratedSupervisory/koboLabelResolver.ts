/**
 * KoboLabelResolver — turns raw XML value codes and stringified JSON arrays
 * (["KAFIN","HAUSA"]) into human-readable labels ("Kafin, Hausa"), using the
 * asset's survey + choices arrays.
 *
 * Used by charts, filter dropdowns, KPI cards, raw data tables, and previews.
 */

export interface KoboChoice {
  list_name: string;
  name: string;
  label?: string[] | string;
}

export interface KoboQuestion {
  name: string;
  type: string;
  select_from_list_name?: string;
  label?: string[] | string;
  $xpath?: string;
  $autoname?: string;
}

export interface KoboAssetContent {
  survey?: KoboQuestion[];
  choices?: KoboChoice[];
}

const firstLabel = (l: string[] | string | undefined, fallback: string): string => {
  if (!l) return fallback;
  if (Array.isArray(l)) return l.find((x) => x != null && String(x).trim() !== "") ?? fallback;
  return String(l);
};

const titleCase = (raw: string) =>
  raw
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

export class KoboLabelResolver {
  private choiceMap = new Map<string, Map<string, string>>();
  private questionByKey = new Map<string, KoboQuestion>();
  private questionByLeaf = new Map<string, KoboQuestion>();

  constructor(content: KoboAssetContent | null | undefined) {
    const survey = content?.survey ?? [];
    const choices = content?.choices ?? [];

    for (const c of choices) {
      if (!c?.list_name || c?.name == null) continue;
      if (!this.choiceMap.has(c.list_name)) this.choiceMap.set(c.list_name, new Map());
      this.choiceMap.get(c.list_name)!.set(String(c.name), firstLabel(c.label, String(c.name)));
    }

    for (const q of survey) {
      if (!q?.name) continue;
      const xpath = (q.$xpath || q.name).replace(/\//g, ".");
      this.questionByKey.set(xpath, q);
      this.questionByKey.set(q.name, q);
      this.questionByLeaf.set(q.name, q);
    }
  }

  private lookupQuestion(fieldKey: string): KoboQuestion | undefined {
    return (
      this.questionByKey.get(fieldKey) ??
      this.questionByLeaf.get(fieldKey.split(".").pop()!) ??
      this.questionByLeaf.get(fieldKey.split("/").pop()!)
    );
  }

  /** Human label for a column header. Falls back to a beautified leaf. */
  resolveHeader(fieldKey: string): string {
    const q = this.lookupQuestion(fieldKey);
    if (q?.label) return firstLabel(q.label, q.name);
    return titleCase(fieldKey.split(/[/.]/).pop() ?? fieldKey);
  }

  private resolveSingle(q: KoboQuestion | undefined, val: unknown): string {
    if (val == null || val === "") return "";
    const s = typeof val === "object" ? JSON.stringify(val) : String(val);
    if (q?.select_from_list_name) {
      const list = this.choiceMap.get(q.select_from_list_name);
      if (list?.has(s)) return list.get(s)!;
    }
    // Global fallback: if any choice list has this value uniquely, use it.
    for (const list of this.choiceMap.values()) {
      if (list.has(s)) return list.get(s)!;
    }
    // Beautify code-like tokens (KAFIN → Kafin).
    if (/^[A-Z0-9_]{2,}$/.test(s)) return titleCase(s);
    return s;
  }

  /** Turn any raw Kobo cell value into a display string with resolved labels. */
  resolveValue(fieldKey: string, rawValue: unknown): string {
    if (rawValue == null || rawValue === "") return "";
    const q = this.lookupQuestion(fieldKey);

    let value: unknown = rawValue;

    // Stringified JSON arrays like ["KAFIN","HAUSA"]
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        try { value = JSON.parse(trimmed); } catch { /* keep string */ }
      } else if (trimmed.includes(" ") && /^[\w\-]+(\s+[\w\-]+)+$/.test(trimmed)) {
        // Kobo select_multiple encoded as space-delimited tokens
        value = trimmed.split(/\s+/).filter(Boolean);
      }
    }

    if (Array.isArray(value)) {
      return value.map((v) => this.resolveSingle(q, v)).filter(Boolean).join(", ");
    }
    if (value && typeof value === "object") {
      const anyv = value as any;
      return this.resolveSingle(q, anyv.label ?? anyv.name ?? anyv.uid ?? JSON.stringify(anyv));
    }
    return this.resolveSingle(q, value);
  }
}

// Module-level cache so we don't rebuild per render.
const cache = new Map<string, KoboLabelResolver>();
export function getResolver(key: string, content: KoboAssetContent | null | undefined): KoboLabelResolver {
  const existing = cache.get(key);
  if (existing) return existing;
  const r = new KoboLabelResolver(content);
  cache.set(key, r);
  return r;
}
export function resetResolver(key: string) { cache.delete(key); }
