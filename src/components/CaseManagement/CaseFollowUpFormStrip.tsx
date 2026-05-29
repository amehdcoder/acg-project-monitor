import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Lock, Layers } from "lucide-react";
import { getFollowUpIcon } from "@/components/FormFiller/followUpIcons";

export interface FollowUpFormModule {
  id: string;
  name: string;
  description?: string | null;
  action?: "update" | "close" | string;
}

interface CaseFollowUpFormStripProps {
  forms: FollowUpFormModule[];
  /** Modules are only fillable once the case registration exists (case is open). */
  active?: boolean;
  onLaunch: (formId: string) => void;
}

/**
 * Inline, richly-styled catalogue of the follow-up forms available for a case.
 * Rendered directly on the Cases page beneath an open case. Each follow-up form
 * becomes an actionable module that activates once the case is registered.
 */
const CaseFollowUpFormStrip = ({ forms, active = true, onLaunch }: CaseFollowUpFormStripProps) => {
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
    <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {forms.map((form, idx) => {
        const Icon = getFollowUpIcon(form.name, form.name);
        const isClose = form.action === "close";
        return (
          <div
            key={form.id}
            className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border/60 bg-card/80 p-3 shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card"
          >
            <span className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-primary via-accent to-primary/40" />
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 text-primary ring-1 ring-primary/15">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="truncate text-sm font-semibold text-foreground">{form.name}</h4>
              <div className="mt-0.5 flex items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] font-normal">
                  {isClose ? "Close case" : "Follow-up visit"}
                </Badge>
              </div>
            </div>
            <Button
              size="sm"
              variant={isClose ? "outline" : "acg"}
              className="h-8 shrink-0 gap-1"
              disabled={!active}
              onClick={(e) => {
                e.stopPropagation();
                if (active) onLaunch(form.id);
              }}
            >
              {active ? <Play className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{active ? "Start" : "Locked"}</span>
            </Button>
          </div>
        );
      })}
    </div>
  );
};

export default CaseFollowUpFormStrip;
