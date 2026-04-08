import { useState, useEffect, useMemo, Suspense, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import {
  Box, RotateCcw, Eye, Layers, BarChart3, Settings, TrendingUp,
  MapPin, Users, Clock, AlertTriangle, Globe, Navigation, Maximize2,
  Activity, Crosshair, Map as MapIcon, Compass, Signal, Target, Sparkles
} from "lucide-react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, Environment, Float, RoundedBox, Stars, ContactShadows } from "@react-three/drei";
import * as THREE from "three";

// ─── Types ───────────────────────────────────────────────────────────────────

interface FieldStat {
  id: string;
  label: string;
  completeness: number;
  totalResponses: number;
  uniqueValues: number;
  type: string;
}

interface GPSPoint {
  lat: number;
  lng: number;
  userId: string;
  userName: string;
  submittedAt: string;
  accuracy?: number;
  formName?: string;
}

interface SubmissionMeta {
  totalSubmissions: number;
  avgCompletionRate: number;
  geofenceCompliance: number;
  uniqueEnumerators: number;
  gpsPoints: number;
  avgAccuracy: number;
  submissionTrend: "up" | "down" | "stable";
  lastSubmissionTime: string | null;
  todayCount: number;
  thisWeekCount: number;
}

interface VisualizationConfig {
  maxBarHeight: number;
  spacing: number;
  environment: string;
  autoRotate: boolean;
  showStars: boolean;
  showShadows: boolean;
  colors: { high: string; medium: string; low: string; critical: string };
}

const DEFAULT_CONFIG: VisualizationConfig = {
  maxBarHeight: 5,
  spacing: 1.2,
  environment: "city",
  autoRotate: true,
  showStars: true,
  showShadows: true,
  colors: { high: "#22c55e", medium: "#3b82f6", low: "#eab308", critical: "#ef4444" },
};

const ENVIRONMENTS = ["city", "sunset", "dawn", "night", "forest", "apartment", "studio", "warehouse", "park", "lobby"];

// ─── 3D Components ───────────────────────────────────────────────────────────

function AnimatedBar({ position, height, color, label, value, index, maxVal }: {
  position: [number, number, number]; height: number; color: string;
  label: string; value: number; index: number; maxVal: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const growRef = useRef(0);
  const glowRef = useRef<THREE.Mesh>(null);

  useFrame((state, delta) => {
    if (meshRef.current) {
      growRef.current = THREE.MathUtils.lerp(growRef.current, 1, delta * 1.5);
      meshRef.current.scale.y = growRef.current * (hovered ? 1.1 : 1);
      meshRef.current.scale.x = hovered ? 1.08 : 1;
      meshRef.current.scale.z = hovered ? 1.08 : 1;
    }
    if (glowRef.current) {
      glowRef.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 3 + index) * 0.02);
    }
  });

  const pct = maxVal > 0 ? Math.round((value / maxVal) * 100) : 0;

  return (
    <group position={position}>
      {/* Glow base ring */}
      <mesh ref={glowRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.45, 32]} />
        <meshBasicMaterial color={color} transparent opacity={hovered ? 0.6 : 0.2} />
      </mesh>
      {/* Main bar */}
      <RoundedBox
        ref={meshRef}
        args={[0.55, height, 0.55]}
        radius={0.06}
        position={[0, height / 2, 0]}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        castShadow
      >
        <meshStandardMaterial
          color={color}
          transparent opacity={hovered ? 1 : 0.92}
          metalness={0.3} roughness={0.25}
          emissive={color} emissiveIntensity={hovered ? 0.2 : 0.05}
        />
      </RoundedBox>
      {/* Value on top */}
      <Float speed={2} floatIntensity={0.15}>
        <Text position={[0, height + 0.4, 0]} fontSize={0.22} color="#ffffff" anchorX="center" anchorY="bottom" font={undefined}>
          {value.toString()}
        </Text>
      </Float>
      {/* Label below */}
      <Text position={[0, -0.3, 0]} fontSize={0.13} color="#999999" anchorX="center" anchorY="top" maxWidth={1.2}>
        {label.length > 14 ? label.substring(0, 12) + "…" : label}
      </Text>
      {/* Hover detail */}
      {hovered && (
        <group position={[0.6, height / 2, 0]}>
          <RoundedBox args={[1.2, 0.6, 0.05]} radius={0.04}>
            <meshBasicMaterial color="#000000" transparent opacity={0.85} />
          </RoundedBox>
          <Text position={[0, 0.12, 0.03]} fontSize={0.1} color="#ffffff" anchorX="center">{label}</Text>
          <Text position={[0, -0.05, 0.03]} fontSize={0.09} color="#22c55e" anchorX="center">{`${pct}% of max`}</Text>
          <Text position={[0, -0.2, 0.03]} fontSize={0.08} color="#aaaaaa" anchorX="center">{`${value} responses`}</Text>
        </group>
      )}
    </group>
  );
}

