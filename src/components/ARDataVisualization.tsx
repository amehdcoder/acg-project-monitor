import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Box, RotateCcw, Eye, Layers, BarChart3 } from "lucide-react";

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

  // Extract field-level stats for 3D visualization
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
      const uniqueValues = new Set(submissions.map(s => String((s.data as any)?.[q.id] || "")).filter(Boolean)).size;
      
      return {
        id: q.id,
        label: q.label || q.name || `Q${i + 1}`,
        completeness,
        totalResponses: filled,
        uniqueValues,
        type: q.type,
      };
    });
  }, [submissions, forms, selectedForm]);

  const maxResponses = Math.max(...fieldStats.map(f => f.totalResponses), 1);

  const getBarColor = (completeness: number) => {
    if (completeness >= 90) return "hsl(var(--primary))";
    if (completeness >= 70) return "hsl(var(--accent))";
    if (completeness >= 50) return "hsl(45, 93%, 47%)";
    return "hsl(var(--destructive))";
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Box className="h-5 w-5 text-primary" />
              AR 3D Form Data Visualization
            </CardTitle>
            <CardDescription>Interactive 3D rendering of form submission data for enhanced understanding</CardDescription>
          </div>
          <div className="flex items-center gap-2">
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
      <CardContent>
        {/* Controls */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">View:</span>
            {(["bars", "scatter", "heatmap"] as const).map(mode => (
              <Button key={mode} variant={viewMode === mode ? "default" : "outline"} size="sm" onClick={() => setViewMode(mode)} className="text-xs h-7">
                {mode === "bars" ? <BarChart3 className="h-3 w-3 mr-1" /> : mode === "scatter" ? <Eye className="h-3 w-3 mr-1" /> : <Layers className="h-3 w-3 mr-1" />}
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </Button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => { setRotateX(25); setRotateY(-35); }}>
            <RotateCcw className="h-3 w-3 mr-1" />Reset View
          </Button>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Rotate:</span>
            <input type="range" min={-60} max={60} value={rotateX} onChange={e => setRotateX(Number(e.target.value))} className="w-16 h-1" />
            <input type="range" min={-180} max={180} value={rotateY} onChange={e => setRotateY(Number(e.target.value))} className="w-16 h-1" />
          </div>
          <Badge variant="secondary" className="text-xs">{submissions.length} submissions</Badge>
        </div>

        {/* 3D Scene */}
        <div
          className="relative bg-gradient-to-br from-muted/30 to-muted/10 rounded-lg overflow-hidden border"
          style={{ height: 420, perspective: "1000px" }}
        >
          {fieldStats.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Box className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Select a project and form to visualize data in 3D</p>
              </div>
            </div>
          ) : (
            <div
              className="absolute inset-0 flex items-end justify-center"
              style={{
                transformStyle: "preserve-3d",
                transform: `rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
                transformOrigin: "center center",
              }}
            >
              {/* Grid floor */}
              <div
                className="absolute"
                style={{
                  width: "100%",
                  height: "100%",
                  bottom: 0,
                  transformStyle: "preserve-3d",
                  transform: "rotateX(90deg) translateZ(-1px)",
                  background: "repeating-linear-gradient(0deg, transparent, transparent 39px, hsl(var(--border)) 39px, hsl(var(--border)) 40px), repeating-linear-gradient(90deg, transparent, transparent 39px, hsl(var(--border)) 39px, hsl(var(--border)) 40px)",
                  opacity: 0.3,
                }}
              />

              {viewMode === "bars" && fieldStats.map((field, i) => {
                const barHeight = Math.max(10, (field.totalResponses / maxResponses) * 250);
                const xPos = (i - fieldStats.length / 2) * 50 + 25;
                return (
                  <div
                    key={field.id}
                    className="absolute flex flex-col items-center"
                    style={{
                      left: `calc(50% + ${xPos}px)`,
                      bottom: "40px",
                      transformStyle: "preserve-3d",
                    }}
                  >
                    {/* Bar */}
                    <div
                      className="rounded-t-sm relative group cursor-pointer"
                      style={{
                        width: 36,
                        height: barHeight,
                        background: `linear-gradient(to top, ${getBarColor(field.completeness)}, ${getBarColor(field.completeness)}88)`,
                        boxShadow: `4px 4px 12px ${getBarColor(field.completeness)}33`,
                        transform: "translateZ(18px)",
                      }}
                    >
                      {/* Value label */}
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold text-foreground bg-background/80 px-1 rounded">
                        {field.totalResponses}
                      </div>
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-8 hidden group-hover:block z-50 bg-popover border rounded-lg shadow-lg p-2 text-xs w-40">
                        <p className="font-bold truncate">{field.label}</p>
                        <p>Responses: {field.totalResponses}</p>
                        <p>Completeness: {field.completeness.toFixed(0)}%</p>
                        <p>Unique values: {field.uniqueValues}</p>
                        <p>Type: {field.type}</p>
                      </div>
                    </div>
                    {/* Side face */}
                    <div
                      className="absolute"
                      style={{
                        width: 18,
                        height: barHeight,
                        right: -9,
                        bottom: 0,
                        background: `${getBarColor(field.completeness)}66`,
                        transform: "rotateY(90deg) translateZ(18px)",
                      }}
                    />
                    {/* Label */}
                    <p className="text-[9px] text-muted-foreground mt-1 max-w-[40px] truncate text-center">
                      {field.label}
                    </p>
                  </div>
                );
              })}

              {viewMode === "scatter" && fieldStats.map((field, i) => {
                const x = (i / fieldStats.length) * 80 + 10;
                const y = 90 - field.completeness * 0.8;
                const size = Math.max(8, (field.uniqueValues / Math.max(...fieldStats.map(f => f.uniqueValues), 1)) * 30);
                return (
                  <div
                    key={field.id}
                    className="absolute rounded-full group cursor-pointer"
                    style={{
                      left: `${x}%`,
                      bottom: `${100 - y}%`,
                      width: size,
                      height: size,
                      background: getBarColor(field.completeness),
                      boxShadow: `0 0 ${size}px ${getBarColor(field.completeness)}55`,
                      transform: `translateZ(${size}px)`,
                    }}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 bg-popover border rounded-lg shadow-lg p-2 text-xs w-36">
                      <p className="font-bold truncate">{field.label}</p>
                      <p>{field.completeness.toFixed(0)}% complete</p>
                    </div>
                  </div>
                );
              })}

              {viewMode === "heatmap" && (
                <div className="absolute inset-4 grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.min(fieldStats.length, 4)}, 1fr)` }}>
                  {fieldStats.map(field => (
                    <div
                      key={field.id}
                      className="rounded-lg flex flex-col items-center justify-center p-2 group cursor-pointer"
                      style={{
                        background: `${getBarColor(field.completeness)}${Math.round(field.completeness * 2.55).toString(16).padStart(2, "0")}`,
                        boxShadow: `inset 0 0 20px ${getBarColor(field.completeness)}22`,
                        transform: `translateZ(${field.completeness / 5}px)`,
                      }}
                    >
                      <p className="text-[10px] font-bold text-foreground truncate max-w-full">{field.label}</p>
                      <p className="text-lg font-bold text-foreground">{field.completeness.toFixed(0)}%</p>
                      <p className="text-[9px] text-muted-foreground">{field.totalResponses} responses</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm" style={{ background: "hsl(var(--primary))" }} />≥90% complete</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm" style={{ background: "hsl(var(--accent))" }} />70-89%</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm" style={{ background: "hsl(45, 93%, 47%)" }} />50-69%</div>
          <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm" style={{ background: "hsl(var(--destructive))" }} />&lt;50%</div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ARDataVisualization;