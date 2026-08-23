/**
 * Ask Amehnities AI — a grounded chat surface over live application activity.
 *
 * Questions are answered by the `chat-app-data` edge function, which pulls a
 * bounded slice of real database activity plus the live Transformer metrics and
 * streams a Markdown answer back token by token. Every factual claim carries a
 * clickable [E#] citation resolving to a real event id + timestamp, the whole
 * conversation is saved to the backend, and the assistant proposes follow-up
 * questions based on what it actually found.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot, User, SendHorizontal, Loader2, Trash2, Radio, History, Plus,
  Database, Clock, Hash, MessageSquare, Sparkles, ThumbsUp, ThumbsDown,
  RefreshCw, GraduationCap, Check, BrainCircuit, Gauge, Zap, Scale, Telescope,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Telemetry } from "@/hooks/useAmehnitiesBrain";
import {
  type Citation, type Conversation, type PolicyApplied, type RouteInfo, countLearnedRules,
  createConversation, deleteConversation, listConversations, loadMessages, saveMessage,
  sendFeedback, splitFollowups, titleFromQuestion, usedCitations,
} from "@/lib/amehnitiesAi/chatHistory";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  followups?: string[];
  /** Learned-policy entries that shaped this answer — used for reward credit. */
  policyIds?: string[];
  policyApplied?: PolicyApplied[];
  /** The question this answer responded to (needed by the learning loop). */
  question?: string;
  rated?: -1 | 0 | 1;
  /** Which model tier answered, and why. */
  route?: RouteInfo;
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

const fmtTime = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
};

/** Rewrites bare [E3]/[W2] markers into links the markdown renderer can make clickable. */
const linkifyCitations = (text: string) =>
  text.replace(/\[([EW]\d+)\]/g, (_m, ref) => `[${ref}](#cite-${ref})`);


