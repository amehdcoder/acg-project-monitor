// Cross-device audit reporter for the Bloomberg School Enrolment Validation form.
//
// Each user's device holds its own form lifecycle records in IndexedDB
// (drafts, ready-to-send/finalized, successfully submitted) plus a crash-safe
// in-progress draft in localStorage. The validation dashboard cannot read
// another user's device directly, so every device reports a small summary of
// its local Bloomberg form state to a central table
// (`bloomberg_local_form_audit`). The dashboard then aggregates these reports
// in its Accountability section, giving a true audit log of drafts, ready-to-send
// and submitted forms across ALL users and devices.

import { supabase } from "@/integrations/supabase/client";
import { listSavedEntries } from "@/lib/savedForms";
import { BLOOMBERG_FORM_ID } from "@/lib/specialFormBridge";
import { getAuditDeviceId } from "@/lib/offlineAuditLog";
import { hasMeaningfulFormResponses } from "@/lib/formProgressPersistence";

const BLOOMBERG_DRAFT_KEY = (uid?: string | null) =>
  `bloomberg_validation_draft_v2_${uid || "anon"}`;

const deviceLabel = (): string => {
  try {
    const ua = navigator.userAgent || "";
    const platform = (navigator as any).platform || "";
    // Keep it short & human-readable for the dashboard.
    const m = ua.match(/\(([^)]+)\)/);
    return (m?.[1] || platform || "Unknown device").slice(0, 80);
  } catch {
    return "Unknown device";
  }
};

/** Count the crash-safe in-progress draft (localStorage) as a draft when it
 * actually holds user-entered figures. */
const hasActiveLocalDraft = (userId: string): boolean => {
  try {
    const raw = localStorage.getItem(BLOOMBERG_DRAFT_KEY(userId));
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    const responses = parsed?.responses ?? parsed;
    return hasMeaningfulFormResponses(responses);
  } catch {
    return false;
  }
};

/**
 * Compute this device's Bloomberg form counts and upsert them to the central
 * audit table. Safe to call often and never throws — auditing must not break
 * the form. No-ops when there is no signed-in user.
 */
export const reportBloombergLocalAudit = async (): Promise<void> => {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return;

    const all = await listSavedEntries(user.id);
    const bloomberg = all.filter(
      (e) =>
        e.formId === BLOOMBERG_FORM_ID ||
        e.submissionType === BLOOMBERG_FORM_ID ||
        (e.settings as any)?.specialForm === "bloomberg-school-enrolment-validation",
    );

    let drafts = bloomberg.filter((e) => e.status === "draft").length;
    const readyToSend = bloomberg.filter((e) => e.status === "finalized").length;
    const submitted = bloomberg.filter((e) => e.status === "sent").length;
    if (hasActiveLocalDraft(user.id)) drafts += 1;

    const lastActivity = bloomberg.reduce<string | null>((latest, e) => {
      const t = e.updatedAt || e.createdAt;
      if (!t) return latest;
      return !latest || new Date(t).getTime() > new Date(latest).getTime() ? t : latest;
    }, null);

    await supabase
      .from("bloomberg_local_form_audit" as any)
      .upsert(
        {
          user_id: user.id,
          device_id: getAuditDeviceId(),
          device_label: deviceLabel(),
          drafts,
          ready_to_send: readyToSend,
          submitted,
          last_activity_at: lastActivity,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,device_id" },
      );
  } catch (e) {
    console.warn("Bloomberg local audit report failed:", e);
  }
};
