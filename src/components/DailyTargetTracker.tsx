import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Target, CheckCircle, AlertTriangle, Trophy, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format, startOfDay, endOfDay } from "date-fns";

interface TargetProgress {
  formId: string;
  formName: string;
  dailyTarget: number;
  submissionsToday: number;
  progressPercent: number;
}

const DailyTargetTracker = () => {
  const { user } = useAuth();
  const [targets, setTargets] = useState<TargetProgress[]>([]);
  const [showDialog, setShowDialog] = useState(false);
  const [hasTargets, setHasTargets] = useState(false);

  const fetchTargets = useCallback(async () => {
    if (!user?.id) return;

    try {
      // Get active targets for this user
      const { data: userTargets } = await supabase
        .from("form_daily_targets")
        .select("form_id, daily_target")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (!userTargets || userTargets.length === 0) {
        setHasTargets(false);
        return;
      }

      setHasTargets(true);
      const formIds = userTargets.map((t: any) => t.form_id);

      // Get form names
      const { data: forms } = await supabase
        .from("forms")
        .select("id, name")
        .in("id", formIds);

      const formMap: Record<string, string> = {};
      (forms || []).forEach((f: any) => { formMap[f.id] = f.name; });

      // Get today's submission counts per form
      const todayStart = startOfDay(new Date()).toISOString();
      const todayEnd = endOfDay(new Date()).toISOString();

      const { data: submissions } = await supabase
        .from("form_submissions")
        .select("form_id")
        .eq("user_id", user.id)
        .in("form_id", formIds)
        .eq("status", "sent")
        .gte("submitted_at", todayStart)
        .lte("submitted_at", todayEnd);

      // Count per form
      const countMap: Record<string, number> = {};
      (submissions || []).forEach((s: any) => {
        countMap[s.form_id] = (countMap[s.form_id] || 0) + 1;
      });

      const progress: TargetProgress[] = userTargets.map((t: any) => {
        const subs = countMap[t.form_id] || 0;
        return {
          formId: t.form_id,
          formName: formMap[t.form_id] || "Unknown Form",
          dailyTarget: t.daily_target,
          submissionsToday: subs,
          progressPercent: Math.min(Math.round((subs / t.daily_target) * 100), 100),
        };
      });

      setTargets(progress);

      // Check if we should show dialog (any unmet target)
      const hasUnmet = progress.some(p => p.progressPercent < 100);
      const shownKey = `target_shown_${format(new Date(), "yyyy-MM-dd")}`;
      const alreadyShown = localStorage.getItem(shownKey);
      if (hasUnmet && !alreadyShown) {
        setShowDialog(true);
        localStorage.setItem(shownKey, "1");
      }
    } catch (e) {
      console.error("Failed to fetch daily targets:", e);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchTargets();
    // Refresh every 2 minutes
    const interval = setInterval(fetchTargets, 120000);
    return () => clearInterval(interval);
  }, [fetchTargets]);

  if (!hasTargets) return null;

  const totalTarget = targets.reduce((s, t) => s + t.dailyTarget, 0);
  const totalDone = targets.reduce((s, t) => s + t.submissionsToday, 0);
  const overallPercent = totalTarget > 0 ? Math.min(Math.round((totalDone / totalTarget) * 100), 100) : 0;
  const allComplete = targets.every(t => t.progressPercent >= 100);

  return (
    <>
      {/* Compact widget for dashboard */}
      <Card
        className="border-0 shadow-card cursor-pointer hover:shadow-lg transition-shadow"
        onClick={() => setShowDialog(true)}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${allComplete ? "bg-green-500/10" : "bg-primary/10"}`}>
              {allComplete ? (
                <Trophy className="h-5 w-5 text-green-600" />
              ) : (
                <Target className="h-5 w-5 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Today's Targets</p>
                <Badge variant={allComplete ? "default" : "secondary"} className="text-xs">
                  {totalDone}/{totalTarget}
                </Badge>
              </div>
              <Progress value={overallPercent} className="h-2 mt-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {allComplete
                  ? "🎉 All targets complete!"
                  : `${overallPercent}% — ${totalTarget - totalDone} more to go`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 font-display">
              <Target className="h-5 w-5 text-primary" />
              Daily Target Progress
            </DialogTitle>
          </DialogHeader>

          <div className="text-center py-3">
            <p className="text-3xl font-bold text-foreground">{overallPercent}%</p>
            <p className="text-sm text-muted-foreground mt-1">
              {totalDone} of {totalTarget} submissions today
            </p>
            <Progress value={overallPercent} className="h-3 mt-3" />
          </div>

          <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
            {targets.map(t => (
              <div
                key={t.formId}
                className="flex items-center gap-3 rounded-lg border border-border/50 p-3"
              >
                {t.progressPercent >= 100 ? (
                  <CheckCircle className="h-5 w-5 text-green-600 shrink-0" />
                ) : t.progressPercent >= 50 ? (
                  <TrendingUp className="h-5 w-5 text-amber-500 shrink-0" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{t.formName}</p>
                  <Progress value={t.progressPercent} className="h-1.5 mt-1.5" />
                </div>
                <div className="text-right shrink-0">
                  <span className="text-sm font-mono font-semibold">
                    {t.submissionsToday}/{t.dailyTarget}
                  </span>
                  <p className="text-[10px] text-muted-foreground">
                    {t.progressPercent >= 100 ? "Done!" : `${t.dailyTarget - t.submissionsToday} left`}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {allComplete && (
            <div className="text-center py-3 rounded-lg bg-green-500/10 border border-green-500/20">
              <Trophy className="h-8 w-8 text-green-600 mx-auto mb-1" />
              <p className="text-sm font-semibold text-green-700">Great job! All targets met!</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DailyTargetTracker;
