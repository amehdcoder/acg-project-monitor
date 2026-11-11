import { communityRisk, type CommunityRiskInput } from "./communityRisk";

export type RiskResult = ReturnType<typeof communityRisk>;
export interface CachedRisk { signature: string; risk: RiskResult }
export type RiskCache = Record<string, CachedRisk>;
export function riskSignature(entry: CommunityRiskInput): string {
  return JSON.stringify(["cdd-gap-v2", entry.security_clearance ?? null, entry.accessibility ?? null, entry.cdd_names ?? null]);
}
export function refreshRiskCache(entries: (CommunityRiskInput & { id: string })[], previous: RiskCache = {}): RiskCache {
  return Object.fromEntries(entries.map(entry => {
    const signature = riskSignature(entry);
    const old = previous[entry.id];
    return [entry.id, old?.signature === signature ? old : { signature, risk: communityRisk(entry) }];
  }));
}
export function riskInRange(risk: RiskResult, min: number, max: number, incomplete = false): boolean {
  return incomplete ? risk.score === null : risk.score !== null && risk.score >= min && risk.score <= max;
}
export function compareRisks(a: RiskResult, b: RiskResult): number {
  if (a.score === null && b.score !== null) return 1;
  if (b.score === null && a.score !== null) return -1;
  return (b.score ?? b.minimum) - (a.score ?? a.minimum);
}