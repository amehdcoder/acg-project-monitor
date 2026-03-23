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

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 15, 5]} intensity={0.8} castShadow />
      <Sky sunPosition={[100, 20, 100]} />
      <Stars radius={100} depth={50} count={1000} fade />

      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial color={environment === "village" ? "#7CCD7C" : "#C2B280"} />
      </mesh>

      {/* Path */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[2, 20]} />
        <meshStandardMaterial color="#D2B48C" />
      </mesh>

      {/* Environment objects */}
      {environment === "village" && (
        <>
          <VillageHouse position={[-5, 0, -3]} color="#CD853F" />
          <VillageHouse position={[5, 0, -5]} color="#DEB887" />
          <VillageHouse position={[-4, 0, 5]} color="#D2691E" />
          <Tree position={[-8, 0, 0]} />
          <Tree position={[8, 0, 2]} />
          <Tree position={[3, 0, 8]} />
          <Tree position={[-6, 0, -8]} />
        </>
      )}

      {/* NPC at current step position */}
      {step?.npcName && (
        <NPC position={[0, 0, -2]} name={step.npcName} speaking={true} />
      )}

      {/* Tablet for form filling steps */}
      {step?.category === "form" && (
        <Tablet position={[1.5, 1, 0]} showForm={true} />
      )}

      {/* Score indicator */}
      <Float speed={1} floatIntensity={0.3}>
        <Text position={[0, 4, -5]} fontSize={0.4} color="#fbbf24" anchorX="center">
          ⭐ Score: {score}
        </Text>
      </Float>

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
    description: "Conduct a household survey in a Nigerian village community. Interview residents, capture GPS, take photos, and submit data.",
    environment: "village",
    difficulty: "beginner",
    maxScore: 100,
    timeLimit: 600,
    steps: [
      {
        id: "arrive", title: "Arrive at Village", description: "Navigate to the assigned community",
        instruction: "You've arrived at the village. Look around to familiarize yourself with the area. The community leader is waiting near the first house.",
        category: "navigation", duration: 5, points: 5, npcName: "Chief Adamu",
      },
      {
        id: "greet", title: "Greet Community Leader", description: "Introduce yourself to the community leader",
        instruction: "Approach the community leader and introduce yourself. Explain the purpose of the survey and get consent.",
        category: "interaction", duration: 8, points: 10, npcName: "Chief Adamu",
        quizQuestion: "What should you do FIRST when arriving at a community?",
        quizOptions: ["Start collecting data immediately", "Introduce yourself to the community leader", "Take photos of everything", "Set up your equipment"],
        quizAnswer: 1,
      },
      {
        id: "check-gps", title: "Capture GPS Location", description: "Record your current GPS coordinates",
        instruction: "Open the app and wait for GPS lock. Ensure accuracy is within 10 meters before proceeding.",
        category: "gps", duration: 10, points: 15,
      },
      {
        id: "open-form", title: "Open Survey Form", description: "Select and open the assigned form",
        instruction: "Navigate to Forms → Fill Form. Select 'Community Health Survey'. The form will load with all questions.",
        category: "form", duration: 5, points: 10,
      },
      {
        id: "interview", title: "Conduct Interview", description: "Ask survey questions to household member",
        instruction: "Ask each question clearly in the local language. Record responses accurately. Don't rush — quality matters more than speed.",
        category: "form", duration: 15, points: 20, npcName: "Mrs. Fatima",
        quizQuestion: "If a respondent doesn't understand a question, what should you do?",
        quizOptions: ["Skip the question", "Answer it yourself", "Rephrase in local language", "Mark as N/A"],
        quizAnswer: 2,
      },
      {
        id: "photo", title: "Capture Photo Evidence", description: "Take a photo of the household",
        instruction: "Use the camera to photograph the household. Ensure the photo is clear, well-lit, and shows relevant details. Check GPS metadata is embedded.",
        category: "media", duration: 8, points: 15,
      },
      {
        id: "review", title: "Review Before Submission", description: "Check all fields are complete",
        instruction: "Scroll through the form. Look for any empty required fields (marked with *). Verify GPS coordinates are captured. Check that photos are attached.",
        category: "form", duration: 8, points: 10,
        quizQuestion: "Why is it important to review the form before submitting?",
        quizOptions: ["To waste time", "To catch errors and missing data", "It's not important", "To impress the supervisor"],
        quizAnswer: 1,
      },
      {
        id: "submit", title: "Submit Form", description: "Finalize and send the completed form",
        instruction: "Tap 'Submit'. If online, the form syncs immediately. If offline, it saves locally and syncs when connectivity returns.",
        category: "submission", duration: 5, points: 15,
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
