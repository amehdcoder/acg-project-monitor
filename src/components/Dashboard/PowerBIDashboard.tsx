import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, ReferenceLine,
} from "recharts";
import {
  MapPin, AlertTriangle, RefreshCw, Users, Eye, ClipboardCheck, FileText,
  ShieldCheck, Globe2, Lightbulb, TrendingUp, Clock, Target, Database, Gauge,
  CheckCircle2, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import { useTargetPopFields } from "@/hooks/useTargetPopFields";
import { useAuth } from "@/hooks/useAuth";
import { generateOpsDemoData } from "@/lib/opsDemoData";
import { toast } from "@/hooks/use-toast";
import { FlaskConical } from "lucide-react";
import NigeriaChoropleth, { ChoroCell } from "./ops/NigeriaChoropleth";
import SupervisionGapMap, { GapPoint } from "./ops/SupervisionGapMap";
import SourceVarianceDumbbell from "./ops/SourceVarianceDumbbell";
import { lgaKey, TOTAL_NIGERIA_LGAS } from "./ops/lgaGeo";

interface PowerBIDashboardProps {
  selectedProjectId?: string | null;
}

const norm = (s: any) => String(s ?? "").trim().toLowerCase();
const SPREAD_THRESHOLD = 15;       // pp — sources concordant if within this
const HIGH_VARIANCE_THRESHOLD = 20; // pp — flagged as high variance for data quality

// Programme thresholds (WHO / Nigeria NTD MDA targets)
const DISEASE_THRESHOLD: Record<string, number> = { trachoma: 80, sch_sth: 75, lf: 65 };

// ─── MDA / CTS field resolution helpers ──────────────────────────────────────
function buildIdNameMap(questions: any[]): Record<string, string> {
  const map: Record<string, string> = {};
  const walk = (items: any[]) => {
    (items || []).forEach((item) => {
      if (!item) return;
      if (Array.isArray(item.questions)) walk(item.questions);
      if (item.id && item.name) map[item.id] = item.name;
    });
  };
  walk(questions);
  return map;
}
function buildOptionLabelMap(questions: any[]): Record<string, Record<string, string>> {
  const map: Record<string, Record<string, string>> = {};
  const walk = (items: any[]) => {
    (items || []).forEach((item) => {
      if (!item) return;
      if (Array.isArray(item.questions)) walk(item.questions);
      if (item.name && Array.isArray(item.options)) {
        map[item.name] = Object.fromEntries(item.options.map((opt: any) => [String(opt.value), opt.label]));
      }
    });
  };
  walk(questions);
  return map;
}
function byName(data: Record<string, any>, idName: Record<string, string>, optionLabels: Record<string, Record<string, string>> = {}) {
  const out: Record<string, any> = {};
  Object.entries(data || {}).forEach(([k, v]) => {
    const name = idName[k];
    if (name) out[name] = optionLabels[name]?.[String(v)] ?? v;
    out[k] = v;
  });
  return out;
}
const toNum = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const boundedPct = (num: number | null, den: number | null) => {
  if (num == null || den == null || den <= 0) return null;
  return Math.max(0, Math.min(100, (num / den) * 100));
};
const fmtPct = (v: number | null) => (v != null ? `${Math.round(v)}%` : "—");

// Concordance index → colour band (categorical, colour-blind safe)
function concordanceFill(idx: number | null): string {
  if (idx == null) return "#e2e8f0";
  if (idx >= 80) return "#16a34a";
  if (idx >= 60) return "#eab308";
  if (idx >= 40) return "#f97316";
  return "#ef4444";
}

export default function PowerBIDashboard({ selectedProjectId }: PowerBIDashboardProps) {
  const { calcTargetPop, label: targetPopLabel } = useTargetPopFields();
  const { isSuperAdmin } = useAuth();
  const [demoMode, setDemoMode] = useState(false);

  const [loading, setLoading] = useState(true);
  const [microplans, setMicroplans] = useState<any[]>([]);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [segments, setSegments] = useState<any[]>([]);
  const [mdaRows, setMdaRows] = useState<any[]>([]);
  const [ctsRows, setCtsRows] = useState<any[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const [selectedState, setSelectedState] = useState("All");
  const [selectedLga, setSelectedLga] = useState("All");
  const [selectedWard, setSelectedWard] = useState("All");
  const [selectedMonth, setSelectedMonth] = useState("All");
  const [selectedProgram, setSelectedProgram] = useState("All");
  const [selectedDisease, setSelectedDisease] = useState("All");

  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = !!opts?.silent;
    const safety = setTimeout(() => setLoading(false), 25000);
    try {
      if (!silent) setLoading(true);

      const fetchPaginated = async (table: string, sel: string, projectFilter = true) => {
        let all: any[] = [];
        let from = 0;
        const PAGE = 1000;
        while (true) {
          let q = supabase.from(table as any).select(sel);
          if (projectFilter && selectedProjectId) q = q.eq("project_id", selectedProjectId);
          const { data, error } = await q.range(from, from + PAGE - 1);
          if (error || !data || data.length === 0) break;
          all = all.concat(data);
          if (data.length < PAGE) break;
          from += PAGE;
        }
        return all;
      };

      const [microData, surveyData] = await Promise.all([
        fetchPaginated(
          "microplan_entries",
          "id, state, lga, ward, flhf_name, community_name, settlement_name, campaign_type, status, " +
          "estimated_total_population, estimated_children_0_4, estimated_children_5_14, estimated_adults_15_plus, " +
          "trachoma_0_5_months, trachoma_6m_6y, trachoma_7_14y, trachoma_15_plus, " +
          "total_treated, number_of_households, households_treated, community_latitude, community_longitude, " +
          "community_lat_override, community_lng_override, created_at",
          true,
        ),
        fetchPaginated(
          "ces_surveys",
          "id, state, lga, ward, flhf_name, community_name, status, supervisor_qc_at, target_sample_n, center_lat, center_lng",
          true,
        ),
      ]);

      const surveyIds = surveyData.map((s) => s.id);
      let visitData: any[] = [];
      let segmentData: any[] = [];
      if (surveyIds.length > 0) {
        const idChunks: string[][] = [];
        for (let i = 0; i < surveyIds.length; i += 100) idChunks.push(surveyIds.slice(i, i + 100));
        for (const chunk of idChunks) {
          const [{ data: v }, { data: seg }] = await Promise.all([
            supabase.from("ces_household_visits" as any)
              .select("id, survey_id, eligible_persons, treated_persons, treatment_took_place, coverage_status")
              .in("survey_id", chunk),
            supabase.from("ces_segments" as any)
              .select("id, survey_id, total_hh_in_segment, hh_treated_in_segment, est_hh, treated_hh, coverage_pct")
              .in("survey_id", chunk),
          ]);
          if (v) visitData = visitData.concat(v);
          if (seg) segmentData = segmentData.concat(seg);
        }
      }

      // Forms (MDA supervisory checklist + Community/Village/School Summary)
      let formQuery = supabase.from("forms" as any).select("id, project_id, questions, settings");
      if (selectedProjectId) formQuery = formQuery.eq("project_id", selectedProjectId);
      const { data: forms } = await formQuery;

      const pageSubs = async (formIds: string[]) => {
        let subs: any[] = [];
        let from = 0;
        const PAGE = 1000;
        while (true) {
          const { data, error } = await supabase
            .from("form_submissions" as any)
            .select("id, form_id, data, created_at, status")
            .in("form_id", formIds)
            .range(from, from + PAGE - 1)
            .order("created_at", { ascending: false });
          if (error || !data || data.length === 0) break;
          subs = subs.concat(data);
          if (data.length < PAGE) break;
          from += PAGE;
        }
        return subs;
      };

      // MDA supervisory checklist
      let mdaMapped: any[] = [];
      const mdaForms = (forms || []).filter((f: any) => f?.settings?.isMdaChecklist);
      if (mdaForms.length > 0) {
        const idN: Record<string, Record<string, string>> = {};
        const optL: Record<string, Record<string, Record<string, string>>> = {};
        mdaForms.forEach((f: any) => { idN[f.id] = buildIdNameMap(f.questions || []); optL[f.id] = buildOptionLabelMap(f.questions || []); });
        const subs = await pageSubs(mdaForms.map((f: any) => f.id));
        mdaMapped = subs.map((s) => {
          const d = byName(s.data || {}, idN[s.form_id] || {}, optL[s.form_id] || {});
          return {
            id: s.id, createdAt: s.created_at,
            state: d.state || "", lga: d.lga || "", ward: d.ward || "", community: d.community || "",
            personsEligible: toNum(d.persons_eligible),
            personsTreated: toNum(d.persons_treated),
            hhVisited: toNum(d.hh_visited),
            hhTreated: toNum(d.hh_with_member_treated),
          };
        });
      }

      // Community/Village/School Summary (Level 1) — third triangulation source
      let ctsMapped: any[] = [];
      const ctsForms = (forms || []).filter((f: any) => f?.settings?.treatmentTool === "community_summary");
      if (ctsForms.length > 0) {
        const idN: Record<string, Record<string, string>> = {};
        const optL: Record<string, Record<string, Record<string, string>>> = {};
        ctsForms.forEach((f: any) => { idN[f.id] = buildIdNameMap(f.questions || []); optL[f.id] = buildOptionLabelMap(f.questions || []); });
        const subs = await pageSubs(ctsForms.map((f: any) => f.id));
        const g2 = (a: any, b: any) => (toNum(a) ?? 0) + (toNum(b) ?? 0);
        ctsMapped = subs
          .filter((s) => s.status !== "draft")
          .map((s) => {
            const d = byName(s.data || {}, idN[s.form_id] || {}, optL[s.form_id] || {});
            const ivm = g2(d.ivm_males_treated, d.ivm_females_treated);
            const alb = g2(d.alb_males_treated, d.alb_females_treated);
            const pzq = g2(d.pzq_males_treated, d.pzq_females_treated);
            const meb = g2(d.meb_males_treated, d.meb_females_treated);
            const trach = (toNum(d.azt_tabs_treated) ?? 0) + (toNum(d.azt_pos_treated) ?? 0) + (toNum(d.teo_treated) ?? 0);
            // Registered / age-band populations
            const totalPop = g2(d.pop_males, d.pop_females)
              || ((toNum(d.children_0_4) ?? 0) + (toNum(d.children_5_14) ?? 0) + (toNum(d.persons_15_plus) ?? 0))
              || ((toNum(d.trachoma_0_5m) ?? 0) + (toNum(d.trachoma_6m_6y) ?? 0) + (toNum(d.trachoma_7_15y) ?? 0));
            const children514 = toNum(d.children_5_14) ?? 0;
            const adults15 = toNum(d.persons_15_plus) ?? 0;
            return {
              id: s.id, createdAt: s.created_at,
              state: d.state || "", lga: d.lga || "", ward: d.ward || "", community: d.community || "",
              // Overall persons treated (max to avoid double counting co-administered meds)
              personsTreated: Math.max(ivm, alb, pzq, meb, trach),
              eligible: totalPop,
              hhTotal: toNum(d.total_households),
              hhTreated: toNum(d.households_treated),
              // Disease-specific treated + target population (WHO target groups)
              trTreated: trach, trTarget: totalPop,                         // Trachoma → total population
              ssTreated: Math.max(pzq, alb, meb), ssTarget: children514,    // SCH/STH → children 5–14
              lfTreated: ivm, lfTarget: children514 + adults15,             // LF/Oncho → 5–14 + 15+
            };
          });
      }

      setMicroplans(microData);
      setSurveys(surveyData);
      setVisits(visitData);
      setSegments(segmentData);
      setMdaRows(mdaMapped);
      setCtsRows(ctsMapped);
      setLastSync(new Date().toLocaleString());
    } catch (err) {
      console.error("Operations fetch error:", err);
      if (!silent) toast({ title: "Sync Error", description: "Failed to refresh operations data.", variant: "destructive" });
    } finally {
      clearTimeout(safety);
      setLoading(false);
    }
  }, [selectedProjectId]);

  const scheduleSilentRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = setTimeout(() => fetchData({ silent: true }), 1500);
  }, [fetchData]);

  useEffect(() => {
    fetchData();
    const channels = [
      supabase.channel("ops-micro").on("postgres_changes", { event: "*", schema: "public", table: "microplan_entries" }, scheduleSilentRefresh).subscribe(),
      supabase.channel("ops-surveys").on("postgres_changes", { event: "*", schema: "public", table: "ces_surveys" }, scheduleSilentRefresh).subscribe(),
      supabase.channel("ops-visits").on("postgres_changes", { event: "*", schema: "public", table: "ces_household_visits" }, scheduleSilentRefresh).subscribe(),
      supabase.channel("ops-segments").on("postgres_changes", { event: "*", schema: "public", table: "ces_segments" }, scheduleSilentRefresh).subscribe(),
      supabase.channel("ops-subs").on("postgres_changes", { event: "*", schema: "public", table: "form_submissions" }, scheduleSilentRefresh).subscribe(),
    ];
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      channels.forEach((c) => supabase.removeChannel(c));
    };
  }, [fetchData, scheduleSilentRefresh]);

  useEffect(() => {
    const handler = () => scheduleSilentRefresh();
    window.addEventListener("microplan-target-pop-fields:changed", handler);
    return () => window.removeEventListener("microplan-target-pop-fields:changed", handler);
  }, [scheduleSilentRefresh]);

  // ─── Demo simulation (Owner / Super Admin only) ─────────────────────────────
  // Generates a fully-populated synthetic dataset across all 36 states + FCT that
  // drives the entire Operations dashboard through the identical aggregation logic.
  const demoData = useMemo(() => (demoMode ? generateOpsDemoData() : null), [demoMode]);
  const effCtsRows = demoData ? demoData.ctsRows : ctsRows;
  const effMdaRows = demoData ? demoData.mdaRows : mdaRows;


  // ─── Filter option lists ────────────────────────────────────────────────────
  const lgaOptions = useMemo(() => (selectedState !== "All" ? getLGAsForState(selectedState) : []), [selectedState]);
  const wardOptions = useMemo(() => (selectedState !== "All" && selectedLga !== "All" ? getWardsForLGA(selectedState, selectedLga) : []), [selectedState, selectedLga]);
  const programOptions = useMemo(() => {
    const set = new Set<string>();
    microplans.forEach((m) => { if (m.campaign_type) set.add(m.campaign_type); });
    return Array.from(set).sort();
  }, [microplans]);
  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    [...effCtsRows, ...effMdaRows].forEach((r) => {
      if (r.createdAt) set.add(String(r.createdAt).slice(0, 7)); // YYYY-MM
    });
    return Array.from(set).sort().reverse();
  }, [effCtsRows, effMdaRows]);

  const monthLabel = (ym: string) => {
    if (ym === "All") return "All";
    const [y, m] = ym.split("-");
    return `${["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][Number(m)]} ${y}`;
  };

  // ─── Scope matchers ─────────────────────────────────────────────────────────
  const matchGeo = useCallback((r: { state?: string; lga?: string; ward?: string; community_name?: string; community?: string }) => {
    if (selectedState !== "All" && norm(r.state) !== norm(selectedState)) return false;
    if (selectedLga !== "All" && norm(r.lga) !== norm(selectedLga)) return false;
    if (selectedWard !== "All" && norm(r.ward) !== norm(selectedWard)) return false;
    return true;
  }, [selectedState, selectedLga, selectedWard]);

  const matchMonth = useCallback((createdAt?: string) => {
    if (selectedMonth === "All") return true;
    return !!createdAt && String(createdAt).slice(0, 7) === selectedMonth;
  }, [selectedMonth]);

  // ─── Community-level triangulation (single source of truth) ──────────────────
  const liveCommunities = useMemo(() => {
    type Row = {
      key: string; state: string; lga: string; ward: string; community: string;
      lat: number | null; lng: number | null;
      microPresent: boolean; targetPop: number;
      microTreated: number; microHH: number; microHHTreated: number;
      microTherap: number | null; microGeo: number | null;
      cesElig: number; cesTreatedPersons: number; cesHHVisited: number; cesHHTreated: number;
      cesSegHH: number; cesSegTreated: number;
      cesTherap: number | null; cesGeo: number | null; cesValidated: boolean; cesVisits: number;
      mdaPresent: boolean; mdaEligible: number; mdaTreated: number; mdaHHVisited: number; mdaHHTreated: number;
      mdaTherap: number | null; mdaGeo: number | null;
      ctsPresent: boolean; ctsTreated: number; ctsElig: number; ctsHHTotal: number; ctsHHTreated: number;
      ctsTherap: number | null; ctsGeo: number | null;
      // disease-specific (CTS)
      trTreated: number; trTarget: number; ssTreated: number; ssTarget: number; lfTreated: number; lfTarget: number;
      // resolved third source
      summaryTherap: number | null; summaryGeo: number | null;
    };
    const map = new Map<string, Row>();
    const keyOf = (s: string, l: string, w: string, c: string) => [norm(s), norm(l), norm(w), norm(c)].join("|");
    const ensure = (state: string, lga: string, ward: string, community: string): Row => {
      const k = keyOf(state, lga, ward, community);
      let r = map.get(k);
      if (!r) {
        r = {
          key: k, state, lga, ward, community, lat: null, lng: null,
          microPresent: false, targetPop: 0,
          microTreated: 0, microHH: 0, microHHTreated: 0, microTherap: null, microGeo: null,
          cesElig: 0, cesTreatedPersons: 0, cesHHVisited: 0, cesHHTreated: 0,
          cesSegHH: 0, cesSegTreated: 0, cesTherap: null, cesGeo: null, cesValidated: false, cesVisits: 0,
          mdaPresent: false, mdaEligible: 0, mdaTreated: 0, mdaHHVisited: 0, mdaHHTreated: 0, mdaTherap: null, mdaGeo: null,
          ctsPresent: false, ctsTreated: 0, ctsElig: 0, ctsHHTotal: 0, ctsHHTreated: 0, ctsTherap: null, ctsGeo: null,
          trTreated: 0, trTarget: 0, ssTreated: 0, ssTarget: 0, lfTreated: 0, lfTarget: 0,
          summaryTherap: null, summaryGeo: null,
        };
        map.set(k, r);
      }
      return r;
    };

    // Microplanning (target + planned/reported coverage)
    microplans
      .filter((m) => matchGeo(m) && (selectedProgram === "All" || norm(m.campaign_type) === norm(selectedProgram)))
      .forEach((m) => {
        if (!m.community_name) return;
        const r = ensure(m.state, m.lga, m.ward, m.community_name);
        r.microPresent = true;
        const selected = calcTargetPop(m);
        if (selected > 0) r.targetPop += selected;
        else if (m.estimated_total_population) r.targetPop += m.estimated_total_population;
        r.microTreated += m.total_treated || 0;
        r.microHH += m.number_of_households || 0;
        r.microHHTreated += m.households_treated || 0;
        const lat = m.community_lat_override ?? m.community_latitude ?? null;
        const lng = m.community_lng_override ?? m.community_longitude ?? null;
        if (r.lat == null && lat != null) { r.lat = lat; r.lng = lng; }
      });

    // CES surveys → visits + segments
    const visitsBySurvey = new Map<string, any[]>();
    visits.forEach((v) => { const a = visitsBySurvey.get(v.survey_id) || []; a.push(v); visitsBySurvey.set(v.survey_id, a); });
    const segsBySurvey = new Map<string, any[]>();
    segments.forEach((s) => { const a = segsBySurvey.get(s.survey_id) || []; a.push(s); segsBySurvey.set(s.survey_id, a); });

    surveys.filter((s) => matchGeo(s)).forEach((s) => {
      if (!s.community_name) return;
      const r = ensure(s.state, s.lga, s.ward, s.community_name);
      if (r.lat == null && s.center_lat != null) { r.lat = s.center_lat; r.lng = s.center_lng; }
      if (s.status === "locked" || s.supervisor_qc_at) r.cesValidated = true;
      (visitsBySurvey.get(s.id) || []).forEach((v) => {
        r.cesVisits += 1;
        if (v.eligible_persons != null) r.cesElig += v.eligible_persons || 0;
        if (v.treated_persons != null) r.cesTreatedPersons += v.treated_persons || 0;
        r.cesHHVisited += 1;
        if (v.treatment_took_place === true || norm(v.coverage_status) === "treated") r.cesHHTreated += 1;
      });
      (segsBySurvey.get(s.id) || []).forEach((seg) => {
        r.cesSegHH += (seg.total_hh_in_segment ?? seg.est_hh ?? 0) || 0;
        r.cesSegTreated += (seg.hh_treated_in_segment ?? seg.treated_hh ?? 0) || 0;
      });
    });

    // MDA supervisory checklist
    mdaRows
      .filter((m) => matchGeo({ ...m, community_name: m.community }) && matchMonth(m.createdAt))
      .forEach((m) => {
        if (!m.community) return;
        const r = ensure(m.state, m.lga, m.ward, m.community);
        r.mdaPresent = true;
        if (m.personsEligible != null) r.mdaEligible += Math.max(0, m.personsEligible);
        if (m.personsTreated != null) r.mdaTreated += Math.max(0, Math.min(m.personsTreated, m.personsEligible ?? m.personsTreated));
        if (m.hhVisited != null) r.mdaHHVisited += Math.max(0, m.hhVisited);
        if (m.hhTreated != null) r.mdaHHTreated += Math.max(0, Math.min(m.hhTreated, m.hhVisited ?? m.hhTreated));
      });

    // Community/Village/School Summary (Level 1)
    ctsRows
      .filter((m) => matchGeo({ ...m, community_name: m.community }) && matchMonth(m.createdAt))
      .forEach((m) => {
        if (!m.community) return;
        const r = ensure(m.state, m.lga, m.ward, m.community);
        r.ctsPresent = true;
        r.ctsTreated += Math.max(0, m.personsTreated || 0);
        r.ctsElig += Math.max(0, m.eligible || 0);
        if (m.hhTotal != null) r.ctsHHTotal += Math.max(0, m.hhTotal);
        if (m.hhTreated != null) r.ctsHHTreated += Math.max(0, Math.min(m.hhTreated, m.hhTotal ?? m.hhTreated));
        r.trTreated += m.trTreated || 0; r.trTarget += m.trTarget || 0;
        r.ssTreated += m.ssTreated || 0; r.ssTarget += m.ssTarget || 0;
        r.lfTreated += m.lfTreated || 0; r.lfTarget += m.lfTarget || 0;
      });

    map.forEach((r) => {
      r.microTherap = boundedPct(r.microTreated, r.targetPop);
      r.microGeo = boundedPct(r.microHHTreated, r.microHH);
      r.cesTherap = boundedPct(r.cesTreatedPersons, r.cesElig);
      r.cesGeo = r.cesSegHH > 0 ? boundedPct(r.cesSegTreated, r.cesSegHH) : boundedPct(r.cesHHTreated, r.cesHHVisited);
      r.mdaTherap = boundedPct(r.mdaTreated, r.mdaEligible);
      r.mdaGeo = boundedPct(r.mdaHHTreated, r.mdaHHVisited);
      r.ctsTherap = boundedPct(r.ctsTreated, r.ctsElig);
      r.ctsGeo = r.ctsHHTotal > 0 && r.ctsHHTreated > 0 ? boundedPct(r.ctsHHTreated, r.ctsHHTotal) : null;
      // Third triangulation source: Community Summary where present, else Microplan Coverage tab
      r.summaryTherap = r.ctsPresent && r.ctsTherap != null ? r.ctsTherap : r.microTherap;
      r.summaryGeo = r.ctsGeo != null ? r.ctsGeo : r.microGeo;
    });

    return Array.from(map.values());
  }, [microplans, surveys, visits, segments, mdaRows, ctsRows, matchGeo, matchMonth, selectedProgram, calcTargetPop]);

  // In demo mode, scope the synthetic communities by the active filters and use
  // them in place of live data — the rest of the pipeline is unchanged.
  const communities = useMemo(() => {
    if (!demoData) return liveCommunities;
    return demoData.communities.filter((c) =>
      matchGeo({ state: c.state, lga: c.lga, ward: c.ward, community_name: c.community }),
    );
  }, [demoData, liveCommunities, matchGeo]);



  // Concordance per community (therapeutic)
  const triangulated = useMemo(() => communities.map((c) => {
    const therapRefs = [c.summaryTherap, c.cesTherap, c.mdaTherap].filter((v): v is number => v != null && v > 0);
    const therapSpread = therapRefs.length > 1 ? Math.max(...therapRefs) - Math.min(...therapRefs) : null;
    const geoRefs = [c.summaryGeo, c.cesGeo, c.mdaGeo].filter((v): v is number => v != null && v > 0);
    const geoSpread = geoRefs.length > 1 ? Math.max(...geoRefs) - Math.min(...geoRefs) : null;
    return { ...c, therapSpread, geoSpread };
  }), [communities]);

  // ─── LGA-level aggregation ───────────────────────────────────────────────────
  type LgaAgg = {
    state: string; lga: string; key: string;
    communities: number; planned: number;
    summaryTherap: number | null; cesTherap: number | null; mdaTherap: number | null;
    summaryGeo: number | null; cesGeo: number | null; mdaGeo: number | null;
    therapConcordance: number | null; geoConcordance: number | null;
    visited: number; treatmentData: number;
    trCov: number | null; ssCov: number | null; lfCov: number | null;
  };
  const lgaAggs = useMemo(() => {
    const buckets = new Map<string, {
      state: string; lga: string;
      sT: number[]; cT: number[]; mT: number[]; sG: number[]; cG: number[]; mG: number[];
      therapSpreads: number[]; geoSpreads: number[]; communities: number; planned: number;
      visited: number; treatmentData: number;
      trTreated: number; trTarget: number; ssTreated: number; ssTarget: number; lfTreated: number; lfTarget: number;
    }>();
    triangulated.forEach((c) => {
      if (!c.lga) return;
      const k = lgaKey(c.state, c.lga);
      let b = buckets.get(k);
      if (!b) {
        b = { state: c.state, lga: c.lga, sT: [], cT: [], mT: [], sG: [], cG: [], mG: [], therapSpreads: [], geoSpreads: [], communities: 0, planned: 0, visited: 0, treatmentData: 0, trTreated: 0, trTarget: 0, ssTreated: 0, ssTarget: 0, lfTreated: 0, lfTarget: 0 };
        buckets.set(k, b);
      }
      b.communities += 1;
      if (c.microPresent) b.planned += 1;
      if (c.mdaPresent) b.visited += 1;
      if (c.ctsPresent) b.treatmentData += 1;
      if (c.summaryTherap != null) b.sT.push(c.summaryTherap);
      if (c.cesTherap != null) b.cT.push(c.cesTherap);
      if (c.mdaTherap != null) b.mT.push(c.mdaTherap);
      if (c.summaryGeo != null) b.sG.push(c.summaryGeo);
      if (c.cesGeo != null) b.cG.push(c.cesGeo);
      if (c.mdaGeo != null) b.mG.push(c.mdaGeo);
      if (c.therapSpread != null) b.therapSpreads.push(c.therapSpread);
      if (c.geoSpread != null) b.geoSpreads.push(c.geoSpread);
      b.trTreated += c.trTreated; b.trTarget += c.trTarget;
      b.ssTreated += c.ssTreated; b.ssTarget += c.ssTarget;
      b.lfTreated += c.lfTreated; b.lfTarget += c.lfTarget;
    });
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    // concordance index = 100 - mean spread (clamped); needs ≥1 comparable community
    const concordance = (spreads: number[]) => (spreads.length ? Math.max(0, Math.min(100, 100 - avg(spreads)!)) : null);
    const out = new Map<string, LgaAgg>();
    buckets.forEach((b, k) => {
      out.set(k, {
        state: b.state, lga: b.lga, key: k,
        communities: b.communities, planned: b.planned,
        summaryTherap: avg(b.sT), cesTherap: avg(b.cT), mdaTherap: avg(b.mT),
        summaryGeo: avg(b.sG), cesGeo: avg(b.cG), mdaGeo: avg(b.mG),
        therapConcordance: concordance(b.therapSpreads),
        geoConcordance: concordance(b.geoSpreads),
        visited: b.visited, treatmentData: b.treatmentData,
        trCov: boundedPct(b.trTreated, b.trTarget),
        ssCov: boundedPct(b.ssTreated, b.ssTarget),
        lfCov: boundedPct(b.lfTreated, b.lfTarget),
      });
    });
    return out;
  }, [triangulated]);

  const lgaList = useMemo(() => Array.from(lgaAggs.values()), [lgaAggs]);

  // ─── Top KPIs ────────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const microplanned = communities.filter((c) => c.microPresent).length;
    const visited = communities.filter((c) => c.mdaPresent).length;
    const treatmentSupervised = communities.filter((c) => c.mdaTherap != null).length;
    const treatmentReported = communities.filter((c) => c.ctsPresent).length;
    const therapMet = lgaList.filter((l) => l.therapConcordance != null && l.therapConcordance >= 80).length;
    const geoMet = lgaList.filter((l) => l.geoConcordance != null && l.geoConcordance >= 80).length;
    return {
      microplanned, visited, treatmentSupervised, treatmentReported, therapMet, geoMet,
      pctVisited: microplanned ? (visited / microplanned) * 100 : null,
      pctTreatmentSup: microplanned ? (treatmentSupervised / microplanned) * 100 : null,
      pctReported: microplanned ? (treatmentReported / microplanned) * 100 : null,
    };
  }, [communities, lgaList]);

  // ─── Concordance map cells ─────────────────────────────────────────────────
  const concordanceCells = useMemo(() => {
    const m = new Map<string, ChoroCell>();
    const row = (label: string, v: number | null) =>
      `<div style="display:flex;justify-content:space-between;gap:12px;font-size:11px;margin-bottom:2px;"><span style="color:#64748b;font-weight:700;">${label}</span><span style="font-weight:900;color:#0f172a;">${v != null ? Math.round(v) + "%" : "—"}</span></div>`;
    lgaList.forEach((l) => {
      m.set(l.key, {
        fill: concordanceFill(l.therapConcordance),
        popupHtml: `<div style="min-width:210px;font-family:inherit;padding:4px;">
            <div style="font-weight:900;font-size:14px;color:#0f172a;">${l.lga} LGA</div>
            <div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">${l.state} State</div>
            <div style="background:#f8fafc;padding:8px;border-radius:8px;border:1px solid #e2e8f0;">
              ${row("Concordance (overall)", l.therapConcordance)}
              ${row("Therapeutic concordance", l.therapConcordance)}
              ${row("Geographic concordance", l.geoConcordance)}
              <div style="border-top:1px dashed #cbd5e1;margin-top:4px;padding-top:4px;">
              ${row("Communities", l.communities).replace(/%/, "")}
              ${row("Visited (supervision)", l.visited).replace(/%/, "")}
              ${row("Treatment data reported", l.treatmentData).replace(/%/, "")}
              </div>
            </div>
          </div>`,
      });
    });
    return m;
  }, [lgaList]);

  const achievementCells = useCallback((kind: "trachoma" | "sch_sth" | "lf") => {
    const m = new Map<string, ChoroCell>();
    const thr = DISEASE_THRESHOLD[kind];
    lgaList.forEach((l) => {
      const cov = kind === "trachoma" ? l.trCov : kind === "sch_sth" ? l.ssCov : l.lfCov;
      if (cov == null) return;
      m.set(l.key, {
        fill: cov >= thr ? "#16a34a" : "#f59e0b",
        opacity: 0.78,
        popupHtml: `<div style="font-family:inherit;padding:4px;min-width:160px;"><div style="font-weight:900;color:#0f172a;">${l.lga}</div><div style="font-size:11px;color:#64748b;">${l.state}</div><div style="margin-top:4px;font-weight:900;color:${cov >= thr ? "#16a34a" : "#b45309"};">${Math.round(cov)}% (target ≥${thr}%)</div></div>`,
      });
    });
    return m;
  }, [lgaList]);

  const trCells = useMemo(() => achievementCells("trachoma"), [achievementCells]);
  const ssCells = useMemo(() => achievementCells("sch_sth"), [achievementCells]);
  const lfCells = useMemo(() => achievementCells("lf"), [achievementCells]);

  // Disease filter → which achievement kinds are in scope ("Onchocerciasis" shares the
  // ivermectin (5–14 + 15+) target group with LF, so both map to the "lf" bucket).
  const diseaseScope = useMemo<Array<"trachoma" | "sch_sth" | "lf">>(() => {
    switch (selectedDisease) {
      case "Trachoma": return ["trachoma"];
      case "SCH / STH": return ["sch_sth"];
      case "LF":
      case "Onchocerciasis": return ["lf"];
      default: return ["trachoma", "sch_sth", "lf"];
    }
  }, [selectedDisease]);

  const achievementStat = useCallback((kind: "trachoma" | "sch_sth" | "lf") => {
    const thr = DISEASE_THRESHOLD[kind];
    const withData = lgaList.filter((l) => (kind === "trachoma" ? l.trCov : kind === "sch_sth" ? l.ssCov : l.lfCov) != null);
    const achieved = withData.filter((l) => ((kind === "trachoma" ? l.trCov : kind === "sch_sth" ? l.ssCov : l.lfCov) as number) >= thr).length;
    return { achieved, total: TOTAL_NIGERIA_LGAS, pct: withData.length ? (achieved / withData.length) * 100 : null };
  }, [lgaList]);

  // ─── Source variance (dumbbell rows) ────────────────────────────────────────
  const varianceRows = useMemo(() => {
    return lgaList
      .map((l) => ({
        name: l.lga,
        summary: l.summaryTherap != null ? Math.round(l.summaryTherap) : null,
        ces: l.cesTherap != null ? Math.round(l.cesTherap) : null,
        supervision: l.mdaTherap != null ? Math.round(l.mdaTherap) : null,
      }))
      .filter((r) => [r.summary, r.ces, r.supervision].filter((v) => v != null).length > 1)
      .sort((a, b) => {
        const sp = (r: typeof a) => { const v = [r.summary, r.ces, r.supervision].filter((x): x is number => x != null); return Math.max(...v) - Math.min(...v); };
        return sp(b) - sp(a);
      })
      .slice(0, 12);
  }, [lgaList]);

  // ─── Therapeutic coverage by source (grouped bars) ──────────────────────────
  const coverageBySource = useMemo(() => {
    return lgaList
      .filter((l) => l.summaryTherap != null || l.cesTherap != null || l.mdaTherap != null)
      .sort((a, b) => b.communities - a.communities)
      .slice(0, 10)
      .map((l) => ({
        name: l.lga,
        Summary: l.summaryTherap != null ? Math.round(l.summaryTherap) : null,
        CES: l.cesTherap != null ? Math.round(l.cesTherap) : null,
        MDA: l.mdaTherap != null ? Math.round(l.mdaTherap) : null,
      }));
  }, [lgaList]);

  // ─── Supervision coverage gap (point markers) ───────────────────────────────
  const gapPoints = useMemo<GapPoint[]>(() => {
    return communities
      .filter((c) => c.microPresent && c.lat != null && c.lng != null)
      .map((c) => ({ lat: c.lat as number, lng: c.lng as number, visited: c.mdaPresent, name: c.community, sub: `${c.lga || "—"}, ${c.state || "—"}` }));
  }, [communities]);

  const gapStat = useMemo(() => {
    const total = kpi.microplanned;
    const visited = kpi.visited;
    return { total, visited, notVisited: total - visited, pct: kpi.pctVisited };
  }, [kpi]);

  // ─── Data quality snapshot ───────────────────────────────────────────────────
  const dataQuality = useMemo(() => {
    const treatmentRecords = effCtsRows.filter((r) => matchMonth(r.createdAt)).length + effMdaRows.filter((r) => matchMonth(r.createdAt)).length;
    const completeness = kpi.microplanned ? (kpi.treatmentReported / kpi.microplanned) * 100 : null;
    const cesComm = communities.filter((c) => c.cesTherap != null).length;
    const cesValidated = communities.filter((c) => c.cesValidated).length;
    const qcRate = cesComm ? (cesValidated / cesComm) * 100 : null;
    const comparable = triangulated.filter((c) => c.therapSpread != null);
    const aligned = comparable.filter((c) => (c.therapSpread as number) <= SPREAD_THRESHOLD).length;
    const consistency = comparable.length ? (aligned / comparable.length) * 100 : null;
    const highVarianceLgas = lgaList.filter((l) => {
      const refs = [l.summaryTherap, l.cesTherap, l.mdaTherap].filter((v): v is number => v != null);
      return refs.length > 1 && (Math.max(...refs) - Math.min(...refs)) > HIGH_VARIANCE_THRESHOLD;
    }).length;
    const parts = [completeness, qcRate, consistency].filter((v): v is number => v != null);
    const score = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
    return { treatmentRecords, completeness, qcRate, consistency, highVarianceLgas, score, highVariancePct: lgaList.length ? (highVarianceLgas / lgaList.length) * 100 : null };
  }, [effCtsRows, effMdaRows, matchMonth, kpi, communities, triangulated, lgaList]);

  // ─── Executive insight (data-driven) ────────────────────────────────────────
  const insights = useMemo(() => {
    const out: { tone: string; text: string }[] = [];
    if (lgaList.length === 0) {
      out.push({ tone: "slate", text: "No microplanning, Community Treatment Summary, Coverage Evaluation or MDA supervision data matches the current scope yet. Insights populate as field data syncs." });
      return out;
    }
    const therapMetPct = TOTAL_NIGERIA_LGAS ? (kpi.therapMet / TOTAL_NIGERIA_LGAS) * 100 : 0;
    out.push({ tone: "emerald", text: `${kpi.therapMet} LGAs (${therapMetPct.toFixed(1)}%) meet the ≥80% therapeutic concordance threshold across the three data sources.` });
    if (gapStat.total > 0) {
      out.push({ tone: "amber", text: `Supervision coverage gap: ${gapStat.notVisited.toLocaleString()} microplanned communities (${(100 - (gapStat.pct ?? 0)).toFixed(1)}%) were not visited during MDA supervision.` });
    }
    const diseaseMeta: Record<string, { label: string }> = { trachoma: { label: "Trachoma/Oncho" }, sch_sth: { label: "SCH/STH" }, lf: { label: "LF" } };
    diseaseScope.forEach((kind) => {
      const st = achievementStat(kind);
      if (st.pct != null) out.push({ tone: "sky", text: `${diseaseMeta[kind].label} therapeutic achievement: ${st.pct.toFixed(0)}% of reporting LGAs meet the ≥${DISEASE_THRESHOLD[kind]}% target.` });
    });
    if (dataQuality.highVarianceLgas > 0) {
      out.push({ tone: "rose", text: `High variance (>${HIGH_VARIANCE_THRESHOLD}pp) detected in ${dataQuality.highVarianceLgas} LGAs between sources — investigate and validate before reporting.` });
    }
    return out;
  }, [lgaList, kpi, gapStat, achievementStat, dataQuality, diseaseScope]);

  const toneRing: Record<string, string> = {
    emerald: "bg-emerald-100 text-emerald-600", amber: "bg-amber-100 text-amber-600",
    sky: "bg-sky-100 text-sky-600", rose: "bg-rose-100 text-rose-600", slate: "bg-slate-100 text-slate-500",
  };
  const toneIcon: Record<string, any> = { emerald: TrendingUp, amber: Clock, sky: Eye, rose: AlertTriangle, slate: Info };

  return (
    <div className="min-h-full bg-[#F1F5F9] p-3 md:p-5 space-y-4">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-col 2xl:flex-row 2xl:items-center justify-between gap-3 bg-[#0b1f3a] rounded-2xl px-4 py-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-white/10 flex items-center justify-center ring-1 ring-white/20">
            <Globe2 className="h-7 w-7 text-emerald-400" />
          </div>
          <div className="leading-tight">
            <h1 className="text-lg md:text-xl font-black text-white tracking-tight">NTD OPERATIONS</h1>
            <p className="text-[11px] font-bold text-emerald-300 uppercase tracking-widest">Operations Dashboard · Nigeria</p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <HeaderSelect label="State" value={selectedState} onChange={(v) => { setSelectedState(v); setSelectedLga("All"); setSelectedWard("All"); }} options={getAllStates()} allLabel="All" />
          <HeaderSelect label="LGA" value={selectedLga} onChange={(v) => { setSelectedLga(v); setSelectedWard("All"); }} options={lgaOptions} disabled={selectedState === "All"} allLabel="All" />
          <HeaderSelect label="Ward" value={selectedWard} onChange={setSelectedWard} options={wardOptions} disabled={selectedLga === "All"} allLabel="All" />
          <HeaderSelect label="Month / Year" value={selectedMonth} onChange={setSelectedMonth} options={monthOptions} allLabel="All" render={monthLabel} />
          <HeaderSelect label="Program" value={selectedProgram} onChange={setSelectedProgram} options={programOptions} allLabel="All" />
          <HeaderSelect label="Disease" value={selectedDisease} onChange={setSelectedDisease} options={["Trachoma", "SCH / STH", "LF", "Onchocerciasis"]} allLabel="All" />
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Updated</p>
            <p className="text-[11px] font-bold text-white">{lastSync || "syncing…"}</p>
          </div>
          <Button onClick={() => fetchData()} className="h-9 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh Data
          </Button>
        </div>
      </div>

      {/* ── KPI ribbon ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <KPICard icon={Users} tone="emerald" title="Microplanned Communities" value={kpi.microplanned.toLocaleString()} sub="All programs in scope" />
        <KPICard icon={Eye} tone="sky" title="% Communities Visited (MDA Supervision)" value={fmtPct(kpi.pctVisited)} sub={`${kpi.visited.toLocaleString()} / ${kpi.microplanned.toLocaleString()}`} />
        <KPICard icon={ClipboardCheck} tone="indigo" title="% Communities with Treatment Supervision" value={fmtPct(kpi.pctTreatmentSup)} sub={`${kpi.treatmentSupervised.toLocaleString()} / ${kpi.microplanned.toLocaleString()}`} />
        <KPICard icon={FileText} tone="amber" title="% Communities with Treatment Data Reported" value={fmtPct(kpi.pctReported)} sub={`${kpi.treatmentReported.toLocaleString()} / ${kpi.microplanned.toLocaleString()}`} />
        <KPICard icon={ShieldCheck} tone="emerald" title="LGAs Meeting ≥80% Therapeutic Concordance" value={`${kpi.therapMet} / ${TOTAL_NIGERIA_LGAS}`} sub={`${((kpi.therapMet / TOTAL_NIGERIA_LGAS) * 100).toFixed(1)}% of LGAs`} />
        <KPICard icon={Globe2} tone="sky" title="LGAs Meeting ≥80% Geographic Concordance" value={`${kpi.geoMet} / ${TOTAL_NIGERIA_LGAS}`} sub={`${((kpi.geoMet / TOTAL_NIGERIA_LGAS) * 100).toFixed(1)}% of LGAs`} />
      </div>

      {/* ── Row: concordance map · variance · gap map · insight ─────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        {/* Concordance map */}
        <Card className="xl:col-span-4 border-none shadow-lg bg-white rounded-2xl overflow-hidden">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-black text-slate-900 flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" /> Concordance Map — Nigeria</CardTitle>
            <CardDescription className="text-[11px]">LGA shaded by Microplanning &amp; Coverage Evaluation vs MDA concordance</CardDescription>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="rounded-xl overflow-hidden border border-slate-200 relative z-0">
              <NigeriaChoropleth cells={concordanceCells} height={330} selectedState={selectedState} selectedLga={selectedLga} />
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {[["#16a34a", "≥ 80%"], ["#eab308", "60–79%"], ["#f97316", "40–59%"], ["#ef4444", "< 40%"], ["#e2e8f0", "No data"]].map(([c, l]) => (
                <span key={l} className="flex items-center gap-1.5"><span className="w-3.5 h-2.5 rounded-sm" style={{ background: c }} /><span className="text-[10px] font-bold text-slate-600">{l}</span></span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Source variance */}
        <Card className="xl:col-span-3 border-none shadow-lg bg-white rounded-2xl overflow-hidden">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-black text-slate-900">Source Variance</CardTitle>
            <CardDescription className="text-[11px]">Coverage spread between sources (percentage points)</CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <SourceVarianceDumbbell rows={varianceRows} />
          </CardContent>
        </Card>

        {/* Supervision coverage gap map */}
        <Card className="xl:col-span-3 border-none shadow-lg bg-white rounded-2xl overflow-hidden">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-black text-slate-900">Supervision Coverage Gap Map</CardTitle>
            <CardDescription className="text-[11px]">Microplanned communities / settlements</CardDescription>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <div className="rounded-xl overflow-hidden border border-slate-200 relative z-0">
              <SupervisionGapMap points={gapPoints} height={250} />
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-600" /><span className="text-[10px] font-bold text-slate-600">Visited</span></span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-600" /><span className="text-[10px] font-bold text-slate-600">Not visited</span></span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 p-2 text-center">
                <p className="text-base font-black text-emerald-700">{gapStat.visited.toLocaleString()}</p>
                <p className="text-[9px] font-bold text-emerald-600 uppercase">Visited {gapStat.pct != null ? `(${gapStat.pct.toFixed(1)}%)` : ""}</p>
              </div>
              <div className="rounded-lg bg-rose-50 border border-rose-100 p-2 text-center">
                <p className="text-base font-black text-rose-700">{gapStat.notVisited.toLocaleString()}</p>
                <p className="text-[9px] font-bold text-rose-600 uppercase">Not visited {gapStat.pct != null ? `(${(100 - gapStat.pct).toFixed(1)}%)` : ""}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Executive insight + thresholds */}
        <Card className="xl:col-span-2 border-none shadow-lg bg-white rounded-2xl overflow-hidden">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-black text-slate-900 flex items-center gap-2"><Lightbulb className="h-4 w-4 text-amber-500" /> Executive Insight</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-2.5">
            {insights.map((ins, i) => {
              const Icon = toneIcon[ins.tone] || Info;
              return (
                <div key={i} className="flex items-start gap-2">
                  <div className={`h-6 w-6 rounded-lg ${toneRing[ins.tone]} flex items-center justify-center shrink-0`}><Icon className="h-3.5 w-3.5" /></div>
                  <p className="text-[11px] font-semibold text-slate-600 leading-snug">{ins.text}</p>
                </div>
              );
            })}
            <div className="border-t border-slate-100 pt-2 mt-1">
              <p className="text-[10px] font-black text-slate-700 uppercase tracking-wider mb-1.5">Threshold Rules (Therapeutic)</p>
              {[["Trachoma / Oncho", "≥ 80%", "#16a34a"], ["SCH / STH", "≥ 75%", "#eab308"], ["LF", "≥ 65%", "#2563eb"]].map(([n, t, c]) => (
                <div key={n} className="flex items-center justify-between text-[10px] font-bold text-slate-600 mb-0.5">
                  <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: c }} />{n}</span><span>{t}</span>
                </div>
              ))}
              <p className="text-[9px] text-slate-400 mt-1.5">Basis: Community Treatment Summary &amp; Coverage Evaluation. Target population: {targetPopLabel}.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Row: coverage by source · achievement maps · data quality ──────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3">
        {/* Therapeutic coverage by source */}
        <Card className="xl:col-span-5 border-none shadow-lg bg-white rounded-2xl overflow-hidden">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-black text-slate-900">Therapeutic Coverage by Source</CardTitle>
            <CardDescription className="text-[11px]">Triangulation of three data sources, top LGAs by activity</CardDescription>
          </CardHeader>
          <CardContent className="p-3">
            {coverageBySource.length === 0 ? (
              <EmptyState text="No coverage data in the selected scope yet." />
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={coverageBySource} margin={{ left: -10, right: 10, top: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef2f7" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 700 }} interval={0} angle={-25} textAnchor="end" height={64} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                  <Tooltip formatter={(v: any) => (v == null ? ["—", ""] : [`${v}%`, ""])} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 10, fontWeight: 800 }} />
                  <ReferenceLine y={80} stroke="#16a34a" strokeDasharray="4 4" />
                  <Bar dataKey="Summary" name="Treatment Summary / Microplan" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="CES" name="Coverage Evaluation 3D" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="MDA" name="MDA Supervision (verified)" fill="#f97316" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Achievement maps */}
        <Card className="xl:col-span-4 border-none shadow-lg bg-white rounded-2xl overflow-hidden">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-black text-slate-900">Therapeutic Coverage Achievement by Programme Threshold</CardTitle>
            <CardDescription className="text-[11px]">LGAs achieving the disease-specific WHO/NTD target</CardDescription>
          </CardHeader>
          <CardContent className={`p-3 grid gap-2 ${diseaseScope.length === 1 ? "grid-cols-1" : "grid-cols-3"}`}>
            {([["trachoma", "Trachoma / Oncho", trCells], ["sch_sth", "SCH / STH", ssCells], ["lf", "LF", lfCells]] as const).filter(([kind]) => diseaseScope.includes(kind)).map(([kind, label, cells]) => {
              const st = achievementStat(kind);
              return (
                <div key={kind} className="flex flex-col">
                  <p className="text-[10px] font-black text-slate-700 leading-tight">{label}</p>
                  <p className="text-[9px] text-slate-400 mb-1">≥ {DISEASE_THRESHOLD[kind]}%</p>
                  <div className="rounded-lg overflow-hidden border border-slate-200 relative z-0">
                    <NigeriaChoropleth cells={cells} height={150} showBasemap={false} />
                  </div>
                  <p className="text-[11px] font-black text-emerald-700 mt-1">{st.pct != null ? `${st.pct.toFixed(0)}% achieved` : "—"}</p>
                  <p className="text-[9px] text-slate-500">{st.achieved} / {st.total} LGAs</p>
                </div>
              );
            })}
            <div className="col-span-full flex flex-wrap gap-3 mt-1">
              {[["#16a34a", "Achieved threshold"], ["#f59e0b", "Not achieved"], ["#e2e8f0", "No data"]].map(([c, l]) => (
                <span key={l} className="flex items-center gap-1.5"><span className="w-3 h-2.5 rounded-sm" style={{ background: c }} /><span className="text-[10px] font-bold text-slate-600">{l}</span></span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Data quality snapshot */}
        <Card className="xl:col-span-3 border-none shadow-lg bg-white rounded-2xl overflow-hidden">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-black text-slate-900 flex items-center gap-2"><Database className="h-4 w-4 text-primary" /> Data Quality Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="p-3 grid grid-cols-2 gap-2">
            <MiniStat icon={FileText} tone="sky" label="Treatment Records" value={dataQuality.treatmentRecords.toLocaleString()} sub={selectedMonth === "All" ? "All sources" : monthLabel(selectedMonth)} />
            <MiniStat icon={CheckCircle2} tone="emerald" label="Completeness Rate" value={fmtPct(dataQuality.completeness)} sub="Reported / planned" />
            <MiniStat icon={ShieldCheck} tone="indigo" label="CES QC-Validated" value={fmtPct(dataQuality.qcRate)} sub="Supervisor-locked" />
            <MiniStat icon={Gauge} tone="amber" label="Data Consistency" value={fmtPct(dataQuality.consistency)} sub="Sources agree ≤15pp" />
            <MiniStat icon={Target} tone="emerald" label="Data Quality Score" value={dataQuality.score != null ? `${Math.round(dataQuality.score)}/100` : "—"} sub="Composite" />
            <MiniStat icon={AlertTriangle} tone="rose" label="LGAs High Variance" value={dataQuality.highVarianceLgas.toString()} sub={`>${HIGH_VARIANCE_THRESHOLD}pp variance`} />
          </CardContent>
        </Card>
      </div>

      {/* ── Triangulation ledger ─────────────────────────────────────────────── */}
      <Card className="border-none shadow-lg bg-white rounded-2xl overflow-hidden">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-black text-slate-900">Triangulation Ledger — Therapeutic &amp; Geographic Coverage</CardTitle>
          <CardDescription className="text-[11px]">Three-source comparison per LGA. Use this ledger to validate differences between sources and drive coverage improvement.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {lgaList.length === 0 ? (
            <div className="p-8"><EmptyState text="No reconciliations available for the current scope." /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="text-[10px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 font-black">State</th>
                    <th className="px-3 py-2 font-black">LGA</th>
                    <th className="px-3 py-2 font-black text-right">Planned</th>
                    <th className="px-3 py-2 font-black text-right">Summary T%</th>
                    <th className="px-3 py-2 font-black text-right">CES T%</th>
                    <th className="px-3 py-2 font-black text-right">MDA T%</th>
                    <th className="px-3 py-2 font-black text-center">Therap. Conc.</th>
                    <th className="px-3 py-2 font-black text-right">Summary G%</th>
                    <th className="px-3 py-2 font-black text-right">CES G%</th>
                    <th className="px-3 py-2 font-black text-right">MDA G%</th>
                    <th className="px-3 py-2 font-black text-center">Geo Conc.</th>
                    <th className="px-3 py-2 font-black text-right">Visited</th>
                    <th className="px-3 py-2 font-black text-right">Treatment Data</th>
                  </tr>
                </thead>
                <tbody>
                  {lgaList
                    .slice()
                    .sort((a, b) => (a.therapConcordance ?? 101) - (b.therapConcordance ?? 101))
                    .map((l) => (
                      <tr key={l.key} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-500">{l.state || "—"}</td>
                        <td className="px-3 py-2 font-bold text-slate-900">{l.lga}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{l.planned.toLocaleString()}</td>
                        <td className="px-3 py-2 text-right font-medium" title="Community Treatment Summary (Level 1), else Geo Microplanning Coverage tab">{fmtPct(l.summaryTherap)}</td>
                        <td className="px-3 py-2 text-right font-medium" title="Coverage Evaluation 3D (measured)">{fmtPct(l.cesTherap)}</td>
                        <td className="px-3 py-2 text-right font-medium" title="MDA Supervisory Checklist (verified)">{fmtPct(l.mdaTherap)}</td>
                        <td className="px-3 py-2 text-center"><ConcDot v={l.therapConcordance} /></td>
                        <td className="px-3 py-2 text-right text-slate-700">{fmtPct(l.summaryGeo)}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{fmtPct(l.cesGeo)}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{fmtPct(l.mdaGeo)}</td>
                        <td className="px-3 py-2 text-center"><ConcDot v={l.geoConcordance} /></td>
                        <td className="px-3 py-2 text-right text-slate-700">{l.visited}</td>
                        <td className="px-3 py-2 text-right text-slate-700">{l.treatmentData}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function HeaderSelect({ label, value, onChange, options, disabled, allLabel, render }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; disabled?: boolean; allLabel: string; render?: (v: string) => string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-0.5">{label}</span>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="h-8 border border-white/10 bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold min-w-[110px] rounded-lg disabled:opacity-40">
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent className="rounded-xl shadow-2xl bg-white max-h-72">
          <SelectItem value="All" className="font-bold text-primary">{allLabel}</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o} className="font-medium text-slate-900">{render ? render(o) : o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function KPICard({ title, value, sub, icon: Icon, tone }: { title: string; value: React.ReactNode; sub?: string; icon: any; tone: string }) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary", sky: "bg-sky-100 text-sky-600", indigo: "bg-indigo-100 text-indigo-600",
    emerald: "bg-emerald-100 text-emerald-600", amber: "bg-amber-100 text-amber-600", rose: "bg-rose-100 text-rose-600",
  };
  return (
    <Card className="border-none shadow-lg bg-white rounded-2xl overflow-hidden">
      <CardContent className="p-3.5 flex items-start gap-3">
        <div className={`h-9 w-9 rounded-xl ${tones[tone]} flex items-center justify-center shrink-0`}><Icon className="h-5 w-5" /></div>
        <div className="min-w-0">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider leading-tight">{title}</p>
          <h3 className="text-xl font-black text-slate-900 tracking-tight mt-0.5">{value}</h3>
          {sub && <p className="text-[10px] text-slate-500 font-semibold leading-tight">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ icon: Icon, tone, label, value, sub }: { icon: any; tone: string; label: string; value: string; sub: string }) {
  const tones: Record<string, string> = {
    sky: "bg-sky-100 text-sky-600", emerald: "bg-emerald-100 text-emerald-600", indigo: "bg-indigo-100 text-indigo-600",
    amber: "bg-amber-100 text-amber-600", rose: "bg-rose-100 text-rose-600",
  };
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-2.5">
      <div className={`h-6 w-6 rounded-lg ${tones[tone]} flex items-center justify-center mb-1`}><Icon className="h-3.5 w-3.5" /></div>
      <p className="text-base font-black text-slate-900 leading-none">{value}</p>
      <p className="text-[9px] font-black text-slate-500 uppercase tracking-wide leading-tight mt-1">{label}</p>
      <p className="text-[9px] text-slate-400 font-semibold">{sub}</p>
    </div>
  );
}

function ConcDot({ v }: { v: number | null }) {
  if (v == null) return <span className="text-[10px] text-slate-300">—</span>;
  const color = v >= 80 ? "#16a34a" : v >= 60 ? "#eab308" : v >= 40 ? "#f97316" : "#ef4444";
  return (
    <span className="inline-flex items-center gap-1">
      <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      <span className="text-[10px] font-bold text-slate-600">{Math.round(v)}%</span>
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 gap-2">
      <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center"><Info className="h-6 w-6 text-slate-300" /></div>
      <p className="text-sm font-bold text-slate-400 max-w-xs">{text}</p>
    </div>
  );
}
