import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Stethoscope, User, ArrowRight, ArrowLeft, RotateCcw, CheckCircle2, Shield, Activity,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { GuidedQuestionFlow, AssessmentSummary, NTD_PROTOCOLS } from "./NTDAssessment";


// NTD clinical images
import ntdLymphoedema from "@/assets/ntd-lymphoedema.jpg";
import ntdHydrocoele from "@/assets/ntd-hydrocoele.jpg";
import ntdTrachoma from "@/assets/ntd-trachoma.jpg";
import ntdSnakebite from "@/assets/ntd-snakebite.jpg";
import ntdBuruli from "@/assets/ntd-buruli.jpg";
import ntdHat from "@/assets/ntd-hat.jpg";
import ntdLeprosy from "@/assets/ntd-leprosy.jpg";

const NTD_IMAGES: Record<string, string> = {
  lymphoedema: ntdLymphoedema,
  hydrocoele: ntdHydrocoele,
  trachoma_trichiasis: ntdTrachoma,
  snakebite: ntdSnakebite,
  buruli_ulcer: ntdBuruli,
  hat: ntdHat,
  leprosy: ntdLeprosy,
};

type Step = "info" | "select" | "screening" | "assessment" | "summary";

interface BeneficiaryInfo {
  name: string; age: string; sex: string; state: string; lga: string; ward: string; community: string; phone: string; notes: string;
}

const EMPTY_BENEFICIARY: BeneficiaryInfo = { name: "", age: "", sex: "", state: "", lga: "", ward: "", community: "", phone: "", notes: "" };

