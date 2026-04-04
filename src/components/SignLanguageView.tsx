import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HandMetal, Search, Globe, BookOpen, Users, MessageSquare, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

import signGreeting from "@/assets/sign-greeting.jpg";
import signConsent from "@/assets/sign-consent.jpg";
import signHealth from "@/assets/sign-health.jpg";

const LANGUAGES = [
  { id: "asl", name: "American Sign Language (ASL)", flag: "🇺🇸" },
  { id: "nsl", name: "Nigerian Sign Language (NSL)", flag: "🇳🇬" },
  { id: "hausa", name: "Hausa Sign Language", flag: "🇳🇬" },
  { id: "yoruba", name: "Yoruba Sign Language", flag: "🇳🇬" },
  { id: "igbo", name: "Igbo Sign Language", flag: "🇳🇬" },
  { id: "idoma", name: "Idoma Sign Language", flag: "🇳🇬" },
  { id: "nupe", name: "Nupe Sign Language", flag: "🇳🇬" },
  { id: "gbagyi", name: "Gbagyi Sign Language", flag: "🇳🇬" },
  { id: "tiv", name: "Tiv Sign Language", flag: "🇳🇬" },
];

// Category images
const CATEGORY_IMAGES: Record<string, string> = {
  greetings: signGreeting,
  consent: signConsent,
  health: signHealth,
  form_questions: signHealth,
};

interface SignPhrase {
  phrase: string;
  description: string;
  signs: Record<string, string>;
}

interface SignCategory {
  id: string;
  name: string;
  icon: React.ElementType;
  phrases: SignPhrase[];
}

// Static essential phrases (greetings + consent)
const ESSENTIAL_PHRASES = [
  {
    id: "greetings",
    name: "Greetings & Introduction",
    icon: Users,
    phrases: [
      { phrase: "Hello, my name is...", description: "Wave hand, then point to self and fingerspell name", signs: { asl: "Wave + point to self + fingerspell", nsl: "Open palm wave + chest tap + fingerspell", hausa: "Right hand to forehead salute + chest point", yoruba: "Both palms open forward + chest touch", igbo: "Right hand wave + point to chest", idoma: "Open hand raise + touch chest", nupe: "Palm outward wave + self-point gesture", gbagyi: "Head nod + hand to chest", tiv: "Right hand raise + chest tap" } },
      { phrase: "How are you?", description: "Thumbs up, questioning expression", signs: { asl: "Both fists thumbs up, move alternately + raised eyebrows", nsl: "Open palm circle on chest + questioning face", hausa: "Right palm on heart + eyebrows raised", yoruba: "Both hands flat, palms up + head tilt", igbo: "Hand wave + questioning expression", idoma: "Palm to chest, circle + ask face", nupe: "Thumbs up + head tilt question", gbagyi: "Hand to chest + questioning nod", tiv: "Open palms out + raised brows" } },
      { phrase: "I am a health worker", description: "Point to self, cross arms on chest (health), working gesture", signs: { asl: "Point self + cross wrists on chest + miming working", nsl: "Self-point + red cross sign on arm + clipboard mime", hausa: "Chest point + cross arms (medicine) + writing motion", yoruba: "Self-tap + heart area cross + noting gesture", igbo: "Point chest + arms crossed health + work mime", idoma: "Self-point + medical cross + writing", nupe: "Chest touch + cross sign + clipboard", gbagyi: "Self-indicate + health cross + activity mime", tiv: "Point self + cross on chest + work gesture" } },
      { phrase: "Thank you for your time", description: "Flat hand from chin forward, clock gesture", signs: { asl: "Flat hand from chin forward + wrist tap", nsl: "Hand from lips forward + clock circle", hausa: "Hand from mouth bow + time circle", yoruba: "Both palms forward + wrist gesture", igbo: "Hand forward from chin + time sign", idoma: "Chin to forward + clock mime", nupe: "Gratitude gesture + time sign", gbagyi: "Forward hand + wrist circle", tiv: "Chin forward + time gesture" } },
    ],
  },
  {
    id: "consent",
    name: "Consent & Permission",
    icon: MessageSquare,
    phrases: [
      { phrase: "May I ask you some questions?", description: "Point to self, mime talking, questioning look", signs: { asl: "Self-point + index finger from lips + raised eyebrows", nsl: "Self-point + talking gesture + palms up question", hausa: "Self-point + mouth gesture + permission nod", yoruba: "Chest touch + speaking mime + open palms up", igbo: "Self-point + lip gesture + questioning", idoma: "Point self + talking + palms up", nupe: "Self-indicate + mouth move + ask gesture", gbagyi: "Self-point + talk mime + head question", tiv: "Self-point + lips motion + open palms" } },
      { phrase: "You can say no at any time", description: "Point to person, head shake (no), clock gesture (time)", signs: { asl: "Point to other + head shake + wrist tap (time)", nsl: "Point other + X hand (no) + clock circle", hausa: "Point to person + hand wave no + time circle", yoruba: "Person point + cross hands + wrist watch", igbo: "Point other + shake head + time gesture", idoma: "Point + no gesture + clock mime", nupe: "Indicate person + refusal sign + time", gbagyi: "Point + head shake + wrist circle", tiv: "Point out + refuse gesture + time sign" } },
      { phrase: "Your information is confidential", description: "Point to person, lock gesture, secret sign", signs: { asl: "Point + fist twist (lock) + finger over lips (secret)", nsl: "Point other + key turning + lips sealed", hausa: "Person point + lock twist + silence gesture", yoruba: "Point + key turn + lips zip", igbo: "Point other + lock sign + quiet mouth", idoma: "Indicate + lock gesture + sealed lips", nupe: "Point + turn key + finger on lips", gbagyi: "Point other + lock + quiet sign", tiv: "Point + lock twist + lips sealed" } },
      { phrase: "Do you agree to participate?", description: "Handshake gesture + questioning face", signs: { asl: "Clasp hands + thumbs up/down + raised eyebrows", nsl: "Handshake mime + question face", hausa: "Handshake + yes/no question", yoruba: "Clasped hands + ask expression", igbo: "Handshake gesture + question", idoma: "Clasp + ask face", nupe: "Handshake + question", gbagyi: "Clasp gesture + questioning", tiv: "Handshake + raised brows" } },
    ],
  },
];

