import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sparkles, Loader2, RefreshCw, Copy, Check, ThumbsUp, ThumbsDown, Cpu, TrendingUp } from "lucide-react";
import { UserStatus, DailyActivitySummary, ProjectSummary } from "@/hooks/useSupervisorDashboard";
import { toast } from "@/hooks/use-toast";
import {
  generateSmartBriefing,
  recordBriefingFeedback,
  getBriefingWeights,
  getCategoryFeedback,
  type BriefingInsight,
} from "@/lib/briefingEngine";

interface Props {
  users: UserStatus[];
  dailySummary: DailyActivitySummary | null;
  projectSummaries: ProjectSummary[];
  /** Optional scope label, e.g. selected project name. */
  scopeLabel?: string;
  scopeProjectIds?: string[];
}

const CATEGORY_LABELS: Record<string, string> = {
  coverage: "Coverage",
  inactivity: "Inactivity",
  geofence: "Geofence",
  throughput: "Throughput",
  anomaly: "Anomaly",
  momentum: "Momentum",
};

const DailyBriefing = ({ users, dailySummary, projectSummaries, scopeLabel, scopeProjectIds }: Props) => {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [insights, setInsights] = useState<BriefingInsight[]>([]);
  const [riskLevel, setRiskLevel] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<null | "up" | "down">(null);
  // Per-insight feedback state + live learned weights for showing prioritization.
  const [insightFeedback, setInsightFeedback] = useState<Record<number, "up" | "down">>({});
  const [weights, setWeights] = useState<Record<string, number>>(() => getBriefingWeights());

  const generateBriefing = useCallback(() => {
    setIsGenerating(true);
    setFeedbackGiven(null);
    setInsightFeedback({});
    // Local, adaptive, credit-free engine. Tiny timeout keeps the UI honest
    // about "working" without blocking the main thread perceptibly.
    setTimeout(() => {
      try {
        const result = generateSmartBriefing({
          users,
          dailySummary,
          projectSummaries,
          scope: { label: scopeLabel, projectIds: scopeProjectIds },
        });
        setBriefing(result.text);
        setInsights(result.insights);
        setRiskLevel(result.riskLevel);
        setWeights(result.weights);
        toast({
          title: "Briefing Ready",
          description: "Generated on-device — no AI credits used.",
        });
      } catch (err) {
        console.error("Briefing generation error:", err);
        toast({ title: "Could not generate briefing", description: "Please try again.", variant: "destructive" });
      } finally {
        setIsGenerating(false);
      }
    }, 250);
  }, [users, dailySummary, projectSummaries, scopeLabel, scopeProjectIds]);

  const handleFeedback = (helpful: boolean) => {
    // Reward/penalise the insight categories so future briefs adapt to this team.
    recordBriefingFeedback(["coverage", "geofence", "anomaly", "inactivity", "momentum", "throughput"], helpful);
    setFeedbackGiven(helpful ? "up" : "down");
    setWeights(getBriefingWeights());
    toast({
      title: "Thanks for the feedback",
      description: helpful ? "The engine will keep prioritising these insights." : "The engine will re-balance future briefs.",
    });
  };

  const handleInsightFeedback = (index: number, cat: BriefingInsight["cat"], helpful: boolean) => {
    recordBriefingFeedback([cat], helpful);
    setInsightFeedback((prev) => ({ ...prev, [index]: helpful ? "up" : "down" }));
    const next = getBriefingWeights();
    setWeights(next);
    toast({
      title: helpful ? "Prioritised" : "De-prioritised",
      description: `${CATEGORY_LABELS[cat] ?? cat} priority is now ${next[cat].toFixed(2)}×.`,
    });
  };

  const handleCopy = async () => {
    if (!briefing) return;
    await navigator.clipboard.writeText(briefing);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied", description: "Briefing copied to clipboard" });
  };

  const riskColor =
    riskLevel === "critical" ? "text-red-600" :
    riskLevel === "high" ? "text-orange-600" :
    riskLevel === "moderate" ? "text-amber-600" : "text-emerald-600";

  // Rank categories by learned weight for the "updated prioritization" view.
  const rankedWeights = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  const maxWeight = Math.max(1, ...rankedWeights.map(([, v]) => v));

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-violet-500/10 p-2">
              <Cpu className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <CardTitle className="font-display text-lg">Daily Briefing</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Adaptive on-device engine · no AI credits</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {briefing && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={generateBriefing}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : briefing ? (
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              {isGenerating ? "Analyzing..." : briefing ? "Refresh" : "Generate"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {briefing ? (
          <>
            <div className="rounded-lg bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto">
              {briefing}
            </div>

            {/* Per-insight feedback */}
            {insights.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Rate individual insights
                </p>
                {insights.map((ins, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 rounded-lg border bg-card p-2.5"
                  >
                    <span className="mt-0.5 shrink-0 rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-violet-600">
                      {CATEGORY_LABELS[ins.cat] ?? ins.cat}
                    </span>
                    <p className="flex-1 text-xs leading-snug text-foreground/90">{ins.text}</p>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant={insightFeedback[i] === "up" ? "default" : "ghost"}
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleInsightFeedback(i, ins.cat, true)}
                        disabled={insightFeedback[i] !== undefined}
                      >
                        <ThumbsUp className="h-3 w-3" />
                      </Button>
                      <Button
                        variant={insightFeedback[i] === "down" ? "default" : "ghost"}
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleInsightFeedback(i, ins.cat, false)}
                        disabled={insightFeedback[i] !== undefined}
                      >
                        <ThumbsDown className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Updated prioritization view */}
            <div className="mt-4 rounded-lg border bg-muted/30 p-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" /> Learned prioritization
              </p>
              <div className="space-y-1.5">
                {rankedWeights.map(([cat, w]) => (
                  <div key={cat} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-[11px] text-muted-foreground">
                      {CATEGORY_LABELS[cat] ?? cat}
                    </span>
                    <Progress value={(w / maxWeight) * 100} className="h-1.5 flex-1" />
                    <span className="w-9 shrink-0 text-right text-[11px] font-medium tabular-nums">
                      {w.toFixed(2)}×
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between">
              {riskLevel && (
                <span className={`text-xs font-medium ${riskColor}`}>
                  Risk level: {riskLevel.toUpperCase()}
                </span>
              )}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground mr-1">Was this useful?</span>
                <Button
                  variant={feedbackGiven === "up" ? "default" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleFeedback(true)}
                  disabled={feedbackGiven !== null}
                >
                  <ThumbsUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant={feedbackGiven === "down" ? "default" : "ghost"}
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleFeedback(false)}
                  disabled={feedbackGiven !== null}
                >
                  <ThumbsDown className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <Cpu className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              Generate a precise, role- and project-aware summary of today's data collection activity.
              Runs entirely on-device with statistical models and an adaptive learning loop — no AI credits required.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DailyBriefing;
