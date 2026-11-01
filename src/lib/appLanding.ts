/** Explicit links navigate directly; reopening the app always starts at Forms. */
export function initialAppTab(urlTab: string | null): string {
  return urlTab || "forms";
}

/** Required workspaces override tab links, with Geo taking precedence. */
export function requiredWorkspace(geoActive: boolean, recordsActive: boolean): "geo" | "records" | null {
  if (geoActive) return "geo";
  if (recordsActive) return "records";
  return null;
}