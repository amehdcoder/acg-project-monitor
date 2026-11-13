export type MicroplanProjectRole = "collector" | "dashboard";
export interface MicroplanProjectAccess {
  project_id: string;
  project_name: string;
  access_level: "entry" | "dashboard";
}

export function projectRoleAccess(role: MicroplanProjectRole | null): "entry" | "dashboard" | "none" {
  return role === "collector" ? "entry" : role === "dashboard" ? "dashboard" : "none";
}

export function projectAccessIds(projects: MicroplanProjectAccess[], level?: "entry" | "dashboard"): string[] {
  return projects.filter(project => !level || project.access_level === level).map(project => project.project_id);
}

export function scopedProjectAccess(projects: MicroplanProjectAccess[], projectId: string): "entry" | "dashboard" | "none" {
  return projects.find(project => project.project_id === projectId)?.access_level ?? "none";
}

export const MICROPLAN_ACCESS_CHANGED = "amehnities:microplan-access-changed";