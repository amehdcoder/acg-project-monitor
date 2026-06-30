import { useMemo } from "react";
import { Lightbulb, TrendingUp, AlertTriangle, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { analyzeFields, interpretDataset } from "@/lib/irf/fieldAnalysis";
import type { IrfReport } from "@/lib/irf/definition";

interface Props {
  rows: IrfReport[];
  stats: { peopleReached: number; stakeholdersEngaged: number; ncTotal: number; ncResolved: number; ncResolutionRate: number; awarenessActivities: number; lgas: number; totalReports: number };
  duplicateCount: number;
}

const toneIcon = { positive: TrendingUp, warning: AlertTriangle, neutral: Minus } as const;
const toneColor = {
  positive: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  neutral: "text-muted-foreground",
} as const;

export default function IrfInterpretation({ rows, stats, duplicateCount }: Props) {
  const interp = useMemo(() => {
    const fields = analyzeFields(rows);
    return interpretDataset(rows, stats, fields, duplicateCount);
  }, [rows, stats, duplicateCount]);

  return (
    <Card className="overflow-hidden border-l-4 border-l-[#0b5394]">
      <div className="flex items-center gap-2 border-b bg-gradient-to-r from-[#0b5394]/10 to-transparent p-4">
        <Lightbulb className="h-4 w-4 text-[#0b5394]" />
        <h3 className="text-sm font-semibold text-foreground">Executive Interpretation</h3>
        <span className="ml-auto text-[11px] uppercase tracking-wide text-muted-foreground">Auto-generated</span>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-sm font-medium leading-relaxed text-foreground">{interp.headline}</p>
        {interp.bullets.length > 0 && (
          <ul className="space-y-2.5">
            {interp.bullets.map((b, i) => {
              const Icon = toneIcon[b.tone];
              return (
                <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${toneColor[b.tone]}`} />
                  <span className="text-muted-foreground">{b.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
