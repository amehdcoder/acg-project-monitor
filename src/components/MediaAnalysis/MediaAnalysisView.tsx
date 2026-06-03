import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Image, Mic, Video, Upload, Loader2, FileCheck, AlertTriangle,
  CheckCircle, XCircle, Eye, Sparkles, FileText, Database, RefreshCw,
  Quote, Lightbulb, ListChecks, BrainCircuit, Copy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";


interface AnalysisResult {
  id: string;
  type: "image" | "audio" | "video";
  fileName: string;
  timestamp: string;
  transcript?: string;
  extractedData: Record<string, any>;
  qualityFlags: { label: string; severity: "ok" | "warning" | "error" }[];
  summary: string;
  confidence: number;
}

interface Theme {
  name: string;
  description: string;
  prevalence: number;
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  keywords: string[];
  quotes: string[];
}

interface ThematicResult {
  overview: string;
  sentiment?: { positive: number; neutral: number; negative: number };
  themes: Theme[];
  insights: string[];
  recommendations: string[];
}

interface CollectedMedia {
  id: string;
  formName: string;
  fieldName: string;
  mediaType: "image" | "audio" | "video";
  url: string;
  submittedBy: string;
  submittedAt: string;
  submissionId: string;
}

const MediaAnalysisView = () => {
  const [activeTab, setActiveTab] = useState("image");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [collectedMedia, setCollectedMedia] = useState<CollectedMedia[]>([]);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [mainView, setMainView] = useState<"upload" | "collected">("collected");
  const [thematic, setThematic] = useState<ThematicResult | null>(null);
  const [isThematizing, setIsThematizing] = useState(false);
  const [resultsView, setResultsView] = useState<"items" | "themes">("items");

  // Fetch collected media from form submissions
  useEffect(() => {
    fetchCollectedMedia();
  }, []);

  const fetchCollectedMedia = async () => {
    setLoadingMedia(true);
    try {
      const { data: submissions } = await supabase
        .from("form_submissions")
        .select("id, data, form_id, user_id, submitted_at, created_at")
        .eq("status", "submitted")
        .order("submitted_at", { ascending: false })
        .limit(200);

      if (!submissions?.length) {
        setLoadingMedia(false);
        return;
      }

      // Get form names
      const formIds = [...new Set(submissions.map(s => s.form_id))];
      const { data: forms } = await supabase
        .from("forms")
        .select("id, name")
        .in("id", formIds);
      const formMap = new Map((forms || []).map(f => [f.id, f.name]));

      // Get user profiles
      const userIds = [...new Set(submissions.map(s => s.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", userIds);
      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

      const mediaItems: CollectedMedia[] = [];

      for (const sub of submissions) {
        const data = sub.data as Record<string, any>;
        if (!data || typeof data !== "object") continue;

        const profile = profileMap.get(sub.user_id);
        const userName = profile
          ? `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || profile.email
          : "Unknown";

        for (const [key, value] of Object.entries(data)) {
          if (typeof value !== "string") continue;
          const lower = value.toLowerCase();
          let mediaType: "image" | "audio" | "video" | null = null;

          if (lower.startsWith("data:image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(value)) {
            mediaType = "image";
          } else if (lower.startsWith("data:audio/") || /\.(mp3|wav|ogg|webm|m4a|aac)$/i.test(value)) {
            mediaType = "audio";
          } else if (lower.startsWith("data:video/") || /\.(mp4|webm|mov|avi|mkv)$/i.test(value)) {
            mediaType = "video";
          }

          if (mediaType) {
            mediaItems.push({
              id: `${sub.id}-${key}`,
              formName: formMap.get(sub.form_id) || "Unknown Form",
              fieldName: key.replace(/_/g, " "),
              mediaType,
              url: value,
              submittedBy: userName,
              submittedAt: sub.submitted_at || sub.created_at,
              submissionId: sub.id,
            });
          }
        }
      }

      setCollectedMedia(mediaItems);
    } catch (err) {
      console.error("Error fetching collected media:", err);
    } finally {
      setLoadingMedia(false);
    }
  };

  const analyzeCollectedMedia = async (media: CollectedMedia) => {
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-media", {
        body: {
          mediaData: media.url,
          mediaType: media.mediaType,
          fileName: `${media.formName} - ${media.fieldName}`,
          mimeType: media.mediaType === "image" ? "image/jpeg" : media.mediaType === "audio" ? "audio/webm" : "video/mp4",
        },
      });

      if (error || data?.fallback) {
        const localResult: AnalysisResult = {
          id: crypto.randomUUID(),
          type: media.mediaType,
          fileName: `${media.formName} — ${media.fieldName}`,
          timestamp: new Date().toISOString(),
          extractedData: { source: "Form Submission", submittedBy: media.submittedBy, form: media.formName, field: media.fieldName },
          qualityFlags: [{ label: "AI analysis unavailable — local fallback", severity: "warning" }],
          summary: `Local analysis of ${media.mediaType} from form "${media.formName}", field "${media.fieldName}".`,
          confidence: 0.5,
        };
        setResults(prev => [localResult, ...prev]);
        toast({ title: "Analysis Complete (Local)", description: "Used local analysis engine." });
      } else {
        const result: AnalysisResult = {
          id: crypto.randomUUID(),
          type: media.mediaType,
          fileName: `${media.formName} — ${media.fieldName}`,
          timestamp: new Date().toISOString(),
          transcript: data.transcript || "",
          extractedData: { ...data.extractedData, source: "Form Submission", submittedBy: media.submittedBy, form: media.formName },
          qualityFlags: data.qualityFlags || [],
          summary: data.summary || "Analysis complete.",
          confidence: data.confidence || 0.85,
        };
        setResults(prev => [result, ...prev]);
        toast({ title: "AI Analysis Complete", description: `Analyzed ${media.mediaType} from ${media.formName}.` });
      }
    } catch {
      toast({ title: "Analysis Failed", variant: "destructive" });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  };

  const analyzeMedia = useCallback(async () => {
    if (!selectedFile) return;
    setIsAnalyzing(true);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(selectedFile);
      });
      const base64Data = await base64Promise;
      const mediaType = selectedFile.type.startsWith("image/") ? "image" : selectedFile.type.startsWith("audio/") ? "audio" : "video";

      const { data, error } = await supabase.functions.invoke("analyze-media", {
        body: { mediaData: base64Data, mediaType, fileName: selectedFile.name, mimeType: selectedFile.type },
      });

      if (error || data?.fallback) {
        const localResult = generateLocalAnalysis(selectedFile, mediaType);
        setResults(prev => [localResult, ...prev]);
        toast({ title: "Analysis Complete (Local)" });
      } else {
        const result: AnalysisResult = {
          id: crypto.randomUUID(),
          type: mediaType,
          fileName: selectedFile.name,
          timestamp: new Date().toISOString(),
          transcript: data.transcript || "",
          extractedData: data.extractedData || {},
          qualityFlags: data.qualityFlags || [],
          summary: data.summary || "Analysis complete.",
          confidence: data.confidence || 0.85,
        };
        setResults(prev => [result, ...prev]);
        toast({ title: "AI Analysis Complete" });
      }
    } catch {
      const mediaType = selectedFile.type.startsWith("image/") ? "image" : selectedFile.type.startsWith("audio/") ? "audio" : "video";
      const localResult = generateLocalAnalysis(selectedFile, mediaType);
      setResults(prev => [localResult, ...prev]);
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedFile]);

  // Documents available for thematic analysis = analysed results that have text
  const thematicDocs = results
    .map(r => ({
      id: r.id,
      label: r.fileName,
      text: (r.transcript && r.transcript.trim()) ? r.transcript : r.summary,
    }))
    .filter(d => d.text && d.text.trim().length > 20);

  const runThematicAnalysis = async () => {
    if (thematicDocs.length === 0) {
      toast({ title: "Nothing to analyse", description: "Analyse some media first to generate transcripts.", variant: "destructive" });
      return;
    }
    setIsThematizing(true);
    setResultsView("themes");
    try {
      const { data, error } = await supabase.functions.invoke("thematic-analysis", {
        body: { documents: thematicDocs },
      });
      if (error || data?.fallback || data?.error) {
        toast({
          title: "Thematic analysis unavailable",
          description: data?.error || "AI engine could not be reached. Please try again.",
          variant: "destructive",
        });
      } else {
        setThematic(data as ThematicResult);
        toast({ title: "Thematic Analysis Complete", description: `${(data.themes || []).length} themes identified across ${thematicDocs.length} document(s).` });
      }
    } catch {
      toast({ title: "Thematic analysis failed", variant: "destructive" });
    } finally {
      setIsThematizing(false);
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard?.writeText(text);
    toast({ title: "Copied to clipboard" });
  };



  const generateLocalAnalysis = (file: File, type: "image" | "audio" | "video"): AnalysisResult => {
    const flags: AnalysisResult["qualityFlags"] = [];
    const extractedData: Record<string, any> = {
      fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      mimeType: file.type,
      lastModified: new Date(file.lastModified).toISOString(),
    };
    if (file.size > 10 * 1024 * 1024) flags.push({ label: "Large file size", severity: "warning" });
    if (file.size < 10 * 1024) flags.push({ label: "Very small file — may indicate low quality", severity: "warning" });
    flags.push({ label: "Full AI analysis available when online", severity: "warning" });

    return {
      id: crypto.randomUUID(), type, fileName: file.name,
      timestamp: new Date().toISOString(), extractedData, qualityFlags: flags,
      summary: `Local analysis of ${type} file "${file.name}".`, confidence: 0.5,
    };
  };

  const getAcceptTypes = () => {
    switch (activeTab) { case "image": return "image/*"; case "audio": return "audio/*"; case "video": return "video/*"; default: return "*/*"; }
  };

  const severityIcon = (s: string) => {
    if (s === "ok") return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
    if (s === "warning") return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
    return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  };

  const mediaIcon = (type: string) => {
    if (type === "image") return <Image className="h-4 w-4 text-blue-500" />;
    if (type === "audio") return <Mic className="h-4 w-4 text-purple-500" />;
    return <Video className="h-4 w-4 text-red-500" />;
  };

  const filteredCollected = collectedMedia.filter(m => activeTab === "image" ? m.mediaType === "image" : activeTab === "audio" ? m.mediaType === "audio" : m.mediaType === "video");

  return (
    <div className="space-y-6 p-4 lg:p-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="font-display text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          Media Analysis
        </h1>
        <p className="text-muted-foreground mt-1">
          Transcribe audio, video & image text, then run AI thematic analysis to surface themes, sentiment and insights across your media
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel */}
        <div className="lg:col-span-1 space-y-4">
          {/* Source Toggle */}
          <Card>
            <CardContent className="p-3">
              <div className="flex gap-2">
                <Button variant={mainView === "collected" ? "default" : "outline"} size="sm" className="flex-1 gap-1.5 text-xs" onClick={() => setMainView("collected")}>
                  <Database className="h-3.5 w-3.5" /> Collected Data
                </Button>
                <Button variant={mainView === "upload" ? "default" : "outline"} size="sm" className="flex-1 gap-1.5 text-xs" onClick={() => setMainView("upload")}>
                  <Upload className="h-3.5 w-3.5" /> Upload New
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {mainView === "collected" ? "Collected Media" : "Upload Media"}
              </CardTitle>
              <CardDescription>
                {mainView === "collected" ? "Media from form submissions" : "Select a file to analyze"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="image" className="gap-1.5 text-xs"><Image className="h-3.5 w-3.5" /> Image</TabsTrigger>
                  <TabsTrigger value="audio" className="gap-1.5 text-xs"><Mic className="h-3.5 w-3.5" /> Audio</TabsTrigger>
                  <TabsTrigger value="video" className="gap-1.5 text-xs"><Video className="h-3.5 w-3.5" /> Video</TabsTrigger>
                </TabsList>
              </Tabs>

              {mainView === "upload" ? (
                <>
                  <input ref={fileInputRef} type="file" accept={getAcceptTypes()} onChange={handleFileSelect} className="hidden" />
                  <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:bg-muted/30 transition-colors">
                    {previewUrl && activeTab === "image" ? (
                      <img src={previewUrl} alt="Preview" className="max-h-40 mx-auto rounded-lg object-contain mb-2" />
                    ) : previewUrl && activeTab === "video" ? (
                      <video src={previewUrl} className="max-h-40 mx-auto rounded-lg mb-2" controls muted />
                    ) : (
                      <Upload className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                    )}
                    <p className="text-sm font-medium text-foreground">{selectedFile ? selectedFile.name : "Click to select file"}</p>
                    {selectedFile && <p className="text-xs text-muted-foreground mt-1">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>}
                  </div>
                  <Button onClick={analyzeMedia} disabled={!selectedFile || isAnalyzing} className="w-full gap-2">
                    {isAnalyzing ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing...</> : <><Sparkles className="h-4 w-4" /> Analyze with AI</>}
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{filteredCollected.length} {activeTab} file(s) found</p>
                    <Button variant="ghost" size="sm" onClick={fetchCollectedMedia} disabled={loadingMedia} className="gap-1 text-xs h-7">
                      <RefreshCw className={`h-3 w-3 ${loadingMedia ? "animate-spin" : ""}`} /> Refresh
                    </Button>
                  </div>
                  {loadingMedia ? (
                    <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                  ) : filteredCollected.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Database className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p className="text-xs">No {activeTab} files found in submissions</p>
                    </div>
                  ) : (
                    <ScrollArea className="max-h-[340px]">
                      <div className="space-y-2">
                        {filteredCollected.slice(0, 50).map(media => (
                          <div key={media.id} className="border border-border/50 rounded-lg p-2.5 hover:bg-muted/30 transition-colors">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  {mediaIcon(media.mediaType)}
                                  <span className="text-xs font-medium truncate">{media.formName}</span>
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">Field: {media.fieldName}</p>
                                <p className="text-[10px] text-muted-foreground">By: {media.submittedBy}</p>
                                <p className="text-[10px] text-muted-foreground">{new Date(media.submittedAt).toLocaleDateString()}</p>
                              </div>
                              <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 shrink-0" onClick={() => analyzeCollectedMedia(media)} disabled={isAnalyzing}>
                                <Sparkles className="h-3 w-3" /> Analyze
                              </Button>
                            </div>
                            {media.mediaType === "image" && media.url.startsWith("data:image") && (
                              <img src={media.url} alt="preview" className="mt-2 max-h-16 rounded object-cover" />
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Quick stats */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div>
                  <p className="text-2xl font-bold text-foreground">{collectedMedia.length}</p>
                  <p className="text-[10px] text-muted-foreground">Collected Media</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{results.length}</p>
                  <p className="text-[10px] text-muted-foreground">Analyzed</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center mt-3 pt-3 border-t border-border/50">
                <div>
                  <p className="text-lg font-bold text-foreground">{collectedMedia.filter(m => m.mediaType === "image").length}</p>
                  <p className="text-[10px] text-muted-foreground">Images</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{collectedMedia.filter(m => m.mediaType === "audio").length}</p>
                  <p className="text-[10px] text-muted-foreground">Audio</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-foreground">{collectedMedia.filter(m => m.mediaType === "video").length}</p>
                  <p className="text-[10px] text-muted-foreground">Video</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileCheck className="h-4 w-4 text-primary" />
                  Analysis Results
                  {results.length > 0 && <Badge variant="secondary" className="ml-1">{results.length}</Badge>}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {results.length > 0 && (
                    <div className="flex rounded-lg border border-border/60 p-0.5">
                      <Button variant={resultsView === "items" ? "default" : "ghost"} size="sm" className="h-7 text-xs gap-1" onClick={() => setResultsView("items")}>
                        <FileText className="h-3.5 w-3.5" /> Transcripts
                      </Button>
                      <Button variant={resultsView === "themes" ? "default" : "ghost"} size="sm" className="h-7 text-xs gap-1" onClick={() => setResultsView("themes")}>
                        <BrainCircuit className="h-3.5 w-3.5" /> Themes
                      </Button>
                    </div>
                  )}
                  <Button size="sm" className="h-7 text-xs gap-1.5" onClick={runThematicAnalysis} disabled={isThematizing || thematicDocs.length === 0}>
                    {isThematizing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BrainCircuit className="h-3.5 w-3.5" />}
                    Run Thematic Analysis
                  </Button>
                </div>
              </div>
              {results.length > 0 && (
                <CardDescription className="text-xs">
                  {thematicDocs.length} document(s) ready for thematic analysis
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {results.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Eye className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">No analyses yet</p>
                  <p className="text-xs mt-1">Transcribe collected or uploaded media, then run a thematic analysis</p>
                </div>
              ) : resultsView === "themes" ? (
                <ScrollArea className="max-h-[640px]">
                  {isThematizing ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin mb-3" />
                      <p className="text-sm">Analysing themes across {thematicDocs.length} document(s)…</p>
                    </div>
                  ) : !thematic ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <BrainCircuit className="h-12 w-12 mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-medium">No thematic analysis yet</p>
                      <p className="text-xs mt-1">Click “Run Thematic Analysis” to discover themes across your transcripts</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Overview */}
                      <div className="bg-primary/5 border border-primary/15 rounded-xl p-4">
                        <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-1.5"><Sparkles className="h-3.5 w-3.5 text-primary" /> Overview</p>
                        <p className="text-sm text-muted-foreground">{thematic.overview}</p>
                        {thematic.sentiment && (
                          <div className="mt-3">
                            <div className="flex h-2.5 w-full overflow-hidden rounded-full">
                              <div className="bg-green-500" style={{ width: `${thematic.sentiment.positive}%` }} />
                              <div className="bg-muted-foreground/40" style={{ width: `${thematic.sentiment.neutral}%` }} />
                              <div className="bg-red-500" style={{ width: `${thematic.sentiment.negative}%` }} />
                            </div>
                            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                              <span>Positive {thematic.sentiment.positive}%</span>
                              <span>Neutral {thematic.sentiment.neutral}%</span>
                              <span>Negative {thematic.sentiment.negative}%</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Themes */}
                      {(thematic.themes || []).map((t, i) => (
                        <Card key={i} className="border border-border/50">
                          <CardContent className="p-4 space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-sm text-foreground">{t.name}</p>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <Badge variant="outline" className="text-[10px]">{t.prevalence} doc(s)</Badge>
                                <Badge variant="secondary" className={`text-[10px] capitalize ${t.sentiment === "positive" ? "bg-green-500/10 text-green-700 dark:text-green-400" : t.sentiment === "negative" ? "bg-red-500/10 text-red-700 dark:text-red-400" : "bg-muted text-muted-foreground"}`}>{t.sentiment}</Badge>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">{t.description}</p>
                            {t.keywords?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {t.keywords.map((k, ki) => (
                                  <span key={ki} className="text-[10px] bg-muted/60 rounded px-1.5 py-0.5">{k}</span>
                                ))}
                              </div>
                            )}
                            {t.quotes?.length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                {t.quotes.map((q, qi) => (
                                  <div key={qi} className="flex gap-1.5 text-xs italic text-muted-foreground border-l-2 border-primary/30 pl-2">
                                    <Quote className="h-3 w-3 shrink-0 mt-0.5 text-primary/50" />
                                    <span>{q}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      ))}

                      {/* Insights */}
                      {thematic.insights?.length > 0 && (
                        <div className="bg-muted/30 rounded-xl p-4">
                          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2"><Lightbulb className="h-3.5 w-3.5 text-amber-500" /> Key Insights</p>
                          <ul className="space-y-1.5">
                            {thematic.insights.map((it, ii) => (
                              <li key={ii} className="text-xs text-muted-foreground flex gap-1.5"><span className="text-primary">•</span>{it}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Recommendations */}
                      {thematic.recommendations?.length > 0 && (
                        <div className="bg-muted/30 rounded-xl p-4">
                          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5 mb-2"><ListChecks className="h-3.5 w-3.5 text-primary" /> Recommendations</p>
                          <ul className="space-y-1.5">
                            {thematic.recommendations.map((rc, ri) => (
                              <li key={ri} className="text-xs text-muted-foreground flex gap-1.5"><span className="text-primary">•</span>{rc}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </ScrollArea>
              ) : (
                <ScrollArea className="max-h-[640px]">
                  <div className="space-y-4">
                    {results.map(result => (
                      <Card key={result.id} className="border border-border/50">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {mediaIcon(result.type)}
                              <span className="font-medium text-sm truncate max-w-[250px]">{result.fileName}</span>
                            </div>
                            <Badge variant="secondary" className={`text-[10px] ${result.confidence >= 0.8 ? "bg-green-500/10 text-green-700 dark:text-green-400" : result.confidence >= 0.5 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" : "bg-red-500/10 text-red-700 dark:text-red-400"}`}>
                              {Math.round(result.confidence * 100)}% confidence
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{result.summary}</p>
                          {result.transcript && result.transcript.trim() && (
                            <div className="bg-muted/30 rounded-lg p-3 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><FileText className="h-3 w-3" /> Transcript</p>
                                <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => copyText(result.transcript!)}>
                                  <Copy className="h-3 w-3" /> Copy
                                </Button>
                              </div>
                              <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">{result.transcript}</p>
                            </div>
                          )}
                          {Object.keys(result.extractedData).length > 0 && (
                            <div className="bg-muted/30 rounded-lg p-3 space-y-1.5">
                              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><FileText className="h-3 w-3" /> Extracted Data</p>
                              {Object.entries(result.extractedData).map(([key, value]) => (
                                <div key={key} className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}</span>
                                  <span className="font-medium text-foreground max-w-[200px] truncate">{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {result.qualityFlags.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-foreground">Quality Flags</p>
                              <div className="flex flex-wrap gap-1.5">
                                {result.qualityFlags.map((flag, i) => (
                                  <div key={i} className="flex items-center gap-1 text-xs bg-muted/50 rounded-md px-2 py-1">
                                    {severityIcon(flag.severity)}
                                    <span>{flag.label}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <p className="text-[10px] text-muted-foreground">{new Date(result.timestamp).toLocaleString()}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default MediaAnalysisView;
