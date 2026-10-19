// Donor portal data access. Everything here is aggregate-only: donors never
// receive row-level beneficiary data — the server-side RPCs group counts and
// the report tables expose only submitted programme reporting artefacts.

import { supabase } from "@/integrations/supabase/client";
import { defaultLogframe, type ProjectLogframe } from "./programmeModule/logframe";

const db = supabase as unknown as { from: (t: string) => any; rpc: (fn: string, args?: any) => any }; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface DonorGrant {
  id: string;
  project_id: string;
  user_id: string;
  organization: string | null;
  label: string | null;
  active: boolean;
  created_at: string;
  project?: { id: string; name: string } | null;
}

export interface DonorAggregates {
  total_beneficiaries: number;
  active_beneficiaries: number;
  by_sex: Record<string, number>;
  by_state: Record<string, number>;
  by_lga: Record<string, number>;
  by_age_band: Record<string, number>;
  with_disability: number;
  total_services: number;
  services_by_component: Record<string, number>;
  services_by_month: { month: string; count: number }[];
  registrations_by_month: { month: string; count: number }[];
  home_visits_completed: number;
  referrals_total: number;
  feedback_total: number;
}

export interface DonorActivityItem {
  kind: "service" | "home_visit" | "feedback";
  summary: string;
  component: string | null;
  state: string | null;
  lga: string | null;
  occurred_at: string;
}

export interface DonorReportEntry {
  indicator_code: string;
  value: number | null;
  disaggregation: Record<string, number> | null;
  risk: string | null;
}

export interface DonorReport {
  id: string;
  period_label: string;
  report_year: number | null;
  notes: string | null;
  status: string | null;
  created_at: string;
  entries: DonorReportEntry[];
}

/** Projects the signed-in user may view as a donor. */
export async function listDonorGrants(userId: string): Promise<DonorGrant[]> {
  const { data, error } = await db
    .from("donor_viewers")
    .select("id, project_id, user_id, organization, label, active, created_at, project:projects(id, name)")
    .eq("user_id", userId)
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as DonorGrant[];
}

export async function loadDonorAggregates(projectId: string): Promise<DonorAggregates> {
  const { data, error } = await db.rpc("donor_project_aggregates", { _project_id: projectId });
  if (error) throw new Error(error.message);
  return data as DonorAggregates;
}

export async function loadDonorFieldActivity(projectId: string, limit = 30): Promise<DonorActivityItem[]> {
  const { data, error } = await db.rpc("donor_field_activity", { _project_id: projectId, _limit: limit });
  if (error) throw new Error(error.message);
  return (data ?? []) as DonorActivityItem[];
}

export async function loadDonorReports(projectId: string): Promise<DonorReport[]> {
  const { data: reports, error } = await db
    .from("programme_reports")
    .select("id, period_label, report_year, notes, status, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (reports ?? []) as Omit<DonorReport, "entries">[];
  if (rows.length === 0) return [];
  const { data: entries, error: eErr } = await db
    .from("programme_report_entries")
    .select("report_id, indicator_code, value, disaggregation, risk")
    .in("report_id", rows.map((r) => r.id));
  if (eErr) throw new Error(eErr.message);
  const byReport = new Map<string, DonorReportEntry[]>();
  for (const e of entries ?? []) {
    const list = byReport.get(e.report_id) ?? [];
    list.push({ indicator_code: e.indicator_code, value: e.value, disaggregation: e.disaggregation, risk: e.risk });
    byReport.set(e.report_id, list);
  }
  return rows.map((r) => ({ ...r, entries: byReport.get(r.id) ?? [] }));
}

export async function loadDonorLogframe(projectId: string): Promise<ProjectLogframe> {
  const { data } = await db.from("programme_logframes").select("data").eq("project_id", projectId).maybeSingle();
  const lf = data?.data as ProjectLogframe | undefined;
  if (lf && Array.isArray(lf.objectives) && lf.project) return lf;
  return defaultLogframe();
}

// ---- Admin management (project admins / Owner / Co-owner / Super Admin) ----

export interface DonorGrantRow extends DonorGrant {
  email?: string;
  name?: string;
}

export async function listProjectDonors(projectId: string): Promise<DonorGrantRow[]> {
  const { data, error } = await db
    .from("donor_viewers")
    .select("id, project_id, user_id, organization, label, active, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as DonorGrantRow[];
  if (rows.length === 0) return rows;
  const { data: profiles } = await db
    .from("profiles")
    .select("user_id, first_name, last_name, email")
    .in("user_id", rows.map((r) => r.user_id));
  const profileRows = (profiles ?? []) as { user_id: string; first_name?: string | null; last_name?: string | null; email?: string | null }[];
  const byUser = new Map(profileRows.map((p) => [p.user_id, p]));
  return rows.map((r) => {
    const p = byUser.get(r.user_id);
    return {
      ...r,
      email: p?.email ?? undefined,
      name: p ? [p.first_name, p.last_name].filter(Boolean).join(" ") || undefined : undefined,
    };
  });
}

export async function grantDonorAccess(projectId: string, email: string, organization: string): Promise<void> {
  const { data: profile, error: pErr } = await db
    .from("profiles")
    .select("user_id")
    .ilike("email", email.trim())
    .maybeSingle();
  if (pErr) throw new Error(pErr.message);
  if (!profile?.user_id) throw new Error("No user account found with that email. Ask the donor to sign up first.");
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await db.from("donor_viewers").upsert(
    {
      project_id: projectId,
      user_id: profile.user_id,
      organization: organization.trim() || null,
      granted_by: auth.user?.id ?? null,
      active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id,user_id" },
  );
  if (error) throw new Error(error.message);
}

export async function setDonorActive(grantId: string, active: boolean): Promise<void> {
  const { error } = await db.from("donor_viewers").update({ active, updated_at: new Date().toISOString() }).eq("id", grantId);
  if (error) throw new Error(error.message);
}

export async function removeDonorAccess(grantId: string): Promise<void> {
  const { error } = await db.from("donor_viewers").delete().eq("id", grantId);
  if (error) throw new Error(error.message);
}

/** Nigeria choropleth cells from aggregate state/LGA counts (blue scale). */
export function choroplethCells(agg: DonorAggregates): Map<string, { fill: string; popupHtml?: string }> {
  const entries = Object.entries(agg.by_lga ?? {});
  const max = Math.max(1, ...entries.map(([, n]) => n));
  const cells = new Map<string, { fill: string; popupHtml?: string }>();
  for (const [key, n] of entries) {
    const [state, lga] = key.split(" / ");
    if (!state || !lga) continue;
    const t = n / max;
    // WHO blue scale: light ice → deep navy
    const lightness = 92 - t * 62; // 92% → 30%
    const fill = `hsl(199 100% ${lightness}%)`;
    cells.set(lgaKeyOf(state, lga), {
      fill,
      popupHtml: `<strong>${lga}</strong>, ${state}<br/>${n} beneficiary${n === 1 ? "" : "ies"}`,
    });
  }
  return cells;
}

// Local copy of the map key normaliser (kept in sync with lgaGeo.lgaKey).
function lgaKeyOf(state: string, lga: string): string {
  return `${state.trim().toLowerCase()}|${lga.trim().toLowerCase()}`;
}

/** Merge monthly series into a single sorted trend for charting. */
export function mergeMonthly(series: { month: string; count: number }[]): { month: string; count: number }[] {
  return [...series].sort((a, b) => a.month.localeCompare(b.month));
}
