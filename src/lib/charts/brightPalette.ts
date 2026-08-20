/**
 * Shared bright, professional categorical palette for every chart in the app.
 *
 * Colours are high-chroma but WCAG-friendly against both light and dark card
 * surfaces, so the same hex works for slices, strokes and data labels.
 */
export const BRIGHT_CHART_PALETTE = [
  "#1D4ED8", // vivid blue
  "#059669", // emerald
  "#F59E0B", // amber
  "#DC2626", // red
  "#7C3AED", // violet
  "#0891B2", // cyan
  "#65A30D", // lime
  "#EA580C", // orange
  "#DB2777", // pink
  "#0D9488", // teal
  "#4F46E5", // indigo
  "#CA8A04", // gold
  "#BE123C", // rose
  "#2563EB", // azure
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
