import { useMemo } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Stethoscope,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  Info,
  Sparkles,
} from "lucide-react";
import { diagnose, applyAllFixes, DoctorIssue } from "@/lib/snapToForm/formDoctor";
import type { ParsedForm } from "@/lib/snapToForm/formParser";
import { cn } from "@/lib/utils";

interface FormDoctorPanelProps {
  form: ParsedForm;
  onApplyAll: (next: ParsedForm) => void;
  onApplyOne: (next: ParsedForm) => void;
}

const severityIcon = (s: DoctorIssue["severity"]) => {
  if (s === "error") return <AlertTriangle className="h-3.5 w-3.5 text-destructive" />;
  if (s === "warn") return <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />;
  return <Info className="h-3.5 w-3.5 text-primary" />;
};

const scoreColor = (score: number) => {
  if (score >= 85) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-destructive";
};

const FormDoctorPanel = ({ form, onApplyAll, onApplyOne }: FormDoctorPanelProps) => {
  const report = useMemo(() => diagnose(form), [form]);
  const fixableCount = report.issues.filter((i) => i.fixable).length;

  return (
    <div className="rounded-lg border border-border bg-gradient-to-br from-primary/5 via-card to-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Stethoscope className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold text-sm">Form Doctor</div>
            <div className="text-[11px] text-muted-foreground">
              Runs entirely in-app — no AI credits used
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className={cn("text-2xl font-display font-bold", scoreColor(report.score))}>
            {report.score}
          </div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Quality score
          </div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: "Complete", value: report.completenessScore },
          { label: "Validated", value: report.validationScore },
          { label: "A11y", value: report.accessibilityScore },
          { label: "Unique", value: report.duplicateScore },
        ].map((m) => (
          <div key={m.label} className="space-y-1">
            <div className="text-[10px] uppercase text-muted-foreground">{m.label}</div>
            <Progress value={m.value} className="h-1.5" />
            <div className={cn("text-xs font-mono", scoreColor(m.value))}>{m.value}</div>
          </div>
        ))}
      </div>

      {report.issues.length === 0 ? (
        <Alert className="border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/10">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          <AlertDescription className="text-xs">
            All checks passed. Your form looks great!
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <ScrollArea className="max-h-[180px] rounded-md border border-border bg-background/60">
            <ul className="divide-y divide-border">
              {report.issues.map((issue) => (
                <li key={issue.id} className="flex items-start gap-2 p-2 text-xs">
                  {severityIcon(issue.severity)}
                  <div className="flex-1 min-w-0">
                    <div className="text-foreground">{issue.message}</div>
                    <Badge variant="outline" className="text-[9px] mt-0.5 font-normal">
                      {issue.category}
                    </Badge>
                  </div>
                  {issue.fixable && issue.apply && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[10px]"
                      onClick={() => onApplyOne(issue.apply!(form))}
                    >
                      <Wrench className="h-3 w-3 mr-1" /> Fix
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </ScrollArea>

          {fixableCount > 0 && (
            <Button
              size="sm"
              variant="acg"
              className="w-full"
              onClick={() => onApplyAll(applyAllFixes(form, report))}
            >
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              Apply all {fixableCount} fix{fixableCount !== 1 ? "es" : ""}
            </Button>
          )}
        </>
      )}
    </div>
  );
};

export default FormDoctorPanel;
