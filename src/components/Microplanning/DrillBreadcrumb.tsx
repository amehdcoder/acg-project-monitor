import { ChevronRight, Home, Undo2, Layers, Accessibility } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface DrillCrumb {
  label: string;
  value: string;
  /** Clears this level (and everything below it). */
  onClear?: () => void;
}

interface Props {
  crumbs: DrillCrumb[];
  /** Which disaggregation the current drill-through came from. */
  origin?: "disability" | "accessibility" | "security" | "terrain" | "keyRatio" | "summary" | null;
  onBack?: () => void;
  onReset?: () => void;
}

const ORIGIN_LABEL: Record<string, string> = {
  disability: "Disability Types",
  accessibility: "Accessibility",
  security: "Security Clearance",
  terrain: "Terrain Types",
  keyRatio: "Key Ratios",
  summary: "Summary breakdown",
};

/**
 * Breadcrumb trail for every drill-through page, plus a one-click return to the
 * disaggregation (Disability Types / Summary) for the same LGA → Ward context.
 */
const DrillBreadcrumb = ({ crumbs, origin, onBack, onReset }: Props) => {
  if (!crumbs.length && !origin) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap rounded-md border border-border/60 bg-muted/40 px-3 py-1.5">
      <Home className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
      <nav aria-label="Breadcrumb" className="flex items-center gap-1 flex-wrap text-[11px]">
        {crumbs.map((c, i) => (
          <span key={`${c.label}-${c.value}`} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            <button
              type="button"
              onClick={c.onClear}
              disabled={!c.onClear}
              className={`rounded px-1.5 py-0.5 ${c.onClear ? "hover:bg-background hover:underline" : "cursor-default"}`}
              title={c.onClear ? `Clear ${c.label}` : undefined}
            >
              <span className="text-muted-foreground">{c.label}:</span>{" "}
              <span className="font-medium text-foreground">{c.value}</span>
            </button>
          </span>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-1.5">
        {origin && onBack && (
          <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={onBack}>
            {origin === "summary" ? <Layers className="h-3.5 w-3.5" /> : <Accessibility className="h-3.5 w-3.5" />}
            Back to {ORIGIN_LABEL[origin] ?? "disaggregation"}
          </Button>
        )}
        {onReset && (
          <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1" onClick={onReset}>
            <Undo2 className="h-3.5 w-3.5" /> Reset drill-through
          </Button>
        )}
      </div>
    </div>
  );
};

export default DrillBreadcrumb;
