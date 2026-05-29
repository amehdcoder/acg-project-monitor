import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Folder,
  Users,
  Home,
  Baby,
  HeartPulse,
  Stethoscope,
  Building2,
  School,
  AlertTriangle,
  ShieldAlert,
  Droplets,
  User as UserIcon,
  MapPin,
  ClipboardList,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import {
  WorkflowRule,
  OPERATOR_LABELS,
  ACTION_LABELS,
  VALUELESS_OPERATORS,
  RuleOperator,
  RuleActionType,
  newRule,
  parseWorkflowRules,
  ruleSummary,
} from "@/lib/caseManagement/workflowRules";

export const CASE_TYPE_ICONS: Record<string, LucideIcon> = {
  Folder,
  Users,
  Home,
  Baby,
  HeartPulse,
  Stethoscope,
  Building2,
  School,
  AlertTriangle,
  ShieldAlert,
  Droplets,
  User: UserIcon,
  MapPin,
  ClipboardList,
};

export const CASE_TYPE_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#06b6d4", "#84cc16", "#f97316", "#6366f1",
];

export interface CaseTypeRecord {
  id: string;
  project_id: string;
  name: string;
  label: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  status_workflow: string[] | null;
  sharing_default: string | null;
  workflow_rules?: unknown;
}

interface CaseTypesManagerProps {
  projects: { id: string; name: string }[];
}

const emptyForm = {
  id: "",
  project_id: "",
  label: "",
  description: "",
  icon: "Folder",
  color: CASE_TYPE_COLORS[0],
  statuses: "open, closed",
  sharing_default: "private",
  rules: [] as WorkflowRule[],
};


const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export default function CaseTypesManager({ projects }: CaseTypesManagerProps) {
  const { user } = useAuth();
  const [caseTypes, setCaseTypes] = useState<CaseTypeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CaseTypeRecord | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const fetchCaseTypes = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("case_types")
      .select("id, project_id, name, label, description, icon, color, status_workflow, sharing_default")
      .order("label");
    if (!error) setCaseTypes((data || []) as unknown as CaseTypeRecord[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCaseTypes();
  }, [fetchCaseTypes]);

  const projectName = (id: string) => projects.find((p) => p.id === id)?.name || "—";

  const openCreate = () => {
    setEditing(false);
    setForm({ ...emptyForm, project_id: projects[0]?.id || "" });
    setDialogOpen(true);
  };

  const openEdit = (ct: CaseTypeRecord) => {
    setEditing(true);
    setForm({
      id: ct.id,
      project_id: ct.project_id,
      label: ct.label || ct.name,
      description: ct.description || "",
      icon: ct.icon || "Folder",
      color: ct.color || CASE_TYPE_COLORS[0],
      statuses: (ct.status_workflow && ct.status_workflow.length
        ? ct.status_workflow
        : ["open", "closed"]).join(", "),
      sharing_default: ct.sharing_default || "private",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.label.trim()) {
      toast({ title: "Name required", description: "Enter a case type name.", variant: "destructive" });
      return;
    }
    if (!form.project_id) {
      toast({ title: "Project required", description: "Select a project for this case type.", variant: "destructive" });
      return;
    }
    const statuses = form.statuses
      .split(",")
      .map((s) => slugify(s))
      .filter(Boolean);
    if (!statuses.includes("closed")) statuses.push("closed");

    setSaving(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from("case_types")
          .update({
            label: form.label.trim(),
            description: form.description.trim() || null,
            icon: form.icon,
            color: form.color,
            status_workflow: statuses as any,
            sharing_default: form.sharing_default,
          })
          .eq("id", form.id);
        if (error) throw error;
        toast({ title: "Case type updated" });
      } else {
        const { error } = await supabase.from("case_types").insert({
          project_id: form.project_id,
          name: slugify(form.label),
          label: form.label.trim(),
          description: form.description.trim() || null,
          icon: form.icon,
          color: form.color,
          status_workflow: statuses as any,
          sharing_default: form.sharing_default,
          created_by: user?.id,
        });
        if (error) throw error;
        toast({ title: "Case type created" });
      }
      setDialogOpen(false);
      fetchCaseTypes();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e?.message?.includes("duplicate")
          ? "A case type with this name already exists in the project."
          : "Failed to save case type.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("case_types").delete().eq("id", deleteTarget.id);
    if (error) {
      toast({ title: "Error", description: "Could not delete (cases may still reference it).", variant: "destructive" });
    } else {
      toast({ title: "Case type deleted" });
      fetchCaseTypes();
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg font-semibold">Case Types</h3>
          <p className="text-sm text-muted-foreground">
            Define the kinds of records your programs track (beneficiary, household, patient, referral…).
          </p>
        </div>
        <Button size="sm" onClick={openCreate} disabled={projects.length === 0}>
          <Plus className="h-4 w-4 mr-1" /> New Case Type
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : caseTypes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-muted-foreground">
            <Folder className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No case types yet. Create your first one to start tracking cases.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {caseTypes.map((ct) => {
            const Icon = CASE_TYPE_ICONS[ct.icon || "Folder"] || Folder;
            const color = ct.color || CASE_TYPE_COLORS[0];
            return (
              <Card key={ct.id} className="border border-border/50 shadow-card hover:shadow-lg transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${color}1a`, color }}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{ct.label || ct.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{projectName(ct.project_id)}</p>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(ct)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(ct)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {ct.description && (
                    <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{ct.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-3">
                    {(ct.status_workflow && ct.status_workflow.length ? ct.status_workflow : ["open", "closed"]).map((s) => (
                      <Badge key={s} variant="secondary" className="text-[10px] capitalize">{s.replace(/_/g, " ")}</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Case Type" : "New Case Type"}</DialogTitle>
            <DialogDescription>
              Configure how this type of case looks and the statuses it moves through.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {!editing && (
              <div className="space-y-1.5">
                <Label>Project</Label>
                <Select value={form.project_id} onValueChange={(v) => setForm((f) => ({ ...f, project_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select project" /></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Beneficiary, Household, NTD Patient"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What does this case type represent?"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(CASE_TYPE_ICONS).map(([key, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, icon: key }))}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                      form.icon === key ? "border-primary ring-2 ring-primary/30" : "border-border hover:bg-accent"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {CASE_TYPE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={`h-8 w-8 rounded-full border-2 transition ${
                      form.color === c ? "ring-2 ring-offset-2 ring-foreground/40 border-background" : "border-transparent"
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Status Workflow</Label>
              <Input
                value={form.statuses}
                onChange={(e) => setForm((f) => ({ ...f, statuses: e.target.value }))}
                placeholder="open, in_progress, closed"
              />
              <p className="text-[11px] text-muted-foreground">
                Comma-separated statuses the case can move through. "closed" is always available.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Default Sharing</Label>
              <Select value={form.sharing_default} onValueChange={(v) => setForm((f) => ({ ...f, sharing_default: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Private (owner only)</SelectItem>
                  <SelectItem value="team">Team shared</SelectItem>
                  <SelectItem value="facility">Facility shared</SelectItem>
                  <SelectItem value="district">District shared</SelectItem>
                  <SelectItem value="national">National</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              {editing ? "Save Changes" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete case type?</AlertDialogTitle>
            <AlertDialogDescription>
              "{deleteTarget?.label}" will be removed. This won't delete existing cases, but they may lose their type
              configuration. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
