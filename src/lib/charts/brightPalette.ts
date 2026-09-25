/**
 * Shared chart palette: a cohesive navy-and-teal brand scale.
 * Navy and teal alternate so neighbouring series stay distinguishable,
 * stepping through lighter tints for longer category lists.
 */
export const BRIGHT_CHART_PALETTE = [
  "#1E3A8A", // deep navy
  "#0D9488", // teal
  "#3B5BA9", // navy 400
  "#14B8A6", // teal 400
  "#6582C4", // navy 300
  "#5ED3C4", // teal 300
  "#172554", // navy 900
  "#115E59", // teal 800
  "#93A8D8", // navy 200
  "#99E6DC", // teal 200
];

/** Deterministic colour for an index. */
export const brightColorAt = (i: number) =>
  BRIGHT_CHART_PALETTE[((i % BRIGHT_CHART_PALETTE.length) + BRIGHT_CHART_PALETTE.length) % BRIGHT_CHART_PALETTE.length];

/** Stable colour for a category label (same name → same colour everywhere). */
export function brightColorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return brightColorAt(h);
}

export default BRIGHT_CHART_PALETTE;
