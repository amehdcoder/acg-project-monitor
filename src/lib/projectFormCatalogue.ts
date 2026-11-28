import { supabase } from "@/integrations/supabase/client";
import { fetchAuthorizedForms } from "./authorizedForms";
import { fetchFormsMemberProjects } from "./formsProjectMembership";
import { writeSpecialFormGrants } from "./offlineFormAccess";
import { ALL_STANDARD_FORMS } from "./standardAssessments/allStandardForms";
import { STANDARD_ASSESSMENTS } from "./standardAssessments/definitions";
import { withTimeout } from "./withTimeout";
import type { FormDownloadForm } from "./offlineFormDownload";

export const specialFormId = (projectId: string, code: string) => `special:${projectId}:${code}`;
export const isCollectionForm = (form: Record<string, any>) =>
  !/dashboard/i.test(form.name || "") && form.settings?.dashboardOnly !== true;
const onlineOnly = new Set(["uprp", "attendance", "action_tracker", "workplan", "srf", "incident", "leave", "stationery", "acsm_form", "sbc_form", "irf_form", "mental_health", ...Object.keys(STANDARD_ASSESSMENTS)]);
const specific = new Set(["bloomberg_form", "bmz_form", "microplan_entry", "irf_form"]);

interface SpecialAccess {
  admin: boolean;
  owner: boolean;
  adhoc: boolean;
  restricted: boolean;
  assigned: Set<string>;
  disabled: Set<string>;
  bmz: Set<string>;
  microplan: Set<string>;
  eye: Set<string>;
  irf: Set<string>;
}

/** Pure project/collector policy; dashboards and disabled tools never enter downloads. */
export function specialCollectionCodes(projectId: string, access: SpecialAccess): string[] {
  const codes = ALL_STANDARD_FORMS.filter(form => {
    const code = form.code;
    if (code.endsWith("_dash") || code === "beneficiary_record" || access.disabled.has(code)) return false;
    const explicit = access.assigned.has(code);
    if (access.adhoc || (access.restricted && !access.admin)) return explicit;
    if (explicit) return true;
    if (code === "bloomberg_form") return access.owner;
    if (code === "bmz_form") return access.bmz.has(projectId);
    if (code === "microplan_entry") return access.microplan.has(projectId);
    if (code === "irf_form") return access.irf.has(projectId);
    return !specific.has(code);
  }).map(form => form.code);
  if (access.eye.has(projectId)) codes.push("eye_daily", "eye_patient_wg");
  return codes;
}

// Source-backed revisions keep built-in updates deterministic across restarts.
const definitionSources = import.meta.glob([
  "./standardAssessments/definitions.ts", "./bmz/definition.ts", "./bloomberg/definition.ts",
  "./seeclear/definition.ts", "./acsm/definition.ts", "./sbc/definition.ts",
  "./irf/categoryForms.ts", "./eyeReport/definition.ts", "./uprp/definitions.ts",
  "./actionTracker.ts", "./workplan.ts", "../components/OfficeForms/types.ts",
], { query: "?raw", import: "default" });
const sourceFor = (code: string) => {
  if (code.startsWith("eye_")) return "./eyeReport/definition.ts";
  if (code.endsWith("_form")) return `./${code.replace("_form", "") === "irf" ? "irf/categoryForms" : code.replace("_form", "") + "/definition"}.ts`;
  if (["srf", "incident", "leave", "stationery"].includes(code)) return "../components/OfficeForms/types.ts";
  if (code === "uprp") return "./uprp/definitions.ts";
  if (code === "action_tracker") return "./actionTracker.ts";
  if (code === "workplan") return "./workplan.ts";
  return "./standardAssessments/definitions.ts";
};

