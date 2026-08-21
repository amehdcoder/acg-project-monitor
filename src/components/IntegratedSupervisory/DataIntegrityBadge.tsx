/**
 * Compact "maths checked" badge. Shows whether every percentage, stacked
 * ranking and KPI on the panel reconciles with the raw KoboToolbox records.
 */
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertTriangle, ShieldCheck, ShieldX } from "lucide-react";
import type { ValidationReport } from "@/lib/isc/chartValidation";

export default function DataIntegrityBadge({
  report, label = "Data integrity",
}: { report: ValidationReport; label?: string }) {
  const hasIssues = report.issues.length > 0;
  const tone = !report.ok
    ? "bg-rose-100 text-rose-800 border-rose-200"
    : report.warnings > 0
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : "bg-emerald-100 text-emerald-800 border-emerald-200";
  const Icon = !report.ok ? ShieldX : report.warnings > 0 ? AlertTriangle : ShieldCheck;

  const text = !report.ok
    ? `${report.errors} inconsistenc${report.errors === 1 ? "y" : "ies"}`
    : report.warnings > 0
      ? `${report.warnings} caution${report.warnings === 1 ? "" : "s"}`
      : `${report.checks} checks passed`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="outline-none" aria-label={`${label}: ${text}`}>
          <Badge variant="outline" className={`cursor-pointer gap-1 text-[10px] font-semibold ${tone}`}>
            <Icon className="h-3 w-3" /> {text}
          </Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] p-3">
        <p className="text-xs font-semibold">{label}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {report.checks} assertion{report.checks === 1 ? "" : "s"} re-derived directly from the synced
          KoboToolbox submissions — percentages, stacked segment totals, denominators and KPI strips.
        </p>
        {!hasIssues ? (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
            <ShieldCheck className="h-3.5 w-3.5" /> Everything reconciles with the source records.
          </p>
        ) : (
          <ul className="mt-2 max-h-64 space-y-1.5 overflow-auto">
            {report.issues.map((i) => (
              <li key={i.id} className="rounded-md border bg-muted/30 px-2 py-1.5 text-[10px] leading-snug">
                <span className={`font-semibold ${i.severity === "error" ? "text-rose-700" : "text-amber-700"}`}>
                  {i.scope}
                </span>
                <span className="block text-muted-foreground">{i.message}</span>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
