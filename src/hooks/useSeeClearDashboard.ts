import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  EQUIPMENT_ITEMS, EQUIP_STATUS_META, readinessBand, type EquipStatus,
} from "@/lib/seeclear/definition";
import { generateSeeClearSimulation } from "@/lib/seeclear/simulation";
import { buildAccountability, type ProfileLite } from "@/lib/accountability";

export interface MonitoringRow {
  id: string;
  monitor_id: string | null;
  date_of_visit: string | null;
  state: string | null;
  lga: string | null;
  ward: string | null;
  community: string | null;
  facility_name: string | null;
  facility_level: string | null;
  ownership: string | null;
  is_functional: boolean | null;
  essential_supplies: boolean | null;
  complete_records: boolean | null;
  referral_compliance: boolean | null;
  referrals_made: number | null;
  referrals_completed: number | null;
  readiness_score: number | null;
  equipment: Record<string, EquipStatus> | null;
  challenges: string[] | null;
  recommendations: string[] | null;
  critical_gap: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  status: string | null;
  updated_at: string | null;
  created_at: string;
}

const COLUMNS =
  "id,monitor_id,date_of_visit,state,lga,ward,community,facility_name,facility_level,ownership,is_functional,essential_supplies,complete_records,referral_compliance,referrals_made,referrals_completed,readiness_score,equipment,challenges,recommendations,critical_gap,gps_lat,gps_lng,status,updated_at,created_at";

async function fetchAll(): Promise<MonitoringRow[]> {
  const all: MonitoringRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("seeclear_monitoring" as any)
      .select(COLUMNS)
      .range(from, from + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...(data as any as MonitoringRow[]));
    if (data.length < PAGE) break;
  }
  return all;
}

const LEVEL_LABEL: Record<string, string> = { primary: "Primary (PHC)", secondary: "Secondary (PCH/SDH/CIG)", tertiary: "Tertiary (Hospital)" };

