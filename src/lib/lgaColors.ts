// Deterministic, professional fill colors for administrative-unit labels
// (e.g. LGAs / States) so each unit renders as a distinct, beautiful pill.
// Same name → same color across every table, no matter the render order.

export interface LabelColor {
  bg: string;
  fg: string;
  border: string;
}

// A curated palette of soft, professional tints with matching strong text.
const PALETTE: LabelColor[] = [
  { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" }, // blue
  { bg: "#ecfdf5", fg: "#047857", border: "#a7f3d0" }, // emerald
  { bg: "#fef2f2", fg: "#b91c1c", border: "#fecaca" }, // red
  { bg: "#fffbeb", fg: "#b45309", border: "#fde68a" }, // amber
  { bg: "#f5f3ff", fg: "#6d28d9", border: "#ddd6fe" }, // violet
  { bg: "#fdf2f8", fg: "#be185d", border: "#fbcfe8" }, // pink
  { bg: "#ecfeff", fg: "#0e7490", border: "#a5f3fc" }, // cyan
  { bg: "#f0fdf4", fg: "#15803d", border: "#bbf7d0" }, // green
  { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa" }, // orange
  { bg: "#eef2ff", fg: "#4338ca", border: "#c7d2fe" }, // indigo
  { bg: "#f0fdfa", fg: "#0f766e", border: "#99f6e4" }, // teal
  { bg: "#fefce8", fg: "#a16207", border: "#fef08a" }, // yellow
  { bg: "#faf5ff", fg: "#7e22ce", border: "#e9d5ff" }, // purple
  { bg: "#f8fafc", fg: "#334155", border: "#e2e8f0" }, // slate
];

const hash = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
};

/** Stable professional pill color for an admin-unit name. */
export const labelColor = (name: string | null | undefined): LabelColor => {
  const key = (name || "").trim().toLowerCase();
  if (!key) return { bg: "#f1f5f9", fg: "#475569", border: "#e2e8f0" };
  return PALETTE[hash(key) % PALETTE.length];
};

/** Tailwind-free inline style for a label pill. */
export const labelPillStyle = (name: string | null | undefined): React.CSSProperties => {
  const c = labelColor(name);
  return { background: c.bg, color: c.fg, border: `1px solid ${c.border}` };
};
