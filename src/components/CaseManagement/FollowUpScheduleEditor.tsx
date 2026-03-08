import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Repeat, AlertTriangle } from "lucide-react";

export interface FollowUpSchedule {
  enabled: boolean;
  frequency: "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "custom";
  intervalDays?: number; // used when frequency is "custom"
  gracePeriodDays: number; // days after due date before marked overdue
  maxFollowUps?: number; // optional cap
}

interface FollowUpScheduleEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: FollowUpSchedule | null;
  onSave: (schedule: FollowUpSchedule) => void;
  caseTypeLabel: string;
}

const FREQUENCY_DAYS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  quarterly: 90,
};

export const getIntervalDays = (schedule: FollowUpSchedule): number => {
  if (schedule.frequency === "custom") return schedule.intervalDays || 7;
  return FREQUENCY_DAYS[schedule.frequency] || 7;
};

export const getFrequencyLabel = (schedule: FollowUpSchedule): string => {
  if (schedule.frequency === "custom") return `Every ${schedule.intervalDays || 7} days`;
  const labels: Record<string, string> = {
    daily: "Daily",
    weekly: "Weekly",
    biweekly: "Every 2 weeks",
    monthly: "Monthly",
    quarterly: "Quarterly",
  };
  return labels[schedule.frequency] || schedule.frequency;
};

const FollowUpScheduleEditor = ({
  open,
  onOpenChange,
  schedule,
  onSave,
  caseTypeLabel,
}: FollowUpScheduleEditorProps) => {
  const [enabled, setEnabled] = useState(schedule?.enabled ?? true);
  const [frequency, setFrequency] = useState<FollowUpSchedule["frequency"]>(
    schedule?.frequency ?? "weekly"
  );
  const [intervalDays, setIntervalDays] = useState(schedule?.intervalDays ?? 7);
  const [gracePeriodDays, setGracePeriodDays] = useState(schedule?.gracePeriodDays ?? 3);
  const [maxFollowUps, setMaxFollowUps] = useState<number | "">(schedule?.maxFollowUps ?? "");

  const handleSave = () => {
    const s: FollowUpSchedule = {
      enabled,
      frequency,
      intervalDays: frequency === "custom" ? intervalDays : undefined,
      gracePeriodDays,
      maxFollowUps: maxFollowUps === "" ? undefined : Number(maxFollowUps),
    };
    onSave(s);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-primary" />
            Follow-Up Schedule
          </DialogTitle>
          <DialogDescription>
            Configure the follow-up visit schedule for <span className="font-medium">{caseTypeLabel}</span> cases.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Enable Schedule</Label>
              <p className="text-xs text-muted-foreground">Track follow-up due dates for this case type</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {enabled && (
            <>
              {/* Frequency */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Visit Frequency</Label>
                <Select
                  value={frequency}
                  onValueChange={(v) => setFrequency(v as FollowUpSchedule["frequency"])}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="biweekly">Every 2 Weeks</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly (90 days)</SelectItem>
                    <SelectItem value="custom">Custom Interval</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Custom interval */}
              {frequency === "custom" && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Interval (days)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={intervalDays}
                    onChange={(e) => setIntervalDays(Number(e.target.value) || 1)}
                  />
                </div>
              )}

              {/* Grace period */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Grace Period (days)</Label>
                <p className="text-xs text-muted-foreground">
                  Days after due date before the follow-up is marked overdue
                </p>
                <Input
                  type="number"
                  min={0}
                  max={30}
                  value={gracePeriodDays}
                  onChange={(e) => setGracePeriodDays(Number(e.target.value) || 0)}
                />
              </div>

              {/* Max follow-ups */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Max Follow-Ups (optional)</Label>
                <p className="text-xs text-muted-foreground">
                  Leave empty for unlimited follow-ups
                </p>
                <Input
                  type="number"
                  min={1}
                  placeholder="Unlimited"
                  value={maxFollowUps}
                  onChange={(e) => setMaxFollowUps(e.target.value === "" ? "" : Number(e.target.value))}
                />
              </div>

              {/* Preview */}
              <div className="rounded-md bg-muted/50 p-3 space-y-1">
                <p className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Repeat className="h-3.5 w-3.5" />
                  Schedule Preview
                </p>
                <p className="text-xs text-muted-foreground">
                  Follow-up visits every{" "}
                  <span className="font-medium text-foreground">
                    {frequency === "custom" ? `${intervalDays} day${intervalDays !== 1 ? "s" : ""}` : frequency}
                  </span>
                  {gracePeriodDays > 0 && (
                    <> with a <span className="font-medium text-foreground">{gracePeriodDays}-day</span> grace period</>
                  )}
                  {maxFollowUps !== "" && (
                    <>, up to <span className="font-medium text-foreground">{maxFollowUps}</span> visits</>
                  )}
                  .
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Schedule</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default FollowUpScheduleEditor;