const NTDAssessmentView = () => {
  const [step, setStep] = useState<Step>("info");
  const [beneficiary, setBeneficiary] = useState<BeneficiaryInfo>(EMPTY_BENEFICIARY);
  const [selectedProtocolId, setSelectedProtocolId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);

  const protocol = useMemo(() => NTD_PROTOCOLS.find(p => p.id === selectedProtocolId) || null, [selectedProtocolId]);

  const handleAnswer = useCallback((questionId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  }, []);

  const handleEditField = useCallback((fieldId: string) => {
    if (!protocol) return;
    const isScreening = protocol.screeningQuestions.some(q => q.id === fieldId);
    setStep(isScreening ? "screening" : "assessment");
  }, [protocol]);

  const handleSave = useCallback(() => {
    if (!protocol) return;
    setIsSaving(true);
    const assessment = {
      beneficiary,
      protocolId: protocol.id,
      protocolName: protocol.name,
      date: new Date().toISOString(),
      answers,
      confidence: protocol.getConfidence(answers),
    };
    try {
      const existing = JSON.parse(localStorage.getItem("ntd_assessments") || "[]");
      existing.push(assessment);
      localStorage.setItem("ntd_assessments", JSON.stringify(existing));
      toast({ title: "Assessment Saved", description: `Assessment for ${beneficiary.name} (${protocol.name}) saved successfully.` });
    } catch {
      toast({ title: "Save Failed", description: "Could not save. Please try again.", variant: "destructive" });
    }
    setIsSaving(false);
  }, [protocol, beneficiary, answers]);

  const handleReset = useCallback(() => {
    setStep("info");
    setBeneficiary(EMPTY_BENEFICIARY);
    setSelectedProtocolId(null);
    setAnswers({});
  }, []);

  const stepIndex = ["info", "select", "screening", "assessment", "summary"].indexOf(step);
  const stepsMeta = [
    { key: "info", label: "Beneficiary", icon: User },
    { key: "select", label: "Condition", icon: Stethoscope },
    { key: "screening", label: "Screening", icon: Shield },
    { key: "assessment", label: "Assessment", icon: Activity },
    { key: "summary", label: "Result", icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-4 p-2 sm:p-4 lg:p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/10 p-5 sm:p-6">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
            <Stethoscope className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">NTD Guided Assessment</h1>
            <p className="text-sm text-muted-foreground">Clinical decision support for field workers</p>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        {stepsMeta.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1 flex-shrink-0">
            <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
              i === stepIndex ? "bg-primary text-primary-foreground" :
              i < stepIndex ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
            }`}>
              <s.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{i + 1}</span>
            </div>
            {i < stepsMeta.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
          </div>
        ))}
      </div>

      {/* ───── Step 1: Beneficiary Info ───── */}
      {step === "info" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><User className="h-5 w-5" /> Beneficiary Information</CardTitle>
            <CardDescription>Enter the person's details before starting the assessment</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label>Full Name *</Label><Input value={beneficiary.name} onChange={e => setBeneficiary(p => ({ ...p, name: e.target.value }))} placeholder="Enter full name" /></div>
              <div><Label>Age *</Label><Input type="number" value={beneficiary.age} onChange={e => setBeneficiary(p => ({ ...p, age: e.target.value }))} placeholder="Age in years" /></div>
              <div><Label>Sex *</Label>
                <Select value={beneficiary.sex} onValueChange={v => setBeneficiary(p => ({ ...p, sex: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select sex" /></SelectTrigger>
                  <SelectContent><SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Phone</Label><Input value={beneficiary.phone} onChange={e => setBeneficiary(p => ({ ...p, phone: e.target.value }))} placeholder="08X-XXX-XXXX" /></div>
              <div><Label>State</Label><Input value={beneficiary.state} onChange={e => setBeneficiary(p => ({ ...p, state: e.target.value }))} placeholder="State" /></div>
              <div><Label>LGA</Label><Input value={beneficiary.lga} onChange={e => setBeneficiary(p => ({ ...p, lga: e.target.value }))} placeholder="LGA" /></div>
              <div><Label>Ward</Label><Input value={beneficiary.ward} onChange={e => setBeneficiary(p => ({ ...p, ward: e.target.value }))} placeholder="Ward" /></div>
              <div><Label>Community</Label><Input value={beneficiary.community} onChange={e => setBeneficiary(p => ({ ...p, community: e.target.value }))} placeholder="Community" /></div>
            </div>
            <div><Label>Additional Notes</Label><Textarea value={beneficiary.notes} onChange={e => setBeneficiary(p => ({ ...p, notes: e.target.value }))} placeholder="Any relevant history..." /></div>
            <div className="flex justify-end">
              <Button onClick={() => {
                if (!beneficiary.name || !beneficiary.age || !beneficiary.sex) {
                  toast({ title: "Required Fields", description: "Please fill in name, age, and sex.", variant: "destructive" });
                  return;
                }
                setStep("select");
              }}>Next: Select Condition <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ───── Step 2: Visual Condition Selector ───── */}
      {step === "select" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Stethoscope className="h-5 w-5" /> What condition is suspected?</CardTitle>
            <CardDescription>Tap the condition that best matches what you see. Use the images as a guide.</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[65vh]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {NTD_PROTOCOLS.map(p => {
                  const selected = selectedProtocolId === p.id;
                  return (
                    <button key={p.id} onClick={() => setSelectedProtocolId(p.id)}
                      className={`text-left rounded-xl border-2 transition-all overflow-hidden ${
                        selected ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-sm" : "border-border hover:border-primary/40"
                      }`}>
                      {/* Large clinical reference image */}
                      {NTD_IMAGES[p.id] && (
                        <div className="w-full h-36 sm:h-44 overflow-hidden bg-muted/30">
                          <img src={NTD_IMAGES[p.id]} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                        </div>
                      )}
                      <div className="p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xl">{p.emoji}</span>
                          <p className="font-semibold text-sm text-foreground">{p.name}</p>
                          {selected && <CheckCircle2 className="h-4 w-4 text-primary ml-auto" />}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{p.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={() => setStep("info")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={() => {
                if (!selectedProtocolId) {
                  toast({ title: "Select a condition", variant: "destructive" });
                  return;
                }
                setAnswers({});
                setStep("screening");
              }} disabled={!selectedProtocolId}>Start Screening <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ───── Step 3: Screening ───── */}
      {step === "screening" && protocol && (
        <GuidedQuestionFlow
          protocol={protocol}
          allQuestions={protocol.screeningQuestions}
          answers={answers}
          onAnswer={handleAnswer}
          onComplete={() => setStep("assessment")}
          onBack={() => setStep("select")}
          phaseLabel="Screening"
          conditionImage={NTD_IMAGES[protocol.id]}
        />
      )}

      {/* ───── Step 4: Assessment ───── */}
      {step === "assessment" && protocol && (
        <GuidedQuestionFlow
          protocol={protocol}
          allQuestions={protocol.assessmentQuestions}
          answers={answers}
          onAnswer={handleAnswer}
          onComplete={() => setStep("summary")}
          onBack={() => setStep("screening")}
          phaseLabel="Detailed Assessment"
          conditionImage={NTD_IMAGES[protocol.id]}
        />
      )}

      {/* ───── Step 5: Summary ───── */}
      {step === "summary" && protocol && (
        <div className="space-y-4">
          <AssessmentSummary
            protocol={protocol}
            answers={answers}
            beneficiary={beneficiary}
            onEditField={handleEditField}
            onSave={handleSave}
            onBack={() => setStep("assessment")}
            isSaving={isSaving}
            conditionImage={NTD_IMAGES[protocol.id]}
          />
          <div className="flex justify-center">
            <Button variant="outline" size="sm" className="gap-2" onClick={handleReset}>
              <RotateCcw className="h-4 w-4" /> New Assessment
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NTDAssessmentView;
