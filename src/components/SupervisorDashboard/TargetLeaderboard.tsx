import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Trophy,
  Flame,
  Medal,
  Star,
  Crown,
  Zap,
  Target,
  Award,
  Loader2,
  TrendingUp,
  Shield,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  format,
  subDays,
  startOfDay,
  endOfDay,
  eachDayOfInterval,
} from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

// Badge definitions
interface BadgeDef {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  check: (stats: UserStats) => boolean;
}

interface UserStats {
  userId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  totalTarget: number;
  totalSubmitted: number;
  completionRate: number;
  currentStreak: number;
  longestStreak: number;
  perfectDays: number;
  totalDaysTracked: number;
  badges: BadgeDef[];
  xp: number;
  level: number;
}

const BADGE_DEFS: BadgeDef[] = [
  {
    id: "first_blood",
    name: "First Blood",
    description: "Met daily target at least once",
    icon: <Zap className="h-3.5 w-3.5" />,
    color: "from-amber-400 to-orange-500",
    check: (s) => s.perfectDays >= 1,
  },
  {
    id: "streak_3",
    name: "On Fire",
    description: "3-day target streak",
    icon: <Flame className="h-3.5 w-3.5" />,
    color: "from-orange-500 to-red-500",
    check: (s) => s.longestStreak >= 3,
  },
  {
    id: "streak_7",
    name: "Unstoppable",
    description: "7-day target streak",
    icon: <Flame className="h-3.5 w-3.5" />,
    color: "from-red-500 to-pink-600",
    check: (s) => s.longestStreak >= 7,
  },
  {
    id: "streak_14",
    name: "Legend",
    description: "14-day target streak",
    icon: <Crown className="h-3.5 w-3.5" />,
    color: "from-purple-500 to-indigo-600",
    check: (s) => s.longestStreak >= 14,
  },
  {
    id: "perfect_5",
    name: "High Five",
    description: "5 perfect days",
    icon: <Star className="h-3.5 w-3.5" />,
    color: "from-blue-500 to-cyan-500",
    check: (s) => s.perfectDays >= 5,
  },
  {
    id: "perfect_20",
    name: "Elite",
    description: "20 perfect days",
    icon: <Shield className="h-3.5 w-3.5" />,
    color: "from-emerald-500 to-teal-600",
    check: (s) => s.perfectDays >= 20,
  },
  {
    id: "overachiever",
    name: "Overachiever",
    description: "120%+ completion rate",
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    color: "from-yellow-400 to-amber-500",
    check: (s) => s.completionRate >= 120,
  },
  {
    id: "consistent",
    name: "Consistent",
    description: "80%+ rate over 10+ days",
    icon: <Target className="h-3.5 w-3.5" />,
    color: "from-green-500 to-emerald-600",
    check: (s) => s.completionRate >= 80 && s.totalDaysTracked >= 10,
  },
];

const RANK_ICONS = [
  <Crown className="h-5 w-5 text-yellow-500" />,
  <Medal className="h-5 w-5 text-gray-400" />,
  <Medal className="h-5 w-5 text-amber-700" />,
];

const calcLevel = (xp: number) => Math.floor(xp / 100) + 1;
const calcXpForLevel = (level: number) => (level - 1) * 100;
const calcXpProgress = (xp: number) => xp % 100;

