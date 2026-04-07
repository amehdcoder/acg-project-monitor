import { useState, useEffect, useRef, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Glasses, Play, Pause, RotateCcw,
  MapPin, Camera, FileText, Send, Award, Plus,
  Trash2, Save, Settings, Gamepad2, Users, Globe,
  Star, Trophy, Heart, Layers,
  Video, Upload, UserPlus, CheckCircle, ArrowRight,
  ClipboardList, Smartphone, Wifi, Shield,
  BookOpen, GraduationCap, Compass, Eye,
  Timer, Sparkles,
} from "lucide-react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, Float, RoundedBox, Sky, Stars } from "@react-three/drei";
import * as THREE from "three";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

// ========================
// 3D Scene Components (Enhanced)
// ========================

function EnhancedGround() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#3d7a3d" roughness={0.95} />
      </mesh>
      {/* Main dirt road */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[3, 40]} />
        <meshStandardMaterial color="#b8956a" roughness={1} />
      </mesh>
      {/* Cross path */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[25, 2]} />
        <meshStandardMaterial color="#a88555" roughness={1} />
      </mesh>
    </group>
  );
}

function NigerianHouse({ position, color, roofColor, scale = 1 }: { position: [number, number, number]; color: string; roofColor: string; scale?: number }) {
  return (
    <group position={position} scale={[scale, scale, scale]}>
      <RoundedBox args={[3.2, 2.2, 2.8]} radius={0.05} position={[0, 1.1, 0]} castShadow>
        <meshStandardMaterial color={color} roughness={0.85} />
      </RoundedBox>
      <mesh position={[0, 2.8, 0]} castShadow>
        <coneGeometry args={[2.8, 1.5, 4]} />
        <meshStandardMaterial color={roofColor} roughness={0.9} />
      </mesh>
      {/* Door */}
      <mesh position={[0, 0.65, 1.41]}>
        <planeGeometry args={[0.65, 1.3]} />
        <meshStandardMaterial color="#3d2b1f" />
      </mesh>
      {/* Windows */}
      <mesh position={[1, 1.3, 1.41]}>
        <planeGeometry args={[0.5, 0.5]} />
        <meshStandardMaterial color="#87CEEB" metalness={0.3} roughness={0.1} />
      </mesh>
      <mesh position={[-1, 1.3, 1.41]}>
        <planeGeometry args={[0.5, 0.5]} />
        <meshStandardMaterial color="#87CEEB" metalness={0.3} roughness={0.1} />
      </mesh>
      {/* Veranda posts */}
      <mesh position={[-1.2, 0.8, 1.6]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 1.6]} />
        <meshStandardMaterial color="#5c3a1e" />
      </mesh>
      <mesh position={[1.2, 0.8, 1.6]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 1.6]} />
        <meshStandardMaterial color="#5c3a1e" />
      </mesh>
    </group>
  );
}

function PalmTree({ position }: { position: [number, number, number] }) {
  const leavesRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (leavesRef.current) {
      leavesRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.6 + position[0]) * 0.04;
    }
  });
  return (
    <group position={position}>
      {/* Trunk */}
      <mesh position={[0, 2, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.2, 4]} />
        <meshStandardMaterial color="#8B6914" roughness={0.95} />
      </mesh>
      {/* Leaves */}
      <group ref={leavesRef} position={[0, 4.2, 0]}>
        {[0, 60, 120, 180, 240, 300].map((angle, i) => (
          <mesh key={i} position={[Math.cos(angle * Math.PI / 180) * 0.8, 0, Math.sin(angle * Math.PI / 180) * 0.8]}
                rotation={[0.6, angle * Math.PI / 180, 0]} castShadow>
            <planeGeometry args={[0.5, 2.5]} />
            <meshStandardMaterial color="#228B22" side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function BushTree({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ref.current) ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.4 + position[0]) * 0.02;
  });
  return (
    <group position={position}>
      <mesh position={[0, 1.3, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.16, 2.6]} />
        <meshStandardMaterial color="#5c3a1e" roughness={0.95} />
      </mesh>
      <mesh ref={ref} position={[0, 3.2, 0]} castShadow>
        <sphereGeometry args={[1.4, 12, 12]} />
        <meshStandardMaterial color="#2d6a1e" roughness={0.85} />
      </mesh>
      <mesh position={[0.5, 2.7, 0.4]} castShadow>
        <sphereGeometry args={[0.8, 10, 10]} />
        <meshStandardMaterial color="#3a8025" roughness={0.85} />
      </mesh>
    </group>
  );
}

function FieldWorkerNPC({ position, label, active, clothingColor = "#2563eb" }: { position: [number, number, number]; label: string; active: boolean; clothingColor?: string }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (groupRef.current && active) {
      groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2.5) * 0.05;
    }
  });
  return (
    <group ref={groupRef} position={position}>
      {/* Legs */}
      <mesh position={[-0.08, 0.25, 0]} castShadow>
        <capsuleGeometry args={[0.06, 0.3, 4, 8]} />
        <meshStandardMaterial color="#4a3728" />
      </mesh>
      <mesh position={[0.08, 0.25, 0]} castShadow>
        <capsuleGeometry args={[0.06, 0.3, 4, 8]} />
        <meshStandardMaterial color="#4a3728" />
      </mesh>
      {/* Body / shirt */}
      <mesh position={[0, 0.75, 0]} castShadow>
        <capsuleGeometry args={[0.2, 0.5, 6, 12]} />
        <meshStandardMaterial color={clothingColor} roughness={0.7} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.35, 0]} castShadow>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#8B6914" roughness={0.6} />
      </mesh>
      {/* Name tag */}
      <Text position={[0, 1.8, 0]} fontSize={0.13} color="#ffffff" anchorX="center" outlineWidth={0.012} outlineColor="#000000">
        {label}
      </Text>
      {/* Active speech indicator */}
      {active && (
        <Float speed={4} floatIntensity={0.15}>
          <Text position={[0.45, 1.6, 0]} fontSize={0.2} anchorX="left">💬</Text>
        </Float>
      )}
    </group>
  );
}

function TabletInHand({ position, glowing }: { position: [number, number, number]; glowing: boolean }) {
  return (
    <Float speed={1.2} floatIntensity={glowing ? 0.15 : 0}>
      <group position={position} rotation={[0.3, 0, 0]}>
        <RoundedBox args={[0.5, 0.7, 0.03]} radius={0.025} castShadow>
          <meshStandardMaterial color="#1a1a2e" metalness={0.85} roughness={0.15} />
        </RoundedBox>
        <mesh position={[0, 0, 0.016]}>
          <planeGeometry args={[0.44, 0.62]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive={glowing ? "#3b82f6" : "#ffffff"}
            emissiveIntensity={glowing ? 0.6 : 0.15}
          />
        </mesh>
        {/* Form lines on screen */}
        {glowing && [0.2, 0.1, 0, -0.1, -0.2].map((y, i) => (
          <mesh key={i} position={[0, y, 0.018]}>
            <planeGeometry args={[0.3, 0.02]} />
            <meshStandardMaterial color="#94a3b8" />
          </mesh>
        ))}
      </group>
    </Float>
  );
}

function GPSBeacon({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.position.y = position[1] + 0.6 + Math.sin(state.clock.elapsedTime * 2.5) * 0.3;
      ref.current.rotation.y = state.clock.elapsedTime * 1.5;
    }
    if (ringRef.current) {
      const scale = 1 + Math.sin(state.clock.elapsedTime * 3) * 0.3;
      ringRef.current.scale.set(scale, scale, 1);
      (ringRef.current.material as THREE.MeshStandardMaterial).opacity = 0.5 - Math.sin(state.clock.elapsedTime * 3) * 0.2;
    }
  });
  return (
    <group>
      <mesh ref={ref} position={position} castShadow>
        <coneGeometry args={[0.3, 0.6, 8]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} />
      </mesh>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]} position={[position[0], 0.03, position[2]]}>
        <ringGeometry args={[0.5, 0.8, 32]} />
        <meshStandardMaterial color="#ef4444" transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

function CameraDevice({ position }: { position: [number, number, number] }) {
  return (
    <Float speed={1.8} floatIntensity={0.2}>
      <group position={position}>
        <RoundedBox args={[0.5, 0.35, 0.3]} radius={0.05} castShadow>
          <meshStandardMaterial color="#1a1a2e" metalness={0.8} roughness={0.2} />
        </RoundedBox>
        <mesh position={[0.15, 0.05, 0.16]}>
          <cylinderGeometry args={[0.08, 0.08, 0.1, 16]} rotation={[Math.PI / 2, 0, 0]} />
          <meshStandardMaterial color="#333" metalness={0.9} />
        </mesh>
        {/* Flash */}
        <mesh position={[-0.15, 0.12, 0.16]}>
          <boxGeometry args={[0.06, 0.06, 0.02]} />
          <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.3} />
        </mesh>
      </group>
    </Float>
  );
}

