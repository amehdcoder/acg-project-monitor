import { componentInAreas } from "./projectTeam";
import type { FacilityAccessLevel } from "./facilities";

export const isFacilityClinicalComponent = componentInAreas(["eye", "ntd", "mental"]);
export const FACILITY_WORKSPACE_VIEWS = new Set([
  "overview", "facility", "people", "records", "followups", "households", "casesearch", "guide",
]);
export const facilityRowVisible = (facilityId: string | null | undefined, levels: Record<string, FacilityAccessLevel>) =>
  Boolean(facilityId && levels[facilityId]);
export const facilityCanWrite = (levels: Record<string, FacilityAccessLevel>) =>
  Object.values(levels).some((level) => level === "record" || level === "manage");