const TargetLeaderboard = () => {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserStats[]>([]);
  const [lookback, setLookback] = useState<"7" | "30" | "all">("30");

  const fetchLeaderboard = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);

    try {
      // Get all active targets
      const { data: targets } = await supabase
        .from("form_daily_targets")
        .select("user_id, form_id, daily_target")
        .eq("is_active", true);

      if (!targets || targets.length === 0) {
        setUsers([]);
        setLoading(false);
        return;
      }

      const userIds = [...new Set(targets.map((t: any) => t.user_id))];
      const formIds = [...new Set(targets.map((t: any) => t.form_id))];

      // Aggregate daily target per user
      const userTargetMap: Record<string, number> = {};
      targets.forEach((t: any) => {
        userTargetMap[t.user_id] = (userTargetMap[t.user_id] || 0) + t.daily_target;
      });

      // Get profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, avatar_url")
        .in("user_id", userIds);

      const profileMap: Record<string, any> = {};
      (profiles || []).forEach((p: any) => {
        profileMap[p.user_id] = p;
      });

      // Date range
      const daysBack = lookback === "7" ? 7 : lookback === "30" ? 30 : 90;
      const fromDate = startOfDay(subDays(new Date(), daysBack));
      const toDate = endOfDay(new Date());

      // Get submissions
      const { data: submissions } = await supabase
        .from("form_submissions")
        .select("user_id, form_id, submitted_at")
        .in("user_id", userIds)
        .in("form_id", formIds)
        .eq("status", "sent")
        .gte("submitted_at", fromDate.toISOString())
        .lte("submitted_at", toDate.toISOString());

      // Count per user per day
      const userDayCounts: Record<string, Record<string, number>> = {};
      (submissions || []).forEach((s: any) => {
        const dayKey = format(new Date(s.submitted_at), "yyyy-MM-dd");
        if (!userDayCounts[s.user_id]) userDayCounts[s.user_id] = {};
        userDayCounts[s.user_id][dayKey] = (userDayCounts[s.user_id][dayKey] || 0) + 1;
      });

      const days = eachDayOfInterval({ start: fromDate, end: toDate > new Date() ? new Date() : toDate });

      const stats: UserStats[] = userIds.map((uid) => {
        const dailyTarget = userTargetMap[uid] || 0;
        const profile = profileMap[uid] || { first_name: "Unknown", last_name: "", avatar_url: null };
        const dayCounts = userDayCounts[uid] || {};

        let totalSubmitted = 0;
        let perfectDays = 0;
        let currentStreak = 0;
        let longestStreak = 0;
        let tempStreak = 0;

        // Walk days in order
        for (let i = 0; i < days.length; i++) {
          const dayKey = format(days[i], "yyyy-MM-dd");
          const count = dayCounts[dayKey] || 0;
          totalSubmitted += count;

          if (count >= dailyTarget && dailyTarget > 0) {
            perfectDays++;
            tempStreak++;
            if (tempStreak > longestStreak) longestStreak = tempStreak;
          } else {
            tempStreak = 0;
          }
        }
        currentStreak = tempStreak;

        const totalTarget = dailyTarget * days.length;
        const completionRate = totalTarget > 0 ? Math.round((totalSubmitted / totalTarget) * 100) : 0;

        // XP system: 10xp per submission, 25xp bonus per perfect day, 50xp per streak day beyond 3
        let xp = totalSubmitted * 10 + perfectDays * 25;
        if (longestStreak >= 3) xp += (longestStreak - 2) * 50;
        if (currentStreak >= 3) xp += 100; // active streak bonus

        const level = calcLevel(xp);

        const earned = BADGE_DEFS.filter((b) =>
          b.check({
            userId: uid,
            firstName: profile.first_name,
            lastName: profile.last_name,
            avatarUrl: profile.avatar_url,
            totalTarget,
            totalSubmitted,
            completionRate,
            currentStreak,
            longestStreak,
            perfectDays,
            totalDaysTracked: days.length,
            badges: [],
            xp,
            level,
          })
        );

        return {
          userId: uid,
          firstName: profile.first_name,
          lastName: profile.last_name,
          avatarUrl: profile.avatar_url,
          totalTarget,
          totalSubmitted,
          completionRate,
          currentStreak,
          longestStreak,
          perfectDays,
          totalDaysTracked: days.length,
          badges: earned,
          xp,
          level,
        };
      });

      stats.sort((a, b) => b.xp - a.xp);
      setUsers(stats);
    } catch (e) {
      console.error("Leaderboard fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, lookback]);

  useEffect(() => {
    fetchLeaderboard();
  }, [fetchLeaderboard]);

  if (!isAdmin) return null;

  return (
    <Card className="border-0 shadow-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-gradient-to-br from-yellow-400/20 to-amber-500/20 p-2">
              <Trophy className="h-4 w-4 text-yellow-600" />
            </div>
            <div>
              <CardTitle className="font-display text-lg">Leaderboard</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ranked by XP · {users.length} users
              </p>
            </div>
          </div>
          <Tabs value={lookback} onValueChange={(v) => setLookback(v as any)}>
            <TabsList className="h-8">
              <TabsTrigger value="7" className="text-xs px-2.5 h-6">7d</TabsTrigger>
              <TabsTrigger value="30" className="text-xs px-2.5 h-6">30d</TabsTrigger>
              <TabsTrigger value="all" className="text-xs px-2.5 h-6">90d</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12">
            <Trophy className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No active targets to rank.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[500px] pr-1">
            <div className="space-y-2">
              <AnimatePresence>
                {users.map((u, idx) => (
                  <motion.div
                    key={u.userId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className={`relative rounded-xl border p-3 transition-colors hover:bg-muted/30 ${
                      idx === 0
                        ? "border-yellow-400/40 bg-gradient-to-r from-yellow-50/50 to-transparent dark:from-yellow-900/10"
                        : idx === 1
                        ? "border-gray-300/40 bg-gradient-to-r from-gray-50/50 to-transparent dark:from-gray-800/10"
                        : idx === 2
                        ? "border-amber-600/30 bg-gradient-to-r from-amber-50/40 to-transparent dark:from-amber-900/10"
                        : "border-border/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Rank */}
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                        {idx < 3 ? (
                          RANK_ICONS[idx]
                        ) : (
                          <span className="text-sm font-bold text-muted-foreground">
                            {idx + 1}
                          </span>
                        )}
                      </div>

                      {/* Avatar */}
                      <div className="relative shrink-0">
                        {u.avatarUrl ? (
                          <img
                            src={u.avatarUrl}
                            alt=""
                            className="h-9 w-9 rounded-full object-cover border-2 border-border"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border-2 border-border">
                            <span className="text-xs font-bold text-primary">
                              {u.firstName.charAt(0)}{u.lastName.charAt(0)}
                            </span>
                          </div>
                        )}
                        {/* Level badge */}
                        <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                          <span className="text-[8px] font-bold text-primary-foreground">
                            {u.level}
                          </span>
                        </div>
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold truncate">
                            {u.firstName} {u.lastName}
                          </p>
                          {u.currentStreak >= 3 && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 h-4 bg-orange-500/10 text-orange-600 border-orange-500/30 gap-0.5"
                            >
                              <Flame className="h-2.5 w-2.5" />
                              {u.currentStreak}d
                            </Badge>
                          )}
                        </div>

                        {/* XP bar */}
                        <div className="flex items-center gap-2 mt-1">
                          <Progress
                            value={calcXpProgress(u.xp)}
                            className="h-1.5 flex-1"
                          />
                          <span className="text-[10px] font-mono text-muted-foreground w-14 text-right">
                            {u.xp} XP
                          </span>
                        </div>

                        {/* Badges */}
                        {u.badges.length > 0 && (
                          <TooltipProvider>
                            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                              {u.badges.map((b) => (
                                <Tooltip key={b.id}>
                                  <TooltipTrigger asChild>
                                    <div
                                      className={`inline-flex items-center justify-center h-5 w-5 rounded-full bg-gradient-to-br ${b.color} text-white shadow-sm cursor-help`}
                                    >
                                      {b.icon}
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="bottom" className="text-xs">
                                    <p className="font-semibold">{b.name}</p>
                                    <p className="text-muted-foreground">{b.description}</p>
                                  </TooltipContent>
                                </Tooltip>
                              ))}
                            </div>
                          </TooltipProvider>
                        )}
                      </div>

                      {/* Stats */}
                      <div className="text-right shrink-0 space-y-0.5">
                        <div className="flex items-center gap-1 justify-end">
                          <Award className="h-3 w-3 text-acg-gold" />
                          <span className="text-xs font-semibold">
                            {u.completionRate}%
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          {u.totalSubmitted}/{u.totalTarget}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          🔥 Best: {u.longestStreak}d
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
};

export default TargetLeaderboard;
