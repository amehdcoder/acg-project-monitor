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
    <div className="min-h-screen bg-[#F8FAFC] p-4 md:p-6 space-y-6">
      {/* Dynamic Command Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-slate-900 flex items-center justify-center shadow-xl shadow-slate-200">
            <Zap className="h-7 w-7 text-yellow-400 fill-yellow-400" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">OPERATIONS COMMAND</h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className="bg-emerald-50 text-emerald-600 border-emerald-100 animate-pulse">
                LIVE: {lastSync}
              </Badge>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Real-time CES Intelligence
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Cascading Filter Bar */}
          <div className="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            
            {/* State */}
            <Select value={selectedState} onValueChange={(val) => { 
              setSelectedState(val); setSelectedLga("All"); setSelectedWard("All"); setSelectedFlhf("All"); setSelectedCommunity("All"); 
            }}>
              <SelectTrigger className="h-8 border-0 bg-transparent text-[10px] font-bold min-w-[100px] focus:ring-0">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Regions</SelectItem>
                {getAllStates().map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="h-4 w-[1px] bg-slate-200 mx-1" />

            {/* LGA */}
            <Select value={selectedLga} onValueChange={(val) => { 
              setSelectedLga(val); setSelectedWard("All"); setSelectedFlhf("All"); setSelectedCommunity("All"); 
            }} disabled={selectedState === "All"}>
              <SelectTrigger className="h-8 border-0 bg-transparent text-[10px] font-bold min-w-[100px] focus:ring-0">
                <SelectValue placeholder="LGA" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All LGAs</SelectItem>
                {lgaOptions.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="h-4 w-[1px] bg-slate-200 mx-1" />

            {/* Ward */}
            <Select value={selectedWard} onValueChange={(val) => { 
              setSelectedWard(val); setSelectedFlhf("All"); setSelectedCommunity("All"); 
            }} disabled={selectedLga === "All"}>
              <SelectTrigger className="h-8 border-0 bg-transparent text-[10px] font-bold min-w-[100px] focus:ring-0">
                <SelectValue placeholder="Ward" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Wards</SelectItem>
                {wardOptions.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="h-4 w-[1px] bg-slate-200 mx-1" />

            {/* FLHF */}
            <Select value={selectedFlhf} onValueChange={(val) => { 
              setSelectedFlhf(val); setSelectedCommunity("All"); 
            }} disabled={selectedWard === "All"}>
              <SelectTrigger className="h-8 border-0 bg-transparent text-[10px] font-bold min-w-[120px] focus:ring-0">
                <SelectValue placeholder="Facility" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Facilities</SelectItem>
                {flhfOptions.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>

            <div className="h-4 w-[1px] bg-slate-200 mx-1" />

            {/* Community/Settlement */}
            <Select value={selectedCommunity} onValueChange={setSelectedCommunity} disabled={selectedFlhf === "All"}>
              <SelectTrigger className="h-8 border-0 bg-transparent text-[10px] font-bold min-w-[120px] focus:ring-0">
                <SelectValue placeholder="Community" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Communities</SelectItem>
                {/* For communities, we might need to filter settlements by the selected ward if available */}
                {Array.from(new Set(filteredSurveys.map(s => s.community_name).filter(Boolean))).map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Button variant="ghost" size="icon" className="h-9 w-9" onClick={fetchData}>
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="acg" size="sm" className="h-9 px-4 font-bold text-xs">
            <Download className="h-3.5 w-3.5 mr-2" /> EXPORT REPORT
          </Button>
        </div>

      </div>

      {/* Real-time KPI Ribbon */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard 
          title="Inferred Coverage" 
          value={`${stats.avgCoverage.toFixed(1)}%`} 
          sub="Weighted Design-Based Mean" 
          icon={Target} 
          trend={stats.avgCoverage >= 80 ? "ON TRACK" : "BELOW GOAL"}
          trendColor={stats.avgCoverage >= 80 ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"}
        />
        <KPICard 
          title="3D Mapped HHs" 
          value={stats.mappedHHs.toLocaleString()} 
          sub={`${stats.completedCaptures} Communities Captured`} 
          icon={Boxes} 
        />
        <KPICard 
          title="Field Productivity" 
          value={stats.totalSampled.toLocaleString()} 
          sub="Total Households Surveyed" 
          icon={Users} 
          indicator={<div className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />}
        />
        <KPICard 
          title="QC Integrity" 
          value={`${stats.qcRate.toFixed(1)}%`} 
          sub="Supervisor Peer Validation" 
          icon={ShieldCheck} 
        />
      </div>

      {/* Operational Intelligence Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Real-time Activity Stream */}
        <Card className="lg:col-span-8 border-none shadow-xl shadow-slate-100 overflow-hidden rounded-2xl bg-white">
          <CardHeader className="border-b border-slate-50 bg-slate-50/30">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base font-black flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" /> REAL-TIME FIELD INTENSITY
                </CardTitle>
                <CardDescription className="text-xs">
                  Correlating households mapped vs. households surveyed
                </CardDescription>
              </div>
              <Badge variant="secondary" className="bg-primary/5 text-primary border-none">LIVE FEED</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-6 h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={coverageTrends}>
                <defs>
                  <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                <Tooltip 
                  contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  cursor={{ stroke: '#0ea5e9', strokeWidth: 2 }}
                />
                <Area type="monotone" dataKey="visits" stroke="#0ea5e9" strokeWidth={3} fillOpacity={1} fill="url(#colorVisits)" name="Visits" />
                <Area type="monotone" dataKey="coverage" stroke="#16a34a" strokeWidth={3} fill="transparent" name="Coverage %" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Actionable Alerts (Field Activity Improvement) */}
        <Card className="lg:col-span-4 border-none shadow-xl shadow-slate-100 rounded-2xl bg-slate-900 text-white">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-base font-black flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-400" /> CRITICAL GAP ALERTS
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Communities with lowest inferred coverage needing mop-up
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {stats.hotspots.length > 0 ? (
              stats.hotspots.map((h, i) => (
                <div key={h.id} className="group relative bg-white/5 rounded-xl p-3 border border-white/5 hover:bg-white/10 transition-all">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex flex-col">
                      <span className="text-xs font-black truncate max-w-[150px]">{h.community_name || "Unknown"}</span>
                      <span className="text-[10px] text-slate-400 uppercase tracking-tighter">{h.lga} • {h.ward}</span>
                    </div>
                    <Badge className="bg-rose-500/20 text-rose-400 border-none font-black text-[10px]">
                      {h.inferred_coverage_pct !== null ? Math.round(h.inferred_coverage_pct) : 0}%
                    </Badge>
                  </div>
                  <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-rose-500 transition-all duration-500" 
                      style={{ width: `${h.inferred_coverage_pct || 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-[9px] text-slate-500 font-bold flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" /> MOP-UP RECOMMENDED
                    </span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-slate-400 hover:text-white">
                      <ArrowUpRight className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-center space-y-2">
                <CheckCircle className="h-10 w-10 text-emerald-400 opacity-30" />
                <p className="text-sm font-medium text-slate-500">No critical gaps detected.</p>
              </div>
            )}
            <Button variant="outline" className="w-full border-white/10 bg-white/5 hover:bg-white/10 text-[10px] uppercase font-black tracking-widest py-5 rounded-xl">
              VIEW FULL GAP INTELLIGENCE
            </Button>
          </CardContent>
        </Card>

        {/* 3D Mapping Progress (Correct Mapping) */}
        <Card className="lg:col-span-12 border-none shadow-xl shadow-slate-100 rounded-2xl bg-white overflow-hidden">
          <CardHeader className="border-b border-slate-50 bg-slate-50/30">
            <CardTitle className="text-base font-black flex items-center gap-2">
              <Boxes className="h-4 w-4 text-primary" /> GEOSPATIAL DATA MAPPING STATUS
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={captureVsSurvey} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748B', fontWeight: 700 }} width={100} />
                <Tooltip cursor={{ fill: '#f8fafc' }} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }} />
                <Bar dataKey="mapped" name="HHs Mapped (3D)" fill="#0ea5e9" radius={[0, 4, 4, 0]} barSize={20} />
                <Bar dataKey="surveyed" name="HHs Surveyed (CES)" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPICard({ title, value, sub, icon: Icon, trend, trendColor, indicator }: any) {
  return (
    <Card className="relative border-none shadow-xl shadow-slate-100 bg-white overflow-hidden rounded-2xl group hover:-translate-y-1 transition-all duration-300">
      <CardContent className="p-5">
        <div className="flex justify-between items-start">
          <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
            <Icon className="h-5 w-5 text-slate-400 group-hover:text-primary" />
          </div>
          {trend && (
            <Badge className={`${trendColor} border-none font-black text-[9px] px-2 py-0.5`}>
              {trend}
            </Badge>
          )}
          {indicator}
        </div>
        <div className="mt-4">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">{title}</p>
          <h2 className="text-3xl font-black text-slate-900 mt-1 tracking-tighter">{value}</h2>
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className="h-1 w-1 rounded-full bg-primary/30" />
            <p className="text-[10px] text-slate-500 font-bold">{sub}</p>
          </div>
        </div>
        <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
          <Icon className="h-20 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}
