import { useState, useEffect, useRef, Suspense } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import {
  Glasses, Play, Pause, RotateCcw,
  MapPin, Camera, FileText, Send, ChevronRight, Award, Plus,
  Trash2, Save, Settings, Gamepad2, Users, Globe,
  Star, Trophy, Heart, Zap, Target, Navigation,
  Video, Upload, Lock, UserPlus,
} from "lucide-react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, Float, RoundedBox, Sky, Stars } from "@react-three/drei";
import * as THREE from "three";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

// ========================
// 3D Scene Components
// ========================

function VillageHouse({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      <RoundedBox args={[2, 1.5, 2]} radius={0.05} position={[0, 0.75, 0]}>
        <meshStandardMaterial color={color} roughness={0.8} />
      </RoundedBox>
      <mesh position={[0, 1.8, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[1.8, 1, 4]} />
        <meshStandardMaterial color="#8B4513" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.5, 1.01]}>
        <planeGeometry args={[0.5, 1]} />
        <meshStandardMaterial color="#654321" />
      </mesh>
    </group>
  );
}

function Tree({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[0.1, 0.15, 2]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>
      <mesh position={[0, 2.5, 0]}>
        <sphereGeometry args={[0.8, 8, 8]} />
        <meshStandardMaterial color="#228B22" />
      </mesh>
    </group>
  );
}

function NPC({ position, name, speaking }: { position: [number, number, number]; name: string; speaking: boolean }) {
  const meshRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (meshRef.current && speaking) {
      meshRef.current.position.y = position[1] + Math.sin(state.clock.elapsedTime * 3) * 0.05;
    }
  });
  return (
    <group ref={meshRef} position={position}>
      <mesh position={[0, 0.6, 0]}>
        <capsuleGeometry args={[0.2, 0.6, 4, 8]} />
        <meshStandardMaterial color="#DEB887" />
      </mesh>
      <mesh position={[0, 1.2, 0]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#D2B48C" />
      </mesh>
      <Text position={[0, 1.6, 0]} fontSize={0.15} color="#ffffff" anchorX="center">{name}</Text>
      {speaking && (
        <Float speed={3} floatIntensity={0.2}>
          <Text position={[0.5, 1.5, 0]} fontSize={0.12} color="#fbbf24" anchorX="left">💬</Text>
        </Float>
      )}
    </group>
  );
}

function Tablet({ position, showForm }: { position: [number, number, number]; showForm: boolean }) {
  return (
    <group position={position}>
      <RoundedBox args={[0.4, 0.6, 0.03]} radius={0.02}>
        <meshStandardMaterial color="#1a1a2e" metalness={0.8} roughness={0.2} />
      </RoundedBox>
      {showForm && (
        <mesh position={[0, 0, 0.02]}>
          <planeGeometry args={[0.35, 0.55]} />
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.3} />
        </mesh>
      )}
    </group>
  );
}

function WaterPond({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (ref.current) {
      (ref.current.material as THREE.MeshStandardMaterial).opacity = 0.6 + Math.sin(state.clock.elapsedTime) * 0.1;
    }
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} position={position} receiveShadow>
      <circleGeometry args={[2, 24]} />
      <meshStandardMaterial color="#4a90d9" transparent opacity={0.65} roughness={0.1} metalness={0.3} />
    </mesh>
  );
}

function Fence({ start, end }: { start: [number, number, number]; end: [number, number, number] }) {
  const length = Math.sqrt((end[0] - start[0]) ** 2 + (end[2] - start[2]) ** 2);
  const angle = Math.atan2(end[2] - start[2], end[0] - start[0]);
  const midX = (start[0] + end[0]) / 2;
  const midZ = (start[2] + end[2]) / 2;
  return (
    <group position={[midX, 0.3, midZ]} rotation={[0, -angle, 0]}>
      <mesh castShadow>
        <boxGeometry args={[length, 0.6, 0.06]} />
        <meshStandardMaterial color="#8B7355" roughness={0.95} />
      </mesh>
    </group>
  );
}

