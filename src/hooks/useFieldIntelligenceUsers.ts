import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Shared helper for Field Intelligence components.
 * Returns user IDs scoped to a project, or ALL active users when no project is selected.
 */
export const useFieldIntelligenceUsers = () => {
  const getUserIds = useCallback(async (projectId?: string): Promise<string[]> => {
    if (projectId) {
      const { data } = await supabase
        .from("user_project_assignments")
        .select("user_id")
        .eq("project_id", projectId);
      return data?.map(a => a.user_id) || [];
    }
    // No project filter — fetch all active users
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("is_active", true)
      .limit(500);
    return profiles?.map(p => p.user_id) || [];
  }, []);

  const getFormIds = useCallback(async (projectId?: string, formId?: string): Promise<string[]> => {
    if (formId) return [formId];
    if (projectId) {
      const { data } = await supabase
        .from("forms")
        .select("id")
        .eq("project_id", projectId);
      return data?.map(f => f.id) || [];
    }
    // All forms
    return [];
  }, []);

  return { getUserIds, getFormIds };
};
