import { readFormsMemberProjects } from "./formsProjectMembership";

export const offlineFormKey = (userId: string, formId: string) => `user:${userId}:form:${formId}`;
export function ownedOfflineForm<T extends { id: string; project_id: string }>(form: T, userId: string) {
  return { ...form, id: offlineFormKey(userId, form.id), form_id: form.id, owner_user_id: userId };
}
export function visibleOfflineForms<T extends { id: string; project_id: string; form_id?: string; owner_user_id?: string }>(forms: T[], userId?: string | null): T[] {
  if (!userId) return [];
  const projects = new Set(readFormsMemberProjects(userId).map(p => p.id));
  return forms.filter(f => f.owner_user_id === userId && !!f.form_id && projects.has(f.project_id))
    .map(f => ({ ...f, id: f.form_id as string }));
}