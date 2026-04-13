import { useState, useMemo, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Stethoscope, User, ArrowRight, ArrowLeft, RotateCcw, CheckCircle2, Shield, Activity,
  History, Clock, MapPin, Trash2, Loader2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { GuidedQuestionFlow, AssessmentSummary, NTD_PROTOCOLS } from "./NTDAssessment";
import { suggestStage } from "./NTDAssessment/ntdClinicalRules";
import { format } from "date-fns";

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

const NTD_EMOJI: Record<string, string> = {
  lymphoedema: "🦵", hydrocoele: "🩺", trachoma_trichiasis: "👁️",
  snakebite: "🐍", buruli_ulcer: "🔬", hat: "🦟", leprosy: "🧬",
};

type Step = "info" | "select" | "screening" | "assessment" | "summary";

interface BeneficiaryInfo {
  name: string; age: string; sex: string; state: string; lga: string; ward: string; community: string; phone: string; notes: string;
}

interface SavedAssessment {
  id: string;
  beneficiary_name: string;
  beneficiary_age: string | null;
  beneficiary_sex: string | null;
  state: string | null;
  lga: string | null;
  ward: string | null;
  community: string | null;
  protocol_id: string;
  protocol_name: string;
  confidence_score: number | null;
  suggested_stage: string | null;
  referral_urgency: string | null;
  referral_action: string | null;
  created_at: string;
}

const EMPTY_BENEFICIARY: BeneficiaryInfo = { name: "", age: "", sex: "", state: "", lga: "", ward: "", community: "", phone: "", notes: "" };

const NTDAssessmentView = () => {
  const { user } = useAuth();
  const [mainTab, setMainTab] = useState<"new" | "history">("new");
  const [step, setStep] = useState<Step>("info");
  const [beneficiary, setBeneficiary] = useState<BeneficiaryInfo>(EMPTY_BENEFICIARY);
  const [selectedProtocolId, setSelectedProtocolId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);

  // History state
  const [historyItems, setHistoryItems] = useState<SavedAssessment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const protocol = useMemo(() => NTD_PROTOCOLS.find(p => p.id === selectedProtocolId) || null, [selectedProtocolId]);

  // Fetch history
  const fetchHistory = useCallback(async () => {
    if (!user?.id) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from("ntd_assessments")
        .select("id, beneficiary_name, beneficiary_age, beneficiary_sex, state, lga, ward, community, protocol_id, protocol_name, confidence_score, suggested_stage, referral_urgency, referral_action, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setHistoryItems(data || []);
    } catch (err) {
      console.error("Failed to fetch assessment history:", err);
    } finally {
      setLoadingHistory(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (mainTab === "history") fetchHistory();
  }, [mainTab, fetchHistory]);

  const handleAnswer = useCallback((questionId: string, value: any) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  }, []);

  const handleEditField = useCallback((fieldId: string) => {
    if (!protocol) return;
    const isScreening = protocol.screeningQuestions.some(q => q.id === fieldId);
    setStep(isScreening ? "screening" : "assessment");
  }, [protocol]);

  const handleSave = useCallback(async () => {
    if (!protocol || !user?.id) return;
    setIsSaving(true);
    try {
      const stage = suggestStage(protocol, answers);
      const referral = protocol.getReferral(answers, stage || undefined);
      const { error } = await supabase.from("ntd_assessments").insert({
        user_id: user.id,
        beneficiary_name: beneficiary.name,
        beneficiary_age: beneficiary.age,
        beneficiary_sex: beneficiary.sex,
        beneficiary_phone: beneficiary.phone,
        state: beneficiary.state,
        lga: beneficiary.lga,
        ward: beneficiary.ward,
        community: beneficiary.community,
        notes: beneficiary.notes,
        protocol_id: protocol.id,
        protocol_name: protocol.name,
        answers,
        confidence_score: protocol.getConfidence(answers),
        suggested_stage: stage,
        referral_urgency: referral.urgency,
        referral_action: referral.action,
      });
      if (error) throw error;
      toast({ title: "Assessment Saved", description: `Assessment for ${beneficiary.name} (${protocol.name}) saved successfully.` });
      // Switch to history tab
      setMainTab("history");
      handleReset();
    } catch (err: any) {
      console.error("Save error:", err);
      toast({ title: "Save Failed", description: err?.message || "Could not save. Please try again.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [protocol, beneficiary, answers, user?.id]);

  const handleDelete = useCallback(async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from("ntd_assessments").delete().eq("id", id);
      if (error) throw error;
      setHistoryItems(prev => prev.filter(item => item.id !== id));
      toast({ title: "Assessment Deleted" });
    } catch {
      toast({ title: "Delete Failed", variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  }, []);

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

  const urgencyColor = (u: string | null) => {
    if (u === "emergency" || u === "urgent") return "bg-destructive/10 text-destructive border-destructive/30";
    if (u === "priority") return "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30";
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";
  };

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

      {/* Main Tabs: New Assessment vs History */}
      <Tabs value={mainTab} onValueChange={v => setMainTab(v as "new" | "history")}>
        <TabsList className="w-full bg-muted/50 p-1">
          <TabsTrigger value="new" className="flex-1 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Stethoscope className="h-4 w-4" /> New Assessment
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1 gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <History className="h-4 w-4" /> History
            {historyItems.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] h-5 min-w-[20px] px-1">{historyItems.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ===================== NEW ASSESSMENT TAB ===================== */}
        <TabsContent value="new" className="space-y-4 mt-4">
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

          {/* Step 1: Beneficiary Info */}
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

          {/* Step 2: Visual Condition Selector */}
          {step === "select" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg"><Stethoscope className="h-5 w-5" /> What condition is suspected?</CardTitle>
                <CardDescription>Tap the condition that best matches what you see.</CardDescription>
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
                    if (!selectedProtocolId) { toast({ title: "Select a condition", variant: "destructive" }); return; }
                    setAnswers({});
                    setStep("screening");
                  }} disabled={!selectedProtocolId}>Start Screening <ArrowRight className="h-4 w-4 ml-1" /></Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3: Screening */}
          {step === "screening" && protocol && (
            <GuidedQuestionFlow protocol={protocol} allQuestions={protocol.screeningQuestions} answers={answers} onAnswer={handleAnswer}
              onComplete={() => setStep("assessment")} onBack={() => setStep("select")} phaseLabel="Screening" conditionImage={NTD_IMAGES[protocol.id]} />
          )}

          {/* Step 4: Assessment */}
          {step === "assessment" && protocol && (
            <GuidedQuestionFlow protocol={protocol} allQuestions={protocol.assessmentQuestions} answers={answers} onAnswer={handleAnswer}
              onComplete={() => setStep("summary")} onBack={() => setStep("screening")} phaseLabel="Detailed Assessment" conditionImage={NTD_IMAGES[protocol.id]} />
          )}

          {/* Step 5: Summary */}
          {step === "summary" && protocol && (
            <div className="space-y-4">
              <AssessmentSummary protocol={protocol} answers={answers} beneficiary={beneficiary}
                onEditField={handleEditField} onSave={handleSave} onBack={() => setStep("assessment")}
                isSaving={isSaving} conditionImage={NTD_IMAGES[protocol.id]} />
              <div className="flex justify-center">
                <Button variant="outline" size="sm" className="gap-2" onClick={handleReset}>
                  <RotateCcw className="h-4 w-4" /> New Assessment
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ===================== HISTORY TAB ===================== */}
        <TabsContent value="history" className="space-y-4 mt-4">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : historyItems.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No assessments yet</p>
              <p className="text-sm mt-1">Complete an assessment and it will appear here</p>
              <Button variant="outline" size="sm" className="mt-4 gap-2" onClick={() => setMainTab("new")}>
                <Stethoscope className="h-4 w-4" /> Start New Assessment
              </Button>
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-320px)] min-h-[300px]">
              <div className="space-y-3 pr-2">
                {historyItems.map(item => (
                  <Card key={item.id} className="overflow-hidden border-border/50 hover:border-primary/20 transition-all">
                    <CardContent className="p-0">
                      <div className="flex">
                        {/* Condition image thumbnail */}
                        {NTD_IMAGES[item.protocol_id] && (
                          <div className="w-24 sm:w-32 shrink-0 overflow-hidden">
                            <img src={NTD_IMAGES[item.protocol_id]} alt={item.protocol_name} className="w-full h-full object-cover" loading="lazy" />
                          </div>
                        )}

                        <div className="flex-1 p-3 sm:p-4 min-w-0 space-y-2">
                          {/* Top row: name + protocol */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-semibold text-foreground text-sm truncate">{item.beneficiary_name}</p>
                              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                {item.beneficiary_age && <span>Age {item.beneficiary_age}</span>}
                                {item.beneficiary_sex && <span>• {item.beneficiary_sex}</span>}
                              </div>
                            </div>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
                              disabled={deletingId === item.id}
                              onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}>
                              {deletingId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            </Button>
                          </div>

                          {/* Protocol + urgency badges */}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <span>{NTD_EMOJI[item.protocol_id] || "🩺"}</span> {item.protocol_name}
                            </Badge>
                            {item.referral_urgency && (
                              <Badge className={`text-[10px] ${urgencyColor(item.referral_urgency)}`}>
                                {item.referral_urgency.toUpperCase()}
                              </Badge>
                            )}
                            {item.suggested_stage && (
                              <Badge variant="secondary" className="text-[10px]">{item.suggested_stage.replace(/_/g, " ")}</Badge>
                            )}
                          </div>

                          {/* Confidence bar */}
                          {item.confidence_score != null && (
                            <div className="flex items-center gap-2">
                              <Progress value={item.confidence_score} className="h-1.5 flex-1" />
                              <span className={`text-[10px] font-bold ${
                                item.confidence_score >= 70 ? "text-emerald-600" : item.confidence_score >= 40 ? "text-amber-600" : "text-muted-foreground"
                              }`}>{item.confidence_score}%</span>
                            </div>
                          )}

                          {/* Location + date */}
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            {(item.community || item.lga || item.state) && (
                              <span className="flex items-center gap-0.5 truncate">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {[item.community, item.lga, item.state].filter(Boolean).join(", ")}
                              </span>
                            )}
                            <span className="flex items-center gap-0.5 shrink-0 ml-auto">
                              <Clock className="h-3 w-3" />
                              {format(new Date(item.created_at), "dd MMM yyyy, HH:mm")}
                            </span>
                          </div>

                          {/* Referral action */}
                          {item.referral_action && (
                            <p className="text-[11px] text-muted-foreground italic truncate">{item.referral_action}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default NTDAssessmentView;
