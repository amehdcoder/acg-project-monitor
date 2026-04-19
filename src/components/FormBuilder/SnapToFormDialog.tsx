import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Camera,
  Upload,
  FileImage,
  Loader2,
  Sparkles,
  Trash2,
  Plus,
  Wand2,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
  Lightbulb,
  Edit3,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Question, QuestionType, FormGroup, QUESTION_TYPES } from "./types";
import { cn } from "@/lib/utils";
import { preprocess } from "@/lib/snapToForm/imagePreprocess";
import { recognizePage, prewarmOcr, terminateOcr } from "@/lib/snapToForm/ocrEngine";
import { parseOcrPages, reextractQuestion } from "@/lib/snapToForm/formParser";
import { enhanceWithAI, AIEnhanceError } from "@/lib/snapToForm/aiEnhancer";
import FormDoctorPanel from "./FormDoctorPanel";


interface SnapToFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (
    questions: Question[],
    groups: FormGroup[],
    formName?: string,
    formDescription?: string,
  ) => void;
}

interface CapturedPage {
  id: string;
  dataUrl: string;
  source: "camera" | "upload" | "pdf";
  label: string;
}

interface ExtractedQuestion {
  name: string;
  label: string;
  hint?: string;
  type: QuestionType;
  required: boolean;
  options?: { value: string; label: string }[];
  validation?: { min?: number; max?: number; regex?: string; message?: string };
  relevant?: string;
  aiUpgrade?: string;
  confidence: number;
  sourcePage?: number;
}

interface ExtractedGroup {
  name: string;
  label: string;
  repeat?: boolean;
  relevant?: string;
  questions: ExtractedQuestion[];
}

interface ExtractionResult {
  formName: string;
  formDescription?: string;
  detectedLanguage?: string;
  overallConfidence: number;
  groups: ExtractedGroup[];
  suggestedUpgrades?: { title: string; rationale: string; appliedAsQuestionName?: string }[];
  warnings?: string[];
}

type Step = "capture" | "extracting" | "review";

const MAX_PAGES = 20;
const MAX_DIMENSION = 2000; // downscale large captures

const downscaleImage = (dataUrl: string): Promise<string> =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        const scale = MAX_DIMENSION / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const pdfToImages = async (file: File): Promise<string[]> => {
  // Dynamic import to keep initial bundle small
  const pdfjs: any = await import("pdfjs-dist");
  // Use a CDN worker to avoid bundler config friction
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];
  const pageCount = Math.min(pdf.numPages, MAX_PAGES);
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    pages.push(await downscaleImage(dataUrl));
  }
  return pages;
};

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || `field_${Math.random().toString(36).slice(2, 7)}`;

