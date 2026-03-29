import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Users, TrendingUp, TrendingDown, BarChart3, Award, CheckCircle, XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, Cell,
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

// Paired t-test (pre vs post, same participants)
function pairedTTest(pre: number[], post: number[]) {
  const n = pre.length;
  if (n < 2) return { t: 0, p: 1, df: 0, significant: false, method: "paired t-test" };
  const diffs = pre.map((v, i) => post[i] - v);
  const dMean = mean(diffs);
  const dStd = stdDev(diffs);
  const se = dStd / Math.sqrt(n);
  const t = se === 0 ? 0 : dMean / se;
  const df = n - 1;
  // Two-tailed p approx using t-distribution (good approx for df>2)
  const p = tDistPValue(Math.abs(t), df);
  return { t: Math.round(t * 1000) / 1000, p: Math.round(p * 10000) / 10000, df, significant: p < 0.05, method: "paired t-test" };
}

// Z-test for large samples (n >= 30)
function zTest(pre: number[], post: number[]) {
  const n1 = pre.length, n2 = post.length;
  const m1 = mean(pre), m2 = mean(post);
  const v1 = variance(pre), v2 = variance(post);
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  const z = se === 0 ? 0 : (m2 - m1) / se;
  // Two-tailed p from normal distribution
  const p = 2 * (1 - normalCDF(Math.abs(z)));
  return { z: Math.round(z * 1000) / 1000, p: Math.round(p * 10000) / 10000, significant: p < 0.05, method: "z-test" };
}

// Normal CDF approximation (Abramowitz & Stegun)
function normalCDF(x: number) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + p * x);
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

