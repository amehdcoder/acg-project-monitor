import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HandMetal, Search, Globe, Users, MessageSquare, FileText, Loader2, Sparkles, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import SignLanguageImage from "@/components/SignLanguage/SignLanguageImage";

const LANGUAGES = [
  { id: "asl", name: "American Sign Language (ASL)", flag: "🇺🇸" },
  { id: "bsl", name: "British Sign Language (BSL)", flag: "🇬🇧" },
  { id: "isl", name: "International Sign Language", flag: "🌍" },
  { id: "nsl", name: "Nigerian Sign Language (NSL)", flag: "🇳🇬" },
  { id: "hausa", name: "Hausa Sign Language", flag: "🇳🇬" },
  { id: "yoruba", name: "Yoruba Sign Language", flag: "🇳🇬" },
  { id: "igbo", name: "Igbo Sign Language", flag: "🇳🇬" },
  { id: "idoma", name: "Idoma Sign Language", flag: "🇳🇬" },
  { id: "nupe", name: "Nupe Sign Language", flag: "🇳🇬" },
  { id: "gbagyi", name: "Gbagyi Sign Language", flag: "🇳🇬" },
  { id: "tiv", name: "Tiv Sign Language", flag: "🇳🇬" },
];

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

const ESSENTIAL_PHRASES: SignCategory[] = [
  {
    id: "greetings",
    name: "Greetings & Introduction",
    icon: Users,
    phrases: [
      { phrase: "Hello, my name is...", description: "Wave hand, then point to self and fingerspell name", signs: { asl: "Wave + point to self + fingerspell", bsl: "Open hand wave + point to self + fingerspell", isl: "Wave with open palm + self-point + fingerspell", nsl: "Open palm wave + chest tap + fingerspell", hausa: "Right hand to forehead salute + chest point", yoruba: "Both palms open forward + chest touch", igbo: "Right hand wave + point to chest", idoma: "Open hand raise + touch chest", nupe: "Palm outward wave + self-point gesture", gbagyi: "Head nod + hand to chest", tiv: "Right hand raise + chest tap" } },
      { phrase: "How are you?", description: "Thumbs up, questioning expression", signs: { asl: "Both fists thumbs up, move alternately + raised eyebrows", bsl: "Thumbs up + questioning face", isl: "Both thumbs up alternating + raised brows", nsl: "Open palm circle on chest + questioning face", hausa: "Right palm on heart + eyebrows raised", yoruba: "Both hands flat, palms up + head tilt", igbo: "Hand wave + questioning expression", idoma: "Palm to chest, circle + ask face", nupe: "Thumbs up + head tilt question", gbagyi: "Hand to chest + questioning nod", tiv: "Open palms out + raised brows" } },
      { phrase: "I am a health worker", description: "Point to self, cross arms on chest (health), working gesture", signs: { asl: "Point self + cross wrists on chest + miming working", bsl: "Self-point + cross on upper arm + work gesture", isl: "Self-indicate + red cross sign + clipboard mime", nsl: "Self-point + red cross sign on arm + clipboard mime", hausa: "Chest point + cross arms (medicine) + writing motion", yoruba: "Self-tap + heart area cross + noting gesture", igbo: "Point chest + arms crossed health + work mime", idoma: "Self-point + medical cross + writing", nupe: "Chest touch + cross sign + clipboard", gbagyi: "Self-indicate + health cross + activity mime", tiv: "Point self + cross on chest + work gesture" } },
      { phrase: "Thank you for your time", description: "Flat hand from chin forward, clock gesture", signs: { asl: "Flat hand from chin forward + wrist tap", bsl: "Hand from chin + wrist tap", isl: "Both palms forward from face + time circle", nsl: "Hand from lips forward + clock circle", hausa: "Hand from mouth bow + time circle", yoruba: "Both palms forward + wrist gesture", igbo: "Hand forward from chin + time sign", idoma: "Chin to forward + clock mime", nupe: "Gratitude gesture + time sign", gbagyi: "Forward hand + wrist circle", tiv: "Chin forward + time gesture" } },
    ],
  },
  {
    id: "consent",
    name: "Consent & Permission",
    icon: MessageSquare,
    phrases: [
      { phrase: "May I ask you some questions?", description: "Point to self, mime talking, questioning look", signs: { asl: "Self-point + index finger from lips + raised eyebrows", bsl: "Self-point + talking gesture + question face", isl: "Self-indicate + speech gesture + palms up question", nsl: "Self-point + talking gesture + palms up question", hausa: "Self-point + mouth gesture + permission nod", yoruba: "Chest touch + speaking mime + open palms up", igbo: "Self-point + lip gesture + questioning", idoma: "Point self + talking + palms up", nupe: "Self-indicate + mouth move + ask gesture", gbagyi: "Self-point + talk mime + head question", tiv: "Self-point + lips motion + open palms" } },
      { phrase: "You can say no at any time", description: "Point to person, head shake (no), clock gesture (time)", signs: { asl: "Point to other + head shake + wrist tap (time)", bsl: "Point other + shake head + clock gesture", isl: "Indicate person + X hand (no) + time circle", nsl: "Point other + X hand (no) + clock circle", hausa: "Point to person + hand wave no + time circle", yoruba: "Person point + cross hands + wrist watch", igbo: "Point other + shake head + time gesture", idoma: "Point + no gesture + clock mime", nupe: "Indicate person + refusal sign + time", gbagyi: "Point + head shake + wrist circle", tiv: "Point out + refuse gesture + time sign" } },
      { phrase: "Your information is confidential", description: "Point to person, lock gesture, secret sign", signs: { asl: "Point + fist twist (lock) + finger over lips (secret)", bsl: "Point other + key turn + sealed lips", isl: "Indicate person + lock twist + finger on lips", nsl: "Point other + key turning + lips sealed", hausa: "Person point + lock twist + silence gesture", yoruba: "Point + key turn + lips zip", igbo: "Point other + lock sign + quiet mouth", idoma: "Indicate + lock gesture + sealed lips", nupe: "Point + turn key + finger on lips", gbagyi: "Point other + lock + quiet sign", tiv: "Point + lock twist + lips sealed" } },
      { phrase: "Do you agree to participate?", description: "Handshake gesture + questioning face", signs: { asl: "Clasp hands + thumbs up/down + raised eyebrows", bsl: "Handshake + thumbs up/down + raised brows", isl: "Clasped hands + question expression", nsl: "Handshake mime + question face", hausa: "Handshake + yes/no question", yoruba: "Clasped hands + ask expression", igbo: "Handshake gesture + question", idoma: "Clasp + ask face", nupe: "Handshake + question", gbagyi: "Clasp gesture + questioning", tiv: "Handshake + raised brows" } },
    ],
  },
];