function GameScene({ scenario, currentStep, score }: { scenario: GameScenario; currentStep: number; score: number }) {
  const step = scenario.steps[currentStep];
  const environment = scenario.environment || "village";
  const groupRef = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (groupRef.current) groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.08) * 0.015;
  });

  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[15, 20, 10]} intensity={0.85} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <pointLight position={[-6, 3, 5]} intensity={0.25} color="#fbbf24" />
      <hemisphereLight args={["#87CEEB", "#4a7c59", 0.25]} />
      <Sky sunPosition={environment === "village" ? [100, 25, 100] : [50, 40, 80]} turbidity={3} rayleigh={0.5} />
      <Stars radius={120} depth={50} count={600} fade speed={0.3} />
      <fog attach="fog" args={["#c5dde8", 22, 60]} />

      <group ref={groupRef}>
        {/* Ground */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[80, 80]} />
          <meshStandardMaterial color={environment === "village" ? "#4a7c59" : environment === "clinic" ? "#6b8f6b" : "#5a8c5a"} roughness={0.95} />
        </mesh>
        {/* Path */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <planeGeometry args={[2.5, 30]} />
          <meshStandardMaterial color="#b8956a" roughness={1} />
        </mesh>

        {environment === "village" && (
          <>
            <VillageHouse position={[-5, 0, -3]} color="#CD853F" />
            <VillageHouse position={[5, 0, -5]} color="#DEB887" />
            <VillageHouse position={[-4, 0, 5]} color="#D2691E" />
            <VillageHouse position={[8, 0, 3]} color="#DAA520" />
            <Tree position={[-9, 0, 0]} />
            <Tree position={[9, 0, 2]} />
            <Tree position={[3, 0, 9]} />
            <Tree position={[-7, 0, -8]} />
            <Tree position={[11, 0, -6]} />
            <WaterPond position={[-10, 0.02, 8]} />
            <Fence start={[-7, 0, -6]} end={[-3, 0, -6]} />
            <Fence start={[3, 0, -8]} end={[7, 0, -8]} />
          </>
        )}
        {environment === "clinic" && (
          <>
            <RoundedBox args={[7, 2.8, 5]} radius={0.1} position={[0, 1.4, -5]} castShadow>
              <meshStandardMaterial color="#e8e8e8" roughness={0.7} />
            </RoundedBox>
            <Text position={[0, 3.1, -2.49]} fontSize={0.28} color="#1B5E20" anchorX="center" outlineWidth={0.01} outlineColor="#000">PHC Clinic</Text>
            <mesh position={[0, 0.6, -2.49]}>
              <planeGeometry args={[0.8, 1.4]} />
              <meshStandardMaterial color="#3d2b1f" />
            </mesh>
            <Tree position={[-5, 0, -3]} />
            <Tree position={[5, 0, -3]} />
          </>
        )}
        {environment === "school" && (
          <>
            <RoundedBox args={[9, 2.2, 3.5]} radius={0.1} position={[0, 1.1, -5]} castShadow>
              <meshStandardMaterial color="#f5f0e0" roughness={0.75} />
            </RoundedBox>
            <Text position={[0, 2.5, -3.24]} fontSize={0.24} color="#1565C0" anchorX="center" outlineWidth={0.01} outlineColor="#000">Community School</Text>
            <Fence start={[-6, 0, -2]} end={[6, 0, -2]} />
          </>
        )}

        {/* NPCs */}
        {step?.npcName && <NPC position={[0, 0, -2]} name={step.npcName} speaking={true} />}
        <NPC position={[-2.5, 0, 1]} name="Health Worker" speaking={step?.category === "gps"} />

        {/* Context objects */}
        {step?.category === "form" && <Tablet position={[1.5, 1.1, 0.5]} showForm={true} />}
        {step?.category === "gps" && (
          <>
            <Float speed={2} floatIntensity={0.35}>
              <mesh position={[0, 2.5, 0]}>
                <coneGeometry args={[0.25, 0.5, 8]} />
                <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.4} />
              </mesh>
            </Float>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
              <ringGeometry args={[0.5, 0.7, 24]} />
              <meshStandardMaterial color="#ef4444" transparent opacity={0.3} />
            </mesh>
          </>
        )}
        {step?.category === "media" && (
          <Float speed={1.5} floatIntensity={0.25}>
            <RoundedBox args={[0.5, 0.35, 0.3]} radius={0.04} position={[2, 1.8, 1]} castShadow>
              <meshStandardMaterial color="#333" metalness={0.75} roughness={0.2} />
            </RoundedBox>
          </Float>
        )}

        {/* Score display */}
        <Float speed={0.8} floatIntensity={0.2}>
          <Text position={[0, 6, -10]} fontSize={0.45} color="#fbbf24" anchorX="center" outlineWidth={0.02} outlineColor="#000">
            ⭐ Score: {score}
          </Text>
        </Float>
      </group>
      <OrbitControls enableDamping dampingFactor={0.05} minDistance={5} maxDistance={25} maxPolarAngle={Math.PI / 2.15} target={[0, 1, 0]} />
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
  dbId?: string; // ID from vr_simulations table
}

interface UserProfile {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  designation: string;
}

