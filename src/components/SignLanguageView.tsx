import { useState, useEffect, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HandMetal, Search, Globe, FileText, Loader2, Sparkles, BookOpen, Grip, GraduationCap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import SignLanguageImage from "@/components/SignLanguage/SignLanguageImage";
import VisualResponseBoard from "@/components/SignLanguage/VisualResponseBoard";
import FingerspellingChart from "@/components/SignLanguage/FingerspellingChart";
import CommunicationTips from "@/components/SignLanguage/CommunicationTips";
import { LANGUAGES, ESSENTIAL_PHRASES, generateQuestionSigns, type SignCategory } from "@/components/SignLanguage/SignPhraseData";

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
  const [mainTab, setMainTab] = useState("guide");
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

  const allCategories: SignCategory[] = useMemo(() => {
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
    <div className="space-y-4 p-2 sm:p-4 lg:p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/10 p-5 sm:p-6">
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
            <HandMetal className="h-8 w-8 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="font-display text-xl sm:text-2xl font-bold text-foreground">Inclusive Data Collection Toolkit</h1>
              <Badge className="text-[10px] bg-primary/10 text-primary border-primary/20">
                <Sparkles className="h-3 w-3 mr-1" />AI-Powered
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Complete sign language guide, visual communication board & reference tools for collecting data from persons with hearing impairments
            </p>
          </div>
        </div>
      </div>

      {/* Main navigation tabs */}
      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList className="w-full h-auto flex-wrap gap-1 bg-muted/50 p-1.5">
          <TabsTrigger value="guide" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <BookOpen className="h-4 w-4" /> Sign Guide
          </TabsTrigger>
          <TabsTrigger value="response_board" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Grip className="h-4 w-4" /> Response Board
          </TabsTrigger>
          <TabsTrigger value="reference" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <Globe className="h-4 w-4" /> Alphabet & Numbers
          </TabsTrigger>
          <TabsTrigger value="tips" className="gap-1.5 text-xs sm:text-sm data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <GraduationCap className="h-4 w-4" /> Field Guide
          </TabsTrigger>
        </TabsList>

        {/* ===================== SIGN GUIDE TAB ===================== */}
        <TabsContent value="guide" className="space-y-4 mt-4">
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

          {/* Visual-first phrase cards */}
          {loadingForms ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <ScrollArea className="h-[calc(100vh-480px)] min-h-[300px]">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pr-2">
                {filteredPhrases.map((phrase, idx) => {
                  const isExpanded = expandedPhrase === idx;
                  return (
                    <Card
                      key={idx}
                      className="overflow-hidden border-border/50 hover:border-primary/30 transition-all duration-300 hover:shadow-md cursor-pointer group"
                      onClick={() => setExpandedPhrase(isExpanded ? null : idx)}
                    >
                      <CardContent className="p-0">
                        {/* IMAGE-DOMINANT: illustration takes ~60% of card */}
                        <SignLanguageImage
                          phrase={phrase.phrase}
                          signLanguage={currentLang.name}
                          signDescription={(phrase.signs as any)[selectedLanguage] || phrase.description}
                          category={activeCategory}
                          className={`w-full ${isExpanded ? "h-56 sm:h-72" : "h-44 sm:h-52"} transition-all duration-300`}
                        />

                        {/* Compact text overlay */}
                        <div className="p-3 space-y-1.5">
                          <p className="font-semibold text-foreground text-sm leading-snug">"{phrase.phrase}"</p>

                          {/* Sign instruction — visual-first with language flag */}
                          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-primary/5 border border-primary/10">
                            <span className="text-base shrink-0">{currentLang.flag}</span>
                            <p className="text-xs text-foreground leading-relaxed">{(phrase.signs as any)[selectedLanguage] || "Translation pending"}</p>
                          </div>

                          {isExpanded && (
                            <div className="space-y-1.5 pt-2 border-t border-border/50">
                              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Other Languages</p>
                              <div className="grid grid-cols-1 gap-1">
                                {LANGUAGES.filter(l => l.id !== selectedLanguage).map(lang => {
                                  const sign = (phrase.signs as any)[lang.id];
                                  if (!sign) return null;
                                  return (
                                    <div key={lang.id} className="flex items-start gap-1.5 p-1.5 rounded bg-muted/30 text-[11px]">
                                      <span className="shrink-0">{lang.flag}</span>
                                      <span className="text-muted-foreground">{sign}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
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
        </TabsContent>

        {/* ===================== RESPONSE BOARD TAB ===================== */}
        <TabsContent value="response_board" className="mt-4">
          <VisualResponseBoard />
        </TabsContent>

        {/* ===================== REFERENCE TAB ===================== */}
        <TabsContent value="reference" className="mt-4">
          <FingerspellingChart signLanguage={selectedLanguage} />
        </TabsContent>

        {/* ===================== FIELD GUIDE TAB ===================== */}
        <TabsContent value="tips" className="mt-4">
          <CommunicationTips />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SignLanguageView;
