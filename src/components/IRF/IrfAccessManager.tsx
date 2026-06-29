import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Users, Tag, Search, ShieldCheck } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IRF_CATEGORY_FORMS } from "@/lib/irf/categoryForms";
import type { IrfGrant } from "@/hooks/useIrfFormAccess";

const DESIGNATIONS: { value: string; label: string }[] = [
  { value: "community_directed_distributor", label: "Community Directed Distributor (CDD)" },
  { value: "flhf_supervisor", label: "FLHF Supervisor" },
  { value: "lga_supervisor", label: "LGA Supervisor" },
  { value: "state_supervisor", label: "State Supervisor" },
  { value: "hands_staff", label: "HANDS Staff" },
  { value: "data_collector", label: "Data Collector" },
  { value: "enumerator", label: "Enumerator" },
  { value: "independent_monitor", label: "Independent Monitor" },
  { value: "electronic_data_manager", label: "Electronic Data Manager" },
  { value: "cbmg_staff", label: "CBMG Staff" },
  { value: "cbmi_staff", label: "CBMi Staff" },
  { value: "sightsavers_staff", label: "Sightsavers Staff" },
  { value: "plan_intl_staff", label: "Plan Intl Staff" },
  { value: "sci_staff", label: "SCI Staff" },
  { value: "adhoc_user", label: "Adhoc User" },
  { value: "other", label: "Other" },
];
const designationLabel = (v?: string | null) =>
  DESIGNATIONS.find((d) => d.value === v)?.label ?? v ?? "—";

interface Member {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  designation: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId?: string | null;
  grants: IrfGrant[];
  onChanged: () => void | Promise<void>;
}

