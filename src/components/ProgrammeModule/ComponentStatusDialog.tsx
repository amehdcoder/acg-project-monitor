// Mandatory Final Outcome capture when a component's service is marked
// Completed, Suspended or Exited. The outcome choices are context-specific
// to the component (eye health, MMDP/NTD, mental health, livelihood, ...).

import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, PauseCircle, LogOut, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  EXIT_REASONS, finalOutcomesFor, LIFECYCLE_MODAL_TITLE, SUSPENSION_REASONS,
  type ServiceLifecycleAction,
} from "@/lib/programmeModule/componentOutcomes";
import { offlineMutate } from "@/lib/programmeModule/offlineWrite";
import { newUuid } from "@/lib/programmeModule/offlineQueue";
import { recordAudit } from "./useProgrammeModule";
import type { BeneficiaryRow, ProgrammeComponent } from "@/lib/programmeModule/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  action: ServiceLifecycleAction;
  component: ProgrammeComponent;
  beneficiary: BeneficiaryRow;
  moduleId: string;
  projectId: string;
  onChanged: () => void;
}

const ACTION_STYLE: Record<ServiceLifecycleAction, { icon: typeof CheckCircle2; chip: string; button: string }> = {
  completed: {
    icon: CheckCircle2,
    chip: "bg-status-success/15 text-status-success",
    button: "bg-status-success text-white hover:bg-status-success/90",
  },
  suspended: {
    icon: PauseCircle,
    chip: "bg-status-warning/15 text-status-warning",
    button: "bg-status-warning text-white hover:bg-status-warning/90",
  },
  exited: {
    icon: LogOut,
    chip: "bg-muted text-muted-foreground",
    button: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  },
};

const SERVICE_NAME: Record<ServiceLifecycleAction, string> = {
  completed: "Service completed",
  suspended: "Service suspended",
  exited: "Service exited",
};

const ComponentStatusDialog = ({
  open, onOpenChange, action, component, beneficiary, moduleId, projectId, onChanged,
}: Props) => {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const needsReason = action !== "completed";
  const reasons = action === "suspended" ? SUSPENSION_REASONS : EXIT_REASONS;
  const outcomes = useMemo(() => finalOutcomesFor(component, action), [component, action]);
  const style = ACTION_STYLE[action];
  const Icon = style.icon;
  const valid = outcome !== "" && (!needsReason || reason !== "");

  const reset = () => {
    setReason("");
    setOutcome("");
    setNotes("");
  };

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await offlineMutate({
        table: "beneficiary_services",
        action: "insert",
        values: {
          id: newUuid(),
          beneficiary_id: beneficiary.id,
          module_id: moduleId,
          project_id: projectId,
          component_key: component.key,
          service_name: SERVICE_NAME[action],
          service_date: today,
          result: outcome,
          status: action,
          data: {
            status_update: true,
            lifecycle_action: action,
            reason: needsReason ? reason : null,
            final_outcome: outcome,
            notes: notes.trim() || null,
          },
        },
      });
      await recordAudit({
        beneficiary_id: beneficiary.id,
        project_id: projectId,
        action: `service_${action}`,
        field_name: component.key,
        new_value: outcome,
      });
      toast({
        title: `${component.label}: ${SERVICE_NAME[action]}`,
        description: outcome,
      });
      reset();
      onOpenChange(false);
      onChanged();
    } catch (e) {
      toast({ title: "Could not save", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2">
            <span
              className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
              style={{ background: `hsl(${component.color})` }}
            >
              <Icon className="h-5 w-5" />
            </span>
            <Badge variant="secondary" className={cn("border-0", style.chip)}>
              {beneficiary.full_name}
            </Badge>
          </div>
          <DialogTitle className="text-lg">
            {LIFECYCLE_MODAL_TITLE[action]} — {component.label}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {action === "completed" &&
              "Confirm the service is complete and record the final outcome achieved for this component."}
            {action === "suspended" &&
              "Temporarily interrupt this service. Document why, and the beneficiary's status at the point of suspension."}
            {action === "exited" &&
              "Permanently exit the beneficiary from this component. Document why, and their final status at exit."}
          </p>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {needsReason && (
            <div className="space-y-1.5">
              <Label>
                Reason for {action === "suspended" ? "suspension" : "exit"} <span className="text-destructive">*</span>
              </Label>
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  {reasons.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>
              {action === "completed" ? "Final outcome" : "Final outcome / status at exit"}{" "}
              <span className="text-destructive">*</span>
            </Label>
            <OutcomePicker
              componentKey={component.key}
              projectId={projectId}
              action={action}
              options={outcomes}
              value={outcome}
              onChange={setOutcome}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional context for the care team…"
              rows={3}
            />
          </div>

          {!valid && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-status-warning" />
              {needsReason ? "A reason and final outcome are required." : "A final outcome is required."}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!valid || saving} className={style.button}>
            {saving ? "Saving…" : LIFECYCLE_MODAL_TITLE[action]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ComponentStatusDialog;
