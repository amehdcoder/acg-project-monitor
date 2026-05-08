import { supabase } from "@/integrations/supabase/client";

export async function logCESAction(
  surveyId: string,
  action: string,
  payload: Record<string, any> = {},
  coords?: { lat?: number; lng?: number },
) {
  try {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    await supabase.from("ces_audit_log" as any).insert({
      survey_id: surveyId,
      actor_id: u.user.id,
      action,
      payload,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
    });
  } catch (e) {
    console.warn("CES audit log failed:", e);
  }
}
