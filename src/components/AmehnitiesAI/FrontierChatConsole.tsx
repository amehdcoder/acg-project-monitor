/**
 * FrontierChatConsole — the enterprise console for Amehnities AI.
 *
 * Brings four capabilities into one surface:
 *   1. Hybrid frontier reasoning streamed from `ai-frontier-chat`, grounded in
 *      long-term vector memory, uploaded files and live app telemetry.
 *   2. A multi-file dropzone (CSV, XLSX, PDF, DOCX, JSON, images) with a live
 *      dataset preview, feeding an in-browser Python analysis sandbox.
 *   3. One-click conversion of any answer into .pptx, .docx, .pdf or .xlsx.
 *   4. Multimodal generation — image galleries and video job cards backed by
 *      durable rows from the media service.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Bot, Brain, Download, FileSpreadsheet, FileText, FileType2, Image as ImageIcon,
  Loader2, Paperclip, Play, Presentation, Send, Sparkles, Table2, Trash2, Upload,
  Video, X, Database, Cpu, AlertTriangle, Square, RotateCcw, NotebookPen, Search,
  MapPin,
} from "lucide-react";

import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { parseFiles, type ParsedAttachment } from "@/lib/amehnitiesAi/fileParsers";
import { generateDocument, type DocFormat } from "@/lib/amehnitiesAi/documentGenerator";
import { extractPythonBlock, runAnalysis, type AnalysisResult } from "@/lib/amehnitiesAi/pyodideSandbox";
import {
  generateMedia, listGeneratedMedia, streamFrontierChat,
  type FrontierMeta, type GeneratedMedia,
} from "@/lib/amehnitiesAi/frontierClient";
import { BRIGHT_CHART_PALETTE } from "@/lib/charts/brightPalette";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  listMyProjects, registerDataset, saveAnalysisNote, searchAnalysisNotes,
  deleteAnalysisNote, type AnalysisNote,
} from "@/lib/amehnitiesAi/analysisNotes";


interface ConsoleMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: FrontierMeta | null;
  attachments?: { name: string; kind: string }[];
  streaming?: boolean;
}

const uid = () => `m_${Math.random().toString(36).slice(2, 10)}`;

const KIND_ICON: Record<string, typeof FileText> = {
  table: Table2,
  document: FileText,
  json: Database,
  image: ImageIcon,
  text: FileType2,
  unsupported: AlertTriangle,
};

const fmtBytes = (n: number) =>
  n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : n > 1e3 ? `${(n / 1e3).toFixed(0)} KB` : `${n} B`;

export default function FrontierChatConsole({
  telemetry,
  corpusEvents = 0,
}: {
  telemetry?: unknown;
  corpusEvents?: number;
}) {
  const [messages, setMessages] = useState<ConsoleMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [attachments, setAttachments] = useState<ParsedAttachment[]>([]);
  const [parsing, setParsing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analysisStatus, setAnalysisStatus] = useState<string | null>(null);
  const [docBusy, setDocBusy] = useState<DocFormat | null>(null);
  const [mediaPrompt, setMediaPrompt] = useState("");
  const [mediaBusy, setMediaBusy] = useState<"image" | "video" | null>(null);
  const [media, setMedia] = useState<GeneratedMedia[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void listGeneratedMedia().then(setMedia).catch(() => {});
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const datasets = useMemo(
    () => attachments.filter((a) => Array.isArray(a.rows) && a.rows.length > 0),
    [attachments],
  );

  const lastAnswer = useMemo(
    () => [...messages].reverse().find((m) => m.role === "assistant" && !m.streaming)?.content ?? "",
    [messages],
  );
  const pythonBlock = useMemo(() => extractPythonBlock(lastAnswer), [lastAnswer]);

  /* --------------------------------------------------------------- files */
  const ingest = useCallback(async (files: File[]) => {
    if (!files.length) return;
    setParsing(true);
    try {
      const parsed = await parseFiles(files.slice(0, 12));
      setAttachments((cur) => [...cur, ...parsed].slice(0, 12));
      const failed = parsed.filter((p) => p.error);
      if (failed.length) {
        toast.warning(`${failed.length} file(s) could not be read`, {
          description: failed.map((f) => f.name).join(", "),
        });
      }
    } catch (e: any) {
      toast.error("Upload failed", { description: e?.message });
    } finally {
      setParsing(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void ingest(Array.from(e.dataTransfer.files ?? []));
  }, [ingest]);

  /* ---------------------------------------------------------------- chat */
  const telemetrySummary = useMemo(() => {
    if (!telemetry) return "";
    try {
      const t = telemetry as Record<string, any>;
      return [
        `Local transformer step ${t.step ?? 0}, loss ${Number(t.loss ?? 0).toFixed(3)}, perplexity ${Number(t.perplexity ?? 0).toFixed(1)}.`,
        `Activity corpus events: ${corpusEvents}.`,
      ].join(" ");
    } catch {
      return "";
    }
  }, [telemetry, corpusEvents]);

  const ask = useCallback(async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;

    const userMsg: ConsoleMessage = {
      id: uid(),
      role: "user",
      content: q,
      attachments: attachments.map((a) => ({ name: a.name, kind: a.kind })),
    };
    const assistantId = uid();
    setMessages((cur) => [
      ...cur,
      userMsg,
      { id: assistantId, role: "assistant", content: "", streaming: true },
    ]);
    setInput("");
    setBusy(true);
    setAnalysis(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history = messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));
      await streamFrontierChat({
        question: q,
        history,
        attachments,
        telemetry: telemetrySummary,
        signal: controller.signal,
        onMeta: (meta) =>
          setMessages((cur) => cur.map((m) => (m.id === assistantId ? { ...m, meta } : m))),
        onDelta: (_chunk, full) =>
          setMessages((cur) => cur.map((m) => (m.id === assistantId ? { ...m, content: full } : m))),
      });
    } catch (e: any) {
      if (e?.name !== "AbortError") {
        toast.error("Assistant failed", { description: e?.message });
        setMessages((cur) =>
          cur.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content || `⚠️ ${e?.message ?? "Request failed."}` }
              : m,
          ),
        );
      }
    } finally {
      setMessages((cur) => cur.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m)));
      setBusy(false);
      abortRef.current = null;
    }
  }, [attachments, busy, messages, telemetrySummary]);

  /* ------------------------------------------------------------ analysis */
  const doAnalysis = useCallback(async () => {
    if (!pythonBlock || !datasets.length) return;
    setAnalysisStatus("Starting…");
    try {
      const result = await runAnalysis(
        pythonBlock,
        datasets.map((d) => ({ name: d.name, rows: d.rows ?? [] })),
        setAnalysisStatus,
      );
      setAnalysis(result);
      if (!result.ok) toast.error("Analysis raised an error");
    } catch (e: any) {
      toast.error("Analysis could not run", { description: e?.message });
    } finally {
      setAnalysisStatus(null);
    }
  }, [pythonBlock, datasets]);

  /* ------------------------------------------------------------ document */
  const makeDoc = useCallback(async (format: DocFormat) => {
    if (!lastAnswer) return;
    setDocBusy(format);
    try {
      const name = await generateDocument(lastAnswer, format, "Amehnities AI Report");
      toast.success(`${format.toUpperCase()} ready`, { description: name });
    } catch (e: any) {
      toast.error("Document generation failed", { description: e?.message });
    } finally {
      setDocBusy(null);
    }
  }, [lastAnswer]);

  /* --------------------------------------------------------------- media */
  const makeMedia = useCallback(async (kind: "image" | "video") => {
    const prompt = mediaPrompt.trim();
    if (!prompt) {
      toast.error("Describe what to generate first");
      return;
    }
    setMediaBusy(kind);
    // Optimistic progress card so the user sees the job immediately.
    const pending: GeneratedMedia = { kind, prompt, status: "queued" };
    setMedia((cur) => [pending, ...cur]);
    try {
      const out = await generateMedia({ kind, prompt });
      setMedia((cur) => [out.media, ...cur.filter((m) => m !== pending)]);
      if (out.message) toast.info(out.message);
      else toast.success(kind === "image" ? "Image generated" : "Video job created");
    } catch (e: any) {
      setMedia((cur) => cur.filter((m) => m !== pending));
      toast.error("Generation failed", { description: e?.message });
    } finally {
      setMediaBusy(null);
    }
  }, [mediaPrompt]);

  /* ---------------------------------------------------------------- view */
  return (
    <Card className="overflow-hidden border-border/60 bg-card/70 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg border border-primary/30 bg-primary/10">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Frontier console</h2>
          <p className="text-[11px] text-muted-foreground">
            Files, analysis, documents and multimodal generation — grounded in your app data.
          </p>
        </div>
        <Badge variant="outline" className="ml-auto gap-1 text-[10px]">
          <Cpu className="h-3 w-3" /> hybrid routing
        </Badge>
      </div>

      <Tabs defaultValue="chat" className="p-3 sm:p-4">
        <TabsList>
          <TabsTrigger value="chat" className="gap-1.5"><Bot className="h-3.5 w-3.5" /> Chat</TabsTrigger>
          <TabsTrigger value="data" className="gap-1.5"><Database className="h-3.5 w-3.5" /> Data ({attachments.length})</TabsTrigger>
          <TabsTrigger value="media" className="gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> Media</TabsTrigger>
        </TabsList>

        {/* ------------------------------------------------------- chat */}
        <TabsContent value="chat" className="pt-4">
          <div
            ref={scrollRef}
            className="max-h-[28rem] space-y-4 overflow-y-auto rounded-xl border border-border/60 bg-background/40 p-3"
          >
            {messages.length === 0 && (
              <div className="py-10 text-center text-sm text-muted-foreground">
                <Brain className="mx-auto mb-2 h-6 w-6 text-primary/70" />
                Attach datasets or ask a supervision question — answers cite memory [M], files [F] and telemetry [E].
              </div>
            )}

            {messages.map((m) => (
              <div key={m.id} className={cn("flex gap-2", m.role === "user" && "justify-end")}>
                <div
                  className={cn(
                    "max-w-[88%] rounded-xl border px-3 py-2 text-sm",
                    m.role === "user"
                      ? "border-primary/30 bg-primary/10"
                      : "border-border/60 bg-card/80",
                  )}
                >
                  {m.role === "assistant" && m.meta && (
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className="text-[10px]">{m.meta.route?.label}</Badge>
                      <Badge variant="secondary" className="font-mono text-[10px]">{m.meta.route?.model}</Badge>
                      {m.meta.memory?.length > 0 && (
                        <Badge variant="outline" className="text-[10px]">{m.meta.memory.length} memory hits</Badge>
                      )}
                      {m.meta.files?.length > 0 && (
                        <Badge variant="outline" className="text-[10px]">{m.meta.files.length} files</Badge>
                      )}
                    </div>
                  )}

                  {m.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground/90 prose-strong:text-foreground prose-td:text-foreground/90">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content || "…"}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  )}

                  {m.attachments && m.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {m.attachments.map((a) => (
                        <Badge key={a.name} variant="outline" className="gap-1 text-[10px]">
                          <Paperclip className="h-2.5 w-2.5" /> {a.name}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {m.streaming && (
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> reasoning…
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* deliverables */}
          {lastAnswer && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Export answer</span>
              {([
                ["pptx", Presentation, "PowerPoint"],
                ["docx", FileText, "Word"],
                ["pdf", FileType2, "PDF report"],
                ["xlsx", FileSpreadsheet, "Excel"],
              ] as [DocFormat, typeof FileText, string][]).map(([fmt, Icon, label]) => (
                <Button
                  key={fmt} size="sm" variant="outline" className="h-8 gap-1.5 text-xs"
                  disabled={docBusy !== null} onClick={() => void makeDoc(fmt)}
                >
                  {docBusy === fmt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
                  {label}
                </Button>
              ))}
              {pythonBlock && datasets.length > 0 && (
                <Button
                  size="sm" className="ml-auto h-8 gap-1.5 text-xs"
                  disabled={analysisStatus !== null} onClick={() => void doAnalysis()}
                >
                  {analysisStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                  {analysisStatus ?? "Run analysis"}
                </Button>
              )}
            </div>
          )}

          {analysis && <AnalysisOutput result={analysis} />}

          {/* composer */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "mt-3 rounded-xl border p-2 transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border/60 bg-background/40",
            )}
          >
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {attachments.map((a) => (
                  <Badge key={a.id} variant="secondary" className="gap-1 text-[10px]">
                    {a.name}
                    <button onClick={() => setAttachments((cur) => cur.filter((x) => x.id !== a.id))}>
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void ask(input); }
              }}
              placeholder="Ask anything — or drop CSV/XLSX/PDF/DOCX/JSON/images here and ask for the analysis."
              className="min-h-[68px] resize-none border-0 bg-transparent focus-visible:ring-0"
            />
            <div className="flex items-center gap-2">
              <input
                ref={fileRef} type="file" multiple hidden
                accept=".csv,.tsv,.xlsx,.xls,.json,.pdf,.docx,.txt,.md,image/*"
                onChange={(e) => { void ingest(Array.from(e.target.files ?? [])); e.target.value = ""; }}
              />
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => fileRef.current?.click()} disabled={parsing}>
                {parsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}
                Attach
              </Button>
              <span className="text-[11px] text-muted-foreground">Enter to send · Shift+Enter for a new line</span>
              <Button size="sm" className="ml-auto h-8 gap-1.5 text-xs" disabled={busy || !input.trim()} onClick={() => void ask(input)}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Send
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ------------------------------------------------------- data */}
        <TabsContent value="data" className="pt-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={cn(
              "grid cursor-pointer place-items-center rounded-xl border-2 border-dashed p-8 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/50",
            )}
          >
            <Upload className="mb-2 h-6 w-6 text-primary" />
            <p className="text-sm font-medium">Drop files here, or click to browse</p>
            <p className="text-xs text-muted-foreground">CSV · TSV · XLSX · JSON · PDF · DOCX · TXT · images — up to 12 files</p>
          </div>

          <div className="mt-4 space-y-3">
            {attachments.length === 0 && (
              <p className="text-sm text-muted-foreground">No files attached yet.</p>
            )}
            {attachments.map((a) => {
              const Icon = KIND_ICON[a.kind] ?? FileText;
              return (
                <Card key={a.id} className="border-border/60 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">{a.name}</span>
                    <Badge variant="outline" className="text-[10px]">{a.kind}</Badge>
                    <span className="text-[11px] text-muted-foreground">{fmtBytes(a.size)}</span>
                    <Button
                      size="sm" variant="ghost" className="ml-auto h-7 w-7 p-0"
                      onClick={() => setAttachments((cur) => cur.filter((x) => x.id !== a.id))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{a.error ?? a.summary}</p>

                  {a.dataUrl && (
                    <img src={a.dataUrl} alt={a.name} loading="lazy" className="mt-2 max-h-48 rounded-lg border border-border/60 object-contain" />
                  )}

                  {a.rows && a.columns && a.rows.length > 0 && (
                    <ScrollArea className="mt-2 max-h-56 rounded-lg border border-border/60">
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-muted/70">
                          <tr>
                            {a.columns.slice(0, 12).map((c) => (
                              <th key={c} className="whitespace-nowrap px-2 py-1.5 font-semibold">{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {a.rows.slice(0, 25).map((row, i) => (
                            <tr key={i} className="border-t border-border/40">
                              {a.columns!.slice(0, 12).map((c) => (
                                <td key={c} className="max-w-[14rem] truncate px-2 py-1 text-muted-foreground">
                                  {String(row[c] ?? "")}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  )}
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* ------------------------------------------------------ media */}
        <TabsContent value="media" className="pt-4">
          <div className="flex flex-wrap gap-2">
            <Input
              value={mediaPrompt}
              onChange={(e) => setMediaPrompt(e.target.value)}
              placeholder="Describe the visual — e.g. a WHO-style infographic of MDA coverage in Jigawa"
              className="min-w-[16rem] flex-1"
            />
            <Button className="gap-1.5" disabled={mediaBusy !== null} onClick={() => void makeMedia("image")}>
              {mediaBusy === "image" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
              Generate image
            </Button>
            <Button variant="outline" className="gap-1.5" disabled={mediaBusy !== null} onClick={() => void makeMedia("video")}>
              {mediaBusy === "video" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
              Generate video
            </Button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {media.length === 0 && (
              <p className="text-sm text-muted-foreground">No generated media yet.</p>
            )}
            {media.map((m, i) => (
              <MediaCard key={m.id ?? `pending-${i}`} media={m} />
            ))}
          </div>
        </TabsContent>

        {/* ------------------------------------------------------ notes */}
        <TabsContent value="notes" className="pt-4">
          <NotesPanel refreshKey={notesRefresh} />
        </TabsContent>
      </Tabs>

      <SaveNoteDialog
        open={noteOpen}
        onOpenChange={setNoteOpen}
        question={lastQuestion}
        answer={lastAnswer}
        analysis={analysis}
        datasets={datasets}
        onSaved={() => setNotesRefresh((n) => n + 1)}
      />

    </Card>
  );
}

/* ------------------------------------------------------------------ */

function MediaCard({ media }: { media: GeneratedMedia }) {
  const pending = media.status === "queued";
  return (
    <Card className="overflow-hidden border-border/60">
      <div className="relative grid aspect-video place-items-center bg-muted/40">
        {media.kind === "image" && media.url && media.status === "completed" ? (
          <img src={media.url} alt={media.prompt} loading="lazy" className="h-full w-full object-cover" />
        ) : media.kind === "video" && media.url && media.status === "completed" ? (
          <video src={media.url} controls className="h-full w-full object-cover" />
        ) : (
          <div className="w-full px-4 text-center">
            {media.kind === "video" ? <Video className="mx-auto h-6 w-6 text-muted-foreground" /> : <ImageIcon className="mx-auto h-6 w-6 text-muted-foreground" />}
            <p className="mt-1 text-[11px] text-muted-foreground">
              {pending ? "Rendering…" : media.status === "unavailable"
                ? String((media.metadata as any)?.reason ?? "Provider not connected yet.")
                : "No preview available"}
            </p>
            {pending && <Progress value={undefined} className="mt-2 h-1.5 animate-pulse" />}
          </div>
        )}
      </div>
      <div className="space-y-1.5 p-3">
        <div className="flex items-center gap-1.5">
          <Badge variant={media.status === "completed" ? "default" : "outline"} className="text-[10px] capitalize">
            {media.status}
          </Badge>
          <Badge variant="secondary" className="text-[10px] capitalize">{media.kind}</Badge>
          {media.url && media.status === "completed" && (
            <a href={media.url} download target="_blank" rel="noreferrer" className="ml-auto">
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-[11px]">
                <Download className="h-3 w-3" /> Save
              </Button>
            </a>
          )}
        </div>
        <p className="line-clamp-2 text-xs text-muted-foreground">{media.prompt}</p>
      </div>
    </Card>
  );
}

function AnalysisOutput({ result }: { result: AnalysisResult }) {
  const chart = result.chart;
  const palette = BRIGHT_CHART_PALETTE;
  return (
    <Card className="mt-3 border-border/60 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Cpu className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Analysis output</span>
        <Badge variant="outline" className="text-[10px]">{Math.round(result.durationMs)} ms</Badge>
        {!result.ok && <Badge variant="destructive" className="text-[10px]">error</Badge>}
      </div>
      {result.stdout && (
        <pre className="max-h-64 overflow-auto rounded-lg bg-muted/50 p-3 text-xs">{result.stdout}</pre>
      )}
      {result.error && (
        <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          {result.error}
        </pre>
      )}
      {chart && chart.data?.length > 0 && (
        <div className="mt-3 h-64">
          <p className="mb-1 text-xs font-medium">{chart.title}</p>
          <ResponsiveContainer width="100%" height="100%">
            {chart.type === "pie" ? (
              <PieChart>
                <Tooltip />
                <Pie data={chart.data} dataKey="value" nameKey="name" outerRadius={90} label>
                  {chart.data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
                </Pie>
              </PieChart>
            ) : chart.type === "line" || chart.type === "area" ? (
              <LineChart data={chart.data}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="value" stroke={palette[0]} strokeWidth={2} dot={false} />
              </LineChart>
            ) : chart.type === "scatter" ? (
              <ScatterChart>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis dataKey="value" tick={{ fontSize: 11 }} />
                <Tooltip />
                <Scatter data={chart.data} fill={palette[1]} />
              </ScatterChart>
            ) : (
              <BarChart data={chart.data}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chart.data.map((_, i) => <Cell key={i} fill={palette[i % palette.length]} />)}
                </Bar>
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
