import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ALL_CLASSES } from "@/lib/bloomberg/definition";

export interface ValidationRow {
  id: string;
  school_key: string | null;
  school_name: string | null;
  school_type: string | null;
  state: string | null;
  lga: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  total_male: number | null;
  total_female: number | null;
  grand_total: number | null;
  status: string | null;
  submitted_at: string | null;
  created_at: string;
}

export interface BaselineRow {
  school_key: string;
  total_male: number | null;
  total_female: number | null;
  grand_total: number | null;
}

async function fetchAll<T>(table: string, columns: string): Promise<T[]> {
  const all: T[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table as any)
      .select(columns)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE) break;
  }
  return all;
}

export const useBloombergDashboard = () => {
  const [validations, setValidations] = useState<ValidationRow[]>([]);
  const [baselines, setBaselines] = useState<BaselineRow[]>([]);
  const [schoolCount, setSchoolCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    const [v, b] = await Promise.all([
      fetchAll<ValidationRow>(
        "bloomberg_validations",
        "id,school_key,school_name,school_type,state,lga,gps_lat,gps_lng,total_male,total_female,grand_total,status,submitted_at,created_at",
      ),
      fetchAll<BaselineRow>("bloomberg_school_baselines", "school_key,total_male,total_female,grand_total"),
    ]);
    const { count } = await supabase
      .from("bloomberg_schools")
      .select("school_key", { count: "exact", head: true });
    setValidations(v);
    setBaselines(b);
    setSchoolCount(count || 0);
    setLoading(false);
  };

  useEffect(() => {
    reload();
  }, []);

  const baselineByKey = useMemo(() => {
    const m = new Map<string, BaselineRow>();
    baselines.forEach((b) => m.set(b.school_key, b));
    return m;
  }, [baselines]);

  const stats = useMemo(() => {
    const submitted = validations.filter((v) => v.status === "sent" || v.status === "finalized");
    const draft = validations.filter((v) => v.status === "draft");
    const validatedTotal = submitted.reduce((s, v) => s + (v.grand_total ?? 0), 0);
    const validatedMale = submitted.reduce((s, v) => s + (v.total_male ?? 0), 0);
    const validatedFemale = submitted.reduce((s, v) => s + (v.total_female ?? 0), 0);

    // Baseline total only for schools that have been validated (apples to apples).
    let baselineTotal = 0;
    const discrepancies: { school: string; baseline: number; validated: number; diff: number; pct: number }[] = [];
    submitted.forEach((v) => {
      const b = v.school_key ? baselineByKey.get(v.school_key) : undefined;
      const bt = b?.grand_total ?? 0;
      baselineTotal += bt;
      const validated = v.grand_total ?? 0;
      const diff = validated - bt;
      const pct = bt > 0 ? (diff / bt) * 100 : 0;
      if (bt > 0) {
        discrepancies.push({ school: v.school_name || "Unknown", baseline: bt, validated, diff, pct });
      }
    });
    discrepancies.sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));

    const coveragePct = schoolCount > 0 ? (new Set(submitted.map((v) => v.school_key)).size / schoolCount) * 100 : 0;
    const overallPct = baselineTotal > 0 ? ((validatedTotal - baselineTotal) / baselineTotal) * 100 : 0;

    return {
      totalSchools: schoolCount,
      validatedSchools: new Set(submitted.map((v) => v.school_key)).size,
      submittedCount: submitted.length,
      draftCount: draft.length,
      validatedTotal,
      validatedMale,
      validatedFemale,
      baselineTotal,
      overallPct,
      coveragePct,
      discrepancies: discrepancies.slice(0, 10),
    };
  }, [validations, baselineByKey, schoolCount]);

  // Submissions by state for the map.
  const byState = useMemo(() => {
    const m = new Map<string, number>();
    validations.forEach((v) => {
      const key = (v.state || "Unknown").toString();
      m.set(key, (m.get(key) || 0) + 1);
    });
    return [...m.entries()].map(([state, count]) => ({ state, count })).sort((a, b) => b.count - a.count);
  }, [validations]);

  const points = useMemo(
    () =>
      validations
        .filter((v) => v.gps_lat != null && v.gps_lng != null)
        .map((v) => ({ lat: v.gps_lat as number, lng: v.gps_lng as number, status: v.status || "draft", name: v.school_name || "" })),
    [validations],
  );

  return { validations, baselines, stats, byState, points, loading, reload, ALL_CLASSES };
};
