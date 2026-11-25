// Field discovery and auto-detected mapping between an external system and Amehnities.
export type MapField = { key: string; label: string; type?: string; sample?: string; group?: string };
export type FieldMap = { external: string; internal: string; confidence: number; auto: boolean };

/** Flatten a pasted sample record (JSON object/array) or a list of field names into fields. */
export function discoverFields(text: string): MapField[] {
  const t = text.trim();
  if (!t) return [];
  try {
    let v: unknown = JSON.parse(t);
    if (Array.isArray(v)) v = v.find((x) => x && typeof x === "object") ?? {};
    if (v && typeof v === "object") {
      const out: MapField[] = [];
      const walk = (o: Record<string, unknown>, pre: string) => {
        for (const [k, val] of Object.entries(o)) {
          const key = pre ? `${pre}.${k}` : k;
          if (val && typeof val === "object" && !Array.isArray(val)) walk(val as Record<string, unknown>, key);
          else out.push({ key, label: k, type: Array.isArray(val) ? "list" : typeof val, sample: val == null ? "" : String(Array.isArray(val) ? val.join(", ") : val).slice(0, 80) });
        }
      };
      walk(v as Record<string, unknown>, "");
      return out;
    }
  } catch { /* fall through to plain list */ }
  const seen = new Set<string>();
  return t.split(/[\n,;\t]+/).map((s) => s.trim()).filter((s) => s && !seen.has(s) && seen.add(s)).map((s) => ({ key: s, label: s }));
}

const SYNONYMS: string[][] = [
  ["name", "full", "fullname", "patient", "client", "beneficiary", "person"],
  ["phone", "mobile", "telephone", "tel", "msisdn", "contact"],
  ["sex", "gender"], ["dob", "birth", "birthdate", "dateofbirth"], ["age", "years"],
  ["lga", "district", "localgovernment", "county"], ["state", "province", "region"],
  ["ward", "subdistrict"], ["village", "community", "settlement"],
  ["id", "identifier", "caseid", "uid", "code"], ["date", "visit", "servicedate", "when"],
  ["status", "state_code", "outcome"], ["lat", "latitude"], ["lng", "lon", "longitude"],
];
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const tokens = (s: string) => {
  const base = norm(s.split(".").pop() || s).split(" ").filter(Boolean);
  const joined = base.join("");
  const out = new Set<string>();
  for (const w of base) { const g = SYNONYMS.find((x) => x.includes(w)); out.add(g ? `#${g[0]}` : w); }
  const whole = SYNONYMS.find((x) => x.includes(joined)); if (whole) out.add(`#${whole[0]}`);
  return out;
};
export function similarity(a: MapField, b: MapField): number {
  const ka = norm(a.key).replace(/ /g, ""), kb = norm(b.key).replace(/ /g, "");
  if (ka && ka === kb) return 1;
  const ta = new Set([...tokens(a.key), ...tokens(a.label)]), tb = new Set([...tokens(b.key), ...tokens(b.label)]);
  let inter = 0; ta.forEach((x) => { if (tb.has(x)) inter++; });
  const denom = Math.max(1, Math.min(ta.size, tb.size)) + Math.abs(ta.size - tb.size) * 0.25;
  return Math.round(Math.min(0.99, inter / denom) * 100) / 100;
}

/** Greedy one-to-one auto-mapping; keeps manual choices, ignores weak matches (< 0.34). */
export function autoMap(external: MapField[], internal: MapField[], keep: FieldMap[] = []): FieldMap[] {
  const manual = keep.filter((m) => !m.auto && m.internal);
  const usedE = new Set(manual.map((m) => m.external)), usedI = new Set(manual.map((m) => m.internal));
  const pairs: FieldMap[] = [];
  for (const e of external) if (!usedE.has(e.key)) for (const i of internal) if (!usedI.has(i.key)) {
    const c = similarity(e, i); if (c >= 0.34) pairs.push({ external: e.key, internal: i.key, confidence: c, auto: true });
  }
  pairs.sort((x, y) => y.confidence - x.confidence);
  const out = [...manual];
  for (const p of pairs) if (!usedE.has(p.external) && !usedI.has(p.internal)) { out.push(p); usedE.add(p.external); usedI.add(p.internal); }
  return out;
}

/** Mirror one sample record into Amehnities field keys using the mapping. */
export function mirrorRecord(sample: string, maps: FieldMap[]): Record<string, string> {
  const fields = discoverFields(sample);
  const byKey = new Map(fields.map((f) => [f.key, f.sample ?? ""]));
  return Object.fromEntries(maps.filter((m) => m.internal).map((m) => [m.internal, byKey.get(m.external) ?? ""]));
}