// t-distribution p-value approximation (two-tailed)
function tDistPValue(t: number, df: number): number {
  // Use normal approximation for large df
  if (df >= 30) return 2 * (1 - normalCDF(t));
  // Beta regularized incomplete function approximation for small df
  const x = df / (df + t * t);
  const a = df / 2;
  const b = 0.5;
  // Simple series approximation
  let result = Math.pow(x, a) * Math.pow(1 - x, b) / (a * beta(a, b));
  // Use iterative improvement
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

// Cohen's d effect size
function cohensD(pre: number[], post: number[]) {
  const pooledStd = Math.sqrt((variance(pre) + variance(post)) / 2);
  if (pooledStd === 0) return 0;
  return Math.round(((mean(post) - mean(pre)) / pooledStd) * 1000) / 1000;
}

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
        // Fetch profiles
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

    // Paired data (users who did both)
    const pairedUsers = preAttempts
      .filter(pre => postAttempts.some(post => post.user_id === pre.user_id))
      .map(pre => {
        const post = postAttempts.find(p => p.user_id === pre.user_id)!;
        return { userId: pre.user_id, pre: pre.percentage, post: post.percentage };
      });

    const preScores = pairedUsers.map(p => p.pre);
    const postScores = pairedUsers.map(p => p.post);
    const allPreScores = preAttempts.map(a => a.percentage);
    const allPostScores = postAttempts.map(a => a.percentage);

    const n = pairedUsers.length;
    let testResult: any = null;
    if (n >= 2) {
      if (n >= 30) {
        testResult = zTest(preScores, postScores);
      } else {
        testResult = pairedTTest(preScores, postScores);
      }
      testResult.effectSize = cohensD(preScores, postScores);
      testResult.n = n;
      testResult.preMean = Math.round(mean(preScores) * 100) / 100;
      testResult.postMean = Math.round(mean(postScores) * 100) / 100;
      testResult.improvement = Math.round((mean(postScores) - mean(preScores)) * 100) / 100;
    }

    return {
      totalParticipants: new Set(attempts.map(a => a.user_id)).size,
      preCount: preAttempts.length,
      postCount: postAttempts.length,
      pairedCount: n,
      preMean: allPreScores.length > 0 ? Math.round(mean(allPreScores) * 100) / 100 : 0,
      postMean: allPostScores.length > 0 ? Math.round(mean(allPostScores) * 100) / 100 : 0,
      prePassRate: allPreScores.length > 0 ? Math.round((allPreScores.filter(s => s >= quiz.passing_score).length / allPreScores.length) * 100) : 0,
      postPassRate: allPostScores.length > 0 ? Math.round((allPostScores.filter(s => s >= quiz.passing_score).length / allPostScores.length) * 100) : 0,
      testResult,
      pairedData: pairedUsers,
      preAttempts,
      postAttempts,
    };
  }, [attempts, quiz.passing_score]);

  const chartData = useMemo(() => {
    return analysis.pairedData.map(p => {
      const prof = profiles[p.userId];
      return {
        name: prof ? `${prof.first_name} ${prof.last_name?.charAt(0)}.` : p.userId.slice(0, 8),
        "Pre-test": Math.round(p.pre),
        "Post-test": Math.round(p.post),
      };
    });
  }, [analysis.pairedData, profiles]);

  const distributionData = useMemo(() => {
    const bins = ["0-20", "21-40", "41-60", "61-80", "81-100"];
    const ranges = [[0, 20], [21, 40], [41, 60], [61, 80], [81, 100]];
    return bins.map((label, i) => ({
      range: label,
      "Pre-test": analysis.preAttempts.filter(a => a.percentage >= ranges[i][0] && a.percentage <= ranges[i][1]).length,
      "Post-test": analysis.postAttempts.filter(a => a.percentage >= ranges[i][0] && a.percentage <= ranges[i][1]).length,
    }));
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
          <p className="text-xs text-muted-foreground">Pre-test vs Post-test statistical comparison</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="form-card">
          <CardContent className="py-3 text-center">
            <Users className="h-5 w-5 mx-auto text-primary mb-1" />
            <div className="text-2xl font-bold">{analysis.totalParticipants}</div>
            <p className="text-[11px] text-muted-foreground">Participants</p>
          </CardContent>
        </Card>
        <Card className="form-card">
          <CardContent className="py-3 text-center">
            <BarChart3 className="h-5 w-5 mx-auto text-blue-500 mb-1" />
            <div className="text-2xl font-bold">{analysis.preMean}%</div>
            <p className="text-[11px] text-muted-foreground">Pre-test Mean</p>
          </CardContent>
        </Card>
        <Card className="form-card">
          <CardContent className="py-3 text-center">
            <TrendingUp className="h-5 w-5 mx-auto text-green-500 mb-1" />
            <div className="text-2xl font-bold">{analysis.postMean}%</div>
            <p className="text-[11px] text-muted-foreground">Post-test Mean</p>
          </CardContent>
        </Card>
        <Card className="form-card">
          <CardContent className="py-3 text-center">
            <Award className="h-5 w-5 mx-auto text-amber-500 mb-1" />
            <div className="text-2xl font-bold">{analysis.pairedCount}</div>
            <p className="text-[11px] text-muted-foreground">Paired Comparisons</p>
          </CardContent>
        </Card>
      </div>

      {/* Statistical Test Result */}
      {analysis.testResult && (
        <Card className={`form-card border-l-4 ${analysis.testResult.significant ? "border-l-green-500" : "border-l-orange-400"}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              {analysis.testResult.significant ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-orange-500" />
              )}
              Statistical Test Result
              <Badge variant="secondary" className="text-[10px]">{analysis.testResult.method}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground text-xs">Test Statistic</p>
                <p className="font-mono font-bold">
                  {analysis.testResult.method === "z-test" ? `z = ${analysis.testResult.z}` : `t(${analysis.testResult.df}) = ${analysis.testResult.t}`}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">p-value</p>
                <p className={`font-mono font-bold ${analysis.testResult.p < 0.05 ? "text-green-600" : "text-orange-600"}`}>
                  p = {analysis.testResult.p < 0.0001 ? "< 0.0001" : analysis.testResult.p}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Effect Size (Cohen's d)</p>
                <p className="font-mono font-bold">{analysis.testResult.effectSize}</p>
                <p className="text-[10px] text-muted-foreground">
                  {Math.abs(analysis.testResult.effectSize) < 0.2 ? "Negligible" :
                   Math.abs(analysis.testResult.effectSize) < 0.5 ? "Small" :
                   Math.abs(analysis.testResult.effectSize) < 0.8 ? "Medium" : "Large"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">Mean Improvement</p>
                <p className={`font-mono font-bold flex items-center gap-1 ${analysis.testResult.improvement > 0 ? "text-green-600" : "text-red-500"}`}>
                  {analysis.testResult.improvement > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                  {analysis.testResult.improvement > 0 ? "+" : ""}{analysis.testResult.improvement}%
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {analysis.testResult.significant
                ? `The difference between Pre-test (M=${analysis.testResult.preMean}%) and Post-test (M=${analysis.testResult.postMean}%) is statistically significant at α=0.05. Sample size: n=${analysis.testResult.n}.`
                : `No statistically significant difference was found between Pre-test and Post-test scores at α=0.05. Sample size: n=${analysis.testResult.n}.`
              }
            </p>
          </CardContent>
        </Card>
      )}

      {analysis.pairedCount < 2 && (
        <Card className="form-card bg-muted/30">
          <CardContent className="py-6 text-center">
            <p className="text-muted-foreground text-sm">
              Need at least 2 paired participants (both Pre & Post-test) for statistical analysis.
              Currently: {analysis.preCount} pre-tests, {analysis.postCount} post-tests, {analysis.pairedCount} paired.
            </p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="comparison">
        <TabsList>
          <TabsTrigger value="comparison">Score Comparison</TabsTrigger>
          <TabsTrigger value="distribution">Distribution</TabsTrigger>
          <TabsTrigger value="individual">Individual Scores</TabsTrigger>
        </TabsList>

        <TabsContent value="comparison" className="mt-4">
          {chartData.length > 0 ? (
            <Card className="form-card">
              <CardHeader>
                <CardTitle className="text-sm">Pre-test vs Post-test by Participant</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} barGap={2}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="Pre-test" fill="hsl(220, 70%, 50%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Post-test" fill="hsl(145, 60%, 45%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          ) : (
            <Card className="form-card"><CardContent className="py-8 text-center text-muted-foreground text-sm">No paired data yet.</CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="distribution" className="mt-4">
          <Card className="form-card">
            <CardHeader>
              <CardTitle className="text-sm">Score Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={distributionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="Pre-test" fill="hsl(220, 70%, 50%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Post-test" fill="hsl(145, 60%, 45%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="individual" className="mt-4">
          <Card className="form-card">
            <CardContent className="pt-4">
              <div className="space-y-2">
                {analysis.pairedData.map(p => {
                  const prof = profiles[p.userId];
                  const improved = p.post > p.pre;
                  return (
                    <div key={p.userId} className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary shrink-0">
                        {prof ? `${prof.first_name?.[0]}${prof.last_name?.[0]}` : "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {prof ? `${prof.first_name} ${prof.last_name}` : p.userId.slice(0, 12)}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Pre: {Math.round(p.pre)}%</span>
                          <span>→</span>
                          <span>Post: {Math.round(p.post)}%</span>
                        </div>
                      </div>
                      <Badge variant={improved ? "default" : "destructive"} className="text-[10px] gap-0.5">
                        {improved ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                        {improved ? "+" : ""}{Math.round(p.post - p.pre)}%
                      </Badge>
                    </div>
                  );
                })}
                {analysis.pairedData.length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-6">No paired results yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Pass Rate Comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="form-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pre-test Pass Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{analysis.prePassRate}%</div>
            <Progress value={analysis.prePassRate} className="h-2 mt-2" />
            <p className="text-xs text-muted-foreground mt-1">{analysis.preCount} participants</p>
          </CardContent>
        </Card>
        <Card className="form-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Post-test Pass Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{analysis.postPassRate}%</div>
            <Progress value={analysis.postPassRate} className="h-2 mt-2" />
            <p className="text-xs text-muted-foreground mt-1">{analysis.postCount} participants</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default QuizAnalytics;
