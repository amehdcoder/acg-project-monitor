import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import TablePagination from "@/components/ui/table-pagination";
import { useTablePagination } from "@/hooks/useTablePagination";
import {
  ArrowLeft, Users, TrendingUp, TrendingDown, BarChart3, Award, CheckCircle, XCircle,
  BookOpen, Target, Percent, Activity, Brain, Lightbulb, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, AreaChart, Area, ScatterChart, Scatter, ZAxis,
} from "recharts";

interface QuizAnalyticsProps {
  quiz: {
    id: string;
    title: string;
    passing_score: number;
  };
  onBack: () => void;
}

interface Attempt {
  id: string;
  user_id: string;
  attempt_type: string;
  score: number;
  total_points: number;
  percentage: number;
  completed_at: string;
}

// ───── Statistical helpers ─────
function mean(arr: number[]) { return arr.reduce((s, v) => s + v, 0) / arr.length; }
function variance(arr: number[]) { const m = mean(arr); return arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1); }
function stdDev(arr: number[]) { return Math.sqrt(variance(arr)); }
function median(arr: number[]) {
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function pairedTTest(pre: number[], post: number[]) {
  const n = pre.length;
  if (n < 2) return { t: 0, p: 1, df: 0, significant: false, method: "paired t-test" };
  const diffs = pre.map((v, i) => post[i] - v);
  const dMean = mean(diffs);
  const dStd = stdDev(diffs);
  const se = dStd / Math.sqrt(n);
  const t = se === 0 ? 0 : dMean / se;
  const df = n - 1;
  const p = tDistPValue(Math.abs(t), df);
  return { t: Math.round(t * 1000) / 1000, p: Math.round(p * 10000) / 10000, df, significant: p < 0.05, method: "paired t-test" };
}

function zTest(pre: number[], post: number[]) {
  const n1 = pre.length, n2 = post.length;
  const m1 = mean(pre), m2 = mean(post);
  const v1 = variance(pre), v2 = variance(post);
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  const z = se === 0 ? 0 : (m2 - m1) / se;
  const p = 2 * (1 - normalCDF(Math.abs(z)));
  return { z: Math.round(z * 1000) / 1000, p: Math.round(p * 10000) / 10000, significant: p < 0.05, method: "z-test" };
}

function normalCDF(x: number) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

function tDistPValue(t: number, df: number): number {
  if (df >= 30) return 2 * (1 - normalCDF(t));
  const x = df / (df + t * t);
  const a = df / 2;
  const b = 0.5;
  let result = Math.pow(x, a) * Math.pow(1 - x, b) / (a * beta(a, b));
  let sum = 1, term = 1;
  for (let i = 0; i < 200; i++) {
    term *= (a + i) * x / (a + b + i);
    sum += term;
    if (Math.abs(term) < 1e-10) break;
  }
  result *= sum;
  return Math.min(1, Math.max(0, result));
}

function beta(a: number, b: number) {
  return Math.exp(lgamma(a) + lgamma(b) - lgamma(a + b));
}

function lgamma(x: number): number {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.001208650973866179, -0.000005395239384953];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (let j = 0; j < 6; j++) ser += c[j] / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function cohensD(pre: number[], post: number[]) {
  const pooledStd = Math.sqrt((variance(pre) + variance(post)) / 2);
  if (pooledStd === 0) return 0;
  return Math.round(((mean(post) - mean(pre)) / pooledStd) * 1000) / 1000;
}

function confidenceInterval95(arr: number[]) {
  if (arr.length < 2) return { lower: 0, upper: 0 };
  const m = mean(arr);
  const se = stdDev(arr) / Math.sqrt(arr.length);
  const z = 1.96;
  return { lower: Math.round((m - z * se) * 100) / 100, upper: Math.round((m + z * se) * 100) / 100 };
}

const COLORS = {
  pre: "hsl(220, 70%, 55%)",
  post: "hsl(150, 60%, 45%)",
  preLight: "hsl(220, 70%, 80%)",
  postLight: "hsl(150, 60%, 75%)",
  accent: "hsl(35, 90%, 55%)",
  danger: "hsl(0, 70%, 55%)",
  purple: "hsl(270, 60%, 55%)",
};

const PIE_COLORS = ["hsl(150, 60%, 45%)", "hsl(0, 70%, 55%)"];

const QuizAnalytics = ({ quiz, onBack }: QuizAnalyticsProps) => {
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { first_name: string; last_name: string }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("quiz_attempts")
        .select("*")
        .eq("quiz_id", quiz.id)
        .order("created_at");
      if (data) {
        setAttempts(data.map(a => ({ ...a, score: Number(a.score), total_points: Number(a.total_points), percentage: Number(a.percentage) })));
        const userIds = [...new Set(data.map(a => a.user_id))];
        if (userIds.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("user_id, first_name, last_name")
            .in("user_id", userIds);
          if (profs) {
            const map: Record<string, any> = {};
            profs.forEach(p => { map[p.user_id] = p; });
            setProfiles(map);
          }
        }
      }
      setLoading(false);
    };
    fetch();
  }, [quiz.id]);

  const analysis = useMemo(() => {
    const preAttempts = attempts.filter(a => a.attempt_type === "pre_test");
    const postAttempts = attempts.filter(a => a.attempt_type === "post_test");

    const pairedUsers = preAttempts
      .filter(pre => postAttempts.some(post => post.user_id === pre.user_id))
      .map(pre => {
        const post = postAttempts.find(p => p.user_id === pre.user_id)!;
        return { userId: pre.user_id, pre: pre.percentage, post: post.percentage, diff: post.percentage - pre.percentage };
      });

    const preScores = pairedUsers.map(p => p.pre);
    const postScores = pairedUsers.map(p => p.post);
    const allPreScores = preAttempts.map(a => a.percentage);
    const allPostScores = postAttempts.map(a => a.percentage);

    const n = pairedUsers.length;
    let testResult: any = null;
    if (n >= 2) {
      testResult = n >= 30 ? zTest(preScores, postScores) : pairedTTest(preScores, postScores);
      testResult.effectSize = cohensD(preScores, postScores);
      testResult.n = n;
      testResult.preMean = Math.round(mean(preScores) * 100) / 100;
      testResult.postMean = Math.round(mean(postScores) * 100) / 100;
      testResult.improvement = Math.round((mean(postScores) - mean(preScores)) * 100) / 100;
      testResult.preCI = confidenceInterval95(preScores);
      testResult.postCI = confidenceInterval95(postScores);
    }

    return {
      totalParticipants: new Set(attempts.map(a => a.user_id)).size,
      preCount: preAttempts.length,
      postCount: postAttempts.length,
      pairedCount: n,
      preMean: allPreScores.length > 0 ? Math.round(mean(allPreScores) * 100) / 100 : 0,
      postMean: allPostScores.length > 0 ? Math.round(mean(allPostScores) * 100) / 100 : 0,
      preMedian: allPreScores.length > 0 ? Math.round(median(allPreScores) * 100) / 100 : 0,
      postMedian: allPostScores.length > 0 ? Math.round(median(allPostScores) * 100) / 100 : 0,
      preStd: allPreScores.length > 1 ? Math.round(stdDev(allPreScores) * 100) / 100 : 0,
      postStd: allPostScores.length > 1 ? Math.round(stdDev(allPostScores) * 100) / 100 : 0,
      prePassRate: allPreScores.length > 0 ? Math.round((allPreScores.filter(s => s >= quiz.passing_score).length / allPreScores.length) * 100) : 0,
      postPassRate: allPostScores.length > 0 ? Math.round((allPostScores.filter(s => s >= quiz.passing_score).length / allPostScores.length) * 100) : 0,
      testResult,
      pairedData: pairedUsers,
      preAttempts,
      postAttempts,
      improvedCount: pairedUsers.filter(p => p.post > p.pre).length,
      declinedCount: pairedUsers.filter(p => p.post < p.pre).length,
      noChangeCount: pairedUsers.filter(p => p.post === p.pre).length,
    };
  }, [attempts, quiz.passing_score]);

  // Chart data
  const comparisonChartData = useMemo(() =>
    analysis.pairedData.map(p => {
      const prof = profiles[p.userId];
      return {
        name: prof ? `${prof.first_name} ${prof.last_name?.charAt(0) || ""}.` : p.userId.slice(0, 8),
        "Pre-test": Math.round(p.pre),
        "Post-test": Math.round(p.post),
        Change: Math.round(p.diff),
      };
    }),
  [analysis.pairedData, profiles]);

  const distributionData = useMemo(() => {
    const bins = ["0-20%", "21-40%", "41-60%", "61-80%", "81-100%"];
    const ranges = [[0, 20], [21, 40], [41, 60], [61, 80], [81, 100]];
    return bins.map((label, i) => ({
      range: label,
      "Pre-test": analysis.preAttempts.filter(a => a.percentage >= ranges[i][0] && a.percentage <= ranges[i][1]).length,
      "Post-test": analysis.postAttempts.filter(a => a.percentage >= ranges[i][0] && a.percentage <= ranges[i][1]).length,
    }));
  }, [analysis]);

  const improvementPie = useMemo(() => [
    { name: "Improved", value: analysis.improvedCount, color: COLORS.post },
    { name: "Declined", value: analysis.declinedCount, color: COLORS.danger },
    { name: "No Change", value: analysis.noChangeCount, color: COLORS.accent },
  ].filter(d => d.value > 0), [analysis]);

  const passRateComparison = useMemo(() => [
    { name: "Pre-test", Passed: analysis.prePassRate, Failed: 100 - analysis.prePassRate },
    { name: "Post-test", Passed: analysis.postPassRate, Failed: 100 - analysis.postPassRate },
  ], [analysis]);

  const scatterData = useMemo(() =>
    analysis.pairedData.map(p => ({
      pre: Math.round(p.pre),
      post: Math.round(p.post),
      name: profiles[p.userId] ? `${profiles[p.userId].first_name} ${profiles[p.userId].last_name?.charAt(0)}.` : "",
    })),
  [analysis.pairedData, profiles]);

  const descriptiveStats = useMemo(() => [
    { metric: "Mean", pre: `${analysis.preMean}%`, post: `${analysis.postMean}%` },
    { metric: "Median", pre: `${analysis.preMedian}%`, post: `${analysis.postMedian}%` },
    { metric: "Std Dev", pre: `${analysis.preStd}`, post: `${analysis.postStd}` },
    { metric: "Pass Rate", pre: `${analysis.prePassRate}%`, post: `${analysis.postPassRate}%` },
    { metric: "Sample Size", pre: `${analysis.preCount}`, post: `${analysis.postCount}` },
  ], [analysis]);

  // Pagination for individual scores
  const pagination = useTablePagination({ totalItems: analysis.pairedData.length, initialPageSize: 10 });
  const pagedPairedData = analysis.pairedData.slice(pagination.startIndex, pagination.startIndex + pagination.pageSize);

  // Generate interpretation text
  const interpretation = useMemo(() => {
    const t = analysis.testResult;
    if (!t) return null;
    const lines: string[] = [];

    // Test selection rationale
    lines.push(`📊 **Test Used:** ${t.method.toUpperCase()} — ${t.n >= 30 ? "Selected because sample size n ≥ 30 satisfies the Central Limit Theorem for normal approximation." : `Selected because sample size n = ${t.n} < 30, requiring the t-distribution for accurate p-value estimation.`}`);

    // Hypothesis
    lines.push(`\n🔬 **Hypotheses:**\n• H₀: There is no significant difference between Pre-test and Post-test scores (μ_diff = 0)\n• H₁: There is a significant difference between Pre-test and Post-test scores (μ_diff ≠ 0)`);

    // Results
    const statLabel = t.method === "z-test" ? `z = ${t.z}` : `t(${t.df}) = ${t.t}`;
    lines.push(`\n📈 **Results:** ${statLabel}, p = ${t.p < 0.0001 ? "< 0.0001" : t.p} (two-tailed, α = 0.05)`);

    // Decision
    if (t.significant) {
      lines.push(`\n✅ **Decision:** REJECT H₀. The improvement from Pre-test (M = ${t.preMean}%) to Post-test (M = ${t.postMean}%) is statistically significant.`);
    } else {
      lines.push(`\n⚠️ **Decision:** FAIL TO REJECT H₀. The difference between Pre-test and Post-test scores is not statistically significant at α = 0.05.`);
    }

    // Effect size
    const absD = Math.abs(t.effectSize);
    const effectLabel = absD < 0.2 ? "negligible" : absD < 0.5 ? "small" : absD < 0.8 ? "medium" : "large";
    lines.push(`\n📐 **Effect Size:** Cohen's d = ${t.effectSize} (${effectLabel}). ${absD >= 0.8 ? "This indicates a practically meaningful difference — the intervention had a strong impact." : absD >= 0.5 ? "This suggests a moderate practical significance." : absD >= 0.2 ? "While statistically detectable, the practical impact is small." : "The difference, even if significant, may not be practically meaningful."}`);

    // Confidence intervals
    if (t.preCI && t.postCI) {
      lines.push(`\n📏 **95% Confidence Intervals:**\n• Pre-test: [${t.preCI.lower}%, ${t.preCI.upper}%]\n• Post-test: [${t.postCI.lower}%, ${t.postCI.upper}%]`);
    }

    // Practical conclusion
    const pctImproved = analysis.pairedCount > 0 ? Math.round((analysis.improvedCount / analysis.pairedCount) * 100) : 0;
    lines.push(`\n💡 **Practical Conclusion:** ${pctImproved}% of participants improved their scores. Mean improvement was ${t.improvement > 0 ? "+" : ""}${t.improvement} percentage points. ${t.significant && t.improvement > 0 ? "The training/intervention appears to be effective." : t.significant && t.improvement < 0 ? "Scores declined significantly — consider reviewing the intervention." : "More data may be needed to draw a definitive conclusion."}`);

    return lines.join("\n");
  }, [analysis]);

  if (loading) {
    return <div className="flex justify-center py-20"><div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={onBack} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div>
          <h2 className="text-lg font-bold text-foreground">{quiz.title} — Analytics</h2>
          <p className="text-xs text-muted-foreground">Comprehensive Pre-test vs Post-test statistical analysis</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: Users, label: "Participants", value: analysis.totalParticipants, color: "text-primary", bg: "bg-primary/10" },
          { icon: BarChart3, label: "Pre-test Mean", value: `${analysis.preMean}%`, color: "text-blue-600", bg: "bg-blue-100 dark:bg-blue-900/30" },
          { icon: TrendingUp, label: "Post-test Mean", value: `${analysis.postMean}%`, color: "text-emerald-600", bg: "bg-emerald-100 dark:bg-emerald-900/30" },
          { icon: Target, label: "Paired Tests", value: analysis.pairedCount, color: "text-amber-600", bg: "bg-amber-100 dark:bg-amber-900/30" },
          { icon: Percent, label: "Pre Pass Rate", value: `${analysis.prePassRate}%`, color: "text-violet-600", bg: "bg-violet-100 dark:bg-violet-900/30" },
          { icon: Award, label: "Post Pass Rate", value: `${analysis.postPassRate}%`, color: "text-rose-600", bg: "bg-rose-100 dark:bg-rose-900/30" },
        ].map((kpi, i) => (
          <Card key={i} className="form-card border-0 shadow-sm hover:shadow-md transition-shadow">
            <CardContent className="py-4 text-center">
              <div className={`mx-auto flex h-10 w-10 items-center justify-center rounded-xl ${kpi.bg} mb-2`}>
                <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
              </div>
              <div className="text-2xl font-bold text-foreground">{kpi.value}</div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Statistical Test Result */}
      {analysis.testResult && (
        <Card className={`form-card border-l-4 ${analysis.testResult.significant ? "border-l-emerald-500" : "border-l-amber-400"}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {analysis.testResult.significant ? (
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
              Statistical Test Result
              <Badge variant="secondary" className="text-[10px] font-mono">{analysis.testResult.method.toUpperCase()}</Badge>
              <Badge variant={analysis.testResult.significant ? "default" : "secondary"} className="text-[10px]">
                {analysis.testResult.significant ? "Significant" : "Not Significant"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
              <div className="p-3 rounded-xl bg-muted/40 text-center">
                <p className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold">Test Statistic</p>
                <p className="font-mono font-bold text-lg mt-1">
                  {analysis.testResult.method === "z-test" ? analysis.testResult.z : analysis.testResult.t}
                </p>
                <p className="text-[10px] text-muted-foreground">{analysis.testResult.method === "z-test" ? "z-score" : `df = ${analysis.testResult.df}`}</p>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 text-center">
                <p className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold">P-value</p>
                <p className={`font-mono font-bold text-lg mt-1 ${analysis.testResult.p < 0.05 ? "text-emerald-600" : "text-amber-600"}`}>
                  {analysis.testResult.p < 0.0001 ? "< .0001" : analysis.testResult.p}
                </p>
                <p className="text-[10px] text-muted-foreground">α = 0.05</p>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 text-center">
                <p className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold">Cohen's d</p>
                <p className="font-mono font-bold text-lg mt-1">{analysis.testResult.effectSize}</p>
                <p className="text-[10px] text-muted-foreground">
                  {Math.abs(analysis.testResult.effectSize) < 0.2 ? "Negligible" :
                   Math.abs(analysis.testResult.effectSize) < 0.5 ? "Small" :
                   Math.abs(analysis.testResult.effectSize) < 0.8 ? "Medium" : "Large"}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 text-center">
                <p className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold">Improvement</p>
                <p className={`font-mono font-bold text-lg mt-1 flex items-center justify-center gap-1 ${analysis.testResult.improvement > 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {analysis.testResult.improvement > 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                  {analysis.testResult.improvement > 0 ? "+" : ""}{analysis.testResult.improvement}%
                </p>
                <p className="text-[10px] text-muted-foreground">Mean Δ</p>
              </div>
              <div className="p-3 rounded-xl bg-muted/40 text-center">
                <p className="text-muted-foreground text-[10px] uppercase tracking-wider font-semibold">Sample</p>
                <p className="font-mono font-bold text-lg mt-1">{analysis.testResult.n}</p>
                <p className="text-[10px] text-muted-foreground">Paired</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {analysis.pairedCount < 2 && (
        <Card className="form-card bg-muted/30 border-dashed">
          <CardContent className="py-6 text-center">
            <Brain className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-muted-foreground text-sm font-medium">Insufficient Data for Statistical Testing</p>
            <p className="text-xs text-muted-foreground mt-1">
              Need at least 2 paired participants (both Pre & Post-test). Currently: {analysis.preCount} pre-tests, {analysis.postCount} post-tests, {analysis.pairedCount} paired.
            </p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="comparison">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="comparison" className="gap-1"><BarChart3 className="h-3 w-3" /> Comparison</TabsTrigger>
          <TabsTrigger value="distribution" className="gap-1"><Activity className="h-3 w-3" /> Distribution</TabsTrigger>
          <TabsTrigger value="scatter" className="gap-1"><Target className="h-3 w-3" /> Scatter</TabsTrigger>
          <TabsTrigger value="individual" className="gap-1"><Users className="h-3 w-3" /> Individual</TabsTrigger>
          <TabsTrigger value="insights" className="gap-1"><Lightbulb className="h-3 w-3" /> Insights</TabsTrigger>
        </TabsList>

        {/* Comparison Tab */}
        <TabsContent value="comparison" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="form-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Pre vs Post-test Scores by Participant
                </CardTitle>
              </CardHeader>
              <CardContent>
                {comparisonChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={comparisonChartData} barGap={2}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
                        formatter={(value: number, name: string) => [`${value}%`, name]}
                      />
                      <Legend />
                      <Bar dataKey="Pre-test" fill={COLORS.pre} radius={[6, 6, 0, 0]} />
                      <Bar dataKey="Post-test" fill={COLORS.post} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="py-12 text-center text-muted-foreground text-sm">No paired data yet.</div>
                )}
              </CardContent>
            </Card>

            <Card className="form-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Award className="h-4 w-4 text-amber-500" />
                  Improvement Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                {improvementPie.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={improvementPie} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                        {improvementPie.map((entry, i) => (
                          <Cell key={i} fill={entry.color} strokeWidth={2} stroke="hsl(var(--background))" />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => [value, "Participants"]} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="py-12 text-center text-muted-foreground text-sm">No paired data yet.</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Pass Rate Stacked Bar */}
          <Card className="form-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Percent className="h-4 w-4 text-violet-500" />
                Pass / Fail Rate Comparison
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={passRateComparison} layout="vertical" barSize={30}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={80} />
                  <Tooltip formatter={(v: number) => [`${v}%`]} />
                  <Legend />
                  <Bar dataKey="Passed" stackId="a" fill={COLORS.post} radius={[0, 6, 6, 0]} />
                  <Bar dataKey="Failed" stackId="a" fill={COLORS.danger} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Distribution Tab */}
        <TabsContent value="distribution" className="mt-4 space-y-4">
          <Card className="form-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                Score Distribution (Area Chart)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={distributionData}>
                  <defs>
                    <linearGradient id="preGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.pre} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.pre} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="postGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.post} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={COLORS.post} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                  <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))" }} />
                  <Legend />
                  <Area type="monotone" dataKey="Pre-test" stroke={COLORS.pre} fillOpacity={1} fill="url(#preGrad)" strokeWidth={2} />
                  <Area type="monotone" dataKey="Post-test" stroke={COLORS.post} fillOpacity={1} fill="url(#postGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Descriptive statistics table */}
          <Card className="form-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-primary" />
                Descriptive Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-bold text-xs">Metric</TableHead>
                      <TableHead className="font-bold text-xs text-center" style={{ color: COLORS.pre }}>Pre-test</TableHead>
                      <TableHead className="font-bold text-xs text-center" style={{ color: COLORS.post }}>Post-test</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {descriptiveStats.map((row, i) => (
                      <TableRow key={i} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                        <TableCell className="font-medium text-sm">{row.metric}</TableCell>
                        <TableCell className="text-center font-mono text-sm">{row.pre}</TableCell>
                        <TableCell className="text-center font-mono text-sm">{row.post}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Scatter Tab */}
        <TabsContent value="scatter" className="mt-4">
          <Card className="form-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                Pre vs Post-test Score Scatter
              </CardTitle>
              <CardDescription className="text-xs">Points above the diagonal line indicate improvement</CardDescription>
            </CardHeader>
            <CardContent>
              {scatterData.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <ScatterChart>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                    <XAxis type="number" dataKey="pre" name="Pre-test" domain={[0, 100]} tick={{ fontSize: 11 }} label={{ value: "Pre-test %", position: "bottom", offset: -5, fontSize: 12 }} />
                    <YAxis type="number" dataKey="post" name="Post-test" domain={[0, 100]} tick={{ fontSize: 11 }} label={{ value: "Post-test %", angle: -90, position: "insideLeft", fontSize: 12 }} />
                    <ZAxis range={[80, 200]} />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3" }}
                      formatter={(value: number, name: string) => [`${value}%`, name]}
                      contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))" }}
                    />
                    <Scatter data={scatterData} fill={COLORS.purple} strokeWidth={1} stroke="hsl(var(--background))" />
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <div className="py-12 text-center text-muted-foreground text-sm">No paired data yet.</div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Individual Scores Tab */}
        <TabsContent value="individual" className="mt-4">
          <Card className="form-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                Individual Score Comparison
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-xl border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-bold text-xs">#</TableHead>
                      <TableHead className="font-bold text-xs">Participant</TableHead>
                      <TableHead className="font-bold text-xs text-center">Pre-test</TableHead>
                      <TableHead className="font-bold text-xs text-center">Post-test</TableHead>
                      <TableHead className="font-bold text-xs text-center">Change</TableHead>
                      <TableHead className="font-bold text-xs text-center">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedPairedData.map((p, i) => {
                      const prof = profiles[p.userId];
                      const improved = p.diff > 0;
                      const declined = p.diff < 0;
                      return (
                        <TableRow key={p.userId} className={i % 2 === 0 ? "bg-muted/20" : ""}>
                          <TableCell className="font-mono text-xs text-muted-foreground">{pagination.startIndex + i + 1}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary shrink-0">
                                {prof ? `${prof.first_name?.[0]}${prof.last_name?.[0]}` : "?"}
                              </div>
                              <span className="text-sm font-medium truncate">
                                {prof ? `${prof.first_name} ${prof.last_name}` : p.userId.slice(0, 12)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center font-mono text-sm">{Math.round(p.pre)}%</TableCell>
                          <TableCell className="text-center font-mono text-sm">{Math.round(p.post)}%</TableCell>
                          <TableCell className="text-center">
                            <span className={`font-mono font-bold text-sm ${improved ? "text-emerald-600" : declined ? "text-red-500" : "text-muted-foreground"}`}>
                              {p.diff > 0 ? "+" : ""}{Math.round(p.diff)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={improved ? "default" : declined ? "destructive" : "secondary"} className="text-[10px] gap-0.5">
                              {improved ? <TrendingUp className="h-3 w-3" /> : declined ? <TrendingDown className="h-3 w-3" /> : null}
                              {improved ? "Improved" : declined ? "Declined" : "Same"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {analysis.pairedData.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">No paired results yet.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <TablePagination {...pagination} onPageSizeChange={pagination.setPageSize} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Insights Tab */}
        <TabsContent value="insights" className="mt-4 space-y-4">
          {interpretation ? (
            <Card className="form-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Brain className="h-4 w-4 text-primary" />
                  Inferential Analysis & Interpretation
                </CardTitle>
                <CardDescription className="text-xs">Automated statistical interpretation of Pre/Post-test results</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  {interpretation.split("\n").map((line, i) => {
                    if (!line.trim()) return <br key={i} />;
                    // Bold markdown-style
                    const formatted = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                    return (
                      <p
                        key={i}
                        className="text-sm leading-relaxed my-1"
                        dangerouslySetInnerHTML={{ __html: formatted }}
                      />
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="form-card bg-muted/30 border-dashed">
              <CardContent className="py-8 text-center">
                <Lightbulb className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-muted-foreground text-sm">Statistical insights will appear when at least 2 participants complete both Pre and Post-tests.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default QuizAnalytics;