import { useState, useEffect, useCallback, Suspense, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Glasses, Play, Pause, SkipForward, RotateCcw, CheckCircle,
  MapPin, Camera, FileText, Send, ChevronRight, Award, Volume2,
} from "lucide-react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Sky, Stars, Float, Text, RoundedBox } from "@react-three/drei";
import * as THREE from "three";

// ========================
// 3D Environment Components
// ========================

function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#4a7c59" roughness={0.95} />
      </mesh>
      {/* Dirt path */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[2.5, 30]} />
        <meshStandardMaterial color="#b8956a" roughness={1} />
      </mesh>
    </group>
  );
}

function RealisticHouse({ position, color, roofColor }: { position: [number, number, number]; color: string; roofColor: string }) {
  return (
    <group position={position}>
      {/* Walls */}
      <RoundedBox args={[3, 2, 2.5]} radius={0.04} position={[0, 1, 0]} castShadow>
        <meshStandardMaterial color={color} roughness={0.85} />
      </RoundedBox>
      {/* Roof */}
      <mesh position={[0, 2.5, 0]} rotation={[0, 0, 0]} castShadow>
        <coneGeometry args={[2.5, 1.2, 4]} />
        <meshStandardMaterial color={roofColor} roughness={0.9} />
      </mesh>
      {/* Door */}
      <mesh position={[0, 0.6, 1.26]}>
        <planeGeometry args={[0.6, 1.2]} />
        <meshStandardMaterial color="#3d2b1f" />
      </mesh>
      {/* Windows */}
      <mesh position={[0.9, 1.2, 1.26]}>
        <planeGeometry args={[0.4, 0.4]} />
        <meshStandardMaterial color="#87CEEB" metalness={0.3} roughness={0.1} />
      </mesh>
      <mesh position={[-0.9, 1.2, 1.26]}>
        <planeGeometry args={[0.4, 0.4]} />
        <meshStandardMaterial color="#87CEEB" metalness={0.3} roughness={0.1} />
      </mesh>
    </group>
  );
}

function AnimatedTree({ position }: { position: [number, number, number] }) {
  const leavesRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (leavesRef.current) {
      leavesRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.5 + position[0]) * 0.03;
    }
  });
  return (
    <group position={position}>
      <mesh position={[0, 1.2, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.14, 2.4]} />
        <meshStandardMaterial color="#5c3a1e" roughness={0.95} />
      </mesh>
      <mesh ref={leavesRef} position={[0, 3, 0]} castShadow>
        <sphereGeometry args={[1.2, 12, 12]} />
        <meshStandardMaterial color="#2d6a1e" roughness={0.85} />
      </mesh>
      <mesh position={[0.4, 2.5, 0.3]} castShadow>
        <sphereGeometry args={[0.7, 10, 10]} />
        <meshStandardMaterial color="#3a8025" roughness={0.85} />
      </mesh>
    </group>
  );
}

function PersonNPC({ position, label, active }: { position: [number, number, number]; label: string; active: boolean }) {
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
        <capsuleGeometry args={[0.22, 0.7, 6, 12]} />
        <meshStandardMaterial color="#c4956a" roughness={0.7} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.4, 0]} castShadow>
        <sphereGeometry args={[0.22, 16, 16]} />
        <meshStandardMaterial color="#d4a574" roughness={0.6} />
      </mesh>
      {/* Name tag */}
      <Text position={[0, 1.85, 0]} fontSize={0.14} color="#ffffff" anchorX="center" outlineWidth={0.01} outlineColor="#000000">
        {label}
      </Text>
      {/* Speaking indicator */}
      {active && (
        <Float speed={4} floatIntensity={0.15}>
          <Text position={[0.4, 1.65, 0]} fontSize={0.18} anchorX="left">💬</Text>
        </Float>
      )}
    </group>
  );
}

