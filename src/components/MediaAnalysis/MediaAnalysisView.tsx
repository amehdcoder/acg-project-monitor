import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Image, Mic, Video, Upload, Loader2, FileCheck, AlertTriangle,
  CheckCircle, XCircle, Eye, Sparkles, FileText,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface AnalysisResult {
  id: string;
  type: "image" | "audio" | "video";
  fileName: string;
  timestamp: string;
  extractedData: Record<string, any>;
  qualityFlags: { label: string; severity: "ok" | "warning" | "error" }[];
  summary: string;
  confidence: number;
}

const MediaAnalysisView = () => {
  const [activeTab, setActiveTab] = useState("image");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<AnalysisResult[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      // Convert file to base64 for Gemini analysis
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(selectedFile);
      });
      const base64Data = await base64Promise;

      const mediaType = selectedFile.type.startsWith("image/")
        ? "image"
        : selectedFile.type.startsWith("audio/")
        ? "audio"
        : "video";

      // Call edge function for AI analysis
      const { data, error } = await supabase.functions.invoke("analyze-media", {
        body: {
          mediaData: base64Data,
          mediaType,
          fileName: selectedFile.name,
          mimeType: selectedFile.type,
        },
      });

      if (error || data?.fallback) {
        // Local fallback analysis
        const localResult = generateLocalAnalysis(selectedFile, mediaType);
        setResults((prev) => [localResult, ...prev]);
        toast({
          title: "Analysis Complete (Local)",
          description: "Used local analysis engine. Connect to internet for AI-powered analysis.",
        });
      } else {
        const result: AnalysisResult = {
          id: crypto.randomUUID(),
          type: mediaType,
          fileName: selectedFile.name,
          timestamp: new Date().toISOString(),
          extractedData: data.extractedData || {},
          qualityFlags: data.qualityFlags || [],
          summary: data.summary || "Analysis complete.",
          confidence: data.confidence || 0.85,
        };
        setResults((prev) => [result, ...prev]);
        toast({
          title: "AI Analysis Complete",
          description: "Powered by Google Gemini AI.",
        });
      }
    } catch (err) {
      // Fallback
      const mediaType = selectedFile.type.startsWith("image/")
        ? "image"
        : selectedFile.type.startsWith("audio/")
        ? "audio"
        : "video";
      const localResult = generateLocalAnalysis(selectedFile, mediaType);
      setResults((prev) => [localResult, ...prev]);
      toast({
        title: "Analysis Complete (Offline)",
        description: "Used local analysis engine.",
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedFile]);

  const generateLocalAnalysis = (
    file: File,
    type: "image" | "audio" | "video"
  ): AnalysisResult => {
    const flags: AnalysisResult["qualityFlags"] = [];
    const extractedData: Record<string, any> = {
      fileSize: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
      mimeType: file.type,
      lastModified: new Date(file.lastModified).toISOString(),
    };

    if (file.size > 10 * 1024 * 1024) {
      flags.push({ label: "Large file size — may slow upload", severity: "warning" });
    }
    if (file.size < 10 * 1024) {
      flags.push({ label: "Very small file — may indicate low quality", severity: "warning" });
    }

    if (type === "image") {
      extractedData.format = file.type.split("/")[1]?.toUpperCase() || "Unknown";
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        flags.push({ label: "Uncommon image format", severity: "warning" });
      } else {
        flags.push({ label: "Standard image format", severity: "ok" });
      }
      flags.push({ label: "Metadata extraction pending (requires AI)", severity: "warning" });
    }

    if (type === "audio") {
      extractedData.format = file.type.split("/")[1]?.toUpperCase() || "Unknown";
      flags.push({ label: "Audio transcription requires AI", severity: "warning" });
      flags.push({ label: "Duration analysis pending", severity: "warning" });
    }

    if (type === "video") {
      extractedData.format = file.type.split("/")[1]?.toUpperCase() || "Unknown";
      flags.push({ label: "Video frame extraction requires AI", severity: "warning" });
      flags.push({ label: "Audio track present (requires verification)", severity: "warning" });
    }

    return {
      id: crypto.randomUUID(),
      type,
      fileName: file.name,
      timestamp: new Date().toISOString(),
      extractedData,
      qualityFlags: flags,
      summary: `Local analysis of ${type} file "${file.name}". Full AI analysis available when online.`,
      confidence: 0.5,
    };
  };

  const getAcceptTypes = () => {
    switch (activeTab) {
      case "image": return "image/*";
      case "audio": return "audio/*";
      case "video": return "video/*";
      default: return "image/*,audio/*,video/*";
    }
  };

  const severityIcon = (s: string) => {
    if (s === "ok") return <CheckCircle className="h-3.5 w-3.5 text-green-500" />;
    if (s === "warning") return <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
    return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  };

  return (
    <div className="space-y-6 p-4 lg:p-6 max-w-[1200px] mx-auto">
      <div>
        <h1 className="font-display text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
          <div className="p-2 rounded-xl bg-primary/10">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          Media Analysis
        </h1>
        <p className="text-muted-foreground mt-1">
          AI-powered image, audio & video analysis for automated data extraction and quality verification
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload & Analysis Panel */}
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Upload Media</CardTitle>
              <CardDescription>Select a file to analyze</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid grid-cols-3 w-full">
                  <TabsTrigger value="image" className="gap-1.5 text-xs">
                    <Image className="h-3.5 w-3.5" /> Image
                  </TabsTrigger>
                  <TabsTrigger value="audio" className="gap-1.5 text-xs">
                    <Mic className="h-3.5 w-3.5" /> Audio
                  </TabsTrigger>
                  <TabsTrigger value="video" className="gap-1.5 text-xs">
                    <Video className="h-3.5 w-3.5" /> Video
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <input
                ref={fileInputRef}
                type="file"
                accept={getAcceptTypes()}
                onChange={handleFileSelect}
                className="hidden"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:bg-muted/30 transition-colors"
              >
                {previewUrl && activeTab === "image" ? (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-40 mx-auto rounded-lg object-contain mb-2"
                  />
                ) : previewUrl && activeTab === "video" ? (
                  <video
                    src={previewUrl}
                    className="max-h-40 mx-auto rounded-lg mb-2"
                    controls
                    muted
                  />
                ) : (
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                )}
                <p className="text-sm font-medium text-foreground">
                  {selectedFile ? selectedFile.name : "Click to select file"}
                </p>
                {selectedFile && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                )}
              </div>

              <Button
                onClick={analyzeMedia}
                disabled={!selectedFile || isAnalyzing}
                className="w-full gap-2"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Analyze with AI
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Quick stats */}
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {results.filter((r) => r.type === "image").length}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Images</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {results.filter((r) => r.type === "audio").length}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Audio</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {results.filter((r) => r.type === "video").length}
                  </p>
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
              <CardTitle className="text-base flex items-center gap-2">
                <FileCheck className="h-4 w-4 text-primary" />
                Analysis Results
                {results.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {results.length}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {results.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Eye className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">No analyses yet</p>
                  <p className="text-xs mt-1">Upload a file and click analyze</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[600px]">
                  <div className="space-y-4">
                    {results.map((result) => (
                      <Card key={result.id} className="border border-border/50">
                        <CardContent className="p-4 space-y-3">
                          {/* Header */}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {result.type === "image" && <Image className="h-4 w-4 text-blue-500" />}
                              {result.type === "audio" && <Mic className="h-4 w-4 text-purple-500" />}
                              {result.type === "video" && <Video className="h-4 w-4 text-red-500" />}
                              <span className="font-medium text-sm truncate max-w-[200px]">
                                {result.fileName}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="secondary"
                                className={`text-[10px] ${
                                  result.confidence >= 0.8
                                    ? "bg-green-500/10 text-green-700 dark:text-green-400"
                                    : result.confidence >= 0.5
                                    ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                    : "bg-red-500/10 text-red-700 dark:text-red-400"
                                }`}
                              >
                                {Math.round(result.confidence * 100)}% confidence
                              </Badge>
                            </div>
                          </div>

                          {/* Summary */}
                          <p className="text-sm text-muted-foreground">{result.summary}</p>

                          {/* Extracted Data */}
                          {Object.keys(result.extractedData).length > 0 && (
                            <div className="bg-muted/30 rounded-lg p-3 space-y-1.5">
                              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                <FileText className="h-3 w-3" /> Extracted Data
                              </p>
                              {Object.entries(result.extractedData).map(([key, value]) => (
                                <div key={key} className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground capitalize">
                                    {key.replace(/_/g, " ")}
                                  </span>
                                  <span className="font-medium text-foreground">
                                    {typeof value === "object" ? JSON.stringify(value) : String(value)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Quality Flags */}
                          {result.qualityFlags.length > 0 && (
                            <div className="space-y-1">
                              <p className="text-xs font-semibold text-foreground">Quality Flags</p>
                              <div className="flex flex-wrap gap-1.5">
                                {result.qualityFlags.map((flag, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center gap-1 text-xs bg-muted/50 rounded-md px-2 py-1"
                                  >
                                    {severityIcon(flag.severity)}
                                    <span>{flag.label}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          <p className="text-[10px] text-muted-foreground">
                            {new Date(result.timestamp).toLocaleString()}
                          </p>
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
