import { ReactNode } from "react";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommCarePageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  accent?: "teal" | "indigo" | "amber";
  leading?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * CommCare-inspired page header: solid accent bar + icon badge,
 * title with subtle slab tracking, subtitle muted, actions right-aligned.
 * Designed to feel like Dimagi's CommCare HQ banners while staying inside
 * our semantic design tokens.
 */
export function CommCarePageHeader({
  title,
  subtitle,
  icon: Icon,
  accent = "teal",
  leading,
  actions,
  className,
}: CommCarePageHeaderProps) {
  const accentBar =
    accent === "indigo"
      ? "bg-[hsl(231_48%_48%)]"
      : accent === "amber"
      ? "bg-[hsl(38_92%_50%)]"
      : "bg-[hsl(174_72%_28%)]";
  const accentSoft =
    accent === "indigo"
      ? "bg-[hsl(231_48%_48%/0.08)] text-[hsl(231_48%_38%)]"
      : accent === "amber"
      ? "bg-[hsl(38_92%_50%/0.12)] text-[hsl(28_85%_42%)]"
      : "bg-[hsl(174_72%_28%/0.08)] text-[hsl(174_72%_22%)]";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border border-border bg-card shadow-sm",
        className
      )}
    >
      <div className={cn("absolute inset-y-0 left-0 w-1.5", accentBar)} aria-hidden />
      <div className="flex flex-col gap-3 p-4 pl-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-5 sm:pl-6">
        <div className="flex items-start gap-3 min-w-0">
          {leading}
          {Icon && (
            <div
              className={cn(
                "hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
                accentSoft
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl truncate">
              {title}
            </h1>
            {subtitle && (
              <div className="mt-0.5 text-sm text-muted-foreground">{subtitle}</div>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
        )}
      </div>
    </div>
  );
}

export default CommCarePageHeader;
