import { useState, useEffect, useMemo, Suspense, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Box, RotateCcw, Eye, Layers, BarChart3, Settings, Palette, Save, TrendingUp, MapPin, Users, Clock, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, Environment, Float, RoundedBox } from "@react-three/drei";
import * as THREE from "three";

interface FieldStat {
  id: string;
  label: string;
  completeness: number;
  totalResponses: number;
  uniqueValues: number;
  type: string;
}

interface SubmissionMeta {
  totalSubmissions: number;
  avgCompletionRate: number;
  geofenceCompliance: number;
  uniqueEnumerators: number;
  submissionTrend: "up" | "down" | "stable";
  lastSubmissionTime: string | null;
}

// 3D Bar with animated growth
function Bar3D({ position, height, color, label, value, index }: {
  position: [number, number, number];
  height: number;
  color: string;
  label: string;
  value: number;
  index: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const growRef = useRef(0);

  useFrame((state, delta) => {
    if (meshRef.current) {
      // Animate bar growing
      growRef.current = THREE.MathUtils.lerp(growRef.current, 1, delta * 2);
      meshRef.current.scale.y = growRef.current * (hovered ? 1.08 : 1);
      meshRef.current.scale.x = hovered ? 1.05 : 1;
      meshRef.current.scale.z = hovered ? 1.05 : 1;
    }
  });

  return (
    <group position={position}>
      <RoundedBox
        ref={meshRef}
        args={[0.6, height, 0.6]}
        radius={0.05}
        position={[0, height / 2, 0]}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        castShadow
      >
        <meshStandardMaterial
          color={color}
          transparent
          opacity={hovered ? 1 : 0.88}
          metalness={0.25}
          roughness={0.35}
          emissive={color}
          emissiveIntensity={hovered ? 0.15 : 0}
        />
      </RoundedBox>
      {/* Value label */}
      <Text
        position={[0, height + 0.35, 0]}
        fontSize={0.22}
        color="#ffffff"
        anchorX="center"
        anchorY="bottom"
        font={undefined}
      >
        {value.toString()}
      </Text>
      {/* Field label */}
      <Text
        position={[0, -0.25, 0]}
        fontSize={0.14}
        color="#aaaaaa"
        anchorX="center"
        anchorY="top"
        maxWidth={1}
      >
        {label.substring(0, 12)}
      </Text>
      {/* Completeness percentage on side */}
      {hovered && (
        <Text
          position={[0.5, height / 2, 0]}
          fontSize={0.13}
          color="#fbbf24"
          anchorX="left"
        >
          {`${Math.round((value / Math.max(1, value)) * 100)}%`}
        </Text>
      )}
    </group>
  );
}

// Scatter sphere with pulse effect
function Sphere3D({ position, size, color, label }: {
  position: [number, number, number];
  size: number;
  color: string;
  label: string;
}) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.03;
      meshRef.current.scale.setScalar(hovered ? 1.15 : pulse);
    }
  });

  return (
    <group>
      <mesh
        ref={meshRef}
        position={position}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        castShadow
      >
        <sphereGeometry args={[size, 32, 32]} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={hovered ? 1 : 0.75}
          metalness={0.4}
          roughness={0.3}
          emissive={color}
          emissiveIntensity={hovered ? 0.25 : 0.08}
        />
      </mesh>
      {hovered && (
        <Text position={[position[0], position[1] + size + 0.35, position[2]]} fontSize={0.16} color="#ffffff" anchorX="center">
          {label}
        </Text>
      )}
    </group>
  );
}

// Axis labels
function AxisLabels({ viewMode }: { viewMode: string }) {
  return (
    <group>
      {/* X-axis */}
      <Text position={[0, -0.5, 0]} fontSize={0.12} color="#666" anchorX="center">
        {viewMode === "scatter" ? "Fields →" : "Questions →"}
      </Text>
      {/* Y-axis */}
      <Text position={[-1, 2.5, 0]} fontSize={0.12} color="#666" rotation={[0, 0, Math.PI / 2]}>
        {viewMode === "scatter" ? "Completeness %" : "Response Count"}
      </Text>
    </group>
  );
}

