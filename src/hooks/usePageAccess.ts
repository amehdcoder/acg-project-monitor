import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

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

const getPageLabel = (pageId: string) =>
  RESTRICTED_PAGES.find(p => p.id === pageId)?.label || pageId;

export const usePageAccess = () => {
  const { user, isOwner, isSuperAdmin, isAdmin, loading: authLoading } = useAuth();
  const [grantedPages, setGrantedPages] = useState<string[]>([]);
  const [loadingAccess, setLoadingAccess] = useState(true);
  const initialLoadDone = useRef(false);
  const lastUserId = useRef<string | null>(null);

  const fetchAccess = useCallback(async () => {
    if (!user || authLoading) {
      // Only set loading if we haven't loaded yet (prevent flicker on re-renders)
      if (!initialLoadDone.current) {
        setLoadingAccess(true);
      }
      return;
    }

    // Skip refetch if same user and already loaded
    if (initialLoadDone.current && lastUserId.current === user.id) {
      return;
    }

    if (isOwner) {
      setGrantedPages(RESTRICTED_PAGE_IDS as unknown as string[]);
      setLoadingAccess(false);
      initialLoadDone.current = true;
      lastUserId.current = user.id;
      return;
    }

    if (!isSuperAdmin) {
      setGrantedPages([]);
      setLoadingAccess(false);
      initialLoadDone.current = true;
      lastUserId.current = user.id;
      return;
    }

    try {
      const { data, error } = await supabase
        .from("admin_page_access")
        .select("page_id")
        .eq("user_id", user.id);

      if (error) {
        console.error("Error fetching page access grants:", error);
        setGrantedPages([]);
      } else {
        setGrantedPages((data || []).map((r) => r.page_id));
      }
    } catch (e) {
      console.error("Failed to fetch page access:", e);
      setGrantedPages([]);
    } finally {
      setLoadingAccess(false);
      initialLoadDone.current = true;
      lastUserId.current = user.id;
    }
  }, [user, isOwner, isSuperAdmin, authLoading]);

  useEffect(() => {
    fetchAccess();
  }, [fetchAccess]);

  // Realtime subscription for super admins (not owner)
  useEffect(() => {
    if (!user || authLoading || isOwner || !isSuperAdmin) return;

    const channel = supabase
      .channel(`page-access-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "admin_page_access",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // Only show toasts after initial load
          if (!initialLoadDone.current) return;

          if (payload.eventType === "INSERT") {
            const pageId = (payload.new as any).page_id;
            const label = getPageLabel(pageId);
            setGrantedPages(prev =>
              prev.includes(pageId) ? prev : [...prev, pageId]
            );
            toast({
              title: "🔓 Page Access Granted",
              description: `You now have access to "${label}". It's available in the sidebar.`,
              duration: 6000,
            });
          } else if (payload.eventType === "DELETE") {
            const pageId = (payload.old as any).page_id;
            const label = getPageLabel(pageId);
            setGrantedPages(prev => prev.filter(p => p !== pageId));
            toast({
              title: "🔒 Page Access Revoked",
              description: `Your access to "${label}" has been removed.`,
              variant: "destructive",
              duration: 6000,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, authLoading, isOwner, isSuperAdmin]);

  const canAccessPage = useCallback(
    (pageId: string): boolean => {
      if (!RESTRICTED_PAGE_IDS.includes(pageId as any)) return true;
      if (loadingAccess) return false;
      if (isOwner) return true;
      if (isSuperAdmin && grantedPages.includes(pageId)) return true;
      return false;
    },
    [isOwner, isSuperAdmin, grantedPages, loadingAccess]
  );

  return { canAccessPage, grantedPages, loadingAccess, refetch: fetchAccess };
};
