import React, { useState, useEffect, useMemo } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  LineChart, Line, PieChart, Pie, Cell, AreaChart, Area, Legend
} from "recharts";
import { 
  Activity, Users, MapPin, CheckCircle, AlertTriangle, 
  Filter, Calendar, Download, RefreshCw, BarChart3, TrendingUp, ShieldCheck
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { getAllStates, getLGAsForState } from "@/lib/nigeriaAdminData";

const COLORS = ["#004d40", "#00897b", "#4db6ac", "#b2dfdb", "#ffc107", "#ff5722"];

export default function PowerBIDashboard() {
  const [loading, setLoading] = useState(true);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [visits, setVisits] = useState<any[]>([]);
  const [selectedState, setSelectedState] = useState<string>("All");
  const [selectedLga, setSelectedLga] = useState<string>("All");
  const [dateRange, setDateRange] = useState<string>("30d");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [{ data: surveyData }, { data: visitData }] = await Promise.all([
        supabase.from("ces_surveys" as any).select("*").order("created_at", { ascending: false }),
        supabase.from("ces_household_visits" as any).select("id, survey_id, created_at, coverage_status").order("created_at", { ascending: true })
      ]);
      setSurveys(surveyData || []);
      setVisits(visitData || []);
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredSurveys = useMemo(() => {
    return surveys.filter(s => {
      const stateMatch = selectedState === "All" || s.state_name === selectedState;
      const lgaMatch = selectedLga === "All" || s.lga_name === selectedLga;
      return stateMatch && lgaMatch;
    });
  }, [surveys, selectedState, selectedLga]);

  // --- Metrics Computation ---
  const metrics = useMemo(() => {
    const totalSampled = filteredSurveys.reduce((acc, s) => acc + (s.total_sampled || 0), 0);
    const lockedSurveys = filteredSurveys.filter(s => s.status === "locked");
    const avgCoverage = lockedSurveys.length > 0 
      ? lockedSurveys.reduce((acc, s) => acc + (s.inferred_coverage_pct || 0), 0) / lockedSurveys.length
      : 0;
    const qcApprovedCount = filteredSurveys.filter(s => s.supervisor_qc_approved).length;
    const qcRate = filteredSurveys.length > 0 ? (qcApprovedCount / filteredSurveys.length) * 100 : 0;
    
    return {
      avgCoverage,
      totalSampled,
      qcRate,
      activeSurveys: filteredSurveys.length,
      completionRate: filteredSurveys.length > 0 ? (lockedSurveys.length / filteredSurveys.length) * 100 : 0
    };
  }, [filteredSurveys]);

  // --- Chart Data ---
  const coverageByState = useMemo(() => {
    const map: Record<string, { sum: number; count: number }> = {};
    filteredSurveys.forEach(s => {
      if (!s.state_name || s.status !== "locked") return;
      if (!map[s.state_name]) map[s.state_name] = { sum: 0, count: 0 };
      map[s.state_name].sum += (s.inferred_coverage_pct || 0);
      map[s.state_name].count++;
    });
    return Object.entries(map).map(([name, d]) => ({
      name,
      coverage: Math.round(d.sum / d.count)
    })).sort((a, b) => b.coverage - a.coverage);
  }, [filteredSurveys]);

  const statusDistribution = useMemo(() => {
    const counts = { draft: 0, submitted: 0, locked: 0 };
    filteredSurveys.forEach(s => {
      if (s.status === "draft") counts.draft++;
      else if (s.status === "locked") counts.locked++;
      else counts.submitted++;
    });
    return [
      { name: "Locked", value: counts.locked, color: "#004d40" },
      { name: "In Review", value: counts.submitted, color: "#00897b" },
      { name: "Draft", value: counts.draft, color: "#b2dfdb" }
    ];
  }, [filteredSurveys]);

  const timeSeriesData = useMemo(() => {
    const map: Record<string, number> = {};
    visits.forEach(v => {
      const date = new Date(v.created_at).toLocaleDateString();
      map[date] = (map[date] || 0) + 1;
    });
    return Object.entries(map).map(([date, count]) => ({ date, count })).slice(-15);
  }, [visits]);

  if (loading) {
    return <div className="flex h-96 items-center justify-center"><RefreshCw className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="min-h-screen bg-[#F3F4F6] p-4 md:p-6 space-y-6">
      {/* Power BI Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-lg">
            <BarChart3 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">CES Operational Dashboard</h1>
            <p className="text-xs text-slate-500 font-medium">Real-time Coverage Evaluation Survey Metrics</p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <Select value={selectedState} onValueChange={setSelectedState}>
              <SelectTrigger className="h-8 border-0 bg-transparent text-xs min-w-[120px] focus:ring-0">
                <SelectValue placeholder="State" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All States</SelectItem>
                {getAllStates().map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          
          <Button variant="outline" size="sm" className="h-8 gap-2 text-xs" onClick={fetchData}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button variant="acg" size="sm" className="h-8 gap-2 text-xs">
            <Download className="h-3.5 w-3.5" /> Export Report
          </Button>
        </div>
      </header>

      {/* KPI Ribbon */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard title="Avg Coverage" value={`${metrics.avgCoverage.toFixed(1)}%`} sub="National Goal: 80%" icon={TrendingUp} trend="+2.4%" />
        <KPICard title="Total Sampled" value={metrics.totalSampled.toLocaleString()} sub="Households Visited" icon={Users} />
        <KPICard title="QC Approval" value={`${metrics.qcRate.toFixed(1)}%`} sub="Supervisor Verified" icon={ShieldCheck} />
        <KPICard title="Completion" value={`${metrics.completionRate.toFixed(1)}%`} sub="Locked / Total" icon={CheckCircle} />
        <KPICard title="Active Surveys" value={metrics.activeSurveys.toString()} sub="In Field" icon={Activity} />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coverage by State (Large Bar Chart) */}
        <Card className="lg:col-span-8 border-none shadow-sm overflow-hidden">
          <CardHeader className="bg-white border-b border-slate-100 py-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" /> Geographic Coverage Performance (Locked Surveys)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 bg-white h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={coverageByState} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#64748B' }} domain={[0, 100]} />
                <Tooltip cursor={{ fill: '#F8FAFC' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="coverage" fill="#004d40" radius={[4, 4, 0, 0]} barSize={40}>
                  {coverageByState.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.coverage >= 80 ? "#004d40" : entry.coverage >= 60 ? "#00897b" : "#ffc107"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Survey Status Distribution (Pie) */}
        <Card className="lg:col-span-4 border-none shadow-sm">
          <CardHeader className="bg-white border-b border-slate-100 py-3">
            <CardTitle className="text-sm font-bold">Workflow Lifecycle Status</CardTitle>
          </CardHeader>
          <CardContent className="p-6 bg-white h-[400px] flex flex-col">
            <div className="flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusDistribution}
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {statusDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-2">
              {statusDistribution.map(s => (
                <div key={s.name} className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2"><div className="h-2 w-2 rounded-full" style={{ background: s.color }}/> {s.name}</span>
                  <span className="font-bold">{s.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Temporal Trends (Area Chart) */}
        <Card className="lg:col-span-12 border-none shadow-sm">
          <CardHeader className="bg-white border-b border-slate-100 py-3">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" /> Daily Field Capture Intensity (Last 15 Days)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 bg-white h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timeSeriesData}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#004d40" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#004d40" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B' }} />
                <Tooltip />
                <Area type="monotone" dataKey="count" stroke="#004d40" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KPICard({ title, value, sub, icon: Icon, trend }: any) {
  return (
    <Card className="border-none shadow-sm bg-white overflow-hidden group hover:shadow-md transition-all">
      <CardContent className="p-4">
        <div className="flex justify-between items-start">
          <div className="bg-slate-50 p-2 rounded-lg group-hover:bg-primary/5 transition-colors">
            <Icon className="h-4 w-4 text-slate-400 group-hover:text-primary" />
          </div>
          {trend && <Badge variant="secondary" className="bg-green-50 text-green-600 border-none text-[10px]">{trend}</Badge>}
        </div>
        <div className="mt-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{title}</p>
          <h2 className="text-2xl font-black text-slate-900 mt-1">{value}</h2>
          <p className="text-[10px] text-slate-500 font-medium mt-1">{sub}</p>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary/10 group-hover:bg-primary transition-all" />
      </CardContent>
    </Card>
  );
}
