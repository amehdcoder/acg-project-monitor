import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Glasses, Play, Pause, SkipForward, RotateCcw, CheckCircle,
  MapPin, Camera, FileText, Send, ChevronRight, Award, Volume2, VolumeX,
} from "lucide-react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sky, Stars, Float, RoundedBox, Text } from "@react-three/drei";
import * as THREE from "three";

// ========================
// Realistic 3D Scene
// ========================

function GroundPlane() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow position={[0, -0.01, 0]}>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#4a7c59" roughness={1} />
      </mesh>
      {/* Dirt path */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[2.5, 30]} />
        <meshStandardMaterial color="#c4a882" roughness={0.95} />
      </mesh>
    </group>
  );
}

function RealisticHouse({ position, color, roofColor }: { position: [number, number, number]; color: string; roofColor: string }) {
  return (
    <group position={position}>
      {/* Walls */}
      <RoundedBox args={[3, 2, 2.5]} radius={0.04} position={[0, 1, 0]} castShadow receiveShadow>
        <meshStandardMaterial color={color} roughness={0.9} />
      </RoundedBox>
      {/* Roof */}
      <mesh position={[0, 2.5, 0]} rotation={[0, 0, 0]} castShadow>
        <coneGeometry args={[2.5, 1.5, 4]} />
        <meshStandardMaterial color={roofColor} roughness={0.85} />
      </mesh>
      {/* Door */}
      <mesh position={[0, 0.6, 1.26]}>
        <planeGeometry args={[0.7, 1.2]} />
        <meshStandardMaterial color="#5c3a1e" />
      </mesh>
      {/* Window */}
      <mesh position={[1, 1.2, 1.26]}>
        <planeGeometry args={[0.5, 0.5]} />
        <meshStandardMaterial color="#87ceeb" metalness={0.3} roughness={0.1} />
      </mesh>
      {/* Foundation */}
      <mesh position={[0, 0.05, 0]} receiveShadow>
        <boxGeometry args={[3.3, 0.1, 2.8]} />
        <meshStandardMaterial color="#8B8682" roughness={1} />
      </mesh>
    </group>
  );
}

function RealisticTree({ position, scale = 1 }: { position: [number, number, number]; scale?: number }) {
  const leavesRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (leavesRef.current) {
      leavesRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5 + position[0]) * 0.03;
    }
  });
  return (
    <group position={position} scale={scale}>
      {/* Trunk */}
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, 2.4]} />
        <meshStandardMaterial color="#6B4423" roughness={0.95} />
      </mesh>
      {/* Canopy layers */}
      <mesh ref={leavesRef} position={[0, 3, 0]} castShadow>
        <sphereGeometry args={[1.2, 12, 12]} />
        <meshStandardMaterial color="#2d6a30" roughness={0.85} />
      </mesh>
      <mesh position={[0.4, 2.5, 0.3]} castShadow>
        <sphereGeometry args={[0.7, 10, 10]} />
        <meshStandardMaterial color="#3a8c3f" roughness={0.85} />
      </mesh>
      <mesh position={[-0.3, 2.7, -0.2]} castShadow>
        <sphereGeometry args={[0.6, 10, 10]} />
        <meshStandardMaterial color="#357a38" roughness={0.85} />
      </mesh>
    </group>
  );
}

function Villager({ position, name, active }: { position: [number, number, number]; name: string; active: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (groupRef.current && active) {
      groupRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 2) * 0.04;
    }
  });
  return (
    <group ref={groupRef} position={position}>
      {/* Body */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <capsuleGeometry args={[0.22, 0.7, 4, 8]} />
        <meshStandardMaterial color="#c4956a" roughness={0.7} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.35, 0]} castShadow>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#d4a574" roughness={0.6} />
      </mesh>
      {/* Clothing */}
      <mesh position={[0, 0.5, 0]}>
        <capsuleGeometry args={[0.24, 0.35, 4, 8]} />
        <meshStandardMaterial color="#2563eb" roughness={0.8} />
      </mesh>
      {/* Name tag */}
      <Text position={[0, 1.75, 0]} fontSize={0.14} color="#ffffff" anchorX="center" outlineWidth={0.02} outlineColor="#000000">
        {name}
      </Text>
      {/* Speech indicator */}
      {active && (
        <Float speed={4} floatIntensity={0.15}>
          <Text position={[0.4, 1.6, 0]} fontSize={0.2} color="#fbbf24" anchorX="left">💬</Text>
        </Float>
      )}
    </group>
  );
}

