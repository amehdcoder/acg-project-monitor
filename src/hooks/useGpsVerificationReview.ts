/**
 * Admin review + discrepancy history for the GPS Truth Map.
 *
 * - Overrides let an admin mark a borderline match as verified / corrected /
 *   rejected; the decision is applied on top of the computed verdict and is
 *   honoured by the dashboard filters.
 * - History records every time a location's verdict changes (because the Kobo
 *   point moved or the community name was edited), so supervisors can see how
 *   the verdict evolved over time.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { GpsOverride, OverrideDecision, VerifyResult } from "@/lib/isc/gpsVerification";

export interface GpsHistoryRow {
  id: string;
  loc_key: string;
  submission_id: string | null;
  community: string;
  ward: string | null;
  lga: string | null;
  state: string | null;
  lat: number;
  lng: number;
  status: string;
  score: number;
  matched_name: string | null;
  display_name: string | null;
  reason: string | null;
  created_at: string;
}

export interface HistorySnapshot {
  locKey: string;
  submissionId?: string;
  community: string;
  ward?: string;
  lga?: string;
  state?: string;
  lat: number;
  lng: number;
  verify: VerifyResult;
}

export function useGpsVerificationReview() {
  const { user, isAdmin } = useAuth();
  const [overrides, setOverrides] = useState<Record<string, GpsOverride>>({});
  const [history, setHistory] = useState<GpsHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const loggedRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const [o, h] = await Promise.all([
      supabase.from("gps_verification_overrides").select("*"),
      supabase
        .from("gps_verification_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(4000),
    ]);
    if (o.data) {
      const map: Record<string, GpsOverride> = {};
      (o.data as GpsOverride[]).forEach((r) => { map[r.loc_key] = r; });
      setOverrides(map);
    }
    if (h.data) setHistory(h.data as unknown as GpsHistoryRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const historyByKey = useMemo(() => {
    const m = new Map<string, GpsHistoryRow[]>();
    history.forEach((r) => {
      const list = m.get(r.loc_key) ?? [];
      list.push(r);
      m.set(r.loc_key, list);
    });
    // newest first already; keep chronological ascending for timelines
    m.forEach((v) => v.reverse());
    return m;
  }, [history]);

  /** Persist a verdict snapshot only when it differs from the last recorded one. */
  const recordSnapshots = useCallback(async (snaps: HistorySnapshot[]) => {
    if (!user) return;
    const rows = snaps
      .filter((s) => {
        const last = historyByKey.get(s.locKey)?.slice(-1)[0];
        const sig = `${s.locKey}|${s.verify.status}|${s.verify.score}|${s.verify.matchedName}|${s.community}`;
        if (loggedRef.current.has(sig)) return false;
        loggedRef.current.add(sig);
        if (!last) return true;
        return (
          last.status !== s.verify.status ||
          last.score !== s.verify.score ||
          (last.matched_name || "") !== s.verify.matchedName ||
          (last.community || "") !== s.community
        );
      })
      .map((s) => ({
        loc_key: s.locKey,
        submission_id: s.submissionId ?? null,
        community: s.community,
        ward: s.ward ?? "",
        lga: s.lga ?? "",
        state: s.state ?? "",
        lat: s.lat,
        lng: s.lng,
        status: s.verify.status,
        score: s.verify.score,
        matched_name: s.verify.matchedName,
        display_name: s.verify.displayName,
        reason: s.verify.reason,
        recorded_by: user.id,
      }));
    if (!rows.length) return;
    const { data, error } = await supabase
      .from("gps_verification_history")
      .insert(rows)
      .select("*");
    if (!error && data) setHistory((prev) => [...(data as unknown as GpsHistoryRow[]), ...prev]);
  }, [user, historyByKey]);

  const saveOverride = useCallback(async (
    payload: {
      locKey: string; submissionId?: string; community: string;
      lat: number; lng: number; decision: OverrideDecision;
      correctedName?: string; note?: string;
    },
  ) => {
    if (!isAdmin || !user) { toast.error("Only administrators can review GPS matches."); return false; }
    const row = {
      loc_key: payload.locKey,
      submission_id: payload.submissionId ?? null,
      community: payload.community,
      lat: payload.lat,
      lng: payload.lng,
      decision: payload.decision,
      corrected_name: payload.correctedName ?? "",
      note: payload.note ?? "",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from("gps_verification_overrides")
      .upsert(row, { onConflict: "loc_key" })
      .select("*")
      .maybeSingle();
    if (error) { toast.error(`Could not save review: ${error.message}`); return false; }
    if (data) setOverrides((p) => ({ ...p, [payload.locKey]: data as GpsOverride }));
    toast.success("Review saved");
    return true;
  }, [isAdmin, user]);

  /** Apply the same decision + note to many locations in one round trip. */
  const saveOverridesBulk = useCallback(async (
    items: { locKey: string; submissionId?: string; community: string; lat: number; lng: number }[],
    opts: { decision: OverrideDecision; correctedName?: string; note?: string },
  ) => {
    if (!isAdmin || !user) { toast.error("Only administrators can review GPS matches."); return false; }
    if (!items.length) { toast.error("Select at least one point to review."); return false; }
    const reviewedAt = new Date().toISOString();
    const rows = items.map((p) => ({
      loc_key: p.locKey,
      submission_id: p.submissionId ?? null,
      community: p.community,
      lat: p.lat,
      lng: p.lng,
      decision: opts.decision,
      corrected_name: opts.correctedName ?? "",
      note: opts.note ?? "",
      reviewed_by: user.id,
      reviewed_at: reviewedAt,
    }));
    const { data, error } = await supabase
      .from("gps_verification_overrides")
      .upsert(rows, { onConflict: "loc_key" })
      .select("*");
    if (error) { toast.error(`Bulk review failed: ${error.message}`); return false; }
    if (data) {
      setOverrides((p) => {
        const n = { ...p };
        (data as GpsOverride[]).forEach((r) => { n[r.loc_key] = r; });
        return n;
      });
    }
    toast.success(`${rows.length} point${rows.length === 1 ? "" : "s"} marked ${opts.decision}`);
    return true;
  }, [isAdmin, user]);

  const clearOverridesBulk = useCallback(async (locKeys: string[]) => {
    if (!isAdmin) { toast.error("Only administrators can review GPS matches."); return; }
    if (!locKeys.length) return;
    const { error } = await supabase.from("gps_verification_overrides").delete().in("loc_key", locKeys);
    if (error) { toast.error(error.message); return; }
    setOverrides((p) => { const n = { ...p }; locKeys.forEach((k) => delete n[k]); return n; });
    toast.success(`${locKeys.length} override${locKeys.length === 1 ? "" : "s"} removed`);
  }, [isAdmin]);

  return {
    overrides, historyByKey, loading, isAdmin,
    saveOverride, clearOverride, saveOverridesBulk, clearOverridesBulk,
    recordSnapshots, reload: load,
  };
}

