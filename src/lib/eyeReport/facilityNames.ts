/** Presentation-only facility identity: never rewrites source reports or access IDs. */
export interface FacilityRecord {
  project_id?: string; facility_id?: string | null; facility_name: string;
  state?: string | null; lga?: string | null; id?: string; report_id?: string | null;
}
export interface FacilityReference { id: string; name: string; state?: string | null; lga?: string | null }
const words = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
const compact = (value: string) => words(value).replace(/ /g, "");
const title = (value: string) => words(value).split(" ").map(w => /^(phc|fmc|lga|ntd|csom)$/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
function oneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length >= b.length) i++;
    if (b.length >= a.length) j++;
  }
  return edits + (i < a.length || j < b.length ? 1 : 0) <= 1;
}
function canonical(row: FacilityRecord): { token: string; name: string } {
  const name = words(row.facility_name).replace(/\bgen\b/g, "general").replace(/\bhosp\b/g, "hospital");
  const token = compact(name), lga = compact(row.lga ?? ""), state = compact(row.state ?? "");
  // Confirmed alias, qualified by location; never apply Gimel→Gumel elsewhere.
  if (lga === "gumel" && (!state || state === "jigawa") && /^(gimel|gumel)generalhospital$/.test(token)) {
    return { token: "gumelgeneralhospital", name: "Gumel General Hospital" };
  }
  // Correct only a locality-derived name against its recorded LGA, not arbitrary
  // similar names (e.g. Madina/Medina). Facility type and numbers remain intact.
  const suffix = ["generalhospital", "primaryhealthcentre", "primaryhealthcenter"].find(s => token.endsWith(s));
  const stem = suffix ? token.slice(0, -suffix.length) : "";
  if (suffix && lga.length >= 5 && !/\d/.test(stem) && oneEdit(stem, lga)) {
    const suffixLabel = suffix === "generalhospital" ? "General Hospital" : suffix === "primaryhealthcentre" ? "Primary Health Centre" : "Primary Health Center";
    return { token: lga + suffix, name: `${title(row.lga ?? "")} ${suffixLabel}` };
  }
  return { token, name: title(name) || "Facility name not recorded" };
}
const scope = (r: FacilityRecord) => JSON.stringify([r.project_id ?? "", compact(r.state ?? ""), compact(r.lga ?? "")]);
export type FacilityNormalizer = <T extends FacilityRecord>(row: T) => T;

/** Linear-time exact/qualified-alias lookup, rebuilt only when input rows change. */
export function createFacilityNormalizer(records: FacilityRecord[], registry: FacilityReference[] = [], projectId = ""): FacilityNormalizer {
  const refs: FacilityRecord[] = registry.map(r => ({ project_id: projectId, facility_id: r.id, facility_name: r.name, state: r.state, lga: r.lga }));
  const all = [...refs, ...records];
  const idsByName = new Map<string, Set<string>>();
  const registeredNames = new Map<string, string>();
  const idKey = (r: FacilityRecord) => `${r.project_id ?? projectId}:id:${r.facility_id}`;
  for (const r of all) if (r.facility_id) {
    const k = `${scope(r)}:${canonical(r).token}`, ids = idsByName.get(k) ?? new Set<string>();
    ids.add(idKey(r)); idsByName.set(k, ids);
  }
  for (const r of refs) registeredNames.set(idKey(r), canonical(r).name);
  const keyFor = (r: FacilityRecord) => {
    if (r.facility_id) return idKey(r);
    const k = `${scope(r)}:${canonical(r).token}`, ids = idsByName.get(k);
    if (ids?.size === 1) return [...ids][0];
    return `${k}:unregistered`;
  };
  const groups = new Map<string, { names: Map<string, number>; row: FacilityRecord; token: string }>();
  const aliases = new Map<string, Set<string>>();
  for (const r of all) {
    const k = keyFor(r), c = canonical(r), group = groups.get(k) ?? { names: new Map<string, number>(), row: r, token: c.token };
    group.names.set(c.name, (group.names.get(c.name) ?? 0) + 1); groups.set(k, group);
    // Trajectory rows lack State: resolve only if project + LGA + alias is unique.
    const a = JSON.stringify([r.project_id ?? projectId, compact(r.lga ?? ""), c.token]);
    const matches = aliases.get(a) ?? new Set<string>(); matches.add(k); aliases.set(a, matches);
  }
  const labels = new Map<string, string>(), sameLabels = new Map<string, string[]>();
  for (const [k, g] of groups) {
    const name = registeredNames.get(k) ?? [...g.names].sort((a,b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "Facility name not recorded";
    labels.set(k, name);
    const collision = `${g.row.project_id ?? projectId}:${compact(name)}`;
    sameLabels.set(collision, [...(sameLabels.get(collision) ?? []), k]);
  }
  for (const keys of sameLabels.values()) if (keys.length > 1) {
    for (const k of keys) {
      const row = groups.get(k)?.row;
      const place = [title(row?.lga ?? ""), title(row?.state ?? "")].filter(Boolean).join(", ") || "Location not recorded";
      const peers = keys.filter(other => scope(groups.get(other)?.row ?? { facility_name: "" }) === scope(row ?? { facility_name: "" }));
      labels.set(k, `${labels.get(k)} — ${place}${peers.length > 1 ? ` · ${row?.facility_id ? `ID ${row.facility_id}` : "Unlinked reports"}` : ""}`);
    }
  }
  const reportKeys = new Map(records.filter(r => r.id && !r.report_id).map(r => [r.id, keyFor(r)]));
  return <T extends FacilityRecord>(row: T): T => {
    let key = keyFor(row);
    if (row.report_id && !row.facility_id) key = reportKeys.get(row.report_id) ?? key;
    if (!groups.has(key) && !row.state && row.lga) {
      const matches = aliases.get(JSON.stringify([row.project_id ?? projectId, compact(row.lga), canonical(row).token]));
      if (matches?.size === 1) key = [...matches][0];
    }
    const name = labels.get(key) ?? canonical(row).name;
    return name === row.facility_name ? row : { ...row, facility_name: name };
  };
}