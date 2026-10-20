import { classifyWg, readWgResult, wgComplete, WG_DOMAINS } from "./washingtonGroup";

/** Functional answers are authoritative for WG classification; registration
 * evidence remains visible independently and never changes a WG answer. */
export function livelihoodDisability(profile: Record<string, unknown>) {
  const wg = readWgResult(profile);
  const classified = classifyWg(wg?.answers ?? {});
  const values = [profile.disability_status, profile.disability, profile.disability_type,
    profile.disability_types, profile.vulnerability_status].flatMap(v => Array.isArray(v) ? v : [v]);
  const registered = values.some(v => {
    if (v === true) return true;
    if (typeof v !== "string") return false;
    const s = v.trim().toLowerCase();
    if (!s || /^(no\b|none\b|not\b|unknown\b|prefer\b)/.test(s)) return false;
    return /^(yes\b|pwd\b)|person.*disability|difficulty|cannot|visual|hearing|physical|mobility|intellectual|communication|self.care|albinism/.test(s);
  });
  const completed = !!wg && wgComplete(wg.answers);
  const severe = WG_DOMAINS.some(d => wg?.answers[d.key] === "cannot");
  const some = WG_DOMAINS.some(d => wg?.answers[d.key] === "some");
  return {
    hasDisability: classified.hasDisability || registered,
    domains: classified.disabilityDomains,
    registered,
    completed,
    burden: severe ? 1 : classified.hasDisability ? 0.85 : registered ? 0.8 : some ? 0.35 : 0,
    source: classified.hasDisability ? `WG-SS: ${classified.disabilityDomains.join(", ")}`
      : registered ? "Registered disability information" : some ? "WG-SS: some functional difficulty (below disability threshold)" : "No disability evidence recorded",
    review: registered && completed && !classified.hasDisability,
  };
}