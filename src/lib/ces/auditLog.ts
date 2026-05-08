import { supabase } from "@/integrations/supabase/client";
import { saveAuditOffline, getDeviceId } from "./offlineHouseholds";

export async function logCESAction(
  surveyId: string,
  action: string,
  payload: Record<string, any> = {},
  coords?: { lat?: number; lng?: number },
) {
  const ts = new Date().toISOString();
  const devId = getDeviceId();
  
  try {
    const { data: u } = await supabase.auth.getUser();
    
    if (!navigator.onLine) {
      await saveAuditOffline({
        local_id: crypto.randomUUID(),
        survey_id: surveyId,
        actor_id: u.user?.id ?? null,
        action,
        payload: JSON.stringify(payload),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        device_id: devId,
        created_at: ts,
        synced: false
      });
      return;
    }

    if (!u.user) return;
    await supabase.from("ces_audit_log" as any).insert({
      survey_id: surveyId,
      actor_id: u.user.id,
      action,
      payload,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      device_id: devId,
    });
  } catch (e) {
    console.warn("CES audit log failed:", e);
    // Fallback to offline even if we thought we were online
    try {
      const { data: u } = await supabase.auth.getUser();
      await saveAuditOffline({
        local_id: crypto.randomUUID(),
        survey_id: surveyId,
        actor_id: u.user?.id ?? null,
        action,
        payload: JSON.stringify(payload),
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        device_id: devId,
        created_at: ts,
        synced: false
      });
    } catch {}
  }
}
