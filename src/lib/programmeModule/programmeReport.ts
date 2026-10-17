// Auto-aggregation of logframe indicator values from the Longitudinal
// Beneficiary Records. Every value is a suggestion — the reporting officer
// can edit it before saving.

import { supabase } from "@/integrations/supabase/client";
import type { AutoKey } from "./logframe";

const db = supabase as unknown as {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

const matches = (text: string, words: string[]) => {
  const t = text.toLowerCase();
  return words.some((w) => t.includes(w));
};

export const aggregateIndicators = async (
  projectId: string,
): Promise<Partial<Record<AutoKey, number>>> => {
  const out: Partial<Record<AutoKey, number>> = {};

  const [{ data: bens }, { data: services }, { data: referrals }, { data: visits }, { data: livelihood }, { data: feedback }] =
    await Promise.all([
      db.from("beneficiaries").select("id, gender, date_of_birth, wg_has_disability").eq("project_id", projectId),
      db.from("beneficiary_services").select("beneficiary_id, component, service_type, outcome, created_at").eq("project_id", projectId),
      db.from("beneficiary_referrals").select("id, status").eq("project_id", projectId),
      db.from("beneficiary_home_visits").select("id").eq("project_id", projectId),
      db.from("livelihood_assessments").select("id, beneficiary_id").eq("project_id", projectId),
      db.from("project_feedback").select("id, status").eq("project_id", projectId),
    ]);

  const benList = (bens || []) as { id: string; wg_has_disability?: boolean | null }[];
  const svcList = (services || []) as { beneficiary_id: string; component?: string | null; service_type?: string | null; outcome?: string | null }[];
  const refList = (referrals || []) as { status?: string | null }[];
  const fbList = (feedback || []) as { status?: string | null }[];

  const servedIds = new Set(svcList.map((s) => s.beneficiary_id));
  out.people_accessing_services = servedIds.size;
  const pwdIds = new Set(benList.filter((b) => b.wg_has_disability).map((b) => b.id));
  out.pwd_accessing_services = [...servedIds].filter((id) => pwdIds.has(id)).length;

  const screeningWords = ["screen", "assessment", "test"];
  out.people_screened = new Set(
    svcList.filter((s) => matches(`${s.service_type || ""} ${s.outcome || ""}`, screeningWords)).map((s) => s.beneficiary_id),
  ).size;

  const treatedWords = ["treat", "surgery", "medication", "therapy", "management"];
  out.people_treated = new Set(
    svcList.filter((s) => matches(`${s.service_type || ""} ${s.outcome || ""}`, treatedWords)).map((s) => s.beneficiary_id),
  ).size;

  out.eye_screenings = new Set(
    svcList.filter((s) => matches(`${s.component || ""} ${s.service_type || ""}`, ["eye"]) && matches(`${s.service_type || ""}`, screeningWords)).map((s) => s.beneficiary_id),
  ).size;

  out.eye_surgeries = svcList.filter((s) => matches(`${s.service_type || ""} ${s.outcome || ""}`, ["cataract", "glaucoma", "surgery", "surgical"])).length;

  out.spectacles_distributed = svcList.filter((s) => matches(`${s.service_type || ""} ${s.outcome || ""}`, ["spectacle", "refraction", "glasses"])).length;

  out.followup_visits = svcList.filter((s) => matches(`${s.service_type || ""}`, ["follow-up", "follow up", "post-operative", "postoperative"])).length;

  out.home_visits = ((visits || []) as unknown[]).length;

  out.mhpss_services = svcList.filter((s) => matches(`${s.component || ""}`, ["mental", "psychosocial", "mhpss"])).length;

  out.morbidity_services = new Set(
    svcList.filter((s) => matches(`${s.service_type || ""} ${s.outcome || ""}`, ["lymphedema", "lymphoedema", "hydrocele", "morbidity"])).map((s) => s.beneficiary_id),
  ).size;

  const completed = refList.filter((r) => r.status === "completed").length;
  out.completed_referrals = completed;
  out.referral_completion = refList.length > 0 ? Math.round((completed / refList.length) * 100) / 100 : 0;

  const resolved = fbList.filter((f) => f.status === "resolved" || f.status === "closed").length;
  out.ccfm_cases = fbList.length;
  out.ccfm_resolved_pct = fbList.length > 0 ? Math.round((resolved / fbList.length) * 100) : 0;

  const lvList = (livelihood || []) as { beneficiary_id: string }[];
  out.livelihood_assessed = lvList.length;
  out.livelihood_participants = new Set(lvList.map((l) => l.beneficiary_id)).size;

  return out;
};
