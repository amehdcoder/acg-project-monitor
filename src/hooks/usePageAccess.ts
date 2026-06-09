import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useUserAccess } from "@/hooks/useUserAccess";

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
  { id: "data-quality", label: "Data Quality" },
  { id: "microplanning", label: "Geo Microplanning" },
  { id: "quizzes", label: "Quizzes" },
] as const;

export const RESTRICTED_PAGE_IDS = RESTRICTED_PAGES.map(p => p.id);
type RestrictedPageId = (typeof RESTRICTED_PAGE_IDS)[number];

const isRestrictedPageId = (pageId: string): pageId is RestrictedPageId =>
  RESTRICTED_PAGE_IDS.includes(pageId as RestrictedPageId);

const getPageLabel = (pageId: string) =>
  RESTRICTED_PAGES.find(p => p.id === pageId)?.label || pageId;

// Field designations that get default access to Geo Microplanning entry forms.
const FIELD_DESIGNATIONS = new Set([
  "enumerator",
  "community_directed_distributor",
  "flhf_supervisor",
]);
// Pages these field designations can reach by default (in addition to Forms & Cases).
const FIELD_DESIGNATION_PAGES = new Set(["microplanning"]);

export const usePageAccess = () => {
  const { user, isOwner, isSuperAdmin, isAdmin, profile, loading: authLoading } = useAuth();
  const [grantedPages, setGrantedPages] = useState<string[]>([]);
  const [loadingAccess, setLoadingAccess] = useState(true);
  // Tier 2: a "Manage Microplanning Form Access" grant unlocks the full
  // Geo Microplanning dashboard page (sidebar), even for non-admins.
  const [hasMicroplanFormAccess, setHasMicroplanFormAccess] = useState(false);
  const initialLoadDone = useRef(false);
  const lastUserId = useRef<string | null>(null);

  const fetchAccess = useCallback(async () => {
    if (authLoading) {
      if (!initialLoadDone.current) setLoadingAccess(true);
      return;
    }

    if (!user) {
      setGrantedPages([]);
      setLoadingAccess(false);
      initialLoadDone.current = false;
      lastUserId.current = null;
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

  // Fetch the user's microplanning form-access grant (Tier 2 → full dashboard).
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setHasMicroplanFormAccess(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("microplan_form_access")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);
      if (!cancelled) setHasMicroplanFormAccess(!!data && data.length > 0);
    })();
    return () => { cancelled = true; };
  }, [user?.id, authLoading]);



  // Realtime subscription for super admins (not owner)
  useEffect(() => {
    if (!user || authLoading || isOwner || !isSuperAdmin) return;

    // Remove any stale channel with the same topic to avoid
    // "cannot add postgres_changes callbacks after subscribe()" errors
    // that occur when an effect re-runs (or under React strict mode).
    const topic = `page-access-${user.id}`;
    try {
      supabase
        .getChannels()
        .filter((c) => c.topic === `realtime:${topic}`)
        .forEach((c) => supabase.removeChannel(c));
    } catch {
      /* noop */
    }

    const channel = supabase
      .channel(topic)
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
            const pageId = String((payload.new as Record<string, unknown>).page_id || "");
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
            const pageId = String((payload.old as Record<string, unknown>).page_id || "");
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

  // Owner-granted user-level page access (with optional time window).
  // Available to ANY user — not just super admins.
  const { canAccessUserPage } = useUserAccess();

  const designation = (profile?.designation || "").toLowerCase();
  const isFieldDesignation = FIELD_DESIGNATIONS.has(designation);

  const canAccessPage = useCallback(
    (pageId: string): boolean => {
      if (loadingAccess) return true;
      if (isOwner) return true;
      // Owner-granted, time-bounded per-user access works for any page id.
      if (canAccessUserPage(pageId)) return true;
      // Field designations (FLHF Supervisor, Enumerator, CDD) get default
      // access to the Geo Microplanning entry forms.
      if (isFieldDesignation && FIELD_DESIGNATION_PAGES.has(pageId)) return true;
      // Tier 2: a "Manage Microplanning Form Access" grant unlocks the full
      // Geo Microplanning dashboard page for any user.
      if (pageId === "microplanning" && hasMicroplanFormAccess) return true;
      // Restricted pages: super admins can be granted access by the owner.
      if (isRestrictedPageId(pageId)) {
        if (isSuperAdmin && grantedPages.includes(pageId)) return true;
        return false;
      }
      // Non-restricted pages: admins always pass; regular users only get
      // the always-on Forms & Cases pages unless the owner grants more.
      if (isAdmin) return true;
      if (pageId === "forms" || pageId === "cases" || pageId === "community-forum") return true;
      return false;
    },
    [isOwner, isAdmin, isSuperAdmin, grantedPages, loadingAccess, canAccessUserPage, isFieldDesignation, hasMicroplanFormAccess]
  );

  const refetch = useCallback(async () => {
    // Force refetch by resetting the guard
    lastUserId.current = null;
    initialLoadDone.current = false;
    await fetchAccess();
  }, [fetchAccess]);

  return { canAccessPage, grantedPages, loadingAccess, refetch };
};

