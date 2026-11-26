import { offlineFormContentChanged } from "./offlineFormPlan";

export interface FormDownloadForm extends Record<string, any> {
  id: string;
  name: string;
  description?: string | null;
  project_id: string;
  updated_at?: string | null;
}

export type FormDownloadStatus = "new" | "update" | "current";

export interface FormDownloadItem {
  form: FormDownloadForm;
  projectName: string;
  status: FormDownloadStatus;
  downloadedAt?: string;
}

export interface FormDownloadResult {
  added: number;
  updated: number;
  unchanged: number;
}

const cachedFormId = (form: Record<string, any>) => String(form.form_id || form.id || "");

export function getFormDownloadStatus(
  form: FormDownloadForm,
  cached?: Record<string, any> | null,
): FormDownloadStatus {
  if (!cached) return "new";
  return offlineFormContentChanged(cached, form) ? "update" : "current";
}

/** Build the complete authorized download list, independent of the Forms-page filter. */
export function buildFormDownloadItems(
  authorizedForms: FormDownloadForm[],
  cachedForms: Record<string, any>[],
  projects: { id: string; name: string }[],
): FormDownloadItem[] {
  const cachedById = new Map(cachedForms.map((form) => [cachedFormId(form), form]));
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const unique = new Map<string, FormDownloadForm>();

  for (const form of authorizedForms) {
    if (form?.id) unique.set(String(form.id), form);
  }

  const statusOrder: Record<FormDownloadStatus, number> = { update: 0, new: 1, current: 2 };
  return Array.from(unique.values())
    .map((form) => {
      const cached = cachedById.get(String(form.id));
      return {
        form,
        projectName: projectNames.get(form.project_id) || "Project form",
        status: getFormDownloadStatus(form, cached),
        downloadedAt: cached?.downloaded_at,
      };
    })
    .sort((a, b) =>
      statusOrder[a.status] - statusOrder[b.status] ||
      a.projectName.localeCompare(b.projectName) ||
      a.form.name.localeCompare(b.form.name),
    );
}

export function downloadableFormIds(items: FormDownloadItem[]): string[] {
  return items.filter((item) => item.status !== "current").map((item) => item.form.id);
}
