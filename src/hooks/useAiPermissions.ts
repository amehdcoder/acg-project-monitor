/**
 * Resolves the current user's granular Amehnities AI capabilities.
 *
 * Owners hold every capability. Granted admins hold exactly what the Owner
 * toggled on their grant row; anything else is view-only.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  AiCapabilityKey,
  AiPermissions,
  EMPTY_AI_PERMISSIONS,
  FULL_AI_PERMISSIONS,
  isViewOnly,
  normalizeAiPermissions,
} from "@/lib/amehnitiesAi/aiPermissions";

export const AMEHNITIES_AI_PAGE_ID = "amehnities-ai";

export function useAiPermissions() {
  const { user, isOwner, isOwnerLevel } = useAuth();
  const ownerLevel = !!(isOwner || isOwnerLevel);
  const [permissions, setPermissions] = useState<AiPermissions>(
    ownerLevel ? FULL_AI_PERMISSIONS : EMPTY_AI_PERMISSIONS,
  );
  const [loading, setLoading] = useState(!ownerLevel);

  const load = useCallback(async () => {
    if (!user) {
      setPermissions(EMPTY_AI_PERMISSIONS);
      setLoading(false);
      return;
    }
    if (ownerLevel) {
      setPermissions(FULL_AI_PERMISSIONS);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("admin_page_access")
      .select("permissions")
      .eq("user_id", user.id)
      .eq("page_id", AMEHNITIES_AI_PAGE_ID)
      .maybeSingle();
    setPermissions(normalizeAiPermissions((data as any)?.permissions));
    setLoading(false);
  }, [user, ownerLevel]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live: the Owner can widen or narrow capabilities while the page is open.
  useEffect(() => {
    if (!user || ownerLevel) return;
    const channel = supabase
      .channel(`ai-perms-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "admin_page_access", filter: `user_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, ownerLevel, load]);

  const can = useCallback(
    (key: AiCapabilityKey) => ownerLevel || permissions[key] === true,
    [ownerLevel, permissions],
  );

  return { permissions, can, viewOnly: !ownerLevel && isViewOnly(permissions), loading, refresh: load };
}