function GridFloor() {
  return (
    <group>
      <gridHelper args={[20, 20, "#444444", "#333333"]} position={[0, 0, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[20, 20]} />
        <meshStandardMaterial color="#1a1a2e" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}

function Scene3D({ fieldStats, viewMode, config }: {
  fieldStats: FieldStat[];
  viewMode: string;
  config: VisualizationConfig;
}) {
  const maxResponses = Math.max(...fieldStats.map(f => f.totalResponses), 1);

  const getColor = (completeness: number) => {
    if (completeness >= 90) return config.colors.high;
    if (completeness >= 70) return config.colors.medium;
    if (completeness >= 50) return config.colors.low;
    return config.colors.critical;
  };

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[10, 15, 5]} intensity={0.9} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <pointLight position={[-10, 5, -10]} intensity={0.25} color="#6366f1" />
      <pointLight position={[10, 3, 10]} intensity={0.15} color="#22c55e" />
      <Environment preset={config.environment as any} />
      <GridFloor />
      <AxisLabels viewMode={viewMode} />
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={3}
        maxDistance={20}
        maxPolarAngle={Math.PI / 2.1}
        autoRotate={config.autoRotate}
        autoRotateSpeed={0.5}
      />

      {viewMode === "bars" && fieldStats.map((field, i) => {
        const barHeight = Math.max(0.3, (field.totalResponses / maxResponses) * config.maxBarHeight);
        const xPos = (i - fieldStats.length / 2) * config.spacing;
        return (
          <Bar3D
            key={field.id}
            position={[xPos, 0, 0]}
            height={barHeight}
            color={getColor(field.completeness)}
            label={field.label}
            value={field.totalResponses}
            index={i}
          />
        );
      })}

      {viewMode === "scatter" && fieldStats.map((field, i) => {
        const x = (i - fieldStats.length / 2) * 1.5;
        const y = (field.completeness / 100) * config.maxBarHeight;
        const z = (field.uniqueValues / Math.max(...fieldStats.map(f => f.uniqueValues), 1)) * 3;
        const size = Math.max(0.15, (field.totalResponses / maxResponses) * 0.5);
        return (
          <Sphere3D
            key={field.id}
            position={[x, y, z]}
            size={size}
            color={getColor(field.completeness)}
            label={`${field.label}: ${field.completeness.toFixed(0)}%`}
          />
        );
      })}

      {viewMode === "heatmap" && fieldStats.map((field, i) => {
        const cols = Math.ceil(Math.sqrt(fieldStats.length));
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x = (col - cols / 2) * 1.8;
        const z = (row - Math.ceil(fieldStats.length / cols) / 2) * 1.8;
        const height = Math.max(0.2, (field.completeness / 100) * config.maxBarHeight);
        return (
          <group key={field.id}>
            <RoundedBox args={[1.5, height, 1.5]} radius={0.1} position={[x, height / 2, z]} castShadow>
              <meshStandardMaterial
                color={getColor(field.completeness)}
                transparent
                opacity={0.82}
                metalness={0.2}
                roughness={0.5}
                emissive={getColor(field.completeness)}
                emissiveIntensity={0.05}
              />
            </RoundedBox>
            <Text position={[x, height + 0.3, z]} fontSize={0.2} color="#ffffff" anchorX="center">
              {field.completeness.toFixed(0)}%
            </Text>
            <Text position={[x, -0.2, z]} fontSize={0.13} color="#888" anchorX="center" maxWidth={1.4}>
              {field.label.substring(0, 12)}
            </Text>
          </group>
        );
      })}
    </>
  );
}

interface VisualizationConfig {
  maxBarHeight: number;
  spacing: number;
  environment: string;
  autoRotate: boolean;
  colors: {
    high: string;
    medium: string;
    low: string;
    critical: string;
  };
}

const DEFAULT_CONFIG: VisualizationConfig = {
  maxBarHeight: 5,
  spacing: 1.2,
  environment: "city",
  autoRotate: false,
  colors: {
    high: "#22c55e",
    medium: "#3b82f6",
    low: "#eab308",
    critical: "#ef4444",
  },
};

const ENVIRONMENTS = ["city", "sunset", "dawn", "night", "forest", "apartment", "studio", "warehouse", "park", "lobby"];

interface ARDataVisualization3DProps {
  realtimeKey?: number;
}

