import { useMemo, useState } from "react";
import {
  Lightbulb, Target, MessageSquareText, AlertTriangle, ShieldAlert,
  CheckCircle2, Zap, CalendarClock, FileSpreadsheet, ArrowRight, Info, Loader2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  buildNarrative,
  type NarrativeSubmission, type NarrativeQuestion, type NarrativeConfig,
  type NarrativeItem, type Tone,
} from "@/lib/narrativeInsights";
import { exportActionListExcel } from "@/lib/insightsExcel";
import { toast } from "@/hooks/use-toast";

import AdvancedAnalyticsPanel from "@/components/shared/AdvancedAnalyticsPanel";
import AfterHoursSubmissionsLog from "@/components/shared/AfterHoursSubmissionsLog";
import type { AdvancedAnalyticsOptions } from "@/lib/advancedAnalytics";


interface Props {
  submissions: NarrativeSubmission[];
  questions: NarrativeQuestion[];
  config?: NarrativeConfig;
  /** Optional accent colour (defaults to a professional teal). */
  accent?: string;
  className?: string;
  /** When set, an Advanced Analytics panel (Random Forest, Monte Carlo,
   *  Grounded Theory, Discourse Analysis, hypothesis tests) is rendered too. */
  advanced?: boolean;
  advancedOptions?: AdvancedAnalyticsOptions;
  /** When set, an after-hours submissions log is rendered; the array (when
   *  provided) restricts the log to those gated submission tables. */
  afterHoursLog?: boolean;
  afterHoursTables?: string[];
}

const toneStyles: Record<Tone, { icon: typeof AlertTriangle; color: string; bg: string }> = {
  positive: { icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
  warning: { icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30" },
  critical: { icon: ShieldAlert, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30" },
  neutral: { icon: Info, color: "text-muted-foreground", bg: "bg-muted/40" },
};

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const slug = (s: string) => (s || "list").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export default function NarrativeInsightsPanel({
  submissions, questions, config, accent = "#0EA5A5", className,
  advanced = false, advancedOptions,
  afterHoursLog = false, afterHoursTables,
}: Props) {
  const n = useMemo(
    () => buildNarrative(submissions || [], questions || [], config || {}),
    [submissions, questions, config],
  );

  const ItemRow = ({ item }: { item: NarrativeItem }) => {
    const st = toneStyles[item.tone];
    const Icon = st.icon;
    const list = item.listId ? n.actionLists[item.listId] : undefined;
    return (
      <li className={`flex flex-col gap-2 rounded-lg p-3 ${st.bg}`}>
        <div className="flex items-start gap-2.5">
          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${st.color}`} />
          <span className="text-sm leading-relaxed text-foreground">{item.text}</span>
        </div>
        {list && list.rows.length > 0 && (
          <button
            type="button"
            onClick={() => downloadCsv(`${slug(list.title)}.csv`, actionListToCsv(list))}
            className="ml-6 inline-flex w-fit items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Download className="h-3.5 w-3.5" />
            Download {list.title.toLowerCase()} ({list.rows.length})
          </button>
        )}
      </li>
    );
  };

  return (
    <Card className={`overflow-hidden border-l-4 ${className || ""}`} style={{ borderLeftColor: accent }}>
      <div className="flex items-center gap-2 border-b p-4" style={{ background: `linear-gradient(90deg, ${accent}1a, transparent)` }}>
        <MessageSquareText className="h-4 w-4" style={{ color: accent }} />
        <h3 className="text-sm font-semibold text-foreground">Plain-Language Insights &amp; Recommended Actions</h3>
        <span className="ml-auto hidden text-[11px] uppercase tracking-wide text-muted-foreground sm:inline">Auto-generated</span>
      </div>

      <div className="space-y-5 p-4">
        {/* Purpose */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <Target className="h-4 w-4" style={{ color: accent }} />
            <h4 className="text-sm font-semibold text-foreground">Why this data is collected</h4>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">{n.purpose}</p>
          {n.purposeBullets.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {n.purposeBullets.map((b, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-muted-foreground">
                  <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0" style={{ color: accent }} />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Summary */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <Lightbulb className="h-4 w-4" style={{ color: accent }} />
            <h4 className="text-sm font-semibold text-foreground">What the data is saying</h4>
          </div>
          <div className="space-y-2">
            {n.summary.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-foreground">{p}</p>
            ))}
          </div>
        </section>

        {/* Issues */}
        {n.hasData && n.issues.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h4 className="text-sm font-semibold text-foreground">Issues detected</h4>
            </div>
            <ul className="space-y-2">
              {n.issues.map((it, i) => <ItemRow key={i} item={it} />)}
            </ul>
          </section>
        )}

        {/* Immediate actions */}
        {n.hasData && n.immediateActions.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <Zap className="h-4 w-4 text-red-500" />
              <h4 className="text-sm font-semibold text-foreground">Do now (real-time)</h4>
            </div>
            <ul className="space-y-2">
              {n.immediateActions.map((it, i) => <ItemRow key={i} item={it} />)}
            </ul>
          </section>
        )}

        {/* Future planning */}
        {n.hasData && n.futureActions.length > 0 && (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <CalendarClock className="h-4 w-4" style={{ color: accent }} />
              <h4 className="text-sm font-semibold text-foreground">For future planning</h4>
            </div>
            <ul className="space-y-2">
              {n.futureActions.map((it, i) => <ItemRow key={i} item={it} />)}
            </ul>
          </section>
        )}

        <p className="border-t pt-3 text-[11px] text-muted-foreground">{n.dataCoverageNote}</p>
      </div>
      {advanced && (
        <div className="border-t p-4">
          <AdvancedAnalyticsPanel
            submissions={submissions}
            questions={questions}
            options={advancedOptions}
            accent="#7C3AED"
          />
        </div>
      )}
      {afterHoursLog && (
        <div className="border-t p-4">
          <AfterHoursSubmissionsLog tables={afterHoursTables} accent="#6366F1" />
        </div>
      )}
    </Card>
  );
}
