export type TrackerConfig = { program: string; surgeryDate: string; eye: string; baseline: string; day30: string; day90: string; day180: string };
export function validateTrackerConfig(raw: any): TrackerConfig {
  const keys = ["program", "surgeryDate", "eye", "baseline", "day30", "day90", "day180"] as const;
  for (const key of keys) if (typeof raw?.[key] !== "string" || !/^[A-Za-z][A-Za-z0-9]{10}$/.test(raw[key])) throw new Error(`Choose the tracker ${key} field.`);
  if (new Set(keys.filter((k) => k !== "program").map((k) => raw[k])).size !== 6) throw new Error("Tracker fields must have distinct mappings.");
  return Object.fromEntries(keys.map((k) => [k, raw[k]])) as TrackerConfig;
}
const date = (raw: unknown) => {
  const value = String(raw ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value ? value : null;
};
export async function opaqueUid(input: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return String.fromCharCode(65 + bytes[0] % 26) + Array.from(bytes.slice(1,11), (b) => alphabet[b % alphabet.length]).join("");
}
/** Explicit milestone data elements contain measured logMAR, never aggregate outcomes. */
export async function trackerEpisodes(events: any[], config: TrackerConfig, connectionId: string, units: Map<string, { name: string; lga: string }>) {
  const groups = new Map<string, any>(); let skipped = 0;
  const sorted = [...events].sort((a,b) => String(a.updatedAt ?? a.lastUpdated ?? a.occurredAt ?? a.eventDate ?? "").localeCompare(String(b.updatedAt ?? b.lastUpdated ?? b.occurredAt ?? b.eventDate ?? "")));
  for (const event of sorted) {
    if (event.deleted || event.program !== config.program) continue;
    const values = new Map<string, unknown>((event.dataValues ?? []).map((v: any) => [v.dataElement, v.value]));
    const surgery = date(values.get(config.surgeryDate)), eye = String(values.get(config.eye) ?? "").trim().toUpperCase();
    const parent = event.enrollment ?? event.trackedEntity ?? event.trackedEntityInstance ?? event.event;
    const unit = units.get(event.orgUnit);
    if (!surgery || !["R","L","RIGHT","LEFT","OD","OS"].includes(eye) || !parent || !unit?.name || !unit.lga) { skipped++; continue; }
    const side = ["R","RIGHT","OD"].includes(eye) ? "R" : "L";
    const key = `${parent}:${surgery}:${side}`;
    const prior = groups.get(key) ?? { facility_name: unit.name, lga: unit.lga, surgery_date: surgery, baseline: null, day30: null, day90: null, day180: null };
    let invalid = false;
    for (const milestone of ["baseline","day30","day90","day180"] as const) {
      const raw = values.get(config[milestone]);
      if (raw === undefined || raw === null || String(raw).trim() === "") continue;
      const measured = Number(raw);
      if (!Number.isFinite(measured) || measured < -0.3 || measured > 3) { invalid = true; break; }
      prior[milestone] = measured;
    }
    if (invalid) { skipped++; continue; }
    groups.set(key, prior);
  }
  const rows = [];
  for (const [key, row] of groups) {
    if (row.baseline === null) { skipped++; continue; }
    rows.push({ ...row, episode_key: `dhis:${connectionId}:${await opaqueUid(key)}` });
  }
  return { rows, skipped };
}
export type GpsConfig = { program: string; stage: string; reportId: string; accuracy: string; capturedAt: string; facilities: Record<string,string> };
export function validateGpsConfig(raw: any): GpsConfig {
  for (const key of ["program","stage","reportId","accuracy","capturedAt"]) if (!/^[A-Za-z][A-Za-z0-9]{10}$/.test(raw?.[key] ?? "")) throw new Error(`Choose the GPS ${key} field.`);
  if (new Set([raw.reportId,raw.accuracy,raw.capturedAt]).size !== 3) throw new Error("GPS data elements must be distinct.");
  if (!raw.facilities || typeof raw.facilities !== "object" || Array.isArray(raw.facilities) || Object.keys(raw.facilities).length > 500) throw new Error("Map each reporting facility to a DHIS2 facility unit.");
  for (const [name,uid] of Object.entries(raw.facilities)) if (!name.trim() || name.length > 200 || typeof uid !== "string" || !/^[A-Za-z][A-Za-z0-9]{10}$/.test(uid)) throw new Error("Invalid facility mapping.");
  return raw;
}
export async function gpsEvent(report: any, config: GpsConfig, connectionId: string) {
  const gps = report.gps;
  const unit = config.facilities[report.facility_name];
  if (!unit || !gps || typeof gps.lat !== "number" || typeof gps.lng !== "number" || !Number.isFinite(gps.lat) || !Number.isFinite(gps.lng) || Math.abs(gps.lat)>90 || Math.abs(gps.lng)>180 || !Number.isFinite(gps.accuracy) || gps.accuracy < 0 || !Number.isFinite(Date.parse(gps.captured_at))) return null;
  return { event: await opaqueUid(`eye-gps:${connectionId}:${report.id}`), program: config.program, programStage: config.stage, orgUnit: unit,
    status: "COMPLETED", occurredAt: report.report_date, geometry: { type: "Point", coordinates: [gps.lng, gps.lat] },
    dataValues: [{ dataElement: config.reportId, value: report.id }, { dataElement: config.accuracy, value: String(gps.accuracy) }, { dataElement: config.capturedAt, value: gps.captured_at }] };
}