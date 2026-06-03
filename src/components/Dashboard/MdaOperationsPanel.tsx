import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  ClipboardCheck, ShieldAlert, PackageX, UserX, TrendingUp, GitCompareArrows, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import fgnEmblem from "@/assets/fgn-emblem.png";

interface MdaOperationsPanelProps {
  selectedProjectId?: string | null;
  filters: { state: string; lga: string; ward: string; community: string };
  /** CES + microplanning coverage already computed by the Operations dashboard, keyed by community name. */
  cesByCommunity?: Record<string, { cesTherapeutic: number; microTherapeutic: number; microPresent: boolean }>;
}

const RISK_COLORS: Record<string, string> = { Low: "#16a34a", Medium: "#eab308", High: "#dc2626" };
const norm = (s: any) => String(s ?? "").trim().toLowerCase();

// Walk a stored form definition (flat array possibly mixing groups + questions)
// and build a map of question.id -> question.name.
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

// Resolve a submission's value by question NAME using the form's id->name map.
function byName(data: Record<string, any>, idName: Record<string, string>, optionLabels: Record<string, Record<string, string>> = {}) {
  const out: Record<string, any> = {};
  Object.entries(data || {}).forEach(([k, v]) => {
    const name = idName[k];
    if (name) out[name] = optionLabels[name]?.[String(v)] ?? v;
    out[k] = v; // keep raw too
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

function KPI({ icon: Icon, label, value, sub, tone = "primary" }: any) {
  const tones: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    danger: "bg-red-100 text-red-600",
    warn: "bg-amber-100 text-amber-600",
    good: "bg-emerald-100 text-emerald-600",
  };
  return (
    <Card className="border-none shadow-xl bg-white rounded-3xl overflow-hidden">
      <CardContent className="p-5">
        <div className={`h-11 w-11 rounded-2xl ${tones[tone]} flex items-center justify-center mb-4`}>
          <Icon className="h-6 w-6" />
        </div>
        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.15em]">{label}</p>
        <h3 className="text-3xl font-black text-slate-900 tracking-tighter mt-1">{value}</h3>
        {sub && <p className="text-xs text-slate-500 font-semibold mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export default function MdaOperationsPanel({ selectedProjectId, filters, cesByCommunity }: MdaOperationsPanelProps) {
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [loading, setLoading] = useState(true);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      let formQuery = supabase
        .from("forms" as any)
        .select("id, name, project_id, questions, settings");
      if (selectedProjectId) formQuery = formQuery.eq("project_id", selectedProjectId);
      const { data: forms } = await formQuery;
      const mdaForms = (forms || []).filter((f: any) => f?.settings?.isMdaChecklist);
      if (mdaForms.length === 0) { setRows([]); return; }

      const idNameByForm: Record<string, Record<string, string>> = {};
      const optionLabelsByForm: Record<string, Record<string, Record<string, string>>> = {};
      mdaForms.forEach((f: any) => {
        idNameByForm[f.id] = buildIdNameMap(f.questions || []);
        optionLabelsByForm[f.id] = buildOptionLabelMap(f.questions || []);
      });

      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
      const formIds = mdaForms.map((f: any) => f.id);

      let all: any[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("form_submissions" as any)
          .select("id, form_id, data, created_at, status")
          .in("form_id", formIds)
          .gte("created_at", sixtyDaysAgo)
          .range(from, from + PAGE - 1)
          .order("created_at", { ascending: false });
        if (error || !data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }

      const mapped = all.map((s: any) => {
        const d = byName(s.data || {}, idNameByForm[s.form_id] || {}, optionLabelsByForm[s.form_id] || {});
        const personsEligible = toNum(d.persons_eligible);
        const personsTreatedRaw = toNum(d.persons_treated);
        const hhVisited = toNum(d.hh_visited);
        const hhTreatedRaw = toNum(d.hh_with_member_treated);
        const personsTreated = personsTreatedRaw == null ? null : Math.max(0, Math.min(personsTreatedRaw, personsEligible ?? personsTreatedRaw));
        const hhTreated = hhTreatedRaw == null ? null : Math.max(0, Math.min(hhTreatedRaw, hhVisited ?? hhTreatedRaw));
        return {
          id: s.id,
          created_at: s.created_at,
          state: d.state || "",
          lga: d.lga || "",
          ward: d.ward || "",
          community: d.community || "",
          mdaTherap: boundedPct(personsTreated, personsEligible),
          mdaGeo: boundedPct(hhTreated, hhVisited),
          implementation: toNum(d.implementation_score),
          risk: d.risk_category || "",
          stockout: norm(d.stockout_observed) === "yes",
          refusals: toNum(d.refusals_reported) ?? 0,
          personsTreated: personsTreated ?? 0,
          personsEligible: personsEligible ?? 0,
          hhTreated: hhTreated ?? 0,
          hhVisited: hhVisited ?? 0,
        };
      });
      setRows(mapped);
    } catch (e) {
      console.error("MDA panel fetch error", e);
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    fetchData();
    const ch = supabase
      .channel("ops-mda-submissions")
      .on("postgres_changes", { event: "*", schema: "public", table: "form_submissions" }, () => {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(fetchData, 1500);
      })
      .subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(ch);
    };
  }, [fetchData]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (filters.state !== "All" && norm(r.state) !== norm(filters.state)) return false;
    if (filters.lga !== "All" && norm(r.lga) !== norm(filters.lga)) return false;
    if (filters.ward !== "All" && norm(r.ward) !== norm(filters.ward)) return false;
    if (filters.community !== "All" && norm(r.community) !== norm(filters.community)) return false;
    return true;
  }), [rows, filters]);

  const stats = useMemo(() => {
    const n = filtered.length;
    const impl = filtered.map((r) => r.implementation).filter((v): v is number => v != null);
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    // WHO-standard coverage is population-weighted (ratio of sums), NOT the
    // unweighted mean of each submission's percentage — otherwise a tiny site
    // and a large site count equally and bias the aggregate.
    const sumPTreated = filtered.reduce((s, r) => s + (r.personsTreated || 0), 0);
    const sumPElig = filtered.reduce((s, r) => s + (r.personsEligible || 0), 0);
    const sumHHTreated = filtered.reduce((s, r) => s + (r.hhTreated || 0), 0);
    const sumHHVisited = filtered.reduce((s, r) => s + (r.hhVisited || 0), 0);
    return {
      total: n,
      avgImpl: avg(impl),
      avgTreatment: boundedPct(sumPTreated, sumPElig) ?? 0,
      avgHousehold: boundedPct(sumHHTreated, sumHHVisited) ?? 0,
      highRisk: filtered.filter((r) => norm(r.risk) === "high").length,
      stockouts: filtered.filter((r) => r.stockout).length,
      refusals: filtered.reduce((s, r) => s + (r.refusals || 0), 0),
    };
  }, [filtered]);

  const implByLga = useMemo(() => {
    const m: Record<string, { sum: number; count: number }> = {};
    filtered.forEach((r) => {
      if (r.implementation == null) return;
      const key = r.lga || "Unspecified";
      if (!m[key]) m[key] = { sum: 0, count: 0 };
      m[key].sum += r.implementation; m[key].count++;
    });
    return Object.entries(m)
      .map(([lga, v]) => ({ lga, score: Math.round(v.sum / v.count) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);
  }, [filtered]);

  const riskDist = useMemo(() => {
    const m: Record<string, number> = { Low: 0, Medium: 0, High: 0 };
    filtered.forEach((r) => {
      const key = r.risk ? r.risk.charAt(0).toUpperCase() + r.risk.slice(1).toLowerCase() : null;
      if (key && key in m) m[key]++;
    });
    return Object.entries(m).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value }));
  }, [filtered]);

  // Triangulation: MDA treatment coverage vs CES therapeutic vs Microplanning reported, by community.
  const triangulation = useMemo(() => {
    const m: Record<string, { community: string; lga: string; mdaNum: number; mdaDen: number }> = {};
    filtered.forEach((r) => {
      if (!r.community || r.mdaTherap == null) return;
      const key = norm(r.community);
      if (!m[key]) m[key] = { community: r.community, lga: r.lga, mdaNum: 0, mdaDen: 0 };
      m[key].mdaNum += r.mdaTherap; m[key].mdaDen++;
    });
    return Object.values(m).map((c) => {
      const mda = c.mdaDen ? c.mdaNum / c.mdaDen : 0;
      const ces = cesByCommunity?.[c.community];
      const cesCov = ces?.cesTherapeutic ?? null;
      const microCov = ces?.microPresent ? ces?.microTherapeutic ?? null : null;
      const refs = [mda, cesCov, microCov].filter((v): v is number => v != null && v > 0);
      // Triangulation requires at least two independent sources. With a single
      // source we cannot declare alignment — it is "insufficient" to compare.
      const comparable = refs.length >= 2;
      const spread = comparable ? Math.max(...refs) - Math.min(...refs) : null;
      const status: "aligned" | "discrepant" | "single" = !comparable
        ? "single"
        : (spread as number) > 15
          ? "discrepant"
          : "aligned";
      return { community: c.community, lga: c.lga, mda, cesCov, microCov, sources: refs.length, spread, status };
    }).sort((a, b) => (b.spread ?? -1) - (a.spread ?? -1)).slice(0, 8);
  }, [filtered, cesByCommunity]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <img src={fgnEmblem} alt="" className="h-10 w-10 object-contain" />
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight leading-none">MDA SUPERVISION INTELLIGENCE</h2>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
            Integrated Supervisory Checklist · {loading ? "syncing…" : `${filtered.length} supervision(s)`}
          </p>
        </div>
      </div>

      {filtered.length === 0 && !loading ? (
        <Card className="border-dashed border-2 border-slate-200 bg-white/60 rounded-3xl">
          <CardContent className="p-10 text-center">
            <ClipboardCheck className="h-10 w-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-500">No MDA supervisory submissions in the selected scope yet.</p>
            <p className="text-xs text-slate-400 mt-1">Completed Integrated MDA Supervisory Checklists appear here in realtime.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-7 gap-4">
            <KPI icon={ClipboardCheck} label="Supervisions" value={stats.total} tone="primary" />
            <KPI icon={TrendingUp} label="Avg Implementation" value={`${stats.avgImpl.toFixed(0)}%`} tone="good" />
            <KPI icon={GitCompareArrows} label="MDA Treatment" value={`${stats.avgTreatment.toFixed(0)}%`} sub="Treated ÷ eligible" tone="primary" />
            <KPI icon={GitCompareArrows} label="MDA Household" value={`${stats.avgHousehold.toFixed(0)}%`} sub="HH treated ÷ HH visited" tone="good" />
            <KPI icon={ShieldAlert} label="High Risk Sites" value={stats.highRisk} tone="danger" />
            <KPI icon={PackageX} label="Stock-outs" value={stats.stockouts} tone="warn" />
            <KPI icon={UserX} label="Refusals" value={stats.refusals} tone="warn" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-none shadow-xl bg-white rounded-3xl">
              <CardHeader>
                <CardTitle className="text-base font-black text-slate-900">Implementation Score by LGA</CardTitle>
                <CardDescription className="text-xs">Mean supervisory implementation score (top LGAs)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={implByLga} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#eef2f7" />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="lga" width={90} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => [`${v}%`, "Score"]} />
                    <Bar dataKey="score" radius={[0, 8, 8, 0]} fill="#00897b" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-none shadow-xl bg-white rounded-3xl">
              <CardHeader>
                <CardTitle className="text-base font-black text-slate-900">Risk Categorisation</CardTitle>
                <CardDescription className="text-xs">Distribution of supervisory risk ratings</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={riskDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                      {riskDist.map((e) => <Cell key={e.name} fill={RISK_COLORS[e.name] || "#94a3b8"} />)}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Triangulation: MDA vs CES vs Microplanning */}
          <Card className="border-none shadow-xl bg-white rounded-3xl">
            <CardHeader>
              <CardTitle className="text-base font-black text-slate-900 flex items-center gap-2">
                <GitCompareArrows className="h-4 w-4 text-primary" /> Coverage Triangulation
              </CardTitle>
              <CardDescription className="text-xs">
                MDA treatment coverage vs Coverage Evaluation (3D) vs Microplanning reported coverage, by community
              </CardDescription>
            </CardHeader>
            <CardContent>
              {triangulation.length === 0 ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-6 justify-center">
                  <Info className="h-4 w-4" /> Verified-coverage communities will appear here once supervisions are recorded.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                        <th className="py-2 pr-4">Community</th>
                        <th className="py-2 pr-4">LGA</th>
                        <th className="py-2 pr-4 text-right">MDA Treatment</th>
                        <th className="py-2 pr-4 text-right">CES 3D</th>
                        <th className="py-2 pr-4 text-right">Microplan</th>
                        <th className="py-2 pr-4 text-right">Spread</th>
                        <th className="py-2 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {triangulation.map((r) => (
                        <tr key={r.community} className="border-b border-slate-50">
                          <td className="py-2 pr-4 font-bold text-slate-900">{r.community}</td>
                          <td className="py-2 pr-4 text-slate-500">{r.lga || "—"}</td>
                          <td className="py-2 pr-4 text-right font-black text-slate-900">{r.mda.toFixed(0)}%</td>
                          <td className="py-2 pr-4 text-right text-slate-700">{r.cesCov != null ? `${r.cesCov.toFixed(0)}%` : "—"}</td>
                          <td className="py-2 pr-4 text-right text-slate-700">{r.microCov != null ? `${r.microCov.toFixed(0)}%` : "—"}</td>
                          <td className={`py-2 pr-4 text-right font-black ${r.status === "discrepant" ? "text-red-600" : "text-slate-700"}`}>{r.spread != null ? `${r.spread.toFixed(0)}%` : "—"}</td>
                          <td className="py-2 text-right">
                            {r.status === "discrepant"
                              ? <Badge className="bg-red-100 text-red-700 border-none text-[10px] font-black">Discrepant</Badge>
                              : r.status === "aligned"
                                ? <Badge className="bg-emerald-100 text-emerald-700 border-none text-[10px] font-black">Aligned</Badge>
                                : <Badge className="bg-amber-100 text-amber-700 border-none text-[10px] font-black">Single source</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
