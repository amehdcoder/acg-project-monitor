/**
 * Ask Amehnities AI — a grounded chat surface over live application activity.
 *
 * Questions are answered by the `chat-app-data` edge function, which pulls a
 * bounded slice of real database activity plus the live Transformer metrics and
 * streams a Markdown answer back token by token.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, User, SendHorizontal, Loader2, Trash2, Radio } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Telemetry } from "@/hooks/useAmehnitiesBrain";

interface ChatMessage { id: string; role: "user" | "assistant"; content: string }

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export default function AmehnitiesChatBox({
  telemetry, corpusEvents,
}: { telemetry: Telemetry | null; corpusEvents: number }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const feedRef = useRef<HTMLDivElement | null>(null);

  const suggestions = useMemo(() => [
    "Summarize recent submission activity",
    "What are the most common page views?",
    `Explain current loss (${(telemetry?.loss ?? 0).toFixed(3)}) and perplexity (${(telemetry?.perplexity ?? 0).toFixed(1)})`,
    "Show latest audit log events",
  ], [telemetry?.loss, telemetry?.perplexity]);

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const send = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    setInput("");
    const userMsg: ChatMessage = { id: uid(), role: "user", content: question };
    const replyId = uid();
    const history = [...messages, userMsg];
    setMessages([...history, { id: replyId, role: "assistant", content: "" }]);
    setBusy(true);

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
            const delta = JSON.parse(data)?.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta) {
              answer += delta;
              setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, content: answer } : x)));
            }
          } catch { /* partial frame — wait for more bytes */ }
        }
      }

      if (!answer) {
        setMessages((m) => m.map((x) => (x.id === replyId
          ? { ...x, content: "_I could not determine an answer from the available application data._" }
          : x)));
      }
    } catch (e: any) {
      setMessages((m) => m.filter((x) => x.id !== replyId));
      toast.error("Amehnities AI could not answer", { description: e?.message });
    } finally {
      setBusy(false);
    }
  }, [busy, messages, telemetry, corpusEvents]);

  return (
    <Card className="border-border/60 bg-card/80 backdrop-blur">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-4 py-3">
        <div className="grid h-8 w-8 place-items-center rounded-lg border border-primary/30 bg-primary/10">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-tight">Amehnities Data Assistant</h3>
          <p className="text-[11px] text-muted-foreground">Grounded in live application activity — never invented.</p>
        </div>
        <Badge variant="outline" className="ml-auto gap-1.5 border-primary/40 text-primary">
          <Radio className="h-3 w-3" />
          Connected to corpus: {corpusEvents.toLocaleString()} events
        </Badge>
        <Button size="sm" variant="ghost" disabled={busy || !messages.length}
          onClick={() => setMessages([])} className="gap-1.5">
          <Trash2 className="h-3.5 w-3.5" /> Clear chat
        </Button>
      </div>

      <div ref={feedRef} className="max-h-[26rem] min-h-[13rem] space-y-4 overflow-y-auto px-4 py-4">
        {!messages.length && (
          <div className="py-8 text-center">
            <p className="text-sm font-medium">Ask anything about field activity, submissions or app metrics.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Answers use only the live database context and the current model metrics.
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
              : "max-w-[85%] text-sm text-foreground"}>
              {m.role === "assistant" ? (
                m.content ? (
                  <div className="space-y-2 leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{m.content}</ReactMarkdown>
                  </div>
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
        <div className="mb-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button key={s} type="button" disabled={busy} onClick={() => send(s)}
              className="rounded-full border border-border/70 bg-background/60 px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50">
              {s}
            </button>
          ))}
        </div>
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); }
            }}
            rows={2}
            placeholder="Ask a question about field activity, submissions, or app metrics..."
            className="min-h-[52px] resize-none text-sm"
          />
          <Button size="icon" disabled={busy || !input.trim()} onClick={() => send(input)} aria-label="Send message">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">Enter to send · Shift + Enter for a new line</p>
      </div>
    </Card>
  );
}
