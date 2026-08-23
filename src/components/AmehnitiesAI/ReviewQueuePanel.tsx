/**
 * ReviewQueuePanel — the human-in-the-loop half of the learning system.
 *
 * Low-confidence answers (no citable evidence, strongly negative reward) and
 * repeatedly downvoted answers are batched here. An admin writes one short
 * correction per item; that correction is fed straight back through the reward
 * pipeline, where it is distilled into a durable policy rule and credited to
 * the routing statistics — so the next answer of that class is both corrected
 * and, when the evidence supports it, routed to a stronger model.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClipboardCheck, RefreshCw, ShieldAlert, ThumbsDown, Sparkles, X, Loader2,
  Zap, Scale, Telescope, Gauge,
} from "lucide-react";
import { toast } from "sonner";
import {
  type ReviewItem, dismissReviewItem, listReviewQueue, listRouteStats, resolveReviewItem,
} from "@/lib/amehnitiesAi/chatHistory";

const REASON_LABEL: Record<string, string> = {
  low_confidence: "Low confidence",
  downvoted: "Downvoted",
  user_correction: "User correction",
  repeat_downvotes: "Repeatedly downvoted",
};

const TIER_ICON = { fast: Zap, balanced: Scale, deep: Telescope } as const;

const severityClass = (s: number) =>
  s >= 3
    ? "border-destructive/40 bg-destructive/10 text-destructive"
    : s === 2
      ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : "border-border/60 bg-muted/40 text-muted-foreground";

export function ReviewQueuePanel() {
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [routes, setRoutes] = useState<{ question_class: string; tier: string; avg_reward: number; trials: number }[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [queue, stats] = await Promise.all([listReviewQueue("pending"), listRouteStats()]);
      setItems(queue);
      setRoutes(stats as typeof routes);
    } catch (e: any) {
      setItems([]);
      toast.error("Review queue could not be loaded", { description: e?.message });
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = useCallback(async (item: ReviewItem) => {
    const correction = (drafts[item.id] ?? "").trim();
    if (correction.length < 8) {
      toast.error("Write the correction first", {
        description: "One clear sentence describing what the answer should have done.",
      });
      return;
    }
    setWorking(item.id);
    try {
      const { learned } = await resolveReviewItem(item, correction);
      setItems((cur) => (cur ?? []).filter((x) => x.id !== item.id));
      toast.success(learned ? "Policy re-trained" : "Correction recorded", {
        description: learned ? `New rule (${learned.topic}): ${learned.rule}` : undefined,
      });
      void load();
    } catch (e: any) {
      toast.error("Correction could not be applied", { description: e?.message });
    } finally {
      setWorking(null);
    }
  }, [drafts, load]);

  const dismiss = useCallback(async (item: ReviewItem) => {
    setWorking(item.id);
    try {
      await dismissReviewItem(item.id);
      setItems((cur) => (cur ?? []).filter((x) => x.id !== item.id));
    } catch (e: any) {
      toast.error("Could not dismiss", { description: e?.message });
    } finally {
      setWorking(null);
    }
  }, []);

  const critical = useMemo(() => (items ?? []).filter((i) => i.severity >= 3).length, [items]);

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0 pb-3">
        <ClipboardCheck className="h-4 w-4 text-primary" />
        <CardTitle className="text-sm font-semibold">Answer review queue</CardTitle>
        <Badge variant="outline" className="gap-1 text-[10px]">
          {items?.length ?? 0} pending
        </Badge>
        {critical > 0 && (
          <Badge variant="destructive" className="gap-1 text-[10px]">
            <ShieldAlert className="h-3 w-3" /> {critical} repeat failures
          </Badge>
        )}
        <Button
          size="sm" variant="ghost" className="ml-auto h-7 gap-1 text-[11px]"
          onClick={() => void load()} disabled={refreshing}
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        {!!routes.length && (
          <div className="flex flex-wrap gap-1.5 rounded-xl border border-border/50 bg-muted/30 p-2">
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
              <Gauge className="h-3 w-3" /> Learned routing
            </span>
            {routes.map((r) => {
              const Icon = TIER_ICON[r.tier as keyof typeof TIER_ICON] ?? Scale;
              return (
                <span
                  key={`${r.question_class}-${r.tier}`}
                  title={`${r.trials} rated answers, average reward ${Number(r.avg_reward).toFixed(2)}`}
                  className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2 py-0.5 text-[10px]"
                >
                  <Icon className="h-3 w-3 text-primary" />
                  {r.question_class} → {r.tier}
                  <span className={Number(r.avg_reward) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}>
                    {Number(r.avg_reward) >= 0 ? "+" : ""}{Number(r.avg_reward).toFixed(2)}
                  </span>
                </span>
              );
            })}
          </div>
        )}

        {items === null && <Skeleton className="h-28 w-full rounded-xl" />}

        {items?.length === 0 && (
          <p className="rounded-xl border border-dashed border-border/60 p-6 text-center text-xs text-muted-foreground">
            Nothing to review — no low-confidence or downvoted answers are waiting.
          </p>
        )}

        {!!items?.length && (
          <ScrollArea className="max-h-[560px] pr-2">
            <div className="space-y-3">
              {items.map((item) => {
                const Icon = TIER_ICON[item.tier] ?? Scale;
                return (
                  <div key={item.id} className="space-y-2 rounded-xl border border-border/60 bg-card p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline" className={`text-[10px] ${severityClass(item.severity)}`}>
                        {REASON_LABEL[item.reason] ?? item.reason}
                      </Badge>
                      {item.downvotes > 0 && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <ThumbsDown className="h-3 w-3" /> {item.downvotes}
                        </Badge>
                      )}
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Icon className="h-3 w-3" /> {item.question_class} · {item.tier}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {item.citations} citation{item.citations === 1 ? "" : "s"}
                      </Badge>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                    </div>

                    <p className="text-xs font-semibold text-foreground">{item.question}</p>
                    <p className="max-h-28 overflow-hidden whitespace-pre-wrap rounded-lg bg-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
                      {item.answer.slice(0, 900)}
                    </p>

                    <Textarea
                      rows={2}
                      value={drafts[item.id] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [item.id]: e.target.value }))}
                      placeholder="Correction — what should the assistant have done? e.g. Report programme coverage against the targeted population and state the 95% CI."
                      className="min-h-[52px] resize-none text-xs"
                    />

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm" className="h-7 gap-1 text-[11px]"
                        disabled={working === item.id} onClick={() => void submit(item)}
                      >
                        {working === item.id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <Sparkles className="h-3 w-3" />}
                        Correct &amp; re-train policy
                      </Button>
                      <Button
                        size="sm" variant="ghost" className="h-7 gap-1 text-[11px]"
                        disabled={working === item.id} onClick={() => void dismiss(item)}
                      >
                        <X className="h-3 w-3" /> Dismiss
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export default ReviewQueuePanel;