function DataTablet({ position }: { position: [number, number, number] }) {
  return (
    <group position={position} rotation={[0.3, 0.2, 0]}>
      <RoundedBox args={[0.45, 0.65, 0.025]} radius={0.015} castShadow>
        <meshStandardMaterial color="#1e1e2e" metalness={0.9} roughness={0.15} />
      </RoundedBox>
      <mesh position={[0, 0, 0.015]}>
        <planeGeometry args={[0.38, 0.58]} />
        <meshStandardMaterial color="#e0f2fe" emissive="#93c5fd" emissiveIntensity={0.4} />
      </mesh>
    </group>
  );
}

function GPSMarker({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.position.y = position[1] + 2 + Math.sin(state.clock.elapsedTime * 2) * 0.3;
      ref.current.rotation.y = state.clock.elapsedTime;
    }
  });
  return (
    <group>
      <mesh ref={ref} position={position} castShadow>
        <coneGeometry args={[0.25, 0.5, 8]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.5} />
      </mesh>
      {/* Ground ring */}
      <mesh position={[position[0], 0.02, position[2]]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.7, 32]} />
        <meshStandardMaterial color="#ef4444" transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

function TrainingScene({ category, stepIndex }: { category: string; stepIndex: number }) {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[15, 20, 10]} intensity={1.2} castShadow shadow-mapSize={[2048, 2048]} shadow-bias={-0.001} />
      <pointLight position={[-8, 5, 8]} intensity={0.3} color="#fcd34d" />
      <pointLight position={[8, 3, -5]} intensity={0.2} color="#93c5fd" />
      <Sky sunPosition={[100, 30, 100]} turbidity={2} rayleigh={0.5} />
      <Stars radius={150} depth={60} count={1500} fade speed={0.5} />
      <fog attach="fog" args={["#b8d4e3", 20, 60]} />

      <GroundPlane />

      {/* Village layout */}
      <RealisticHouse position={[-6, 0, -4]} color="#d4a574" roofColor="#8B4513" />
      <RealisticHouse position={[5, 0, -6]} color="#c9b896" roofColor="#654321" />
      <RealisticHouse position={[-5, 0, 6]} color="#deb887" roofColor="#7a5230" />
      <RealisticHouse position={[7, 0, 4]} color="#c4a882" roofColor="#6B4423" />

      {/* Trees */}
      <RealisticTree position={[-10, 0, 0]} scale={1.2} />
      <RealisticTree position={[10, 0, 3]} />
      <RealisticTree position={[4, 0, 10]} scale={0.9} />
      <RealisticTree position={[-8, 0, 8]} scale={1.1} />
      <RealisticTree position={[12, 0, -8]} scale={0.8} />
      <RealisticTree position={[-3, 0, -10]} />

      {/* Category-specific elements */}
      {(category === "navigation" || category === "form") && (
        <Villager position={[0, 0, -2]} name="Chief Adamu" active={true} />
      )}
      {category === "form" && <DataTablet position={[1.5, 1.2, 0.5]} />}
      {category === "gps" && <GPSMarker position={[0, 0, 0]} />}
      {category === "media" && (
        <Float speed={1.5} floatIntensity={0.2}>
          <RoundedBox args={[0.6, 0.4, 0.35]} radius={0.06} position={[2, 1.5, 1]} castShadow>
            <meshStandardMaterial color="#333" metalness={0.8} roughness={0.15} />
          </RoundedBox>
        </Float>
      )}
      {category === "submission" && (
        <Float speed={2} floatIntensity={0.4}>
          <Text position={[0, 4, -5]} fontSize={0.5} color="#22c55e" anchorX="center" outlineWidth={0.02} outlineColor="#000">
            ✓ SUBMITTED
          </Text>
        </Float>
      )}

      <Float speed={0.5} floatIntensity={0.15}>
        <Text position={[0, 6, -10]} fontSize={0.35} color="#fbbf24" anchorX="center" outlineWidth={0.015} outlineColor="#000">
          Step {stepIndex + 1}
        </Text>
      </Float>

      <OrbitControls enableDamping dampingFactor={0.05} minDistance={5} maxDistance={30} maxPolarAngle={Math.PI / 2.15} target={[0, 1.5, 0]} autoRotate autoRotateSpeed={0.3} />
    </>
  );
}

