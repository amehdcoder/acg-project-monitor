import type { CSSProperties } from "react";

export const validLogframeColor = (color: string | undefined): boolean => !color || /^#[0-9a-f]{6}$/i.test(color);
/** User-configured data becomes a scoped semantic token, never arbitrary CSS. */
export function logframeColorStyle(color?: string): CSSProperties | undefined {
  if (!color || !validLogframeColor(color)) return undefined;
  return { "--logframe-accent": color } as CSSProperties;
}