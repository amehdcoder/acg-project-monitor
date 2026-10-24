import { componentInAreas } from "./projectTeam";
import type { FacilityAccessLevel } from "./facilities";

const clinicalComponent = componentInAreas(["eye", "ntd", "mental"]);
export const isFacilityClinicalComponent = (component: { key: string; label?: string }) =>
  component.key === "documents" || clinicalComponent(component);
export const FACILITY_WORKSPACE_VIEWS = new Set([
  "overview", "facility", "people", "records", "followups", "households", "casesearch", "guide",
]);
export const facilityRowVisible = (facilityId: string | null | undefined, levels: Record<string, FacilityAccessLevel>) =>
  Boolean(facilityId && levels[facilityId]);
export const facilityCanWrite = (levels: Record<string, FacilityAccessLevel>) =>
  Object.values(levels).some((level) => level === "record" || level === "manage");