// ========================
// Training Steps
// ========================

interface TrainingStep {
  id: string;
  title: string;
  description: string;
  instruction: string;
  icon: React.ReactNode;
  duration: number;
  category: "navigation" | "form" | "gps" | "media" | "submission";
}

const TRAINING_STEPS: TrainingStep[] = [
  { id: "welcome", title: "Welcome to Field Training", description: "Learn how to use the data collection app effectively in the field.", instruction: "This immersive simulation will guide you through the complete data collection workflow. Follow each step carefully.", icon: <Glasses className="h-6 w-6" />, duration: 5, category: "navigation" },
  { id: "login", title: "Step 1: Logging In", description: "Open the app and sign in with your credentials.", instruction: "Use the email and password provided by your administrator. The app will verify your identity and check your device.", icon: <FileText className="h-6 w-6" />, duration: 8, category: "navigation" },
  { id: "select-form", title: "Step 2: Select a Form", description: "Navigate to the Forms section and choose the assigned form.", instruction: "Tap on 'Forms' in the bottom navigation. You'll see forms assigned to you. Tap 'Fill Form' on the correct one.", icon: <FileText className="h-6 w-6" />, duration: 8, category: "form" },
  { id: "gps-capture", title: "Step 3: Enable GPS", description: "Allow location access when prompted for geolocation tracking.", instruction: "The app needs your GPS to verify you're in the correct area. Tap 'Allow' when the permission dialog appears. Wait for an accurate reading (±10m or better).", icon: <MapPin className="h-6 w-6" />, duration: 10, category: "gps" },
  { id: "geofence", title: "Step 4: Geofence Compliance", description: "Ensure you're within the designated operational area.", instruction: "If the form has geofencing enabled, you must be inside the boundary. A green badge means you're compliant. Red means you need to move to the correct zone.", icon: <MapPin className="h-6 w-6" />, duration: 8, category: "gps" },
  { id: "fill-text", title: "Step 5: Answer Text Questions", description: "Type responses clearly and accurately.", instruction: "Read each question carefully. Type your answer in the text field. If a question is marked with a red asterisk (*), it's required and must be filled before submission.", icon: <FileText className="h-6 w-6" />, duration: 10, category: "form" },
  { id: "fill-select", title: "Step 6: Select Options", description: "Choose from dropdown or radio button options.", instruction: "For 'Select One' questions, tap the circle next to your choice. For 'Select Multiple', tap all checkboxes that apply. Some options cascade based on previous answers.", icon: <FileText className="h-6 w-6" />, duration: 10, category: "form" },
  { id: "photo-capture", title: "Step 7: Capture Photos", description: "Take clear photos when required by the form.", instruction: "Tap the camera icon. Hold your device steady and ensure good lighting. The app automatically records GPS and timestamp in the photo metadata for verification.", icon: <Camera className="h-6 w-6" />, duration: 10, category: "media" },
  { id: "repeat-groups", title: "Step 8: Repeat Groups", description: "Handle repeating sections for multiple entries.", instruction: "Some forms have repeat groups (e.g., multiple household members). Use the '+' button to add iterations. If you can't complete all required iterations, provide a reason.", icon: <FileText className="h-6 w-6" />, duration: 10, category: "form" },
  { id: "field-notes", title: "Step 9: Field Challenge Notes", description: "Report any issues encountered during data collection.", instruction: "Before submitting, expand 'Field Challenge Notes' to describe any problems: hostile respondents, weather issues, access difficulties, etc.", icon: <FileText className="h-6 w-6" />, duration: 8, category: "form" },
  { id: "review-submit", title: "Step 10: Review & Submit", description: "Check all answers before final submission.", instruction: "Scroll through your responses. Fix any validation errors (shown in red). When satisfied, tap 'Submit Form'. If offline, the app saves locally and syncs when connectivity returns.", icon: <Send className="h-6 w-6" />, duration: 10, category: "submission" },
  { id: "complete", title: "Training Complete!", description: "You've completed the field data collection training.", instruction: "You're now ready to collect data in the field. Remember: accuracy is more important than speed. Take your time with each response.", icon: <Award className="h-6 w-6" />, duration: 5, category: "navigation" },
];

