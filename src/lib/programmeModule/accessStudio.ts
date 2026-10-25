// Access studio — Super Admins decide, per user category, what each kind of
// person can see and do in the Longitudinal Beneficiary Records. Saved per
// project in `project_access_profiles`; applied to team members who follow a
// category and to "View as" previews.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TeamPermissions } from "./projectTeam";
import type { ViewAsRole } from "./viewAs";

export const ACCESS_PAGES: { group: string; items: { key: string; label: string }[] }[] = [
  { group: "Main tabs", items: [
    { key: "report", label: "Programme report" }, { key: "assessments", label: "Quizzes & assessments" },
    { key: "brain", label: "Record quality brain" }, { key: "guide", label: "Field guide" },
  ] },
  { group: "Overview", items: [
    { key: "dashboard", label: "General dashboard" }, { key: "journey", label: "Beneficiary journey" },
    { key: "facility", label: "Facility dashboard" }, { key: "clusters", label: "Community clusters" },
    { key: "graduation", label: "Graduation pathway" },
  ] },
  { group: "People & care", items: [
    { key: "records", label: "Beneficiary records" }, { key: "followups", label: "Follow-ups & referrals" },
    { key: "households", label: "Households & MDA" }, { key: "casesearch", label: "CDD case search" },
    { key: "livelihood", label: "Livelihood & empowerment" },
  ] },
  { group: "Intelligence", items: [
    { key: "network", label: "Transmission network" }, { key: "risk", label: "Follow-up risk & CHEW visits" },
    { key: "exchange", label: "Data exchange" },
  ] },
  { group: "Protection", items: [
    { key: "safeguarding_dashboard", label: "Safeguarding dashboard" }, { key: "safeguarding", label: "Safeguarding cases" },
    { key: "feedback", label: "Community feedback" },
  ] },
];

export const PROFILE_SECTIONS: { key: string; label: string }[] = [
  { key: "lesions", label: "Lesion staging" }, { key: "outcomes", label: "Outcomes" },
  { key: "care", label: "Care network & medication" }, { key: "mda", label: "MDA rounds" },
  { key: "history", label: "History" },
];

/** True when the access settings allow this page or tab. */
export const pageAllowed = (perms: TeamPermissions | null | undefined, key: string) =>
  !(perms?.hidden_views || []).includes(key);

export const toggleList = (list: string[] | undefined, key: string, on: boolean) => {
  const set = new Set(list || []);
  if (on) set.delete(key); else set.add(key);
  return Array.from(set);
};

type Profiles = Partial<Record<ViewAsRole, TeamPermissions>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const useAccessProfiles = (projectId?: string) => {
  const [profiles, setProfiles] = useState<Profiles>({});
  const load = useCallback(async () => {
    if (!projectId) return;
    const { data, error } = await db.from("project_access_profiles").select("role_key,permissions").eq("project_id", projectId);
    if (error) return;
    const next: Profiles = {};
    for (const r of (data || []) as { role_key: ViewAsRole; permissions: TeamPermissions }[]) next[r.role_key] = r.permissions;
    setProfiles(next);
  }, [projectId]);
  useEffect(() => {
    void load();
    const refresh = () => { void load(); };
    window.addEventListener("programme-access-changed", refresh);
    window.addEventListener("focus", refresh);
    const poll = window.setInterval(refresh, 60_000);
    return () => {
      window.removeEventListener("programme-access-changed", refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(poll);
    };
  }, [load]);

  const save = async (role: ViewAsRole, permissions: TeamPermissions) => {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await db.from("project_access_profiles").upsert({
      project_id: projectId, role_key: role, permissions, updated_by: auth.user?.id, updated_at: new Date().toISOString(),
    });
    if (error) throw error;
    setProfiles((p) => ({ ...p, [role]: permissions }));
    window.dispatchEvent(new Event("programme-access-changed"));
  };
  const reset = async (role: ViewAsRole) => {
    const { error } = await db.from("project_access_profiles").delete().eq("project_id", projectId).eq("role_key", role);
    if (error) throw error;
    setProfiles((p) => { const n = { ...p }; delete n[role]; return n; });
    window.dispatchEvent(new Event("programme-access-changed"));
  };
  return { profiles, save, reset, reload: load };
};