const generateQuestionSigns = (questionLabel: string): Record<string, string> => ({
  asl: `Self-point + illustrate "${questionLabel}" + raised eyebrows`,
  bsl: `Self-point + illustrate "${questionLabel}" + questioning face`,
  isl: `Indicate + show "${questionLabel}" + question expression`,
  nsl: `Open palm indicate + mime "${questionLabel}" + question face`,
  hausa: `Point person + describe "${questionLabel}" + ask expression`,
  yoruba: `Indicate + show "${questionLabel}" + head tilt question`,
  igbo: `Point + gesture "${questionLabel}" + questioning look`,
  idoma: `Indicate person + mime "${questionLabel}" + ask`,
  nupe: `Point + show "${questionLabel}" + question expression`,
  gbagyi: `Indicate + describe "${questionLabel}" + raised brows`,
  tiv: `Point out + mime "${questionLabel}" + question face`,
});

interface ProjectForm {
  id: string;
  name: string;
  project_id: string;
  project_name: string;
  questions: { id: string; label: string; type: string }[];
}

const SignLanguageView = () => {
  const { user, isAdmin } = useAuth();
  const [selectedLanguage, setSelectedLanguage] = useState("isl");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("greetings");
  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [selectedFormId, setSelectedFormId] = useState<string>("all");
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [forms, setForms] = useState<ProjectForm[]>([]);
  const [loadingForms, setLoadingForms] = useState(true);
  const [expandedPhrase, setExpandedPhrase] = useState<number | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      setLoadingForms(true);
      try {
        const { data: projectsData } = await supabase.from("projects").select("id, name").order("name");
        setProjects(projectsData || []);
        let formsQuery = supabase.from("forms").select("id, name, project_id, questions").eq("status", "active");
        if (!isAdmin) {
          const { data: assignments } = await supabase.from("user_form_assignments").select("form_id").eq("user_id", user.id);
          if (assignments && assignments.length > 0) {
            formsQuery = formsQuery.in("id", assignments.map(a => a.form_id));
          }
        }
        const { data: formsData } = await formsQuery.order("name");
        const projectMap = new Map((projectsData || []).map(p => [p.id, p.name]));
        setForms((formsData || []).map(f => ({
          id: f.id, name: f.name, project_id: f.project_id,
          project_name: projectMap.get(f.project_id) || "Unknown Project",
          questions: Array.isArray(f.questions) ? (f.questions as any[]).map((q: any) => ({
            id: q.id || q.name || String(Math.random()),
            label: q.label || q.title || q.name || "Untitled Question",
            type: q.type || "text",
          })) : [],
        })));
      } catch (err) { console.error("Error fetching forms:", err); }
      finally { setLoadingForms(false); }
    })();
  }, [user?.id]);

  const filteredForms = useMemo(() => selectedProjectId === "all" ? forms : forms.filter(f => f.project_id === selectedProjectId), [forms, selectedProjectId]);
  const selectedForm = useMemo(() => selectedFormId === "all" ? null : forms.find(f => f.id === selectedFormId) || null, [forms, selectedFormId]);

  const formQuestionPhrases = useMemo(() => {
    if (!selectedForm) return [];
    return selectedForm.questions.map(q => ({
      phrase: q.label,
      description: `Sign for asking: "${q.label}" (${q.type} question)`,
      signs: generateQuestionSigns(q.label),
    }));
  }, [selectedForm]);

  const allCategories = useMemo(() => {
    const cats = [...ESSENTIAL_PHRASES];
    if (selectedForm && formQuestionPhrases.length > 0) {
      cats.push({ id: "form_questions", name: `📋 ${selectedForm.name}`, icon: FileText, phrases: formQuestionPhrases });
    }
    return cats;
  }, [selectedForm, formQuestionPhrases]);

  const filteredPhrases = allCategories.find(c => c.id === activeCategory)?.phrases.filter(p =>
    p.phrase.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const currentLang = LANGUAGES.find(l => l.id === selectedLanguage)!;

  return (
    <div className="space-y-5 p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/10 p-5 sm:p-6">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
            <HandMetal className="h-8 w-8 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">Sign Language Guide</h1>
              <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                <Sparkles className="h-3 w-3 mr-1" />AI-Powered
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">Dynamic AI-generated sign illustrations for inclusive data collection across languages</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Select value={selectedProjectId} onValueChange={v => { setSelectedProjectId(v); setSelectedFormId("all"); }}>
          <SelectTrigger className="text-sm h-10"><SelectValue placeholder="Select Project" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={selectedFormId} onValueChange={v => { setSelectedFormId(v); if (v !== "all") setActiveCategory("form_questions"); }}>
          <SelectTrigger className="text-sm h-10"><SelectValue placeholder="Select Form" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Forms (General Phrases)</SelectItem>
            {filteredForms.map(f => <SelectItem key={f.id} value={f.id}>📋 {f.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
          <SelectTrigger className="text-sm h-10"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LANGUAGES.map(l => <SelectItem key={l.id} value={l.id}>{l.flag} {l.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search phrases..." className="pl-9 text-sm h-10" />
        </div>
      </div>

      {/* Info strip */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-xs gap-1"><Globe className="h-3 w-3" />{currentLang.flag} {currentLang.name}</Badge>
        <Badge variant="secondary" className="text-xs">{filteredPhrases.length} phrases</Badge>
        {selectedForm && <Badge className="text-xs bg-primary/10 text-primary hover:bg-primary/20 border-primary/20">Form: {selectedForm.name}</Badge>}
        <Badge variant="outline" className="text-xs gap-1 ml-auto"><Eye className="h-3 w-3" />AI illustrations generated per phrase</Badge>
      </div>

      {/* Category tabs */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList className="w-full flex-wrap h-auto gap-1 bg-muted/50 p-1">
          {allCategories.map(c => (
            <TabsTrigger key={c.id} value={c.id} className="text-xs gap-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-lg">
              <c.icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{c.name}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Phrase cards */}
      {loadingForms ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-500px)] min-h-[300px]">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pr-2">
            {filteredPhrases.map((phrase, idx) => {
              const isExpanded = expandedPhrase === idx;
              return (
                <Card
                  key={idx}
                  className="overflow-hidden border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-md cursor-pointer"
                  onClick={() => setExpandedPhrase(isExpanded ? null : idx)}
                >
                  <CardContent className="p-0">
                    <div className="flex flex-col">
                      {/* AI-generated sign image */}
                      <SignLanguageImage
                        phrase={phrase.phrase}
                        signLanguage={currentLang.name}
                        signDescription={(phrase.signs as any)[selectedLanguage] || phrase.description}
                        category={activeCategory}
                        className={`w-full ${isExpanded ? "h-64 sm:h-80" : "h-40 sm:h-48"} transition-all duration-300`}
                      />

                      {/* Content */}
                      <div className="p-4 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-foreground text-sm sm:text-base leading-snug">"{phrase.phrase}"</p>
                          <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">{activeCategory}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{phrase.description}</p>

                        {/* Sign description */}
                        <div className="p-3 rounded-xl bg-gradient-to-r from-primary/5 to-transparent border border-primary/10">
                          <p className="text-[11px] font-medium text-primary mb-1">{currentLang.flag} {currentLang.name}</p>
                          <p className="text-sm text-foreground leading-relaxed">{(phrase.signs as any)[selectedLanguage] || "Translation pending"}</p>
                        </div>

                        {/* Expanded: show all languages */}
                        {isExpanded && (
                          <div className="space-y-1.5 pt-2 border-t border-border/50 mt-2">
                            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">All Languages</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {LANGUAGES.filter(l => l.id !== selectedLanguage).map(lang => {
                                const sign = (phrase.signs as any)[lang.id];
                                if (!sign) return null;
                                return (
                                  <div key={lang.id} className="p-2 rounded-lg bg-muted/30 text-xs">
                                    <span className="font-medium">{lang.flag} {lang.name.split("(")[0].trim()}:</span>
                                    <span className="text-muted-foreground ml-1">{sign}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {filteredPhrases.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
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
        </ScrollArea>
      )}
    </div>
  );
};

export default SignLanguageView;
