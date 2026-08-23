/**
 * Amehnities AI — divergence guardrail banner.
 *
 * The training worker pauses itself when it detects a numerical breakdown,
 * exploding gradients or a loss explosion. This surfaces exactly what tripped,
 * the metrics at the moment of failure, and concrete fixes the operator can
 * apply before resuming.
 */
import { AlertTriangle, RotateCcw, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { DivergenceAlert as AlertType } from "@/hooks/useAmehnitiesBrain";

interface Props {
  alert: AlertType | null;
  onDismiss: () => void;
  onResume: () => void;
  onRollback?: () => void;
  canRollback?: boolean;
}

const REASON_LABEL: Record<string, string> = {
  nan: "Numerical breakdown",
  grad: "Exploding gradients",
  loss: "Loss explosion",
};

export default function DivergenceAlert({ alert, onDismiss, onResume, onRollback, canRollback }: Props) {
  if (!alert) return null;

  return (
    <Card className="relative overflow-hidden border-destructive/50 bg-destructive/5 p-4">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-destructive to-transparent" />
      <div className="flex flex-wrap items-start gap-3">
        <div className="rounded-lg bg-destructive/15 p-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="min-w-[220px] flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-destructive">
              {REASON_LABEL[alert.reason] ?? "Training halted"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {new Date(alert.at).toLocaleTimeString()}
            </span>
          </div>
          <h4 className="mt-1.5 text-sm font-semibold text-foreground">{alert.title}</h4>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{alert.detail}</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(alert.metrics).map(([k, v]) => (
              <div key={k} className="rounded-md border border-border/60 bg-background/70 px-2 py-1">
                <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{k}</div>
                <div className="font-mono text-xs tabular-nums text-foreground">
                  {Number.isFinite(v) ? (Math.abs(v) >= 1000 ? v.toExponential(2) : v.toFixed(4)) : String(v)}
                </div>
              </div>
            ))}
          </div>

          {alert.suggestions?.length > 0 && (
            <ul className="mt-3 space-y-1">
              {alert.suggestions.map((s, i) => (
                <li key={i} className="flex gap-2 text-xs text-foreground/90">
                  <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {canRollback && (
              <Button size="sm" variant="outline" onClick={onRollback} className="h-8 gap-1.5 text-xs">
                <RotateCcw className="h-3.5 w-3.5" />
                Roll back to best checkpoint
              </Button>
            )}
            <Button size="sm" onClick={onResume} className="h-8 text-xs">
              Resume training
            </Button>
            <Button size="sm" variant="ghost" onClick={onDismiss} className="h-8 gap-1.5 text-xs">
              <X className="h-3.5 w-3.5" />
              Dismiss
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
