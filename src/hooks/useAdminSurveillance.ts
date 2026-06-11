import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

type SurveillanceAction =
  | "view_user_profile"
  | "edit_user_profile"
  | "change_user_role"
  | "activate_user"
  | "deactivate_user"
  | "approve_user"
  | "reject_user"
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
  | "revoke_all_sessions"
  | "respond_to_feedback"
  | "manage_dashboard"
  | "manage_case_types"
  | "manage_daily_targets"
  | "delete_user_permanently";

const CRITICAL_ACTIONS: SurveillanceAction[] = [
  "impersonate_user",
  "deactivate_user",
  "change_user_role",
  "delete_form",
  "delete_project",
  "delete_submission",
  "revoke_session",
  "revoke_all_sessions",
  "reject_user",
  "delete_user_permanently",
];

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

      const actorEmail = profile?.email || user.email || "";
      const actorRole = roleData?.role || "unknown";

      // Write to surveillance log
      await supabase.from("admin_surveillance_log" as any).insert({
        actor_id: user.id,
        actor_email: actorEmail,
        actor_role: actorRole,
        action_type: actionType,
        action_description: description,
        target_entity: targetEntity || null,
        target_id: targetId || null,
        user_agent: navigator.userAgent,
        metadata: metadata || {},
      });

      // For critical actions, notify the owner in real-time
      if (CRITICAL_ACTIONS.includes(actionType)) {
        // Find owner user_id
        const { data: ownerProfile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("is_owner", true)
          .single();

        if (ownerProfile && ownerProfile.user_id !== user.id) {
          const actionLabel = actionType.replace(/_/g, " ");
          await supabase.from("notifications").insert({
            user_id: ownerProfile.user_id,
            title: `🔒 Critical Admin Action: ${actionLabel}`,
            message: `${actorEmail} (${actorRole.replace(/_/g, " ")}) performed "${actionLabel}": ${description}`,
            type: "warning",
            category: "security",
            related_id: targetId || null,
          });
        }
      }
    } catch (e) {
      console.error("Surveillance log failed:", e);
    }
  }, []);

  return { logAction };
};