const ARDataVisualization3D = ({ realtimeKey = 0 }: ARDataVisualization3DProps) => {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [forms, setForms] = useState<any[]>([]);
  const [selectedForm, setSelectedForm] = useState("");
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<"bars" | "scatter" | "heatmap">("bars");
  const [config, setConfig] = useState<VisualizationConfig>(DEFAULT_CONFIG);
  const [showDesigner, setShowDesigner] = useState(false);

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
    supabase.from("form_submissions").select("id, data, created_at, user_id, status, within_geofence")
      .eq("form_id", selectedForm).order("created_at", { ascending: false }).limit(500)
      .then(({ data }) => setSubmissions(data || []));
  }, [selectedForm, realtimeKey]);

  // Compute field-level stats
  const fieldStats = useMemo<FieldStat[]>(() => {
    if (submissions.length === 0) return [];
    const form = forms.find(f => f.id === selectedForm);
    const questions = (form?.questions || []) as any[];
    return questions.slice(0, 15).map((q: any, i: number) => {
      const filled = submissions.filter(s => {
        const val = (s.data as any)?.[q.id];
        return val !== undefined && val !== null && val !== "";
      }).length;
      return {
        id: q.id,
        label: q.label || q.name || `Q${i + 1}`,
        completeness: submissions.length > 0 ? (filled / submissions.length) * 100 : 0,
        totalResponses: filled,
        uniqueValues: new Set(submissions.map(s => String((s.data as any)?.[q.id] || "")).filter(Boolean)).size,
        type: q.type,
      };
    });
  }, [submissions, forms, selectedForm]);

  // Compute aggregate insights
  const meta = useMemo<SubmissionMeta>(() => {
    const uniqueUsers = new Set(submissions.map(s => s.user_id));
    const geofenceOk = submissions.filter(s => s.within_geofence === true).length;
    const avgComp = fieldStats.length > 0 ? fieldStats.reduce((a, f) => a + f.completeness, 0) / fieldStats.length : 0;
    const sorted = [...submissions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return {
      totalSubmissions: submissions.length,
      avgCompletionRate: avgComp,
      geofenceCompliance: submissions.length > 0 ? (geofenceOk / submissions.length) * 100 : 0,
      uniqueEnumerators: uniqueUsers.size,
      submissionTrend: "stable",
      lastSubmissionTime: sorted[0]?.created_at || null,
    };
  }, [submissions, fieldStats]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Box className="h-5 w-5 text-primary" />
              3D AR Data Visualization
            </CardTitle>
            <CardDescription>Interactive field data analysis with real-time 3D rendering</CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedProject} onValueChange={v => { setSelectedProject(v === "__all__" ? "" : v); setSelectedForm(""); }}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Project" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Projects</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {forms.length > 0 && (
              <Select value={selectedForm} onValueChange={setSelectedForm}>
                <SelectTrigger className="w-36"><SelectValue placeholder="Form" /></SelectTrigger>
                <SelectContent>
                  {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button variant={showDesigner ? "default" : "outline"} size="sm" onClick={() => setShowDesigner(!showDesigner)}>
              <Settings className="h-4 w-4 mr-1" />Design
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* KPI Insight Cards */}
        {submissions.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
            <div className="bg-muted/40 rounded-lg p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                <BarChart3 className="h-3 w-3" /><span className="text-[10px]">Submissions</span>
              </div>
              <p className="text-lg font-bold text-foreground">{meta.totalSubmissions}</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                <TrendingUp className="h-3 w-3" /><span className="text-[10px]">Avg Completeness</span>
              </div>
              <p className="text-lg font-bold text-foreground">{meta.avgCompletionRate.toFixed(0)}%</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                <MapPin className="h-3 w-3" /><span className="text-[10px]">Geofence OK</span>
              </div>
              <p className="text-lg font-bold text-foreground">{meta.geofenceCompliance.toFixed(0)}%</p>
            </div>
            <div className="bg-muted/40 rounded-lg p-2.5 text-center">
              <div className="flex items-center justify-center gap-1 text-muted-foreground mb-0.5">
                <Users className="h-3 w-3" /><span className="text-[10px]">Enumerators</span>
              </div>
              <p className="text-lg font-bold text-foreground">{meta.uniqueEnumerators}</p>
            </div>
          </div>
        )}

        {/* View mode + stats */}
        <div className="flex items-center gap-3 mb-3 flex-wrap">
          {(["bars", "scatter", "heatmap"] as const).map(mode => (
            <Button key={mode} variant={viewMode === mode ? "default" : "outline"} size="sm" onClick={() => setViewMode(mode)} className="text-xs h-7">
              {mode === "bars" ? <BarChart3 className="h-3 w-3 mr-1" /> : mode === "scatter" ? <Eye className="h-3 w-3 mr-1" /> : <Layers className="h-3 w-3 mr-1" />}
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Button>
          ))}
          <Badge variant="secondary" className="text-xs">{submissions.length} submissions</Badge>
          <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoRotate}
              onChange={e => setConfig(c => ({ ...c, autoRotate: e.target.checked }))}
              className="rounded"
            />
            Auto-rotate
          </label>
        </div>

        {/* Design Panel */}
        {showDesigner && (
          <div className="border rounded-lg p-4 mb-3 bg-muted/30 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs">Max Bar Height</Label>
              <Slider value={[config.maxBarHeight]} min={2} max={10} step={0.5} onValueChange={([v]) => setConfig(c => ({ ...c, maxBarHeight: v }))} />
              <span className="text-xs text-muted-foreground">{config.maxBarHeight}</span>
            </div>
            <div>
              <Label className="text-xs">Spacing</Label>
              <Slider value={[config.spacing]} min={0.8} max={3} step={0.1} onValueChange={([v]) => setConfig(c => ({ ...c, spacing: v }))} />
              <span className="text-xs text-muted-foreground">{config.spacing}</span>
            </div>
            <div>
              <Label className="text-xs">Environment</Label>
              <Select value={config.environment} onValueChange={v => setConfig(c => ({ ...c, environment: v }))}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ENVIRONMENTS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <div>
                <Label className="text-[10px]">≥90%</Label>
                <Input type="color" value={config.colors.high} onChange={e => setConfig(c => ({ ...c, colors: { ...c.colors, high: e.target.value } }))} className="h-7 p-0.5" />
              </div>
              <div>
                <Label className="text-[10px]">70-89%</Label>
                <Input type="color" value={config.colors.medium} onChange={e => setConfig(c => ({ ...c, colors: { ...c.colors, medium: e.target.value } }))} className="h-7 p-0.5" />
              </div>
              <div>
                <Label className="text-[10px]">50-69%</Label>
                <Input type="color" value={config.colors.low} onChange={e => setConfig(c => ({ ...c, colors: { ...c.colors, low: e.target.value } }))} className="h-7 p-0.5" />
              </div>
              <div>
                <Label className="text-[10px]">&lt;50%</Label>
                <Input type="color" value={config.colors.critical} onChange={e => setConfig(c => ({ ...c, colors: { ...c.colors, critical: e.target.value } }))} className="h-7 p-0.5" />
              </div>
            </div>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setConfig(DEFAULT_CONFIG)}>
              <RotateCcw className="h-3 w-3 mr-1" />Reset
            </Button>
          </div>
        )}

        {/* 3D Canvas */}
        <div className="relative rounded-lg overflow-hidden border bg-gradient-to-b from-background to-muted/20" style={{ height: 450 }}>
          {fieldStats.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <Box className="h-12 w-12 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Select a project and form to visualize data in 3D</p>
                <p className="text-xs mt-1 text-muted-foreground/70">Data appears as interactive bars, spheres, or heatmap blocks</p>
              </div>
            </div>
          ) : (
            <Canvas camera={{ position: [8, 6, 8], fov: 50 }} shadows>
              <Suspense fallback={null}>
                <Scene3D fieldStats={fieldStats} viewMode={viewMode} config={config} />
              </Suspense>
            </Canvas>
          )}
        </div>

        {/* Legend + field quality alerts */}
        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm" style={{ background: config.colors.high }} />≥90%</div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm" style={{ background: config.colors.medium }} />70-89%</div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm" style={{ background: config.colors.low }} />50-69%</div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm" style={{ background: config.colors.critical }} />&lt;50%</div>
          </div>
          {fieldStats.filter(f => f.completeness < 50).length > 0 && (
            <div className="flex items-center gap-1 text-xs text-destructive">
              <AlertTriangle className="h-3 w-3" />
              {fieldStats.filter(f => f.completeness < 50).length} field(s) below 50% completeness
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ARDataVisualization3D;
