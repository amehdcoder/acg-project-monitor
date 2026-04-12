import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, RefreshCw, Copy, Check } from "lucide-react";
import { UserStatus, DailyActivitySummary, ProjectSummary } from "@/hooks/useSupervisorDashboard";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  users: UserStatus[];
  dailySummary: DailyActivitySummary | null;
  projectSummaries: ProjectSummary[];
}

/** Strip any residual markdown symbols from AI output */
const cleanBriefingText = (text: string): string => {
  return text
    .replace(/#{1,6}\s?/g, "")       // remove # headers
    .replace(/\*\*([^*]+)\*\*/g, "$1") // remove **bold**
    .replace(/\*([^*]+)\*/g, "$1")     // remove *italic*
    .replace(/__([^_]+)__/g, "$1")     // remove __bold__
    .replace(/_([^_]+)_/g, "$1")       // remove _italic_
    .replace(/`([^`]+)`/g, "$1");      // remove `code`
};

const DailyBriefing = ({ users, dailySummary, projectSummaries }: Props) => {
  const [briefing, setBriefing] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateBriefing = useCallback(async () => {
    setIsGenerating(true);
    try {
      // Try Google Gemini AI via edge function first
      const summaryData = {
        date: new Date().toISOString(),
        totalUsers: users.length,
        activeUsers: users.filter(u => u.status !== "offline").length,
        fieldWorkers: users.filter(u => u.assigned_forms.length > 0 && u.is_active).length,
        totalSubmissions: dailySummary?.total_submissions || 0,
        geofenceCompliance: dailySummary?.geofence_compliance_avg || 100,
        zeroSubmissionWorkers: users.filter(u => u.assigned_forms.length > 0 && u.is_active && u.submissions_today === 0).length,
        topPerformers: dailySummary?.top_performers?.slice(0, 5) || [],
        projects: projectSummaries.map(p => ({
          name: p.project_name,
          submissions: p.submissions_today,
          activeUsers: p.active_today,
          totalUsers: p.total_users,
          compliance: p.compliance_rate,
        })),
      };

      const { data, error } = await supabase.functions.invoke("daily-briefing", {
        body: { summaryData },
      });

      if (!error && data?.briefing && !data?.fallback) {
        setBriefing(cleanBriefingText(data.briefing));
        toast({ title: "AI Briefing Generated", description: "Powered by Google Gemini AI." });
      } else {
        console.warn("Gemini briefing unavailable, using local:", error || data?.error);
        setBriefing(generateLocalBriefing());
        toast({ title: "Briefing Generated", description: "Using local analysis." });
      }
    } catch (err: any) {
      console.error("Briefing generation error:", err);
      // Fallback to local briefing
      setBriefing(generateLocalBriefing());
      toast({ title: "Briefing Generated", description: "Using local analysis (AI unavailable)." });
    } finally {
      setIsGenerating(false);
    }
  }, [users, dailySummary, projectSummaries]);

  const generateLocalBriefing = () => {
    const activeUsers = users.filter(u => u.status !== "offline").length;
    const fieldWorkers = users.filter(u => u.assigned_forms.length > 0 && u.is_active);
    const totalSubs = dailySummary?.total_submissions || 0;
    const compliance = dailySummary?.geofence_compliance_avg || 100;
    const zeroSubs = fieldWorkers.filter(u => u.submissions_today === 0).length;
    const date = new Date().toLocaleDateString("en-NG", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

    let brief = `📋 **Daily Briefing — ${date}**\n\n`;
    brief += `**Team Status:** ${activeUsers} of ${users.length} users currently active. ${fieldWorkers.length} field workers deployed.\n\n`;
    brief += `**Submissions:** ${totalSubs} total submissions today. `;
    if (zeroSubs > 0) {
      brief += `⚠️ ${zeroSubs} field worker(s) have zero submissions.\n\n`;
    } else {
      brief += `✅ All field workers have submitted data.\n\n`;
    }
    brief += `**Geofence Compliance:** ${compliance}% average. `;
    if (compliance >= 90) brief += "✅ Excellent compliance across the team.\n\n";
    else if (compliance >= 70) brief += "⚠️ Some workers need monitoring.\n\n";
    else brief += "🚨 Critical — immediate attention required.\n\n";

    if (dailySummary?.top_performers && dailySummary.top_performers.length > 0) {
      brief += `**Top Performers:** `;
      brief += dailySummary.top_performers.slice(0, 3).map(p => `${p.name} (${p.count})`).join(", ");
      brief += "\n\n";
    }

    if (projectSummaries.length > 0) {
      brief += `**Projects:**\n`;
      projectSummaries.forEach(p => {
        brief += `• ${p.project_name}: ${p.submissions_today} subs, ${p.active_today}/${p.total_users} active, ${p.compliance_rate}% compliance\n`;
      });
    }

    return brief;
  };

  const handleCopy = async () => {
    if (!briefing) return;
    await navigator.clipboard.writeText(briefing);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Copied", description: "Briefing copied to clipboard" });
  };

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-violet-500/10 p-2">
              <Sparkles className="h-4 w-4 text-violet-600" />
            </div>
            <div>
              <CardTitle className="font-display text-lg">Daily Briefing</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Auto-generated summary</p>
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
              {isGenerating ? "Generating..." : briefing ? "Refresh" : "Generate"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {briefing ? (
          <div className="rounded-lg bg-muted/40 p-4 text-sm leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-y-auto">
            {cleanBriefingText(briefing)}
          </div>
        ) : (
          <div className="text-center py-8">
            <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              Generate a summary of today's team activity, performance, and areas needing attention.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default DailyBriefing;
