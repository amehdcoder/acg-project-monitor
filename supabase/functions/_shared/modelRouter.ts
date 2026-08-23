/**
 * Automatic model routing for the Amehnities Data Assistant.
 *
 * Every question is classified (subject + complexity), then routed to a model
 * tier: short factual look-ups take the fastest model, deep supervision /
 * epidemiology questions take the strongest one. The static heuristic is only
 * the prior — the learned routing policy (`ai_route_stats`, fed by the same
 * human-feedback rewards as the behaviour policy) can override it once a class
 * of question has evidence that a different tier performs better.
 */
export type Tier = "fast" | "balanced" | "deep";

export const TIER_MODEL: Record<Tier, string> = {
  fast: "google/gemini-3.1-flash-lite",
  balanced: "google/gemini-3.7-flash",
  deep: "google/gemini-3.1-pro-preview",
};

export const TIER_LABEL: Record<Tier, string> = {
  fast: "Fast look-up",
  balanced: "Balanced analysis",
  deep: "Deep supervision reasoning",
};

/** Subject classes the router learns rewards for, independently of complexity. */
const CLASS_PATTERNS: { cls: string; re: RegExp }[] = [
  { cls: "supervision", re: /supervis|checklist|monitor|slo\b|edo\b|cdd|flhf|in-?charge|accountab|compliance/i },
  { cls: "medicine", re: /medicine|drug|tablet|ivermectin|albendazole|praziquantel|azithromycin|stock|allocation|reconcil|expiry|batch/i },
  { cls: "coverage", re: /coverage|treated|swallow|offered|target populat|therapeutic|epidemiolog|survey|household/i },
  { cls: "geography", re: /ward|lga|state|community|settlement|grid3|gps|map|distance|geofence/i },
  { cls: "quality", re: /discrepan|mismatch|anomal|outlier|risk|diversion|fraud|data quality|missing/i },
  { cls: "operations", re: /submission|attendance|forum|audit|usage|sync|offline|user/i },
];

const DEEP_SIGNALS = /\bwhy\b|\bexplain\b|root cause|driver|predict|forecast|recommend|strateg|compare|trend|diagnos|correlat|regress|risk|scenario|implicat|should we|what if|prioriti|bottleneck|underperform|fail/i;
const FAST_SIGNALS = /^(how many|how much|what is|whats|what's|who is|when was|when did|list|show|count|total|latest|last)\b/i;

export function classifyQuestion(question: string) {
  const q = question.trim();
  const words = q.split(/\s+/).filter(Boolean).length;
  const cls = CLASS_PATTERNS.find((p) => p.re.test(q))?.cls ?? "general";

  let tier: Tier;
  if (DEEP_SIGNALS.test(q) || words > 45) tier = "deep";
  else if (FAST_SIGNALS.test(q) && words <= 14 && !/\band\b.*\band\b/i.test(q)) tier = "fast";
  else tier = "balanced";

  // Supervision/quality questions carry operational consequence — never answer
  // them on the fastest tier unless they are a trivial count.
  if ((cls === "supervision" || cls === "quality") && tier === "fast" && words > 8) tier = "balanced";

  return { questionClass: cls, heuristicTier: tier, words };
}

interface RouteStat { question_class: string; tier: Tier; avg_reward: number; trials: number }

/**
 * Learned override. Uses an upper-confidence bound so tiers with little
 * evidence still get explored, and only overrides the heuristic when the
 * learned advantage is meaningful (and backed by at least a few trials).
 */
export function applyLearnedRoute(
  heuristicTier: Tier,
  questionClass: string,
  stats: RouteStat[],
): { tier: Tier; learned: boolean; evidence: { tier: Tier; avgReward: number; trials: number }[] } {
  const rows = stats.filter((s) => s.question_class === questionClass);
  const evidence = rows.map((r) => ({
    tier: r.tier, avgReward: Number(r.avg_reward || 0), trials: Number(r.trials || 0),
  }));
  const total = rows.reduce((a, r) => a + Number(r.trials || 0), 0);
  if (total < 6) return { tier: heuristicTier, learned: false, evidence };

  const ucb = (r: RouteStat) =>
    Number(r.avg_reward || 0) + Math.sqrt((2 * Math.log(total + 1)) / Math.max(1, Number(r.trials || 1))) * 0.25;

  const best = [...rows].sort((a, b) => ucb(b) - ucb(a))[0];
  const current = rows.find((r) => r.tier === heuristicTier);
  if (!best || best.tier === heuristicTier) return { tier: heuristicTier, learned: false, evidence };
  if (Number(best.trials || 0) < 3) return { tier: heuristicTier, learned: false, evidence };

  const gain = ucb(best) - (current ? ucb(current) : 0);
  if (gain < 0.15) return { tier: heuristicTier, learned: false, evidence };
  return { tier: best.tier, learned: true, evidence };
}

/** Per-tier answer discipline injected alongside the system prompt. */
export function tierDirective(tier: Tier) {
  if (tier === "fast") {
    return "ROUTING: this is a short factual look-up. Answer in under 120 words — the figure first, one or two supporting lines, citations, then the follow-ups line. No preamble, no methodology essay.";
  }
  if (tier === "deep") {
    return "ROUTING: this is a complex supervision/epidemiology question. Reason carefully: state the indicator definitions you use, break the answer down by administrative level where the data allows, quantify uncertainty and the limits of the sampled window, and end with prioritised, actionable programme recommendations.";
  }
  return "ROUTING: standard analytical question. Give a structured, quantified answer with a table where it aids comparison, and keep it under 350 words.";
}
