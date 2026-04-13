import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Trophy, Target, TrendingUp, TrendingDown, Medal } from "lucide-react";
import { UserStatus } from "@/hooks/useSupervisorDashboard";

interface Props {
  users: UserStatus[];
  weeklyTarget?: number;
}

const WEEKLY_TARGET_DEFAULT = 25; // submissions per week per user

const TeamPerformanceScorecard = ({ users, weeklyTarget = WEEKLY_TARGET_DEFAULT }: Props) => {
  const fieldWorkers = useMemo(
    () => users.filter(u => u.assigned_forms.length > 0 && u.is_active),
    [users]
  );

  const scorecards = useMemo(() => {
    return fieldWorkers
      .map(worker => {
        const dailyTarget = Math.ceil(weeklyTarget / 5); // 5 working days
        const progressPercent = dailyTarget > 0
          ? Math.min(Math.round((worker.submissions_today / dailyTarget) * 100), 150)
          : 0;
        const totalProgress = weeklyTarget > 0
          ? Math.min(Math.round((worker.submissions_total / weeklyTarget) * 100), 150)
          : 0;

        let grade: "A" | "B" | "C" | "D" | "F";
        if (totalProgress >= 100) grade = "A";
        else if (totalProgress >= 75) grade = "B";
        else if (totalProgress >= 50) grade = "C";
        else if (totalProgress >= 25) grade = "D";
        else grade = "F";

        return {
          ...worker,
          dailyTarget,
          progressPercent,
          totalProgress,
          grade,
        };
      })
      .sort((a, b) => b.totalProgress - a.totalProgress);
  }, [fieldWorkers, weeklyTarget]);

  const teamStats = useMemo(() => {
    if (scorecards.length === 0) return null;
    const avgProgress = Math.round(scorecards.reduce((s, c) => s + c.totalProgress, 0) / scorecards.length);
    const onTrack = scorecards.filter(c => c.totalProgress >= 80).length;
    const belowTarget = scorecards.filter(c => c.totalProgress < 50).length;
    const topPerformer = scorecards[0];
    return { avgProgress, onTrack, belowTarget, topPerformer };
  }, [scorecards]);

  const GRADE_COLORS: Record<string, string> = {
    A: "bg-green-500/15 text-green-700 border-green-500/30",
    B: "bg-blue-500/15 text-blue-700 border-blue-500/30",
    C: "bg-amber-500/15 text-amber-700 border-amber-500/30",
    D: "bg-orange-500/15 text-orange-700 border-orange-500/30",
    F: "bg-destructive/15 text-destructive border-destructive/30",
  };

  if (scorecards.length === 0) {
    return null;
  }

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-acg-gold/10 p-2">
              <Trophy className="h-4 w-4 text-acg-gold" />
            </div>
            <div>
              <CardTitle className="font-display text-lg">Team Performance</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Weekly target: {weeklyTarget} submissions/person
              </p>
            </div>
          </div>
          {teamStats && (
            <div className="flex items-center gap-3 text-xs">
              <div className="text-center">
                <p className="font-bold text-lg text-foreground">{teamStats.avgProgress}%</p>
                <p className="text-muted-foreground">Avg Progress</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-lg text-green-600">{teamStats.onTrack}</p>
                <p className="text-muted-foreground">On Track</p>
              </div>
              <div className="text-center">
                <p className="font-bold text-lg text-destructive">{teamStats.belowTarget}</p>
                <p className="text-muted-foreground">Below 50%</p>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {scorecards.slice(0, 15).map((card, index) => (
            <div
              key={card.user_id}
              className="flex items-center gap-3 rounded-lg border border-border/50 p-3 hover:bg-muted/30 transition-colors"
            >
              {/* Rank */}
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                {index === 0 ? (
                  <Medal className="h-4 w-4 text-acg-gold" />
                ) : (
                  index + 1
                )}
              </div>

              {/* Name & designation */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium truncate">
                    {card.first_name} {card.last_name}
                  </p>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 ${GRADE_COLORS[card.grade]}`}>
                    {card.grade}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <Progress
                    value={Math.min(card.totalProgress, 100)}
                    className="h-1.5 flex-1"
                  />
                  <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">
                    {card.totalProgress}%
                  </span>
                </div>
              </div>

              {/* Today's progress */}
              <div className="text-right shrink-0">
                <div className="flex items-center gap-1 text-xs">
                  {card.submissions_today >= card.dailyTarget ? (
                    <TrendingUp className="h-3 w-3 text-green-600" />
                  ) : (
                    <TrendingDown className="h-3 w-3 text-muted-foreground" />
                  )}
                  <span className="font-mono font-semibold">
                    {card.submissions_today}/{card.dailyTarget}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">today</p>
              </div>

              {/* Compliance */}
              <div className="text-right shrink-0 hidden sm:block">
                {card.geofence_compliance !== null ? (
                  <>
                    <span className={`text-xs font-mono ${
                      card.geofence_compliance >= 90 ? "text-green-600" :
                      card.geofence_compliance >= 70 ? "text-amber-600" : "text-destructive"
                    }`}>
                      {card.geofence_compliance}%
                    </span>
                    <p className="text-[10px] text-muted-foreground">geofence</p>
                  </>
                ) : (
                  <span className="text-[10px] text-muted-foreground">N/A</span>
                )}
              </div>
            </div>
          ))}
        </div>
        {scorecards.length > 15 && (
          <p className="text-xs text-muted-foreground text-center mt-2">
            Showing top 15 of {scorecards.length} team members
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default TeamPerformanceScorecard;
