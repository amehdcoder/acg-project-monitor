import { describe, expect, it } from "vitest";
import { ACSM_DASHBOARD_PALETTE } from "@/lib/acsm/dashboardPalette";
import { contrastRatio, meetsWcagAA } from "./contrast";

describe("theme contrast checks", () => {
  it("keeps Advocacy Dashboard text, borders and chart labels readable in dark mode", () => {
    const p = ACSM_DASHBOARD_PALETTE.dark;

    expect(meetsWcagAA(p.text, p.bg)).toBe(true);
    expect(meetsWcagAA(p.sub, p.bg)).toBe(true);
    expect(meetsWcagAA(p.text, p.panel)).toBe(true);
    expect(meetsWcagAA(p.sub, p.panel)).toBe(true);
    expect(meetsWcagAA(p.primary, p.bg)).toBe(true);
    expect(meetsWcagAA(p.success, p.panel)).toBe(true);
    expect(meetsWcagAA(p.warning, p.panel)).toBe(true);
    expect(meetsWcagAA(p.danger, p.panel)).toBe(true);
    expect(meetsWcagAA(p.blue, p.panel)).toBe(true);

    // Non-text UI elements such as chart gridlines and panel borders meet the 3:1 AA threshold.
    expect(contrastRatio(p.border, p.bg)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(p.borderSoft, p.panel)).toBeGreaterThanOrEqual(3);
  });

  it("keeps Advocacy Dashboard text readable in light mode", () => {
    const p = ACSM_DASHBOARD_PALETTE.light;

    expect(meetsWcagAA(p.text, p.bg)).toBe(true);
    expect(meetsWcagAA(p.sub, p.bg)).toBe(true);
    expect(meetsWcagAA(p.text, p.panel)).toBe(true);
    expect(meetsWcagAA(p.sub, p.panel)).toBe(true);
    expect(meetsWcagAA(p.primary, p.panel)).toBe(true);
    expect(meetsWcagAA(p.success, p.panel)).toBe(true);
    expect(meetsWcagAA(p.warning, p.panel)).toBe(true);
    expect(meetsWcagAA(p.danger, p.panel)).toBe(true);
    expect(meetsWcagAA(p.blue, p.panel)).toBe(true);
  });
});