function WaterBody({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ref.current) {
      (ref.current.material as THREE.MeshStandardMaterial).opacity = 0.55 + Math.sin(state.clock.elapsedTime) * 0.1;
    }
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={position} receiveShadow>
      <circleGeometry args={[2.5, 32]} />
      <meshStandardMaterial color="#3b82f6" transparent opacity={0.6} roughness={0.05} metalness={0.4} />
    </mesh>
  );
}

function ClinicBuilding({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <RoundedBox args={[8, 3, 5]} radius={0.1} position={[0, 1.5, 0]} castShadow>
        <meshStandardMaterial color="#e8e8e8" roughness={0.7} />
      </RoundedBox>
      <Text position={[0, 3.3, 2.51]} fontSize={0.3} color="#166534" anchorX="center" outlineWidth={0.015} outlineColor="#000">
        Primary Health Centre
      </Text>
      {/* Red cross */}
      <mesh position={[0, 2.2, 2.52]}>
        <planeGeometry args={[0.5, 0.15]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
      <mesh position={[0, 2.2, 2.52]}>
        <planeGeometry args={[0.15, 0.5]} />
        <meshStandardMaterial color="#ef4444" />
      </mesh>
      {/* Door */}
      <mesh position={[0, 0.8, 2.51]}>
        <planeGeometry args={[1, 1.6]} />
        <meshStandardMaterial color="#1e3a5f" />
      </mesh>
    </group>
  );
}

function SchoolBuilding({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <RoundedBox args={[10, 2.5, 4]} radius={0.1} position={[0, 1.25, 0]} castShadow>
        <meshStandardMaterial color="#fef3c7" roughness={0.75} />
      </RoundedBox>
      <Text position={[0, 2.8, 2.01]} fontSize={0.25} color="#1e40af" anchorX="center" outlineWidth={0.015} outlineColor="#000">
        Community Primary School
      </Text>
      {/* Blackboard inside visible through windows */}
      {[-2, 0, 2].map((x, i) => (
        <mesh key={i} position={[x, 1.5, 2.01]}>
          <planeGeometry args={[1.2, 0.8]} />
          <meshStandardMaterial color="#87CEEB" metalness={0.2} roughness={0.1} />
        </mesh>
      ))}
    </group>
  );
}

// Enhanced 3D scene
function EnhancedGameScene({ scenario, currentStep, score }: { scenario: GameScenario; currentStep: number; score: number }) {
  const step = scenario.steps[currentStep];
  const env = scenario.environment || "village";

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[18, 25, 12]} intensity={0.9} castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-camera-far={60}
        shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={20} shadow-camera-bottom={-20}
      />
      <pointLight position={[-8, 4, 6]} intensity={0.3} color="#fbbf24" />
      <hemisphereLight args={["#87CEEB", "#3d7a3d", 0.3]} />
      <Sky sunPosition={[120, 30, 100]} turbidity={2.5} rayleigh={0.4} />
      <Stars radius={150} depth={60} count={800} fade speed={0.2} />
      <fog attach="fog" args={["#c5dde8", 30, 70]} />

      <EnhancedGround />

      {/* Village environment */}
      {env === "village" && (
        <>
          <NigerianHouse position={[-7, 0, -5]} color="#CD853F" roofColor="#8B4513" />
          <NigerianHouse position={[7, 0, -7]} color="#DEB887" roofColor="#654321" />
          <NigerianHouse position={[-6, 0, 7]} color="#D2691E" roofColor="#8B4513" scale={0.9} />
          <NigerianHouse position={[9, 0, 5]} color="#DAA520" roofColor="#654321" scale={0.85} />
          <NigerianHouse position={[-10, 0, 0]} color="#C4A35A" roofColor="#5C3317" scale={0.75} />
          <PalmTree position={[-12, 0, -3]} />
          <PalmTree position={[12, 0, 4]} />
          <BushTree position={[-4, 0, -12]} />
          <BushTree position={[5, 0, 12]} />
          <BushTree position={[14, 0, -9]} />
          <BushTree position={[-14, 0, 9]} />
          <WaterBody position={[-12, 0.02, 10]} />
        </>
      )}
      {env === "clinic" && (
        <>
          <ClinicBuilding position={[0, 0, -6]} />
          <PalmTree position={[-6, 0, -3]} />
          <PalmTree position={[6, 0, -3]} />
          <BushTree position={[-8, 0, 5]} />
          <BushTree position={[8, 0, 5]} />
        </>
      )}
      {env === "school" && (
        <>
          <SchoolBuilding position={[0, 0, -6]} />
          <PalmTree position={[-7, 0, 0]} />
          <PalmTree position={[7, 0, 0]} />
        </>
      )}
      {env === "urban" && (
        <>
          <NigerianHouse position={[-5, 0, -4]} color="#b0b0b0" roofColor="#555" scale={1.2} />
          <NigerianHouse position={[6, 0, -6]} color="#9a9a9a" roofColor="#444" scale={1.3} />
          <NigerianHouse position={[-7, 0, 5]} color="#a0a0a0" roofColor="#666" />
          <PalmTree position={[10, 0, 0]} />
        </>
      )}

      {/* NPCs */}
      {step?.npcName && <FieldWorkerNPC position={[0, 0, -2]} label={step.npcName} active={true} clothingColor="#16a34a" />}
      <FieldWorkerNPC position={[-2.5, 0, 1.5]} label="Data Collector" active={step?.category === "form"} clothingColor="#2563eb" />
      <FieldWorkerNPC position={[3, 0, -1]} label="Supervisor" active={step?.category === "submission"} clothingColor="#7c3aed" />

      {/* Context objects */}
      {(step?.category === "form" || step?.category === "navigation") && (
        <TabletInHand position={[1.5, 1.3, 0.6]} glowing={step?.category === "form"} />
      )}
      {step?.category === "gps" && <GPSBeacon position={[0, 0, 0]} />}
      {step?.category === "media" && <CameraDevice position={[2.5, 2, 1.2]} />}

      {/* Floating HUD */}
      <Float speed={0.6} floatIntensity={0.1}>
        <Text position={[0, 7, -14]} fontSize={0.6} color="#fbbf24" anchorX="center"
              outlineWidth={0.025} outlineColor="#000" font={undefined}>
          ⭐ {score} pts
        </Text>
      </Float>
      <Float speed={0.5} floatIntensity={0.08}>
        <Text position={[0, 6, -14]} fontSize={0.35} color="#ffffff" anchorX="center"
              outlineWidth={0.02} outlineColor="#000">
          Step {currentStep + 1} / {scenario.steps.length}
        </Text>
      </Float>

      <OrbitControls enableDamping dampingFactor={0.06} autoRotate autoRotateSpeed={0.15}
        minDistance={5} maxDistance={28} maxPolarAngle={Math.PI / 2.1} target={[0, 1.2, 0]} />
    </>
  );
}

// ========================
// Types
// ========================

interface GameStep {
  id: string;
  title: string;
  description: string;
  instruction: string;
  category: "navigation" | "form" | "gps" | "media" | "submission" | "interaction";
  duration: number;
  points: number;
  npcName?: string;
  quizQuestion?: string;
  quizOptions?: string[];
  quizAnswer?: number;
}

interface GameScenario {
  id: string;
  name: string;
  description: string;
  environment: "village" | "urban" | "clinic" | "school";
  difficulty: "beginner" | "intermediate" | "advanced";
  steps: GameStep[];
  maxScore: number;
  timeLimit?: number;
  simulationType?: "vr_3d" | "video";
  videoUrl?: string;
  formId?: string;
  projectId?: string;
  dbId?: string;
}

interface UserProfile {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  designation: string;
}

// ========================
// Form Simulation Component
// ========================

interface FormSimulationProps {
  step: GameStep;
  onComplete: () => void;
  stepIndex: number;
  totalSteps: number;
}

