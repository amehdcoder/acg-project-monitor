import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Lock, Layers, CheckCircle2, FolderKanban, FileText, CalendarClock } from "lucide-react";
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
  /** Originating form name — used to group modules in the UI. */
  formName?: string;
}

interface CaseFollowUpFormStripProps {
  forms: FollowUpFormModule[];
  /** Project the case belongs to — shown as the top-level grouping header. */
  projectName?: string;
  /** Modules are only fillable once the case registration exists (case is open). */
  active?: boolean;
  getActive?: (form: FollowUpFormModule) => boolean;
  /**
   * When true the follow-up is not yet due — modules stay visible but cannot be
   * opened until `availableOnLabel`.
   */
  notYetDue?: boolean;
  /** Human-readable date the follow-up becomes fillable (e.g. "Mar 4, 2026"). */
  availableOnLabel?: string;
  onLaunch: (formId: string) => void;
}

/**
 * Inline, richly-styled catalogue of the follow-up forms available for a case.
 * Rendered directly on the Cases page beneath an open case. Modules are
 * organized by Project → Form so large follow-up libraries stay readable.
 */
const CaseFollowUpFormStrip = ({
  forms,
  projectName,
  active = true,
  getActive,
  notYetDue = false,
  availableOnLabel,
  onLaunch,
}: CaseFollowUpFormStripProps) => {
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

  // Group modules by their originating form so each form's follow-up modules
  // appear together under a clear heading.
  const groups = new Map<string, FollowUpFormModule[]>();
  for (const form of forms) {
    const key = form.formName || "Follow-up Forms";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(form);
  }

  const renderCard = (form: FollowUpFormModule) => {
    const Icon = getFollowUpIcon(form.name, form.name);
    const isClose = form.action === "close";
    const isActive = getActive ? getActive(form) : active;
    return (
      <div
        key={form.id}
        className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border/60 bg-card/90 p-3 shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card"
      >
        <span className="pointer-events-none absolute inset-0 opacity-35 [background-image:radial-gradient(circle_at_12%_18%,hsl(var(--destructive)/.18)_0_8px,transparent_9px),radial-gradient(circle_at_88%_22%,hsl(var(--primary)/.18)_0_7px,transparent_8px),radial-gradient(circle_at_78%_82%,hsl(var(--accent)/.22)_0_9px,transparent_10px)]" />
        <span className="pointer-events-none absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-destructive via-primary to-accent" />
        <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-accent/20 text-primary ring-1 ring-primary/15">
          <Icon className="h-5 w-5" />
        </div>
        <div className="relative z-10 min-w-0 flex-1">
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
            {isActive && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          variant={isClose ? "outline" : "acg"}
          className="relative z-20 h-8 shrink-0 gap-1"
          disabled={!isActive}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
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
  };

  return (
    <div className="mt-3 space-y-3">
      {projectName && (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <FolderKanban className="h-3.5 w-3.5 text-primary" />
          <span className="truncate">{projectName}</span>
        </div>
      )}
      {Array.from(groups.entries()).map(([formName, modules]) => (
        <div key={formName} className="rounded-xl border border-border/40 bg-muted/10 p-2.5">
          <div className="mb-2 flex items-center gap-1.5 px-1">
            <FileText className="h-3.5 w-3.5 text-accent-foreground/70" />
            <span className="truncate text-xs font-medium text-foreground">{formName}</span>
            <Badge variant="outline" className="ml-auto text-[10px] font-normal">
              {modules.length} module{modules.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {modules.map(renderCard)}
          </div>
        </div>
      ))}
    </div>
  );
};

export default CaseFollowUpFormStrip;