function TabletDevice({ position, glowing }: { position: [number, number, number]; glowing: boolean }) {
  return (
    <Float speed={1.5} floatIntensity={glowing ? 0.2 : 0}>
      <group position={position}>
        <RoundedBox args={[0.45, 0.65, 0.025]} radius={0.02} castShadow>
          <meshStandardMaterial color="#1a1a2e" metalness={0.85} roughness={0.15} />
        </RoundedBox>
        <mesh position={[0, 0, 0.014]}>
          <planeGeometry args={[0.4, 0.58]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive={glowing ? "#4488ff" : "#ffffff"}
            emissiveIntensity={glowing ? 0.5 : 0.15}
          />
        </mesh>
      </group>
    </Float>
  );
}

function GPSMarker({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ref.current) {
      ref.current.position.y = position[1] + 0.5 + Math.sin(state.clock.elapsedTime * 2) * 0.3;
      ref.current.rotation.y = state.clock.elapsedTime;
    }
  });
  return (
    <group>
      <mesh ref={ref} position={position} castShadow>
        <coneGeometry args={[0.25, 0.5, 8]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.4} />
      </mesh>
      {/* Pulsing ring on ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[position[0], 0.02, position[2]]}>
        <ringGeometry args={[0.4, 0.6, 24]} />
        <meshStandardMaterial color="#ef4444" transparent opacity={0.3} />
      </mesh>
    </group>
  );
}

// Category-specific 3D scene composition
function TrainingScene3D({ category, stepIndex }: { category: string; stepIndex: number }) {
  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[15, 20, 10]}
        intensity={0.8}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <pointLight position={[-8, 4, 6]} intensity={0.25} color="#fbbf24" />
      <hemisphereLight args={["#87CEEB", "#4a7c59", 0.3]} />

      {/* Sky */}
      <Sky sunPosition={[100, 25, 100]} turbidity={3} rayleigh={0.5} />
      <Stars radius={120} depth={50} count={600} fade speed={0.3} />
      <fog attach="fog" args={["#c5dde8", 25, 65]} />

      {/* Ground */}
      <Ground />

      {/* Village */}
      <RealisticHouse position={[-6, 0, -4]} color="#CD853F" roofColor="#8B4513" />
      <RealisticHouse position={[6, 0, -6]} color="#DEB887" roofColor="#654321" />
      <RealisticHouse position={[-5, 0, 6]} color="#D2691E" roofColor="#8B4513" />
      <RealisticHouse position={[8, 0, 4]} color="#DAA520" roofColor="#654321" />

      {/* Trees */}
      <AnimatedTree position={[-10, 0, 0]} />
      <AnimatedTree position={[10, 0, 3]} />
      <AnimatedTree position={[4, 0, 10]} />
      <AnimatedTree position={[-3, 0, -10]} />
      <AnimatedTree position={[12, 0, -8]} />
      <AnimatedTree position={[-12, 0, 8]} />

      {/* NPCs based on step */}
      <PersonNPC position={[0, 0, -2]} label="Community Leader" active={category === "navigation" || category === "form"} />
      <PersonNPC position={[-2, 0, 1]} label="Health Worker" active={category === "gps"} />
      <PersonNPC position={[2.5, 0, -1]} label="Respondent" active={category === "form"} />

      {/* Context objects */}
      {(category === "form" || category === "navigation") && (
        <TabletDevice position={[1.2, 1.2, 0.5]} glowing={category === "form"} />
      )}
      {category === "gps" && <GPSMarker position={[0, 0, 0]} />}
      {category === "media" && (
        <Float speed={1.5} floatIntensity={0.25}>
          <RoundedBox args={[0.5, 0.35, 0.25]} radius={0.04} position={[2, 1.8, 1]} castShadow>
            <meshStandardMaterial color="#333" metalness={0.75} roughness={0.2} />
          </RoundedBox>
        </Float>
      )}

      {/* Step counter floating */}
      <Float speed={0.8} floatIntensity={0.15}>
        <Text position={[0, 6, -12]} fontSize={0.5} color="#fbbf24" anchorX="center" outlineWidth={0.02} outlineColor="#000">
          Step {stepIndex + 1}
        </Text>
      </Float>

      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        autoRotate
        autoRotateSpeed={0.25}
        minDistance={6}
        maxDistance={22}
        maxPolarAngle={Math.PI / 2.1}
        target={[0, 1, 0]}
      />
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
  { id: "welcome", title: "Welcome to Field Training", description: "Learn how to use the data collection app effectively in the field.", instruction: "This VR simulation will guide you through the complete data collection workflow. Follow each step carefully.", icon: <Glasses className="h-6 w-6" />, duration: 5, category: "navigation" },
  { id: "login", title: "Step 1: Logging In", description: "Open the app and sign in with your credentials.", instruction: "Use the email and password provided by your administrator. The app will verify your identity and check your device.", icon: <FileText className="h-6 w-6" />, duration: 8, category: "navigation" },
  { id: "select-form", title: "Step 2: Select a Form", description: "Navigate to the Forms section and choose the assigned form.", instruction: "Tap on 'Forms' in the bottom navigation. You'll see forms assigned to you. Tap 'Fill Form' on the correct one.", icon: <FileText className="h-6 w-6" />, duration: 8, category: "form" },
  { id: "gps-capture", title: "Step 3: Enable GPS", description: "Allow location access when prompted for geolocation tracking.", instruction: "The app needs your GPS to verify you're in the correct area. Tap 'Allow' when the permission dialog appears. Wait for an accurate reading (±10m or better).", icon: <MapPin className="h-6 w-6" />, duration: 10, category: "gps" },
  { id: "geofence", title: "Step 4: Geofence Compliance", description: "Ensure you're within the designated operational area.", instruction: "If the form has geofencing enabled, you must be inside the boundary. A green badge means you're compliant. Red means you need to move to the correct zone.", icon: <MapPin className="h-6 w-6" />, duration: 8, category: "gps" },
  { id: "fill-text", title: "Step 5: Answer Text Questions", description: "Type responses clearly and accurately.", instruction: "Read each question carefully. Type your answer in the text field. If a question is marked with a red asterisk (*), it's required.", icon: <FileText className="h-6 w-6" />, duration: 10, category: "form" },
  { id: "fill-select", title: "Step 6: Select Options", description: "Choose from dropdown or radio button options.", instruction: "For 'Select One' questions, tap the circle next to your choice. For 'Select Multiple', tap all checkboxes that apply.", icon: <FileText className="h-6 w-6" />, duration: 10, category: "form" },
  { id: "photo-capture", title: "Step 7: Capture Photos", description: "Take clear photos when required by the form.", instruction: "Tap the camera icon. Hold your device steady and ensure good lighting. GPS and timestamp are embedded automatically.", icon: <Camera className="h-6 w-6" />, duration: 10, category: "media" },
  { id: "repeat-groups", title: "Step 8: Repeat Groups", description: "Handle repeating sections for multiple entries.", instruction: "Some forms have repeat groups (e.g., multiple household members). Use the '+' button to add iterations.", icon: <FileText className="h-6 w-6" />, duration: 10, category: "form" },
  { id: "field-notes", title: "Step 9: Field Challenge Notes", description: "Report any issues encountered during data collection.", instruction: "Before submitting, expand 'Field Challenge Notes' to describe any problems: hostile respondents, weather, access difficulties.", icon: <FileText className="h-6 w-6" />, duration: 8, category: "form" },
  { id: "review-submit", title: "Step 10: Review & Submit", description: "Check all answers before final submission.", instruction: "Scroll through your responses. Fix validation errors. When satisfied, tap 'Submit Form'. Offline saves sync when connectivity returns.", icon: <Send className="h-6 w-6" />, duration: 10, category: "submission" },
  { id: "complete", title: "Training Complete!", description: "You've completed the field data collection training.", instruction: "You're now ready to collect data in the field. Remember: accuracy is more important than speed.", icon: <Award className="h-6 w-6" />, duration: 5, category: "navigation" },
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

  const getCategoryColor = (cat: string) => {
    const map: Record<string, string> = {
      navigation: "hsl(var(--primary))",
      form: "hsl(var(--accent))",
      gps: "hsl(142, 71%, 45%)",
      media: "hsl(262, 83%, 58%)",
      submission: "hsl(var(--destructive))",
    };
    return map[cat] || "hsl(var(--muted-foreground))";
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Glasses className="h-5 w-5 text-primary" />
              VR Training Simulation
            </CardTitle>
            <CardDescription>Immersive 3D guided walkthrough for field data collectors</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {completedSteps.size}/{totalSteps} steps
            </Badge>
            <Badge variant={progress >= 100 ? "default" : "secondary"} className="text-xs">
              {progress >= 100 ? "✓ Complete" : `${Math.round(progress)}%`}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Progress value={progress} className="h-2" />

        {/* 3D Immersive Scene */}
        <div className="relative rounded-xl overflow-hidden border border-border" style={{ height: 400 }}>
          <Canvas
            camera={{ position: [12, 8, 12], fov: 45 }}
            shadows
            gl={{
              antialias: true,
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 1.1,
            }}
          >
            <Suspense fallback={null}>
              <TrainingScene3D category={step.category} stepIndex={currentStep} />
            </Suspense>
          </Canvas>

          {/* Overlay HUD */}
          <div className="absolute top-3 left-3 right-3 flex justify-between items-start pointer-events-none">
            {/* Step dots */}
            <div className="flex gap-1 flex-wrap max-w-[60%]">
              {TRAINING_STEPS.map((s, i) => (
                <div
                  key={s.id}
                  className="rounded-full pointer-events-auto cursor-pointer"
                  style={{
                    width: i === currentStep ? 18 : 7,
                    height: 7,
                    background: completedSteps.has(s.id) ? getCategoryColor(s.category) : i === currentStep ? getCategoryColor(s.category) : "rgba(255,255,255,0.3)",
                    transition: "all 0.3s ease",
                  }}
                  onClick={() => { setCurrentStep(i); setTimer(0); }}
                />
              ))}
            </div>
            {/* Timer */}
            {isPlaying && (
              <div className="bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-lg flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-white text-xs font-mono">
                  {step.duration - timer}s
                </span>
              </div>
            )}
          </div>

          {/* Bottom instruction overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-4 pt-10">
            <Badge className="mb-1.5 text-[10px]" style={{ background: getCategoryColor(step.category) }}>
              {step.category.toUpperCase()}
            </Badge>
            <h3 className="text-white font-bold text-sm mb-0.5">{step.title}</h3>
            <p className="text-white/80 text-xs leading-relaxed line-clamp-2">{step.instruction}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={handlePrev} disabled={currentStep === 0}>
            <ChevronRight className="h-4 w-4 rotate-180 mr-1" />Previous
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-1" />Reset
            </Button>
            <Button size="sm" onClick={() => setIsPlaying(!isPlaying)} variant={isPlaying ? "secondary" : "default"}>
              {isPlaying ? <><Pause className="h-4 w-4 mr-1" />Pause</> : <><Play className="h-4 w-4 mr-1" />Auto-Play</>}
            </Button>
          </div>
          <Button
            variant={currentStep === totalSteps - 1 ? "default" : "outline"}
            size="sm"
            onClick={handleNext}
            disabled={currentStep === totalSteps - 1 && completedSteps.has(step.id)}
          >
            {currentStep === totalSteps - 1 ? (
              <><CheckCircle className="h-4 w-4 mr-1" />Finish</>
            ) : (
              <>Next<SkipForward className="h-4 w-4 ml-1" /></>
            )}
          </Button>
        </div>

        {/* Step grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {TRAINING_STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => { setCurrentStep(i); setTimer(0); }}
              className={`p-2 rounded-lg border text-left text-xs transition-all ${
                i === currentStep ? "border-primary bg-primary/5 ring-1 ring-primary" :
                completedSteps.has(s.id) ? "border-muted bg-muted/30" : "border-border hover:bg-muted/20"
              }`}
            >
              <div className="flex items-center gap-1 mb-0.5">
                {completedSteps.has(s.id) && <CheckCircle className="h-3 w-3 text-primary" />}
                <span className="font-medium truncate">{s.title.replace(/Step \d+: /, "")}</span>
              </div>
              <Badge variant="outline" className="text-[8px]" style={{ borderColor: getCategoryColor(s.category), color: getCategoryColor(s.category) }}>
                {s.category}
              </Badge>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};

export default VRTrainingSimulation;
