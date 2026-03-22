import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Glasses, Play, Pause, SkipForward, RotateCcw, CheckCircle,
  MapPin, Camera, FileText, Send, ChevronRight, Award,
} from "lucide-react";

interface TrainingStep {
  id: string;
  title: string;
  description: string;
  instruction: string;
  icon: React.ReactNode;
  duration: number; // seconds
  category: "navigation" | "form" | "gps" | "media" | "submission";
}

const TRAINING_STEPS: TrainingStep[] = [
  {
    id: "welcome",
    title: "Welcome to Field Training",
    description: "Learn how to use the data collection app effectively in the field.",
    instruction: "This VR simulation will guide you through the complete data collection workflow. Follow each step carefully.",
    icon: <Glasses className="h-6 w-6" />,
    duration: 5,
    category: "navigation",
  },
  {
    id: "login",
    title: "Step 1: Logging In",
    description: "Open the app and sign in with your credentials.",
    instruction: "Use the email and password provided by your administrator. The app will verify your identity and check your device.",
    icon: <FileText className="h-6 w-6" />,
    duration: 8,
    category: "navigation",
  },
  {
    id: "select-form",
    title: "Step 2: Select a Form",
    description: "Navigate to the Forms section and choose the assigned form.",
    instruction: "Tap on 'Forms' in the bottom navigation. You'll see forms assigned to you. Tap 'Fill Form' on the correct one.",
    icon: <FileText className="h-6 w-6" />,
    duration: 8,
    category: "form",
  },
  {
    id: "gps-capture",
    title: "Step 3: Enable GPS",
    description: "Allow location access when prompted for geolocation tracking.",
    instruction: "The app needs your GPS to verify you're in the correct area. Tap 'Allow' when the permission dialog appears. Wait for an accurate reading (±10m or better).",
    icon: <MapPin className="h-6 w-6" />,
    duration: 10,
    category: "gps",
  },
  {
    id: "geofence",
    title: "Step 4: Geofence Compliance",
    description: "Ensure you're within the designated operational area.",
    instruction: "If the form has geofencing enabled, you must be inside the boundary. A green badge means you're compliant. Red means you need to move to the correct zone.",
    icon: <MapPin className="h-6 w-6" />,
    duration: 8,
    category: "gps",
  },
  {
    id: "fill-text",
    title: "Step 5: Answer Text Questions",
    description: "Type responses clearly and accurately.",
    instruction: "Read each question carefully. Type your answer in the text field. If a question is marked with a red asterisk (*), it's required and must be filled before submission.",
    icon: <FileText className="h-6 w-6" />,
    duration: 10,
    category: "form",
  },
  {
    id: "fill-select",
    title: "Step 6: Select Options",
    description: "Choose from dropdown or radio button options.",
    instruction: "For 'Select One' questions, tap the circle next to your choice. For 'Select Multiple', tap all checkboxes that apply. Some options cascade based on previous answers.",
    icon: <FileText className="h-6 w-6" />,
    duration: 10,
    category: "form",
  },
  {
    id: "photo-capture",
    title: "Step 7: Capture Photos",
    description: "Take clear photos when required by the form.",
    instruction: "Tap the camera icon. Hold your device steady and ensure good lighting. The app automatically records GPS and timestamp in the photo metadata for verification.",
    icon: <Camera className="h-6 w-6" />,
    duration: 10,
    category: "media",
  },
  {
    id: "repeat-groups",
    title: "Step 8: Repeat Groups",
    description: "Handle repeating sections for multiple entries.",
    instruction: "Some forms have repeat groups (e.g., multiple household members). Use the '+' button to add iterations. If you can't complete all required iterations, provide a reason.",
    icon: <FileText className="h-6 w-6" />,
    duration: 10,
    category: "form",
  },
  {
    id: "field-notes",
    title: "Step 9: Field Challenge Notes",
    description: "Report any issues encountered during data collection.",
    instruction: "Before submitting, expand 'Field Challenge Notes' to describe any problems: hostile respondents, weather issues, access difficulties, etc. This helps supervisors understand context.",
    icon: <FileText className="h-6 w-6" />,
    duration: 8,
    category: "form",
  },
  {
    id: "review-submit",
    title: "Step 10: Review & Submit",
    description: "Check all answers before final submission.",
    instruction: "Scroll through your responses. Fix any validation errors (shown in red). When satisfied, tap 'Submit Form'. If offline, the app saves locally and syncs when connectivity returns.",
    icon: <Send className="h-6 w-6" />,
    duration: 10,
    category: "submission",
  },
  {
    id: "complete",
    title: "Training Complete!",
    description: "You've completed the field data collection training.",
    instruction: "You're now ready to collect data in the field. Remember: accuracy is more important than speed. Take your time with each response.",
    icon: <Award className="h-6 w-6" />,
    duration: 5,
    category: "navigation",
  },
];

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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Glasses className="h-5 w-5 text-primary" />
              VR Training Simulation
            </CardTitle>
            <CardDescription>Interactive guided walkthrough for field data collectors</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {completedSteps.size}/{totalSteps} steps
            </Badge>
            <Badge variant={progress >= 100 ? "default" : "secondary"} className="text-xs">
              {progress >= 100 ? "✓ Complete" : `${Math.round(progress)}% Progress`}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress bar */}
        <Progress value={progress} className="h-2" />

        {/* VR Scene */}
        <div
          className="relative rounded-xl overflow-hidden border"
          style={{
            height: 380,
            background: `radial-gradient(ellipse at center, ${getCategoryColor(step.category)}15 0%, hsl(var(--background)) 70%)`,
          }}
        >
          {/* Step indicator dots */}
          <div className="absolute top-3 left-0 right-0 flex justify-center gap-1.5 z-10">
            {TRAINING_STEPS.map((s, i) => (
              <div
                key={s.id}
                className="rounded-full cursor-pointer"
                style={{
                  width: i === currentStep ? 20 : 8,
                  height: 8,
                  background: completedSteps.has(s.id) ? getCategoryColor(s.category) : i === currentStep ? getCategoryColor(s.category) : "hsl(var(--muted))",
                  opacity: i === currentStep ? 1 : 0.6,
                  transition: "all 0.3s ease",
                }}
                onClick={() => { setCurrentStep(i); setTimer(0); }}
              />
            ))}
          </div>

          {/* Central content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
            {/* Icon with glow */}
            <div
              className="flex items-center justify-center rounded-full mb-4"
              style={{
                width: 80,
                height: 80,
                background: `${getCategoryColor(step.category)}22`,
                boxShadow: `0 0 40px ${getCategoryColor(step.category)}33`,
                color: getCategoryColor(step.category),
              }}
            >
              {step.icon}
            </div>

            <Badge variant="outline" className="mb-2 text-[10px]" style={{ borderColor: getCategoryColor(step.category), color: getCategoryColor(step.category) }}>
              {step.category.toUpperCase()}
            </Badge>

            <h2 className="text-xl font-bold text-foreground mb-2">{step.title}</h2>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">{step.description}</p>

            {/* Instruction card */}
            <div className="bg-card/80 border rounded-lg p-4 max-w-lg backdrop-blur-sm">
              <p className="text-sm text-foreground leading-relaxed">{step.instruction}</p>
            </div>

            {/* Timer */}
            {isPlaying && (
              <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                <Progress value={(timer / step.duration) * 100} className="w-24 h-1" />
                <span>{step.duration - timer}s</span>
              </div>
            )}
          </div>

          {/* Floating decorative elements */}
          <div className="absolute top-6 left-6 opacity-10" style={{ color: getCategoryColor(step.category) }}>
            <div className="w-16 h-16 border-2 rounded-lg" style={{ borderColor: "currentColor", transform: "rotate(15deg)" }} />
          </div>
          <div className="absolute bottom-6 right-6 opacity-10" style={{ color: getCategoryColor(step.category) }}>
            <div className="w-12 h-12 border-2 rounded-full" style={{ borderColor: "currentColor" }} />
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
            <Button
              size="sm"
              onClick={() => setIsPlaying(!isPlaying)}
              variant={isPlaying ? "secondary" : "default"}
            >
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

        {/* Step list */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mt-2">
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