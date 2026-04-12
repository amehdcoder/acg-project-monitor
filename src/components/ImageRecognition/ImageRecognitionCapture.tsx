import { useState, useRef, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Camera, Upload, Loader2, Eye, Sparkles, FileText, ScanLine,
  CheckCircle, AlertTriangle, Copy, Image as ImageIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface ExtractedField {
  key: string;
  value: string;
  confidence: number;
}

interface RecognitionResult {
  id: string;
  fileName: string;
  timestamp: string;
  previewUrl: string;
  extractedFields: ExtractedField[];
  rawText: string;
  documentType: string;
  summary: string;
  confidence: number;
}

interface ImageRecognitionCaptureProps {
  onDataExtracted?: (data: Record<string, string>) => void;
  context?: "form" | "standalone";
}

const ImageRecognitionCapture = ({ onDataExtracted, context = "standalone" }: ImageRecognitionCaptureProps) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [results, setResults] = useState<RecognitionResult[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const processImage = useCallback(async () => {
    if (!selectedFile) return;
    setIsProcessing(true);

    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(selectedFile);
      });
      const base64Data = await base64Promise;

      const { data, error } = await supabase.functions.invoke("analyze-media", {
        body: {
          mediaData: base64Data,
          mediaType: "image",
          fileName: selectedFile.name,
          mimeType: selectedFile.type,
        },
      });

      if (error || data?.fallback) {
        // Local fallback
        const result = generateLocalResult(selectedFile);
        setResults(prev => [result, ...prev]);
        toast({ title: "Local Analysis", description: "AI unavailable — basic metadata extracted." });
      } else {
        const extractedFields: ExtractedField[] = [];
        if (data.extractedData) {
          Object.entries(data.extractedData).forEach(([key, value]) => {
            if (typeof value === "string" || typeof value === "number") {
              extractedFields.push({ key, value: String(value), confidence: data.confidence || 0.8 });
            }
          });
        }

        const result: RecognitionResult = {
          id: crypto.randomUUID(),
          fileName: selectedFile.name,
          timestamp: new Date().toISOString(),
          previewUrl: previewUrl || "",
          extractedFields,
          rawText: data.extractedData?.raw_text || data.extractedData?.visible_text || "",
          documentType: data.extractedData?.document_type || "Unknown",
          summary: data.summary || "Analysis complete.",
          confidence: data.confidence || 0.85,
        };
        setResults(prev => [result, ...prev]);

        if (onDataExtracted && extractedFields.length > 0) {
          const extracted: Record<string, string> = {};
          extractedFields.forEach(f => { extracted[f.key] = f.value; });
          onDataExtracted(extracted);
        }

        toast({ title: "✨ Image Recognized", description: `Extracted ${extractedFields.length} data fields.` });
      }
    } catch {
      const result = generateLocalResult(selectedFile);
      setResults(prev => [result, ...prev]);
      toast({ title: "Offline Mode", description: "Used local analysis." });
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile, previewUrl, onDataExtracted]);

  const generateLocalResult = (file: File): RecognitionResult => ({
    id: crypto.randomUUID(),
    fileName: file.name,
    timestamp: new Date().toISOString(),
    previewUrl: previewUrl || "",
    extractedFields: [
      { key: "file_size", value: `${(file.size / 1024).toFixed(1)} KB`, confidence: 1 },
      { key: "format", value: file.type.split("/")[1]?.toUpperCase() || "Unknown", confidence: 1 },
    ],
    rawText: "",
    documentType: "Unknown (offline)",
    summary: "Basic metadata extracted. AI analysis requires connectivity.",
    confidence: 0.3,
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Text copied to clipboard." });
  };

  return (
    <div className={context === "form" ? "space-y-3" : "space-y-6 p-4 lg:p-6 max-w-[1200px] mx-auto"}>
      {context === "standalone" && (
        <div>
          <h1 className="font-display text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <ScanLine className="h-7 w-7 text-primary" />
            </div>
            Image Recognition
          </h1>
          <p className="text-muted-foreground mt-1">
            Capture or upload images to automatically identify and extract data
          </p>
        </div>
      )}

      <div className={context === "standalone" ? "grid grid-cols-1 lg:grid-cols-2 gap-6" : ""}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" />
              Capture & Extract
            </CardTitle>
            <CardDescription>Take a photo or upload an image to extract data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelect} className="hidden" />

            {previewUrl ? (
              <div className="relative rounded-xl overflow-hidden border border-border">
                <img src={previewUrl} alt="Preview" className="w-full max-h-48 object-contain bg-muted/20" />
                <Badge className="absolute top-2 right-2 text-[10px]" variant="secondary">
                  {selectedFile?.name}
                </Badge>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:bg-muted/30 transition-colors"
              >
                <ImageIcon className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm font-medium text-foreground">Click to upload image</p>
                <p className="text-xs text-muted-foreground mt-1">or use camera below</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-2" onClick={() => cameraInputRef.current?.click()}>
                <Camera className="h-4 w-4" /> Camera
              </Button>
              <Button variant="outline" className="flex-1 gap-2" onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" /> Upload
              </Button>
            </div>

            <Button
              onClick={processImage}
              disabled={!selectedFile || isProcessing}
              className="w-full gap-2"
              variant="acg"
            >
              {isProcessing ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Recognizing...</>
              ) : (
                <><ScanLine className="h-4 w-4" /> Extract Data from Image</>
              )}
            </Button>
          </CardContent>
        </Card>

        {context === "standalone" && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Extraction Results
                {results.length > 0 && <Badge variant="secondary" className="ml-1">{results.length}</Badge>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {results.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Eye className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-medium">No extractions yet</p>
                  <p className="text-xs mt-1">Upload or capture an image to begin</p>
                </div>
              ) : (
                <ScrollArea className="max-h-[500px]">
                  <div className="space-y-4">
                    {results.map(result => (
                      <Card key={result.id} className="border border-border/50">
                        <CardContent className="p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-sm truncate max-w-[180px]">{result.fileName}</span>
                            <Badge variant="secondary" className={`text-[10px] ${
                              result.confidence >= 0.8 ? "bg-green-500/10 text-green-700 dark:text-green-400"
                              : result.confidence >= 0.5 ? "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                              : "bg-red-500/10 text-red-700 dark:text-red-400"
                            }`}>
                              {Math.round(result.confidence * 100)}%
                            </Badge>
                          </div>

                          <p className="text-xs text-muted-foreground">{result.summary}</p>

                          {result.extractedFields.length > 0 && (
                            <div className="bg-muted/30 rounded-lg p-3 space-y-1.5">
                              <p className="text-xs font-semibold flex items-center gap-1.5">
                                <Sparkles className="h-3 w-3" /> Extracted Fields
                              </p>
                              {result.extractedFields.map((f, i) => (
                                <div key={i} className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground capitalize">{f.key.replace(/_/g, " ")}</span>
                                  <div className="flex items-center gap-1">
                                    <span className="font-medium">{f.value}</span>
                                    <button onClick={() => copyToClipboard(f.value)} className="opacity-50 hover:opacity-100">
                                      <Copy className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {result.rawText && (
                            <div className="bg-muted/20 rounded-lg p-2">
                              <p className="text-[10px] font-semibold mb-1">Raw Text</p>
                              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{result.rawText.slice(0, 300)}</p>
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
        )}
      </div>
    </div>
  );
};

export default ImageRecognitionCapture;
