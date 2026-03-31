import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Box, RotateCcw, Eye, Layers, BarChart3, TrendingUp, Sparkles } from "lucide-react";

interface ARDataVisualizationProps {
  realtimeKey?: number;
}

const ARDataVisualization = ({ realtimeKey = 0 }: ARDataVisualizationProps) => {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [forms, setForms] = useState<any[]>([]);
  const [selectedForm, setSelectedForm] = useState("");
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [rotateX, setRotateX] = useState(25);
  const [rotateY, setRotateY] = useState(-35);
  const [viewMode, setViewMode] = useState<"bars" | "scatter" | "heatmap">("bars");

  useEffect(() => {
    supabase.from("projects").select("id, name").order("name").then(({ data }) => setProjects(data || []));
  }, []);

  useEffect(() => {
    if (!selectedProject) { setForms([]); return; }
    supabase.from("forms").select("id, name, questions").eq("project_id", selectedProject).order("name")
      .then(({ data }) => setForms(data || []));
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedForm) { setSubmissions([]); return; }
    setLoading(true);
    supabase.from("form_submissions").select("id, data, created_at, user_id, status")
      .eq("form_id", selectedForm).order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => { setSubmissions(data || []); setLoading(false); });
  }, [selectedForm, realtimeKey]);

  const fieldStats = useMemo(() => {
    if (submissions.length === 0) return [];
    const form = forms.find(f => f.id === selectedForm);
    const questions = (form?.questions || []) as any[];
    return questions.slice(0, 12).map((q: any, i: number) => {
      const filled = submissions.filter(s => {
        const val = (s.data as any)?.[q.id];
        return val !== undefined && val !== null && val !== "";
      }).length;
      const completeness = submissions.length > 0 ? (filled / submissions.length) * 100 : 0;
      const uniqueValues = new Set(submissions.map(s => String((s.data as any)?.[q.id] || "").trim()).filter(Boolean)).size;
      return { id: q.id, label: q.label || q.name || `Q${i + 1}`, completeness, totalResponses: filled, uniqueValues, type: q.type };
    });
  }, [submissions, forms, selectedForm]);

  const maxResponses = Math.max(...fieldStats.map(f => f.totalResponses), 1);
  const avgCompleteness = fieldStats.length > 0 ? fieldStats.reduce((a, f) => a + f.completeness, 0) / fieldStats.length : 0;

  const getBarColor = (completeness: number) => {
    if (completeness >= 90) return "hsl(142, 71%, 45%)";
    if (completeness >= 70) return "hsl(217, 91%, 60%)";
    if (completeness >= 50) return "hsl(45, 93%, 47%)";
    return "hsl(0, 84%, 60%)";
  };

  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-primary/5 via-transparent to-accent/5 pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Box className="h-5 w-5 text-primary" />
              </div>
              AR 3D Form Data Visualization
            </CardTitle>
            <CardDescription className="mt-1">Interactive 3D rendering of form submission data</CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedProject} onValueChange={v => { setSelectedProject(v === "__all__" ? "" : v); setSelectedForm(""); }}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Select Project" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Projects</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {forms.length > 0 && (
              <Select value={selectedForm} onValueChange={setSelectedForm}>
                <SelectTrigger className="w-40"><SelectValue placeholder="Select Form" /></SelectTrigger>
                <SelectContent>
                  {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {/* Summary KPIs */}
        {fieldStats.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-lg p-3 text-center">
              <TrendingUp className="h-4 w-4 text-emerald-600 mx-auto mb-1" />
              <p className="text-lg font-bold text-foreground">{avgCompleteness.toFixed(0)}%</p>
              <p className="text-[10px] text-muted-foreground">Avg Completeness</p>
            </div>
            <div className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20 rounded-lg p-3 text-center">
              <BarChart3 className="h-4 w-4 text-blue-600 mx-auto mb-1" />
              <p className="text-lg font-bold text-foreground">{submissions.length}</p>
              <p className="text-[10px] text-muted-foreground">Total Submissions</p>
            </div>
            <div className="bg-gradient-to-br from-violet-500/10 to-violet-500/5 border border-violet-500/20 rounded-lg p-3 text-center">
              <Sparkles className="h-4 w-4 text-violet-600 mx-auto mb-1" />
              <p className="text-lg font-bold text-foreground">{fieldStats.length}</p>
              <p className="text-[10px] text-muted-foreground">Fields Tracked</p>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-1 bg-muted/40 rounded-lg p-1">
            {(["bars", "scatter", "heatmap"] as const).map(mode => (
              <Button key={mode} variant={viewMode === mode ? "default" : "ghost"} size="sm" onClick={() => setViewMode(mode)} className="text-xs h-7 px-3">
                {mode === "bars" ? <BarChart3 className="h-3 w-3 mr-1" /> : mode === "scatter" ? <Eye className="h-3 w-3 mr-1" /> : <Layers className="h-3 w-3 mr-1" />}
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => { setRotateX(25); setRotateY(-35); }}>
            <RotateCcw className="h-3 w-3 mr-1" />Reset
          </Button>
          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[10px] text-muted-foreground">X</span>
            <input type="range" min={-60} max={60} value={rotateX} onChange={e => setRotateX(Number(e.target.value))} className="w-16 h-1 accent-primary" />
            <span className="text-[10px] text-muted-foreground">Y</span>
            <input type="range" min={-180} max={180} value={rotateY} onChange={e => setRotateY(Number(e.target.value))} className="w-16 h-1 accent-primary" />
          </div>
        </div>

        {/* 3D Scene */}
        <div className="relative bg-gradient-to-br from-card to-muted/20 rounded-xl overflow-hidden border-2 border-border/50 shadow-inner" style={{ height: 420, perspective: "1000px" }}>
          {fieldStats.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="p-5 rounded-2xl bg-muted/30 mx-auto mb-4 w-fit">
                  <Box className="h-14 w-14 text-muted-foreground/30" />
                </div>
                <p className="text-sm text-muted-foreground font-medium">Select a project and form to visualize data in 3D</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Data will render as interactive 3D charts</p>
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex items-end justify-center" style={{ transformStyle: "preserve-3d", transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`, transformOrigin: "center center" }}>
              {/* Grid floor */}
              <div className="absolute" style={{ width: "100%", height: "100%", bottom: 0, transformStyle: "preserve-3d", transform: "rotateX(90deg) translateZ(-1px)", background: "repeating-linear-gradient(0deg, transparent, transparent 39px, hsl(var(--border)) 39px, hsl(var(--border)) 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, hsl(var(--border)) 39px, hsl(var(--border)) 40px)", opacity: 0.2 }} />

              {viewMode === "bars" && fieldStats.map((field, i) => {
                const barHeight = Math.max(12, (field.totalResponses / maxResponses) * 260);
                const xPos = (i - fieldStats.length / 2) * 52 + 26;
                return (
                  <div key={field.id} className="absolute flex flex-col items-center" style={{ left: `calc(50% + ${xPos}px)`, bottom: "40px", transformStyle: "preserve-3d" }}>
                    <div className="rounded-t-md relative group cursor-pointer transition-transform hover:scale-105" style={{ width: 38, height: barHeight, background: `linear-gradient(to top, ${getBarColor(field.completeness)}, ${getBarColor(field.completeness)}cc)`, boxShadow: `4px 4px 16px ${getBarColor(field.completeness)}40, inset 0 1px 0 rgba(255,255,255,0.15)`, transform: "translateZ(19px)" }}>
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-foreground bg-background/90 px-1.5 rounded shadow-sm">{field.totalResponses}</div>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-8 hidden group-hover:block z-50 bg-popover border rounded-lg shadow-xl p-3 text-xs w-44">
                        <p className="font-bold truncate mb-1">{field.label}</p>
                        <div className="space-y-0.5 text-muted-foreground">
                          <p>Responses: <span className="text-foreground font-medium">{field.totalResponses}</span></p>
                          <p>Completeness: <span className="text-foreground font-medium">{field.completeness.toFixed(0)}%</span></p>
                          <p>Unique values: <span className="text-foreground font-medium">{field.uniqueValues}</span></p>
                          <p>Type: <span className="text-foreground font-medium">{field.type}</span></p>
                        </div>
                      </div>
                    </div>
                    <div className="absolute" style={{ width: 19, height: barHeight, right: -9, bottom: 0, background: `${getBarColor(field.completeness)}55`, transform: "rotateY(90deg) translateZ(19px)" }} />
                    <p className="text-[9px] text-muted-foreground mt-1 max-w-[42px] truncate text-center font-medium">{field.label}</p>
                  </div>
                );
              })}

              {viewMode === "scatter" && fieldStats.map((field, i) => {
                const x = (i / fieldStats.length) * 80 + 10;
                const y = 90 - field.completeness * 0.8;
                const size = Math.max(10, (field.uniqueValues / Math.max(...fieldStats.map(f => f.uniqueValues), 1)) * 32);
                return (
                  <div key={field.id} className="absolute rounded-full group cursor-pointer transition-transform hover:scale-110" style={{ left: `${x}%`, bottom: `${100 - y}%`, width: size, height: size, background: `radial-gradient(circle at 35% 35%, ${getBarColor(field.completeness)}cc, ${getBarColor(field.completeness)})`, boxShadow: `0 0 ${size * 1.5}px ${getBarColor(field.completeness)}44`, transform: `translateZ(${size}px)` }}>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 bg-popover border rounded-lg shadow-xl p-2 text-xs w-36">
                      <p className="font-bold truncate">{field.label}</p>
                      <p className="text-muted-foreground">{field.completeness.toFixed(0)}% complete</p>
                    </div>
                  </div>
                );
              })}

              {viewMode === "heatmap" && (
                <div className="absolute inset-4 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(fieldStats.length, 4)}, 1fr)` }}>
                  {fieldStats.map(field => (
                    <div key={field.id} className="rounded-xl flex flex-col items-center justify-center p-3 group cursor-pointer transition-transform hover:scale-[1.03] border border-white/10" style={{ background: `${getBarColor(field.completeness)}${Math.round(field.completeness * 2.55).toString(16).padStart(2, "0")}`, boxShadow: `inset 0 0 30px ${getBarColor(field.completeness)}22`, transform: `translateZ(${field.completeness / 5}px)` }}>
                      <p className="text-[10px] font-bold text-foreground truncate max-w-full">{field.label}</p>
                      <p className="text-2xl font-bold text-foreground">{field.completeness.toFixed(0)}%</p>
                      <p className="text-[9px] text-muted-foreground">{field.totalResponses} responses</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground flex-wrap">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm shadow-sm" style={{ background: "hsl(142, 71%, 45%)" }} />≥90%</div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm shadow-sm" style={{ background: "hsl(217, 91%, 60%)" }} />70-89%</div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm shadow-sm" style={{ background: "hsl(45, 93%, 47%)" }} />50-69%</div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm shadow-sm" style={{ background: "hsl(0, 84%, 60%)" }} />&lt;50%</div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ARDataVisualization;
