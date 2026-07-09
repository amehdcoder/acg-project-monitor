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
  const { user, isOwner, isOwnerLevel, isSuperAdmin, isAdmin, profile, loading: authLoading } = useAuth();
  const [grantedPages, setGrantedPages] = useState<string[]>([]);
  const [loadingAccess, setLoadingAccess] = useState(true);
  // Tier 2: a "Manage Microplanning Form Access" grant unlocks the full
  // Geo Microplanning dashboard page (sidebar), even for non-admins.
  const [hasMicroplanFormAccess, setHasMicroplanFormAccess] = useState(false);
  // "Minimal access" lock: when set, a non-admin user only sees Forms, Project
  // Chat and My Submissions — regardless of their designation defaults.
  const [minimalAccess, setMinimalAccess] = useState(false);
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

    // Any admin (Super Admin OR Systems Admin) can be granted restricted pages
    // by the Owner. Non-admins have no per-admin grants to fetch.
    if (!isAdmin) {
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
  }, [user, isOwner, isSuperAdmin, isAdmin, authLoading]);

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

  // Fetch the user's "minimal access" lock (Forms / Project Chat / My Submissions only).
  // Admins are never minimal-locked.
  useEffect(() => {
    if (authLoading) return;
    if (!user || isAdmin || isOwner) { setMinimalAccess(false); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("user_minimal_access" as any)
        .select("id")
        .eq("user_id", user.id)
        .limit(1);
      if (!cancelled) setMinimalAccess(!!data && data.length > 0);
    })();
    return () => { cancelled = true; };
  }, [user?.id, authLoading, isAdmin, isOwner]);



  // Realtime grant updates for any admin (Super Admin or Systems Admin), not the
  // Owner (who always has every page).
  useEffect(() => {
    if (!user || authLoading || isOwner || !isAdmin) return;

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
  }, [user, authLoading, isOwner, isAdmin]);

  // Owner-granted user-level page access (with optional time window).
  // Available to ANY user — not just super admins.
  const { canAccessUserPage, loadingUserAccess } = useUserAccess();

  const designation = (profile?.designation || "").toLowerCase();
  const isFieldDesignation = FIELD_DESIGNATIONS.has(designation);

  const canAccessPage = useCallback(
    (pageId: string): boolean => {
      // Owner/admin status comes from auth and resolves independently of the
      // grant fetch, so honour those immediately. While the per-user grants are
      // still loading we DEFAULT-DENY restricted pages instead of default-allow,
      // which previously caused restricted sidebar items to flash for users who
      // were never entitled to them. Content rendering in Index gates on
      // `loadingAccess` separately (spinner), so this never blocks a legitimate
      // page — it only prevents the unauthorized flash.
      if (isOwner) return true;
      // Co-owners are owner-level ("near-full app rights") — grant every page,
      // including the restricted ones, just like the Owner.
      if (isOwnerLevel) return true;
      // Minimal-access lock (non-admins only): ONLY Forms, Project Chat and My
      // Submissions — PLUS any page explicitly granted to the user via
      // user_page_access (an explicit owner grant always overrides the lock).
      if (minimalAccess && !isAdmin) {
        return (
          pageId === "forms" ||
          pageId === "project-chat" ||
          pageId === "my-submissions" ||
          canAccessUserPage(pageId)
        );
      }

      // Owner-granted, time-bounded per-user access works for any page id.
      if (canAccessUserPage(pageId)) return true;
      // Field designations (FLHF Supervisor, Enumerator, CDD) get default
      // access to the Geo Microplanning entry forms.
      if (isFieldDesignation && FIELD_DESIGNATION_PAGES.has(pageId)) return true;
      // Tier 2: a "Manage Microplanning Form Access" grant unlocks the full
      // Geo Microplanning dashboard page for any user.
      if (pageId === "microplanning" && hasMicroplanFormAccess) return true;
      // Restricted pages: any admin (Super Admin or Systems Admin) can be
      // granted access by the owner via admin_page_access.
      if (isRestrictedPageId(pageId)) {
        if (isAdmin && grantedPages.includes(pageId)) return true;
        return false;
      }
      // Non-restricted pages: admins always pass; regular users only get
      // the always-on Forms & Cases pages unless the owner grants more.
      if (isAdmin) return true;
      if (pageId === "forms" || pageId === "cases" || pageId === "community-forum" || pageId === "project-chat") return true;
      return false;
    },
    [isOwner, isOwnerLevel, isAdmin, isSuperAdmin, grantedPages, loadingAccess, canAccessUserPage, isFieldDesignation, hasMicroplanFormAccess, minimalAccess]
  );

  const refetch = useCallback(async () => {
    // Force refetch by resetting the guard
    lastUserId.current = null;
    initialLoadDone.current = false;
    await fetchAccess();
  }, [fetchAccess]);

  // Surface per-user grant loading too, so callers (e.g. Index's guardedPage
  // spinner) wait for time-bounded grants to resolve before deciding access —
  // preventing a brief "Access Restricted" flash for users who DO have a grant.
  return { canAccessPage, grantedPages, minimalAccess, loadingAccess: loadingAccess || loadingUserAccess, refetch };
};

