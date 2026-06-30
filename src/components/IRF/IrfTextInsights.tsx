import { useMemo } from "react";
import { MessageSquareText, Quote, Tags, Smile, Frown, Meh } from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell,
} from "recharts";
import { Card } from "@/components/ui/card";
import { analyzeText } from "@/lib/irf/textAnalysis";
import type { IrfReport } from "@/lib/irf/definition";

const chartMuted = "hsl(var(--muted-foreground))";
const chartBorder = "hsl(var(--border))";
const chartText = "hsl(var(--foreground))";
const tooltipStyle = { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: chartText };

export default function IrfTextInsights({ rows }: { rows: IrfReport[] }) {
  const a = useMemo(() => analyzeText(rows), [rows]);

  if (!a.totalEntries) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        <MessageSquareText className="mx-auto mb-2 h-7 w-7 opacity-40" />
        No narrative or free-text responses captured yet.
      </Card>
    );
  }

  const sentimentTotal = a.sentiment.positive + a.sentiment.negative + a.sentiment.neutral || 1;
  const sPos = Math.round((a.sentiment.positive / sentimentTotal) * 100);
  const sNeg = Math.round((a.sentiment.negative / sentimentTotal) * 100);
  const sNeu = 100 - sPos - sNeg;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b bg-gradient-to-r from-sky-500/10 to-violet-500/10 p-4">
        <MessageSquareText className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Narrative &amp; Free-Text Intelligence</h3>
        <span className="ml-auto text-xs text-muted-foreground">{a.totalEntries} responses · {a.totalWords.toLocaleString()} words</span>
      </div>

      <div className="space-y-5 p-4">
        {/* Sentiment band */}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Tone of qualitative responses</p>
          <div className="flex h-3 w-full overflow-hidden rounded-full">
            <div style={{ width: `${sPos}%` }} className="bg-emerald-500" title={`Positive ${sPos}%`} />
            <div style={{ width: `${sNeu}%` }} className="bg-slate-400" title={`Neutral ${sNeu}%`} />
            <div style={{ width: `${sNeg}%` }} className="bg-rose-500" title={`Negative ${sNeg}%`} />
          </div>
          <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Smile className="h-3.5 w-3.5 text-emerald-500" /> Positive {sPos}%</span>
            <span className="inline-flex items-center gap-1"><Meh className="h-3.5 w-3.5 text-slate-400" /> Neutral {sNeu}%</span>
            <span className="inline-flex items-center gap-1"><Frown className="h-3.5 w-3.5 text-rose-500" /> Negative {sNeg}%</span>
          </div>
        </div>

        {/* Themes */}
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Tags className="h-3.5 w-3.5" /> Dominant themes</p>
          <ResponsiveContainer width="100%" height={Math.max(160, a.themes.length * 34)}>
            <BarChart data={a.themes} layout="vertical" margin={{ left: 8, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartBorder} opacity={0.6} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: chartMuted }} />
              <YAxis type="category" dataKey="theme" width={150} tick={{ fontSize: 11, fill: chartMuted }} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: any, _n, p: any) => [`${v} mentions · ${p?.payload?.reports} reports`, "Theme"]} />
              <Bar dataKey="mentions" radius={[0, 4, 4, 0]}>
                {a.themes.map((t) => <Cell key={t.theme} fill={t.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Keyword cloud */}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Most frequent terms</p>
          <div className="flex flex-wrap gap-1.5">
            {a.keywords.slice(0, 24).map((k, i) => {
              const size = 11 + Math.min(9, Math.round((k.count / (a.keywords[0]?.count || 1)) * 9));
              return (
                <span key={k.word} className="rounded-full bg-muted px-2.5 py-1 font-medium text-foreground"
                  style={{ fontSize: size, opacity: 0.55 + 0.45 * (1 - i / 24) }}>
                  {k.word} <span className="text-muted-foreground">{k.count}</span>
                </span>
              );
            })}
          </div>
        </div>

        {/* Excerpts */}
        {a.excerpts.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Quote className="h-3.5 w-3.5" /> Representative voices from the field</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {a.excerpts.slice(0, 8).map((e, i) => (
                <blockquote key={i} className="rounded-lg border-l-4 border-primary/50 bg-muted/40 p-3 text-xs">
                  <p className="italic text-foreground">“{e.text}”</p>
                  <footer className="mt-1.5 text-[11px] text-muted-foreground">— {e.field}{e.lga ? ` · ${e.lga}` : ""}{e.period ? ` · ${e.period}` : ""}</footer>
                </blockquote>
              ))}
            </div>
          </div>
        )}

        {/* Field coverage */}
        {a.fieldCoverage.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Qualitative reporting completeness</p>
            <div className="space-y-1.5">
              {a.fieldCoverage.slice(0, 8).map((f) => (
                <div key={f.field} className="flex items-center gap-2 text-xs">
                  <span className="w-40 shrink-0 truncate text-muted-foreground">{f.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${f.pct}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right text-muted-foreground">{f.pct}% · {f.avgWords}w</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
