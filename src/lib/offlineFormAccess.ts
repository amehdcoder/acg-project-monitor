import { readFormsMemberProjects } from "./formsProjectMembership";

export const offlineFormKey = (userId: string, formId: string) => `user:${userId}:form:${formId}`;
const grantKey = (userId: string) => `amehnities:forms:verified-form-ids:v1:${userId}`;
const specialGrantKey = (userId: string) => `amehnities:forms:verified-special-ids:v1:${userId}`;
export function writeSpecialFormGrants(userId: string, formIds: string[]) {
  localStorage.setItem(specialGrantKey(userId), JSON.stringify(formIds));
  window.dispatchEvent(new Event("forms-project-access"));
}
export function writeOfflineFormGrants(userId: string, formIds: string[]) {
  try { localStorage.setItem(grantKey(userId), JSON.stringify(formIds)); window.dispatchEvent(new Event("forms-project-access")); } catch { /* unavailable storage */ }
}
export function canOpenOfflineForm(userId: string | null | undefined, formId: string, projectId: string): boolean {
  if (!userId || !readFormsMemberProjects(userId).some(p => p.id === projectId)) return false;
  try {
    const ids = JSON.parse(localStorage.getItem(formId.startsWith("special:") ? specialGrantKey(userId) : grantKey(userId)) || "null");
    return Array.isArray(ids) && ids.includes(formId);
  } catch { return false; }
}
export function ownedOfflineForm<T extends { id: string; project_id: string }>(form: T, userId: string) {
  return { ...form, id: offlineFormKey(userId, form.id), form_id: form.id, owner_user_id: userId };
}
export function visibleOfflineForms<T extends { id: string; project_id: string; form_id?: string; owner_user_id?: string }>(forms: T[], userId?: string | null): T[] {
  if (!userId) return [];
  const projects = new Set(readFormsMemberProjects(userId).map(p => p.id));
  return forms.filter(f => f.owner_user_id === userId && !!f.form_id && projects.has(f.project_id) && canOpenOfflineForm(userId, f.form_id, f.project_id))
    .map(f => ({ ...f, id: f.form_id as string }));
}