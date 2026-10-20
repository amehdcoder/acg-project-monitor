// Auto-aggregation of logframe indicator values from the Longitudinal
// Beneficiary Records. Every value is a suggestion — the reporting officer
// can edit it before saving.

import { supabase } from "@/integrations/supabase/client";
import type { AutoKey } from "./logframe";
import { referralCompletionPercent } from "./referralMetrics";
import { cachedRead } from "./offlineReadCache";

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

  const readAll = async (table: string, columns: string, completedOnly = false) => {
    const { data } = await cachedRead<unknown[]>(`report-aggregate:${projectId}:${table}`, async () => {
      const rows: unknown[] = [];
      for (let offset = 0; ; offset += 1000) {
        let query = db.from(table).select(columns).eq("project_id", projectId).order("id").range(offset, offset + 999);
        if (completedOnly) query = query.eq("status", "completed");
        const result = await query;
        if (result.error) return { data: null, error: result.error };
        rows.push(...(result.data || []));
        if ((result.data || []).length < 1000) break;
      }
      return { data: rows, error: null };
    });
    if (data === null) throw new Error("Report totals are unavailable. Reconnect to load project records.");
    return data;
  };
  const [bens, services, referrals, visits, livelihood, feedback] = await Promise.all([
    readAll("beneficiaries", "id, profile"),
    readAll("beneficiary_services", "id, beneficiary_id, component_key, service_name, result, created_at"),
    readAll("beneficiary_referrals", "id, status"),
    readAll("beneficiary_home_visits", "id", true),
    readAll("livelihood_assessments", "id, beneficiary_id"),
    readAll("project_feedback", "id, status"),
  ]);

  const benList = (bens || []) as { id: string; profile?: { wg_ss?: { has_disability?: boolean } } | null }[];
  const svcList = (services as { beneficiary_id: string; component_key?: string | null; service_name?: string | null; result?: string | null }[]).map(s => ({ beneficiary_id: s.beneficiary_id, component: s.component_key, service_type: s.service_name, outcome: s.result }));
  const refList = (referrals || []) as { status?: string | null }[];
  const fbList = (feedback || []) as { status?: string | null }[];

  const servedIds = new Set(svcList.map((s) => s.beneficiary_id));
  out.people_accessing_services = servedIds.size;
  const pwdIds = new Set(benList.filter((b) => b.profile?.wg_ss?.has_disability).map((b) => b.id));
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
  out.referral_completion = referralCompletionPercent(completed, refList.length);

  const resolved = fbList.filter((f) => f.status === "resolved" || f.status === "closed").length;
  out.ccfm_cases = fbList.length;
  out.ccfm_resolved_pct = fbList.length > 0 ? Math.round((resolved / fbList.length) * 100) : 0;

  const lvList = (livelihood || []) as { beneficiary_id: string }[];
  out.livelihood_assessed = lvList.length;
  out.livelihood_participants = new Set(lvList.map((l) => l.beneficiary_id)).size;

  return out;
};
