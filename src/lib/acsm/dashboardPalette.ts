export const ACSM_DASHBOARD_PALETTE = {
  dark: {
    bg: "#071426", panel: "#0d213a", panel2: "#112b49", border: "#456f9d",
    borderSoft: "#426fa3", text: "#f5f9ff", sub: "#b9c9df", primary: "#67e8f9", blue: "#60a5fa",
    track: "#17304f", buttonText: "#06121f", active: "#13345a",
    success: "#22c55e", warning: "#f59e0b", danger: "#f87171", orange: "#fb923c",
  },
  light: {
    bg: "#f7fafc", panel: "#ffffff", panel2: "#eef6fb", border: "#c5d3e2",
    borderSoft: "#d5e0eb", text: "#172133", sub: "#4f6178", primary: "#0369a1", blue: "#1d4ed8",
    track: "#dbe7f3", buttonText: "#ffffff", active: "#e0f2fe",
    success: "#15803d", warning: "#a16207", danger: "#b91c1c", orange: "#c2410c",
  },
};

export type AcsmDashboardPalette = typeof ACSM_DASHBOARD_PALETTE.dark;