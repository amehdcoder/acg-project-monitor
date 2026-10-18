// Washington Group Short Set (WG-SS) on functioning — the internationally
// standard six-question disability screening used in censuses and surveys.
// A beneficiary is classified as having a disability when they report
// "A lot of difficulty" or "Cannot do at all" in at least one domain.

export type WgLevel = "none" | "some" | "a_lot" | "cannot";

export const WG_LEVELS: { value: WgLevel; label: string; description: string }[] = [
  { value: "none", label: "No difficulty", description: "No difficulty at all" },
  { value: "some", label: "Some difficulty", description: "A little difficulty" },
  { value: "a_lot", label: "A lot of difficulty", description: "Significant difficulty" },
  { value: "cannot", label: "Cannot do at all", description: "Unable to do it" },
];

export interface WgDomain {
  key: string;
  label: string;
  question: string;
  icon: "eye" | "ear" | "walk" | "brain" | "selfcare" | "talk";
}

export const WG_DOMAINS: WgDomain[] = [
  { key: "seeing", label: "Seeing", icon: "eye",
    question: "Do you have difficulty seeing, even if wearing glasses?" },
  { key: "hearing", label: "Hearing", icon: "ear",
    question: "Do you have difficulty hearing, even if using a hearing aid?" },
  { key: "walking", label: "Walking", icon: "walk",
    question: "Do you have difficulty walking or climbing steps?" },
  { key: "remembering", label: "Remembering", icon: "brain",
    question: "Do you have difficulty remembering or concentrating?" },
  { key: "self_care", label: "Self-care", icon: "selfcare",
    question: "Do you have difficulty with self-care, such as washing all over or dressing?" },
  { key: "communicating", label: "Communicating", icon: "talk",
    question: "Using your usual language, do you have difficulty communicating, for example understanding or being understood?" },
];

export type WgAnswers = Partial<Record<string, WgLevel>>;

export interface WgResult {
  answers: WgAnswers;
  /** Domains where the person has a disability (a lot / cannot do). */
  disabilityDomains: string[];
  hasDisability: boolean;
  completed_at: string;
}

export const classifyWg = (answers: WgAnswers): { hasDisability: boolean; disabilityDomains: string[] } => {
  const disabilityDomains = WG_DOMAINS
    .filter((d) => answers[d.key] === "a_lot" || answers[d.key] === "cannot")
    .map((d) => d.label);
  return { hasDisability: disabilityDomains.length > 0, disabilityDomains };
};

export const wgComplete = (answers: WgAnswers) =>
  WG_DOMAINS.every((d) => !!answers[d.key]);

/** Read a stored WG-SS result from a beneficiary profile. */
export const readWgResult = (profile: Record<string, unknown> | undefined | null): WgResult | null => {
  const raw = profile?.wg_ss as WgResult | undefined;
  if (!raw || typeof raw !== "object" || !raw.answers) return null;
  return raw;
};

export interface WgDomainResult {
  label: string;
  level: WgLevel;
  levelLabel: string;
  /** True when the answer is "A lot of difficulty" or "Cannot do at all". */
  disability: boolean;
}

/** Per-domain result for each of the six WG-SS domains (only answered ones). */
export const wgDomainResults = (answers: WgAnswers): Record<string, WgDomainResult> => {
  const out: Record<string, WgDomainResult> = {};
  for (const d of WG_DOMAINS) {
    const level = answers[d.key];
    if (!level) continue;
    out[d.key] = {
      label: d.label,
      level,
      levelLabel: WG_LEVELS.find((l) => l.value === level)?.label || level,
      disability: level === "a_lot" || level === "cannot",
    };
  }
  return out;
};

/** Full record saved to beneficiary profile.wg_ss. */
export const buildWgRecord = (answers: WgAnswers) => ({
  answers,
  ...classifyWg(answers),
  domains: wgDomainResults(answers),
  completed_at: new Date().toISOString(),
});