export default function IrfAccessManager({ open, onOpenChange, projectId, grants, onChanged }: Props) {
  const [category, setCategory] = useState(IRF_CATEGORY_FORMS[0].id);
  const [members, setMembers] = useState<Member[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      setLoadingMembers(true);
      try {
        let userIds: string[] | null = null;
        if (projectId) {
          const { data } = await supabase
            .from("user_project_assignments").select("user_id").eq("project_id", projectId);
          userIds = (data || []).map((r: any) => r.user_id);
        }
        let q = supabase.from("profiles")
          .select("user_id, first_name, last_name, email, designation")
          .eq("is_active", true).order("first_name");
        if (userIds) q = q.in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
        const { data } = await q.limit(1000);
        if (active) setMembers((data as any) || []);
      } finally {
        if (active) setLoadingMembers(false);
      }
    })();
    return () => { active = false; };
  }, [open, projectId]);

  const categoryGrants = useMemo(
    () => grants.filter((g) => g.form_category === category && (!g.project_id || !projectId || g.project_id === projectId)),
    [grants, category, projectId],
  );
  const grantedUserIds = useMemo(() => new Set(categoryGrants.filter((g) => g.grant_type === "user").map((g) => g.user_id)), [categoryGrants]);
  const grantedDesignations = useMemo(() => new Set(categoryGrants.filter((g) => g.grant_type === "designation").map((g) => g.designation)), [categoryGrants]);

  const filteredMembers = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return members;
    return members.filter((m) =>
      `${m.first_name ?? ""} ${m.last_name ?? ""} ${m.email ?? ""}`.toLowerCase().includes(s));
  }, [members, search]);

  // Only designations actually held by members of this project may be granted.
  const projectDesignations = useMemo(() => {
    const present = new Set(members.map((m) => m.designation).filter(Boolean) as string[]);
    return DESIGNATIONS.filter((d) => present.has(d.value));
  }, [members]);

  const addGrant = async (row: Partial<IrfGrant>) => {
    setBusy(JSON.stringify(row));
    try {
      const { error } = await supabase.from("irf_form_access" as any).insert({
        project_id: projectId ?? null,
        form_category: category,
        ...row,
      });
      if (error) throw error;
      await onChanged();
      toast.success("Access granted.");
    } catch (e: any) {
      toast.error(e?.message || "Could not grant access.");
    } finally { setBusy(null); }
  };

  const removeGrant = async (id: string) => {
    setBusy(id);
    try {
      const { error } = await supabase.from("irf_form_access" as any).delete().eq("id", id);
      if (error) throw error;
      await onChanged();
      toast.success("Access removed.");
    } catch (e: any) {
      toast.error(e?.message || "Could not remove access.");
    } finally { setBusy(null); }
  };

  const activeForm = IRF_CATEGORY_FORMS.find((f) => f.id === category);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Manage form access</DialogTitle>
          <DialogDescription>Grant specific members or designations access to each activity form.</DialogDescription>
        </DialogHeader>

        {/* Form picker */}
        <div className="flex flex-wrap gap-2">
          {IRF_CATEGORY_FORMS.map((f) => (
            <button key={f.id} type="button" onClick={() => setCategory(f.id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${category === f.id ? "text-white" : "bg-background hover:bg-muted"}`}
              style={category === f.id ? { backgroundColor: f.color, borderColor: f.color } : { borderColor: "hsl(var(--border))" }}>
              {f.short}
            </button>
          ))}
        </div>

        <Tabs defaultValue="members" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="members"><Users className="mr-1.5 h-4 w-4" /> Members</TabsTrigger>
            <TabsTrigger value="designations"><Tag className="mr-1.5 h-4 w-4" /> Designations</TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="min-h-0 flex-1">
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search members…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
            <ScrollArea className="h-[46vh] pr-3">
              {loadingMembers ? (
                <div className="flex h-32 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : filteredMembers.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No members found.</p>
              ) : (
                <div className="space-y-1.5">
                  {filteredMembers.map((m) => {
                    const granted = grantedUserIds.has(m.user_id);
                    const grantRow = categoryGrants.find((g) => g.grant_type === "user" && g.user_id === m.user_id);
                    const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || m.email || "Member";
                    return (
                      <div key={m.user_id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{name}</p>
                          <p className="truncate text-xs text-muted-foreground">{designationLabel(m.designation)}</p>
                        </div>
                        {granted ? (
                          <Button size="sm" variant="ghost" className="text-destructive" disabled={busy === grantRow?.id}
                            onClick={() => grantRow && removeGrant(grantRow.id)}>
                            {busy === grantRow?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled={!!busy}
                            onClick={() => addGrant({ grant_type: "user", user_id: m.user_id })}>
                            <Plus className="mr-1 h-4 w-4" /> Grant
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="designations" className="min-h-0 flex-1">
            <ScrollArea className="h-[52vh] pr-3">
              {loadingMembers ? (
                <div className="flex h-32 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : projectDesignations.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No designations found among this project's members.</p>
              ) : (
                <div className="space-y-1.5">
                  {projectDesignations.map((d) => {
                    const granted = grantedDesignations.has(d.value);
                    const grantRow = categoryGrants.find((g) => g.grant_type === "designation" && g.designation === d.value);
                    return (
                      <div key={d.value} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                        <p className="truncate text-sm font-medium">{d.label}</p>
                        {granted ? (
                          <Button size="sm" variant="ghost" className="text-destructive" disabled={busy === grantRow?.id}
                            onClick={() => grantRow && removeGrant(grantRow.id)}>
                            {busy === grantRow?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled={!!busy}
                            onClick={() => addGrant({ grant_type: "designation", designation: d.value })}>
                            <Plus className="mr-1 h-4 w-4" /> Grant
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>

          </TabsContent>
        </Tabs>

        <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          <Badge variant="secondary" style={{ backgroundColor: `${activeForm?.color}1a`, color: activeForm?.color }}>{activeForm?.short}</Badge>
          {categoryGrants.length === 0
            ? "Only Owners & admins can open this form until you grant access."
            : `${categoryGrants.length} grant(s) active for this form.`}
        </div>
      </DialogContent>
    </Dialog>
  );
}
