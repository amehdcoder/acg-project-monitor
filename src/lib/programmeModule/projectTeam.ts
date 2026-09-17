// Project team register for Longitudinal Beneficiary Records.
//
// Holds everyone working on a project outside the facility clinical teams —
// State ministry/agency staff, LGA teams and partner organisation staff — plus
// a flexible per-person permission set that drives what they see and can do.

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export type TeamType = "state" | "lga" | "partner" | "facility" | "national";

export const TEAM_TYPES: { value: TeamType; label: string; hint: string }[] = [
  { value: "state", label: "State team", hint: "Ministry, department or agency staff at State level" },
  { value: "lga", label: "LGA team", hint: "Local government team working in one LGA" },
  { value: "partner", label: "Partner staff", hint: "Staff of a partner organisation supporting the project" },
  { value: "facility", label: "Facility staff", hint: "Clinical or records staff based at a health facility" },
  { value: "national", label: "National team", hint: "National coordination or oversight" },
];

export const TEAM_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  TEAM_TYPES.map((t) => [t.value, t.label]),
);

/** Common State-level units — free text is still allowed. */
export const STATE_UNITS = [
  "State Ministry of Health",
  "State Primary Health Care Development Agency",
  "State NTD Control Programme",
  "State Eye Health Programme",
  "State Mental Health Programme",
  "State Ministry of Women Affairs & Social Development",
  "State Ministry of Education",
  "State Ministry of Water Resources",
  "State Emergency Management Agency",
  "Other unit / department",
];

/** Designations used by partner organisations and programme teams. */
export const TEAM_DESIGNATIONS = [
  "Programme Officer",
  "Senior Programme Officer",
  "Programme Manager",
  "Programme Director",
  "Country Director",
  "MERL Officer",
  "MERL Manager",
  "MERL Advisor",
  "Technical Officer",
  "Technical Manager",
  "Technical Advisor",
  "Data Officer",
  "Data Manager",
  "Finance Officer",
  "Logistics Officer",
  "Safeguarding Officer",
  "Community Engagement Officer",
  "State Coordinator",
  "LGA Coordinator",
  "Supervisor",
  "Clinician",
  "Other",
];

export interface TeamPermissions {
  view_records?: boolean;
  edit_records?: boolean;
  record_services?: boolean;
  confirm_cases?: boolean;
  manage_cdds?: boolean;
  manage_households?: boolean;
  view_dashboards?: boolean;
  view_safeguarding?: boolean;
  export_data?: boolean;
  manage_team?: boolean;
  configure_module?: boolean;
}

export type PermissionKey = keyof TeamPermissions;

export const PERMISSION_LIST: {
  key: PermissionKey; label: string; hint: string; group: string;
}[] = [
  { key: "view_records", label: "See beneficiary records", hint: "Open the register and read records", group: "Records" },
  { key: "edit_records", label: "Register & edit beneficiaries", hint: "Add new people and change their details", group: "Records" },
  { key: "record_services", label: "Record services & follow-ups", hint: "Add visits, assessments and referrals", group: "Records" },
  { key: "confirm_cases", label: "Confirm CDD cases (clinician)", hint: "Review, stage and confirm case-search findings", group: "Case search" },
  { key: "manage_cdds", label: "Manage CDDs & case search", hint: "Register CDDs and record potential cases", group: "Case search" },
  { key: "manage_households", label: "Manage households & MDA", hint: "Households, water points and treatment rounds", group: "Community" },
  { key: "view_dashboards", label: "See dashboards & analysis", hint: "Journey, facility and cluster dashboards", group: "Oversight" },
  { key: "view_safeguarding", label: "See safeguarding screens", hint: "Still requires a vault key to read sealed narratives", group: "Oversight" },
  { key: "export_data", label: "Export data", hint: "Download registers and CSV exports", group: "Oversight" },
  { key: "manage_team", label: "Manage the project team", hint: "Add team members and set their permissions", group: "Administration" },
  { key: "configure_module", label: "Configure the form", hint: "Edit sections, questions and module settings", group: "Administration" },
];

