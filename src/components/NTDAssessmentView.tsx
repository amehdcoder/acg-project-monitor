import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Stethoscope, ClipboardCheck, AlertTriangle, CheckCircle2, User, Calendar,
  MapPin, Camera, ArrowRight, ArrowLeft, RotateCcw, Save, FileText, ChevronDown
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

// NTD clinical images
import ntdLymphoedema from "@/assets/ntd-lymphoedema.jpg";
import ntdHydrocoele from "@/assets/ntd-hydrocoele.jpg";
import ntdTrachoma from "@/assets/ntd-trachoma.jpg";
import ntdSnakebite from "@/assets/ntd-snakebite.jpg";
import ntdBuruli from "@/assets/ntd-buruli.jpg";
import ntdHat from "@/assets/ntd-hat.jpg";
import ntdLeprosy from "@/assets/ntd-leprosy.jpg";

// NTD definitions with symptom checklists
const NTD_IMAGES: Record<string, string> = {
  lymphoedema: ntdLymphoedema,
  hydrocoele: ntdHydrocoele,
  trachoma_trichiasis: ntdTrachoma,
  snakebite: ntdSnakebite,
  buruli_ulcer: ntdBuruli,
  hat: ntdHat,
  leprosy: ntdLeprosy,
};

const NTD_DISEASES = [
  {
    id: "lymphoedema",
    name: "Lymphoedema",
    description: "Chronic swelling of limbs caused by lymphatic filariasis",
    stages: ["Stage 1 - Reversible", "Stage 2 - Irreversible (no skin folds)", "Stage 3 - Irreversible (shallow skin folds)", "Stage 4 - Knobs", "Stage 5 - Deep skin folds", "Stage 6 - Mossy lesions", "Stage 7 - Unable to perform daily activities"],
    symptoms: [
      { id: "swelling_limb", label: "Swelling of one or both legs/arms", weight: 25 },
      { id: "pitting_edema", label: "Pitting edema (dent remains when pressed)", weight: 15 },
      { id: "skin_thickening", label: "Thickening of skin on affected limb", weight: 15 },
      { id: "skin_folds", label: "Deep skin folds or creases", weight: 10 },
      { id: "recurrent_infection", label: "Recurrent bacterial infections (acute attacks)", weight: 10 },
      { id: "fever_episodes", label: "Episodes of fever with limb swelling", weight: 8 },
      { id: "difficulty_walking", label: "Difficulty walking or using affected limb", weight: 7 },
      { id: "mossy_foot", label: "Mossy/warty growths on skin", weight: 5 },
      { id: "foul_smell", label: "Foul smell from affected area", weight: 3 },
      { id: "pain_heaviness", label: "Chronic pain or heaviness in limb", weight: 2 },
    ],
    color: "hsl(var(--primary))",
  },
  {
    id: "hydrocoele",
    name: "Hydrocoele",
    description: "Fluid accumulation in the scrotal sac, often caused by lymphatic filariasis",
    stages: ["Small (< 10cm)", "Medium (10-20cm)", "Large (20-30cm)", "Very Large (> 30cm)"],
    symptoms: [
      { id: "scrotal_swelling", label: "Painless swelling of scrotum", weight: 30 },
      { id: "heaviness_groin", label: "Feeling of heaviness in groin", weight: 15 },
      { id: "transillumination", label: "Swelling transilluminates (light passes through)", weight: 15 },
      { id: "gradual_increase", label: "Gradual increase in size over time", weight: 10 },
      { id: "smooth_surface", label: "Smooth, non-tender surface", weight: 10 },
      { id: "difficulty_sitting", label: "Difficulty sitting or walking", weight: 8 },
      { id: "sexual_dysfunction", label: "Impact on sexual function", weight: 5 },
      { id: "occupational_impact", label: "Unable to work due to size", weight: 4 },
      { id: "social_stigma", label: "Social stigma or isolation", weight: 2 },
      { id: "inguinal_pain", label: "Inguinal discomfort or dragging pain", weight: 1 },
    ],
    color: "hsl(210, 70%, 50%)",
  },
  {
    id: "trachoma_trichiasis",
    name: "Trachoma Trichiasis (TT)",
    description: "Inward turning of eyelashes causing corneal damage from repeated trachoma infection",
    stages: ["Minor TT (1-5 lashes)", "Major TT (6+ lashes)", "TT with corneal opacity", "TT with visual impairment"],
    symptoms: [
      { id: "inturned_lashes", label: "One or more eyelashes touching the eyeball", weight: 30 },
      { id: "eye_pain", label: "Chronic eye pain or irritation", weight: 15 },
      { id: "tearing", label: "Excessive tearing (epiphora)", weight: 10 },
      { id: "light_sensitivity", label: "Sensitivity to light (photophobia)", weight: 10 },
      { id: "blurred_vision", label: "Blurred or reduced vision", weight: 10 },
      { id: "corneal_opacity", label: "Visible white opacity on cornea", weight: 8 },
      { id: "lid_scarring", label: "Scarring on inner eyelid (tarsal conjunctiva)", weight: 7 },
      { id: "redness", label: "Chronic redness of eye", weight: 5 },
      { id: "discharge", label: "Eye discharge (mucopurulent)", weight: 3 },
      { id: "eyelid_deformity", label: "Visible deformity of eyelid margin", weight: 2 },
    ],
    color: "hsl(45, 80%, 45%)",
  },
  {
    id: "snakebite",
    name: "Snake Bite Envenoming",
    description: "Venomous snake bite requiring case management and follow-up",
    stages: ["Dry bite (no envenoming)", "Mild envenoming", "Moderate envenoming", "Severe envenoming"],
    symptoms: [
      { id: "bite_marks", label: "Visible fang/bite marks on skin", weight: 20 },
      { id: "local_swelling", label: "Swelling at or near bite site", weight: 15 },
      { id: "pain_bite", label: "Severe pain at bite site", weight: 10 },
      { id: "bleeding", label: "Bleeding from bite site or gums/nose", weight: 10 },
      { id: "necrosis", label: "Tissue necrosis around bite", weight: 10 },
      { id: "ptosis", label: "Drooping eyelids (ptosis)", weight: 8 },
      { id: "difficulty_breathing", label: "Difficulty breathing", weight: 8 },
      { id: "blurred_vision_snake", label: "Blurred or double vision", weight: 7 },
      { id: "vomiting", label: "Nausea/vomiting", weight: 5 },
      { id: "dark_urine", label: "Dark/red-colored urine", weight: 7 },
    ],
    color: "hsl(0, 70%, 50%)",
  },
  {
    id: "buruli_ulcer",
    name: "Buruli Ulcer",
    description: "Chronic necrotizing skin disease caused by Mycobacterium ulcerans",
    stages: ["Category I (single small lesion <5cm)", "Category II (plaque/oedema/ulcer 5-15cm)", "Category III (disseminated or >15cm)"],
    symptoms: [
      { id: "painless_nodule", label: "Painless nodule or papule on skin", weight: 20 },
      { id: "painless_swelling_bu", label: "Painless swelling (plaque or oedema)", weight: 15 },
      { id: "undermined_edges", label: "Ulcer with undermined (overhanging) edges", weight: 15 },
      { id: "necrotic_center", label: "White/yellowish necrotic center of ulcer", weight: 10 },
      { id: "no_fever_bu", label: "Absence of fever (afebrile)", weight: 5 },
      { id: "painless_ulcer", label: "Large ulcer that is surprisingly painless", weight: 10 },
      { id: "bone_involvement", label: "Bone involvement (osteomyelitis)", weight: 8 },
      { id: "joint_limitation", label: "Joint limitation or contracture", weight: 7 },
      { id: "satellite_lesions", label: "Satellite lesions around main ulcer", weight: 5 },
      { id: "lymph_node_swelling", label: "Regional lymph node swelling", weight: 5 },
    ],
    color: "hsl(30, 70%, 45%)",
  },
  {
    id: "hat",
    name: "Human African Trypanosomiasis (HAT)",
    description: "Sleeping sickness caused by Trypanosoma parasites transmitted by tsetse flies",
    stages: ["Stage 1 - Haemolymphatic (early)", "Stage 2 - Meningoencephalitic (late/CNS)"],
    symptoms: [
      { id: "chancre", label: "Chancre (painful sore at bite site)", weight: 15 },
      { id: "intermittent_fever", label: "Intermittent fever episodes", weight: 12 },
      { id: "headache_hat", label: "Persistent severe headache", weight: 10 },
      { id: "lymphadenopathy", label: "Swollen lymph nodes (especially posterior cervical)", weight: 12 },
      { id: "sleep_disturbance", label: "Sleep cycle disturbance (daytime sleepiness)", weight: 15 },
      { id: "confusion", label: "Confusion or personality changes", weight: 10 },
      { id: "tremors", label: "Tremors or involuntary movements", weight: 8 },
      { id: "itching_hat", label: "Intense itching (pruritus)", weight: 5 },
      { id: "weight_loss_hat", label: "Progressive weight loss", weight: 5 },
      { id: "joint_pain_hat", label: "Joint pain (arthralgia)", weight: 8 },
    ],
    color: "hsl(270, 60%, 50%)",
  },
  {
    id: "leprosy",
    name: "Leprosy (Hansen's Disease)",
    description: "Chronic infection by Mycobacterium leprae affecting skin, nerves, and mucosa",
    stages: ["Paucibacillary (PB, 1-5 patches)", "Multibacillary (MB, 6+ patches)"],
    symptoms: [
      { id: "skin_patches", label: "Light-colored or reddish skin patches", weight: 20 },
      { id: "loss_sensation", label: "Loss of sensation in patches (numbness)", weight: 20 },
      { id: "nerve_thickening", label: "Thickened peripheral nerves (ulnar, peroneal)", weight: 15 },
      { id: "muscle_weakness", label: "Muscle weakness in hands/feet", weight: 10 },
      { id: "claw_hand", label: "Claw hand or foot drop deformity", weight: 8 },
      { id: "nodules_skin", label: "Nodules or lumps on skin", weight: 7 },
      { id: "nasal_stuffiness", label: "Chronic nasal stuffiness or nosebleeds", weight: 5 },
      { id: "eye_problems_lep", label: "Dry eyes or reduced blinking", weight: 5 },
      { id: "painless_wounds", label: "Painless wounds/ulcers on hands or feet", weight: 5 },
      { id: "hair_loss_patch", label: "Loss of hair in affected patches", weight: 5 },
    ],
    color: "hsl(160, 50%, 40%)",
  },
];

