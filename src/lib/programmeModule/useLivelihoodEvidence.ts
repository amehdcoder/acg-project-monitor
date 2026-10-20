import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cachedRead } from "./offlineReadCache";
import { currentUserId } from "./offlineWrite";
import type { TargetingInput } from "./livelihood";

type Clinical = { beneficiary_id: string | null; stage: string | null; acute_attacks_last_year: number | null; surgery_status: string | null };
type Visit = { beneficiary_id: string; outcome: string | null; risk_score: number | null; status: string };
type Evidence = { clinical: Clinical[]; visits: Visit[] };

/** Shared query prevents the register and assessment dialog fetching the same
 * evidence independently. Only recorded outcomes count, never inferred misses. */
export function useLivelihoodEvidence(projectId: string) {
  const query = useQuery({
    queryKey: ["livelihood-evidence", projectId], staleTime: 30_000,
    queryFn: async () => {
      const user = await currentUserId();
      if (!user) throw new Error("Sign in to load targeting evidence");
      const result = await cachedRead<Evidence>(`livelihood-evidence:${user}:${projectId}`, async () => {
        const clinical: Clinical[] = []; const visits: Visit[] = [];
        for (let from = 0; ; from += 1000) {
          const r = await supabase.from("ntd_morbidity_records").select("beneficiary_id,stage,acute_attacks_last_year,surgery_status")
            .eq("project_id", projectId).order("id").range(from, from + 999);
          if (r.error) return { data: null, error: r.error };
          clinical.push(...(r.data ?? [])); if ((r.data ?? []).length < 1000) break;
        }
        for (let from = 0; ; from += 1000) {
          const r = await supabase.from("beneficiary_home_visits").select("beneficiary_id,outcome,risk_score,status")
            .eq("project_id", projectId).order("id").range(from, from + 999);
          if (r.error) return { data: null, error: r.error };
          visits.push(...(r.data ?? [])); if ((r.data ?? []).length < 1000) break;
        }
        return { data: { clinical, visits }, error: null };
      });
      if (!result.data) throw new Error("Clinical and home-visit evidence unavailable; reconnect before confirming selection.");
      return result.data;
    },
  });
  const signalsFor = (id: string): Omit<TargetingInput, "beneficiary" | "answers"> => {
    const clinical = query.data?.clinical.filter(r => r.beneficiary_id === id) ?? [];
    const visits = query.data?.visits.filter(r => r.beneficiary_id === id && r.status === "completed") ?? [];
    const stages = clinical.map(r => Number(/stage_(\d)/.exec(r.stage ?? "")?.[1] ?? 0));
    return {
      morbidityStage: Math.max(0, ...stages) || null,
      acuteAttacks: Math.max(0, ...clinical.map(r => r.acute_attacks_last_year ?? 0)),
      surgeryPending: clinical.some(r => r.surgery_status === "referred" || r.surgery_status === "scheduled"),
      homeVisitOutcomes: visits.map(r => r.outcome).filter((v): v is string => !!v),
    };
  };
  return { signalsFor, ready: !!query.data, error: query.error?.message, data: query.data };
}