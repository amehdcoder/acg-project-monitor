import { useState, type ReactNode, type ElementType } from "react";
import { ChevronDown } from "lucide-react";

interface CollapsibleSectionProps {
  title: string;
  icon?: ElementType;
  /** Short summary shown in the header while collapsed. */
  summary?: ReactNode;
  /** Optional badge / count pill shown on the right of the header. */
  badge?: ReactNode;
  /** Accent colour (hex) for the icon chip and left rail. */
  tint?: string;
  /** Collapsed on first render when true (default true for executive density). */
  defaultCollapsed?: boolean;
  children: ReactNode;
}

/**
 * Executive-grade collapsible section wrapper.
 * A clean, rounded, subtly-shadowed container with a summarised header that the
 * user can expand/collapse — used to keep the MDA supervisory dashboard scannable.
 */
export default function CollapsibleSection({
  title,
  icon: Icon,
  summary,
  badge,
  tint = "#2563eb",
  defaultCollapsed = true,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(!defaultCollapsed);
  const panelId = `sec-${title.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
        style={{ borderLeft: `3px solid ${tint}` }}
      >
        {Icon && (
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: `${tint}1a`, color: tint }}
          >
            <Icon className="h-4.5 w-4.5" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{title}</span>
          {summary && !open && (
            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{summary}</span>
          )}
        </span>
        {badge != null && (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: `${tint}1a`, color: tint }}>
            {badge}
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div id={panelId} className="space-y-4 border-t border-border/60 p-4">
          {children}
        </div>
      )}
    </section>
  );
}