interface BeneficiaryInfo {
  name: string;
  age: string;
  sex: string;
  state: string;
  lga: string;
  ward: string;
  community: string;
  phone: string;
  notes: string;
}

const NTDAssessmentView = () => {
  const [step, setStep] = useState<"info" | "select" | "assess" | "result">("info");
  const [beneficiary, setBeneficiary] = useState<BeneficiaryInfo>({
    name: "", age: "", sex: "", state: "", lga: "", ward: "", community: "", phone: "", notes: "",
  });
  const [selectedNTDs, setSelectedNTDs] = useState<string[]>([]);
  const [checkedSymptoms, setCheckedSymptoms] = useState<Record<string, boolean>>({});
  const [stageSelections, setStageSelections] = useState<Record<string, string>>({});
  const [assessmentNotes, setAssessmentNotes] = useState<Record<string, string>>({});
  const [activeDisease, setActiveDisease] = useState<string>("");

  const toggleSymptom = (symptomId: string) => {
    setCheckedSymptoms(prev => ({ ...prev, [symptomId]: !prev[symptomId] }));
  };

  const calculateScore = (diseaseId: string) => {
    const disease = NTD_DISEASES.find(d => d.id === diseaseId);
    if (!disease) return 0;
    let total = 0;
    disease.symptoms.forEach(s => {
      if (checkedSymptoms[`${diseaseId}_${s.id}`]) total += s.weight;
    });
    return Math.min(total, 100);
  };

  const results = useMemo(() => {
    return selectedNTDs.map(id => {
      const disease = NTD_DISEASES.find(d => d.id === id)!;
      const score = calculateScore(id);
      const severity = score >= 70 ? "high" : score >= 40 ? "moderate" : score >= 15 ? "low" : "unlikely";
      return { disease, score, severity, stage: stageSelections[id] || "Not staged" };
    }).sort((a, b) => b.score - a.score);
  }, [selectedNTDs, checkedSymptoms, stageSelections]);

  const topPrediction = results[0];

  const handleSaveAssessment = () => {
    const assessment = {
      beneficiary,
      date: new Date().toISOString(),
      results: results.map(r => ({ ntd: r.disease.name, score: r.score, severity: r.severity, stage: r.stage })),
      notes: assessmentNotes,
    };
    const existing = JSON.parse(localStorage.getItem("ntd_assessments") || "[]");
    existing.push(assessment);
    localStorage.setItem("ntd_assessments", JSON.stringify(existing));
    toast({ title: "Assessment Saved", description: `Assessment for ${beneficiary.name} has been saved locally.` });
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high": return "text-destructive";
      case "moderate": return "text-amber-600 dark:text-amber-400";
      case "low": return "text-blue-600 dark:text-blue-400";
      default: return "text-muted-foreground";
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case "high": return <Badge variant="destructive">High Probability</Badge>;
      case "moderate": return <Badge className="bg-amber-500 text-white">Moderate</Badge>;
      case "low": return <Badge variant="secondary">Low</Badge>;
      default: return <Badge variant="outline">Unlikely</Badge>;
    }
  };

  return (
    <div className="space-y-4 p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-xl bg-primary/10">
          <Stethoscope className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">NTD Case Assessment</h1>
          <p className="text-sm text-muted-foreground">Visual clinical assessment tool for Neglected Tropical Diseases</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        {[
          { key: "info", label: "Beneficiary Info", icon: User },
          { key: "select", label: "Select NTDs", icon: ClipboardCheck },
          { key: "assess", label: "Assessment", icon: Stethoscope },
          { key: "result", label: "Results", icon: CheckCircle2 },
        ].map((s, i) => (
          <div key={s.key} className="flex items-center gap-1 flex-shrink-0">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              step === s.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              <s.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{s.label}</span>
              <span className="sm:hidden">{i + 1}</span>
            </div>
            {i < 3 && <ArrowRight className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
          </div>
        ))}
      </div>

      {/* Step 1: Beneficiary Info */}
      {step === "info" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><User className="h-5 w-5" /> Beneficiary Information</CardTitle>
            <CardDescription>Enter the details of the person being assessed</CardDescription>
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
              <div><Label>Phone Number</Label><Input value={beneficiary.phone} onChange={e => setBeneficiary(p => ({ ...p, phone: e.target.value }))} placeholder="08X-XXX-XXXX" /></div>
              <div><Label>State</Label><Input value={beneficiary.state} onChange={e => setBeneficiary(p => ({ ...p, state: e.target.value }))} placeholder="State" /></div>
              <div><Label>LGA</Label><Input value={beneficiary.lga} onChange={e => setBeneficiary(p => ({ ...p, lga: e.target.value }))} placeholder="LGA" /></div>
              <div><Label>Ward</Label><Input value={beneficiary.ward} onChange={e => setBeneficiary(p => ({ ...p, ward: e.target.value }))} placeholder="Ward" /></div>
              <div><Label>Community</Label><Input value={beneficiary.community} onChange={e => setBeneficiary(p => ({ ...p, community: e.target.value }))} placeholder="Community name" /></div>
            </div>
            <div><Label>Additional Notes</Label><Textarea value={beneficiary.notes} onChange={e => setBeneficiary(p => ({ ...p, notes: e.target.value }))} placeholder="Any relevant medical history or observations..." /></div>
            <div className="flex justify-end">
              <Button onClick={() => {
                if (!beneficiary.name || !beneficiary.age || !beneficiary.sex) {
                  toast({ title: "Required Fields", description: "Please fill in name, age, and sex.", variant: "destructive" });
                  return;
                }
                setStep("select");
              }}>Next: Select NTDs <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Select NTDs to assess */}
      {step === "select" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><ClipboardCheck className="h-5 w-5" /> Select NTDs to Assess</CardTitle>
            <CardDescription>Choose one or more NTDs based on the presenting complaints</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {NTD_DISEASES.map(d => {
                const selected = selectedNTDs.includes(d.id);
                return (
                  <button key={d.id} onClick={() => {
                    setSelectedNTDs(prev => selected ? prev.filter(x => x !== d.id) : [...prev, d.id]);
                  }} className={`text-left rounded-xl border-2 transition-all overflow-hidden ${
                    selected ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40"
                  }`}>
                    {/* Clinical Image */}
                    {NTD_IMAGES[d.id] && (
                      <div className="w-full h-32 sm:h-40 overflow-hidden">
                        <img
                          src={NTD_IMAGES[d.id]}
                          alt={`${d.name} clinical reference`}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          width={512}
                          height={512}
                        />
                      </div>
                    )}
                    <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 mt-0.5 ${selected ? "bg-primary text-primary-foreground" : "border border-muted-foreground/30"}`}>
                        {selected && <CheckCircle2 className="h-3.5 w-3.5" />}
                      </div>
                      <div>
                        <p className="font-semibold text-sm text-foreground">{d.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{d.description}</p>
                      </div>
                    </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-between mt-6">
              <Button variant="outline" onClick={() => setStep("info")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
              <Button onClick={() => {
                if (selectedNTDs.length === 0) {
                  toast({ title: "Select at least one NTD", variant: "destructive" });
                  return;
                }
                setActiveDisease(selectedNTDs[0]);
                setStep("assess");
              }} disabled={selectedNTDs.length === 0}>Next: Assessment <ArrowRight className="h-4 w-4 ml-1" /></Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Visual Assessment Checklists */}
      {step === "assess" && (
        <div className="space-y-4">
          {selectedNTDs.length > 1 && (
            <Tabs value={activeDisease} onValueChange={setActiveDisease}>
              <TabsList className="w-full flex-wrap h-auto gap-1 bg-muted/50">
                {selectedNTDs.map(id => {
                  const d = NTD_DISEASES.find(x => x.id === id)!;
                  const score = calculateScore(id);
                  return (
                    <TabsTrigger key={id} value={id} className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                      {d.name} ({score}%)
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </Tabs>
          )}

          {(() => {
            const disease = NTD_DISEASES.find(d => d.id === activeDisease);
            if (!disease) return null;
            const score = calculateScore(disease.id);
            return (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <CardTitle className="text-lg">{disease.name} Assessment</CardTitle>
                      <CardDescription>{disease.description}</CardDescription>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-foreground">{score}%</p>
                      <p className="text-xs text-muted-foreground">Probability Score</p>
                    </div>
                  </div>
                  <Progress value={score} className="h-2 mt-2" />
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Stage Selection */}
                  <div>
                    <Label className="text-sm font-semibold">Clinical Stage</Label>
                    <Select value={stageSelections[disease.id] || ""} onValueChange={v => setStageSelections(prev => ({ ...prev, [disease.id]: v }))}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select clinical stage..." /></SelectTrigger>
                      <SelectContent>
                        {disease.stages.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <Separator />

                  {/* Symptom Checklist */}
                  <div>
                    <Label className="text-sm font-semibold mb-3 block">Clinical Signs & Symptoms Checklist</Label>
                    <p className="text-xs text-muted-foreground mb-3">Check all signs and symptoms observed during examination. Each contributes to the probability score.</p>
                    <div className="space-y-2">
                      {disease.symptoms.map(symptom => {
                        const key = `${disease.id}_${symptom.id}`;
                        const checked = !!checkedSymptoms[key];
                        return (
                          <label key={key} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                            checked ? "border-primary/50 bg-primary/5" : "border-border hover:bg-muted/30"
                          }`}>
                            <Checkbox checked={checked} onCheckedChange={() => toggleSymptom(key)} className="mt-0.5" />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-foreground">{symptom.label}</p>
                              <p className="text-xs text-muted-foreground">Weight: {symptom.weight}%</p>
                            </div>
                            {checked && <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <Separator />

                  {/* Notes */}
                  <div>
                    <Label className="text-sm font-semibold">Assessment Notes for {disease.name}</Label>
                    <Textarea
                      value={assessmentNotes[disease.id] || ""}
                      onChange={e => setAssessmentNotes(prev => ({ ...prev, [disease.id]: e.target.value }))}
                      placeholder="Document clinical observations, measurements, and other findings..."
                      className="mt-1"
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("select")}><ArrowLeft className="h-4 w-4 mr-1" /> Back</Button>
            <Button onClick={() => setStep("result")}>View Results <ArrowRight className="h-4 w-4 ml-1" /></Button>
          </div>
        </div>
      )}

      {/* Step 4: Results */}
      {step === "result" && (
        <div className="space-y-4">
          <Card className="border-2 border-primary/20">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-lg flex items-center gap-2"><FileText className="h-5 w-5" /> Assessment Results</CardTitle>
                <Badge variant="outline">{new Date().toLocaleDateString()}</Badge>
              </div>
              <CardDescription>
                Beneficiary: <span className="font-semibold text-foreground">{beneficiary.name}</span> • Age: {beneficiary.age} • Sex: {beneficiary.sex}
                {beneficiary.community && ` • ${beneficiary.community}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {topPrediction && (
                <div className={`p-4 rounded-xl border-2 ${
                  topPrediction.severity === "high" ? "border-destructive/50 bg-destructive/5" :
                  topPrediction.severity === "moderate" ? "border-amber-500/50 bg-amber-50 dark:bg-amber-950/20" :
                  "border-border bg-muted/30"
                }`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Most Likely NTD</p>
                      <p className="text-xl font-bold text-foreground mt-0.5">{topPrediction.disease.name}</p>
                      <p className="text-sm text-muted-foreground">{topPrediction.stage}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-3xl font-bold ${getSeverityColor(topPrediction.severity)}`}>{topPrediction.score}%</p>
                      {getSeverityBadge(topPrediction.severity)}
                    </div>
                  </div>
                  {topPrediction.severity === "high" && (
                    <div className="mt-3 p-2 bg-destructive/10 rounded-lg flex items-center gap-2 text-sm text-destructive">
                      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                      <span className="font-medium">Refer for immediate clinical confirmation and case management.</span>
                    </div>
                  )}
                </div>
              )}

              <Separator />

              {/* All results */}
              <div className="space-y-3">
                <p className="text-sm font-semibold text-foreground">All Assessed NTDs</p>
                {results.map(r => (
                  <div key={r.disease.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                    <div>
                      <p className="text-sm font-medium text-foreground">{r.disease.name}</p>
                      <p className="text-xs text-muted-foreground">{r.stage}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={r.score} className="w-20 h-1.5" />
                      <span className={`text-sm font-bold w-10 text-right ${getSeverityColor(r.severity)}`}>{r.score}%</span>
                      {getSeverityBadge(r.severity)}
                    </div>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSaveAssessment}><Save className="h-4 w-4 mr-1" /> Save Assessment</Button>
                <Button variant="outline" onClick={() => {
                  setStep("info");
                  setBeneficiary({ name: "", age: "", sex: "", state: "", lga: "", ward: "", community: "", phone: "", notes: "" });
                  setSelectedNTDs([]);
                  setCheckedSymptoms({});
                  setStageSelections({});
                  setAssessmentNotes({});
                }}><RotateCcw className="h-4 w-4 mr-1" /> New Assessment</Button>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-start">
            <Button variant="outline" onClick={() => setStep("assess")}><ArrowLeft className="h-4 w-4 mr-1" /> Back to Assessment</Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NTDAssessmentView;