export async function fetchProjectFormCatalogue(userId: string): Promise<FormDownloadForm[]> {
  const stored = (await fetchAuthorizedForms(userId)).filter(isCollectionForm);
  const projects = await fetchFormsMemberProjects(userId);
  if (!projects.length) { writeSpecialFormGrants(userId, []); return stored; }
  const db = supabase as any;
  const results = await withTimeout(Promise.all([
    db.rpc("is_admin", { _user_id: userId }),
    db.rpc("is_owner_level", { _user_id: userId }),
    db.from("profiles").select("designation").eq("user_id", userId).maybeSingle(),
    db.from("user_standard_form_assignments").select("form_code").eq("user_id", userId),
    db.from("standard_form_user_restrictions").select("user_id").eq("user_id", userId),
    db.from("standard_form_disabled").select("form_code"),
    db.from("bmz_project_assignments").select("project_id"),
    db.rpc("get_my_microplan_project_access"),
    db.rpc("is_irf_admin"),
    db.from("irf_form_access").select("project_id,user_id,designation,grant_type"),
    Promise.all(projects.map(async project => {
      const permission = await db.rpc("can_eye_report", { _user: userId, _project: project.id });
      if (permission.error) throw permission.error;
      return permission.data === true ? project.id : null;
    })),
  ]), 25000, "special_form_access_timeout");
  for (const result of results.slice(0, 10)) if (result.error) throw result.error;
  const [admin, owner, profile, assigned, restricted, disabled, bmz, microplan, irfAdmin, irfGrants, eye] = results;
  const irfProjects = new Set<string>(projects.filter(project => irfAdmin.data === true || (irfGrants.data || []).some((grant: any) =>
    (!grant.project_id || grant.project_id === project.id) &&
    (grant.grant_type === "user" ? grant.user_id === userId : !!profile.data?.designation && grant.designation === profile.data.designation),
  )).map(project => project.id));
  const access: SpecialAccess = {
    admin: admin.data === true, owner: owner.data === true,
    adhoc: admin.data !== true && profile.data?.designation === "adhoc_user",
    restricted: !!restricted.data?.length,
    assigned: new Set((assigned.data || []).map((row: any) => row.form_code)),
    disabled: new Set((disabled.data || []).map((row: any) => row.form_code)),
    bmz: new Set((bmz.data || []).map((row: any) => row.project_id)),
    microplan: new Set((microplan.data || []).map((row: any) => row.project_id)),
    eye: new Set(eye.filter(Boolean)), irf: irfProjects,
  };
  const specials: FormDownloadForm[] = [];
  for (const project of projects) {
    for (const code of specialCollectionCodes(project.id, access)) {
      const definition = ALL_STANDARD_FORMS.find(form => form.code === code);
      const schema = (STANDARD_ASSESSMENTS as Record<string, unknown>)[code];
      const source = definitionSources[sourceFor(code)];
      const specialContext: Record<string, unknown> = {};
      if (code === "seeclear_form") {
        const response = await db.from("seeclear_kobo_schema").select("*").order("updated_at", { ascending: false }).limit(1);
        if (response.error) throw response.error;
        const snapshot = response.data?.[0];
        specialContext.schema = snapshot ? { form_uid: snapshot.form_uid, form_title: snapshot.form_title, version_id: snapshot.version_id, fields: snapshot.fields, choices: snapshot.choices, drift: null, submission_count: null, last_synced_at: null, last_error: null } : null;
      }
      if (code.startsWith("eye_")) {
        const response = await db.from("health_facilities").select("id,name,state,lga").eq("project_id", project.id).order("name");
        if (response.error) throw response.error;
        specialContext.facilities = response.data || [];
      }
      specials.push({
        id: specialFormId(project.id, code), project_id: project.id,
        name: code === "eye_daily" ? "Eye Health Daily Facility Report" : code === "eye_patient_wg" ? "Patient Disability Screening (WG-SS)" : definition?.name || code,
        description: definition?.group || "Eye Health facility reporting",
        status: "active", questions: [], settings: { specialCollector: code, onlineRequired: onlineOnly.has(code) },
        specialDefinition: schema || (source ? await source() : { code, version: 1 }),
        specialContext,
        geofence: null, updated_at: null,
      });
    }
  }
  const catalogue = [...stored, ...specials];
  writeSpecialFormGrants(userId, specials.map(form => form.id));
  return catalogue;
}