// Default scenarios
const DEFAULT_SCENARIOS: GameScenario[] = [
  {
    id: "community-survey",
    name: "Community Health Survey",
    description: "Conduct a household survey in a Nigerian village. Interview residents, capture GPS, take photos, and submit data.",
    environment: "village",
    difficulty: "beginner",
    maxScore: 100,
    timeLimit: 600,
    simulationType: "vr_3d",
    steps: [
      { id: "arrive", title: "Arrive at Village", description: "Navigate to the assigned community", instruction: "You've arrived at the village. The community leader (Baale) is waiting. Always greet elders first.", category: "navigation", duration: 5, points: 5, npcName: "Chief Adamu" },
      { id: "greet", title: "Greet Community Leader", description: "Introduce yourself and get consent", instruction: "Approach the community leader. Show your ID badge. Explain the survey purpose. Request verbal consent.", category: "interaction", duration: 8, points: 10, npcName: "Chief Adamu", quizQuestion: "What should you do FIRST when arriving at a Nigerian community?", quizOptions: ["Start collecting data immediately", "Greet the community leader and explain your purpose", "Take photos of everything", "Set up your equipment"], quizAnswer: 1 },
      { id: "check-gps", title: "Capture GPS Location", description: "Record GPS coordinates", instruction: "Open the app and wait for GPS lock. Ensure accuracy is within 10 meters. Stand in an open area.", category: "gps", duration: 10, points: 15, quizQuestion: "What GPS accuracy level should you achieve?", quizOptions: ["Within 100m", "Within 50m", "Within 10m", "Doesn't matter"], quizAnswer: 2 },
      { id: "open-form", title: "Open Survey Form", description: "Select and load the assigned form", instruction: "Navigate to Forms → Fill Form. Select the correct form. Verify the form version.", category: "form", duration: 5, points: 10 },
      { id: "interview", title: "Conduct Interview", description: "Interview household head", instruction: "Ask each question clearly in the local language. Record responses accurately. For sensitive questions, ensure privacy.", category: "form", duration: 15, points: 20, npcName: "Mrs. Fatima", quizQuestion: "If a respondent doesn't understand a question?", quizOptions: ["Skip it", "Answer yourself", "Rephrase in local language", "Mark N/A"], quizAnswer: 2 },
      { id: "photo", title: "Capture Photo Evidence", description: "Photograph the household", instruction: "Take a clear photo. Ensure GPS metadata is embedded. Never photograph people without consent.", category: "media", duration: 8, points: 15 },
      { id: "review", title: "Review Before Submission", description: "Quality-check all fields", instruction: "Scroll through the form. Check required fields, GPS, photos. Cross-check numeric entries.", category: "form", duration: 8, points: 10, quizQuestion: "Why review before submitting?", quizOptions: ["To waste time", "To catch errors and missing data", "Not important", "To impress supervisor"], quizAnswer: 1 },
      { id: "submit", title: "Submit Form", description: "Finalize and submit", instruction: "Tap 'Submit'. If offline, it saves locally and auto-syncs when online.", category: "submission", duration: 5, points: 15 },
    ],
  },
  {
    id: "ntd-mda",
    name: "NTD Mass Drug Administration",
    description: "Simulate a Community-Directed Distribution exercise for NTD treatment with Ivermectin dose poles.",
    environment: "village",
    difficulty: "intermediate",
    maxScore: 120,
    timeLimit: 900,
    simulationType: "vr_3d",
    steps: [
      { id: "setup", title: "Set Up Distribution Point", description: "Prepare the treatment area", instruction: "Set up near the community leader's compound. Lay out dose pole, register, and drug supplies.", category: "navigation", duration: 5, points: 10, npcName: "Health Worker Binta" },
      { id: "measure", title: "Measure with Dose Pole", description: "Use dose pole for dosage", instruction: "Have each person stand against the dose pole. Read the color band at shoulder height.", category: "interaction", duration: 10, points: 15, npcName: "Alhaji Musa", quizQuestion: "Who should NOT receive Ivermectin?", quizOptions: ["Adult males", "Pregnant women & children under 90cm", "Elderly people", "People who've eaten recently"], quizAnswer: 1 },
      { id: "record-gps", title: "Record GPS of Distribution Point", description: "Capture location data", instruction: "Record the GPS of the distribution point for geographic coverage mapping.", category: "gps", duration: 5, points: 10 },
      { id: "treat", title: "Administer Treatment", description: "Give tablets and observe", instruction: "Give correct tablets per dose pole. Watch the person swallow with water. Record: name, age, sex, dose.", category: "form", duration: 15, points: 20, npcName: "Patient Aminu" },
      { id: "handle-refusal", title: "Handle Treatment Refusal", description: "Document refusal properly", instruction: "Mrs. Khadija refuses. Explain benefits calmly. If she still refuses, record refusal with reason. NEVER force treatment.", category: "interaction", duration: 10, points: 15, npcName: "Mrs. Khadija", quizQuestion: "What to do when someone refuses treatment?", quizOptions: ["Force them", "Record refusal and reason, respect choice", "Skip without recording", "Report to police"], quizAnswer: 1 },
      { id: "adverse", title: "Report Adverse Event", description: "Document side effects", instruction: "A member reports dizziness and rashes. Record the adverse event. Advise rest. If severe, refer to health facility.", category: "form", duration: 10, points: 20, quizQuestion: "First thing when someone reports side effects?", quizOptions: ["Ignore it", "Record and assess severity", "Give more medicine", "Tell them to go home"], quizAnswer: 1 },
      { id: "summary", title: "End-of-Day Summary", description: "Submit daily summary", instruction: "Count total treated, refused, adverse events. Submit summary with GPS. Ensure sync before leaving.", category: "submission", duration: 10, points: 15 },
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

  // Forms & projects for linking
  const [forms, setForms] = useState<{ id: string; name: string }[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  // Video simulation playback
  const videoRef = useRef<HTMLVideoElement>(null);

  // Load saved simulations from DB
  useEffect(() => {
    if (!user) return;
    const loadSimulations = async () => {
      const { data } = await supabase.from("vr_simulations").select("*");
      if (data) {
        const dbScenarios: GameScenario[] = data.map((sim: any) => ({
          id: `db-${sim.id}`,
          dbId: sim.id,
          name: sim.name,
          description: sim.description || "",
          environment: (sim.scenario_data as any)?.environment || "village",
          difficulty: (sim.scenario_data as any)?.difficulty || "beginner",
          steps: (sim.scenario_data as any)?.steps || [],
          maxScore: (sim.scenario_data as any)?.maxScore || 0,
          simulationType: sim.simulation_type as "vr_3d" | "video",
          videoUrl: sim.video_url,
          formId: sim.form_id,
          projectId: sim.project_id,
        }));
        setScenarios([...DEFAULT_SCENARIOS, ...dbScenarios]);
      }
    };
    loadSimulations();
  }, [user]);

  // Load forms & projects for admins
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
      toast({ title: "❌ Incorrect", description: "Try to remember this for next time", variant: "destructive" });
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

  const getCategoryIcon = (category: string) => {
    const map: Record<string, React.ReactNode> = {
      navigation: <Navigation className="h-4 w-4" />, form: <FileText className="h-4 w-4" />,
      gps: <MapPin className="h-4 w-4" />, media: <Camera className="h-4 w-4" />,
      submission: <Send className="h-4 w-4" />, interaction: <Users className="h-4 w-4" />,
    };
    return map[category] || <Zap className="h-4 w-4" />;
  };

  const getCategoryColor = (category: string) => {
    const map: Record<string, string> = {
      navigation: "text-blue-400", form: "text-green-400", gps: "text-yellow-400",
      media: "text-purple-400", submission: "text-orange-400", interaction: "text-pink-400",
    };
    return map[category] || "text-muted-foreground";
  };

  // ========================
  // Access Control
  // ========================

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
      toast({ title: "Access Revoked", description: "User access to this simulation has been removed." });
    } else {
      await supabase.from("vr_simulation_access").insert({ simulation_id: accessSimulationId, user_id: userId, granted_by: user.id });
      setGrantedUserIds(prev => [...prev, userId]);
      toast({ title: "Access Granted", description: "User can now access this simulation." });
    }
  };

  // ========================
  // Upload Simulation
  // ========================

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
        name: uploadName,
        description: uploadDescription,
        simulation_type: uploadType,
        form_id: uploadFormId || null,
        project_id: uploadProjectId || null,
        video_url: videoUrl,
        scenario_data: { environment: "village", difficulty: "beginner", steps: [], maxScore: 0 } as unknown as Record<string, unknown>,
        created_by: user.id,
      } as any).select().single();

      if (error) throw error;

      const newScenario: GameScenario = {
        id: `db-${inserted.id}`,
        dbId: inserted.id,
        name: inserted.name,
        description: inserted.description || "",
        environment: "village",
        difficulty: "beginner",
        steps: [],
        maxScore: 0,
        simulationType: uploadType,
        videoUrl: videoUrl || undefined,
        formId: uploadFormId || undefined,
        projectId: uploadProjectId || undefined,
      };

      setScenarios(prev => [...prev, newScenario]);
      setShowUploadDialog(false);
      setUploadName("");
      setUploadDescription("");
      setUploadFile(null);
      setUploadFormId("");
      setUploadProjectId("");
      toast({ title: "Simulation Uploaded", description: `"${uploadName}" is now available.` });
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  // ========================
  // Scenario Designer
  // ========================

  const saveCustomScenario = async () => {
    if (!editingScenario || !user) return;
    const maxScore = editingScenario.steps.reduce((sum, s) => sum + s.points, 0);
    const updated = { ...editingScenario, maxScore };

    try {
      if (updated.dbId) {
        await supabase.from("vr_simulations").update({
          name: updated.name,
          description: updated.description,
          simulation_type: updated.simulationType || "vr_3d",
          scenario_data: { environment: updated.environment, difficulty: updated.difficulty, steps: JSON.parse(JSON.stringify(updated.steps)), maxScore } as unknown as Record<string, unknown>,
          form_id: updated.formId || null,
          project_id: updated.projectId || null,
        } as any).eq("id", updated.dbId);
      } else {
        const { data: inserted } = await supabase.from("vr_simulations").insert({
          name: updated.name,
          description: updated.description,
          simulation_type: updated.simulationType || "vr_3d",
          scenario_data: { environment: updated.environment, difficulty: updated.difficulty, steps: JSON.parse(JSON.stringify(updated.steps)), maxScore } as unknown as Record<string, unknown>,
          form_id: updated.formId || null,
          project_id: updated.projectId || null,
          created_by: user.id,
        } as any).select().single();

        if (inserted) {
          updated.dbId = inserted.id;
          updated.id = `db-${inserted.id}`;
        }
      }

      setScenarios(prev => {
        const idx = prev.findIndex(s => s.id === updated.id || (s.dbId && s.dbId === updated.dbId));
        if (idx >= 0) { const copy = [...prev]; copy[idx] = updated; return copy; }
        return [...prev, updated];
      });
      setEditingScenario(null);
      toast({ title: "Scenario Saved", description: `"${updated.name}" saved to database.` });
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message, variant: "destructive" });
    }
  };

  const addStep = () => {
    if (!editingScenario) return;
    setEditingScenario({
      ...editingScenario,
      steps: [...editingScenario.steps, {
        id: `step-${Date.now()}`, title: "New Step", description: "", instruction: "Instructions...",
        category: "form", duration: 10, points: 10,
      }],
    });
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
      toast({ title: "Deleted", description: `"${scenario.name}" removed.` });
    }
  };

  // ========================
  // Render
  // ========================

  const isVideoSimulation = selectedScenario?.simulationType === "video" && selectedScenario?.videoUrl;
  const dbScenarios = scenarios.filter(s => s.dbId);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Gamepad2 className="h-5 w-5 text-primary" />
              VR Training & Simulation Hub
            </CardTitle>
            <CardDescription>3D simulations, video walkthroughs, and custom training games</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => setShowUploadDialog(true)}>
                <Upload className="h-3 w-3 mr-1" />Upload Simulation
              </Button>
            )}
            <Badge variant="secondary" className="text-xs">{scenarios.length} scenarios</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-3 flex-wrap h-auto">
            <TabsTrigger value="play"><Play className="h-3 w-3 mr-1" />Play</TabsTrigger>
            <TabsTrigger value="video"><Video className="h-3 w-3 mr-1" />Video Sims</TabsTrigger>
            {isAdmin && <TabsTrigger value="design"><Settings className="h-3 w-3 mr-1" />Design</TabsTrigger>}
            {(isOwner || isAdmin) && <TabsTrigger value="access"><Lock className="h-3 w-3 mr-1" />Access</TabsTrigger>}
            <TabsTrigger value="leaderboard"><Trophy className="h-3 w-3 mr-1" />Leaderboard</TabsTrigger>
          </TabsList>

          {/* PLAY TAB - 3D VR Scenarios */}
          <TabsContent value="play">
            {!selectedScenario ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {scenarios.filter(s => s.simulationType !== "video").map(scenario => (
                  <Card key={scenario.id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => startScenario(scenario)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-sm">{scenario.name}</h3>
                        <div className="flex gap-1">
                          <Badge variant="outline" className="text-[10px]"><Glasses className="h-3 w-3 mr-0.5" />3D</Badge>
                          <Badge variant={scenario.difficulty === "beginner" ? "secondary" : scenario.difficulty === "intermediate" ? "default" : "destructive"} className="text-[10px]">{scenario.difficulty}</Badge>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{scenario.description}</p>
                      {scenario.formId && <Badge variant="outline" className="text-[8px] mr-1">Form Linked</Badge>}
                      {scenario.projectId && <Badge variant="outline" className="text-[8px]">Project Linked</Badge>}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                        <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{scenario.environment}</span>
                        <span className="flex items-center gap-1"><Target className="h-3 w-3" />{scenario.steps.length} steps</span>
                        <span className="flex items-center gap-1"><Star className="h-3 w-3" />{scenario.maxScore} pts</span>
                      </div>
                      <Button className="w-full mt-3" size="sm"><Play className="h-3 w-3 mr-1" />Start Training</Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : isVideoSimulation ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{selectedScenario.name}</Badge>
                  <Button variant="outline" size="sm" onClick={() => { setSelectedScenario(null); setIsPlaying(false); }}>
                    <RotateCcw className="h-3 w-3 mr-1" />Back
                  </Button>
                </div>
                <div className="rounded-lg overflow-hidden border bg-black">
                  <video
                    ref={videoRef}
                    src={selectedScenario.videoUrl}
                    controls
                    playsInline
                    preload="auto"
                    controlsList="nodownload"
                    crossOrigin="anonymous"
                    className="w-full max-h-[500px]"
                    onError={(e) => {
                      const video = e.currentTarget;
                      console.error("Video error:", video.error?.message, video.error?.code);
                      toast({
                        title: "Video Playback Error",
                        description: `Could not load video. ${video.error?.message || "The file may be corrupted or in an unsupported format."}`,
                        variant: "destructive",
                      });
                    }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">{selectedScenario.description}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* HUD */}
                <div className="flex items-center justify-between flex-wrap gap-2 p-2 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3 flex-wrap">
                    <Badge variant="outline">{selectedScenario.name}</Badge>
                    <div className="flex items-center gap-1">
                      {[...Array(3)].map((_, i) => (
                        <Heart key={i} className={`h-4 w-4 ${i < lives ? "text-red-500 fill-red-500" : "text-muted-foreground"}`} />
                      ))}
                    </div>
                    <Badge variant="secondary">⭐ {score}</Badge>
                    <Badge variant="outline">⏱️ {formatTime(timer)}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setIsPlaying(!isPlaying)}>
                      {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setSelectedScenario(null); setIsPlaying(false); }}>
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <Progress value={progress} className="h-2" />
                {/* 3D Scene */}
                <div className="rounded-lg overflow-hidden border" style={{ height: 350 }}>
                  <Canvas camera={{ position: [10, 8, 10], fov: 50 }} shadows>
                    <Suspense fallback={null}>
                      <GameScene scenario={selectedScenario} currentStep={currentStep} score={score} />
                    </Suspense>
                  </Canvas>
                </div>
                {/* Step Info */}
                {selectedScenario.steps[currentStep] && (
                  <Card className="border-primary/30">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={getCategoryColor(selectedScenario.steps[currentStep].category)}>
                            {getCategoryIcon(selectedScenario.steps[currentStep].category)}
                          </span>
                          <h3 className="font-semibold text-sm">{selectedScenario.steps[currentStep].title}</h3>
                        </div>
                        <Badge variant="outline" className="text-xs">+{selectedScenario.steps[currentStep].points} pts</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{selectedScenario.steps[currentStep].instruction}</p>
                      {showQuiz && selectedScenario.steps[currentStep].quizQuestion && (
                        <div className="bg-muted/50 rounded-lg p-3 mb-3">
                          <p className="text-sm font-medium mb-2">🧠 {selectedScenario.steps[currentStep].quizQuestion}</p>
                          <div className="grid gap-1.5">
                            {selectedScenario.steps[currentStep].quizOptions?.map((opt, idx) => (
                              <Button key={idx} variant={quizAnswer === null ? "outline" : idx === selectedScenario.steps[currentStep].quizAnswer ? "default" : quizAnswer === idx ? "destructive" : "outline"} size="sm" className="justify-start text-xs h-8" disabled={quizAnswer !== null} onClick={() => handleQuizAnswer(idx)}>
                                {String.fromCharCode(65 + idx)}. {opt}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}
                      {!showQuiz && (
                        <Button onClick={handleStepComplete} className="w-full" size="sm">
                          {currentStep < selectedScenario.steps.length - 1 ? <>Complete & Next <ChevronRight className="h-3 w-3 ml-1" /></> : <>Finish Training <Award className="h-3 w-3 ml-1" /></>}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {selectedScenario.steps.map((step, idx) => (
                    <div key={step.id} className={`flex-shrink-0 h-1.5 rounded-full transition-colors ${completedSteps.has(step.id) ? "bg-primary" : idx === currentStep ? "bg-primary/50" : "bg-muted"}`} style={{ width: `${100 / selectedScenario.steps.length}%` }} />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* VIDEO SIMULATIONS TAB */}
          <TabsContent value="video">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Video Simulation Games</h3>
                {isAdmin && (
                  <Button size="sm" onClick={() => { setUploadType("video"); setShowUploadDialog(true); }}>
                    <Upload className="h-3 w-3 mr-1" />Upload Video
                  </Button>
                )}
              </div>
              {scenarios.filter(s => s.simulationType === "video").length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Video className="h-12 w-12 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No video simulations uploaded yet</p>
                  {isAdmin && <p className="text-xs mt-1">Upload video walkthroughs for field training</p>}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {scenarios.filter(s => s.simulationType === "video").map(scenario => (
                    <Card key={scenario.id} className="cursor-pointer hover:shadow-lg transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="font-semibold text-sm">{scenario.name}</h3>
                          <Badge variant="outline" className="text-[10px]"><Video className="h-3 w-3 mr-0.5" />Video</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">{scenario.description}</p>
                        {scenario.formId && <Badge variant="outline" className="text-[8px] mr-1">Form Linked</Badge>}
                        {scenario.projectId && <Badge variant="outline" className="text-[8px]">Project Linked</Badge>}
                        <div className="flex gap-2 mt-3">
                          <Button className="flex-1" size="sm" onClick={() => startScenario(scenario)}>
                            <Play className="h-3 w-3 mr-1" />Watch
                          </Button>
                          {isAdmin && scenario.dbId && (
                            <Button variant="outline" size="sm" onClick={() => openAccessDialog(scenario.dbId!)}>
                              <UserPlus className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* DESIGN TAB */}
          {isAdmin && (
            <TabsContent value="design">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Scenario Designer</h3>
                  <Button size="sm" onClick={() => setEditingScenario({
                    id: `new-${Date.now()}`, name: "New Training Scenario", description: "",
                    environment: "village", difficulty: "beginner", steps: [], maxScore: 0, simulationType: "vr_3d",
                  })}>
                    <Plus className="h-3 w-3 mr-1" />Create Scenario
                  </Button>
                </div>
                {dbScenarios.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">No custom scenarios yet. Create one to get started!</p>
                )}
                {dbScenarios.map(scenario => (
                  <Card key={scenario.id}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium">{scenario.name}</h4>
                        <p className="text-xs text-muted-foreground">
                          {scenario.steps.length} steps · {scenario.difficulty} · {scenario.simulationType === "video" ? "Video" : "3D VR"}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="outline" size="sm" onClick={() => setEditingScenario(scenario)}>Edit</Button>
                        <Button variant="outline" size="sm" onClick={() => openAccessDialog(scenario.dbId!)}>
                          <UserPlus className="h-3 w-3" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => startScenario(scenario)}>
                          <Play className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteSimulation(scenario)}>
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          )}

          {/* ACCESS TAB */}
          {(isOwner || isAdmin) && (
            <TabsContent value="access">
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Simulation Access Management</h3>
                <p className="text-xs text-muted-foreground">Grant or revoke user access to specific simulations. Default 3D scenarios are accessible to all authenticated users.</p>
                {dbScenarios.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Create or upload simulations first to manage access.</p>
                ) : (
                  <div className="space-y-2">
                    {dbScenarios.map(scenario => (
                      <Card key={scenario.id}>
                        <CardContent className="p-3 flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-medium flex items-center gap-2">
                              {scenario.simulationType === "video" ? <Video className="h-3 w-3" /> : <Glasses className="h-3 w-3" />}
                              {scenario.name}
                            </h4>
                            <p className="text-xs text-muted-foreground">
                              {scenario.formId && "Form linked · "}
                              {scenario.projectId && "Project linked · "}
                              {scenario.simulationType === "video" ? "Video" : "3D VR"}
                            </p>
                          </div>
                          <Button size="sm" variant="outline" onClick={() => openAccessDialog(scenario.dbId!)}>
                            <UserPlus className="h-3 w-3 mr-1" />Manage Access
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          )}

          {/* LEADERBOARD */}
          <TabsContent value="leaderboard">
            <div className="text-center py-8 text-muted-foreground">
              <Trophy className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Leaderboard populates as users complete training</p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Scenario Editor Dialog */}
        <Dialog open={!!editingScenario} onOpenChange={(open) => { if (!open) setEditingScenario(null); }}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader><DialogTitle>Scenario Designer</DialogTitle></DialogHeader>
            {editingScenario && (
              <ScrollArea className="max-h-[60vh] pr-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Name</Label>
                      <Input value={editingScenario.name} onChange={e => setEditingScenario({ ...editingScenario, name: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">Type</Label>
                      <Select value={editingScenario.simulationType || "vr_3d"} onValueChange={(v: any) => setEditingScenario({ ...editingScenario, simulationType: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="vr_3d">3D VR Simulation</SelectItem>
                          <SelectItem value="video">Video Simulation</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Environment</Label>
                      <Select value={editingScenario.environment} onValueChange={(v: any) => setEditingScenario({ ...editingScenario, environment: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="village">Village</SelectItem>
                          <SelectItem value="urban">Urban</SelectItem>
                          <SelectItem value="clinic">Clinic</SelectItem>
                          <SelectItem value="school">School</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Difficulty</Label>
                      <Select value={editingScenario.difficulty} onValueChange={(v: any) => setEditingScenario({ ...editingScenario, difficulty: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="beginner">Beginner</SelectItem>
                          <SelectItem value="intermediate">Intermediate</SelectItem>
                          <SelectItem value="advanced">Advanced</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Description</Label>
                    <Textarea value={editingScenario.description} onChange={e => setEditingScenario({ ...editingScenario, description: e.target.value })} rows={2} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Link to Form (optional)</Label>
                      <Select value={editingScenario.formId || "none"} onValueChange={v => setEditingScenario({ ...editingScenario, formId: v === "none" ? undefined : v })}>
                        <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Link to Project (optional)</Label>
                      <Select value={editingScenario.projectId || "none"} onValueChange={v => setEditingScenario({ ...editingScenario, projectId: v === "none" ? undefined : v })}>
                        <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {editingScenario.simulationType !== "video" && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <Label className="text-xs font-semibold">Steps ({editingScenario.steps.length})</Label>
                        <Button size="sm" variant="outline" onClick={addStep}><Plus className="h-3 w-3 mr-1" />Add Step</Button>
                      </div>
                      {editingScenario.steps.map((step, idx) => (
                        <Card key={step.id} className="mb-2">
                          <CardContent className="p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <Badge variant="outline" className="text-[10px]">Step {idx + 1}</Badge>
                              <Button variant="ghost" size="sm" onClick={() => deleteStep(step.id)}><Trash2 className="h-3 w-3 text-destructive" /></Button>
                            </div>
                            <Input placeholder="Step title" value={step.title} onChange={e => updateStep(step.id, { title: e.target.value })} className="text-xs" />
                            <Textarea placeholder="Instructions" value={step.instruction} onChange={e => updateStep(step.id, { instruction: e.target.value })} rows={2} className="text-xs" />
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <Label className="text-[10px]">Category</Label>
                                <Select value={step.category} onValueChange={(v: any) => updateStep(step.id, { category: v })}>
                                  <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {["navigation", "form", "gps", "media", "submission", "interaction"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-[10px]">Duration (s)</Label>
                                <Input type="number" value={step.duration} onChange={e => updateStep(step.id, { duration: parseInt(e.target.value) || 5 })} className="h-7 text-xs" />
                              </div>
                              <div>
                                <Label className="text-[10px]">Points</Label>
                                <Input type="number" value={step.points} onChange={e => updateStep(step.id, { points: parseInt(e.target.value) || 5 })} className="h-7 text-xs" />
                              </div>
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
              <Button onClick={saveCustomScenario}><Save className="h-3 w-3 mr-1" />Save Scenario</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Upload Simulation Dialog */}
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Upload Simulation</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder="e.g. Field Survey Walkthrough" />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea value={uploadDescription} onChange={e => setUploadDescription(e.target.value)} rows={2} placeholder="Brief description of the simulation..." />
              </div>
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={uploadType} onValueChange={(v: any) => setUploadType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="video">Video Simulation</SelectItem>
                    <SelectItem value="vr_3d">3D VR Scenario</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Upload Video/Media File</Label>
                <Input type="file" accept="video/*,.mp4,.webm,.mov" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Link to Form</Label>
                  <Select value={uploadFormId || "none"} onValueChange={v => setUploadFormId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {forms.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Link to Project</Label>
                  <Select value={uploadProjectId || "none"} onValueChange={v => setUploadProjectId(v === "none" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowUploadDialog(false)}>Cancel</Button>
              <Button onClick={handleUploadSimulation} disabled={uploading || !uploadName.trim()}>
                {uploading ? "Uploading..." : <><Upload className="h-3 w-3 mr-1" />Upload</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Access Control Dialog */}
        <Dialog open={showAccessDialog} onOpenChange={setShowAccessDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="flex items-center gap-2"><Lock className="h-4 w-4" />Manage Simulation Access</DialogTitle></DialogHeader>
            {loadingAccess ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading users...</p>
            ) : (
              <ScrollArea className="max-h-[400px]">
                <div className="space-y-2">
                  {allUsers.map(u => (
                    <div key={u.user_id} className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/30">
                      <div>
                        <p className="text-sm font-medium">{u.first_name} {u.last_name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[8px]">{u.designation}</Badge>
                        <Checkbox
                          checked={grantedUserIds.includes(u.user_id)}
                          onCheckedChange={() => toggleUserAccess(u.user_id)}
                        />
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
      </CardContent>
    </Card>
  );
};

export default VRTrainingGame;
