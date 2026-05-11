import { CheckCircle2, AlertTriangle, XCircle, Circle, ShieldCheck, Compass } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { LqasComplianceResult, LqasPlan } from "./utils/lqas";

interface Props {
  compliance: LqasComplianceResult;
  plan: LqasPlan;
  recording: boolean;
}

const statusIcon = {
  pass: <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />,
  warn: <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />,
  fail: <XCircle className="h-3.5 w-3.5 text-red-600" />,
  pending: <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />,
} as const;

const statusRing = {
  pass: "border-green-500/30 bg-green-500/5",
  warn: "border-amber-500/40 bg-amber-500/5",
  fail: "border-red-500/40 bg-red-500/5",
  pending: "border-border bg-muted/30",
} as const;

const LQASCompliancePanel = ({ compliance, plan, recording }: Props) => {
  const { checks, score, ready } = compliance;
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold uppercase tracking-wide">
            WHO LQAS Lot Boundary
          </span>
          <Badge
            variant="outline"
            className="h-5 px-1.5 text-[10px] border-primary/40 text-primary"
            title="Lot Quality Assurance Sampling — WHO/EPI standard for community-level coverage decisions"
          >
            n={plan.n} · d={plan.d}
          </Badge>
        </div>
        <Badge
          variant={ready ? "default" : "secondary"}
          className={`h-5 px-2 text-[10px] tabular-nums ${ready ? "bg-green-600 hover:bg-green-600" : ""}`}
        >
          {ready ? "Ready" : recording ? "In progress" : "Not started"} · {score}%
        </Badge>
      </div>

      <Progress
        value={score}
        className="h-1.5"
        aria-label={`LQAS lot readiness ${score} percent`}
      />

      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {checks.map((c) => (
          <li
            key={c.id}
            className={`flex items-start gap-2 rounded-md border px-2 py-1.5 text-[11px] ${statusRing[c.status]}`}
          >
            <span className="mt-0.5 shrink-0">{statusIcon[c.status]}</span>
            <div className="min-w-0">
              <div className="font-medium leading-tight">{c.label}</div>
              <div className="text-muted-foreground leading-snug">{c.detail}</div>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex items-start gap-1.5 text-[10px] text-muted-foreground border-t border-border pt-1.5">
        <Compass className="h-3 w-3 mt-0.5 shrink-0" />
        <span>{plan.rationale}</span>
      </div>
    </div>
  );
};

export default LQASCompliancePanel;