const FormSimulationPanel = ({ step, onComplete, stepIndex, totalSteps }: FormSimulationProps) => {
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [gpsAcquired, setGpsAcquired] = useState(false);
  const [gpsAccuracy, setGpsAccuracy] = useState(0);
  const [photoTaken, setPhotoTaken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Simulate GPS acquisition
  useEffect(() => {
    if (step.category === "gps") {
      setGpsAcquired(false);
      setGpsAccuracy(0);
      const interval = setInterval(() => {
        setGpsAccuracy(prev => {
          const next = prev + Math.random() * 15 + 5;
          if (next >= 100) {
            setGpsAcquired(true);
            clearInterval(interval);
            return 100;
          }
          return next;
        });
      }, 400);
      return () => clearInterval(interval);
    }
  }, [step.category, step.id]);

  const getCategoryConfig = (cat: string) => {
    const configs: Record<string, { icon: React.ReactNode; color: string; bgClass: string; label: string }> = {
      navigation: { icon: <Compass className="h-4 w-4" />, color: "text-blue-400", bgClass: "bg-blue-500/10 border-blue-500/20", label: "Navigation" },
      form: { icon: <ClipboardList className="h-4 w-4" />, color: "text-emerald-400", bgClass: "bg-emerald-500/10 border-emerald-500/20", label: "Form Filling" },
      gps: { icon: <MapPin className="h-4 w-4" />, color: "text-amber-400", bgClass: "bg-amber-500/10 border-amber-500/20", label: "GPS Capture" },
      media: { icon: <Camera className="h-4 w-4" />, color: "text-purple-400", bgClass: "bg-purple-500/10 border-purple-500/20", label: "Media Capture" },
      submission: { icon: <Send className="h-4 w-4" />, color: "text-orange-400", bgClass: "bg-orange-500/10 border-orange-500/20", label: "Submission" },
      interaction: { icon: <Users className="h-4 w-4" />, color: "text-pink-400", bgClass: "bg-pink-500/10 border-pink-500/20", label: "Interaction" },
    };
    return configs[cat] || configs.navigation;
  };

  const config = getCategoryConfig(step.category);

  const renderSimulation = () => {
    switch (step.category) {
      case "form":
        return (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Smartphone className="h-4 w-4 text-primary" />
                <span>Simulated Form View</span>
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Respondent Name <span className="text-destructive">*</span></Label>
                  <Input placeholder="Enter full name..." value={formValues.name || ""} onChange={e => setFormValues(p => ({ ...p, name: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Age <span className="text-destructive">*</span></Label>
                  <Input type="number" placeholder="Age in years" value={formValues.age || ""} onChange={e => setFormValues(p => ({ ...p, age: e.target.value }))} className="h-9 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Sex</Label>
                  <RadioGroup value={formValues.sex || ""} onValueChange={v => setFormValues(p => ({ ...p, sex: v }))}>
                    <div className="flex gap-4">
                      <div className="flex items-center gap-1.5">
                        <RadioGroupItem value="male" id="sim-male" />
                        <Label htmlFor="sim-male" className="text-xs">Male</Label>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <RadioGroupItem value="female" id="sim-female" />
                        <Label htmlFor="sim-female" className="text-xs">Female</Label>
                      </div>
                    </div>
                  </RadioGroup>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Observations</Label>
                  <Textarea placeholder="Field notes..." value={formValues.notes || ""} onChange={e => setFormValues(p => ({ ...p, notes: e.target.value }))} rows={2} className="text-sm" />
                </div>
              </div>
            </div>
          </div>
        );

      case "gps":
        return (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
                <MapPin className="h-4 w-4 text-amber-500" />
                <span>GPS Acquisition</span>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Signal Lock</span>
                  <Badge variant={gpsAcquired ? "default" : "secondary"} className="text-[10px]">
                    {gpsAcquired ? "✓ Locked" : "Acquiring..."}
                  </Badge>
                </div>
                <Progress value={gpsAccuracy} className="h-2.5" />
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-muted/50 p-2">
                    <span className="text-muted-foreground">Latitude</span>
                    <p className="font-mono font-medium">{gpsAcquired ? "9.0579° N" : "---"}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <span className="text-muted-foreground">Longitude</span>
                    <p className="font-mono font-medium">{gpsAcquired ? "7.4951° E" : "---"}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <span className="text-muted-foreground">Accuracy</span>
                    <p className="font-mono font-medium">{gpsAcquired ? "±6m" : `±${Math.round(100 - gpsAccuracy)}m`}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2">
                    <span className="text-muted-foreground">Altitude</span>
                    <p className="font-mono font-medium">{gpsAcquired ? "482m" : "---"}</p>
                  </div>
                </div>
                {gpsAcquired && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">GPS location captured within acceptable accuracy</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case "media":
        return (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
                <Camera className="h-4 w-4 text-purple-500" />
                <span>Photo Capture</span>
              </div>
              {!photoTaken ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-full h-36 rounded-lg bg-gradient-to-b from-muted/30 to-muted/60 border-2 border-dashed border-border flex items-center justify-center">
                    <div className="text-center">
                      <Camera className="h-8 w-8 mx-auto text-muted-foreground mb-1" />
                      <p className="text-xs text-muted-foreground">Camera viewfinder</p>
                    </div>
                  </div>
                  <Button size="sm" className="w-full" onClick={() => setPhotoTaken(true)}>
                    <Camera className="h-3.5 w-3.5 mr-1.5" />Capture Photo
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="w-full h-36 rounded-lg bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border border-emerald-500/30 flex items-center justify-center">
                    <div className="text-center">
                      <CheckCircle className="h-8 w-8 mx-auto text-emerald-500 mb-1" />
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">Photo captured</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[10px] text-muted-foreground">
                    <div className="rounded bg-muted/50 p-1 text-center">GPS Embedded ✓</div>
                    <div className="rounded bg-muted/50 p-1 text-center">Timestamp ✓</div>
                    <div className="rounded bg-muted/50 p-1 text-center">2.4 MB</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case "submission":
        return (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-3">
                <Send className="h-4 w-4 text-orange-500" />
                <span>Form Submission</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-xs">
                  <span className="text-muted-foreground">Connection</span>
                  <div className="flex items-center gap-1.5">
                    <Wifi className="h-3 w-3 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400">Online</span>
                  </div>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-xs">
                  <span className="text-muted-foreground">Validation</span>
                  <Badge variant="default" className="text-[10px]">All Passed ✓</Badge>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-muted/50 text-xs">
                  <span className="text-muted-foreground">Attachments</span>
                  <span>1 photo, 1 GPS point</span>
                </div>
                {!isSubmitting ? (
                  <Button size="sm" className="w-full mt-2" onClick={() => {
                    setIsSubmitting(true);
                    setTimeout(() => setIsSubmitting(false), 2000);
                  }}>
                    <Send className="h-3.5 w-3.5 mr-1.5" />Submit Form
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 mt-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500 animate-pulse" />
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">Submitted & synced successfully!</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground mb-2">
              {config.icon}
              <span>{config.label}</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{step.instruction}</p>
            {step.npcName && (
              <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                  <Users className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-medium">{step.npcName}</p>
                  <p className="text-[10px] text-muted-foreground">Speaking to you...</p>
                </div>
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="space-y-3">
      {/* Step header */}
      <div className={`rounded-xl border p-3 ${config.bgClass}`}>
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className={config.color}>{config.icon}</span>
            <h4 className="text-sm font-semibold text-foreground">{step.title}</h4>
          </div>
          <Badge variant="outline" className="text-[10px]">+{step.points} pts</Badge>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{step.instruction}</p>
      </div>

      {/* Interactive simulation */}
      {renderSimulation()}

      {/* Complete button */}
      <Button onClick={onComplete} className="w-full" size="sm">
        {stepIndex < totalSteps - 1 ? (
          <>Complete & Next <ArrowRight className="h-3.5 w-3.5 ml-1.5" /></>
        ) : (
          <>Finish Training <Award className="h-3.5 w-3.5 ml-1.5" /></>
        )}
      </Button>
    </div>
  );
};

// ========================
// Scenario Cards
// ========================

const ScenarioCard = ({ scenario, onStart, isAdmin, onEdit, onAccess, onDelete }: {
  scenario: GameScenario; onStart: () => void; isAdmin: boolean;
  onEdit?: () => void; onAccess?: () => void; onDelete?: () => void;
}) => {
  const difficultyConfig = {
    beginner: { color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20", label: "Beginner" },
    intermediate: { color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20", label: "Intermediate" },
    advanced: { color: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20", label: "Advanced" },
  };
  const diff = difficultyConfig[scenario.difficulty];
  const envIcons: Record<string, React.ReactNode> = {
    village: <span>🏘️</span>, urban: <span>🏙️</span>, clinic: <span>🏥</span>, school: <span>🏫</span>,
  };

  return (
    <Card className="group overflow-hidden border-border/50 hover:border-primary/30 hover:shadow-lg transition-all duration-300">
      {/* Top accent bar */}
      <div className="h-1 bg-gradient-to-r from-primary to-primary/50" />
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg">
              {envIcons[scenario.environment] || "🌍"}
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground">{scenario.name}</h3>
              <div className="flex items-center gap-1.5 mt-0.5">
                <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border ${diff.color}`}>{diff.label}</Badge>
                {scenario.simulationType === "video" ? (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0"><Video className="h-2.5 w-2.5 mr-0.5" />Video</Badge>
                ) : (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0"><Glasses className="h-2.5 w-2.5 mr-0.5" />3D VR</Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed">{scenario.description}</p>

        {/* Stats */}
        <div className="flex items-center gap-3 mb-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><Layers className="h-3 w-3" />{scenario.steps.length} steps</span>
          <span className="flex items-center gap-1"><Star className="h-3 w-3 text-amber-500" />{scenario.maxScore} pts</span>
          {scenario.timeLimit && <span className="flex items-center gap-1"><Timer className="h-3 w-3" />{Math.round(scenario.timeLimit / 60)}m</span>}
        </div>

        {/* Tags */}
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {scenario.formId && <Badge variant="secondary" className="text-[9px]"><FileText className="h-2.5 w-2.5 mr-0.5" />Form Linked</Badge>}
          {scenario.projectId && <Badge variant="secondary" className="text-[9px]"><Globe className="h-2.5 w-2.5 mr-0.5" />Project Linked</Badge>}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button className="flex-1" size="sm" onClick={onStart}>
            <Play className="h-3.5 w-3.5 mr-1.5" />Start Training
          </Button>
          {isAdmin && scenario.dbId && (
            <div className="flex gap-1">
              {onEdit && <Button variant="outline" size="icon" className="h-8 w-8" onClick={onEdit}><Settings className="h-3 w-3" /></Button>}
              {onAccess && <Button variant="outline" size="icon" className="h-8 w-8" onClick={onAccess}><UserPlus className="h-3 w-3" /></Button>}
              {onDelete && <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete}><Trash2 className="h-3 w-3 text-destructive" /></Button>}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// ========================
// Default Scenarios
// ========================

const DEFAULT_SCENARIOS: GameScenario[] = [
  {
    id: "community-survey",
    name: "Community Health Survey",
    description: "Conduct a household survey in a Nigerian village. Interview residents, capture GPS, take photos, and submit data accurately.",
    environment: "village",
    difficulty: "beginner",
    maxScore: 100,
    timeLimit: 600,
    simulationType: "vr_3d",
    steps: [
      { id: "arrive", title: "Arrive at Village", description: "Navigate to the assigned community", instruction: "You've arrived at the village. The community leader (Baale) is waiting at his compound. Always greet elders first before starting any data collection.", category: "navigation", duration: 5, points: 5, npcName: "Chief Adamu" },
      { id: "greet", title: "Greet Community Leader", description: "Introduce yourself and get consent", instruction: "Approach the community leader. Show your ID badge and letter of introduction. Explain the survey purpose clearly in the local language. Request verbal consent before proceeding.", category: "interaction", duration: 8, points: 10, npcName: "Chief Adamu", quizQuestion: "What should you do FIRST when arriving at a Nigerian community?", quizOptions: ["Start collecting data immediately", "Greet the community leader and explain your purpose", "Take photos of everything", "Set up your equipment"], quizAnswer: 1 },
      { id: "check-gps", title: "Capture GPS Location", description: "Record accurate GPS coordinates", instruction: "Open the app and wait for GPS lock. Stand in an open area away from buildings and trees. Ensure accuracy is within 10 meters before recording.", category: "gps", duration: 10, points: 15, quizQuestion: "What GPS accuracy level should you achieve?", quizOptions: ["Within 100m", "Within 50m", "Within 10m or better", "Doesn't matter"], quizAnswer: 2 },
      { id: "open-form", title: "Open Survey Form", description: "Select and load the assigned form", instruction: "Navigate to Forms → Fill Form. Select the correct household survey form. Verify you have the latest form version before beginning.", category: "form", duration: 5, points: 10 },
      { id: "interview", title: "Conduct Household Interview", description: "Interview the household head", instruction: "Ask each question clearly in the local language. Record responses accurately in the form. For sensitive questions like income, ensure privacy. Never influence responses.", category: "form", duration: 15, points: 20, npcName: "Mrs. Fatima", quizQuestion: "If a respondent doesn't understand a question?", quizOptions: ["Skip it", "Answer it yourself", "Rephrase clearly in local language", "Mark as N/A"], quizAnswer: 2 },
      { id: "photo", title: "Capture Photo Evidence", description: "Photograph the household with consent", instruction: "Take a clear, well-lit photo of the household structure. GPS metadata will be embedded automatically. ALWAYS get verbal consent before photographing.", category: "media", duration: 8, points: 15 },
      { id: "review", title: "Review All Data", description: "Quality-check every field before submission", instruction: "Scroll through the entire form. Check all required fields are filled. Verify GPS point, photo attachment, and numeric entries make sense. Fix any validation errors.", category: "form", duration: 8, points: 10, quizQuestion: "Why should you review before submitting?", quizOptions: ["To waste time", "To catch errors and missing data", "Not important at all", "To impress your supervisor"], quizAnswer: 1 },
      { id: "submit", title: "Submit Completed Form", description: "Finalize and sync the data", instruction: "Tap 'Submit Form'. If you're offline, the data saves locally and auto-syncs when connectivity returns. Verify the submission appears in your history.", category: "submission", duration: 5, points: 15 },
    ],
  },
  {
    id: "ntd-mda",
    name: "NTD Mass Drug Administration",
    description: "Simulate a Community-Directed Distribution exercise for NTD treatment using Ivermectin dose poles in a rural Nigerian community.",
    environment: "village",
    difficulty: "intermediate",
    maxScore: 120,
    timeLimit: 900,
    simulationType: "vr_3d",
    steps: [
      { id: "setup", title: "Set Up Distribution Point", description: "Prepare the treatment area", instruction: "Set up near the community leader's compound in a shaded area. Lay out the dose pole, drug register, treatment supplies, and clean drinking water.", category: "navigation", duration: 5, points: 10, npcName: "CDD Binta" },
      { id: "measure", title: "Measure with Dose Pole", description: "Use the Ivermectin dose pole correctly", instruction: "Have each person stand barefoot against the dose pole. Read the color band at shoulder height to determine the correct dosage. Record the band color.", category: "interaction", duration: 10, points: 15, npcName: "Alhaji Musa", quizQuestion: "Who should NOT receive Ivermectin?", quizOptions: ["Adult males", "Pregnant women & children under 90cm", "Elderly people aged 60+", "People who've eaten recently"], quizAnswer: 1 },
      { id: "record-gps", title: "Record Distribution Point GPS", description: "Capture exact location for coverage mapping", instruction: "Record the GPS coordinates of this distribution point. This data helps map geographic treatment coverage and identify unreached areas.", category: "gps", duration: 5, points: 10 },
      { id: "treat", title: "Administer Treatment", description: "Give correct tablets and observe swallowing", instruction: "Give the correct number of tablets per the dose pole reading. Watch the person swallow with water. Record: full name, age, sex, dose given, and any previous reactions.", category: "form", duration: 15, points: 20, npcName: "Patient Aminu" },
      { id: "handle-refusal", title: "Handle Treatment Refusal", description: "Document refusal with reason", instruction: "Mrs. Khadija refuses treatment due to rumors. Explain the benefits calmly and respectfully. If she still refuses, RECORD the refusal with her stated reason. NEVER force treatment.", category: "interaction", duration: 10, points: 15, npcName: "Mrs. Khadija", quizQuestion: "What to do when someone refuses treatment?", quizOptions: ["Force them to take it", "Record refusal and reason, respect their choice", "Skip without recording anything", "Report them to police"], quizAnswer: 1 },
      { id: "adverse", title: "Report Adverse Reaction", description: "Document and manage side effects", instruction: "A community member reports dizziness, mild rash, and nausea after treatment. Record the adverse event with severity and onset time. Advise rest and fluids. If severe, refer to the nearest health facility immediately.", category: "form", duration: 10, points: 20, quizQuestion: "First step when someone reports side effects?", quizOptions: ["Ignore — it's normal", "Record event details and assess severity", "Give more medicine to counteract", "Tell them to go home and rest"], quizAnswer: 1 },
      { id: "summary", title: "End-of-Day Summary Report", description: "Submit daily treatment summary", instruction: "Count total: treated, refused, and adverse events. Reconcile drug supply with treatments given. Submit the summary form with GPS. Ensure all data is synced before leaving.", category: "submission", duration: 10, points: 15 },
    ],
  },
  {
    id: "trachoma-survey",
    name: "Trachoma Prevalence Survey",
    description: "Conduct a trachoma eye examination survey in a school setting, using WHO simplified grading system for clinical signs.",
    environment: "school",
    difficulty: "advanced",
    maxScore: 130,
    timeLimit: 1200,
    simulationType: "vr_3d",
    steps: [
      { id: "setup-school", title: "Set Up at School", description: "Prepare examination area", instruction: "Set up your examination station in a well-lit area of the school compound. Prepare: torch/magnifying loupe, hand sanitizer, examination gloves, and your tablet with the survey form loaded.", category: "navigation", duration: 5, points: 10, npcName: "Teacher Halima" },
      { id: "consent", title: "Obtain Parental Consent", description: "Verify consent forms", instruction: "Check that signed parental consent forms are available for each child. The teacher has collected these in advance. Verify names match the class register.", category: "interaction", duration: 8, points: 10, npcName: "Teacher Halima" },
      { id: "gps-school", title: "Record School GPS", description: "Capture school coordinates", instruction: "Record the GPS location of the school. This is critical for mapping trachoma prevalence geographically and planning interventions.", category: "gps", duration: 5, points: 10 },
      { id: "examine", title: "Examine Eyes — WHO Grading", description: "Grade each child using WHO system", instruction: "Evert the upper eyelid. Use the torch and loupe to examine. Grade using WHO simplified system: TF (Trachomatous Inflammation-Follicular), TI (Intense), TS (Scarring), TT (Trichiasis), CO (Corneal Opacity). Record both eyes.", category: "form", duration: 20, points: 25, npcName: "Student Aisha", quizQuestion: "What does TF stand for in WHO trachoma grading?", quizOptions: ["Trachoma Final", "Trachomatous Inflammation-Follicular", "Total Follicle count", "Trachoma-Free"], quizAnswer: 1 },
      { id: "photo-eye", title: "Capture Clinical Photos", description: "Photograph clinical findings", instruction: "For positive cases, take a close-up photo of the everted eyelid showing clinical signs. Ensure good lighting and focus. The photo will be reviewed by an ophthalmologist for quality assurance.", category: "media", duration: 10, points: 15 },
      { id: "refer", title: "Refer TT Cases", description: "Manage surgical referrals", instruction: "Child Musa shows signs of TT (Trichiasis) with lashes touching the cornea. Issue a referral slip to the nearest eye care facility. Record the referral in the form and inform the teacher.", category: "form", duration: 10, points: 20, npcName: "Student Musa" },
      { id: "wash-hands", title: "Infection Control", description: "Follow hygiene protocol between examinations", instruction: "Sanitize hands between each child. Change gloves if contaminated. Clean the torch lens. These steps prevent cross-contamination of trachoma infection between children.", category: "interaction", duration: 5, points: 10, quizQuestion: "Why sanitize between examinations?", quizOptions: ["Hospital policy only", "Prevent cross-contamination of infection", "Save time later", "Not actually necessary"], quizAnswer: 1 },
      { id: "daily-summary", title: "Submit Survey Summary", description: "Complete and sync all data", instruction: "Review all examinations. Verify photo attachments and GPS. Count: total examined, TF positive, TI positive, TT cases referred. Submit the batch and ensure sync completes.", category: "submission", duration: 10, points: 15 },
    ],
  },
];

// ========================
// Main Component
// ========================

const VRTrainingGame = () => {
  const { user, isOwner, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("play");
  const [scenarios, setScenarios] = useState<GameScenario[]>(DEFAULT_SCENARIOS);
  const [selectedScenario, setSelectedScenario] = useState<GameScenario | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [score, setScore] = useState(0);
  const [timer, setTimer] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const [showQuiz, setShowQuiz] = useState(false);
  const [lives, setLives] = useState(3);

  // Scenario designer
  const [editingScenario, setEditingScenario] = useState<GameScenario | null>(null);

  // Access control
  const [showAccessDialog, setShowAccessDialog] = useState(false);
  const [accessSimulationId, setAccessSimulationId] = useState<string | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [grantedUserIds, setGrantedUserIds] = useState<string[]>([]);
  const [loadingAccess, setLoadingAccess] = useState(false);

  // Upload
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadType, setUploadType] = useState<"vr_3d" | "video">("video");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFormId, setUploadFormId] = useState<string>("");
  const [uploadProjectId, setUploadProjectId] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  // Forms & projects
  const [forms, setForms] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);

  // Load saved simulations
  useEffect(() => {
    if (!user) return;
    const loadSimulations = async () => {
      const { data } = await supabase.from("vr_simulations").select("*");
      if (data) {
        const dbScenarios: GameScenario[] = data.map((sim: any) => ({
          id: `db-${sim.id}`, dbId: sim.id, name: sim.name, description: sim.description || "",
          environment: (sim.scenario_data as any)?.environment || "village",
          difficulty: (sim.scenario_data as any)?.difficulty || "beginner",
          steps: (sim.scenario_data as any)?.steps || [], maxScore: (sim.scenario_data as any)?.maxScore || 0,
          simulationType: sim.simulation_type as "vr_3d" | "video", videoUrl: sim.video_url,
          formId: sim.form_id, projectId: sim.project_id,
        }));
        setScenarios([...DEFAULT_SCENARIOS, ...dbScenarios]);
      }
    };
    loadSimulations();
  }, [user]);

  // Load forms & projects
  useEffect(() => {
    if (!user || !isAdmin) return;
    const loadMeta = async () => {
      const [fRes, pRes] = await Promise.all([
        supabase.from("forms").select("id, name"),
        supabase.from("projects").select("id, name"),
      ]);
      if (fRes.data) setForms(fRes.data);
      if (pRes.data) setProjects(pRes.data);
    };
    loadMeta();
  }, [user, isAdmin]);

  // Timer
  useEffect(() => {
    if (!isPlaying || !selectedScenario) return;
    const interval = setInterval(() => setTimer(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isPlaying, selectedScenario]);

  const startScenario = (scenario: GameScenario) => {
    setSelectedScenario(scenario);
    setCurrentStep(0);
    setScore(0);
    setTimer(0);
    setCompletedSteps(new Set());
    setLives(3);
    setIsPlaying(true);
    setQuizAnswer(null);
    setShowQuiz(false);
  };

  const handleStepComplete = () => {
    if (!selectedScenario) return;
    const step = selectedScenario.steps[currentStep];
    if (!step) return;
    setScore(s => s + step.points);
    setCompletedSteps(prev => new Set([...prev, step.id]));
    if (step.quizQuestion && !showQuiz) { setShowQuiz(true); return; }
    if (currentStep < selectedScenario.steps.length - 1) {
      setCurrentStep(c => c + 1);
      setShowQuiz(false);
      setQuizAnswer(null);
    } else {
      setIsPlaying(false);
      toast({ title: "🏆 Training Complete!", description: `Score: ${score + step.points}/${selectedScenario.maxScore} | Time: ${formatTime(timer)}` });
    }
  };

  const handleQuizAnswer = (answerIdx: number) => {
    if (!selectedScenario) return;
    const step = selectedScenario.steps[currentStep];
    setQuizAnswer(answerIdx);
    if (answerIdx === step.quizAnswer) {
      setScore(s => s + 5);
      toast({ title: "✅ Correct!", description: "+5 bonus points" });
    } else {
      setLives(l => Math.max(0, l - 1));
      toast({ title: "❌ Incorrect", description: "Review this concept for the field", variant: "destructive" });
    }
    setTimeout(() => {
      if (currentStep < selectedScenario.steps.length - 1) {
        setCurrentStep(c => c + 1);
        setShowQuiz(false);
        setQuizAnswer(null);
      } else setIsPlaying(false);
    }, 1500);
  };

  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, "0")}`;

  const progress = selectedScenario
    ? ((currentStep + (completedSteps.has(selectedScenario.steps[currentStep]?.id) ? 1 : 0)) / selectedScenario.steps.length) * 100
    : 0;

  // Access Control
  const openAccessDialog = async (simDbId: string) => {
    setAccessSimulationId(simDbId);
    setLoadingAccess(true);
    setShowAccessDialog(true);
    const [usersRes, accessRes] = await Promise.all([
      supabase.from("profiles").select("user_id, email, first_name, last_name, designation"),
      supabase.from("vr_simulation_access").select("user_id").eq("simulation_id", simDbId),
    ]);
    if (usersRes.data) setAllUsers(usersRes.data as UserProfile[]);
    if (accessRes.data) setGrantedUserIds(accessRes.data.map((r: any) => r.user_id));
    setLoadingAccess(false);
  };

  const toggleUserAccess = async (userId: string) => {
    if (!accessSimulationId || !user) return;
    const hasAccess = grantedUserIds.includes(userId);
    if (hasAccess) {
      await supabase.from("vr_simulation_access").delete().eq("simulation_id", accessSimulationId).eq("user_id", userId);
      setGrantedUserIds(prev => prev.filter(id => id !== userId));
      toast({ title: "Access Revoked" });
    } else {
      await supabase.from("vr_simulation_access").insert({ simulation_id: accessSimulationId, user_id: userId, granted_by: user.id });
      setGrantedUserIds(prev => [...prev, userId]);
      toast({ title: "Access Granted" });
    }
  };

  // Upload
  const handleUploadSimulation = async () => {
    if (!user || !uploadName.trim()) return;
    setUploading(true);
    try {
      let videoUrl: string | null = null;
      if (uploadFile) {
        const ext = uploadFile.name.split(".").pop();
        const filePath = `${user.id}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("vr-simulations").upload(filePath, uploadFile);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from("vr-simulations").getPublicUrl(filePath);
        videoUrl = urlData.publicUrl;
      }
      const { data: inserted, error } = await supabase.from("vr_simulations").insert({
        name: uploadName, description: uploadDescription, simulation_type: uploadType,
        form_id: uploadFormId || null, project_id: uploadProjectId || null, video_url: videoUrl,
        scenario_data: { environment: "village", difficulty: "beginner", steps: [], maxScore: 0 } as unknown as Record<string, unknown>,
        created_by: user.id,
      } as any).select().single();
      if (error) throw error;
      const newScenario: GameScenario = {
        id: `db-${inserted.id}`, dbId: inserted.id, name: inserted.name, description: inserted.description || "",
        environment: "village", difficulty: "beginner", steps: [], maxScore: 0,
        simulationType: uploadType, videoUrl: videoUrl || undefined,
        formId: uploadFormId || undefined, projectId: uploadProjectId || undefined,
      };
      setScenarios(prev => [...prev, newScenario]);
      setShowUploadDialog(false);
      setUploadName(""); setUploadDescription(""); setUploadFile(null); setUploadFormId(""); setUploadProjectId("");
      toast({ title: "Simulation Uploaded", description: `"${uploadName}" is now available.` });
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    } finally { setUploading(false); }
  };

  // Scenario Designer
  const saveCustomScenario = async () => {
    if (!editingScenario || !user) return;
    const maxScore = editingScenario.steps.reduce((sum, s) => sum + s.points, 0);
    const updated = { ...editingScenario, maxScore };
    try {
      if (updated.dbId) {
        await supabase.from("vr_simulations").update({
          name: updated.name, description: updated.description, simulation_type: updated.simulationType || "vr_3d",
          scenario_data: { environment: updated.environment, difficulty: updated.difficulty, steps: JSON.parse(JSON.stringify(updated.steps)), maxScore } as unknown as Record<string, unknown>,
          form_id: updated.formId || null, project_id: updated.projectId || null,
        } as any).eq("id", updated.dbId);
      } else {
        const { data: inserted } = await supabase.from("vr_simulations").insert({
          name: updated.name, description: updated.description, simulation_type: updated.simulationType || "vr_3d",
          scenario_data: { environment: updated.environment, difficulty: updated.difficulty, steps: JSON.parse(JSON.stringify(updated.steps)), maxScore } as unknown as Record<string, unknown>,
          form_id: updated.formId || null, project_id: updated.projectId || null, created_by: user.id,
        } as any).select().single();
        if (inserted) { updated.dbId = inserted.id; updated.id = `db-${inserted.id}`; }
      }
      setScenarios(prev => {
        const idx = prev.findIndex(s => s.id === updated.id || (s.dbId && s.dbId === updated.dbId));
        if (idx >= 0) { const copy = [...prev]; copy[idx] = updated; return copy; }
        return [...prev, updated];
      });
      setEditingScenario(null);
      toast({ title: "Scenario Saved" });
    } catch (err: any) { toast({ title: "Save Failed", description: err.message, variant: "destructive" }); }
  };

  const addStep = () => {
    if (!editingScenario) return;
    setEditingScenario({ ...editingScenario, steps: [...editingScenario.steps, {
      id: `step-${Date.now()}`, title: "New Step", description: "", instruction: "Instructions...",
      category: "form", duration: 10, points: 10,
    }] });
  };

  const deleteStep = (stepId: string) => {
    if (!editingScenario) return;
    setEditingScenario({ ...editingScenario, steps: editingScenario.steps.filter(s => s.id !== stepId) });
  };

  const updateStep = (stepId: string, updates: Partial<GameStep>) => {
    if (!editingScenario) return;
    setEditingScenario({ ...editingScenario, steps: editingScenario.steps.map(s => s.id === stepId ? { ...s, ...updates } : s) });
  };

  const deleteSimulation = async (scenario: GameScenario) => {
    if (!scenario.dbId) return;
    const { error } = await supabase.from("vr_simulations").delete().eq("id", scenario.dbId);
    if (!error) {
      setScenarios(prev => prev.filter(s => s.id !== scenario.id));
      toast({ title: "Deleted" });
    }
  };

  const isVideoSimulation = selectedScenario?.simulationType === "video" && selectedScenario?.videoUrl;
  const dbScenarios = scenarios.filter(s => s.dbId);

  // ========================
  // Render
  // ========================

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[hsl(var(--primary))] via-[hsl(var(--primary)/0.85)] to-[hsl(262,83%,40%)] p-6 text-white">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48cGF0dGVybiBpZD0iZyIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSIgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIj48cGF0aCBkPSJNMCAwaDQwdjQwSDB6IiBmaWxsPSJub25lIi8+PHBhdGggZD0iTTAgMGg0MHY0MEgweiIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNnKSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIvPjwvc3ZnPg==')] opacity-50" />
        <div className="relative z-10">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center">
                <GraduationCap className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Field Training Simulator</h1>
                <p className="text-white/70 text-sm">Immersive 3D training for real-world data collection</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isAdmin && (
                <Button size="sm" variant="secondary" className="bg-white/15 border-white/20 text-white hover:bg-white/25" onClick={() => setShowUploadDialog(true)}>
                  <Upload className="h-3.5 w-3.5 mr-1.5" />Upload
                </Button>
              )}
              <Badge className="bg-white/15 text-white border-white/20">{scenarios.length} scenarios</Badge>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-3 mt-5">
            <div className="rounded-xl bg-white/10 backdrop-blur-sm p-3">
              <div className="flex items-center gap-1.5 text-white/60 text-[10px] uppercase tracking-wider mb-1">
                <Glasses className="h-3 w-3" />3D Scenarios
              </div>
              <p className="text-lg font-bold">{scenarios.filter(s => s.simulationType !== "video").length}</p>
            </div>
            <div className="rounded-xl bg-white/10 backdrop-blur-sm p-3">
              <div className="flex items-center gap-1.5 text-white/60 text-[10px] uppercase tracking-wider mb-1">
                <Video className="h-3 w-3" />Video Sims
              </div>
              <p className="text-lg font-bold">{scenarios.filter(s => s.simulationType === "video").length}</p>
            </div>
            <div className="rounded-xl bg-white/10 backdrop-blur-sm p-3">
              <div className="flex items-center gap-1.5 text-white/60 text-[10px] uppercase tracking-wider mb-1">
                <Layers className="h-3 w-3" />Total Steps
              </div>
              <p className="text-lg font-bold">{scenarios.reduce((s, sc) => s + sc.steps.length, 0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4 h-auto flex-wrap bg-muted/50 p-1 rounded-xl">
          <TabsTrigger value="play" className="rounded-lg data-[state=active]:shadow-sm gap-1.5">
            <Gamepad2 className="h-3.5 w-3.5" />Play
          </TabsTrigger>
          <TabsTrigger value="video" className="rounded-lg data-[state=active]:shadow-sm gap-1.5">
            <Video className="h-3.5 w-3.5" />Videos
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="design" className="rounded-lg data-[state=active]:shadow-sm gap-1.5">
              <Settings className="h-3.5 w-3.5" />Designer
            </TabsTrigger>
          )}
          {(isOwner || isAdmin) && (
            <TabsTrigger value="access" className="rounded-lg data-[state=active]:shadow-sm gap-1.5">
              <Shield className="h-3.5 w-3.5" />Access
            </TabsTrigger>
          )}
          <TabsTrigger value="leaderboard" className="rounded-lg data-[state=active]:shadow-sm gap-1.5">
            <Trophy className="h-3.5 w-3.5" />Leaderboard
          </TabsTrigger>
        </TabsList>

        {/* ============ PLAY TAB ============ */}
        <TabsContent value="play" className="space-y-4">
          {!selectedScenario ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Choose a Training Scenario
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {scenarios.filter(s => s.simulationType !== "video").map(scenario => (
                  <ScenarioCard
                    key={scenario.id}
                    scenario={scenario}
                    onStart={() => startScenario(scenario)}
                    isAdmin={isAdmin}
                    onEdit={scenario.dbId ? () => setEditingScenario(scenario) : undefined}
                    onAccess={scenario.dbId ? () => openAccessDialog(scenario.dbId!) : undefined}
                    onDelete={scenario.dbId ? () => deleteSimulation(scenario) : undefined}
                  />
                ))}
              </div>
            </>
          ) : isVideoSimulation ? (
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex items-center justify-between p-4 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Video className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">{selectedScenario.name}</span>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => { setSelectedScenario(null); setIsPlaying(false); }}>
                    <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Back
                  </Button>
                </div>
                <div className="bg-black">
                  <video ref={videoRef} src={selectedScenario.videoUrl} controls playsInline preload="auto"
                    controlsList="nodownload" crossOrigin="anonymous" className="w-full max-h-[500px]"
                    onError={(e) => {
                      const video = e.currentTarget;
                      toast({ title: "Video Error", description: video.error?.message || "Could not load video.", variant: "destructive" });
                    }}
                  />
                </div>
                <div className="p-4">
                  <p className="text-sm text-muted-foreground">{selectedScenario.description}</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Game HUD */}
              <div className="rounded-2xl bg-gradient-to-r from-muted/60 to-muted/30 border border-border/50 p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Gamepad2 className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">{selectedScenario.name}</p>
                        <p className="text-[10px] text-muted-foreground">Step {currentStep + 1} of {selectedScenario.steps.length}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {[...Array(3)].map((_, i) => (
                        <Heart key={i} className={`h-4 w-4 transition-colors ${i < lives ? "text-red-500 fill-red-500" : "text-muted-foreground/30"}`} />
                      ))}
                    </div>
                    <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">
                      <Star className="h-3 w-3 mr-1" />{score} pts
                    </Badge>
                    <Badge variant="outline" className="font-mono text-xs">
                      <Timer className="h-3 w-3 mr-1" />{formatTime(timer)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8" onClick={() => setIsPlaying(!isPlaying)}>
                      {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="outline" size="sm" className="h-8" onClick={() => { setSelectedScenario(null); setIsPlaying(false); }}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />Exit
                    </Button>
                  </div>
                </div>
                <Progress value={progress} className="h-1.5 mt-3" />
              </div>

              {/* Main game area: 3D + Form Simulation side by side */}
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {/* 3D Scene */}
                <div className="lg:col-span-3 rounded-2xl overflow-hidden border border-border/50 bg-black relative" style={{ minHeight: 420 }}>
                  <Canvas camera={{ position: [12, 9, 12], fov: 48 }} shadows
                    gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}>
                    <Suspense fallback={null}>
                      <EnhancedGameScene scenario={selectedScenario} currentStep={currentStep} score={score} />
                    </Suspense>
                  </Canvas>
                  {/* Overlay corner badges */}
                  <div className="absolute top-3 left-3">
                    <Badge className="bg-black/60 text-white backdrop-blur-sm border-0 text-[10px]">
                      <Eye className="h-3 w-3 mr-1" />3D View — Drag to Rotate
                    </Badge>
                  </div>
                  {isPlaying && (
                    <div className="absolute top-3 right-3">
                      <div className="bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-lg flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-white text-xs font-mono">LIVE</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Interactive Panel */}
                <div className="lg:col-span-2">
                  <ScrollArea className="h-[420px]">
                    <div className="pr-3 space-y-3">
                      {selectedScenario.steps[currentStep] && (
                        <>
                          {/* Quiz overlay */}
                          {showQuiz && selectedScenario.steps[currentStep].quizQuestion ? (
                            <Card className="border-amber-500/30 bg-amber-500/5">
                              <CardContent className="p-4 space-y-3">
                                <div className="flex items-center gap-2">
                                  <BookOpen className="h-4 w-4 text-amber-500" />
                                  <h4 className="text-sm font-semibold">Knowledge Check</h4>
                                </div>
                                <p className="text-sm font-medium">{selectedScenario.steps[currentStep].quizQuestion}</p>
                                <div className="space-y-2">
                                  {selectedScenario.steps[currentStep].quizOptions?.map((opt, idx) => (
                                    <Button
                                      key={idx}
                                      variant={quizAnswer === null ? "outline" : idx === selectedScenario.steps[currentStep].quizAnswer ? "default" : quizAnswer === idx ? "destructive" : "outline"}
                                      size="sm"
                                      className="w-full justify-start text-xs h-9"
                                      disabled={quizAnswer !== null}
                                      onClick={() => handleQuizAnswer(idx)}
                                    >
                                      <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold mr-2">
                                        {String.fromCharCode(65 + idx)}
                                      </span>
                                      {opt}
                                    </Button>
                                  ))}
                                </div>
                              </CardContent>
                            </Card>
                          ) : (
                            <FormSimulationPanel
                              step={selectedScenario.steps[currentStep]}
                              onComplete={handleStepComplete}
                              stepIndex={currentStep}
                              totalSteps={selectedScenario.steps.length}
                            />
                          )}
                        </>
                      )}

                      {/* Step progress dots */}
                      <div className="flex gap-1 pt-2">
                        {selectedScenario.steps.map((step, idx) => (
                          <button
                            key={step.id}
                            onClick={() => { setCurrentStep(idx); setShowQuiz(false); setQuizAnswer(null); }}
                            className={`flex-1 h-2 rounded-full transition-all cursor-pointer ${
                              completedSteps.has(step.id) ? "bg-primary" :
                              idx === currentStep ? "bg-primary/50 animate-pulse" : "bg-muted"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ============ VIDEO TAB ============ */}
        <TabsContent value="video" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Video className="h-4 w-4 text-primary" />Video Training Library
            </h2>
            {isAdmin && (
              <Button size="sm" onClick={() => { setUploadType("video"); setShowUploadDialog(true); }}>
                <Upload className="h-3.5 w-3.5 mr-1.5" />Upload Video
              </Button>
            )}
          </div>
          {scenarios.filter(s => s.simulationType === "video").length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-16 text-center">
                <Video className="h-14 w-14 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground font-medium">No video simulations uploaded yet</p>
                {isAdmin && <p className="text-xs text-muted-foreground mt-1">Upload field walkthrough videos for team training</p>}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scenarios.filter(s => s.simulationType === "video").map(scenario => (
                <ScenarioCard
                  key={scenario.id}
                  scenario={scenario}
                  onStart={() => startScenario(scenario)}
                  isAdmin={isAdmin}
                  onAccess={scenario.dbId ? () => openAccessDialog(scenario.dbId!) : undefined}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* ============ DESIGN TAB ============ */}
        {isAdmin && (
          <TabsContent value="design" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Settings className="h-4 w-4 text-primary" />Scenario Designer
              </h2>
              <Button size="sm" onClick={() => setEditingScenario({
                id: `new-${Date.now()}`, name: "New Training Scenario", description: "",
                environment: "village", difficulty: "beginner", steps: [], maxScore: 0, simulationType: "vr_3d",
              })}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />Create Scenario
              </Button>
            </div>
            {dbScenarios.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <Settings className="h-14 w-14 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground font-medium">No custom scenarios yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Create immersive training for your field teams</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {dbScenarios.map(scenario => (
                  <Card key={scenario.id} className="hover:shadow-sm transition-shadow">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          {scenario.simulationType === "video" ? <Video className="h-4 w-4 text-primary" /> : <Glasses className="h-4 w-4 text-primary" />}
                        </div>
                        <div>
                          <h4 className="text-sm font-medium">{scenario.name}</h4>
                          <p className="text-xs text-muted-foreground">{scenario.steps.length} steps · {scenario.difficulty} · {scenario.simulationType === "video" ? "Video" : "3D VR"}</p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => setEditingScenario(scenario)}>Edit</Button>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => openAccessDialog(scenario.dbId!)}><UserPlus className="h-3 w-3" /></Button>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => startScenario(scenario)}><Play className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteSimulation(scenario)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {/* ============ ACCESS TAB ============ */}
        {(isOwner || isAdmin) && (
          <TabsContent value="access" className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Shield className="h-4 w-4 text-primary" />Access Management
              </h2>
              <p className="text-xs text-muted-foreground mt-1">Control which users can access custom simulations. Default scenarios are available to all authenticated users.</p>
            </div>
            {dbScenarios.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center">
                  <Shield className="h-14 w-14 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Create simulations first to manage access</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {dbScenarios.map(scenario => (
                  <Card key={scenario.id}>
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                          {scenario.simulationType === "video" ? <Video className="h-4 w-4 text-primary" /> : <Glasses className="h-4 w-4 text-primary" />}
                        </div>
                        <div>
                          <h4 className="text-sm font-medium">{scenario.name}</h4>
                          <div className="flex gap-1.5 mt-0.5">
                            {scenario.formId && <Badge variant="secondary" className="text-[9px]">Form Linked</Badge>}
                            {scenario.projectId && <Badge variant="secondary" className="text-[9px]">Project Linked</Badge>}
                          </div>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => openAccessDialog(scenario.dbId!)}>
                        <UserPlus className="h-3.5 w-3.5 mr-1.5" />Manage
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}

        {/* ============ LEADERBOARD TAB ============ */}
        <TabsContent value="leaderboard">
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <Trophy className="h-14 w-14 mx-auto mb-3 text-amber-500/30" />
              <p className="text-sm font-medium text-muted-foreground">Leaderboard Coming Soon</p>
              <p className="text-xs text-muted-foreground mt-1">Complete training scenarios to appear on the leaderboard</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============ DIALOGS ============ */}

      {/* Scenario Editor */}
      <Dialog open={!!editingScenario} onOpenChange={(open) => { if (!open) setEditingScenario(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Settings className="h-4 w-4" />Scenario Designer</DialogTitle></DialogHeader>
          {editingScenario && (
            <ScrollArea className="max-h-[65vh] pr-4">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs">Name</Label><Input value={editingScenario.name} onChange={e => setEditingScenario({ ...editingScenario, name: e.target.value })} /></div>
                  <div>
                    <Label className="text-xs">Type</Label>
                    <Select value={editingScenario.simulationType || "vr_3d"} onValueChange={(v: any) => setEditingScenario({ ...editingScenario, simulationType: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="vr_3d">3D VR</SelectItem><SelectItem value="video">Video</SelectItem></SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Environment</Label>
                    <Select value={editingScenario.environment} onValueChange={(v: any) => setEditingScenario({ ...editingScenario, environment: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="village">🏘️ Village</SelectItem><SelectItem value="urban">🏙️ Urban</SelectItem>
                        <SelectItem value="clinic">🏥 Clinic</SelectItem><SelectItem value="school">🏫 School</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Difficulty</Label>
                    <Select value={editingScenario.difficulty} onValueChange={(v: any) => setEditingScenario({ ...editingScenario, difficulty: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem><SelectItem value="intermediate">Intermediate</SelectItem><SelectItem value="advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label className="text-xs">Description</Label><Textarea value={editingScenario.description} onChange={e => setEditingScenario({ ...editingScenario, description: e.target.value })} rows={2} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Link to Form</Label>
                    <Select value={editingScenario.formId || "none"} onValueChange={v => setEditingScenario({ ...editingScenario, formId: v === "none" ? undefined : v })}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent><SelectItem value="none">None</SelectItem>{forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Link to Project</Label>
                    <Select value={editingScenario.projectId || "none"} onValueChange={v => setEditingScenario({ ...editingScenario, projectId: v === "none" ? undefined : v })}>
                      <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent><SelectItem value="none">None</SelectItem>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>

                {editingScenario.simulationType !== "video" && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs font-semibold">Steps ({editingScenario.steps.length})</Label>
                      <Button size="sm" variant="outline" onClick={addStep}><Plus className="h-3 w-3 mr-1" />Add</Button>
                    </div>
                    {editingScenario.steps.map((step, idx) => (
                      <Card key={step.id} className="mb-2">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-[10px]">Step {idx + 1}</Badge>
                            <Button variant="ghost" size="sm" onClick={() => deleteStep(step.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                          </div>
                          <Input placeholder="Title" value={step.title} onChange={e => updateStep(step.id, { title: e.target.value })} className="text-xs" />
                          <Textarea placeholder="Instructions" value={step.instruction} onChange={e => updateStep(step.id, { instruction: e.target.value })} rows={2} className="text-xs" />
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <Label className="text-[10px]">Category</Label>
                              <Select value={step.category} onValueChange={(v: any) => updateStep(step.id, { category: v })}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>{["navigation", "form", "gps", "media", "submission", "interaction"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                            <div><Label className="text-[10px]">Duration (s)</Label><Input type="number" value={step.duration} onChange={e => updateStep(step.id, { duration: parseInt(e.target.value) || 5 })} className="h-7 text-xs" /></div>
                            <div><Label className="text-[10px]">Points</Label><Input type="number" value={step.points} onChange={e => updateStep(step.id, { points: parseInt(e.target.value) || 5 })} className="h-7 text-xs" /></div>
                          </div>
                          <Input placeholder="NPC Name (optional)" value={step.npcName || ""} onChange={e => updateStep(step.id, { npcName: e.target.value || undefined })} className="h-7 text-xs" />
                          <Input placeholder="Quiz Question (optional)" value={step.quizQuestion || ""} onChange={e => updateStep(step.id, { quizQuestion: e.target.value || undefined })} className="h-7 text-xs" />
                          {step.quizQuestion && (
                            <div className="space-y-1">
                              {[0, 1, 2, 3].map(i => (
                                <div key={i} className="flex items-center gap-1">
                                  <input type="radio" name={`quiz-${step.id}`} checked={step.quizAnswer === i} onChange={() => updateStep(step.id, { quizAnswer: i })} />
                                  <Input placeholder={`Option ${String.fromCharCode(65 + i)}`} value={step.quizOptions?.[i] || ""} onChange={e => { const opts = [...(step.quizOptions || ["", "", "", ""])]; opts[i] = e.target.value; updateStep(step.id, { quizOptions: opts }); }} className="h-6 text-[10px]" />
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingScenario(null)}>Cancel</Button>
            <Button onClick={saveCustomScenario}><Save className="h-3.5 w-3.5 mr-1.5" />Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Upload className="h-4 w-4" />Upload Simulation</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs">Name</Label><Input value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="e.g. Field Survey Walkthrough" /></div>
            <div><Label className="text-xs">Description</Label><Textarea value={uploadDescription} onChange={e => setUploadDescription(e.target.value)} rows={2} /></div>
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={uploadType} onValueChange={(v: any) => setUploadType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="video">Video</SelectItem><SelectItem value="vr_3d">3D VR</SelectItem></SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">Media File</Label><Input type="file" accept="video/*,.mp4,.webm,.mov" onChange={e => setUploadFile(e.target.files?.[0] || null)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Link to Form</Label>
                <Select value={uploadFormId || "none"} onValueChange={v => setUploadFormId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">None</SelectItem>{forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Link to Project</Label>
                <Select value={uploadProjectId || "none"} onValueChange={v => setUploadProjectId(v === "none" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">None</SelectItem>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>Cancel</Button>
            <Button onClick={handleUploadSimulation} disabled={uploading || !uploadName.trim()}>
              {uploading ? "Uploading..." : <><Upload className="h-3.5 w-3.5 mr-1.5" />Upload</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Access Dialog */}
      <Dialog open={showAccessDialog} onOpenChange={setShowAccessDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Shield className="h-4 w-4" />Manage Access</DialogTitle></DialogHeader>
          {loadingAccess ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading users...</p>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {allUsers.map(u => (
                  <div key={u.user_id} className="flex items-center justify-between p-3 rounded-xl border hover:bg-muted/30 transition-colors">
                    <div>
                      <p className="text-sm font-medium">{u.first_name} {u.last_name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[9px]">{u.designation}</Badge>
                      <Checkbox checked={grantedUserIds.includes(u.user_id)} onCheckedChange={() => toggleUserAccess(u.user_id)} />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAccessDialog(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VRTrainingGame;
