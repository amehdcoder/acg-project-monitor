import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Lock, Layers, CheckCircle2 } from "lucide-react";
import { getFollowUpIcon } from "@/components/FormFiller/followUpIcons";

export interface FollowUpFormModule {
  id: string;
  name: string;
  description?: string | null;
  action?: "update" | "close" | string;
  questionCount?: number;
  status?: string;
  caseTypeId?: string;
  caseTypeLabel?: string;
}

interface CaseFollowUpFormStripProps {
  forms: FollowUpFormModule[];
  /** Modules are only fillable once the case registration exists (case is open). */
  active?: boolean;
  getActive?: (form: FollowUpFormModule) => boolean;
  onLaunch: (formId: string) => void;
}

/**
 * Inline, richly-styled catalogue of the follow-up forms available for a case.
 * Rendered directly on the Cases page beneath an open case. Each follow-up form
 * becomes an actionable module that activates once the case is registered.
 */
const CaseFollowUpFormStrip = ({ forms, active = true, getActive, onLaunch }: CaseFollowUpFormStripProps) => {
  if (!forms || forms.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-border/60 bg-muted/20 px-4 py-5 text-center">
        <Layers className="mx-auto mb-1.5 h-5 w-5 text-muted-foreground/60" />
        <p className="text-xs text-muted-foreground">
          No follow-up modules configured for this case type yet.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
      {forms.map((form, idx) => {
        const Icon = getFollowUpIcon(form.name, form.name);
        const isClose = form.action === "close";
        const isActive = getActive ? getActive(form) : active;
        return (
          <div
            key={form.id}
            className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border/60 bg-card/90 p-3 shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card"
          >
            <span className="absolute inset-0 opacity-35 [background-image:radial-gradient(circle_at_12%_18%,hsl(var(--destructive)/.18)_0_8px,transparent_9px),radial-gradient(circle_at_88%_22%,hsl(var(--primary)/.18)_0_7px,transparent_8px),radial-gradient(circle_at_78%_82%,hsl(var(--accent)/.22)_0_9px,transparent_10px)]" />
            <span className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-destructive via-primary to-accent" />
            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 text-primary ring-1 ring-primary/15">
              <Icon className="h-5 w-5" />
            </div>
            <div className="relative min-w-0 flex-1">
              <h4 className="truncate text-sm font-semibold text-foreground">{form.name}</h4>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] font-normal">
                  {isClose ? "Close case" : "Follow-up visit"}
                </Badge>
                {form.questionCount != null && (
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    {form.questionCount} field{form.questionCount === 1 ? "" : "s"}
                  </Badge>
                )}
                {isActive && (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant={isClose ? "outline" : "acg"}
              className="h-8 shrink-0 gap-1"
              disabled={!isActive}
              onClick={(e) => {
                e.stopPropagation();
                if (isActive) onLaunch(form.id);
              }}
            >
              {isActive ? <Play className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{isActive ? "Start" : "Locked"}</span>
            </Button>
          </div>
        );
      })}
    </div>
  );
};

export default CaseFollowUpFormStrip;
