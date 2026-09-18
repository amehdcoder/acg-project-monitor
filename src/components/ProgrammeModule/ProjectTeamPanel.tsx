// Project team register — State, LGA, partner and facility staff, each with
// their own set of things they can see and do on this project.

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Pencil, Search, ShieldCheck, Trash2, UserPlus, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { toneClasses } from "@/lib/programmeModule/defaults";
import { useFacilities } from "@/lib/programmeModule/facilities";
import {
  PERMISSION_LIST, PRESETS, STATE_UNITS, TEAM_DESIGNATIONS, TEAM_TYPES,
  TEAM_TYPE_LABEL, deleteTeamMember, grantedCount, memberContext, saveTeamMember,
  useTeamMembers, type PermissionKey, type TeamMemberRow, type TeamPermissions,
  type TeamType,
} from "@/lib/programmeModule/projectTeam";
import GeoCascadeFields from "./GeoCascadeFields";

interface Props {
  projectId: string;
  moduleId?: string;
  /** Only people who may change the register see the add / edit controls. */
  canManage?: boolean;
}

const blank = {
  full_name: "", email: "", phone: "", team_type: "state" as TeamType,
  organisation: "", unit: "", designation: "", state: "", lga: "", ward: "",
  facility_id: "", notes: "", is_active: true, user_id: "",
};