const SnapToFormDialog = ({ open, onOpenChange, onImport }: SnapToFormDialogProps) => {
  const [step, setStep] = useState<Step>("capture");
  const [pages, setPages] = useState<CapturedPage[]>([]);
  const [extraInstructions, setExtraInstructions] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [activePageIdx, setActivePageIdx] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [pageProgress, setPageProgress] = useState<{ current: number; total: number; phase: string }>({
    current: 0,
    total: 0,
    phase: "",
  });
  const [questionSourceMap, setQuestionSourceMap] = useState<Record<string, string>>({});
  const [aiEnhance, setAiEnhance] = useState(true);
  const [aiModel, setAiModel] = useState<"google/gemini-2.5-flash" | "google/gemini-2.5-pro" | "google/gemini-3-flash-preview">("google/gemini-2.5-flash");
  const [aiEnhanced, setAiEnhanced] = useState(false);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [liveCamera, setLiveCamera] = useState(false);

  useEffect(() => {
    if (!open) {
      // Reset on close
      setStep("capture");
      setPages([]);
      setResult(null);
      setExtraInstructions("");
      setActivePageIdx(0);
      setExpandedGroups({});
      setPageProgress({ current: 0, total: 0, phase: "" });
      setQuestionSourceMap({});
      setAiEnhanced(false);
      stopCamera();
      // Free OCR worker memory
      void terminateOcr();
    } else {
      // Pre-warm Tesseract worker so the first extraction is faster
      prewarmOcr();
    }
  }, [open]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setLiveCamera(false);
  };

  const startLiveCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false,
      });
      streamRef.current = stream;
      setLiveCamera(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch {
      toast({
        title: "Camera unavailable",
        description: "Could not open the camera. Try the Upload option instead.",
        variant: "destructive",
      });
    }
  };

  const captureFromVideo = async () => {
    if (!videoRef.current) return;
    const v = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    const raw = canvas.toDataURL("image/jpeg", 0.92);
    const dataUrl = await downscaleImage(raw);
    addPages([{ dataUrl, source: "camera" }]);
  };

  const addPages = (incoming: { dataUrl: string; source: CapturedPage["source"] }[]) => {
    setPages((prev) => {
      const next = [...prev];
      for (const item of incoming) {
        if (next.length >= MAX_PAGES) break;
        next.push({
          id: crypto.randomUUID(),
          dataUrl: item.dataUrl,
          source: item.source,
          label: `Page ${next.length + 1}`,
        });
      }
      if (incoming.length + prev.length > MAX_PAGES) {
        toast({
          title: "Page limit reached",
          description: `Only the first ${MAX_PAGES} pages were added.`,
        });
      }
      return next;
    });
  };

  const handleCameraInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const items = await Promise.all(
      files.map(async (f) => ({
        dataUrl: await downscaleImage(await fileToDataUrl(f)),
        source: "camera" as const,
      })),
    );
    addPages(items);
  };

  const handleUploadInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const items = await Promise.all(
      files.map(async (f) => ({
        dataUrl: await downscaleImage(await fileToDataUrl(f)),
        source: "upload" as const,
      })),
    );
    addPages(items);
  };

  const handlePdfInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    for (const f of files) {
      try {
        toast({ title: "Reading PDF…", description: f.name });
        const imgs = await pdfToImages(f);
        addPages(imgs.map((dataUrl) => ({ dataUrl, source: "pdf" as const })));
      } catch (err) {
        console.error("PDF parse error:", err);
        toast({
          title: "Couldn't read PDF",
          description: "Try uploading the pages as images instead.",
          variant: "destructive",
        });
      }
    }
  };

  const removePage = (id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id).map((p, i) => ({ ...p, label: `Page ${i + 1}` })));
  };

  const movePage = (id: string, dir: -1 | 1) => {
    setPages((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next.map((p, i) => ({ ...p, label: `Page ${i + 1}` }));
    });
  };

  const runExtraction = async () => {
    if (pages.length === 0) return;
    stopCamera();
    setStep("extracting");
    setExtracting(true);
    setProgress("Preparing pages…");
    setPageProgress({ current: 0, total: pages.length, phase: "preprocess" });

    try {
      // 1) Preprocess all pages (downscale + adaptive threshold for OCR clarity)
      const enhanced: string[] = [];
      for (let i = 0; i < pages.length; i++) {
        setPageProgress({ current: i, total: pages.length, phase: "preprocess" });
        setProgress(`Enhancing page ${i + 1} of ${pages.length}…`);
        try {
          enhanced.push(await preprocess(pages[i].dataUrl));
        } catch {
          enhanced.push(pages[i].dataUrl);
        }
      }

      // 2) OCR each page with Tesseract.js (in-browser, no AI credits)
      const ocrPages = [];
      for (let i = 0; i < enhanced.length; i++) {
        setPageProgress({ current: i, total: pages.length, phase: "ocr" });
        setProgress(`Reading page ${i + 1} of ${pages.length} with on-device OCR…`);
        const page = await recognizePage(enhanced[i]);
        ocrPages.push(page);
      }

      setProgress("Building structured form…");
      setPageProgress({ current: pages.length, total: pages.length, phase: "parse" });

      // 3) Heuristic parser → structured form (always runs — local baseline)
      let parsed = parseOcrPages(ocrPages);

      // Inject extraInstructions hint into form description if provided
      if (extraInstructions.trim()) {
        parsed.formDescription = extraInstructions.trim();
      }

      // 4) Optional AI Enhance pass — Gemini Vision via Lovable AI Gateway
      let usedAi = false;
      if (aiEnhance) {
        try {
          setPageProgress({ current: pages.length, total: pages.length, phase: "ai" });
          setProgress("AI is reading the layout, fixing typos & inferring logic…");
          const { form: aiForm } = await enhanceWithAI({
            draft: parsed,
            ocrPages,
            pageDataUrls: pages.map((p) => p.dataUrl),
            extraInstructions,
            model: aiModel,
            onProgress: (msg) => setProgress(msg),
          });
          // Merge: prefer AI structure, but keep sourceText from local for per-field re-extract
          const localByLabel = new Map<string, string>();
          parsed.groups.forEach((g) =>
            g.questions.forEach((q) => {
              if (q.sourceText) localByLabel.set(q.label.toLowerCase().trim(), q.sourceText);
            }),
          );
          aiForm.groups.forEach((g) =>
            g.questions.forEach((q: any) => {
              if (!q.sourceText) {
                const src = localByLabel.get((q.label || "").toLowerCase().trim());
                if (src) q.sourceText = src;
              }
            }),
          );
          parsed = aiForm;
          usedAi = true;
          setAiEnhanced(true);
        } catch (aiErr) {
          console.warn("AI enhance failed, using local draft:", aiErr);
          const code = aiErr instanceof AIEnhanceError ? aiErr.code : "unknown";
          if (code === "no_credits") {
            toast({
              title: "AI credits exhausted",
              description: "Used the local on-device parser instead. Add credits in Settings → Workspace → Usage.",
              variant: "destructive",
            });
          } else if (code === "rate_limited") {
            toast({
              title: "AI is busy",
              description: "Used the local on-device parser instead. Try AI Enhance again in a moment.",
            });
          } else {
            toast({
              title: "AI enhance unavailable",
              description: "Used the local on-device parser as a fallback.",
            });
          }
        }
      }

      // Build source-text map for per-field re-extract
      const srcMap: Record<string, string> = {};
      parsed.groups.forEach((g) =>
        g.questions.forEach((q: any) => {
          if (q.sourceText) srcMap[q.name] = q.sourceText;
        }),
      );
      setQuestionSourceMap(srcMap);

      const extracted: ExtractionResult = parsed as unknown as ExtractionResult;
      setResult(extracted);

      const initExpanded: Record<string, boolean> = {};
      extracted.groups.forEach((g) => (initExpanded[g.name] = true));
      setExpandedGroups(initExpanded);
      setStep("review");

      const totalFields = extracted.groups.reduce((a, g) => a + g.questions.length, 0);
      toast({
        title: usedAi ? "Form extracted with AI ✨" : "Form extracted on-device ✨",
        description: `Found ${totalFields} field${totalFields !== 1 ? "s" : ""} across ${extracted.groups.length} section${extracted.groups.length !== 1 ? "s" : ""}${usedAi ? " — Gemini Vision refined the structure." : " — no AI credits used."}`,
      });
    } catch (e) {
      console.error("In-app extraction error:", e);
      toast({
        title: "Extraction failed",
        description:
          e instanceof Error
            ? e.message
            : "Could not read the pages. Try better lighting or higher-resolution photos.",
        variant: "destructive",
      });
      setStep("capture");
    } finally {
      setExtracting(false);
    }
  };

  const reextractField = (gIdx: number, qIdx: number) => {
    setResult((prev) => {
      if (!prev) return prev;
      const next = { ...prev, groups: prev.groups.map((g) => ({ ...g, questions: [...g.questions] })) };
      const q = next.groups[gIdx].questions[qIdx];
      const src = questionSourceMap[q.name] || q.label;
      const patch = reextractQuestion(src, q.label);
      next.groups[gIdx].questions[qIdx] = { ...q, ...patch } as ExtractedQuestion;
      return next;
    });
    toast({
      title: "Field re-analyzed",
      description: "Type and options re-evaluated from the original text.",
    });
  };

  const updateQuestion = (
    groupIdx: number,
    qIdx: number,
    patch: Partial<ExtractedQuestion>,
  ) => {
    setResult((prev) => {
      if (!prev) return prev;
      const next = { ...prev, groups: prev.groups.map((g) => ({ ...g, questions: [...g.questions] })) };
      next.groups[groupIdx].questions[qIdx] = { ...next.groups[groupIdx].questions[qIdx], ...patch };
      return next;
    });
  };

  const removeQuestion = (groupIdx: number, qIdx: number) => {
    setResult((prev) => {
      if (!prev) return prev;
      const next = { ...prev, groups: prev.groups.map((g) => ({ ...g, questions: [...g.questions] })) };
      next.groups[groupIdx].questions.splice(qIdx, 1);
      return next;
    });
  };

  const addQuestion = (groupIdx: number) => {
    const q: ExtractedQuestion = {
      name: `new_field_${Date.now().toString(36)}`,
      label: "New question",
      type: "text",
      required: false,
      confidence: 1,
    };
    setResult((prev) => {
      if (!prev) return prev;
      const next = { ...prev, groups: prev.groups.map((g) => ({ ...g, questions: [...g.questions] })) };
      next.groups[groupIdx].questions.push(q);
      return next;
    });
  };

  const removeGroup = (groupIdx: number) => {
    setResult((prev) => {
      if (!prev) return prev;
      const next = { ...prev, groups: [...prev.groups] };
      next.groups.splice(groupIdx, 1);
      return next;
    });
  };

  const handleImport = () => {
    if (!result) return;
    const groups: FormGroup[] = [];
    const looseQuestions: Question[] = [];

    // Normalize a single extracted question to the canonical FormBuilder Question shape
    // so it round-trips identically to a hand-built form when reopened via Edit Form.
    const normalizeQuestion = (q: ExtractedQuestion): Question => {
      const needsOptions =
        q.type === "select_one" || q.type === "select_multiple" || q.type === "rank";
      const normalizedOptions = q.options?.length
        ? q.options.map((o) => ({
            id: crypto.randomUUID(),
            value: o.value || slugify(o.label),
            label: o.label,
          }))
        : needsOptions
        ? [
            { id: crypto.randomUUID(), label: "Option 1", value: "option_1" },
            { id: crypto.randomUUID(), label: "Option 2", value: "option_2" },
          ]
        : undefined;

      const hasValidation =
        q.validation &&
        (q.validation.min != null || q.validation.max != null || !!q.validation.regex);

      return {
        id: crypto.randomUUID(),
        type: q.type,
        label: (q.label || "Untitled question").trim(),
        name: q.name ? q.name.replace(/\s+/g, "_") : slugify(q.label || "field"),
        hint: q.hint?.trim() || undefined,
        required: !!q.required,
        options: normalizedOptions,
        validation: hasValidation
          ? {
              min: q.validation?.min,
              max: q.validation?.max,
              regex: q.validation?.regex,
            }
          : undefined,
        constraintMessage: q.validation?.message || undefined,
        relevant: q.relevant?.trim() || undefined,
      };
    };

    result.groups.forEach((g) => {
      const questions: Question[] = g.questions.map(normalizeQuestion);

      if (result.groups.length === 1 && g.name === "main" && !g.repeat) {
        looseQuestions.push(...questions);
      } else {
        const groupName = (g.name || "group").replace(/\s+/g, "_");
        groups.push({
          id: crypto.randomUUID(),
          name: groupName,
          label: (g.label || g.name || "Group").trim(),
          questions,
          repeat: !!g.repeat,
          repeatCount: g.repeat ? 1 : undefined,
          allowDynamicRepeat: !!g.repeat,
          relevant: g.relevant?.trim() || undefined,
        });
      }
    });

    onImport(looseQuestions, groups, result.formName, result.formDescription);
    onOpenChange(false);
    toast({
      title: "Form imported ✨",
      description: `${result.groups.reduce((a, g) => a + g.questions.length, 0)} fields added to your form builder.`,
    });
  };

  const totalFields = result?.groups.reduce((a, g) => a + g.questions.length, 0) || 0;
  const lowConfidenceCount =
    result?.groups.reduce(
      (a, g) => a + g.questions.filter((q) => q.confidence < 0.7).length,
      0,
    ) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl h-[92vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border bg-gradient-to-r from-primary/5 via-primary/10 to-transparent">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            Snap to Form
            <Badge variant="secondary" className="ml-2 font-normal">
              AI Vision
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Photograph or upload paper forms — AI converts them into a beautifully structured digital form
            with smart field types, skip logic, validation, and intuitive upgrades.
          </DialogDescription>
        </DialogHeader>

        {step === "capture" && (
          <div className="flex-1 overflow-hidden flex flex-col">
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6">
                {/* Capture actions */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button
                    onClick={() => (liveCamera ? captureFromVideo() : startLiveCamera())}
                    className="group flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card p-6 hover:border-primary hover:bg-primary/5 transition-all min-h-[140px]"
                  >
                    <Camera className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
                    <div className="text-center">
                      <div className="font-semibold text-foreground">
                        {liveCamera ? "Capture Page" : "Open Camera"}
                      </div>
                      <div className="text-xs text-muted-foreground">Live preview, snap each page</div>
                    </div>
                  </button>

                  <button
                    onClick={() => uploadInputRef.current?.click()}
                    className="group flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card p-6 hover:border-primary hover:bg-primary/5 transition-all min-h-[140px]"
                  >
                    <FileImage className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
                    <div className="text-center">
                      <div className="font-semibold text-foreground">Upload Images</div>
                      <div className="text-xs text-muted-foreground">JPG, PNG, HEIC — multiple pages</div>
                    </div>
                  </button>

                  <button
                    onClick={() => pdfInputRef.current?.click()}
                    className="group flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card p-6 hover:border-primary hover:bg-primary/5 transition-all min-h-[140px]"
                  >
                    <Upload className="h-8 w-8 text-primary group-hover:scale-110 transition-transform" />
                    <div className="text-center">
                      <div className="font-semibold text-foreground">Upload PDF</div>
                      <div className="text-xs text-muted-foreground">Auto-splits into pages</div>
                    </div>
                  </button>
                </div>

                {/* Camera-only fallback (mobile native picker) */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  onChange={handleCameraInput}
                  className="hidden"
                />
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleUploadInput}
                  className="hidden"
                />
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf"
                  multiple
                  onChange={handlePdfInput}
                  className="hidden"
                />

                {/* Live camera preview */}
                {liveCamera && (
                  <div className="rounded-xl overflow-hidden border border-border bg-black relative">
                    <video
                      ref={videoRef}
                      className="w-full max-h-[420px] object-contain bg-black"
                      playsInline
                      muted
                    />
                    <div className="absolute top-3 right-3 flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => cameraInputRef.current?.click()}>
                        <Camera className="h-4 w-4 mr-1" /> Native picker
                      </Button>
                      <Button size="sm" variant="destructive" onClick={stopCamera}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                      <Button size="lg" onClick={captureFromVideo} className="rounded-full h-14 w-14 p-0">
                        <Camera className="h-6 w-6" />
                      </Button>
                    </div>
                  </div>
                )}

                {/* Captured pages strip */}
                {pages.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-sm font-semibold">
                        Captured pages ({pages.length}/{MAX_PAGES})
                      </Label>
                      <Button variant="ghost" size="sm" onClick={() => setPages([])}>
                        <Trash2 className="h-4 w-4 mr-1" /> Clear all
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {pages.map((p, idx) => (
                        <div
                          key={p.id}
                          className="group relative rounded-lg overflow-hidden border border-border bg-card aspect-[3/4]"
                        >
                          <img src={p.dataUrl} alt={p.label} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                            <div className="flex justify-between">
                              <Badge variant="secondary" className="text-xs">
                                {p.label}
                              </Badge>
                              <button
                                onClick={() => removePage(p.id)}
                                className="h-7 w-7 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:scale-110 transition-transform"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="flex gap-1 justify-center">
                              <Button
                                size="icon"
                                variant="secondary"
                                className="h-7 w-7"
                                onClick={() => movePage(p.id, -1)}
                                disabled={idx === 0}
                              >
                                <ChevronLeft className="h-3 w-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="secondary"
                                className="h-7 w-7"
                                onClick={() => movePage(p.id, 1)}
                                disabled={idx === pages.length - 1}
                              >
                                <ChevronRight className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-background/90 backdrop-blur text-xs text-center font-medium">
                            {p.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Optional context */}
                <div>
                  <Label htmlFor="extra" className="text-sm font-semibold">
                    Extra context (optional)
                  </Label>
                  <Textarea
                    id="extra"
                    placeholder="e.g. This is a child immunization checklist used in rural Nigeria. Treat 'GUARDIAN SIGN' as required."
                    value={extraInstructions}
                    onChange={(e) => setExtraInstructions(e.target.value)}
                    className="mt-1.5 min-h-[80px]"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Tell the AI anything special about this form — language, audience, or fields to emphasize.
                  </p>
                </div>

                {/* AI Enhance card */}
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
                        <Sparkles className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground flex items-center gap-2 flex-wrap">
                          AI Enhance
                          <Badge variant="secondary" className="font-normal text-[10px]">
                            Gemini Vision
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Fixes OCR typos, infers types & options, detects skip logic, repeats and tables, and reads handwriting & multilingual headings (Hausa, Yoruba, Igbo, Arabic, French). Local OCR is the safety net.
                        </p>
                      </div>
                    </div>
                    <Switch checked={aiEnhance} onCheckedChange={setAiEnhance} />
                  </div>
                  {aiEnhance && (
                    <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-2 sm:items-center pt-2 border-t border-border">
                      <Label className="text-xs font-medium text-muted-foreground">AI model</Label>
                      <Select value={aiModel} onValueChange={(v) => setAiModel(v as typeof aiModel)}>
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="google/gemini-2.5-flash">
                            Gemini 2.5 Flash — fast & balanced (recommended)
                          </SelectItem>
                          <SelectItem value="google/gemini-3-flash-preview">
                            Gemini 3 Flash (preview) — newest, fastest
                          </SelectItem>
                          <SelectItem value="google/gemini-2.5-pro">
                            Gemini 2.5 Pro — highest accuracy, slower
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <Alert>
                  <Lightbulb className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    <strong>Pro tips:</strong> Lay forms flat, use bright even lighting, fill the frame, and
                    include all pages. {aiEnhance ? "AI" : "The on-device parser"} auto-detects field types, skip logic, validation rules, and adds GPS / photo / signature where relevant.
                  </AlertDescription>
                </Alert>
              </div>
            </ScrollArea>

            <div className="border-t border-border bg-card px-6 py-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {pages.length === 0
                  ? "Add at least one page to continue"
                  : `${pages.length} page${pages.length > 1 ? "s" : ""} ready`}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button
                  variant="acg"
                  onClick={runExtraction}
                  disabled={pages.length === 0 || extracting}
                  className="min-w-[220px]"
                >
                  <Wand2 className="h-4 w-4 mr-2" />
                  {aiEnhance ? "Extract with AI" : "Extract on-device"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "extracting" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
            <div className="relative">
              <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-10 w-10 text-primary animate-pulse" />
              </div>
              <Loader2 className="absolute inset-0 h-20 w-20 animate-spin text-primary/30" />
            </div>
            <div className="text-center max-w-md w-full">
              <h3 className="font-display text-xl font-bold text-foreground">Reading your paper form</h3>
              <p className="text-sm text-muted-foreground mt-2">{progress}</p>

              {pageProgress.total > 0 && (
                <div className="mt-4 space-y-2">
                  <Progress
                    value={
                      pageProgress.phase === "ai"
                        ? 95
                        : pageProgress.phase === "parse"
                        ? 75
                        : ((pageProgress.current + (pageProgress.phase === "ocr" ? 0.5 : 0)) /
                            Math.max(1, pageProgress.total)) *
                          70
                    }
                    className="h-2"
                  />
                  <div className="flex justify-between text-[11px] text-muted-foreground font-mono">
                    <span>
                      {pageProgress.phase === "preprocess" && "1/4 Enhancing"}
                      {pageProgress.phase === "ocr" && "2/4 OCR"}
                      {pageProgress.phase === "parse" && "3/4 Building draft"}
                      {pageProgress.phase === "ai" && "4/4 AI Enhancing"}
                    </span>
                    <span>
                      {pageProgress.phase === "parse" || pageProgress.phase === "ai"
                        ? `${pageProgress.total}/${pageProgress.total}`
                        : `${pageProgress.current + 1}/${pageProgress.total}`}
                    </span>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground mt-4">
                {aiEnhance
                  ? "On-device OCR + Gemini Vision. If AI is unavailable, the local parser kicks in automatically — you'll never get stuck."
                  : "Running fully on-device with Tesseract OCR + heuristic parser. No AI credits used. First page is slower while the OCR engine warms up; subsequent pages are fast."}
              </p>
            </div>
          </div>
        )}

        {step === "review" && result && (
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Confidence summary banner */}
            <div className="px-6 py-3 border-b border-border bg-muted/30 flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  {totalFields} fields • {result.groups.length} section
                  {result.groups.length !== 1 ? "s" : ""}
                </span>
              </div>
              <Badge
                variant={result.overallConfidence > 0.8 ? "default" : "secondary"}
                className="font-normal"
              >
                {Math.round(result.overallConfidence * 100)}% confidence
              </Badge>
              {lowConfidenceCount > 0 && (
                <Badge variant="outline" className="font-normal text-amber-600 border-amber-300">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {lowConfidenceCount} need review
                </Badge>
              )}
              {result.detectedLanguage && (
                <Badge variant="outline" className="font-normal">
                  Language: {result.detectedLanguage}
                </Badge>
              )}
              {aiEnhanced && (
                <Badge className="font-normal bg-primary/15 text-primary hover:bg-primary/20 border-0">
                  <Sparkles className="h-3 w-3 mr-1" />
                  AI Enhanced
                </Badge>
              )}
            </div>

            {/* Side-by-side layout */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-[40%_60%] overflow-hidden">
              {/* LEFT: Original pages */}
              <div className="border-r border-border bg-muted/20 flex flex-col overflow-hidden">
                <div className="px-4 py-2 border-b border-border bg-card flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Original ({activePageIdx + 1}/{pages.length})
                  </span>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setActivePageIdx((i) => Math.max(0, i - 1))}
                      disabled={activePageIdx === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setActivePageIdx((i) => Math.min(pages.length - 1, i + 1))}
                      disabled={activePageIdx === pages.length - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-4">
                    {pages[activePageIdx] && (
                      <img
                        src={pages[activePageIdx].dataUrl}
                        alt={pages[activePageIdx].label}
                        className="w-full rounded-lg border border-border shadow-sm"
                      />
                    )}
                  </div>
                  {pages.length > 1 && (
                    <div className="px-4 pb-4 flex gap-2 flex-wrap">
                      {pages.map((p, idx) => (
                        <button
                          key={p.id}
                          onClick={() => setActivePageIdx(idx)}
                          className={cn(
                            "h-16 w-12 rounded border-2 overflow-hidden transition-all",
                            idx === activePageIdx
                              ? "border-primary scale-105"
                              : "border-border opacity-60 hover:opacity-100",
                          )}
                        >
                          <img src={p.dataUrl} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* RIGHT: Editable extracted form */}
              <ScrollArea className="overflow-y-auto">
                <div className="p-5 space-y-4">
                  {/* Form name + description */}
                  <div className="space-y-3 rounded-lg border border-border bg-card p-4">
                    <div>
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        Form name
                      </Label>
                      <Input
                        value={result.formName}
                        onChange={(e) => setResult({ ...result, formName: e.target.value })}
                        className="mt-1 text-base font-semibold"
                      />
                    </div>
                    <div>
                      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                        Description
                      </Label>
                      <Textarea
                        value={result.formDescription || ""}
                        onChange={(e) => setResult({ ...result, formDescription: e.target.value })}
                        className="mt-1 text-sm"
                        rows={2}
                      />
                    </div>
                  </div>

                  {/* In-app Form Doctor */}
                  <FormDoctorPanel
                    form={result as any}
                    onApplyAll={(next) => setResult(next as unknown as ExtractionResult)}
                    onApplyOne={(next) => setResult(next as unknown as ExtractionResult)}
                  />
                  {result.suggestedUpgrades && result.suggestedUpgrades.length > 0 && (
                    <Alert className="bg-primary/5 border-primary/20">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <AlertDescription>
                        <div className="font-semibold mb-1.5 text-foreground">AI-suggested upgrades</div>
                        <ul className="space-y-1 text-xs">
                          {result.suggestedUpgrades.map((u, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="text-primary">•</span>
                              <span>
                                <strong>{u.title}</strong> — {u.rationale}
                                {u.appliedAsQuestionName && (
                                  <Badge variant="secondary" className="ml-2 text-[10px]">
                                    added
                                  </Badge>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Warnings */}
                  {result.warnings && result.warnings.length > 0 && (
                    <Alert variant="default" className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
                      <AlertTriangle className="h-4 w-4 text-amber-600" />
                      <AlertDescription>
                        <div className="font-semibold mb-1 text-foreground">Please double-check</div>
                        <ul className="space-y-0.5 text-xs">
                          {result.warnings.map((w, i) => (
                            <li key={i}>• {w}</li>
                          ))}
                        </ul>
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Groups & questions */}
                  {result.groups.map((group, gIdx) => {
                    const isOpen = expandedGroups[group.name] !== false;
                    return (
                      <div
                        key={group.name + gIdx}
                        className="rounded-lg border border-border bg-card overflow-hidden"
                      >
                        <div className="flex items-center gap-2 p-3 bg-muted/40">
                          <button
                            onClick={() =>
                              setExpandedGroups((prev) => ({ ...prev, [group.name]: !isOpen }))
                            }
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {isOpen ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </button>
                          <Input
                            value={group.label}
                            onChange={(e) => {
                              setResult((prev) => {
                                if (!prev) return prev;
                                const next = { ...prev, groups: [...prev.groups] };
                                next.groups[gIdx] = { ...next.groups[gIdx], label: e.target.value };
                                return next;
                              });
                            }}
                            className="flex-1 font-semibold border-0 bg-transparent focus-visible:ring-1 px-2"
                          />
                          {group.repeat && (
                            <Badge variant="default" className="text-[10px]">
                              REPEAT
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px]">
                            {group.questions.length} fields
                          </Badge>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => removeGroup(gIdx)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>

                        {isOpen && (
                          <div className="p-3 space-y-2">
                            <div className="flex items-center gap-3 text-xs text-muted-foreground pb-2">
                              <label className="flex items-center gap-1.5 cursor-pointer">
                                <Switch
                                  checked={group.repeat || false}
                                  onCheckedChange={(v) => {
                                    setResult((prev) => {
                                      if (!prev) return prev;
                                      const next = { ...prev, groups: [...prev.groups] };
                                      next.groups[gIdx] = { ...next.groups[gIdx], repeat: v };
                                      return next;
                                    });
                                  }}
                                />
                                Repeat group
                              </label>
                            </div>

                            {group.questions.map((q, qIdx) => (
                              <QuestionRow
                                key={q.name + qIdx}
                                q={q}
                                onChange={(patch) => updateQuestion(gIdx, qIdx, patch)}
                                onRemove={() => removeQuestion(gIdx, qIdx)}
                                onReextract={() => reextractField(gIdx, qIdx)}
                                onJumpToPage={
                                  q.sourcePage
                                    ? () => setActivePageIdx(Math.max(0, q.sourcePage! - 1))
                                    : undefined
                                }
                              />
                            ))}

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => addQuestion(gIdx)}
                              className="w-full mt-2"
                            >
                              <Plus className="h-3.5 w-3.5 mr-1" /> Add question
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Footer */}
            <div className="border-t border-border bg-card px-6 py-4 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep("capture")}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Back to pages
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button variant="acg" onClick={handleImport} className="min-w-[180px]">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Add to Form Builder
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

interface QuestionRowProps {
  q: ExtractedQuestion;
  onChange: (patch: Partial<ExtractedQuestion>) => void;
  onRemove: () => void;
  onJumpToPage?: () => void;
  onReextract?: () => void;
}

const QuestionRow = ({ q, onChange, onRemove, onJumpToPage, onReextract }: QuestionRowProps) => {
  const [editing, setEditing] = useState(false);
  const lowConf = q.confidence < 0.7;
  const isChoice = q.type === "select_one" || q.type === "select_multiple";

  return (
    <div
      className={cn(
        "rounded-md border bg-background p-3 space-y-2 transition-colors",
        lowConf ? "border-amber-300 bg-amber-50/40 dark:bg-amber-950/10" : "border-border",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <Input
            value={q.label}
            onChange={(e) => onChange({ label: e.target.value })}
            className="font-medium border-0 bg-transparent focus-visible:ring-1 px-2 h-8"
          />
          <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[10px]">
            <Badge variant="outline" className="text-[10px] font-mono">
              {q.name}
            </Badge>
            <Badge
              variant={q.required ? "default" : "secondary"}
              className="text-[10px] cursor-pointer"
              onClick={() => onChange({ required: !q.required })}
            >
              {q.required ? "REQUIRED" : "optional"}
            </Badge>
            {lowConf && (
              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                {Math.round(q.confidence * 100)}%
              </Badge>
            )}
            {q.aiUpgrade && (
              <Badge variant="outline" className="text-[10px] text-primary border-primary/40">
                <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                upgraded
              </Badge>
            )}
            {q.sourcePage && onJumpToPage && (
              <button
                onClick={onJumpToPage}
                className="text-[10px] text-muted-foreground hover:text-primary underline"
              >
                p.{q.sourcePage}
              </button>
            )}
          </div>
        </div>
        <Select value={q.type} onValueChange={(v) => onChange({ type: v as QuestionType })}>
          <SelectTrigger className="w-[140px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {QUESTION_TYPES.map((t) => (
              <SelectItem key={t.type} value={t.type} className="text-xs">
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {onReextract && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={onReextract}
            title="Re-analyze this field on-device"
          >
            <Wand2 className="h-3.5 w-3.5 text-primary" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => setEditing((e) => !e)}
        >
          <Edit3 className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5 text-destructive" />
        </Button>
      </div>

      {q.aiUpgrade && (
        <p className="text-[11px] text-primary/80 italic flex items-start gap-1">
          <Sparkles className="h-3 w-3 mt-0.5 flex-shrink-0" />
          {q.aiUpgrade}
        </p>
      )}

      {editing && (
        <div className="space-y-2 pt-2 border-t border-border">
          <div>
            <Label className="text-[10px] uppercase">Hint</Label>
            <Input
              value={q.hint || ""}
              onChange={(e) => onChange({ hint: e.target.value })}
              className="h-7 text-xs"
              placeholder="Helper text"
            />
          </div>

          {isChoice && (
            <div>
              <Label className="text-[10px] uppercase">Options</Label>
              <div className="space-y-1">
                {(q.options || []).map((opt, i) => (
                  <div key={i} className="flex gap-1">
                    <Input
                      value={opt.label}
                      onChange={(e) => {
                        const opts = [...(q.options || [])];
                        opts[i] = { ...opt, label: e.target.value, value: slugify(e.target.value) };
                        onChange({ options: opts });
                      }}
                      className="h-7 text-xs"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => {
                        const opts = (q.options || []).filter((_, j) => j !== i);
                        onChange({ options: opts });
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() =>
                    onChange({
                      options: [...(q.options || []), { value: `option_${(q.options?.length || 0) + 1}`, label: "New option" }],
                    })
                  }
                >
                  <Plus className="h-3 w-3 mr-1" /> Add option
                </Button>
              </div>
            </div>
          )}

          {(q.type === "number" || q.type === "range") && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] uppercase">Min</Label>
                <Input
                  type="number"
                  value={q.validation?.min ?? ""}
                  onChange={(e) =>
                    onChange({
                      validation: {
                        ...q.validation,
                        min: e.target.value === "" ? undefined : Number(e.target.value),
                      },
                    })
                  }
                  className="h-7 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase">Max</Label>
                <Input
                  type="number"
                  value={q.validation?.max ?? ""}
                  onChange={(e) =>
                    onChange({
                      validation: {
                        ...q.validation,
                        max: e.target.value === "" ? undefined : Number(e.target.value),
                      },
                    })
                  }
                  className="h-7 text-xs"
                />
              </div>
            </div>
          )}

          <div>
            <Label className="text-[10px] uppercase">Skip logic (relevant)</Label>
            <Input
              value={q.relevant || ""}
              onChange={(e) => onChange({ relevant: e.target.value })}
              className="h-7 text-xs font-mono"
              placeholder="${other_field} = 'yes'"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default SnapToFormDialog;
