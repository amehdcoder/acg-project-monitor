const expandHex = (hex: string) => {
  const clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) return clean.split("").map((c) => c + c).join("");
  return clean;
};

export function hexToRgb(hex: string): [number, number, number] {
  const clean = expandHex(hex);
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) throw new Error(`Invalid hex colour: ${hex}`);
  const value = Number.parseInt(clean, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foregroundHex: string, backgroundHex: string): number {
  const a = relativeLuminance(foregroundHex);
  const b = relativeLuminance(backgroundHex);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsWcagAA(foregroundHex: string, backgroundHex: string, largeText = false): boolean {
  return contrastRatio(foregroundHex, backgroundHex) >= (largeText ? 3 : 4.5);
}