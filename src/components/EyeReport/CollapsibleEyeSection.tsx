import { useState, type ComponentType, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  title: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
}

/** Heavy evidence sections (scorecard, map, trajectory) stay collapsed until opened, so nothing below loads while hidden. */
export default function CollapsibleEyeSection({ title, hint, icon: Icon, children }: Props) {
  const [open, setOpen] = useState(false);
  const bar = (
    <button
      type="button"
      onClick={() => setOpen((o) => !o)}
      aria-expanded={open}
      className="flex w-full items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-left shadow-sm transition-colors hover:bg-accent/40"
    >
      <span className="flex min-w-0 items-center gap-3">
        <Icon className="h-5 w-5 shrink-0 text-eye-teal" />
        <span className="min-w-0">
          <span className={`block truncate font-bold text-eye-deep ${open ? "text-xs uppercase tracking-wider text-eye-teal" : "text-sm"}`}>{title}</span>
          {hint && !open && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-eye-teal/10 px-3 py-1 text-xs font-semibold text-eye-teal">
        {open ? "Hide" : "Show"}
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </span>
    </button>
  );
  if (!open) return <section aria-label={title}>{bar}</section>;
  return (
    <section aria-label={title} className="space-y-2">
      {bar}
      {children}
    </section>
  );
}
