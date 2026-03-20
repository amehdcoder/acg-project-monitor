import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Pages that are restricted to owner only (other super admins need explicit grants)
export const RESTRICTED_PAGES = [
  { id: "surveillance", label: "Surveillance Log" },
  { id: "field-intelligence", label: "Field Intelligence" },
  { id: "spatial-analysis", label: "Spatial Analysis" },
  { id: "statistics", label: "Statistical Analysis" },
  { id: "users", label: "User Management" },
  { id: "math-modeling", label: "Math Modeling" },
  { id: "ml", label: "Machine Learning" },
  { id: "feedback", label: "Feedback" },
  { id: "integrations", label: "Integrations" },
  { id: "iteration-analysis", label: "Iteration Analysis" },
] as const;

export const RESTRICTED_PAGE_IDS = RESTRICTED_PAGES.map(p => p.id);

export const usePageAccess = () => {
  const { user, isOwner, isSuperAdmin, isAdmin, loading: authLoading } = useAuth();
  const [grantedPages, setGrantedPages] = useState<string[]>([]);
  const [loadingAccess, setLoadingAccess] = useState(true);

  const fetchAccess = useCallback(async () => {
    if (!user || authLoading) return;

    // Owner has access to everything
    if (isOwner) {
      setGrantedPages(RESTRICTED_PAGE_IDS as unknown as string[]);
      setLoadingAccess(false);
      return;
    }

    // Non-super-admins don't get restricted pages at all
    if (!isSuperAdmin) {
      setGrantedPages([]);
      setLoadingAccess(false);
      return;
    }

    // Super admins: check grants
    try {
      const { data } = await supabase
        .from("admin_page_access" as any)
        .select("page_id")
        .eq("user_id", user.id);

      setGrantedPages((data || []).map((r: any) => r.page_id));
    } catch {
      setGrantedPages([]);
    } finally {
      setLoadingAccess(false);
    }
  }, [user, isOwner, isSuperAdmin, authLoading]);

  useEffect(() => {
    fetchAccess();
  }, [fetchAccess]);

  /** Check if user can access a specific page */
  const canAccessPage = useCallback(
    (pageId: string): boolean => {
      // Not a restricted page — use normal admin checks
      if (!RESTRICTED_PAGE_IDS.includes(pageId as any)) return true;
      // Owner always has access
      if (isOwner) return true;
      // Super admin with grant
      if (isSuperAdmin && grantedPages.includes(pageId)) return true;
      return false;
    },
    [isOwner, isSuperAdmin, grantedPages]
  );

  return { canAccessPage, grantedPages, loadingAccess, refetch: fetchAccess };
};
