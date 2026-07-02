import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Copy,
  Loader2,
  MapPin,
  ClipboardCheck,
  LayoutDashboard,
  ArrowRight,
  CheckCircle2,
  ListChecks,
  Layers,
} from "lucide-react";
import type { FormGroup } from "@/components/FormBuilder/types";
import {
  getStateChoices,
  buildChecklistCopyPayload,
  makeUniqueChecklistName,
  type MdaCopySettings,
} from "@/lib/mda/copyChecklist";

interface SourceChecklist {
  id: string;
  name: string;
  description: string | null;
  project_id: string;
  questions: FormGroup[];
  settings: MdaCopySettings | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Destination project the checklist is copied into. */
  currentProjectId: string | null;
  /** Map of project id -> name for friendly labels. */
  projects: { id: string; name: string }[];
  /** Whether the destination already has an MDA checklist. */
  destinationHasChecklist: boolean;
  /** Names of forms already in the destination project (for conflict handling). */
  existingFormNames?: string[];
  userId?: string;
  onCopied: () => void;
}

const NONE = "__none__";

/** Count the number of sections (groups) and questions in a checklist payload. */
function summarize(questions: FormGroup[]): { sections: number; questions: number } {
  let sections = 0;
  let qs = 0;
  for (const g of questions ?? []) {
    if (g && Array.isArray((g as any).questions)) {
      sections += 1;
      qs += (g as any).questions.length;
    } else {
      qs += 1;
    }
  }
  return { sections, questions: qs };
}

export default function CopyMdaChecklistDialog({
  open,
  onOpenChange,
  currentProjectId,
  projects,
  destinationHasChecklist,
  userId,
  onCopied,
}: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [copying, setCopying] = useState(false);
  const [sources, setSources] = useState<SourceChecklist[]>([]);
  const [sourceId, setSourceId] = useState<string>("");
  const [stateValue, setStateValue] = useState<string>(NONE);
  const [publishDashboard, setPublishDashboard] = useState(false);
  const [finalizeChecklist, setFinalizeChecklist] = useState(false);

  const stateChoices = useMemo(() => getStateChoices(), []);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "Project";

  useEffect(() => {
    if (!open) return;
    setSourceId("");
    setStateValue(NONE);
    setPublishDashboard(false);
    setFinalizeChecklist(false);
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("forms")
          .select("id, name, description, project_id, questions, settings")
          .eq("settings->>isMdaChecklist", "true");
        if (error) throw error;
        const list = ((data as any[]) ?? []).filter(
          (f) => f.project_id !== currentProjectId,
        ) as SourceChecklist[];
        setSources(list);
      } catch (e: any) {
        toast({
          title: "Could not load checklists",
          description: e?.message ?? "Please try again.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [open, currentProjectId, toast]);

  const selected = sources.find((s) => s.id === sourceId);
  const counts = selected ? summarize(selected.questions) : null;

  const handleCopy = async () => {
    if (!currentProjectId || !selected) return;
    setCopying(true);
    try {
      const payload = buildChecklistCopyPayload(selected, {
        stateValue: stateValue === NONE ? null : stateValue,
        publishDashboard,
        finalizeChecklist,
        sourceProjectName: projectName(selected.project_id),
      });
      const { error } = await supabase.from("forms").insert({
        name: payload.name,
        description: payload.description,
        questions: payload.questions as any,
        settings: payload.settings as any,
        project_id: currentProjectId,
        created_by: userId,
        status: payload.status,
      } as any);
      if (error) throw error;
      toast({
        title: "Checklist & dashboard copied",
        description: finalizeChecklist
          ? "The checklist is finalized and ready to fill. The linked dashboard is "
              + (publishDashboard ? "published." : "unpublished — publish it when ready.")
          : "Saved as an editable draft. Finalize it and publish the dashboard when ready.",
      });
      onOpenChange(false);
      onCopied();
    } catch (e: any) {
      toast({
        title: "Could not copy",
        description: e?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setCopying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-emerald-600" />
            Copy MDA Checklist & Dashboard
          </DialogTitle>
          <DialogDescription>
            Make an exact copy of the complete Integrated MDA Supervisory
            Checklist and its linked dashboard into{" "}
            <span className="font-medium text-foreground">
              {currentProjectId ? projectName(currentProjectId) : "this project"}
            </span>
            . Everything stays fully editable in the Form Builder.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {destinationHasChecklist && (
            <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              This project already has an MDA checklist. Copying adds another one
              — remove the existing checklist first if you want to replace it.
            </p>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm">Copy from project</Label>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading checklists…
              </div>
            ) : sources.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No MDA checklist found in any other project you can access.
              </p>
            ) : (
              <Select value={sourceId} onValueChange={setSourceId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a source project" />
                </SelectTrigger>
                <SelectContent>
                  {sources.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        <ClipboardCheck className="h-4 w-4 text-emerald-600" />
                        {projectName(s.project_id)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selected && counts && (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-center gap-3 text-sm">
                <span className="font-medium">{projectName(selected.project_id)}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-emerald-700">
                  {currentProjectId ? projectName(currentProjectId) : "This project"}
                </span>
              </div>
              <Separator className="my-3" />
              <p className="text-xs font-medium text-muted-foreground mb-2">
                What gets copied
              </p>
              <ul className="grid grid-cols-1 gap-1.5 text-xs text-foreground">
                <li className="flex items-center gap-2">
                  <Layers className="h-3.5 w-3.5 text-emerald-600" />
                  {counts.sections} sections · {counts.questions} questions (with
                  skip logic, validation & cascade selects)
                </li>
                <li className="flex items-center gap-2">
                  <ListChecks className="h-3.5 w-3.5 text-emerald-600" />
                  Linked Coverage Evaluation 3D flow
                </li>
                <li className="flex items-center gap-2">
                  <LayoutDashboard className="h-3.5 w-3.5 text-emerald-600" />
                  The complete linked supervisory dashboard
                </li>
              </ul>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-sm flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-emerald-600" /> Restrict to a state
              <span className="text-xs font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Select value={stateValue} onValueChange={setStateValue}>
              <SelectTrigger>
                <SelectValue placeholder="All states (no restriction)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>All states (no restriction)</SelectItem>
                {stateChoices.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {stateValue !== NONE && (
              <p className="text-xs text-muted-foreground">
                The State field will be preset to{" "}
                <span className="font-medium text-foreground">
                  {stateChoices.find((s) => s.value === stateValue)?.label}
                </span>{" "}
                and the LGA/Ward cascade limited to it.
              </p>
            )}
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="text-sm flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Finalize
                  checklist now
                </Label>
                <p className="text-xs text-muted-foreground">
                  Publish immediately so field users can fill it. Leave off to
                  keep an editable draft.
                </p>
              </div>
              <Switch checked={finalizeChecklist} onCheckedChange={setFinalizeChecklist} />
            </div>

            <div className="flex items-start justify-between gap-3">
              <div>
                <Label className="text-sm flex items-center gap-1.5">
                  <LayoutDashboard className="h-4 w-4 text-emerald-600" /> Publish
                  dashboard now
                </Label>
                <p className="text-xs text-muted-foreground">
                  Make the linked dashboard visible to members. You can
                  publish/unpublish it any time from the dashboard.
                </p>
              </div>
              <Switch checked={publishDashboard} onCheckedChange={setPublishDashboard} />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={copying}>
            Cancel
          </Button>
          <Button onClick={handleCopy} disabled={!selected || copying}>
            {copying ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Copying…
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 mr-1.5" /> Copy checklist & dashboard
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
