import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DASHBOARD_QUERY_OPTIONS } from "@/lib/queryConfig";
import { supabase } from "@/integrations/supabase/client";
import {
  CADRE_OPTIONS, REFRESHER_OPTIONS, PRIMARY_ACTIVITIES, AVAIL_OPTIONS,
  CHALLENGE_ITEMS, readinessBand, cadreLabel, availLabel,
} from "@/lib/bmz/definition";
import { buildAccountability, type ProfileLite } from "@/lib/accountability";

export interface BmzRow {
  id: string;
  monitor_id: string | null;
  date_of_visit: string | null;
  state: string | null;
  lga: string | null;
  community_ward: string | null;
  state_supervisor: string | null;
  cadre: string | null;
  sex: string | null;
  trained_eye_care: boolean | null;
  last_training_date: string | null;
  refresher_status: string | null;
  primary_activities: string[] | null;
  linked_facility: string | null;
  screening_kits: string | null;
  eye_poster: string | null;
  register_updated: boolean | null;
  referrals_evidence: boolean | null;
  num_referrals: number | null;
  no_referrals: boolean | null;
  total_screened: number | null;
  gatherings_count: number | null;
  challenges: { type: string; explain: string }[] | null;
  compliance_score: number | null;
  readiness_band: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  status: string | null;
  updated_at: string | null;
  created_at: string;
}

const COLUMNS =
  "id,monitor_id,date_of_visit,state,lga,community_ward,state_supervisor,cadre,sex,trained_eye_care,last_training_date,refresher_status,primary_activities,linked_facility,screening_kits,eye_poster,register_updated,referrals_evidence,num_referrals,no_referrals,total_screened,gatherings_count,challenges,compliance_score,readiness_band,gps_lat,gps_lng,status,updated_at,created_at";

async function fetchAll(): Promise<BmzRow[]> {
  const all: BmzRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("bmz_monitoring" as any)
      .select(COLUMNS)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as any as BmzRow[]));
    if (data.length < PAGE) break;
  }
  return all;
}

