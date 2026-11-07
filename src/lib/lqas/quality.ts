import { binomCdf, decisionRule } from "./lqas";

export const WHO_LQAS_SOURCES = [
  { label: "WHO · Preventive chemotherapy coverage surveys", url: "https://www.who.int/publications/i/item/9789241517369" },
  { label: "WHO · Monitoring drug coverage for preventive chemotherapy", url: "https://www.who.int/publications/i/item/9789241595806" },
];

export function assessDesign(n: number, upper: number, lower: number) {
  const valid = Number.isInteger(n) && n >= 10 && n <= 30 && Number.isInteger(upper) && Number.isInteger(lower) && lower >= 0 && upper <= 100 && upper > lower;
  if (!valid) return { valid: false, acceptable: false, d: 0, alpha: null, beta: null };
  const d = decisionRule(n, upper / 100);
  const alpha = binomCdf(d - 1, n, upper / 100);
  const beta = 1 - binomCdf(d - 1, n, lower / 100);
  return { valid: true, acceptable: d > 0 && alpha <= 0.1 + 1e-10 && beta <= 0.1 + 1e-10, d, alpha, beta };
}

export type SampleClassification = "pass" | "mop_up" | "incomplete" | "invalid" | "review";
export function classifySample(covered: number, sampled: number, expected: number, passMark: number, deviation = false): SampleClassification {
  if (![covered, sampled, expected, passMark].every(Number.isInteger) || covered < 0 || sampled < 0 || covered > sampled || expected < 1 || passMark < 1 || passMark > expected || sampled > expected) return "invalid";
  if (sampled < expected) return "incomplete";
  if (deviation) return "review";
  return covered >= passMark ? "pass" : "mop_up";
}

export function wilsonInterval(covered: number, sampled: number) {
  if (sampled <= 0 || covered < 0 || covered > sampled) return null;
  const z = 1.959963984540054, p = covered / sampled, z2 = z * z;
  const centre = (p + z2 / (2 * sampled)) / (1 + z2 / sampled);
  const half = z * Math.sqrt(p * (1 - p) / sampled + z2 / (4 * sampled * sampled)) / (1 + z2 / sampled);
  return { lower: Math.max(0, centre - half), upper: Math.min(1, centre + half) };
}