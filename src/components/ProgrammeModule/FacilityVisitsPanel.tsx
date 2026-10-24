// Facility visit log — records supervision and monitoring visits to a
// registered health facility (date, duration, outcome, notes) and shows the
// facility's visit history on its dashboard.

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { CalendarDays, Clock, ClipboardCheck, Plus, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export interface FacilityVisitRow {
  id: string;
  facility_id: string;
  project_id: string;
  visit_date: string;
  duration_minutes: number | null;
  outcome: string;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
}

export const VISIT_OUTCOMES = [
  { value: "supportive_supervision", label: "Supportive supervision" },
  { value: "routine_monitoring", label: "Routine monitoring" },
  { value: "data_verification", label: "Data verification" },
  { value: "training_mentorship", label: "Training / mentorship" },
  { value: "other", label: "Other" },
] as const;

export const VISIT_OUTCOME_LABEL: Record<string, string> = Object.fromEntries(
  VISIT_OUTCOMES.map((o) => [o.value, o.label]),
);

const outcomeTone: Record<string, string> = {
  supportive_supervision: "border-blue-400/40 bg-blue-500/10 text-blue-700",
  routine_monitoring: "border-emerald-400/40 bg-emerald-500/10 text-emerald-700",
  data_verification: "border-purple-400/40 bg-purple-500/10 text-purple-700",
  training_mentorship: "border-amber-400/40 bg-amber-500/10 text-amber-700",
  other: "border-slate-300 bg-slate-100 text-slate-700",
};

interface Props {
  facilityId: string;
  projectId?: string;
  /** Focal persons with record/manage access and admins may log visits. */
  canRecord?: boolean;
}

const emptyDraft = {
  visit_date: new Date().toISOString().slice(0, 10),
  duration_minutes: "",
  outcome: "routine_monitoring",
  notes: "",
};

const FacilityVisitsPanel = ({ facilityId, projectId, canRecord = false }: Props) => {
  const { toast } = useToast();
  const [visits, setVisits] = useState<FacilityVisitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);

  const load = useCallback(async () => {
    if (!facilityId) return;
    setLoading(true);
    const { data } = await supabase
      .from("facility_visits")
      .select("id,facility_id,project_id,visit_date,duration_minutes,outcome,notes,recorded_by,created_at")
      .eq("facility_id", facilityId)
      .order("visit_date", { ascending: false })
      .limit(200);
    setVisits((data as FacilityVisitRow[]) || []);
    setLoading(false);
  }, [facilityId]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft.visit_date) {
      toast({ title: "Pick the visit date", variant: "destructive" });
      return;
    }
    const duration = draft.duration_minutes.trim()
      ? Math.max(0, Math.round(Number(draft.duration_minutes)))
      : null;
    if (draft.duration_minutes.trim() && (!Number.isFinite(duration) || (duration ?? 0) <= 0)) {
      toast({ title: "Duration must be a positive number of minutes", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("facility_visits").insert({
        facility_id: facilityId,
        project_id: projectId,
        visit_date: draft.visit_date,
        duration_minutes: duration,
        outcome: draft.outcome,
        notes: draft.notes.trim() || null,
        recorded_by: auth.user?.id,
      } as never);
      if (error) throw error;
      toast({ title: "Visit recorded", description: `${VISIT_OUTCOME_LABEL[draft.outcome]} on ${draft.visit_date}` });
      setFormOpen(false);
      setDraft(emptyDraft);
      await load();
    } catch (e) {
      toast({ title: "Could not save visit", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
      weekday: "short", day: "numeric", month: "short", year: "numeric",
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Supervision and monitoring visits to this facility, most recent first.
        </p>
        <div className="flex-1" />
        <Button variant="outline" size="icon" onClick={() => void load()} aria-label="Refresh visits">
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
        {canRecord && (
          <Button size="sm" className="gap-1" onClick={() => { setDraft(emptyDraft); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> Record visit
          </Button>
        )}
      </div>

      {visits.length === 0 && !loading && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No visits recorded for this facility yet.
        </Card>
      )}

      {visits.map((v) => (
        <Card key={v.id} className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 font-semibold text-foreground">
              <CalendarDays className="h-4 w-4 text-primary" /> {formatDate(v.visit_date)}
            </p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              {v.duration_minutes ? `${v.duration_minutes} min` : "Duration not recorded"}
            </p>
            {v.notes && <p className="mt-1 text-xs text-muted-foreground">{v.notes}</p>}
          </div>
          <Badge variant="outline" className={cn("border gap-1", outcomeTone[v.outcome] || outcomeTone.other)}>
            <ClipboardCheck className="h-3.5 w-3.5" />
            {VISIT_OUTCOME_LABEL[v.outcome] || v.outcome}
          </Badge>
        </Card>
      ))}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record facility visit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Visit date</Label>
              <Input
                type="date"
                value={draft.visit_date}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setDraft((d) => ({ ...d, visit_date: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                min={1}
                inputMode="numeric"
                placeholder="e.g. 90"
                value={draft.duration_minutes}
                onChange={(e) => setDraft((d) => ({ ...d, duration_minutes: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Outcome</Label>
              <Select
                value={draft.outcome}
                onValueChange={(v) => setDraft((d) => ({ ...d, outcome: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200] bg-popover">
                  {VISIT_OUTCOMES.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notes (optional)</Label>
              <Textarea
                rows={3}
                placeholder="What was observed, agreed actions…"
                value={draft.notes}
                onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save visit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FacilityVisitsPanel;
