import { useMemo } from "react";
import { MessageSquareText, Quote, MapPin, Smile, Frown, Meh, Sparkles } from "lucide-react";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { Card } from "@/components/ui/card";
import { analyzeFreeTextIntel, type FreeTextFieldAnalysis } from "@/lib/irf/freeTextIntel";
import type { IrfReport } from "@/lib/irf/definition";

const sentTone = {
  positive: { label: "Positive", cls: "text-emerald-600", Icon: Smile, bar: "bg-emerald-500" },
  negative: { label: "Negative", cls: "text-rose-600", Icon: Frown, bar: "bg-rose-500" },
  neutral: { label: "Neutral", cls: "text-slate-500", Icon: Meh, bar: "bg-slate-400" },
} as const;

function SentimentBar({ s }: { s: { positive: number; negative: number; neutral: number } }) {
  const total = s.positive + s.negative + s.neutral || 1;
  const p = Math.round((s.positive / total) * 100);
  const n = Math.round((s.negative / total) * 100);
  const u = 100 - p - n;
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full">
      <div style={{ width: `${p}%` }} className="bg-emerald-500" title={`Positive ${p}%`} />
      <div style={{ width: `${u}%` }} className="bg-slate-400" title={`Neutral ${u}%`} />
      <div style={{ width: `${n}%` }} className="bg-rose-500" title={`Negative ${n}%`} />
    </div>
  );
}

function FieldPanel({ a }: { a: FreeTextFieldAnalysis }) {
  const maxTheme = Math.max(1, ...a.themes.map((t) => t.mentions));
  return (
    <div className="space-y-4 pt-1">
      {/* summary line */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span><strong className="text-foreground">{a.responses}</strong> responses</span>
        <span><strong className="text-foreground">{a.respondingLgas}</strong> LGA{a.respondingLgas === 1 ? "" : "s"}</span>
        <span className="inline-flex items-center gap-1"><Smile className="h-3 w-3 text-emerald-500" />{a.sentiment.positive}</span>
        <span className="inline-flex items-center gap-1"><Meh className="h-3 w-3 text-slate-400" />{a.sentiment.neutral}</span>
        <span className="inline-flex items-center gap-1"><Frown className="h-3 w-3 text-rose-500" />{a.sentiment.negative}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Themes */}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Dominant themes</p>
          {a.themes.length ? (
            <div className="space-y-1.5">
              {a.themes.map((t) => (
                <div key={t.theme} className="flex items-center gap-2 text-xs">
                  <span className="w-40 shrink-0 truncate text-foreground" title={t.theme}>{t.theme}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full" style={{ width: `${(t.mentions / maxTheme) * 100}%`, background: t.color }} />
                  </div>
                  <span className="w-14 shrink-0 text-right text-muted-foreground">{t.mentions} · {t.share}%</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground">No recognised themes.</p>}
        </div>

        {/* Key phrases */}
        <div>
          <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Recurring phrases</p>
          {a.phrases.length ? (
            <div className="flex flex-wrap gap-1.5">
              {a.phrases.map((p) => (
                <span key={p.phrase} className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground">
                  {p.phrase} <span className="text-muted-foreground">×{p.count}</span>
                </span>
              ))}
            </div>
          ) : <p className="text-xs text-muted-foreground">Not enough repeated phrasing yet.</p>}
        </div>
      </div>

      {/* Per-LGA breakdown */}
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><MapPin className="h-3.5 w-3.5 text-primary" /> By LGA</p>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[11px] text-muted-foreground">
                <th className="px-3 py-2 text-left font-semibold">LGA</th>
                <th className="px-3 py-2 text-right font-semibold">n</th>
                <th className="px-3 py-2 text-left font-semibold">Tone</th>
                <th className="px-3 py-2 text-left font-semibold">Top themes</th>
                <th className="px-3 py-2 text-left font-semibold">Representative voice</th>
              </tr>
            </thead>
            <tbody>
              {a.byLga.map((row) => (
                <tr key={row.lga} className="border-b align-top last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2 font-medium text-foreground">{row.lga}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{row.responses}</td>
                  <td className="px-3 py-2" style={{ minWidth: 90 }}><SentimentBar s={row.sentiment} /></td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {row.themes.slice(0, 3).map((t) => (
                        <span key={t.theme} className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ background: t.color }}>{t.theme} {t.count}</span>
                      ))}
                      {!row.themes.length && <span className="text-[11px] text-muted-foreground">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[11px] italic text-muted-foreground">{row.topQuote ? `“${row.topQuote}”` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Verbatim highlights */}
      {a.topQuotes.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Quote className="h-3.5 w-3.5" /> Verbatim highlights</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {a.topQuotes.map((q, i) => {
              const t = sentTone[q.sentiment as keyof typeof sentTone] ?? sentTone.neutral;
              return (
                <blockquote key={i} className={`rounded-lg border-l-4 bg-muted/40 p-3 text-xs ${t.bar.replace("bg-", "border-l-")}`}>
                  <p className="italic text-foreground">“{q.text}”</p>
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
                    <MapPin className="h-3 w-3" />{q.lga}
                    <span className={`ml-auto inline-flex items-center gap-1 ${t.cls}`}><t.Icon className="h-3 w-3" />{t.label}</span>
                  </p>
                </blockquote>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function IrfFreeTextIntel({ rows }: { rows: IrfReport[] }) {
  const groups = useMemo(() => analyzeFreeTextIntel(rows), [rows]);
  const totalResponses = useMemo(() => groups.reduce((s, g) => s + g.fields.reduce((x, f) => x + f.responses, 0), 0), [groups]);

  if (!totalResponses) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        <MessageSquareText className="mx-auto mb-2 h-7 w-7 opacity-40" />
        No form-scoped narrative responses captured yet.
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b bg-gradient-to-r from-violet-500/10 to-sky-500/10 p-4">
        <Sparkles className="h-4 w-4 text-primary" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Free-Text Intelligence by Form &amp; LGA</h3>
          <p className="text-[11px] text-muted-foreground">Form-scoped qualitative analysis — themes, sentiment, phrases &amp; verbatim voices for each narrative question</p>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">{totalResponses} narrative responses</span>
      </div>

      <div className="space-y-5 p-4">
        {groups.map((g) => {
          const active = g.fields.filter((f) => f.responses > 0);
          if (!active.length) return null;
          return (
            <div key={g.formId} className="rounded-xl border" style={{ borderColor: `${g.color}55` }}>
              <div className="flex items-center gap-2 rounded-t-xl border-b px-4 py-2.5" style={{ background: `${g.color}14` }}>
                <span className="h-3 w-3 rounded-full" style={{ background: g.color }} />
                <h4 className="text-sm font-semibold text-foreground">{g.formName} form</h4>
                <span className="ml-auto text-[11px] text-muted-foreground">{active.length} narrative field{active.length === 1 ? "" : "s"}</span>
              </div>
              <Accordion type="multiple" className="px-4">
                {active.map((f) => (
                  <AccordionItem key={f.field + f.label} value={f.field + f.label}>
                    <AccordionTrigger className="text-sm">
                      <span className="flex items-center gap-2 text-left">
                        {f.label}
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{f.responses} · {f.respondingLgas} LGA{f.respondingLgas === 1 ? "" : "s"}</span>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <FieldPanel a={f} />
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