const ProjectTeamPanel = ({ projectId, moduleId, canManage = false }: Props) => {
  const { toast } = useToast();
  const { members, reload } = useTeamMembers(projectId);
  const { facilities } = useFacilities(projectId);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMemberRow | null>(null);
  const [form, setForm] = useState({ ...blank });
  const [perms, setPerms] = useState<TeamPermissions>({ ...PRESETS.state });
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<TeamMemberRow | null>(null);
  const [term, setTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const facilityName = (id?: string | null) => facilities.find((f) => f.id === id)?.name || "";

  const visible = useMemo(() => {
    const q = term.trim().toLowerCase();
    return members.filter((m) => {
      if (typeFilter !== "all" && m.team_type !== typeFilter) return false;
      if (!q) return true;
      return [m.full_name, m.email, m.organisation, m.unit, m.designation, m.state, m.lga]
        .some((v) => (v || "").toLowerCase().includes(q));
    });
  }, [members, term, typeFilter]);

  const startAdd = () => {
    setEditing(null);
    setForm({ ...blank });
    setPerms({ ...PRESETS.state });
    setOpen(true);
  };

  const startEdit = (m: TeamMemberRow) => {
    setEditing(m);
    setForm({
      full_name: m.full_name, email: m.email || "", phone: m.phone || "",
      team_type: m.team_type, organisation: m.organisation || "", unit: m.unit || "",
      designation: m.designation || "", state: m.state || "", lga: m.lga || "",
      ward: m.ward || "", facility_id: m.facility_id || "", notes: m.notes || "",
      is_active: m.is_active, user_id: m.user_id || "",
    });
    setPerms({ ...(m.permissions || {}) });
    setOpen(true);
  };

  const changeType = (t: TeamType) => {
    setForm((f) => ({ ...f, team_type: t }));
    if (!editing) setPerms({ ...PRESETS[t] });
  };

  const submit = async () => {
    if (!form.full_name.trim()) {
      toast({ title: "Enter the person's name", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await saveTeamMember({
        id: editing?.id,
        project_id: projectId,
        module_id: moduleId || null,
        user_id: form.user_id.trim() || null,
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        team_type: form.team_type,
        organisation: form.organisation.trim() || null,
        unit: form.unit.trim() || null,
        designation: form.designation.trim() || null,
        state: form.state || null,
        lga: form.lga || null,
        ward: form.ward || null,
        facility_id: form.facility_id || null,
        permissions: perms,
        is_active: form.is_active,
        notes: form.notes.trim() || null,
      });
      toast({ title: editing ? "Team member updated" : "Team member added" });
      setOpen(false);
      await reload();
    } catch (e) {
      toast({ title: "Could not save", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!removing) return;
    try {
      await deleteTeamMember(removing.id);
      toast({ title: "Removed from the project team" });
      await reload();
    } catch (e) {
      toast({ title: "Could not remove", description: (e as Error).message, variant: "destructive" });
    } finally {
      setRemoving(null);
    }
  };

  const groups = useMemo(() => {
    const seen = new Set(PERMISSION_LIST.map((p) => p.group));
    return Array.from(seen);
  }, []);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <div className="mr-auto">
            <h4 className="font-semibold text-foreground">Project team</h4>
            <p className="text-xs text-muted-foreground">
              State, LGA, partner and facility staff working on this project, and what each of them can do.
            </p>
          </div>
          {canManage && (
            <Button size="sm" onClick={startAdd}>
              <UserPlus className="mr-1 h-4 w-4" /> Add team member
            </Button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-9 w-[240px] pl-7" placeholder="Search name, organisation, LGA…"
              value={term} onChange={(e) => setTerm(e.target.value)}
            />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-9 w-[190px] text-sm"><SelectValue /></SelectTrigger>
            <SelectContent className="z-[1200] bg-popover">
              <SelectItem value="all">All team types</SelectItem>
              {TEAM_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline">{visible.length} member{visible.length === 1 ? "" : "s"}</Badge>
        </div>

        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No team member listed yet. Add State, LGA or partner staff and choose what each of them can see and do.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Where they sit</TableHead>
                  <TableHead>Designation</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Can do</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((m) => (
                  <TableRow key={m.id} className={cn(!m.is_active && "opacity-60")}>
                    <TableCell>
                      <p className="font-medium text-foreground">{m.full_name}</p>
                      {!m.is_active && <p className="text-xs text-muted-foreground">Inactive</p>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{TEAM_TYPE_LABEL[m.team_type]}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{memberContext(m, facilityName(m.facility_id))}</TableCell>
                    <TableCell className="text-sm">{m.designation || "—"}</TableCell>
                    <TableCell className="text-sm">
                      {m.email || "—"}
                      {m.phone && <p className="text-xs text-muted-foreground">{m.phone}</p>}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("gap-1 border", grantedCount(m.permissions) ? toneClasses.info : toneClasses.neutral)}
                      >
                        <ShieldCheck className="h-3 w-3" />
                        {grantedCount(m.permissions)} permission{grantedCount(m.permissions) === 1 ? "" : "s"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage && (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" aria-label="Edit team member" onClick={() => startEdit(m)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="sm" aria-label="Remove team member" onClick={() => setRemoving(m)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Add / edit */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92dvh] max-w-3xl overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>{editing ? "Edit team member" : "Add a project team member"}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70dvh] px-5 py-4">
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-sm">Team type</Label>
                  <Select value={form.team_type} onValueChange={(v) => changeType(v as TeamType)}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="z-[1200] bg-popover">
                      {TEAM_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {TEAM_TYPES.find((t) => t.value === form.team_type)?.hint}
                  </p>
                </div>
                <div>
                  <Label className="text-sm">Full name</Label>
                  <div className="mt-1">
                    <LocationCombobox
                      value={form.full_name}
                      options={projectUsers.map((u) => u.full_name)}
                      placeholder={projectUsers.length ? "Choose a project member…" : "Type a name"}
                      emptyLabel="No project members yet"
                      onChange={(v) => {
                        const u = projectUsers.find((x) => x.full_name === v);
                        setForm((f) => ({
                          ...f,
                          full_name: v,
                          user_id: u?.user_id || "",
                          email: u?.email || f.email,
                          phone: u?.phone || f.phone,
                        }));
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Pick someone with an account on this project, or type a new name.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-sm">Email</Label>
                  <Input
                    className="mt-1" type="email" value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-sm">Phone</Label>
                  <Input
                    className="mt-1" value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-sm">Designation</Label>
                  <Select
                    value={form.designation || "none"}
                    onValueChange={(v) => setForm({ ...form, designation: v === "none" ? "" : v })}
                  >
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent className="z-[1200] max-h-[300px] bg-popover">
                      <SelectItem value="none">Not set</SelectItem>
                      {TEAM_DESIGNATIONS.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {form.team_type === "partner" && (
                <div>
                  <Label className="text-sm">Partner organisation</Label>
                  <Input
                    className="mt-1" placeholder="e.g. Sightsavers, HANDS, Plan International"
                    value={form.organisation}
                    onChange={(e) => setForm({ ...form, organisation: e.target.value })}
                  />
                </div>
              )}

              {(form.team_type === "state" || form.team_type === "national") && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-sm">Unit / ministry / department / agency</Label>
                    <Select
                      value={STATE_UNITS.includes(form.unit) ? form.unit : "custom"}
                      onValueChange={(v) => setForm({ ...form, unit: v === "custom" ? "" : v })}
                    >
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Select…" /></SelectTrigger>
                      <SelectContent className="z-[1200] max-h-[300px] bg-popover">
                        {STATE_UNITS.map((u) => (
                          <SelectItem key={u} value={u}>{u}</SelectItem>
                        ))}
                        <SelectItem value="custom">Type another unit…</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm">Unit name (if not listed)</Label>
                    <Input
                      className="mt-1" value={form.unit}
                      onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    />
                  </div>
                </div>
              )}

              {form.team_type === "facility" && (
                <div>
                  <Label className="text-sm">Health facility</Label>
                  <Select
                    value={form.facility_id || "none"}
                    onValueChange={(v) => setForm({ ...form, facility_id: v === "none" ? "" : v })}
                  >
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select facility…" /></SelectTrigger>
                    <SelectContent className="z-[1200] max-h-[300px] bg-popover">
                      <SelectItem value="none">Not set</SelectItem>
                      {facilities.map((f) => (
                        <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label className="text-sm">Area of responsibility</Label>
                <div className="mt-1">
                  <GeoCascadeFields
                    value={{ state: form.state, lga: form.lga, ward: form.ward }}
                    showCommunity={false}
                    onChange={(p) => setForm({
                      ...form, state: p.state ?? "", lga: p.lga ?? "", ward: p.ward ?? "",
                    })}
                  />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  LGA teams should have both a State and an LGA selected.
                </p>
              </div>

              <div>
                <Label className="text-sm">Account user ID (optional)</Label>
                <Input
                  className="mt-1" placeholder="Paste the person's user ID to apply these permissions to their login"
                  value={form.user_id}
                  onChange={(e) => setForm({ ...form, user_id: e.target.value })}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Without a user ID the entry is a contact record only — permissions apply once it is linked.
                </p>
              </div>

              <div className="rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground">What this person can see and do</p>
                <p className="text-xs text-muted-foreground">
                  Tick anything they need. Starting points are suggested for each team type and can be changed freely.
                </p>
                <div className="mt-3 space-y-3">
                  {groups.map((g) => (
                    <div key={g}>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</p>
                      <div className="mt-1 grid gap-2 sm:grid-cols-2">
                        {PERMISSION_LIST.filter((p) => p.group === g).map((p) => (
                          <label key={p.key} className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2">
                            <Checkbox
                              checked={!!perms[p.key as PermissionKey]}
                              onCheckedChange={(v) => setPerms({ ...perms, [p.key]: !!v })}
                            />
                            <span>
                              <span className="block text-sm text-foreground">{p.label}</span>
                              <span className="block text-xs text-muted-foreground">{p.hint}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-sm">Notes</Label>
                <Textarea
                  className="mt-1" rows={2} value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
                <span className="text-sm">Active on this project</span>
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="border-t border-border px-5 py-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add team member"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removing} onOpenChange={(v) => !v && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.full_name} from the project team?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose the permissions set here. Records they entered are kept.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ProjectTeamPanel;
