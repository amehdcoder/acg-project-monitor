import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, Users, Brain, Eye } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { STANDARD_ASSESSMENTS, StandardFormCode } from "@/lib/standardAssessments/definitions";

interface Props {
  code: StandardFormCode;
}

interface Row {
  id: string;
  user_id: string;
  data: Record<string, any>;
  demographics: Record<string, any>;
  score: number | null;
  severity: string | null;
  disability_flags: any;
  created_at: string;
}

const COLORS = ["#2F6FE6", "#22A55A", "#F08A2A", "#7C5CFF", "#E25555", "#1FB5A8", "#D4A017"];

const StandardAssessmentAnalytics = ({ code }: Props) => {
  const def = STANDARD_ASSESSMENTS[code];
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("standard_assessment_submissions")
        .select("id,user_id,data,demographics,score,severity,disability_flags,created_at")
        .eq("form_code", code)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (!error && data) setRows(data as Row[]);
      setLoading(false);
    })();
  }, [code]);

  const analytics = useMemo(() => {
    if (rows.length === 0) return null;
    const total = rows.length;
    const avgScore = rows.reduce((a, r) => a + (r.score ?? 0), 0) / total;

    const severityCounts: Record<string, number> = {};
    rows.forEach((r) => {
      const s = r.severity ?? "Unknown";
      severityCounts[s] = (severityCounts[s] ?? 0) + 1;
    });
    const severityData = Object.entries(severityCounts).map(([name, value]) => ({ name, value }));

    const sliceBy = (key: string) => {
      const m: Record<string, number> = {};
      rows.forEach((r) => {
        const v = String(r.demographics?.[key] ?? "Unknown");
        m[v] = (m[v] ?? 0) + 1;
      });
      return Object.entries(m).map(([name, value]) => ({ name, value }));
    };

    const sexDist = sliceBy("sex");
    const settingDist = sliceBy("setting");
    const educationDist = sliceBy("education");
    const employmentDist = sliceBy("employment");
    const incomeDist = sliceBy("household_income");
    const supportDist = sliceBy("social_support");
    const stressDist = sliceBy("stress_level");

    const ageBuckets: Record<string, number> = { "0-17": 0, "18-29": 0, "30-44": 0, "45-59": 0, "60+": 0, "Unknown": 0 };
    rows.forEach((r) => {
      const a = parseInt(r.demographics?.age ?? "", 10);
      if (isNaN(a)) ageBuckets["Unknown"]++;
      else if (a < 18) ageBuckets["0-17"]++;
      else if (a < 30) ageBuckets["18-29"]++;
      else if (a < 45) ageBuckets["30-44"]++;
      else if (a < 60) ageBuckets["45-59"]++;
      else ageBuckets["60+"]++;
    });
    const ageData = Object.entries(ageBuckets).map(([name, value]) => ({ name, value }));

    // Severity x sex cross-tab
    const sevBySex: Record<string, Record<string, number>> = {};
    rows.forEach((r) => {
      const s = r.severity ?? "Unknown";
      const sex = String(r.demographics?.sex ?? "Unknown");
      sevBySex[s] = sevBySex[s] ?? {};
      sevBySex[s][sex] = (sevBySex[s][sex] ?? 0) + 1;
    });
    const sevBySexData = Object.entries(sevBySex).map(([sev, m]) => ({ name: sev, ...m }));
    const sexKeys = Array.from(new Set(rows.map((r) => String(r.demographics?.sex ?? "Unknown"))));

    // WG-SS specific
    let disabilityFlags: any = null;
    let prevalencePct = 0;
    if (code === "wg_ss") {
      const domains = ["vision", "hearing", "mobility", "cognition", "selfCare", "communication"] as const;
      const labelMap: Record<string, string> = {
        vision: "Vision", hearing: "Hearing", mobility: "Mobility",
        cognition: "Cognition", selfCare: "Self-care", communication: "Communication",
      };
      const counts: Record<string, number> = {};
      let hasDis = 0;
      rows.forEach((r) => {
        const f = r.disability_flags || {};
        if (f.hasDisability) hasDis++;
        domains.forEach((d) => {
          if (f[d]) counts[labelMap[d]] = (counts[labelMap[d]] ?? 0) + 1;
        });
      });
      disabilityFlags = Object.entries(counts).map(([name, value]) => ({
        name,
        value,
        pct: ((value / total) * 100).toFixed(1),
      }));
      prevalencePct = (hasDis / total) * 100;
    }

    // PHQ-9 suicidality (item 9)
    let suicidality = 0;
    if (code === "phq_9") {
      rows.forEach((r) => {
        if ((parseInt(r.data?.phq_9 ?? "0", 10) || 0) >= 1) suicidality++;
      });
    }

    return {
      total, avgScore, severityData,
      sexDist, settingDist, educationDist, employmentDist,
      incomeDist, supportDist, stressDist,
      ageData, sevBySexData, sexKeys,
      disabilityFlags, prevalencePct, suicidality,
    };
  }, [rows, code]);

  if (loading) {
    return <div className="flex items-center justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!analytics) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          No {def.shortName} submissions yet. {isAdmin ? "" : "Your own submissions will appear here once collected."}
        </CardContent>
      </Card>
    );
  }

  const renderDistCard = (title: string, data: { name: string; value: number }[], icon?: React.ReactNode) => (
    <Card>
      <CardHeader><CardTitle className="text-sm flex items-center gap-2">{icon}{title}</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="value" fill="#2F6FE6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total assessments</div>
          <div className="text-2xl font-bold">{analytics.total}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Average score</div>
          <div className="text-2xl font-bold">{analytics.avgScore.toFixed(1)}</div>
        </CardContent></Card>
        {code === "wg_ss" && (
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Disability prevalence (WG cutoff)</div>
            <div className="text-2xl font-bold">{analytics.prevalencePct.toFixed(1)}%</div>
          </CardContent></Card>
        )}
        {code === "phq_9" && (
          <Card><CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Item-9 endorsement (suicidality)</div>
            <div className="text-2xl font-bold text-destructive">{analytics.suicidality}</div>
          </CardContent></Card>
        )}
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Unique sex categories</div>
          <div className="text-2xl font-bold">{analytics.sexDist.length}</div>
        </CardContent></Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4" />Severity distribution</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={analytics.severityData} dataKey="value" nameKey="name" outerRadius={90} label>
                  {analytics.severityData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4" />Severity × Sex</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={analytics.sevBySexData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                {analytics.sexKeys.map((k, i) => (
                  <Bar key={k} dataKey={k} stackId="a" fill={COLORS[i % COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {code === "wg_ss" && analytics.disabilityFlags && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Eye className="h-4 w-4" />Disability domains affected</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={analytics.disabilityFlags}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any, _n, p: any) => [`${v} (${p.payload.pct}%)`, "Cases"]} />
                <Bar dataKey="value" fill="#7C5CFF" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 flex flex-wrap gap-2">
              {analytics.disabilityFlags.map((d: any) => (
                <Badge key={d.name} variant="secondary">{d.name}: {d.pct}%</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {renderDistCard("Age bands", analytics.ageData, <Users className="h-4 w-4" />)}
        {renderDistCard("Setting (urban / rural)", analytics.settingDist)}
        {renderDistCard("Education", analytics.educationDist)}
        {renderDistCard("Employment", analytics.employmentDist)}
        {renderDistCard("Household income (self-rated)", analytics.incomeDist, <Brain className="h-4 w-4" />)}
        {renderDistCard("Social support", analytics.supportDist, <Brain className="h-4 w-4" />)}
        {renderDistCard("Stress level", analytics.stressDist, <Brain className="h-4 w-4" />)}
      </div>
    </div>
  );
};

export default StandardAssessmentAnalytics;