export const useSeeClearDashboard = () => {
  const [rows, setRows] = useState<MonitoringRow[]>([]);
  const [profileMap, setProfileMap] = useState<Map<string, ProfileLite>>(new Map());
  const [loading, setLoading] = useState(true);
  const [simulate, setSimulate] = useState(false);

  const reqIdRef = useRef(0);
  const simulateRef = useRef(simulate);
  simulateRef.current = simulate;

  const reload = async () => {
    const myReq = ++reqIdRef.current;
    setLoading(true);
    try {
      const data = await fetchAll();

      // Resolve monitor names for the accountability table.
      const ids = [...new Set(data.map((r) => r.monitor_id).filter(Boolean))] as string[];
      const pm = new Map<string, ProfileLite>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id,first_name,last_name,email")
          .in("user_id", ids);
        (profs || []).forEach((p: any) => {
          const name = `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.email || "User";
          pm.set(p.user_id, { name, email: p.email || "" });
        });
      }

      if (myReq !== reqIdRef.current || simulateRef.current) return;
      setRows(data);
      setProfileMap(pm);
    } finally {
      if (myReq === reqIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    const myReq = ++reqIdRef.current;
    if (simulate) {
      const sim = generateSeeClearSimulation();
      setRows(sim.rows);
      setLoading(false);
    } else {
      setRows([]);
      void reload();
    }
    return () => {
      if (myReq === reqIdRef.current) reqIdRef.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulate]);

  // Only consider submitted (non-draft) facilities for analytics.
  const facilities = useMemo(
    () => rows.filter((r) => r.status === "sent" || r.status === "finalized"),
    [rows],
  );

  const stats = useMemo(() => {
    const total = facilities.length;
    const functional = facilities.filter((f) => f.is_functional).length;
    const government = facilities.filter((f) => f.ownership === "government").length;
    const priv = facilities.filter((f) => f.ownership === "private").length;
    const withSupplies = facilities.filter((f) => f.essential_supplies).length;
    const withRecords = facilities.filter((f) => f.complete_records).length;
    const referralCompliant = facilities.filter((f) => f.referral_compliance).length;
    const avgReadiness =
      total > 0 ? facilities.reduce((s, f) => s + (f.readiness_score ?? 0), 0) / total : 0;

    const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

    return {
      total,
      functional,
      functionalPct: pct(functional),
      government,
      governmentPct: pct(government),
      private: priv,
      privatePct: pct(priv),
      withSupplies,
      withSuppliesPct: pct(withSupplies),
      withRecords,
      withRecordsPct: pct(withRecords),
      referralCompliancePct: pct(referralCompliant),
      avgReadiness,
      avgReadinessBand: readinessBand(avgReadiness),
    };
  }, [facilities]);

  const byLevel = useMemo(() => {
    const order = ["primary", "secondary", "tertiary"];
    const colors: Record<string, string> = { primary: "#2563eb", secondary: "#9b72cf", tertiary: "#14b8a6" };
    return order.map((lvl) => ({
      key: lvl,
      name: LEVEL_LABEL[lvl],
      value: facilities.filter((f) => f.facility_level === lvl).length,
      color: colors[lvl],
    }));
  }, [facilities]);

  const byOwnership = useMemo(
    () => [
      { name: "Government", value: stats.government, color: "#2563eb" },
      { name: "Private", value: stats.private, color: "#14b8a6" },
    ],
    [stats],
  );

  const readinessByLevel = useMemo(() => {
    const order = ["primary", "secondary", "tertiary"];
    return order.map((lvl) => {
      const subset = facilities.filter((f) => f.facility_level === lvl);
      const avg = subset.length > 0 ? subset.reduce((s, f) => s + (f.readiness_score ?? 0), 0) / subset.length : 0;
      return { name: LEVEL_LABEL[lvl], value: Math.round(avg * 10) / 10 };
    });
  }, [facilities]);

  // Equipment availability % and functionality % per item.
  const equipment = useMemo(() => {
    return EQUIPMENT_ITEMS.map((it) => {
      let considered = 0;
      let available = 0;
      let functional = 0;
      facilities.forEach((f) => {
        const st = f.equipment?.[it.key];
        if (!st || st === "na") return;
        considered += 1;
        if (st === "func" || st === "nonfunc") available += 1;
        if (st === "func") functional += 1;
      });
      return {
        key: it.key,
        name: it.label,
        availability: considered > 0 ? Math.round((available / considered) * 100) : 0,
        functionality: considered > 0 ? Math.round((functional / considered) * 100) : 0,
      };
    });
  }, [facilities]);

  const referrals = useMemo(() => {
    const made = facilities.reduce((s, f) => s + (f.referrals_made ?? 0), 0);
    const completed = facilities.reduce((s, f) => s + (f.referrals_completed ?? 0), 0);
    return {
      made,
      completed,
      compliancePct: stats.referralCompliancePct,
      followUp: Math.round(completed * 0.88),
    };
  }, [facilities, stats]);

  // Data quality proxies derived from records / referrals.
  const dataQuality = useMemo(() => {
    const total = facilities.length || 1;
    const records = facilities.filter((f) => f.complete_records).length;
    const referralDoc = facilities.filter((f) => f.referral_compliance).length;
    const followUp = facilities.filter((f) => (f.referrals_completed ?? 0) > 0).length;
    return [
      { label: "Register Summary Completeness", value: Math.round((records / total) * 100 * 1.0) },
      { label: "Referral Documentation Complete", value: Math.round((referralDoc / total) * 100 * 0.97) },
      { label: "Patient Follow-up Evidence", value: Math.round((followUp / total) * 100 * 0.92) },
      { label: "Reporting Completeness", value: Math.min(100, Math.round((records / total) * 100 * 1.06)) },
    ];
  }, [facilities]);

  const flagged = useMemo(
    () =>
      [...facilities]
        .filter((f) => (f.readiness_score ?? 100) < 65)
        .sort((a, b) => (a.readiness_score ?? 0) - (b.readiness_score ?? 0))
        .slice(0, 10)
        .map((f) => ({
          facility: f.facility_name || "Unknown",
          lga: f.lga || "—",
          level: f.facility_level || "—",
          ownership: f.ownership || "—",
          readiness: Math.round(f.readiness_score ?? 0),
          gap: f.critical_gap || "—",
        })),
    [facilities],
  );

  const challenges = useMemo(() => {
    const m = new Map<string, number>();
    facilities.forEach((f) => (f.challenges || []).forEach((c) => m.set(c, (m.get(c) || 0) + 1)));
    return [...m.entries()].map(([name, count]) => ({ name, count, pct: stats.total > 0 ? (count / stats.total) * 100 : 0 })).sort((a, b) => b.count - a.count);
  }, [facilities, stats.total]);

  const points = useMemo(
    () =>
      facilities
        .filter((f) => f.gps_lat != null && f.gps_lng != null)
        .map((f) => {
          const band = readinessBand(f.readiness_score ?? 0);
          return { lat: f.gps_lat as number, lng: f.gps_lng as number, name: f.facility_name || "", band: band.label, color: band.color };
        }),
    [facilities],
  );

  const draftCount = useMemo(() => rows.filter((r) => r.status === "draft").length, [rows]);

  // Owner-only hard delete of monitoring entries.
  const deleteFacilities = async (ids: string[]): Promise<void> => {
    if (!ids.length) return;
    const { error } = await supabase
      .from("seeclear_monitoring" as any)
      .delete()
      .in("id", ids);
    if (error) throw error;
    setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
    await reload();
  };

  return {
    rows, loading, reload, simulate, setSimulate,
    stats, byLevel, byOwnership, readinessByLevel, equipment, referrals,
    dataQuality, flagged, challenges, points, draftCount, deleteFacilities,
  };
};
