import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type SurveillanceAction =
  | "view_user_profile"
  | "edit_user_profile"
  | "change_user_role"
  | "activate_user"
  | "deactivate_user"
  | "impersonate_user"
  | "stop_impersonation"
  | "view_submissions"
  | "delete_submission"
  | "create_form"
  | "edit_form"
  | "delete_form"
  | "create_project"
  | "edit_project"
  | "delete_project"
  | "assign_user_to_project"
  | "assign_user_to_form"
  | "view_audit_logs"
  | "view_surveillance_logs"
  | "export_data"
  | "manage_geofence"
  | "revoke_session"
  | "respond_to_feedback"
  | "manage_dashboard"
  | "manage_case_types"
  | "manage_daily_targets";

export const useAdminSurveillance = () => {
  const logAction = useCallback(async (
    actionType: SurveillanceAction,
    description: string,
    targetEntity?: string,
    targetId?: string,
    metadata?: Record<string, unknown>
  ) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("user_id", user.id)
        .single();

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .single();

      await supabase.from("admin_surveillance_log" as any).insert({
        actor_id: user.id,
        actor_email: profile?.email || user.email || "",
        actor_role: roleData?.role || "unknown",
        action_type: actionType,
        action_description: description,
        target_entity: targetEntity || null,
        target_id: targetId || null,
        user_agent: navigator.userAgent,
        metadata: metadata || {},
      });
    } catch (e) {
      console.error("Surveillance log failed:", e);
    }
  }, []);

  return { logAction };
};
