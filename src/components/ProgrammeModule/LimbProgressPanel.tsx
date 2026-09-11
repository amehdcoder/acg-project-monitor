// MMDP / NTD progression — side-by-side pictures, measurement trend and the
// on-device model's verdict on whether the swelling has visibly reduced.

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { TrendingDown, TrendingUp, Minus, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { assessLimbProgress, SITE_LABELS } from "@/lib/programmeModule/limbProgress";
import { mmdpVisits } from "@/lib/programmeModule/mmdp";
import { resolveMediaUrl } from "@/lib/programmeModule/media";
import type { BeneficiaryServiceRow } from "@/lib/programmeModule/types";

const fmt = (d: string) =>
  new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" });

const LimbProgressPanel = ({ services }: { services: BeneficiaryServiceRow[] }) => {
  const visits = useMemo(() => mmdpVisits(services), [services]);
  const [photos, setPhotos] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        visits.filter((v) => v.photo).map(async (v) => [v.id, await resolveMediaUrl(v.photo)] as const),
      );
      if (!cancelled) setPhotos(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
  }, [visits]);

  const assessment = useMemo(
    () => assessLimbProgress(
      visits.map((v) => ({ date: v.date, measurements: v.measurements })),
      visits.map((v) => v.imageSignal),
    ),
    [visits],
  );

  if (!visits.length) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Record a limb-care or hydrocoele visit with measurements and a picture to start outcome tracking.
      </Card>
    );
  }

  const chartData = visits.map((v) => {
    const row: Record<string, string | number> = { date: fmt(v.date) };
    v.measurements.forEach((m) => { row[m.site] = m.cm; });
    return row;
  });
  const siteKeys = Array.from(new Set(visits.flatMap((v) => v.measurements.map((m) => m.site))));
  const colors = ["#0F7E4F", "#2563EB", "#D97706", "#7C3AED", "#DC2626"];

  const Icon = assessment.verdict === "reduction" ? TrendingDown
    : assessment.verdict === "increase" ? TrendingUp : Minus;
  const tone = assessment.verdict === "reduction"
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
    : assessment.verdict === "increase"
      ? "border-red-500/30 bg-red-500/10 text-red-700"
      : "border-slate-400/30 bg-muted text-muted-foreground";

  const first = visits[0];
  const last = visits[visits.length - 1];

  return (
    <div className="space-y-4">
      <Card className={cn("border p-4", tone)}>
        <p className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4" /> {assessment.headline}</p>
        <p className="mt-1 text-sm opacity-90">{assessment.detail}</p>
        {assessment.verdict !== "insufficient" && (
          <Badge variant="outline" className="mt-2 border-current bg-background/60">
            Model confidence {Math.round(assessment.confidence * 100)}%
          </Badge>
        )}
        <p className="mt-2 flex items-start gap-1 text-xs opacity-80">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          The app compares measurements and pictures on this device to support — never replace — the clinician's judgement.
        </p>
      </Card>

      {(first.photo || last.photo) && (
        <Card className="p-4">
          <h3 className="mb-3 font-semibold text-foreground">Baseline vs latest picture</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {[first, last].map((v, i) => (
              <div key={`${v.id}-${i}`} className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {i === 0 ? "Baseline" : "Latest"} · {fmt(v.date)}
                </p>
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
                  {photos[v.id]
                    ? <img src={photos[v.id]} alt={`${i === 0 ? "Baseline" : "Latest"} clinical picture`} className="h-full w-full object-cover" />
                    : <span className="text-xs text-muted-foreground">No picture at this visit</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <h3 className="mb-3 font-semibold text-foreground">Measurement trend (cm)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              {siteKeys.map((k, i) => (
                <Line key={k} type="monotone" dataKey={k} name={SITE_LABELS[k] || k}
                  stroke={colors[i % colors.length]} strokeWidth={2} dot />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="mb-3 font-semibold text-foreground">Baseline to latest, by site</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead><TableHead>Baseline</TableHead>
                <TableHead>Latest</TableHead><TableHead>Change</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assessment.sites.map((s) => (
                <TableRow key={s.site}>
                  <TableCell>{SITE_LABELS[s.site] || s.site}</TableCell>
                  <TableCell>{s.baseline} cm</TableCell>
                  <TableCell>{s.latest} cm</TableCell>
                  <TableCell className={s.change < 0 ? "text-emerald-700" : s.change > 0 ? "text-red-700" : ""}>
                    {s.change > 0 ? "+" : ""}{s.change} cm ({s.percent > 0 ? "+" : ""}{s.percent}%)
                  </TableCell>
                </TableRow>
              ))}
              {assessment.sites.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">
                  Record a second visit to compare measurements.
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};

export default LimbProgressPanel;