function DataSphere({ position, size, color, label, value, pct }: {
  position: [number, number, number]; size: number; color: string;
  label: string; value: number; pct: number;
}) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Mesh>(null);
  const trailRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (meshRef.current) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * 2) * 0.04;
      meshRef.current.scale.setScalar(hovered ? 1.2 : pulse);
    }
    if (trailRef.current) {
      const mat = trailRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.1 + Math.sin(state.clock.elapsedTime * 1.5) * 0.05;
    }
  });

  return (
    <group>
      {/* Connection line to floor */}
      <mesh position={[position[0], position[1] / 2, position[2]]}>
        <cylinderGeometry args={[0.01, 0.01, position[1], 8]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} />
      </mesh>
      {/* Trail ring */}
      <mesh ref={trailRef as any} position={position} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[size + 0.1, 0.02, 8, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.15} />
      </mesh>
      {/* Sphere */}
      <mesh
        ref={meshRef}
        position={position}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        castShadow
      >
        <sphereGeometry args={[size, 32, 32]} />
        <meshPhysicalMaterial
          color={color} transparent opacity={hovered ? 0.95 : 0.8}
          metalness={0.5} roughness={0.2} clearcoat={1} clearcoatRoughness={0.1}
          emissive={color} emissiveIntensity={hovered ? 0.3 : 0.1}
        />
      </mesh>
      {hovered && (
        <group position={[position[0], position[1] + size + 0.5, position[2]]}>
          <RoundedBox args={[1.4, 0.5, 0.05]} radius={0.04}>
            <meshBasicMaterial color="#000000" transparent opacity={0.85} />
          </RoundedBox>
          <Text position={[0, 0.1, 0.03]} fontSize={0.1} color="#ffffff" anchorX="center">{label}</Text>
          <Text position={[0, -0.1, 0.03]} fontSize={0.09} color="#22c55e" anchorX="center">{`${pct.toFixed(0)}% • ${value} resp`}</Text>
        </group>
      )}
    </group>
  );
}

function GPSPin({ position, color, label, distance }: {
  position: [number, number, number]; color: string; label: string; distance: string;
}) {
  const [hovered, setHovered] = useState(false);
  const ref = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (ref.current) {
      ref.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2 + position[0]) * 0.1;
    }
  });

  return (
    <group ref={ref} position={position}
      onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}
    >
      {/* Pin body */}
      <mesh castShadow>
        <coneGeometry args={[0.12, 0.4, 16]} />
        <meshStandardMaterial color={color} metalness={0.4} roughness={0.3} emissive={color} emissiveIntensity={hovered ? 0.3 : 0.1} />
      </mesh>
      {/* Pin head */}
      <mesh position={[0, 0.3, 0]} castShadow>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial color={color} metalness={0.5} roughness={0.2} emissive={color} emissiveIntensity={hovered ? 0.4 : 0.15} />
      </mesh>
      {/* Pulse ring on ground */}
      <mesh position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.15, 0.2, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} />
      </mesh>
      {hovered && (
        <group position={[0, 0.7, 0]}>
          <RoundedBox args={[1.6, 0.5, 0.04]} radius={0.04}>
            <meshBasicMaterial color="#000000" transparent opacity={0.9} />
          </RoundedBox>
          <Text position={[0, 0.1, 0.03]} fontSize={0.09} color="#ffffff" anchorX="center">{label}</Text>
          <Text position={[0, -0.08, 0.03]} fontSize={0.08} color="#94a3b8" anchorX="center">{distance}</Text>
        </group>
      )}
    </group>
  );
}

