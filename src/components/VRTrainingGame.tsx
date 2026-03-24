import { useState, useEffect, useRef, Suspense, useCallback, useMemo } from "react";
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
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Glasses, Play, Pause, SkipForward, RotateCcw, CheckCircle,
  MapPin, Camera, FileText, Send, ChevronRight, Award, Plus,
  Trash2, Save, Settings, Gamepad2, Users, Globe, Volume2,
  Star, Trophy, Heart, Shield, Zap, Target, Navigation,
} from "lucide-react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, Environment, Float, RoundedBox, Sky, Stars } from "@react-three/drei";
import * as THREE from "three";
import { toast } from "@/hooks/use-toast";

// ========================
// 3D Scene Components
// ========================

function VillageHouse({ position, color }: { position: [number, number, number]; color: string }) {
  return (
    <group position={position}>
      {/* Base */}
      <RoundedBox args={[2, 1.5, 2]} radius={0.05} position={[0, 0.75, 0]}>
        <meshStandardMaterial color={color} roughness={0.8} />
      </RoundedBox>
      {/* Roof */}
      <mesh position={[0, 1.8, 0]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[1.8, 1, 4]} />
        <meshStandardMaterial color="#8B4513" roughness={0.9} />
      </mesh>
      {/* Door */}
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
      {/* Body */}
      <mesh position={[0, 0.6, 0]}>
        <capsuleGeometry args={[0.2, 0.6, 4, 8]} />
        <meshStandardMaterial color="#DEB887" />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.2, 0]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#D2B48C" />
      </mesh>
      {/* Name label */}
      <Text position={[0, 1.6, 0]} fontSize={0.15} color="#ffffff" anchorX="center">
        {name}
      </Text>
      {speaking && (
        <Float speed={3} floatIntensity={0.2}>
          <Text position={[0.5, 1.5, 0]} fontSize={0.12} color="#fbbf24" anchorX="left">
            💬
          </Text>
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

function GameScene({ scenario, currentStep, score }: {
  scenario: GameScenario;
  currentStep: number;
  score: number;
}) {
  const step = scenario.steps[currentStep];
  const environment = scenario.environment || "village";
  const groupRef = useRef<THREE.Group>(null);

  // Gentle camera sway for immersion
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.1) * 0.02;
    }
  });

  return (
    <>
      <ambientLight intensity={0.45} />
      <directionalLight position={[10, 15, 5]} intensity={0.9} castShadow shadow-mapSize-width={1024} shadow-mapSize-height={1024} />
      <pointLight position={[-5, 3, 5]} intensity={0.3} color="#fbbf24" />
      <Sky sunPosition={environment === "village" ? [100, 20, 100] : [50, 40, 80]} />
      <Stars radius={100} depth={50} count={800} fade />

      <group ref={groupRef}>
        {/* Ground with terrain variation */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[60, 60]} />
          <meshStandardMaterial color={environment === "village" ? "#6aad6a" : environment === "clinic" ? "#b8c9b8" : environment === "school" ? "#8fbc8f" : "#C2B280"} />
        </mesh>

        {/* Dirt path */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <planeGeometry args={[2, 25]} />
          <meshStandardMaterial color="#C4A47C" />
        </mesh>

        {/* Cross path */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <planeGeometry args={[15, 1.5]} />
          <meshStandardMaterial color="#C4A47C" />
        </mesh>

        {/* Environment objects */}
        {environment === "village" && (
          <>
            <VillageHouse position={[-5, 0, -3]} color="#CD853F" />
            <VillageHouse position={[5, 0, -5]} color="#DEB887" />
            <VillageHouse position={[-4, 0, 5]} color="#D2691E" />
            <VillageHouse position={[7, 0, 4]} color="#B8860B" />
            <VillageHouse position={[-7, 0, -7]} color="#DAA520" />
            <Tree position={[-8, 0, 0]} />
            <Tree position={[8, 0, 2]} />
            <Tree position={[3, 0, 8]} />
            <Tree position={[-6, 0, -8]} />
            <Tree position={[10, 0, -4]} />
            <Tree position={[-10, 0, 6]} />
            {/* Well */}
            <mesh position={[3, 0.3, -2]}>
              <cylinderGeometry args={[0.6, 0.7, 0.6, 12]} />
              <meshStandardMaterial color="#888888" />
            </mesh>
          </>
        )}

        {environment === "clinic" && (
          <>
            <RoundedBox args={[6, 2.5, 4]} radius={0.1} position={[0, 1.25, -4]}>
              <meshStandardMaterial color="#e8e8e8" />
            </RoundedBox>
            <Text position={[0, 2.8, -1.99]} fontSize={0.3} color="#1B5E20" anchorX="center">PHC Clinic</Text>
            <Tree position={[-5, 0, 2]} />
            <Tree position={[5, 0, 2]} />
          </>
        )}

        {environment === "school" && (
          <>
            <RoundedBox args={[8, 2, 3]} radius={0.1} position={[0, 1, -4]}>
              <meshStandardMaterial color="#f5f0e0" />
            </RoundedBox>
            <Text position={[0, 2.3, -2.49]} fontSize={0.25} color="#1565C0" anchorX="center">Community School</Text>
            <Tree position={[-6, 0, 3]} />
            <Tree position={[6, 0, 3]} />
          </>
        )}

        {/* NPC at current step */}
        {step?.npcName && (
          <NPC position={[0, 0, -2]} name={step.npcName} speaking={true} />
        )}

        {/* Tablet for form steps */}
        {step?.category === "form" && (
          <Tablet position={[1.5, 1, 0]} showForm={true} />
        )}

        {/* GPS marker for gps steps */}
        {step?.category === "gps" && (
          <Float speed={2} floatIntensity={0.4}>
            <mesh position={[0, 2, 0]}>
              <coneGeometry args={[0.3, 0.6, 8]} />
              <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.3} />
            </mesh>
          </Float>
        )}

        {/* Camera for media steps */}
        {step?.category === "media" && (
          <Float speed={1.5} floatIntensity={0.3}>
            <RoundedBox args={[0.5, 0.35, 0.3]} radius={0.05} position={[2, 1.5, 1]}>
              <meshStandardMaterial color="#333" metalness={0.7} roughness={0.2} />
            </RoundedBox>
          </Float>
        )}

        {/* Score indicator */}
        <Float speed={1} floatIntensity={0.3}>
          <Text position={[0, 5, -8]} fontSize={0.4} color="#fbbf24" anchorX="center">
            ⭐ Score: {score}
          </Text>
        </Float>
      </group>

      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={25}
        maxPolarAngle={Math.PI / 2.2}
        target={[0, 1, 0]}
      />
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
  requiredAction?: string;
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
}

// Default scenarios
const DEFAULT_SCENARIOS: GameScenario[] = [
  {
    id: "community-survey",
    name: "Community Health Survey",
    description: "Conduct a household survey in a Nigerian village. Interview residents, capture GPS, take photos, and submit data while following proper field protocols.",
    environment: "village",
    difficulty: "beginner",
    maxScore: 100,
    timeLimit: 600,
    steps: [
      {
        id: "arrive", title: "Arrive at Village", description: "Navigate to the assigned community",
        instruction: "You've arrived at the village. Look around to familiarize yourself with the area. The community leader (Baale) is waiting near the first house. Always greet elders first — this is essential for community entry in Nigerian settings.",
        category: "navigation", duration: 5, points: 5, npcName: "Chief Adamu",
      },
      {
        id: "greet", title: "Greet Community Leader", description: "Introduce yourself and get consent",
        instruction: "Approach the community leader and introduce yourself. Show your ID badge. Explain the survey purpose in simple terms. Request verbal consent and explain data privacy. Remember: in many Nigerian communities, the leader's approval is needed before household visits.",
        category: "interaction", duration: 8, points: 10, npcName: "Chief Adamu",
        quizQuestion: "What should you do FIRST when arriving at a Nigerian community?",
        quizOptions: ["Start collecting data immediately", "Greet the community leader and explain your purpose", "Take photos of everything", "Set up your equipment"],
        quizAnswer: 1,
      },
      {
        id: "check-gps", title: "Capture GPS Location", description: "Record GPS coordinates with accuracy check",
        instruction: "Open the app and wait for GPS lock. Ensure accuracy is within 10 meters before proceeding. Stand in an open area away from buildings for better satellite reception. In rural Nigeria, tree cover may affect GPS — be patient.",
        category: "gps", duration: 10, points: 15,
        quizQuestion: "What GPS accuracy level should you achieve before recording?",
        quizOptions: ["Within 100 meters", "Within 50 meters", "Within 10 meters", "Accuracy doesn't matter"],
        quizAnswer: 2,
      },
      {
        id: "open-form", title: "Open Survey Form", description: "Select and load the assigned form",
        instruction: "Navigate to Forms → Fill Form. Select 'Community Health Survey'. Verify you're using the correct form version. Check that the form loads all question groups before starting.",
        category: "form", duration: 5, points: 10,
      },
      {
        id: "interview", title: "Conduct Household Interview", description: "Interview household head with proper technique",
        instruction: "Ask each question clearly in the local language (Hausa/Yoruba/Igbo as appropriate). Record responses accurately. Don't lead the respondent. For sensitive questions (income, health), ensure privacy. Quality matters more than speed.",
        category: "form", duration: 15, points: 20, npcName: "Mrs. Fatima",
        quizQuestion: "If a respondent doesn't understand a question, what should you do?",
        quizOptions: ["Skip the question", "Answer it yourself", "Rephrase clearly in local language", "Mark as N/A"],
        quizAnswer: 2,
      },
      {
        id: "photo", title: "Capture Photo Evidence", description: "Photograph the household with metadata",
        instruction: "Take a clear photo of the household from the front. Ensure GPS metadata is embedded. The photo should be well-lit — if indoors, ask permission to use flash. Never photograph people without consent.",
        category: "media", duration: 8, points: 15,
      },
      {
        id: "review", title: "Review Before Submission", description: "Quality-check all fields",
        instruction: "Scroll through the entire form. Look for empty required fields (marked with *). Verify GPS coordinates. Check that photos are attached and clear. Cross-check numeric entries for obvious errors (e.g., age = 999).",
        category: "form", duration: 8, points: 10,
        quizQuestion: "Why is it important to review the form before submitting?",
        quizOptions: ["To waste time", "To catch errors and missing data", "It's not important", "To impress the supervisor"],
        quizAnswer: 1,
      },
      {
        id: "submit", title: "Submit Form", description: "Finalize and submit the completed form",
        instruction: "Tap 'Submit'. If online, the form syncs immediately. If offline (common in rural Nigeria), it saves locally and auto-syncs when you reach a network area. Check the sync indicator before leaving the community.",
        category: "submission", duration: 5, points: 15,
      },
    ],
  },
  {
    id: "ntd-mda",
    name: "NTD Mass Drug Administration",
    description: "Simulate a Community-Directed Distribution (CDD) exercise for NTD treatment. Distribute Ivermectin using dose poles, record treatments, and handle refusals properly.",
    environment: "village",
    difficulty: "intermediate",
    maxScore: 120,
    timeLimit: 900,
    steps: [
      {
        id: "setup", title: "Set Up Distribution Point", description: "Prepare the treatment area",
        instruction: "Set up the distribution point near the community leader's compound. Lay out the dose pole, treatment register, and drug supplies. Ensure you have enough Ivermectin tablets for the estimated population.",
        category: "navigation", duration: 5, points: 10, npcName: "Health Worker Binta",
      },
      {
        id: "measure", title: "Measure with Dose Pole", description: "Use the dose pole to determine dosage",
        instruction: "Have each person stand against the dose pole. Read the color band at shoulder height to determine the correct number of tablets. Children under 90cm or pregnant women should NOT be treated.",
        category: "interaction", duration: 10, points: 15, npcName: "Alhaji Musa",
        quizQuestion: "Who should NOT receive Ivermectin during MDA?",
        quizOptions: ["Adult males", "Pregnant women and children under 90cm", "Elderly people", "People who've eaten recently"],
        quizAnswer: 1,
      },
      {
        id: "record-gps", title: "Record GPS of Distribution Point", description: "Capture location data",
        instruction: "Record the GPS location of the distribution point. This helps map treatment coverage geographically.",
        category: "gps", duration: 5, points: 10,
      },
      {
        id: "treat", title: "Administer Treatment", description: "Give tablets and observe swallowing",
        instruction: "Give the correct number of tablets as per the dose pole. Watch the person swallow the tablets with water. Record the treatment in the form: name, age, sex, dose given. Mark DOT (Directly Observed Treatment).",
        category: "form", duration: 15, points: 20, npcName: "Patient Aminu",
      },
      {
        id: "handle-refusal", title: "Handle Treatment Refusal", description: "Document refusal properly",
        instruction: "Mrs. Khadija refuses treatment citing fear of side effects. Explain the benefits calmly. If she still refuses, record the refusal with reason. NEVER force treatment. Document for follow-up by the health worker.",
        category: "interaction", duration: 10, points: 15, npcName: "Mrs. Khadija",
        quizQuestion: "What should you do when someone refuses treatment?",
        quizOptions: ["Force them to take the medicine", "Record the refusal and reason, respect their choice", "Skip them entirely without recording", "Report them to the police"],
        quizAnswer: 1,
      },
      {
        id: "adverse", title: "Report Adverse Event", description: "Document and respond to side effects",
        instruction: "A community member reports dizziness and rashes after taking Ivermectin. Record the adverse event immediately. Advise rest and fluids. If severe, refer to the nearest health facility. Fill the adverse event form.",
        category: "form", duration: 10, points: 20,
        quizQuestion: "What is the first thing to do when someone reports side effects?",
        quizOptions: ["Ignore it, it's normal", "Record the adverse event and assess severity", "Give more medicine", "Tell them to go home"],
        quizAnswer: 1,
      },
      {
        id: "summary", title: "End-of-Day Summary", description: "Submit daily treatment summary",
        instruction: "Count total treated, total refused, adverse events. Submit the summary form with GPS. Ensure all records sync before leaving. Report to your supervisor via the app chat.",
        category: "submission", duration: 10, points: 15,
      },
    ],
  },
];

// ========================
// Main Component
// ========================

const VRTrainingGame = () => {
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
  const [showDesigner, setShowDesigner] = useState(false);

  // Scenario designer state
  const [editingScenario, setEditingScenario] = useState<GameScenario | null>(null);
  const [editingStep, setEditingStep] = useState<GameStep | null>(null);

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

    // Award points
    setScore(s => s + step.points);
    setCompletedSteps(prev => new Set([...prev, step.id]));

    // Check for quiz
    if (step.quizQuestion && !showQuiz) {
      setShowQuiz(true);
      return;
    }

    // Move to next step
    if (currentStep < selectedScenario.steps.length - 1) {
      setCurrentStep(c => c + 1);
      setShowQuiz(false);
      setQuizAnswer(null);
    } else {
      // Scenario complete
      setIsPlaying(false);
      toast({
        title: "🏆 Training Complete!",
        description: `Score: ${score + step.points}/${selectedScenario.maxScore} | Time: ${formatTime(timer)}`,
      });
    }
  };

  const handleQuizAnswer = (answerIdx: number) => {
    if (!selectedScenario) return;
    const step = selectedScenario.steps[currentStep];
    setQuizAnswer(answerIdx);

    if (answerIdx === step.quizAnswer) {
      setScore(s => s + 5); // Bonus points
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
      } else {
        setIsPlaying(false);
      }
    }, 1500);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const progress = selectedScenario
    ? ((currentStep + (completedSteps.has(selectedScenario.steps[currentStep]?.id) ? 1 : 0)) / selectedScenario.steps.length) * 100
    : 0;

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "navigation": return <Navigation className="h-4 w-4" />;
      case "form": return <FileText className="h-4 w-4" />;
      case "gps": return <MapPin className="h-4 w-4" />;
      case "media": return <Camera className="h-4 w-4" />;
      case "submission": return <Send className="h-4 w-4" />;
      case "interaction": return <Users className="h-4 w-4" />;
      default: return <Zap className="h-4 w-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "navigation": return "text-blue-400";
      case "form": return "text-green-400";
      case "gps": return "text-yellow-400";
      case "media": return "text-purple-400";
      case "submission": return "text-orange-400";
      case "interaction": return "text-pink-400";
      default: return "text-muted-foreground";
    }
  };

  // Scenario Designer helpers
  const saveCustomScenario = () => {
    if (!editingScenario) return;
    const maxScore = editingScenario.steps.reduce((sum, s) => sum + s.points, 0);
    const updated = { ...editingScenario, maxScore };
    setScenarios(prev => {
      const exists = prev.findIndex(s => s.id === updated.id);
      if (exists >= 0) {
        const copy = [...prev];
        copy[exists] = updated;
        return copy;
      }
      return [...prev, updated];
    });
    setEditingScenario(null);
    toast({ title: "Scenario Saved", description: `"${updated.name}" has been saved.` });
  };

  const addStep = () => {
    if (!editingScenario) return;
    const newStep: GameStep = {
      id: `step-${Date.now()}`,
      title: "New Step",
      description: "Description...",
      instruction: "Instructions for the trainee...",
      category: "form",
      duration: 10,
      points: 10,
    };
    setEditingScenario({
      ...editingScenario,
      steps: [...editingScenario.steps, newStep],
    });
  };

  const deleteStep = (stepId: string) => {
    if (!editingScenario) return;
    setEditingScenario({
      ...editingScenario,
      steps: editingScenario.steps.filter(s => s.id !== stepId),
    });
  };

  const updateStep = (stepId: string, updates: Partial<GameStep>) => {
    if (!editingScenario) return;
    setEditingScenario({
      ...editingScenario,
      steps: editingScenario.steps.map(s => s.id === stepId ? { ...s, ...updates } : s),
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Gamepad2 className="h-5 w-5 text-primary" />
              VR Training & Game Simulation
            </CardTitle>
            <CardDescription>Immersive 3D training scenarios for field data collectors</CardDescription>
          </div>
          <Badge variant="secondary" className="text-xs">
            {scenarios.length} scenarios
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-3">
            <TabsTrigger value="play"><Play className="h-3 w-3 mr-1" />Play</TabsTrigger>
            <TabsTrigger value="design"><Settings className="h-3 w-3 mr-1" />Design</TabsTrigger>
            <TabsTrigger value="leaderboard"><Trophy className="h-3 w-3 mr-1" />Leaderboard</TabsTrigger>
          </TabsList>

          {/* PLAY TAB */}
          <TabsContent value="play">
            {!selectedScenario ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {scenarios.map(scenario => (
                  <Card key={scenario.id} className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => startScenario(scenario)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-semibold text-sm">{scenario.name}</h3>
                        <Badge variant={scenario.difficulty === "beginner" ? "secondary" : scenario.difficulty === "intermediate" ? "default" : "destructive"} className="text-[10px]">
                          {scenario.difficulty}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{scenario.description}</p>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Globe className="h-3 w-3" />{scenario.environment}</span>
                        <span className="flex items-center gap-1"><Target className="h-3 w-3" />{scenario.steps.length} steps</span>
                        <span className="flex items-center gap-1"><Star className="h-3 w-3" />{scenario.maxScore} pts</span>
                      </div>
                      <Button className="w-full mt-3" size="sm">
                        <Play className="h-3 w-3 mr-1" />Start Training
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {/* HUD */}
                <div className="flex items-center justify-between flex-wrap gap-2 p-2 bg-muted/30 rounded-lg">
                  <div className="flex items-center gap-3">
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

                {/* Current Step Info */}
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
                        <Badge variant="outline" className="text-xs">
                          +{selectedScenario.steps[currentStep].points} pts
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">{selectedScenario.steps[currentStep].instruction}</p>

                      {/* Quiz */}
                      {showQuiz && selectedScenario.steps[currentStep].quizQuestion && (
                        <div className="bg-muted/50 rounded-lg p-3 mb-3">
                          <p className="text-sm font-medium mb-2">🧠 {selectedScenario.steps[currentStep].quizQuestion}</p>
                          <div className="grid gap-1.5">
                            {selectedScenario.steps[currentStep].quizOptions?.map((opt, idx) => (
                              <Button
                                key={idx}
                                variant={quizAnswer === null ? "outline" : idx === selectedScenario.steps[currentStep].quizAnswer ? "default" : quizAnswer === idx ? "destructive" : "outline"}
                                size="sm"
                                className="justify-start text-xs h-8"
                                disabled={quizAnswer !== null}
                                onClick={() => handleQuizAnswer(idx)}
                              >
                                {String.fromCharCode(65 + idx)}. {opt}
                              </Button>
                            ))}
                          </div>
                        </div>
                      )}

                      {!showQuiz && (
                        <Button onClick={handleStepComplete} className="w-full" size="sm">
                          {currentStep < selectedScenario.steps.length - 1 ? (
                            <>Complete & Next <ChevronRight className="h-3 w-3 ml-1" /></>
                          ) : (
                            <>Finish Training <Award className="h-3 w-3 ml-1" /></>
                          )}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Step Progress */}
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {selectedScenario.steps.map((step, idx) => (
                    <div
                      key={step.id}
                      className={`flex-shrink-0 h-1.5 rounded-full transition-colors ${
                        completedSteps.has(step.id)
                          ? "bg-primary"
                          : idx === currentStep
                          ? "bg-primary/50"
                          : "bg-muted"
                      }`}
                      style={{ width: `${100 / selectedScenario.steps.length}%` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          {/* DESIGN TAB */}
          <TabsContent value="design">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Custom Scenarios</h3>
                <Button size="sm" onClick={() => {
                  setEditingScenario({
                    id: `custom-${Date.now()}`,
                    name: "New Training Scenario",
                    description: "",
                    environment: "village",
                    difficulty: "beginner",
                    steps: [],
                    maxScore: 0,
                  });
                }}>
                  <Plus className="h-3 w-3 mr-1" />Create Scenario
                </Button>
              </div>

              {scenarios.filter(s => s.id.startsWith("custom-")).length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No custom scenarios yet. Create one to get started!</p>
              )}

              {scenarios.filter(s => s.id.startsWith("custom-")).map(scenario => (
                <Card key={scenario.id}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-medium">{scenario.name}</h4>
                      <p className="text-xs text-muted-foreground">{scenario.steps.length} steps · {scenario.difficulty}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" onClick={() => setEditingScenario(scenario)}>Edit</Button>
                      <Button variant="outline" size="sm" onClick={() => startScenario(scenario)}>
                        <Play className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* LEADERBOARD TAB */}
          <TabsContent value="leaderboard">
            <div className="text-center py-8 text-muted-foreground">
              <Trophy className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Leaderboard populates as users complete training scenarios</p>
              <p className="text-xs mt-1">Complete scenarios to see your ranking!</p>
            </div>
          </TabsContent>
        </Tabs>

        {/* Scenario Editor Dialog */}
        <Dialog open={!!editingScenario} onOpenChange={(open) => { if (!open) setEditingScenario(null); }}>
          <DialogContent className="max-w-2xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Scenario Designer</DialogTitle>
            </DialogHeader>
            {editingScenario && (
              <ScrollArea className="max-h-[60vh] pr-4">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Name</Label>
                      <Input value={editingScenario.name} onChange={e => setEditingScenario({ ...editingScenario, name: e.target.value })} />
                    </div>
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
                  </div>
                  <div>
                    <Label className="text-xs">Description</Label>
                    <Textarea value={editingScenario.description} onChange={e => setEditingScenario({ ...editingScenario, description: e.target.value })} rows={2} />
                  </div>
                  <div>
                    <Label className="text-xs">Difficulty</Label>
                    <Select value={editingScenario.difficulty} onValueChange={(v: any) => setEditingScenario({ ...editingScenario, difficulty: v })}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label className="text-xs font-semibold">Steps ({editingScenario.steps.length})</Label>
                      <Button size="sm" variant="outline" onClick={addStep}>
                        <Plus className="h-3 w-3 mr-1" />Add Step
                      </Button>
                    </div>
                    {editingScenario.steps.map((step, idx) => (
                      <Card key={step.id} className="mb-2">
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-[10px]">Step {idx + 1}</Badge>
                            <Button variant="ghost" size="sm" onClick={() => deleteStep(step.id)}>
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                          <Input placeholder="Step title" value={step.title} onChange={e => updateStep(step.id, { title: e.target.value })} className="text-xs" />
                          <Textarea placeholder="Instructions" value={step.instruction} onChange={e => updateStep(step.id, { instruction: e.target.value })} rows={2} className="text-xs" />
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <Label className="text-[10px]">Category</Label>
                              <Select value={step.category} onValueChange={(v: any) => updateStep(step.id, { category: v })}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {["navigation", "form", "gps", "media", "submission", "interaction"].map(c => (
                                    <SelectItem key={c} value={c}>{c}</SelectItem>
                                  ))}
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
                          <div>
                            <Label className="text-[10px]">NPC Name (optional)</Label>
                            <Input placeholder="e.g. Chief Adamu" value={step.npcName || ""} onChange={e => updateStep(step.id, { npcName: e.target.value || undefined })} className="h-7 text-xs" />
                          </div>
                          <div>
                            <Label className="text-[10px]">Quiz Question (optional)</Label>
                            <Input placeholder="Question text" value={step.quizQuestion || ""} onChange={e => updateStep(step.id, { quizQuestion: e.target.value || undefined })} className="h-7 text-xs" />
                          </div>
                          {step.quizQuestion && (
                            <div className="space-y-1">
                              {[0, 1, 2, 3].map(i => (
                                <div key={i} className="flex items-center gap-1">
                                  <input
                                    type="radio"
                                    name={`quiz-${step.id}`}
                                    checked={step.quizAnswer === i}
                                    onChange={() => updateStep(step.id, { quizAnswer: i })}
                                  />
                                  <Input
                                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                                    value={step.quizOptions?.[i] || ""}
                                    onChange={e => {
                                      const opts = [...(step.quizOptions || ["", "", "", ""])];
                                      opts[i] = e.target.value;
                                      updateStep(step.id, { quizOptions: opts });
                                    }}
                                    className="h-6 text-[10px]"
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingScenario(null)}>Cancel</Button>
              <Button onClick={saveCustomScenario}>
                <Save className="h-3 w-3 mr-1" />Save Scenario
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default VRTrainingGame;
