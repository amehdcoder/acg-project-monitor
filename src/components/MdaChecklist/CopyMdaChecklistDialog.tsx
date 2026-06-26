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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Loader2, MapPin, ClipboardCheck } from "lucide-react";
import type { FormGroup } from "@/components/FormBuilder/types";
import { getStateChoices, restrictChecklistToState } from "@/lib/mda/copyChecklist";

interface SourceChecklist {
  id: string;
  name: string;
  description: string | null;
  project_id: string;
  questions: FormGroup[];
  settings: Record<string, any> | null;
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
  userId?: string;
  onCopied: () => void;
}

const NONE = "__none__";

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

  const stateChoices = useMemo(() => getStateChoices(), []);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? "Project";

  useEffect(() => {
    if (!open) return;
    setSourceId("");
    setStateValue(NONE);
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

  const handleCopy = async () => {
    if (!currentProjectId || !selected) return;
    setCopying(true);
    try {
      const restricted = restrictChecklistToState(
        selected.questions,
        stateValue === NONE ? null : stateValue,
      );
      const settings = {
        ...(selected.settings ?? {}),
        copiedFromProject: projectName(selected.project_id),
        ...(stateValue !== NONE ? { stateRestricted: stateValue } : {}),
      };
      const { error } = await supabase.from("forms").insert({
        name: selected.name,
        description: selected.description,
        questions: restricted as any,
        settings: settings as any,
        project_id: currentProjectId,
        created_by: userId,
        status: "draft",
      } as any);
      if (error) throw error;
      toast({
        title: "Checklist copied",
        description: "It's now editable in this project from your forms list.",
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5 text-emerald-600" />
            Copy MDA Supervisory Checklist
          </DialogTitle>
          <DialogDescription>
            Bring an existing checklist from another project into{" "}
            <span className="font-medium text-foreground">
              {currentProjectId ? projectName(currentProjectId) : "this project"}
            </span>
            . You can restrict it to a single state so field users only pick the
            supervision location within that state. The copy stays fully editable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {destinationHasChecklist && (
            <p className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              This project already has an MDA checklist. Copying will add another
              one — remove the existing checklist first if you want to replace it.
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
                <Copy className="h-4 w-4 mr-1.5" /> Copy checklist
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