export const useBmzDashboard = () => {
  const qc = useQueryClient();

  const rowsQ = useQuery({
    queryKey: ["bmz", "monitoring"],
    queryFn: () => fetchAll(),
  });
  const rows = rowsQ.data ?? [];

  const monitorIds = useMemo(
    () => [...new Set(rows.map((r) => r.monitor_id).filter(Boolean))] as string[],
    [rows],
  );

  const profilesQ = useQuery({
    queryKey: ["bmz", "profiles", monitorIds.sort().join(",")],
    enabled: monitorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id,first_name,last_name,email")
        .in("user_id", monitorIds);
      const pm = new Map<string, ProfileLite>();
      (data || []).forEach((p: any) => {
        const name = `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email || "User";
        pm.set(p.user_id, { name, email: p.email || "" });
      });
      return pm;
    },
  });
  const profileMap = profilesQ.data ?? new Map<string, ProfileLite>();
  const loading = rowsQ.isLoading || (monitorIds.length > 0 && profilesQ.isLoading);

  const reload = async () => {
    await qc.invalidateQueries({ queryKey: ["bmz"] });
  };



  const visits = useMemo(
    () => rows.filter((r) => r.status === "sent" || r.status === "finalized"),
    [rows],
  );

  const stats = useMemo(() => {
    const total = visits.length;
    const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);
    const trained = visits.filter((v) => v.trained_eye_care).length;
    const refresherDone = visits.filter((v) => v.refresher_status === "done").length;
    const kitsInUse = visits.filter((v) => v.screening_kits === "in_use").length;
    const postersInUse = visits.filter((v) => v.eye_poster === "in_use").length;
    const registerOk = visits.filter((v) => v.register_updated).length;
    const referralOk = visits.filter((v) => v.referrals_evidence).length;
    const referralsMade = visits.reduce((s, v) => s + (v.num_referrals ?? 0), 0);
    const screened = visits.reduce((s, v) => s + (v.total_screened ?? 0), 0);
    const gatherings = visits.reduce((s, v) => s + (v.gatherings_count ?? 0), 0);
    const avgCompliance = total > 0 ? visits.reduce((s, v) => s + (v.compliance_score ?? 0), 0) / total : 0;
    return {
      total, trained, trainedPct: pct(trained),
      refresherDone, refresherDonePct: pct(refresherDone),
      kitsInUsePct: pct(kitsInUse),
      postersInUsePct: pct(postersInUse),
      registerOkPct: pct(registerOk),
      referralOkPct: pct(referralOk),
      referralsMade, screened, gatherings,
      referralRate: screened > 0 ? Math.round((referralsMade / screened) * 100) : 0,
      avgCompliance,
      avgBand: readinessBand(avgCompliance),
    };
  }, [visits]);

  const byCadre = useMemo(() => {
    const colors: Record<string, string> = { chew: "#0f6b52", ambassador: "#14b8a6", tba: "#f59e0b" };
    return CADRE_OPTIONS.map((c) => {
      const subset = visits.filter((v) => v.cadre === c.value);
      const avg = subset.length ? subset.reduce((s, v) => s + (v.compliance_score ?? 0), 0) / subset.length : 0;
      return { key: c.value, name: c.label, value: subset.length, compliance: Math.round(avg), color: colors[c.value] };
    });
  }, [visits]);

  const bySex = useMemo(() => ([
    { name: "Male", value: visits.filter((v) => v.sex === "male").length, color: "#0f6b52" },
    { name: "Female", value: visits.filter((v) => v.sex === "female").length, color: "#14b8a6" },
  ]), [visits]);

  const refresherBreakdown = useMemo(() => {
    const colors: Record<string, string> = { done: "#16a34a", deferred: "#f59e0b", not_due: "#94a3b8" };
    return REFRESHER_OPTIONS.map((o) => ({
      name: o.label,
      value: visits.filter((v) => v.refresher_status === o.value).length,
      color: colors[o.value],
    }));
  }, [visits]);

  const activities = useMemo(() =>
    PRIMARY_ACTIVITIES.map((a) => ({
      key: a.key,
      name: a.label,
      count: visits.filter((v) => (v.primary_activities || []).includes(a.key)).length,
      pct: stats.total > 0 ? Math.round((visits.filter((v) => (v.primary_activities || []).includes(a.key)).length / stats.total) * 100) : 0,
    })).sort((x, y) => y.count - x.count),
  [visits, stats.total]);

  const availability = useMemo(() => {
    const forField = (field: "screening_kits" | "eye_poster", label: string) => {
      const total = visits.length || 1;
      return {
        name: label,
        in_use: Math.round((visits.filter((v) => v[field] === "in_use").length / total) * 100),
        not_in_use: Math.round((visits.filter((v) => v[field] === "not_in_use").length / total) * 100),
        not_available: Math.round((visits.filter((v) => v[field] === "not_available").length / total) * 100),
      };
    };
    return [forField("screening_kits", "Screening kits"), forField("eye_poster", "Eye posters")];
  }, [visits]);

  const byLga = useMemo(() => {
    const m = new Map<string, { count: number; comp: number }>();
    visits.forEach((v) => {
      const k = v.lga || "—";
      const cur = m.get(k) || { count: 0, comp: 0 };
      cur.count += 1;
      cur.comp += v.compliance_score ?? 0;
      m.set(k, cur);
    });
    return [...m.entries()]
      .map(([name, { count, comp }]) => ({ name, count, compliance: Math.round(comp / count) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [visits]);

  const challenges = useMemo(() => {
    const m = new Map<string, number>();
    visits.forEach((v) => (v.challenges || []).forEach((c) => m.set(c.type, (m.get(c.type) || 0) + 1)));
    return CHALLENGE_ITEMS
      .map((c) => ({ name: c.label, count: m.get(c.key) || 0, pct: stats.total > 0 ? Math.round(((m.get(c.key) || 0) / stats.total) * 100) : 0 }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [visits, stats.total]);

  const flagged = useMemo(() =>
    [...visits]
      .filter((v) => (v.compliance_score ?? 100) < 60)
      .sort((a, b) => (a.compliance_score ?? 0) - (b.compliance_score ?? 0))
      .slice(0, 12)
      .map((v) => ({
        id: v.id,
        location: v.community_ward || v.lga || "Unknown",
        lga: v.lga || "—",
        cadre: cadreLabel(v.cadre || ""),
        facility: v.linked_facility || "—",
        kits: availLabel(v.screening_kits || ""),
        compliance: Math.round(v.compliance_score ?? 0),
        gap: (v.challenges || [])[0]?.type || "—",
      })),
  [visits]);

  const points = useMemo(() =>
    visits
      .filter((v) => v.gps_lat != null && v.gps_lng != null)
      .map((v) => {
        const band = readinessBand(v.compliance_score ?? 0);
        return { lat: v.gps_lat as number, lng: v.gps_lng as number, name: v.community_ward || v.lga || "", band: band.label, color: band.color };
      }),
  [visits]);

  const draftCount = useMemo(() => rows.filter((r) => r.status === "draft").length, [rows]);

  const accountability = useMemo(() => {
    const reported = rows.filter((r) => r.status === "sent" || r.status === "finalized");
    return buildAccountability(
      reported.map((r) => ({
        userId: r.monitor_id,
        unitName: r.community_ward || r.lga || "Unnamed",
        state: r.state || "Jigawa",
        lga: r.lga || "—",
        start: r.created_at,
        end: r.updated_at || r.created_at,
        status: r.status || "sent",
      })),
      profileMap,
    );
  }, [rows, profileMap]);

  const deleteVisits = async (ids: string[]): Promise<void> => {
    if (!ids.length) return;
    const { error } = await supabase.from("bmz_monitoring" as any).delete().in("id", ids);
    if (error) throw error;
    qc.setQueryData<BmzRow[]>(["bmz", "monitoring"], (prev) => (prev ?? []).filter((r) => !ids.includes(r.id)));
    await reload();
  };


  return {
    rows, loading, reload,
    stats, byCadre, bySex, refresherBreakdown, activities, availability,
    byLga, challenges, flagged, points, draftCount, accountability, deleteVisits,
  };
};
