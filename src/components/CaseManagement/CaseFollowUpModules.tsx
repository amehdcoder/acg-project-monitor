import { FormGroup } from "@/components/FormBuilder/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Repeat, Layers, Play, ListChecks, Sparkles, Lock } from "lucide-react";
import { getFollowUpIcon } from "@/components/FormFiller/followUpIcons";

interface CaseFollowUpModulesProps {
  groups: FormGroup[];
  caseTypeLabel?: string;
  /** Optional per-module completion counts keyed by group id/name */
  completedCounts?: Record<string, number>;
  /** Modules are only actionable once the case registration is finalized. */
  active?: boolean;
  onLaunch?: (group: FormGroup) => void;
}

/**
 * Premium presentation of a case's follow-up modules inside the Cases page.
 * Each follow-up question group becomes an actionable, richly-styled module
 * card — intentionally far more polished than the in-form module catalogue.
 */
const CaseFollowUpModules = ({
  groups,
  caseTypeLabel,
  completedCounts = {},
  active = true,
  onLaunch,
}: CaseFollowUpModulesProps) => {
  if (!groups || groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/20 py-16 text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Layers className="h-7 w-7" />
        </div>
        <p className="font-display text-base font-semibold text-foreground">No follow-up modules</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          This case type has no follow-up groups configured yet. Add grouped
          questions to the registration form to surface them here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/12 via-accent/8 to-transparent p-5">
        <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-accent/15 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-accent/30 text-primary ring-1 ring-primary/25">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h3 className="font-display text-lg font-semibold text-foreground">
              Follow-up Modules
            </h3>
            <p className="text-sm text-muted-foreground">
              Longitudinal visits for this {caseTypeLabel || "case"}. Launch a
              module to record the next round of follow-up.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1 text-[11px]">
                <ListChecks className="h-3 w-3" />
                {groups.length} module{groups.length !== 1 ? "s" : ""}
              </Badge>
              {!active && (
                <Badge variant="outline" className="gap-1 text-[11px] text-amber-600 border-amber-400/60">
                  <Lock className="h-3 w-3" />
                  Locked until registration is finalized
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {!active && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-300/50 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/20 dark:text-amber-300">
          <Lock className="h-4 w-4 shrink-0" />
          <p>
            Follow-up visits activate automatically once this case's registration
            form is submitted and finalized.
          </p>
        </div>
      )}

      {/* Module grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {groups.map((group, idx) => {
          const Icon = getFollowUpIcon(group.label, group.name);
          const count = group.questions?.length ?? 0;
          const done = completedCounts[group.id] ?? completedCounts[group.name] ?? 0;
          return (
            <div
              key={group.id}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/80 p-5 shadow-soft backdrop-blur-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-card"
            >
              {/* Accent rail */}
              <span className="absolute left-0 top-0 h-full w-1.5 bg-gradient-to-b from-primary via-accent to-primary/40" />

              <div className="flex items-start gap-3">
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 text-primary ring-1 ring-primary/15">
                  <Icon className="h-6 w-6" />
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow">
                    {idx + 1}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <h4
                    className="truncate font-display text-[15px] font-semibold text-foreground"
                    dangerouslySetInnerHTML={{
                      __html: group.label || group.name || `Module ${idx + 1}`,
                    }}
                  />
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {count} question{count !== 1 ? "s" : ""}
                    </Badge>
                    {group.repeat && (
                      <Badge variant="outline" className="gap-1 text-[10px] font-normal text-primary">
                        <Repeat className="h-3 w-3" />
                        Repeatable
                      </Badge>
                    )}
                    {done > 0 && (
                      <Badge variant="secondary" className="text-[10px] font-normal">
                        {done} recorded
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {onLaunch && (
                <Button
                  size="sm"
                  variant="acg"
                  className="mt-4 w-full justify-center"
                  disabled={!active}
                  onClick={() => active && onLaunch(group)}
                >
                  {active ? (
                    <>
                      <Play className="mr-1.5 h-4 w-4" />
                      Start visit
                    </>
                  ) : (
                    <>
                      <Lock className="mr-1.5 h-4 w-4" />
                      Locked
                    </>
                  )}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CaseFollowUpModules;
