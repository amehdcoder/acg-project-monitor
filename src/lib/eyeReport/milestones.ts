export const WHO_SOURCES = {
  eye: "https://www.who.int/activities/monitoring-and-surveillance-of-global-eye-care-targets",
  trachoma: "https://www.who.int/news-room/fact-sheets/detail/trachoma",
  roadmap: "https://www.who.int/publications/i/item/9789240010352",
};
export const MILESTONES = [
  { key: "ecsc", title: "Effective cataract surgical coverage", target: 30, direction: "increase", unit: "percentage points", detail: "+30 percentage points from the 2020 baseline by 2030", source: WHO_SOURCES.eye },
  { key: "erec", title: "Effective refractive error coverage", target: 40, direction: "increase", unit: "percentage points", detail: "+40 percentage points from the 2020 baseline by 2030", source: WHO_SOURCES.eye },
  { key: "tt", title: "TT unknown to the health system", target: 0.2, direction: "decrease", unit: "%", detail: "<0.2% in adults aged ≥15 years in each formerly endemic district", source: WHO_SOURCES.trachoma },
  { key: "tf", title: "Trachomatous inflammation — follicular", target: 5, direction: "decrease", unit: "%", detail: "<5% in children aged 1–9; sustained ≥2 years without antibiotic MDA", source: WHO_SOURCES.trachoma },
  { key: "backlog", title: "Verified TT surgical backlog clearance", target: 0, direction: "decrease", unit: "people", detail: "Local operational target: clear the verified starting backlog; not WHO elimination certification", source: WHO_SOURCES.roadmap },
] as const;
export type MilestoneKey = typeof MILESTONES[number]["key"];
export type MilestoneObservation = { indicator: MilestoneKey; state: string; lga: string; date: string; value: number; baseline: number; baseline_date: string; source: string };
export function parseMilestones(raw: unknown): MilestoneObservation[] {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 1000) throw new Error("Supply 1–1,000 sourced survey observations.");
  const seen = new Set<string>();
  return raw.map((r) => {
    const m = MILESTONES.find((x) => x.key === r?.indicator);
    if (!m || ![r.state, r.lga, r.source].every((s) => typeof s === "string" && s.trim() && s.length <= 300)) throw new Error("Every observation needs a recognised indicator, State, LGA and source.");
    const dateOK = (d: unknown) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d;
    if (!dateOK(r.date) || !dateOK(r.baseline_date) || r.baseline_date > r.date || r.date > new Date().toISOString().slice(0, 10)) throw new Error("Use valid, non-future dates and a baseline before the observation.");
    if (typeof r.value !== "number" || typeof r.baseline !== "number" || !Number.isFinite(r.value) || !Number.isFinite(r.baseline) || r.value < 0 || r.baseline < 0 || (m.key !== "backlog" && Math.max(r.value, r.baseline) > 100)) throw new Error("Coverage/prevalence must be 0–100%; backlog counts must be non-negative.");
    if (m.direction === "increase" && !r.baseline_date.startsWith("2020-")) throw new Error("WHO coverage gains require a documented 2020 baseline.");
    const key = [r.indicator, r.state.toLowerCase(), r.lga.toLowerCase(), r.date].join("|");
    if (seen.has(key)) throw new Error("Duplicate indicator / geography / date observation.");
    seen.add(key);
    return { ...r, state: r.state.trim(), lga: r.lga.trim(), source: r.source.trim() } as MilestoneObservation;
  });
}
export function milestoneProgress(key: MilestoneKey, observations: MilestoneObservation[], now = new Date()) {
  const m = MILESTONES.find((x) => x.key === key);
  if (!m) return null;
  const list = observations.filter((o) => o.indicator === key).sort((a,b) => a.date.localeCompare(b.date));
  const last = list.at(-1);
  if (!last) return null;
  // Never average different survey populations or combine district prevalence without denominators.
  const sameScope = list.every((o) => o.state === last.state && o.lga === last.lga && o.baseline === last.baseline && o.baseline_date === last.baseline_date);
  if (!sameScope) return null;
  const target = m.direction === "increase" ? Math.min(100, last.baseline + m.target) : m.target;
  const delta = m.direction === "increase" ? last.value - last.baseline : last.baseline - last.value;
  const distance = m.direction === "increase" ? target - last.baseline : last.baseline - target;
  const reached = m.direction === "increase" ? last.value >= target : key === "backlog" ? last.value === 0 : last.value < target;
  const completion = reached ? 100 : distance > 0 ? Math.max(0, Math.min(100, delta / distance * 100)) : 0;
  const nowTime = now.getTime(), lastTime = Date.parse(last.date);
  const recent = list.filter((o) => Date.parse(o.date) >= nowTime - 3 * 365.25 * 86400000);
  let forecast: "Insufficient evidence" | "Threshold observed" | "On track" | "Off track" = reached ? "Threshold observed" : "Insufficient evidence";
  let crossing: string | null = null;
  let annualChange: number | null = null;
  if (!reached && recent.length >= 3 && lastTime <= nowTime && nowTime - lastTime <= 365.25 * 86400000 && Date.parse(recent.at(-1)?.date ?? "") - Date.parse(recent[0].date) >= 180 * 86400000) {
    const xs = recent.map((o) => (Date.parse(o.date) - lastTime) / (365.25 * 86400000));
    const mx = xs.reduce((s,v) => s+v,0)/xs.length, my = recent.reduce((s,o) => s+o.value,0)/recent.length;
    const variance = xs.reduce((s,x) => s+(x-mx)**2,0);
    const slope = variance > 0 ? xs.reduce((s,x,i) => s+(x-mx)*(recent[i].value-my),0)/variance : 0;
    annualChange = slope;
    const improves = m.direction === "increase" ? slope > 0 : slope < 0;
    const years = improves ? (target - last.value) / slope : Infinity;
    const crossingTime = lastTime + years * 365.25 * 86400000;
    const deadline = Date.parse("2030-12-31");
    forecast = crossingTime <= deadline && nowTime <= deadline ? "On track" : "Off track";
    if (Number.isFinite(crossingTime) && crossingTime > 0 && crossingTime < Date.parse("2100-01-01")) crossing = new Date(crossingTime).toISOString().slice(0,7);
  }
  return { last, target, completion, reached, forecast, crossing, annualChange, samples: recent.length };
}