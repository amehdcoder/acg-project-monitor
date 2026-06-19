export const FORM_DRAFT_PREFIX = "form_draft_";
export const ACTIVE_FORM_FILL_KEY = "amehnities_active_form_fill_v1";
export const SILENT_UPDATE_RESTORE_KEY = "amehnities_silent_update_restore_v1";

export const getFormDraftKey = (formId: string) => `${FORM_DRAFT_PREFIX}${formId}`;

export const hasMeaningfulFormResponses = (responses: Record<string, any> | null | undefined): boolean => {
  if (!responses) return false;
  return Object.entries(responses).some(
    ([key, value]) =>
      !key.startsWith("_") &&
      value !== undefined &&
      value !== null &&
      value !== "" &&
      !(Array.isArray(value) && value.length === 0),
  );
};

export const hasActiveUserFormProgress = (): boolean => {
  try {
    const raw = localStorage.getItem(ACTIVE_FORM_FILL_KEY);
    if (!raw) return false;
    const active = JSON.parse(raw);
    if (!active?.formId || active.hasUserProgress !== true) return false;
    if (active.expiresAt && Date.now() > Number(active.expiresAt)) {
      localStorage.removeItem(ACTIVE_FORM_FILL_KEY);
      return false;
    }
    const draftRaw = localStorage.getItem(getFormDraftKey(active.formId));
    if (!draftRaw) return false;
    const draft = JSON.parse(draftRaw);
    return draft?.userEntered === true && hasMeaningfulFormResponses(draft.responses);
  } catch {
    return false;
  }
};