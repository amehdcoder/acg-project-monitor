import React, { useState, useEffect, useMemo, useCallback } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, Legend, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar
} from "recharts";
import { 
  Activity, Users, MapPin, CheckCircle, AlertTriangle, 
  Filter, Calendar, Download, RefreshCw, BarChart3, TrendingUp, ShieldCheck,
  Boxes, Target, Zap, Clock, ArrowUpRight, ArrowDownRight, Info
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getAllStates, getLGAsForState, getWardsForLGA } from "@/lib/nigeriaAdminData";
import { getHealthFacilitiesByWard, getSettlements } from "@/lib/grid3NigeriaData";
import { toast } from "@/hooks/use-toast";


const COLORS = ["#004d40", "#00897b", "#4db6ac", "#b2dfdb", "#ffc107", "#ff5722"];
const STATUS_PALETTE = {
  locked: "#059669",      // emerald-600
  submitted: "#0284c7",   // sky-600
  draft: "#94a3b8",       // slate-400
  low: "#dc2626",         // red-600
  med: "#eab308",         // yellow-500
  high: "#16a34a",        // green-600
};

export default function PowerBIDashboard() {
  const [loading, setLoading] = useState(true);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [captureSessions, setCaptureSessions] = useState<any[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  
  const [selectedState, setSelectedState] = useState<string>("All");
  const [selectedLga, setSelectedLga] = useState<string>("All");
  const [selectedWard, setSelectedWard] = useState<string>("All");
  const [selectedFlhf, setSelectedFlhf] = useState<string>("All");
  const [selectedCommunity, setSelectedCommunity] = useState<string>("All");


  const fetchData = useCallback(async () => {
    try {
      const [
        { data: surveyData }, 
        { data: visitData },
        { data: sessionData }
      ] = await Promise.all([
        supabase.from("ces_surveys" as any).select("*").order("created_at", { ascending: false }),
        supabase.from("ces_household_visits" as any).select("id, survey_id, created_at, coverage_status").order("created_at", { ascending: true }),
        supabase.from("ces_capture_sessions" as any).select("*").order("created_at", { ascending: false })
      ]);
      
      setSurveys(surveyData || []);
      setVisits(visitData || []);
      setCaptureSessions(sessionData || []);
      setLastSync(new Date().toLocaleTimeString());
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    
    // Real-time Subscriptions for "Command Center" feel
    const channels = [
      supabase.channel('dashboard-surveys').on('postgres_changes', { event: '*', schema: 'public', table: 'ces_surveys' }, () => fetchData()).subscribe(),
      supabase.channel('dashboard-visits').on('postgres_changes', { event: '*', schema: 'public', table: 'ces_household_visits' }, () => fetchData()).subscribe(),
      supabase.channel('dashboard-sessions').on('postgres_changes', { event: '*', schema: 'public', table: 'ces_capture_sessions' }, () => fetchData()).subscribe(),
    ];

    return () => {
      channels.forEach(c => supabase.removeChannel(c));
    };
  }, [fetchData]);

  const filteredSurveys = useMemo(() => {
    return surveys.filter(s => {
      if (selectedState !== "All" && s.state !== selectedState) return false;
      if (selectedLga !== "All" && s.lga !== selectedLga) return false;
      if (selectedWard !== "All" && s.ward !== selectedWard) return false;
      if (selectedFlhf !== "All" && s.flhf_name !== selectedFlhf) return false;
      if (selectedCommunity !== "All" && s.community_name !== selectedCommunity) return false;
      return true;
    });
  }, [surveys, selectedState, selectedLga, selectedWard, selectedFlhf, selectedCommunity]);

  const filteredCaptureSessions = useMemo(() => {
    return captureSessions.filter(s => {
      if (selectedState !== "All" && s.state !== selectedState) return false;
      if (selectedLga !== "All" && s.lga !== selectedLga) return false;
      if (selectedWard !== "All" && s.ward !== selectedWard) return false;
      // Capture sessions don't have FLHF yet in the schema we saw, 
      // but they have area_name (Community)
      if (selectedCommunity !== "All" && s.area_name !== selectedCommunity) return false;
      return true;
    });
  }, [captureSessions, selectedState, selectedLga, selectedWard, selectedCommunity]);

  // Derived options for cascading
  const lgaOptions = useMemo(() => selectedState !== "All" ? getLGAsForState(selectedState) : [], [selectedState]);
  const wardOptions = useMemo(() => (selectedState !== "All" && selectedLga !== "All") ? getWardsForLGA(selectedState, selectedLga) : [], [selectedState, selectedLga]);
  const flhfOptions = useMemo(() => (selectedState !== "All" && selectedLga !== "All" && selectedWard !== "All") ? getHealthFacilitiesByWard(selectedState, selectedLga, selectedWard) : [], [selectedState, selectedLga, selectedWard]);
  const communityOptions = useMemo(() => (selectedState !== "All" && selectedLga !== "All" && selectedWard !== "All") ? getSettlements("") : [], [selectedState, selectedLga, selectedWard]);


  const filteredVisits = useMemo(() => {
    const surveyIds = new Set(filteredSurveys.map(s => s.id));
    return visits.filter(v => surveyIds.has(v.survey_id));
  }, [visits, filteredSurveys]);

  // --- Operational Intelligence Computation ---
  const stats = useMemo(() => {
    const totalSampled = filteredVisits.length;
    const locked = filteredSurveys.filter(s => s.status === "locked");
    const avgCoverage = locked.length > 0 
      ? locked.reduce((acc, s) => acc + (s.inferred_coverage_pct || 0), 0) / locked.length
      : 0;
    
    const mappedHHs = filteredCaptureSessions.reduce((acc, s) => acc + (s.household_count || 0), 0);
    const completedCaptures = filteredCaptureSessions.filter(s => s.household_count > 0).length;
    
    // Identify Hotspots (Low Coverage Communities)
    const hotspots = filteredSurveys
      .filter(s => s.inferred_coverage_pct !== null && s.inferred_coverage_pct < 80)
      .sort((a, b) => a.inferred_coverage_pct - b.inferred_coverage_pct)
      .slice(0, 5);

    return {
      avgCoverage,
      totalSampled,
      mappedHHs,
      completedCaptures,
      activeSurveys: filteredSurveys.length,
      qcRate: filteredSurveys.length > 0 ? (filteredSurveys.filter(s => s.supervisor_qc_approved).length / filteredSurveys.length) * 100 : 0,
      hotspots
    };
  }, [filteredSurveys, filteredVisits, filteredCaptureSessions]);


  // --- Visual Mapping Data ---
  const coverageTrends = useMemo(() => {
    const map: Record<string, { total: number; sum: number; count: number }> = {};
    filteredVisits.forEach(v => {
      const date = new Date(v.created_at).toLocaleDateString();
      if (!map[date]) map[date] = { total: 0, sum: 0, count: 0 };
      map[date].total++;
      if (v.coverage_status === "treated") map[date].sum++;
    });
    return Object.entries(map).map(([date, d]) => ({
      date,
      visits: d.total,
      coverage: Math.round((d.sum / d.total) * 100)
    })).slice(-10);
  }, [filteredVisits]);

  const captureVsSurvey = useMemo(() => {
    // If a state is selected, show LGAs. If LGA selected, show Wards.
    let groupByKey = "state";
    let dataPool = filteredCaptureSessions;
    let surveyPool = filteredSurveys;

    if (selectedState !== "All") groupByKey = "lga";
    if (selectedLga !== "All") groupByKey = "ward";
    if (selectedWard !== "All") groupByKey = "area_name";

    const groups = Array.from(new Set([
      ...dataPool.map(s => s[groupByKey]),
      ...surveyPool.map(s => s[groupByKey === "area_name" ? "community_name" : groupByKey])
    ].filter(Boolean)));

    return groups.map(name => ({
      name,
      mapped: dataPool.filter(s => s[groupByKey] === name).reduce((acc, s) => acc + (s.household_count || 0), 0),
      surveyed: surveyPool.filter(s => s[groupByKey === "area_name" ? "community_name" : groupByKey] === name).reduce((acc, s) => acc + (s.total_sampled || 0), 0)
    })).sort((a, b) => b.mapped - a.mapped).slice(0, 10);
  }, [filteredCaptureSessions, filteredSurveys, selectedState, selectedLga, selectedWard]);


  if (loading) {
    return (
      <div className="flex flex-col h-[80vh] items-center justify-center space-y-4">
        <RefreshCw className="h-10 w-10 animate-spin text-primary opacity-50" />
        <p className="text-sm font-medium text-slate-400 animate-pulse">Synchronizing Command Center...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F1F5F9] p-4 md:p-8 space-y-8">
      {/* Dynamic Command Header */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="h-20 w-20 rounded-3xl bg-slate-900 flex items-center justify-center shadow-2xl shadow-slate-300 ring-4 ring-white">
            <Zap className="h-10 w-10 text-yellow-400 fill-yellow-400" />
          </div>
          <div>
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight leading-none">OPERATIONS COMMAND</h1>
            <div className="flex items-center gap-3 mt-2">
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1 text-xs font-bold animate-pulse">
                SYSTEM LIVE: {lastSync}
              </Badge>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest bg-white px-2 py-1 rounded-md shadow-sm border border-slate-100">
                Truth Window Analytics
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 p-2 bg-white/60 backdrop-blur-xl border border-white rounded-2xl shadow-xl">
          {/* Cascading Filter Bar */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
            <Filter className="h-4 w-4 text-primary" />
            
            {/* State */}
            <Select value={selectedState} onValueChange={(val) => { 
              setSelectedState(val); setSelectedLga("All"); setSelectedWard("All"); setSelectedFlhf("All"); setSelectedCommunity("All"); 
            }}>
              <SelectTrigger className="h-10 border-none bg-slate-100/50 hover:bg-slate-100 text-xs font-black min-w-[130px] rounded-xl transition-all">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-100 shadow-2xl">
                <SelectItem value="All">All Regions</SelectItem>
                {getAllStates().map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="h-5 w-[1px] bg-slate-200 mx-1" />

            {/* LGA */}
            <Select value={selectedLga} onValueChange={(val) => { 
              setSelectedLga(val); setSelectedWard("All"); setSelectedFlhf("All"); setSelectedCommunity("All"); 
            }} disabled={selectedState === "All"}>
              <SelectTrigger className="h-10 border-none bg-slate-100/50 hover:bg-slate-100 text-xs font-black min-w-[130px] rounded-xl transition-all">
                <SelectValue placeholder="LGA" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-100 shadow-2xl">
                <SelectItem value="All">All LGAs</SelectItem>
                {lgaOptions.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="h-5 w-[1px] bg-slate-200 mx-1" />

            {/* Ward */}
            <Select value={selectedWard} onValueChange={(val) => { 
              setSelectedWard(val); setSelectedFlhf("All"); setSelectedCommunity("All"); 
            }} disabled={selectedLga === "All"}>
              <SelectTrigger className="h-10 border-none bg-slate-100/50 hover:bg-slate-100 text-xs font-black min-w-[130px] rounded-xl transition-all">
                <SelectValue placeholder="Ward" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-100 shadow-2xl">
                <SelectItem value="All">All Wards</SelectItem>
                {wardOptions.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="h-5 w-[1px] bg-slate-200 mx-1" />

            {/* FLHF */}
            <Select value={selectedFlhf} onValueChange={(val) => { 
              setSelectedFlhf(val); setSelectedCommunity("All"); 
            }} disabled={selectedWard === "All"}>
              <SelectTrigger className="h-10 border-none bg-slate-100/50 hover:bg-slate-100 text-xs font-black min-w-[150px] rounded-xl transition-all">
                <SelectValue placeholder="Facility" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-100 shadow-2xl">
                <SelectItem value="All">All Facilities</SelectItem>
                {flhfOptions.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="h-5 w-[1px] bg-slate-200 mx-1" />

            {/* Community/Settlement */}
            <Select value={selectedCommunity} onValueChange={setSelectedCommunity} disabled={selectedFlhf === "All"}>
              <SelectTrigger className="h-10 border-none bg-slate-100/50 hover:bg-slate-100 text-xs font-black min-w-[150px] rounded-xl transition-all">
                <SelectValue placeholder="Community" />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-100 shadow-2xl">
                <SelectItem value="All">All Communities</SelectItem>
                {Array.from(new Set(filteredSurveys.map(s => s.community_name).filter(Boolean))).map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2 pr-2">
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl hover:bg-slate-100" onClick={fetchData}>
              <RefreshCw className="h-5 w-5 text-slate-600" />
            </Button>
            <Button variant="acg" size="sm" className="h-10 px-6 font-black text-xs rounded-xl shadow-lg shadow-primary/20">
              <Download className="h-4 w-4 mr-2" /> EXPORT REPORT
            </Button>
          </div>
        </div>
      </div>

      {/* COMMAND EXECUTIVE INSIGHTS (Truth Window) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-gradient-to-br from-primary/10 via-white to-white p-6 rounded-3xl border border-primary/10 shadow-xl flex items-center gap-6">
          <div className="h-16 w-16 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0">
            <TrendingUp className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900 tracking-tight">EXECUTIVE TRUTH INSIGHT</h3>
            <p className="text-sm text-slate-600 mt-1 leading-relaxed font-medium">
              Based on real-time field telemetry, {stats.avgCoverage >= 80 ? 'coverage is currently meeting global benchmarks' : 'critical coverage gaps have been identified'}. 
              The current focus should be on <span className="font-bold text-primary">{stats.hotspots.length > 0 ? `${stats.hotspots[0].community_name}` : 'maintaining momentum'}</span> to ensure 
              uniform protection across all mapped segments.
            </p>
          </div>
        </div>
        <div className="bg-slate-900 p-6 rounded-3xl shadow-xl border border-slate-800 flex items-center gap-6">
          <div className="h-16 w-16 rounded-2xl bg-yellow-500/20 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-8 w-8 text-yellow-400" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white tracking-tight">OPERATIONAL HEALTH</h3>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-yellow-400">{Math.round(stats.qcRate)}%</span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">VALIDATED</span>
            </div>
          </div>
        </div>
      </div>

      {/* Real-time KPI Ribbon */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard 
          title="Inferred Coverage" 
          value={`${stats.avgCoverage.toFixed(1)}%`} 
          sub="Global Precision Benchmarking" 
          icon={Target} 
          trend={stats.avgCoverage >= 80 ? "ON TRACK" : "MOP-UP NEEDED"}
          trendColor={stats.avgCoverage >= 80 ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"}
        />
        <KPICard 
          title="3D Geospatial HHs" 
          value={stats.mappedHHs.toLocaleString()} 
          sub={`${stats.completedCaptures} Micro-mapped Areas`} 
          icon={Boxes} 
        />
        <KPICard 
          title="Field Intensity" 
          value={stats.totalSampled.toLocaleString()} 
          sub="Active Household Visits Today" 
          icon={Users} 
          indicator={<div className="h-3 w-3 rounded-full bg-emerald-500 animate-ping" />}
        />
        <KPICard 
          title="Truth Variance" 
          value={`${(100 - stats.qcRate).toFixed(1)}%`} 
          sub="Discrepancy Correction Rate" 
          icon={Activity} 
          colorScheme="slate"
        />
      </div>

      {/* Operational Intelligence Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Real-time Activity Stream */}
        <Card className="lg:col-span-8 border-none shadow-2xl shadow-slate-200/50 overflow-hidden rounded-[2rem] bg-white">
          <CardHeader className="p-8 border-b border-slate-50 bg-slate-50/30">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-black flex items-center gap-3 text-slate-900">
                  <Activity className="h-6 w-6 text-primary" /> REAL-TIME FIELD INTENSITY
                </CardTitle>
                <CardDescription className="text-sm font-semibold text-slate-500 mt-1">
                  Correlation matrix: 3D Mapping precision vs. Physical Survey output
                </CardDescription>
              </div>
              <Badge variant="secondary" className="bg-primary/10 text-primary border-none px-3 py-1 font-black text-xs">LIVE TELEMETRY</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-8">
            <div className="h-[450px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={coverageTrends}>
                  <defs>
                    <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 700 }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)', padding: '16px' }}
                    itemStyle={{ fontSize: '14px', fontWeight: 'bold' }}
                    cursor={{ stroke: '#0ea5e9', strokeWidth: 3 }}
                  />
                  <Area type="monotone" dataKey="visits" stroke="#0ea5e9" strokeWidth={4} fillOpacity={1} fill="url(#colorVisits)" name="Visits" />
                  <Area type="monotone" dataKey="coverage" stroke="#16a34a" strokeWidth={4} fill="transparent" name="Coverage %" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-6 flex items-start gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <Info className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm font-bold text-slate-600">
                <span className="text-slate-900">Truth Analysis:</span> A rising gap between 'Visits' and 'Coverage %' indicates areas where households are being visited but treatments are not occurring. Verify supply chain at the FLHF level.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Actionable Alerts (Field Activity Improvement) */}
        <Card className="lg:col-span-4 border-none shadow-2xl shadow-slate-900/10 rounded-[2rem] bg-slate-900 text-white overflow-hidden flex flex-col">
          <CardHeader className="p-8 border-b border-white/10">
            <CardTitle className="text-xl font-black flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-yellow-400" /> CRITICAL GAP ALERTS
            </CardTitle>
            <CardDescription className="text-slate-400 text-sm font-bold mt-1">
              Immediate Truth: Action required in these zones
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6 flex-1">
            {stats.hotspots.length > 0 ? (
              stats.hotspots.map((h, i) => (
                <div key={h.id} className="group relative bg-white/10 rounded-2xl p-4 border border-white/5 hover:bg-white/20 transition-all cursor-pointer">
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-black tracking-tight">{h.community_name || "Unknown"}</span>
                      <span className="text-[11px] text-slate-400 uppercase tracking-widest mt-0.5">{h.lga} • {h.ward}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      <Badge className="bg-rose-500 text-white border-none font-black text-xs px-3 py-1">
                        {h.inferred_coverage_pct !== null ? Math.round(h.inferred_coverage_pct) : 0}%
                      </Badge>
                    </div>
                  </div>
                  <div className="w-full bg-white/10 h-2.5 rounded-full overflow-hidden shadow-inner">
                    <div 
                      className="h-full bg-gradient-to-r from-rose-600 to-rose-400 transition-all duration-700" 
                      style={{ width: `${h.inferred_coverage_pct || 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center mt-3">
                    <span className="text-[10px] text-rose-300 font-black flex items-center gap-1.5 uppercase tracking-wider">
                      <Zap className="h-3 w-3 fill-rose-300" /> MOP-UP PRIORITY HIGH
                    </span>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-white/40 hover:text-white hover:bg-white/10 rounded-full">
                      <ArrowUpRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-4 py-20">
                <div className="h-20 w-20 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle className="h-10 w-10 text-emerald-400" />
                </div>
                <p className="text-lg font-black text-emerald-400 tracking-tight">ALL SEGMENTS CLEAR</p>
                <p className="text-sm text-slate-500 font-bold px-8">No communities are currently reporting sub-optimal coverage.</p>
              </div>
            )}
          </CardContent>
          <div className="p-6 bg-white/5 border-t border-white/5">
            <Button variant="outline" className="w-full border-white/10 bg-white/10 hover:bg-white/20 text-xs uppercase font-black tracking-widest py-6 rounded-2xl transition-all">
              VIEW COMPREHENSIVE TRUTH MAP
            </Button>
          </div>
        </Card>

        {/* 3D Mapping Progress (Correct Mapping) */}
        <Card className="lg:col-span-12 border-none shadow-2xl shadow-slate-200/50 rounded-[2rem] bg-white overflow-hidden">
          <CardHeader className="p-8 border-b border-slate-50 bg-slate-50/30">
            <CardTitle className="text-xl font-black flex items-center gap-3 text-slate-900">
              <Boxes className="h-6 w-6 text-primary" /> GEOSPATIAL DATA TRUTH STATUS
            </CardTitle>
            <CardDescription className="text-sm font-bold text-slate-500 mt-1">
              Drill-down: Mapping session efficacy vs. Physical verification targets
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8">
            <div className="h-[450px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={captureVsSurvey} layout="vertical" margin={{ left: 40, right: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: '#1e293b', fontWeight: 900 }} width={140} />
                  <Tooltip 
                    cursor={{ fill: '#f8fafc' }}
                    contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em' }} />
                  <Bar dataKey="mapped" name="HHs Mapped (3D)" fill="#0ea5e9" radius={[0, 8, 8, 0]} barSize={32} />
                  <Bar dataKey="surveyed" name="HHs Surveyed (CES)" fill="#6366f1" radius={[0, 8, 8, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-8 flex items-center justify-center gap-8">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-[#0ea5e9]" />
                <span className="text-xs font-black text-slate-600 uppercase tracking-widest">Digital Truth</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-[#6366f1]" />
                <span className="text-xs font-black text-slate-600 uppercase tracking-widest">Ground Truth</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPICard({ title, value, sub, icon: Icon, trend, trendColor, indicator, colorScheme = "primary" }: any) {
  return (
    <Card className="relative border-none shadow-2xl shadow-slate-200/50 bg-white overflow-hidden rounded-[2rem] group hover:-translate-y-2 transition-all duration-500">
      <CardContent className="p-8">
        <div className="flex justify-between items-start">
          <div className={`h-14 w-14 rounded-2xl ${colorScheme === 'primary' ? 'bg-primary/10' : 'bg-slate-100'} flex items-center justify-center group-hover:scale-110 transition-transform duration-500`}>
            <Icon className={`h-7 w-7 ${colorScheme === 'primary' ? 'text-primary' : 'text-slate-600'}`} />
          </div>
          {trend && (
            <Badge className={`${trendColor} border-none font-black text-[11px] px-4 py-1.5 rounded-full shadow-lg`}>
              {trend}
            </Badge>
          )}
          {indicator}
        </div>
        <div className="mt-8">
          <p className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{title}</p>
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter">{value}</h2>
          <div className="flex items-center gap-2 mt-3">
            <div className={`h-1.5 w-1.5 rounded-full ${colorScheme === 'primary' ? 'bg-primary/40' : 'bg-slate-400'}`} />
            <p className="text-xs text-slate-500 font-bold leading-none">{sub}</p>
          </div>
        </div>
        <div className="absolute -bottom-6 -right-6 p-4 opacity-[0.03] pointer-events-none group-hover:opacity-[0.08] transition-all duration-700 group-hover:rotate-12 group-hover:scale-150">
          <Icon className="h-32 w-32" />
        </div>
      </CardContent>
    </Card>
  );
}