export default function AmehnitiesChatBox({
  telemetry, corpusEvents,
}: { telemetry: Telemetry | null; corpusEvents: number }) {
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId?: string }>();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [openCitation, setOpenCitation] = useState<Citation | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [correction, setCorrection] = useState("");
  const [learnedRules, setLearnedRules] = useState(0);
  const [rewarding, setRewarding] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const convIdRef = useRef<string | undefined>(conversationId);
  convIdRef.current = conversationId;

  const suggestions = useMemo(() => [
    "Summarize recent submission activity",
    "Which activity stream moved most in the last 24 hours?",
    `Explain current loss (${(telemetry?.loss ?? 0).toFixed(3)}) and perplexity (${(telemetry?.perplexity ?? 0).toFixed(1)})`,
    "Show the latest audit trail events",
  ], [telemetry?.loss, telemetry?.perplexity]);

  const refreshConversations = useCallback(async () => {
    try { setConversations(await listConversations()); } catch { /* history unavailable */ }
  }, []);

  const refreshLearned = useCallback(async () => {
    try { setLearnedRules(await countLearnedRules()); } catch { /* policy unavailable */ }
  }, []);

  useEffect(() => { void refreshConversations(); void refreshLearned(); }, [refreshConversations, refreshLearned]);

  // Load whichever conversation the route points at.
  useEffect(() => {
    let cancelled = false;
    if (!conversationId) { setMessages([]); return; }
    (async () => {
      try {
        const rows = await loadMessages(conversationId);
        if (cancelled) return;
        setMessages(rows.map((r) => ({
          id: r.id, role: r.role, content: r.content, citations: r.citations, followups: r.followups,
        })));
      } catch (e: any) {
        if (!cancelled) toast.error("Could not open that conversation", { description: e?.message });
      }
    })();
    return () => { cancelled = true; };
  }, [conversationId]);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => { if (!busy) inputRef.current?.focus(); }, [busy, conversationId]);

  const send = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setInput("");
    const userMsg: ChatMessage = { id: uid(), role: "user", content: question };
    const replyId = uid();
    const history = [...messages, userMsg];
    setMessages([...history, { id: replyId, role: "assistant", content: "" }]);
    setBusy(true);

    // Ensure the conversation exists (and that its URL is shareable/reloadable).
    let convId = convIdRef.current;
    try {
      if (!convId) {
        const conv = await createConversation(titleFromQuestion(question));
        convId = conv.id;
        convIdRef.current = conv.id;
        navigate(`/amehnities-ai/c/${conv.id}`, { replace: true });
        void refreshConversations();
      }
      await saveMessage(convId, { role: "user", content: question });
    } catch (e: any) {
      toast.error("Chat history could not be saved", { description: e?.message });
    }

    let catalog: Citation[] = [];
    let policyIds: string[] = [];
    let policyApplied: PolicyApplied[] = [];
    let route: RouteInfo | undefined;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-app-data`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          modelStats: telemetry
            ? {
                parameters: telemetry.params,
                trainingStep: telemetry.step,
                loss: Number(telemetry.loss.toFixed(4)),
                perplexity: Number(telemetry.perplexity.toFixed(3)),
                tokensSeen: telemetry.tokensSeen,
                tokensPerSecond: Math.round(telemetry.tokensPerSec || 0),
                architecture: `${telemetry.cfg.nLayers} blocks · d=${telemetry.cfg.dModel} · ${telemetry.cfg.nHeads} heads · ctx ${telemetry.cfg.ctx}`,
                corpusEventsInBrowser: corpusEvents,
              }
            : undefined,
        }),
      });

      if (!res.ok || !res.body) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || `Assistant unavailable (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed?.amehnities) {
              catalog = (parsed.amehnities.citations ?? []) as Citation[];
              policyIds = (parsed.amehnities.policyIds ?? []) as string[];
              policyApplied = (parsed.amehnities.policyApplied ?? []) as PolicyApplied[];
              route = parsed.amehnities.route as RouteInfo | undefined;
              continue;
            }
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) {
              answer += delta;
              const shown = splitFollowups(answer).answer;
              setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, content: shown } : x)));
            }
          } catch { /* partial frame — wait for more bytes */ }
        }
      }

      const { answer: finalAnswer, followups } = splitFollowups(answer);
      const body = finalAnswer || "_I could not determine an answer from the available application data._";
      const cites = usedCitations(body, catalog);
      setMessages((m) => m.map((x) => (x.id === replyId
        ? { ...x, content: body, citations: cites, followups, policyIds, policyApplied, question, route }
        : x)));

      if (convIdRef.current) {
        try {
          const rowId = await saveMessage(convIdRef.current, {
            role: "assistant", content: body, citations: cites, followups,
          });
          // Adopt the database row id so feedback can be attached to this answer.
          setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, id: rowId } : x)));
          void refreshConversations();
        } catch (e: any) {
          toast.error("Answer could not be saved to history", { description: e?.message });
        }
      }
    } catch (e: any) {
      setMessages((m) => m.filter((x) => x.id !== replyId));
      toast.error("Amehnities AI could not answer", { description: e?.message });
    } finally {
      setBusy(false);
    }
  }, [busy, messages, telemetry, corpusEvents, navigate, refreshConversations]);

  const startNewChat = useCallback(() => {
    setMessages([]);
    convIdRef.current = undefined;
    navigate("/amehnities-ai");
    setHistoryOpen(false);
  }, [navigate]);

  const removeConversation = useCallback(async (id: string) => {
    try {
      await deleteConversation(id);
      setConversations((c) => c.filter((x) => x.id !== id));
      if (convIdRef.current === id) startNewChat();
    } catch (e: any) {
      toast.error("Could not delete conversation", { description: e?.message });
    }
  }, [startNewChat]);

  /**
   * Reinforcement signal. The rating (plus any written correction) is shaped
   * into a reward server-side, credited to the policy entries that produced the
   * answer, and distilled into a durable rule the assistant follows next time.
   */
  const rate = useCallback(async (msg: ChatMessage, rating: -1 | 1, note?: string) => {
    setRewarding(msg.id);
    try {
      const { reward, learned } = await sendFeedback({
        messageId: /^[0-9a-f-]{36}$/i.test(msg.id) ? msg.id : undefined,
        conversationId: convIdRef.current,
        question: msg.question ?? "",
        answer: msg.content,
        rating,
        correction: note,
        citations: msg.citations?.length ?? 0,
        followups: msg.followups?.length ?? 0,
        policyIds: msg.policyIds ?? [],
        route: msg.route,
      });
      setMessages((m) => m.map((x) => (x.id === msg.id ? { ...x, rated: rating } : x)));
      setCorrecting(null);
      setCorrection("");
      void refreshLearned();
      toast.success(learned ? "Learned from your feedback" : "Feedback recorded", {
        description: learned
          ? `New rule (${learned.topic}): ${learned.rule}`
          : `Reward signal ${reward > 0 ? "+" : ""}${reward.toFixed(2)} applied to the assistant's policy.`,
      });
    } catch (e: any) {
      toast.error("Feedback could not be sent", { description: e?.message });
    } finally {
      setRewarding(null);
    }
  }, [refreshLearned]);

  /** Re-ask the same question — now conditioned on the updated policy. */
  const regenerate = useCallback((msg: ChatMessage) => {
    if (!msg.question || busy) return;
    setMessages((m) => m.filter((x) => x.id !== msg.id));
    void send(msg.question);
  }, [busy, send]);

  /** Markdown renderers styled with the app's semantic tokens. */
  const MD = useMemo(() => {
    const base = {
      p: (p: any) => <p className="text-sm text-foreground" {...p} />,
      strong: (p: any) => <strong className="font-semibold text-foreground" {...p} />,
      em: (p: any) => <em className="italic" {...p} />,
      ul: (p: any) => <ul className="ml-4 list-disc space-y-1 text-sm text-foreground" {...p} />,
      ol: (p: any) => <ol className="ml-4 list-decimal space-y-1 text-sm text-foreground" {...p} />,
      li: (p: any) => <li className="marker:text-primary" {...p} />,
      h1: (p: any) => <h4 className="text-sm font-semibold text-foreground" {...p} />,
      h2: (p: any) => <h4 className="text-sm font-semibold text-foreground" {...p} />,
      h3: (p: any) => <h5 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground" {...p} />,
      code: ({ inline, ...p }: any) =>
        inline
          ? <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]" {...p} />
          : <code className="block overflow-x-auto rounded-lg bg-muted p-3 font-mono text-[11px]" {...p} />,
      blockquote: (p: any) => <blockquote className="border-l-2 border-primary/50 pl-3 text-sm text-muted-foreground" {...p} />,
      table: (p: any) => (
        <div className="overflow-x-auto rounded-lg border border-border/60">
          <table className="w-full border-collapse text-xs" {...p} />
        </div>
      ),
      thead: (p: any) => <thead className="bg-muted/60" {...p} />,
      th: (p: any) => <th className="border-b border-border/60 px-2.5 py-1.5 text-left font-semibold text-foreground" {...p} />,
      td: (p: any) => <td className="border-b border-border/40 px-2.5 py-1.5 text-muted-foreground" {...p} />,
      hr: () => <hr className="border-border/60" />,
    };
    return base;
  }, []);

  const renderMarkdown = (msg: ChatMessage) => {
    const catalog = msg.citations ?? [];
    const components = {
      ...MD,
      a: (p: any) => {
        const href = String(p.href ?? "");
        if (href.startsWith("#cite-")) {
          const ref = href.slice(6);
          const cite = catalog.find((c) => c.ref === ref);
          return (
            <button
              type="button"
              onClick={() => cite && setOpenCitation(cite)}
              title={cite ? `${cite.label} · ${cite.kind === "web" ? (cite.publisher ?? "Web source") : fmtTime(cite.timestamp)}` : "Source unavailable"}
              className={`mx-0.5 inline-flex items-center rounded-md border px-1.5 py-px align-baseline font-mono text-[10px] font-semibold transition-colors ${
                cite?.kind === "web"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
                  : "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
              }`}

            >
              {ref}
            </button>
          );
        }
        return <a className="text-primary underline underline-offset-2" target="_blank" rel="noreferrer" {...p} />;
      },
    };
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {linkifyCitations(msg.content)}
      </ReactMarkdown>
    );
  };

  return (
    <Card className="border-border/60 bg-card/80 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg border border-primary/30 bg-primary/10">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-tight">Amehnities Data Assistant</h3>
          <p className="text-[11px] text-muted-foreground">Grounded in live application activity — every claim cited.</p>
        </div>
        <Badge variant="outline" className="ml-auto gap-1.5 border-primary/40 text-primary">
          <Radio className="h-3 w-3" />
          Corpus: {corpusEvents.toLocaleString()} events
        </Badge>
        <Badge
          variant="outline"
          title="Behaviour rules the assistant has learned from your ratings and corrections"
          className="gap-1.5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400"
        >
          <GraduationCap className="h-3 w-3" />
          Learned rules: {learnedRules}
        </Badge>

        <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1.5">
              <History className="h-3.5 w-3.5" /> History
              {conversations.length > 0 && (
                <span className="rounded bg-muted px-1 text-[10px]">{conversations.length}</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Saved conversations
              </span>
              <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" onClick={startNewChat}>
                <Plus className="h-3.5 w-3.5" /> New
              </Button>
            </div>
            <ScrollArea className="max-h-72">
              {!conversations.length && (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No saved conversations yet.
                </p>
              )}
              <div className="p-1">
                {conversations.map((c) => (
                  <div
                    key={c.id}
                    className={`flex items-center gap-1 rounded-lg px-1 ${
                      c.id === conversationId ? "bg-primary/10" : "hover:bg-muted/60"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => { navigate(`/amehnities-ai/c/${c.id}`); setHistoryOpen(false); }}
                      className="flex min-w-0 flex-1 items-start gap-2 px-2 py-2 text-left"
                    >
                      <MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-foreground">{c.title}</span>
                        <span className="block text-[10px] text-muted-foreground">{fmtTime(c.updatedAt)}</span>
                      </span>
                    </button>
                    <Button
                      size="icon" variant="ghost" aria-label="Delete conversation"
                      className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => removeConversation(c.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>

        <Button size="sm" variant="ghost" disabled={busy || (!messages.length && !conversationId)}
          onClick={startNewChat} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New chat
        </Button>
      </div>

      <div ref={feedRef} className="max-h-[26rem] min-h-[13rem] space-y-4 overflow-y-auto px-4 py-4">
        {!messages.length && (
          <div className="py-8 text-center">
            <p className="text-sm font-medium">Ask anything about field activity, submissions or app metrics.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Answers use only live database context and current model metrics — with clickable event citations.
            </p>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex gap-3 ${m.role === "user" ? "justify-end" : ""}`}>
            {m.role === "assistant" && (
              <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-primary/30 bg-primary/10">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
            )}
            <div className={m.role === "user"
              ? "max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground"
              : "max-w-[85%] space-y-2.5 text-sm text-foreground"}>
              {m.role === "assistant" ? (
                m.content ? (
                  <>
                    <div className="space-y-2 leading-relaxed">{renderMarkdown(m)}</div>

                    {!!m.citations?.length && (
                      <div className="rounded-xl border border-border/60 bg-muted/30 p-2.5">
                        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          Sources ({m.citations.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {m.citations.map((c) => (
                            <button
                              key={c.ref} type="button" onClick={() => setOpenCitation(c)}
                              className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border bg-background px-2 py-1 text-left text-[10px] transition-colors hover:bg-primary/5 ${
                                c.kind === "web" ? "border-emerald-500/50 hover:border-emerald-500" : "border-border/60 hover:border-primary/50"
                              }`}
                            >
                              <span className={`font-mono font-semibold ${c.kind === "web" ? "text-emerald-600 dark:text-emerald-400" : "text-primary"}`}>{c.ref}</span>
                              <span className="truncate text-foreground">{c.label}</span>
                              <span className="shrink-0 text-muted-foreground">
                                {c.kind === "web" ? (c.publisher ?? "Web") : fmtTime(c.timestamp)}
                              </span>
                            </button>
                          ))}

                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {m.route && (
                        <span
                          title={`Routed automatically: ${m.route.questionClass} question → ${m.route.model}${m.route.learned ? " (learned override of the default route)" : ""}`}
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                            m.route.tier === "deep"
                              ? "border-violet-500/40 text-violet-600 dark:text-violet-400"
                              : m.route.tier === "fast"
                                ? "border-amber-500/40 text-amber-600 dark:text-amber-400"
                                : "border-sky-500/40 text-sky-600 dark:text-sky-400"
                          }`}
                        >
                          {m.route.tier === "deep" ? <Telescope className="h-3 w-3" />
                            : m.route.tier === "fast" ? <Zap className="h-3 w-3" />
                              : <Scale className="h-3 w-3" />}
                          {m.route.label}
                          {m.route.learned && <Gauge className="h-3 w-3" />}
                        </span>
                      )}
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                        Was this right?
                      </span>
                      <Button
                        size="sm" variant={m.rated === 1 ? "default" : "ghost"}
                        disabled={rewarding === m.id} aria-label="Helpful answer"
                        className="h-7 gap-1 px-2 text-[11px]"
                        onClick={() => rate(m, 1)}
                      >
                        {rewarding === m.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ThumbsUp className="h-3 w-3" />}
                        Helpful
                      </Button>
                      <Button
                        size="sm" variant={m.rated === -1 ? "destructive" : "ghost"}
                        disabled={rewarding === m.id} aria-label="Unhelpful answer"
                        className="h-7 gap-1 px-2 text-[11px]"
                        onClick={() => { setCorrecting(m.id); setCorrection(""); }}
                      >
                        <ThumbsDown className="h-3 w-3" /> Needs work
                      </Button>
                      <Button
                        size="sm" variant="ghost" disabled={busy || !m.question}
                        className="h-7 gap-1 px-2 text-[11px]" onClick={() => regenerate(m)}
                      >
                        <RefreshCw className="h-3 w-3" /> Retry with what it learned
                      </Button>
                      {m.rated && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
                          <Check className="h-3 w-3" /> Signal applied to policy
                        </span>
                      )}
                      {!!m.policyApplied?.length && (
                        <span
                          title={m.policyApplied.map((r) => `• [${r.topic}] ${r.content}`).join("\n")}
                          className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
                          <BrainCircuit className="h-3 w-3 text-primary" />
                          {m.policyApplied.length} learned rule{m.policyApplied.length === 1 ? "" : "s"} applied
                        </span>
                      )}
                    </div>

                    {correcting === m.id && (
                      <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-2.5">
                        <p className="text-[11px] font-medium text-foreground">
                          What was wrong or missing? Your correction becomes a permanent rule.
                        </p>
                        <Textarea
                          value={correction} rows={2}
                          onChange={(e) => setCorrection(e.target.value)}
                          placeholder="e.g. Always break submission counts down by state, and never mix the 24h and 7d windows."
                          className="min-h-[52px] resize-none text-xs"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7 text-[11px]" disabled={rewarding === m.id}
                            onClick={() => rate(m, -1, correction.trim() || undefined)}>
                            {rewarding === m.id ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                            Teach the assistant
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-[11px]"
                            onClick={() => { setCorrecting(null); setCorrection(""); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {!!m.followups?.length && (
                      <div>
                        <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                          <Sparkles className="h-3 w-3 text-primary" /> Suggested follow-ups
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {m.followups.map((q) => (
                            <button
                              key={q} type="button" disabled={busy} onClick={() => send(q)}
                              className="rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-[11px] text-foreground transition-colors hover:bg-primary/15 disabled:opacity-50"
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading application activity…
                  </span>
                )
              ) : (
                <span className="whitespace-pre-wrap">{m.content}</span>
              )}
            </div>
            {m.role === "user" && (
              <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-muted">
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="border-t border-border/60 px-4 py-3">
        {!messages.length && (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button key={s} type="button" disabled={busy} onClick={() => send(s)}
                className="rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50">
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); }
            }}
            rows={2}
            placeholder="Ask a question about field activity, submissions, or app metrics..."
            className="min-h-[52px] resize-none text-sm"
          />
          <Button size="icon" disabled={busy || !input.trim()} onClick={() => send(input)} aria-label="Send message">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          Enter to send · Shift + Enter for a new line · Conversations are saved to your account
        </p>
      </div>

      <Dialog open={!!openCitation} onOpenChange={(o) => !o && setOpenCitation(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="rounded-md border border-primary/40 bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                {openCitation?.ref}
              </span>
              {openCitation?.label}
            </DialogTitle>
          </DialogHeader>
          {openCitation && (
            <div className="space-y-2.5 text-sm">
              <div className="flex items-start gap-2">
                <Hash className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Event ID</p>
                  <p className="break-all font-mono text-xs text-foreground">{openCitation.eventId}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Recorded at</p>
                  <p className="text-xs text-foreground">{fmtTime(openCitation.timestamp)}</p>
                  <p className="font-mono text-[10px] text-muted-foreground">{openCitation.timestamp}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Database className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Source record</p>
                  <p className="font-mono text-xs text-foreground">{openCitation.table}</p>
                  {openCitation.detail && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{openCitation.detail}</p>
                  )}
                </div>
              </div>
              <Button
                size="sm" variant="outline" className="w-full"
                onClick={() => {
                  void navigator.clipboard?.writeText(openCitation.eventId);
                  toast.success("Event ID copied");
                }}
              >
                Copy event ID
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
