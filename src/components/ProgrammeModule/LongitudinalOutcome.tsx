// Patient-scoped longitudinal outcome for GAD-7 / PHQ-9 assessments recorded
// against one beneficiary.

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingDown, TrendingUp, Minus, Activity } from "lucide-react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { BeneficiaryServiceRow } from "@/lib/programmeModule/types";
import { MH_THEME, type MhFormKey } from "./MentalHealthServiceForm";

interface Props {
  services: BeneficiaryServiceRow[];
}

interface Point { date: string; score: number; severity: string }

const seriesFor = (services: BeneficiaryServiceRow[], code: MhFormKey): Point[] =>
  services
    .filter((s) => (s.data as { form_code?: string })?.form_code === code)
    .map((s) => ({
      date: s.service_date,
      score: Number((s.data as { score?: number })?.score ?? 0),
      severity: String((s.data as { severity?: string })?.severity ?? ""),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

const LongitudinalOutcome = ({ services }: Props) => {
  const gad = useMemo(() => seriesFor(services, "gad_7"), [services]);
  const phq = useMemo(() => seriesFor(services, "phq_9"), [services]);

  if (!gad.length && !phq.length) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        No GAD-7 or PHQ-9 assessment has been recorded for this beneficiary yet.
      </Card>
    );
  }

  const blocks: { code: MhFormKey; points: Point[] }[] = [
    { code: "gad_7", points: gad },
    { code: "phq_9", points: phq },
  ].filter((b) => b.points.length) as { code: MhFormKey; points: Point[] }[];

  return (
    <div className="space-y-4">
      {blocks.map(({ code, points }) => {
        const theme = MH_THEME[code];
        const first = points[0];
        const latest = points[points.length - 1];
        const delta = latest.score - first.score;
        const Trend = delta < 0 ? TrendingDown : delta > 0 ? TrendingUp : Minus;
        const trendTone = delta < 0 ? "text-emerald-600" : delta > 0 ? "text-rose-600" : "text-muted-foreground";
        return (
          <Card key={code} className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Activity className="h-4 w-4" style={{ color: theme.hex }} />
              <h3 className="font-semibold text-foreground">{theme.name} — longitudinal patient outcome</h3>
              <Badge variant="outline">{points.length} assessment{points.length === 1 ? "" : "s"}</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Baseline ({first.date})</p>
                <p className="text-2xl font-bold text-foreground">{first.score}</p>
                <p className="text-xs text-muted-foreground">{first.severity}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Latest ({latest.date})</p>
                <p className="text-2xl font-bold text-foreground">{latest.score}</p>
                <p className="text-xs text-muted-foreground">{latest.severity}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Change</p>
                <p className={`flex items-center gap-1 text-2xl font-bold ${trendTone}`}>
                  <Trend className="h-5 w-5" />{delta > 0 ? `+${delta}` : delta}
                </p>
                <p className="text-xs text-muted-foreground">
                  {delta < 0 ? "Improving" : delta > 0 ? "Deteriorating" : "No change"}
                </p>
              </div>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, code === "gad_7" ? 21 : 27]} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(v: number, _n, p) => [`${v} — ${(p?.payload as Point)?.severity}`, theme.name]}
                  />
                  <Line type="monotone" dataKey="score" stroke={theme.hex} strokeWidth={2.5} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2">Date</th><th>Score</th><th>Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {[...points].reverse().map((p, i) => (
                    <tr key={`${p.date}-${i}`} className="border-b last:border-0">
                      <td className="py-2">{p.date}</td>
                      <td className="font-semibold">{p.score}</td>
                      <td className="text-muted-foreground">{p.severity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
};

export default LongitudinalOutcome;