/** Sensible starting permissions for each kind of team member. */
export const PRESETS: Record<TeamType, TeamPermissions> = {
  state: {
    view_records: true, view_dashboards: true, export_data: true, record_services: false,
  },
  lga: {
    view_records: true, record_services: true, manage_cdds: true,
    manage_households: true, view_dashboards: true,
  },
  partner: { view_records: true, view_dashboards: true, export_data: true },
  facility: {
    view_records: true, edit_records: true, record_services: true,
    confirm_cases: true, manage_cdds: true, manage_households: true, view_dashboards: true,
  },
  national: { view_records: true, view_dashboards: true, export_data: true, manage_team: true },
};

export interface TeamMemberRow {
  id: string;
  project_id: string;
  module_id: string | null;
  user_id: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  team_type: TeamType;
  organisation: string | null;
  unit: string | null;
  designation: string | null;
  state: string | null;
  lga: string | null;
  ward: string | null;
  facility_id: string | null;
  permissions: TeamPermissions;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const useTeamMembers = (projectId?: string) => {
  const [members, setMembers] = useState<TeamMemberRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) { setMembers([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await db.from("programme_team_members").select("*")
      .eq("project_id", projectId).order("full_name").limit(1000);
    setMembers(((data as TeamMemberRow[]) || []).map((m) => ({
      ...m, permissions: (m.permissions || {}) as TeamPermissions,
    })));
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  return { members, loading, reload: load };
};

export const saveTeamMember = async (
  row: Partial<TeamMemberRow> & { project_id: string; full_name: string },
) => {
  const payload = {
    project_id: row.project_id,
    module_id: row.module_id || null,
    user_id: row.user_id || null,
    full_name: row.full_name,
    email: row.email || null,
    phone: row.phone || null,
    team_type: row.team_type || "state",
    organisation: row.organisation || null,
    unit: row.unit || null,
    designation: row.designation || null,
    state: row.state || null,
    lga: row.lga || null,
    ward: row.ward || null,
    facility_id: row.facility_id || null,
    permissions: row.permissions || {},
    is_active: row.is_active ?? true,
    notes: row.notes || null,
  };
  if (row.id) {
    const { error } = await db.from("programme_team_members").update(payload).eq("id", row.id);
    if (error) throw error;
    return row.id;
  }
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await db.from("programme_team_members")
    .insert({ ...payload, created_by: auth.user?.id })
    .select("id").single();
  if (error) throw error;
  return (data as { id: string }).id;
};

export const deleteTeamMember = async (id: string) => {
  const { error } = await db.from("programme_team_members").delete().eq("id", id);
  if (error) throw error;
};

/** Short description of where a member sits — used in lists. */
export const memberContext = (m: TeamMemberRow, facilityName?: string) => {
  if (m.team_type === "partner") {
    return [m.organisation, m.designation].filter(Boolean).join(" · ") || "Partner staff";
  }
  if (m.team_type === "lga") {
    return [m.lga, m.state].filter(Boolean).join(", ") || "LGA team";
  }
  if (m.team_type === "facility") {
    return [facilityName, m.designation].filter(Boolean).join(" · ") || "Facility staff";
  }
  return [m.unit, m.state].filter(Boolean).join(" · ") || TEAM_TYPE_LABEL[m.team_type];
};

export const grantedCount = (p: TeamPermissions) =>
  PERMISSION_LIST.filter((x) => p[x.key]).length;

/**
 * What the signed-in person is allowed to do on this project.
 *
 * Administrators and people who are not on the team register keep the
 * behaviour they had before (everything they could already reach), so adding
 * the register never silently locks anyone out. Only listed members are
 * narrowed to the permissions ticked for them.
 */
export const useMyTeamPermissions = (projectId?: string, isAdmin = false) => {
  const [row, setRow] = useState<TeamMemberRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!projectId) { setRow(null); setLoading(false); return; }
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setRow(null); setLoading(false); return; }
    const { data } = await db.from("programme_team_members").select("*")
      .eq("project_id", projectId).eq("user_id", auth.user.id)
      .eq("is_active", true).maybeSingle();
    setRow((data as TeamMemberRow) || null);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const can = useMemo(() => {
    const perms = row?.permissions || {};
    return (key: PermissionKey) => {
      if (isAdmin) return true;
      if (!row) return true; // not on the register — unchanged behaviour
      return !!perms[key];
    };
  }, [row, isAdmin]);

  return { member: row, can, listed: !!row, loading, reload: load };
};