// Generate sign descriptions for a form question
const generateQuestionSigns = (questionLabel: string): Record<string, string> => {
  const base = `Point to person + gesture for "${questionLabel}" + questioning expression`;
  return {
    asl: `Self-point + illustrate "${questionLabel}" + raised eyebrows`,
    nsl: `Open palm indicate + mime "${questionLabel}" + question face`,
    hausa: `Point person + describe "${questionLabel}" + ask expression`,
    yoruba: `Indicate + show "${questionLabel}" + head tilt question`,
    igbo: `Point + gesture "${questionLabel}" + questioning look`,
    idoma: `Indicate person + mime "${questionLabel}" + ask`,
    nupe: `Point + show "${questionLabel}" + question expression`,
    gbagyi: `Indicate + describe "${questionLabel}" + raised brows`,
    tiv: `Point out + mime "${questionLabel}" + question face`,
  };
};

interface ProjectForm {
  id: string;
  name: string;
  project_id: string;
  project_name: string;
  questions: { id: string; label: string; type: string }[];
}

const SignLanguageView = () => {
  const { user, isAdmin } = useAuth();
  const [selectedLanguage, setSelectedLanguage] = useState("nsl");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("greetings");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [selectedFormId, setSelectedFormId] = useState<string>("all");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [forms, setForms] = useState<ProjectForm[]>([]);
  const [loadingForms, setLoadingForms] = useState(true);

  useEffect(() => {
    fetchProjectsAndForms();
  }, [user?.id]);

  const fetchProjectsAndForms = async () => {
    if (!user?.id) return;
    setLoadingForms(true);
    try {
      // Fetch projects
      const { data: projectsData } = await supabase.from("projects").select("id, name").order("name");
      setProjects(projectsData || []);

      // Fetch forms with questions
      let formsQuery = supabase.from("forms").select("id, name, project_id, questions").eq("status", "active");
      if (!isAdmin) {
        const { data: assignments } = await supabase.from("user_form_assignments").select("form_id").eq("user_id", user.id);
        if (assignments && assignments.length > 0) {
          formsQuery = formsQuery.in("id", assignments.map(a => a.form_id));
        }
      }
      const { data: formsData } = await formsQuery.order("name");

      const projectMap = new Map((projectsData || []).map(p => [p.id, p.name]));
      const mappedForms: ProjectForm[] = (formsData || []).map(f => ({
        id: f.id,
        name: f.name,
        project_id: f.project_id,
        project_name: projectMap.get(f.project_id) || "Unknown Project",
        questions: Array.isArray(f.questions) ? (f.questions as any[]).map((q: any) => ({
          id: q.id || q.name || String(Math.random()),
          label: q.label || q.title || q.name || "Untitled Question",
          type: q.type || "text",
        })) : [],
      }));
      setForms(mappedForms);
    } catch (err) {
      console.error("Error fetching forms:", err);
    } finally {
      setLoadingForms(false);
    }
  };

  const filteredForms = useMemo(() => {
    if (selectedProjectId === "all") return forms;
    return forms.filter(f => f.project_id === selectedProjectId);
  }, [forms, selectedProjectId]);

  const selectedForm = useMemo(() => {
    if (selectedFormId === "all") return null;
    return forms.find(f => f.id === selectedFormId) || null;
  }, [forms, selectedFormId]);

  // Build dynamic form question phrases
  const formQuestionPhrases = useMemo(() => {
    if (!selectedForm) return [];
    return selectedForm.questions.map(q => ({
      phrase: q.label,
      description: `Sign for asking: "${q.label}" (${q.type} question)`,
      signs: generateQuestionSigns(q.label),
    }));
  }, [selectedForm]);

  // All categories including dynamic form questions
  const allCategories = useMemo(() => {
    const cats = [...ESSENTIAL_PHRASES];
    if (selectedForm && formQuestionPhrases.length > 0) {
      cats.push({
        id: "form_questions",
        name: `📋 ${selectedForm.name}`,
        icon: FileText,
        phrases: formQuestionPhrases,
      });
    }
    return cats;
  }, [selectedForm, formQuestionPhrases]);

  const filteredPhrases = allCategories.find(c => c.id === activeCategory)?.phrases.filter(p =>
    p.phrase.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const currentLang = LANGUAGES.find(l => l.id === selectedLanguage)!;

  return (
    <div className="space-y-4 p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 rounded-xl bg-primary/10">
          <HandMetal className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">Sign Language Guide</h1>
          <p className="text-sm text-muted-foreground">Learn to ask form questions using sign language for inclusive data collection</p>
        </div>
      </div>

      {/* Project & Form Selectors */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <Select value={selectedProjectId} onValueChange={v => { setSelectedProjectId(v); setSelectedFormId("all"); }}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Select Project" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Select value={selectedFormId} onValueChange={v => { setSelectedFormId(v); if (v !== "all") setActiveCategory("form_questions"); }}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Select Form" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Forms (General Phrases)</SelectItem>
              {filteredForms.map(f => <SelectItem key={f.id} value={f.id}>📋 {f.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
            <SelectTrigger className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map(l => <SelectItem key={l.id} value={l.id}>{l.flag} {l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search phrases..." className="pl-9 text-sm" />
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-xs">{currentLang.flag} {currentLang.name}</Badge>
        <Badge variant="secondary" className="text-xs">{filteredPhrases.length} phrases</Badge>
        {selectedForm && <Badge className="text-xs bg-primary/10 text-primary hover:bg-primary/20">Form: {selectedForm.name}</Badge>}
      </div>

      {/* Categories */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="w-full flex-wrap h-auto gap-1 bg-muted/50">
          {allCategories.map(c => (
            <TabsTrigger key={c.id} value={c.id} className="text-xs gap-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <c.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{c.name}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {loadingForms ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-480px)]">
          <div className="space-y-3 pr-2">
            {filteredPhrases.map((phrase, idx) => (
              <Card key={idx} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {/* Visual sign representation */}
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden flex-shrink-0">
                      <img
                        src={CATEGORY_IMAGES[activeCategory] || signHealth}
                        alt="Sign language illustration"
                        className="w-full h-full object-cover"
                        loading="lazy"
                        width={512}
                        height={512}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground text-sm sm:text-base">"{phrase.phrase}"</p>
                      <p className="text-xs text-muted-foreground mt-1">{phrase.description}</p>
                      <div className="mt-2 p-2 rounded-lg bg-muted/50 border border-border">
                        <p className="text-xs font-medium text-primary mb-0.5">{currentLang.flag} {currentLang.name}:</p>
                        <p className="text-sm text-foreground">{(phrase.signs as any)[selectedLanguage] || "Translation pending"}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {filteredPhrases.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <HandMetal className="h-12 w-12 mx-auto mb-3 opacity-30" />
                {selectedFormId !== "all" ? (
                  <div>
                    <p className="font-medium">No questions found in this form</p>
                    <p className="text-sm mt-1">Select a different form or switch to General Phrases</p>
                  </div>
                ) : (
                  <p>No phrases found matching "{searchQuery}"</p>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};

export default SignLanguageView;