function TerrainGrid() {
  return (
    <group>
      <gridHelper args={[24, 24, "#334155", "#1e293b"]} position={[0, 0, 0]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[24, 24]} />
        <meshStandardMaterial color="#0f172a" transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

function Scene3D({ fieldStats, viewMode, config, gpsPoints }: {
  fieldStats: FieldStat[]; viewMode: string; config: VisualizationConfig; gpsPoints: GPSPoint[];
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
      <ambientLight intensity={0.3} />
      <directionalLight position={[10, 15, 5]} intensity={1} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <pointLight position={[-10, 8, -10]} intensity={0.3} color="#6366f1" />
      <pointLight position={[10, 5, 10]} intensity={0.2} color="#22c55e" />
      <spotLight position={[0, 15, 0]} angle={0.3} penumbra={1} intensity={0.4} color="#8b5cf6" />
      <Environment preset={config.environment as any} />
      {config.showStars && <Stars radius={50} depth={30} count={1000} factor={3} saturation={0.5} fade speed={0.5} />}
      <TerrainGrid />
      {config.showShadows && <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={20} blur={2} far={10} />}
      <OrbitControls
        enableDamping dampingFactor={0.05}
        minDistance={3} maxDistance={25}
        maxPolarAngle={Math.PI / 2.1}
        autoRotate={config.autoRotate} autoRotateSpeed={0.4}
      />

      {/* BARS MODE */}
      {viewMode === "bars" && fieldStats.map((field, i) => {
        const barHeight = Math.max(0.3, (field.totalResponses / maxResponses) * config.maxBarHeight);
        const xPos = (i - fieldStats.length / 2) * config.spacing;
        return (
          <AnimatedBar
            key={field.id} position={[xPos, 0, 0]}
            height={barHeight} color={getColor(field.completeness)}
            label={field.label} value={field.totalResponses}
            index={i} maxVal={maxResponses}
          />
        );
      })}

      {/* SCATTER MODE */}
      {viewMode === "scatter" && fieldStats.map((field, i) => {
        const x = (i - fieldStats.length / 2) * 1.5;
        const y = (field.completeness / 100) * config.maxBarHeight;
        const z = (field.uniqueValues / Math.max(...fieldStats.map(f => f.uniqueValues), 1)) * 3;
        const size = Math.max(0.15, (field.totalResponses / maxResponses) * 0.5);
        return (
          <DataSphere
            key={field.id} position={[x, y, z]} size={size}
            color={getColor(field.completeness)} label={field.label}
            value={field.totalResponses} pct={field.completeness}
          />
        );
      })}

      {/* HEATMAP MODE */}
      {viewMode === "heatmap" && fieldStats.map((field, i) => {
        const cols = Math.ceil(Math.sqrt(fieldStats.length));
        const row = Math.floor(i / cols);
        const col = i % cols;
        const x = (col - cols / 2) * 1.8;
        const z = (row - Math.ceil(fieldStats.length / cols) / 2) * 1.8;
        const height = Math.max(0.2, (field.completeness / 100) * config.maxBarHeight);
        const color = getColor(field.completeness);
        return (
          <group key={field.id}>
            <RoundedBox args={[1.5, height, 1.5]} radius={0.1} position={[x, height / 2, z]} castShadow>
              <meshPhysicalMaterial
                color={color} transparent opacity={0.85}
                metalness={0.2} roughness={0.4} clearcoat={0.5}
                emissive={color} emissiveIntensity={0.08}
              />
            </RoundedBox>
            <Float speed={1.5} floatIntensity={0.1}>
              <Text position={[x, height + 0.35, z]} fontSize={0.2} color="#ffffff" anchorX="center">
                {field.completeness.toFixed(0)}%
              </Text>
            </Float>
            <Text position={[x, -0.2, z]} fontSize={0.12} color="#888" anchorX="center" maxWidth={1.4}>
              {field.label.substring(0, 14)}
            </Text>
          </group>
        );
      })}

      {/* GPS SPATIAL MODE */}
      {viewMode === "gps" && gpsPoints.length > 0 && (() => {
        const lats = gpsPoints.map(p => p.lat);
        const lngs = gpsPoints.map(p => p.lng);
        const cLat = (Math.min(...lats) + Math.max(...lats)) / 2;
        const cLng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
        const spread = Math.max(Math.max(...lats) - Math.min(...lats), Math.max(...lngs) - Math.min(...lngs), 0.01);
        const scale = 10 / spread;

        return gpsPoints.map((pt, i) => {
          const x = (pt.lng - cLng) * scale;
          const z = -(pt.lat - cLat) * scale;
          const colors = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];
          const color = colors[i % colors.length];
          return (
            <GPSPin
              key={`gps-${i}`}
              position={[x, 0.2, z]}
              color={color}
              label={pt.userName}
              distance={`${pt.lat.toFixed(4)}, ${pt.lng.toFixed(4)}`}
            />
          );
        });
      })()}
    </>
  );
}

// ─── GPS Map Component (iframe Google Maps) ──────────────────────────────────

function GPSMapEmbed({ gpsPoints }: { gpsPoints: GPSPoint[] }) {
  const centerLat = gpsPoints.length > 0 ? gpsPoints.reduce((s, p) => s + p.lat, 0) / gpsPoints.length : 9.082;
  const centerLng = gpsPoints.length > 0 ? gpsPoints.reduce((s, p) => s + p.lng, 0) / gpsPoints.length : 8.6753;
  const zoom = gpsPoints.length > 0 ? 12 : 6;

  const src = `https://maps.google.com/maps?q=${centerLat},${centerLng}&z=${zoom}&output=embed&t=k`;

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-border/50" style={{ height: 420 }}>
      <iframe
        src={src}
        className="w-full h-full"
        style={{ border: 0 }}
        allowFullScreen
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        title="GPS Data Map"
      />
      {/* Overlay with GPS points list */}
      <div className="absolute top-3 right-3 bg-background/90 backdrop-blur-md rounded-lg border border-border/50 shadow-xl p-3 max-w-[220px] max-h-[300px] overflow-y-auto">
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">{gpsPoints.length} GPS Points</span>
        </div>
        {gpsPoints.slice(0, 20).map((pt, i) => (
          <div key={i} className="flex items-start gap-2 py-1.5 border-b border-border/30 last:border-0">
            <div className="w-2 h-2 rounded-full bg-primary mt-1 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-foreground truncate">{pt.userName}</p>
              <p className="text-[10px] text-muted-foreground">{pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}</p>
              {pt.accuracy && <p className="text-[9px] text-muted-foreground">±{pt.accuracy.toFixed(0)}m</p>}
            </div>
          </div>
        ))}
      </div>
      {/* Coordinates badge */}
      <div className="absolute bottom-3 left-3 bg-background/90 backdrop-blur-md rounded-lg border border-border/50 px-3 py-1.5">
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Compass className="h-3 w-3" />
          {centerLat.toFixed(4)}°N, {centerLng.toFixed(4)}°E
        </p>
      </div>
    </div>
  );
}

