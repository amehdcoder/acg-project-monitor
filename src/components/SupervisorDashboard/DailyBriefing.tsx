import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, RefreshCw, Copy, Check, ThumbsUp, ThumbsDown, Cpu } from "lucide-react";
import { UserStatus, DailyActivitySummary, ProjectSummary } from "@/hooks/useSupervisorDashboard";
import { toast } from "@/hooks/use-toast";
import { generateSmartBriefing, recordBriefingFeedback } from "@/lib/briefingEngine";

interface Props {
  users: UserStatus[];
  dailySummary: DailyActivitySummary | null;
  projectSummaries: ProjectSummary[];
  /** Optional scope label, e.g. selected project name. */
  scopeLabel?: string;
  scopeProjectIds?: string[];
}

const DailyBriefing = ({ users, dailySummary, projectSummaries, scopeLabel, scopeProjectIds }: Props) => {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [riskLevel, setRiskLevel] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [feedbackGiven, setFeedbackGiven] = useState<null | "up" | "down">(null);

  const generateBriefing = useCallback(() => {
    setIsGenerating(true);
    setFeedbackGiven(null);
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
        setRiskLevel(result.riskLevel);
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
    toast({
      title: "Thanks for the feedback",
      description: helpful ? "The engine will keep prioritising these insights." : "The engine will re-balance future briefs.",
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
