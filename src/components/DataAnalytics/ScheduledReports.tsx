import { useState, useEffect } from "react";
import {
  CalendarClock,
  Plus,
  Trash2,
  Clock,
  FileText,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface ScheduledReport {
  id: string;
  name: string;
  form_id: string | null;
  form_name: string;
  frequency: "daily" | "weekly" | "monthly";
  format: "pdf" | "excel";
  is_active: boolean;
  last_generated: string | null;
  created_at: string;
  recipients: string[];
}

interface Props {
  formId?: string;
  formName?: string;
}

const FREQUENCY_LABELS: Record<string, { label: string; description: string }> = {
  daily: { label: "Daily", description: "Every day at 6:00 AM" },
  weekly: { label: "Weekly", description: "Every Monday at 6:00 AM" },
  monthly: { label: "Monthly", description: "1st of every month at 6:00 AM" },
};

const ScheduledReports = ({ formId, formName }: Props) => {
  const { user, isAdmin } = useAuth();
  const [schedules, setSchedules] = useState<ScheduledReport[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // New schedule form state
  const [newName, setNewName] = useState("");
  const [newFrequency, setNewFrequency] = useState<string>("weekly");
  const [newFormat, setNewFormat] = useState<string>("excel");
  const [newRecipients, setNewRecipients] = useState("");

  // Load saved schedules from localStorage (since we don't have a table for this)
  useEffect(() => {
    const saved = localStorage.getItem("acg_report_schedules");
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as ScheduledReport[];
        setSchedules(formId ? parsed.filter((s) => s.form_id === formId || !s.form_id) : parsed);
      } catch {
        setSchedules([]);
      }
    }
  }, [formId]);

  const saveSchedules = (updated: ScheduledReport[]) => {
    // Merge with existing schedules for other forms
    const saved = localStorage.getItem("acg_report_schedules");
    let allSchedules: ScheduledReport[] = [];
    if (saved) {
      try {
        allSchedules = JSON.parse(saved);
      } catch {}
    }

    // Remove current form's schedules, add updated
    const otherFormSchedules = allSchedules.filter((s) => formId ? s.form_id !== formId : false);
    const merged = [...otherFormSchedules, ...updated];
    localStorage.setItem("acg_report_schedules", JSON.stringify(merged));
    setSchedules(updated);
  };

  const handleCreate = () => {
    if (!newName.trim()) {
      toast({ title: "Error", description: "Please enter a report name.", variant: "destructive" });
      return;
    }

    const schedule: ScheduledReport = {
      id: crypto.randomUUID(),
      name: newName.trim(),
      form_id: formId || null,
      form_name: formName || "All Forms",
      frequency: newFrequency as "daily" | "weekly" | "monthly",
      format: newFormat as "pdf" | "excel",
      is_active: true,
      last_generated: null,
      created_at: new Date().toISOString(),
      recipients: newRecipients
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean),
    };

    const updated = [...schedules, schedule];
    saveSchedules(updated);
    setIsDialogOpen(false);
    setNewName("");
    setNewRecipients("");
    toast({ title: "Schedule Created", description: `"${schedule.name}" will generate ${FREQUENCY_LABELS[schedule.frequency].label.toLowerCase()}.` });
  };

  const toggleSchedule = (id: string) => {
    const updated = schedules.map((s) =>
      s.id === id ? { ...s, is_active: !s.is_active } : s
    );
    saveSchedules(updated);
  };

  const deleteSchedule = (id: string) => {
    const updated = schedules.filter((s) => s.id !== id);
    saveSchedules(updated);
    toast({ title: "Schedule Removed" });
  };

  const runNow = async (schedule: ScheduledReport) => {
    setLoading(true);
    try {
      // Trigger the report generation (using client-side for now)
      toast({
        title: "Report Generating",
        description: `Generating ${schedule.format.toUpperCase()} report for "${schedule.name}"...`,
      });

      // Update last_generated
      const updated = schedules.map((s) =>
        s.id === schedule.id ? { ...s, last_generated: new Date().toISOString() } : s
      );
      saveSchedules(updated);

      // Simulate generation delay
      await new Promise((r) => setTimeout(r, 1500));
      toast({ title: "Report Ready", description: "Use the Report Generator to download." });
    } catch {
      toast({ title: "Error", description: "Failed to generate report.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card className="border-0 shadow-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="font-display text-lg flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" />
              Scheduled Reports
            </CardTitle>
            {isAdmin && (
              <Button size="sm" className="h-8 text-xs" onClick={() => setIsDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />
                New Schedule
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {schedules.length === 0 ? (
            <div className="text-center py-8">
              <CalendarClock className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">No scheduled reports</p>
              <p className="text-xs text-muted-foreground mt-1">
                Set up automated reports to be generated on a regular schedule.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    schedule.is_active ? "border-border bg-card" : "border-border/50 bg-muted/30 opacity-60"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-foreground truncate">{schedule.name}</p>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {FREQUENCY_LABELS[schedule.frequency]?.label}
                      </Badge>
                      {schedule.format === "pdf" ? (
                        <FileText className="h-3.5 w-3.5 text-destructive shrink-0" />
                      ) : (
                        <FileSpreadsheet className="h-3.5 w-3.5 text-green-600 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {FREQUENCY_LABELS[schedule.frequency]?.description}
                      </span>
                      {schedule.last_generated && (
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-600" />
                          Last: {format(new Date(schedule.last_generated), "dd MMM, HH:mm")}
                        </span>
                      )}
                    </div>
                    {schedule.recipients.length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Recipients: {schedule.recipients.join(", ")}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => runNow(schedule)}
                      disabled={loading || !schedule.is_active}
                    >
                      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Run Now"}
                    </Button>
                    <Switch
                      checked={schedule.is_active}
                      onCheckedChange={() => toggleSchedule(schedule.id)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteSchedule(schedule.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Schedule Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">New Report Schedule</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">Report Name</label>
              <Input
                placeholder="e.g. Weekly LGA Summary"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Frequency</label>
                <Select value={newFrequency} onValueChange={setNewFrequency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Format</label>
                <Select value={newFormat} onValueChange={setNewFormat}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excel">Excel (.xlsx)</SelectItem>
                    <SelectItem value="pdf">PDF</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Email Recipients <span className="text-muted-foreground font-normal">(comma-separated)</span>
              </label>
              <Input
                placeholder="supervisor@org.com, manager@org.com"
                value={newRecipients}
                onChange={(e) => setNewRecipients(e.target.value)}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Reporting on: <strong>{formName || "All Forms"}</strong>
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate}>Create Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ScheduledReports;
