export interface CommunityRiskInput {
  security_clearance?: string | null;
  accessibility?: string | null;
  cdd_names?: string | null;
}

const normalize = (value: string | null | undefined) =>
  String(value ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

/** Local planning index, not a validated threat prediction or security clearance. */
export function communityRisk(entry: CommunityRiskInput) {
  const security: Record<string, number> = { cleared: 0, partial: 25, not_cleared: 50 };
  const access: Record<string, number> = { accessible: 0, seasonal: 15, hard_to_reach: 25, inaccessible: 30 };
  const cdd = String(entry.cdd_names ?? "").trim();
  const names = cdd.replace(/\bn\s*\/\s*a\b/gi, "unknown").split(/[,;\n/]+|\band\b/i).map(s => s.trim()).filter(s =>
    s && !/^(—|-|none|nil|0|no cdds?|n\/?a|not recorded|unknown)$/i.test(s));
  const parts = [
    { label: "Security", points: security[normalize(entry.security_clearance)] ?? null, max: 50 },
    { label: "Hard to reach", points: access[normalize(entry.accessibility)] ?? null, max: 30 },
    { label: "CDD gap", points: names.length ? 0 : 20, max: 20 },
  ];
  const minimum = parts.reduce((sum, part) => sum + (part.points ?? 0), 0);
  const maximum = minimum + parts.reduce((sum, part) => sum + (part.points === null ? part.max : 0), 0);
  const complete = parts.every(part => part.points !== null);
  const score = complete ? minimum : null;
  const band = score === null ? "Incomplete" : score >= 75 ? "Critical" : score >= 50 ? "High" : score >= 25 ? "Moderate" : "Low";
  return { parts, minimum, maximum, score, band };
}