// ========================
// Main Component
// ========================

const VRTrainingSimulation = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [timer, setTimer] = useState(0);
  const [audioEnabled, setAudioEnabled] = useState(false);

  const step = TRAINING_STEPS[currentStep];
  const totalSteps = TRAINING_STEPS.length;

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setTimer(prev => {
        const next = prev + 1;
        if (next >= step.duration) {
          handleNext();
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, currentStep, step.duration]);

  useEffect(() => {
    setProgress(((currentStep) / (totalSteps - 1)) * 100);
  }, [currentStep, totalSteps]);

  const handleNext = useCallback(() => {
    setCompletedSteps(prev => new Set(prev).add(step.id));
    if (currentStep < totalSteps - 1) {
      setCurrentStep(prev => prev + 1);
      setTimer(0);
    } else {
      setIsPlaying(false);
    }
  }, [currentStep, step.id, totalSteps]);

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
      setTimer(0);
    }
  };

  const handleReset = () => {
    setCurrentStep(0);
    setIsPlaying(false);
    setTimer(0);
    setCompletedSteps(new Set());
    setProgress(0);
  };

  const getCategoryBadge = (cat: string) => {
    const map: Record<string, { label: string; className: string }> = {
      navigation: { label: "NAVIGATION", className: "bg-blue-500/15 text-blue-600 border-blue-500/30" },
      form: { label: "DATA ENTRY", className: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" },
      gps: { label: "GEOLOCATION", className: "bg-amber-500/15 text-amber-600 border-amber-500/30" },
      media: { label: "MEDIA CAPTURE", className: "bg-violet-500/15 text-violet-600 border-violet-500/30" },
      submission: { label: "SUBMISSION", className: "bg-orange-500/15 text-orange-600 border-orange-500/30" },
    };
    return map[cat] || { label: cat.toUpperCase(), className: "bg-muted text-muted-foreground" };
  };

  const catBadge = getCategoryBadge(step.category);

  return (
    <Card className="border-0 shadow-lg overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-primary/5 via-transparent to-accent/5 pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Glasses className="h-5 w-5 text-primary" />
              </div>
              Immersive VR Training
            </CardTitle>
            <CardDescription className="mt-1">Interactive 3D guided walkthrough for field data collectors</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs font-mono">
              {completedSteps.size}/{totalSteps}
            </Badge>
            <Badge variant={progress >= 100 ? "default" : "secondary"} className="text-xs">
              {progress >= 100 ? "✓ Complete" : `${Math.round(progress)}%`}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Progress bar */}
        <div className="space-y-1">
          <Progress value={progress} className="h-2" />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Start</span>
            <span>Step {currentStep + 1} of {totalSteps}</span>
            <span>Complete</span>
          </div>
        </div>

        {/* 3D Immersive Scene */}
        <div className="relative rounded-xl overflow-hidden border-2 border-border/50 shadow-inner" style={{ height: 420 }}>
          <Canvas camera={{ position: [12, 8, 12], fov: 45 }} shadows gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.2 }}>
            <Suspense fallback={null}>
              <TrainingScene category={step.category} stepIndex={currentStep} />
            </Suspense>
          </Canvas>

          {/* HUD Overlay */}
          <div className="absolute top-3 left-3 right-3 flex items-start justify-between pointer-events-none">
            <div className="flex items-center gap-2">
              {isPlaying && (
                <div className="flex items-center gap-1.5 bg-destructive/90 text-destructive-foreground rounded-full px-2.5 py-1 text-[10px] font-bold backdrop-blur-sm">
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  LIVE
                </div>
              )}
              <Badge className={`text-[10px] border ${catBadge.className}`}>
                {catBadge.label}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="icon" variant="ghost" className="h-7 w-7 bg-background/60 backdrop-blur-sm pointer-events-auto" onClick={() => setAudioEnabled(!audioEnabled)}>
                {audioEnabled ? <Volume2 className="h-3 w-3" /> : <VolumeX className="h-3 w-3" />}
              </Button>
            </div>
          </div>

          {/* Timer overlay */}
          {isPlaying && (
            <div className="absolute bottom-3 left-3 right-3 pointer-events-none">
              <div className="bg-background/70 backdrop-blur-md rounded-lg px-3 py-2 flex items-center gap-3">
                <div className="flex-1">
                  <Progress value={(timer / step.duration) * 100} className="h-1" />
                </div>
                <span className="text-xs font-mono text-foreground whitespace-nowrap">{step.duration - timer}s</span>
              </div>
            </div>
          )}
        </div>

        {/* Step Content Card */}
        <div className="bg-gradient-to-br from-muted/40 to-muted/20 rounded-xl p-5 border border-border/50">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-primary/10 text-primary shrink-0">
              {step.icon}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-bold text-foreground mb-1">{step.title}</h2>
              <p className="text-sm text-muted-foreground mb-3">{step.description}</p>
              <div className="bg-card/80 border border-border/50 rounded-lg p-3.5 backdrop-blur-sm">
                <p className="text-sm text-foreground leading-relaxed">{step.instruction}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={handlePrev} disabled={currentStep === 0} className="gap-1.5">
            <ChevronRight className="h-4 w-4 rotate-180" />Previous
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleReset} className="gap-1.5">
              <RotateCcw className="h-4 w-4" />Reset
            </Button>
            <Button size="sm" onClick={() => setIsPlaying(!isPlaying)} variant={isPlaying ? "secondary" : "default"} className="gap-1.5 min-w-[110px]">
              {isPlaying ? <><Pause className="h-4 w-4" />Pause</> : <><Play className="h-4 w-4" />Auto-Play</>}
            </Button>
          </div>

          <Button variant={currentStep === totalSteps - 1 ? "default" : "outline"} size="sm" onClick={handleNext} disabled={currentStep === totalSteps - 1 && completedSteps.has(step.id)} className="gap-1.5">
            {currentStep === totalSteps - 1 ? <><CheckCircle className="h-4 w-4" />Finish</> : <>Next<SkipForward className="h-4 w-4" /></>}
          </Button>
        </div>

        {/* Step list */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {TRAINING_STEPS.map((s, i) => {
            const badge = getCategoryBadge(s.category);
            return (
              <button
                key={s.id}
                onClick={() => { setCurrentStep(i); setTimer(0); }}
                className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                  i === currentStep ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm" :
                  completedSteps.has(s.id) ? "border-emerald-500/30 bg-emerald-500/5" : "border-border hover:bg-muted/30"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {completedSteps.has(s.id) && <CheckCircle className="h-3 w-3 text-emerald-500 shrink-0" />}
                  <span className="font-medium truncate">{s.title.replace(/Step \d+: /, "")}</span>
                </div>
                <Badge variant="outline" className={`text-[8px] ${badge.className}`}>
                  {badge.label}
                </Badge>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};

export default VRTrainingSimulation;
