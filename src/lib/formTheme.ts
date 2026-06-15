// Form Theme system
// -----------------
// A single, self-contained theme model that drives the visual appearance of a
// form (and its template) inside the FormFiller. It supports full colour
// control for BOTH light and dark mode, layout density / structure, corner
// radius and font. The theme is stored on `form.settings.theme` so it travels
// with the form and every template.
//
// The FormFiller applies the theme by overriding the relevant shadcn CSS
// variables (in HSL channel format) on a scoped container element, so existing
// semantic tokens (bg-background, text-primary, bg-card, …) automatically pick
// up the customised colours without touching component markup.

export interface FormThemeColors {
  /** Page background */
  background: string;
  /** Default text colour */
  foreground: string;
  /** Card / field surface */
  card: string;
  /** Primary brand colour (buttons, active states) */
  primary: string;
  /** Accent / secondary highlight */
  accent: string;
  /** Header band background */
  headerBg: string;
  /** Header band text */
  headerText: string;
  /** Border colour */
  border: string;
}

export type FormLayoutDensity = "compact" | "comfortable" | "spacious";
export type FormCardStyle = "flat" | "bordered" | "elevated";

export interface FormTheme {
  /** When false the form uses the global app theme (no overrides). */
  enabled: boolean;
  /** Vertical spacing between fields/groups. */
  density: FormLayoutDensity;
  /** Number of columns for fields on wide screens. */
  columns: 1 | 2;
  /** Card surface treatment. */
  cardStyle: FormCardStyle;
  /** Corner radius (CSS length, e.g. "0.75rem"). */
  radius: string;
  /** Heading/body font family. */
  font: string;
  /** Light-mode palette (hex). */
  light: FormThemeColors;
  /** Dark-mode palette (hex). */
  dark: FormThemeColors;
}

export const DEFAULT_FORM_THEME: FormTheme = {
  enabled: false,
  density: "comfortable",
  columns: 1,
  cardStyle: "elevated",
  radius: "0.75rem",
  font: "Inter",
  light: {
    background: "#f6f8fb",
    foreground: "#0f172a",
    card: "#ffffff",
    primary: "#2563eb",
    accent: "#0ea5e9",
    headerBg: "#0c2340",
    headerText: "#ffffff",
    border: "#e2e8f0",
  },
  dark: {
    background: "#0b1120",
    foreground: "#e2e8f0",
    card: "#111a2e",
    primary: "#3b82f6",
    accent: "#38bdf8",
    headerBg: "#0c1a33",
    headerText: "#f8fafc",
    border: "#1e293b",
  },
};

export const FONT_CHOICES = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Poppins",
  "Montserrat",
  "Nunito",
  "Source Sans 3",
  "system-ui",
];

/** Merge a partial/legacy theme object onto the defaults. */
export function normalizeFormTheme(input: any): FormTheme {
  if (!input || typeof input !== "object") return { ...DEFAULT_FORM_THEME };
  const d = DEFAULT_FORM_THEME;
  // Legacy templates stored a flat { primary, accent, headerBg, headerText, cardBg, radius, font }.
  const legacyLight: Partial<FormThemeColors> = {
    primary: input.primary,
    accent: input.accent,
    headerBg: input.headerBg,
    headerText: input.headerText,
    card: input.cardBg,
  };
  const light = { ...d.light, ...stripUndefined(legacyLight), ...stripUndefined(input.light) };
  const dark = { ...d.dark, ...stripUndefined(input.dark) };
  return {
    enabled: input.enabled ?? (!!input.primary || !!input.light), // legacy themes count as enabled
    density: input.density ?? d.density,
    columns: input.columns === 2 ? 2 : 1,
    cardStyle: input.cardStyle ?? d.cardStyle,
    radius: input.radius ?? d.radius,
    font: input.font ?? d.font,
    light,
    dark,
  };
}

function stripUndefined<T extends Record<string, any>>(o?: T): Partial<T> {
  if (!o) return {};
  const out: any = {};
  for (const k of Object.keys(o)) if (o[k] !== undefined && o[k] !== null && o[k] !== "") out[k] = o[k];
  return out;
}

/** Convert "#rrggbb" (or "#rgb") to "H S% L%" channel string for shadcn vars. */
export function hexToHslChannels(hex: string): string {
  let h = (hex || "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return "0 0% 0%";
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hue = 0;
  let sat = 0;
  const lum = (max + min) / 2;
  if (max !== min) {
    const dlt = max - min;
    sat = lum > 0.5 ? dlt / (2 - max - min) : dlt / (max + min);
    switch (max) {
      case r: hue = (g - b) / dlt + (g < b ? 6 : 0); break;
      case g: hue = (b - r) / dlt + 2; break;
      default: hue = (r - g) / dlt + 4;
    }
    hue /= 6;
  }
  return `${Math.round(hue * 360)} ${Math.round(sat * 100)}% ${Math.round(lum * 100)}%`;
}

/** Relative luminance helper to pick a readable foreground on a colour. */
function isLightColor(hex: string): boolean {
  let h = (hex || "").trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

const DENSITY_GAP: Record<FormLayoutDensity, string> = {
  compact: "0.5rem",
  comfortable: "1rem",
  spacious: "1.75rem",
};

/**
 * Build the scoped CSS-variable overrides + layout custom props for a theme.
 * Returns a style object to spread onto the form's root container.
 */
export function buildFormThemeStyle(theme: FormTheme, isDark: boolean): React.CSSProperties {
  if (!theme?.enabled) return {};
  const c = isDark ? theme.dark : theme.light;
  const fg = hexToHslChannels(c.foreground);
  const style: Record<string, string> = {
    "--background": hexToHslChannels(c.background),
    "--foreground": fg,
    "--card": hexToHslChannels(c.card),
    "--card-foreground": fg,
    "--popover": hexToHslChannels(c.card),
    "--popover-foreground": fg,
    "--primary": hexToHslChannels(c.primary),
    "--primary-foreground": hexToHslChannels(isLightColor(c.primary) ? "#0f172a" : "#ffffff"),
    "--accent": hexToHslChannels(c.accent),
    "--accent-foreground": hexToHslChannels(isLightColor(c.accent) ? "#0f172a" : "#ffffff"),
    "--secondary": hexToHslChannels(c.accent),
    "--secondary-foreground": hexToHslChannels(isLightColor(c.accent) ? "#0f172a" : "#ffffff"),
    "--border": hexToHslChannels(c.border),
    "--input": hexToHslChannels(c.border),
    "--ring": hexToHslChannels(c.primary),
    "--radius": theme.radius || "0.75rem",
    // Custom props consumed by the FormFiller header/layout.
    "--form-header-bg": hexToHslChannels(c.headerBg),
    "--form-header-text": hexToHslChannels(c.headerText),
    "--form-field-gap": DENSITY_GAP[theme.density] || "1rem",
    fontFamily: theme.font ? `${theme.font}, system-ui, sans-serif` : undefined as any,
  };
  return style as React.CSSProperties;
}