// ─── KPI Card ────────────────────────────────────────────────────────────────

function KPICard({ icon: Icon, label, value, subtitle, color, trend }: {
  icon: any; label: string; value: string | number; subtitle?: string;
  color: string; trend?: "up" | "down" | "stable";
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-card to-muted/20 p-3 transition-all hover:shadow-lg hover:border-primary/30 group">
      <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-10 group-hover:opacity-20 transition-opacity" style={{ background: color }} />
      <div className="flex items-start gap-2.5">
        <div className="p-2 rounded-lg shrink-0" style={{ background: `${color}15` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
          <div className="flex items-baseline gap-1.5">
            <p className="text-xl font-bold text-foreground">{value}</p>
            {trend && (
              <span className={`text-[10px] font-semibold ${trend === "up" ? "text-green-500" : trend === "down" ? "text-red-500" : "text-muted-foreground"}`}>
                {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
              </span>
            )}
          </div>
          {subtitle && <p className="text-[10px] text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface ARDataVisualization3DProps {
  realtimeKey?: number;
}

const ARDataVisualization3D = ({ realtimeKey = 0 }: ARDataVisualization3DProps) => {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [forms, setForms] = useState<any[]>([]);
  const [selectedForm, setSelectedForm] = useState("");
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Map<string, string>>(new Map());
  const [viewMode, setViewMode] = useState<"bars" | "scatter" | "heatmap" | "gps">("bars");
  const [config, setConfig] = useState<VisualizationConfig>(DEFAULT_CONFIG);
  const [showDesigner, setShowDesigner] = useState(false);
  const [activeTab, setActiveTab] = useState("3d");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const canvasContainerRef = useRef<HTMLDivElement>(null);

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
    supabase.from("form_submissions").select("id, data, created_at, user_id, status, within_geofence, location")
      .eq("form_id", selectedForm).order("created_at", { ascending: false }).limit(500)
      .then(({ data }) => {
        setSubmissions(data || []);
        const userIds = [...new Set((data || []).map(s => s.user_id))];
        if (userIds.length > 0) {
          supabase.from("profiles").select("user_id, first_name, last_name").in("user_id", userIds)
            .then(({ data: pData }) => {
              const m = new Map<string, string>();
              pData?.forEach(p => m.set(p.user_id, `${p.first_name} ${p.last_name}`));
              setProfiles(m);
            });
        }
      });
  }, [selectedForm, realtimeKey]);

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

  const gpsPoints = useMemo<GPSPoint[]>(() => {
    return submissions
      .filter(s => {
        const loc = s.location as any;
        return loc && loc.lat && loc.lng;
      })
      .map(s => {
        const loc = s.location as any;
        return {
          lat: loc.lat,
          lng: loc.lng,
          userId: s.user_id,
          userName: profiles.get(s.user_id) || "Unknown",
          submittedAt: s.created_at,
          accuracy: loc.accuracy,
          formName: forms.find(f => f.id === selectedForm)?.name,
        };
      });
  }, [submissions, profiles, forms, selectedForm]);

  const meta = useMemo<SubmissionMeta>(() => {
    const uniqueUsers = new Set(submissions.map(s => s.user_id));
    const geofenceOk = submissions.filter(s => s.within_geofence === true).length;
    const avgComp = fieldStats.length > 0 ? fieldStats.reduce((a, f) => a + f.completeness, 0) / fieldStats.length : 0;
    const sorted = [...submissions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const todayCount = submissions.filter(s => new Date(s.created_at) >= today).length;
    const weekCount = submissions.filter(s => new Date(s.created_at) >= weekAgo).length;
    const accuracies = gpsPoints.filter(p => p.accuracy).map(p => p.accuracy!);
    const avgAcc = accuracies.length > 0 ? accuracies.reduce((a, b) => a + b, 0) / accuracies.length : 0;

    return {
      totalSubmissions: submissions.length,
      avgCompletionRate: avgComp,
      geofenceCompliance: submissions.length > 0 ? (geofenceOk / submissions.length) * 100 : 0,
      uniqueEnumerators: uniqueUsers.size,
      gpsPoints: gpsPoints.length,
      avgAccuracy: avgAcc,
      submissionTrend: todayCount > (weekCount / 7) ? "up" : todayCount < (weekCount / 7) * 0.5 ? "down" : "stable",
      lastSubmissionTime: sorted[0]?.created_at || null,
      todayCount,
      thisWeekCount: weekCount,
    };
  }, [submissions, fieldStats, gpsPoints]);

  const toggleFullscreen = useCallback(() => {
    if (!canvasContainerRef.current) return;
    if (!document.fullscreenElement) {
      canvasContainerRef.current.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  const viewModes = [
    { id: "bars" as const, icon: BarChart3, label: "3D Bars" },
    { id: "scatter" as const, icon: Activity, label: "Scatter" },
    { id: "heatmap" as const, icon: Layers, label: "Heatmap" },
    { id: "gps" as const, icon: Navigation, label: "GPS Spatial" },
  ];

  return (
    <div className="space-y-4">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-r from-primary/5 via-card to-accent/5 p-5">
        <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-primary/5 blur-3xl" />
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
              <Box className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                3D AR Data Visualization
                <Badge variant="secondary" className="text-[10px] font-normal">
                  <Sparkles className="h-3 w-3 mr-1" />Interactive
                </Badge>
              </h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                Immersive 3D field data analysis with GPS spatial mapping
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedProject} onValueChange={v => { setSelectedProject(v === "__clear__" ? "" : v); setSelectedForm(""); }}>
              <SelectTrigger className="w-44 bg-background/80 backdrop-blur-sm"><SelectValue placeholder="Select Project" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__clear__">All Projects</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {forms.length > 0 && (
              <Select value={selectedForm} onValueChange={setSelectedForm}>
                <SelectTrigger className="w-44 bg-background/80 backdrop-blur-sm"><SelectValue placeholder="Select Form" /></SelectTrigger>
                <SelectContent>
                  {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
      </div>

      {/* ── KPI Dashboard ─────────────────────────────────────── */}
      {submissions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPICard icon={BarChart3} label="Submissions" value={meta.totalSubmissions} subtitle={`${meta.todayCount} today`} color="#3b82f6" trend={meta.submissionTrend} />
          <KPICard icon={TrendingUp} label="Completeness" value={`${meta.avgCompletionRate.toFixed(0)}%`} subtitle="Avg across fields" color="#22c55e" />
          <KPICard icon={Target} label="Geofence OK" value={`${meta.geofenceCompliance.toFixed(0)}%`} subtitle="Within boundary" color={meta.geofenceCompliance >= 80 ? "#22c55e" : "#ef4444"} />
          <KPICard icon={Users} label="Enumerators" value={meta.uniqueEnumerators} subtitle="Active collectors" color="#8b5cf6" />
          <KPICard icon={MapPin} label="GPS Points" value={meta.gpsPoints} subtitle={meta.avgAccuracy > 0 ? `±${meta.avgAccuracy.toFixed(0)}m avg` : "No accuracy data"} color="#f59e0b" />
          <KPICard icon={Clock} label="This Week" value={meta.thisWeekCount} subtitle={meta.lastSubmissionTime ? `Last: ${new Date(meta.lastSubmissionTime).toLocaleDateString()}` : "—"} color="#ec4899" />
        </div>
      )}

      {/* ── Main Content ──────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <TabsList className="bg-muted/50 backdrop-blur-sm">
            <TabsTrigger value="3d" className="gap-1.5"><Box className="h-3.5 w-3.5" />3D Scene</TabsTrigger>
            <TabsTrigger value="map" className="gap-1.5"><MapIcon className="h-3.5 w-3.5" />GPS Map</TabsTrigger>
            <TabsTrigger value="insights" className="gap-1.5"><Eye className="h-3.5 w-3.5" />Insights</TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 flex-wrap">
            {activeTab === "3d" && viewModes.map(m => (
              <Button key={m.id} variant={viewMode === m.id ? "default" : "outline"} size="sm"
                onClick={() => setViewMode(m.id)} className="text-xs h-8 gap-1.5">
                <m.icon className="h-3.5 w-3.5" />{m.label}
              </Button>
            ))}
            {activeTab === "3d" && (
              <>
                <Button variant="outline" size="sm" className="h-8" onClick={() => setShowDesigner(!showDesigner)}>
                  <Settings className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" className="h-8" onClick={toggleFullscreen}>
                  <Maximize2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* ── Design Panel ──────────────────────────────────── */}
        {showDesigner && activeTab === "3d" && (
          <div className="mt-3 border border-border/50 rounded-xl p-4 bg-gradient-to-r from-muted/30 to-muted/10 backdrop-blur-sm">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Bar Height</Label>
                <Slider value={[config.maxBarHeight]} min={2} max={10} step={0.5} onValueChange={([v]) => setConfig(c => ({ ...c, maxBarHeight: v }))} />
                <span className="text-[10px] text-muted-foreground">{config.maxBarHeight}</span>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Spacing</Label>
                <Slider value={[config.spacing]} min={0.8} max={3} step={0.1} onValueChange={([v]) => setConfig(c => ({ ...c, spacing: v }))} />
                <span className="text-[10px] text-muted-foreground">{config.spacing}</span>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Environment</Label>
                <Select value={config.environment} onValueChange={v => setConfig(c => ({ ...c, environment: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ENVIRONMENTS.map(e => <SelectItem key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Auto-rotate</Label>
                  <Switch checked={config.autoRotate} onCheckedChange={v => setConfig(c => ({ ...c, autoRotate: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Stars</Label>
                  <Switch checked={config.showStars} onCheckedChange={v => setConfig(c => ({ ...c, showStars: v }))} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Colors</Label>
                <div className="grid grid-cols-2 gap-1">
                  {(["high", "medium", "low", "critical"] as const).map(k => (
                    <div key={k} className="flex items-center gap-1">
                      <Input type="color" value={config.colors[k]} onChange={e => setConfig(c => ({ ...c, colors: { ...c.colors, [k]: e.target.value } }))} className="h-6 w-8 p-0.5 cursor-pointer" />
                      <span className="text-[9px] text-muted-foreground">{k === "high" ? "≥90" : k === "medium" ? "70+" : k === "low" ? "50+" : "<50"}</span>
                    </div>
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="text-[10px] h-6 w-full" onClick={() => setConfig(DEFAULT_CONFIG)}>
                  <RotateCcw className="h-3 w-3 mr-1" />Reset
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── 3D Scene ───────────────────────────────────────── */}
        <TabsContent value="3d" className="mt-3">
          <div ref={canvasContainerRef} className="relative rounded-xl overflow-hidden border border-border/50 bg-gradient-to-b from-[#0f172a] to-[#020617]" style={{ height: isFullscreen ? "100vh" : 500 }}>
            {fieldStats.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <div className="mx-auto w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Box className="h-10 w-10 text-primary/50" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Select a project and form</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Data will render as interactive 3D visualizations</p>
                  </div>
                </div>
              </div>
            ) : (
              <Canvas camera={{ position: [10, 7, 10], fov: 45 }} shadows>
                <Suspense fallback={null}>
                  <Scene3D fieldStats={fieldStats} viewMode={viewMode} config={config} gpsPoints={gpsPoints} />
                </Suspense>
              </Canvas>
            )}
            {/* Floating badges */}
            {fieldStats.length > 0 && (
              <>
                <div className="absolute top-3 left-3 flex items-center gap-2">
                  <Badge className="bg-background/80 backdrop-blur-sm text-foreground border border-border/50 text-[10px]">
                    <Signal className="h-3 w-3 mr-1 text-green-500" />Live
                  </Badge>
                  <Badge className="bg-background/80 backdrop-blur-sm text-foreground border border-border/50 text-[10px]">
                    {submissions.length} records
                  </Badge>
                </div>
                <div className="absolute bottom-3 left-3 bg-background/80 backdrop-blur-sm rounded-lg border border-border/50 px-3 py-2">
                  <div className="flex items-center gap-3 text-[10px]">
                    {Object.entries(config.colors).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-1">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: v }} />
                        <span className="text-muted-foreground">{k === "high" ? "≥90%" : k === "medium" ? "70-89%" : k === "low" ? "50-69%" : "<50%"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
            {/* Alert */}
            {fieldStats.filter(f => f.completeness < 50).length > 0 && (
              <div className="absolute top-3 right-3 bg-destructive/90 backdrop-blur-sm text-destructive-foreground rounded-lg px-3 py-1.5 text-[11px] flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" />
                {fieldStats.filter(f => f.completeness < 50).length} fields below 50%
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── GPS Map ─────────────────────────────────────────── */}
        <TabsContent value="map" className="mt-3">
          {gpsPoints.length === 0 ? (
            <div className="rounded-xl border border-border/50 bg-muted/30 flex items-center justify-center" style={{ height: 420 }}>
              <div className="text-center space-y-3">
                <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Globe className="h-8 w-8 text-primary/50" />
                </div>
                <p className="text-sm text-muted-foreground">No GPS data available</p>
                <p className="text-xs text-muted-foreground/60">Select a form with location-enabled submissions</p>
              </div>
            </div>
          ) : (
            <GPSMapEmbed gpsPoints={gpsPoints} />
          )}
        </TabsContent>

        {/* ── Insights Panel ──────────────────────────────────── */}
        <TabsContent value="insights" className="mt-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Field Quality Table */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />Field Quality Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  <div className="space-y-2">
                    {fieldStats.map(f => (
                      <div key={f.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: f.completeness >= 90 ? config.colors.high : f.completeness >= 70 ? config.colors.medium : f.completeness >= 50 ? config.colors.low : config.colors.critical }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{f.label}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Progress value={f.completeness} className="h-1.5 flex-1" />
                            <span className="text-[10px] text-muted-foreground font-mono w-10 text-right">{f.completeness.toFixed(0)}%</span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs font-bold text-foreground">{f.totalResponses}</p>
                          <p className="text-[9px] text-muted-foreground">{f.uniqueValues} unique</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* GPS Distribution */}
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />GPS Data Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px]">
                  {gpsPoints.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-8">No GPS data in selected form</p>
                  ) : (
                    <div className="space-y-2">
                      {/* Summary stats */}
                      <div className="grid grid-cols-3 gap-2 mb-3">
                        <div className="bg-muted/40 rounded-lg p-2 text-center">
                          <p className="text-lg font-bold text-foreground">{gpsPoints.length}</p>
                          <p className="text-[9px] text-muted-foreground">Total Points</p>
                        </div>
                        <div className="bg-muted/40 rounded-lg p-2 text-center">
                          <p className="text-lg font-bold text-foreground">{new Set(gpsPoints.map(p => p.userId)).size}</p>
                          <p className="text-[9px] text-muted-foreground">Collectors</p>
                        </div>
                        <div className="bg-muted/40 rounded-lg p-2 text-center">
                          <p className="text-lg font-bold text-foreground">
                            {meta.avgAccuracy > 0 ? `±${meta.avgAccuracy.toFixed(0)}m` : "—"}
                          </p>
                          <p className="text-[9px] text-muted-foreground">Avg Accuracy</p>
                        </div>
                      </div>
                      {/* Point list */}
                      {gpsPoints.slice(0, 30).map((pt, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors border-b border-border/20">
                          <Crosshair className="h-3 w-3 text-primary shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{pt.userName}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}</p>
                          </div>
                          <div className="text-right shrink-0">
                            {pt.accuracy && <p className="text-[10px] text-muted-foreground">±{pt.accuracy.toFixed(0)}m</p>}
                            <p className="text-[9px] text-muted-foreground">{new Date(pt.submittedAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ARDataVisualization3D;
