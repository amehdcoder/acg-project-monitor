import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Plus, Trash2, Search, ShieldCheck, Mail, CheckSquare, LayoutGrid } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/hooks/useAuth";

interface Member {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface SectionRef {
  id: string;
  label: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  formId: string;
  formName: string;
  sections: SectionRef[];
  projectId?: string | null;
  /**
   * When true, access is granted for the ENTIRE checklist as a single unit
   * (one grant per member) instead of per-module. The module selector is hidden.
   */
  wholeChecklist?: boolean;
}

/**
 * Owner / Admin tool to grant named project members access to the SARMAAN
 * Integrated Supervisory Checklist. In per-module mode each section is an
 * independent, separately-submittable form so access is granted per-module.
 * In whole-checklist mode a single grant unlocks the complete checklist.
 * Dashboard access is managed separately via DashboardAccessManager.
 */
export default function SarmaanChecklistAccessManager({ open, onOpenChange, formId, formName, sections: sectionsProp, projectId, wholeChecklist }: Props) {
  const { user } = useAuth();
  const WHOLE_ID = "__acsm_whole__";
  const sections: SectionRef[] = wholeChecklist ? [{ id: WHOLE_ID, label: "Entire Checklist" }] : sectionsProp;
  const [members, setMembers] = useState<Member[]>([]);

  const [activeSection, setActiveSection] = useState<string>(sections[0]?.id ?? "");
  // grants map: `${section_id}::${user_id}` -> access row id
  const [granted, setGranted] = useState<Record<string, string>>({});
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (sections.length && !sections.some((s) => s.id === activeSection)) setActiveSection(sections[0].id);
  }, [sections, activeSection]);

  const loadGrants = async () => {
    let q = supabase.from("sarmaan_form_access" as any).select("id, section_id, user_id").eq("form_id", formId);
    const { data } = await q;
    const map: Record<string, string> = {};
    (data as any[] | null)?.forEach((r) => { map[`${r.section_id}::${r.user_id}`] = r.id; });
    setGranted(map);
  };

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
          .select("user_id, first_name, last_name, email")
          .eq("is_active", true).order("first_name");
        if (userIds) q = q.in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
        const { data } = await q.limit(1000);
        if (active) setMembers((data as any) || []);
        await loadGrants();
      } finally {
        if (active) setLoadingMembers(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, formId]);

  const filteredMembers = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return members;
    return members.filter((m) =>
      `${m.first_name ?? ""} ${m.last_name ?? ""} ${m.email ?? ""}`.toLowerCase().includes(s));
  }, [members, search]);

  const activeSectionLabel = sections.find((s) => s.id === activeSection)?.label ?? "module";

  const grant = async (m: Member) => {
    setBusy(m.user_id);
    try {
      const { error } = await supabase.from("sarmaan_form_access" as any).insert({
        form_id: formId,
        section_id: activeSection,
        user_id: m.user_id,
        project_id: projectId ?? null,
        granted_by: user?.id ?? null,
      });
      if (error) throw error;
      await loadGrants();
      toast.success(`Access granted to "${activeSectionLabel}".`);
    } catch (e: any) {
      toast.error(e?.message || "Could not grant access.");
    } finally { setBusy(null); }
  };

  const revoke = async (m: Member) => {
    const id = granted[`${activeSection}::${m.user_id}`];
    if (!id) return;
    setBusy(m.user_id);
    try {
      const { error } = await supabase.from("sarmaan_form_access" as any).delete().eq("id", id);
      if (error) throw error;
      await loadGrants();
      toast.success("Access removed.");
    } catch (e: any) {
      toast.error(e?.message || "Could not remove access.");
    } finally { setBusy(null); }
  };

  const grantAllShown = async () => {
    setBusy("__all");
    try {
      const toGrant = filteredMembers.filter((m) => !granted[`${activeSection}::${m.user_id}`]);
      if (!toGrant.length) { toast.info("Everyone shown already has access to this module."); return; }
      const { error } = await supabase.from("sarmaan_form_access" as any).insert(
        toGrant.map((m) => ({ form_id: formId, section_id: activeSection, user_id: m.user_id, project_id: projectId ?? null, granted_by: user?.id ?? null })),
      );
      if (error) throw error;
      await loadGrants();
      toast.success(`Access granted to ${toGrant.length} member(s).`);
    } catch (e: any) {
      toast.error(e?.message || "Could not grant access to all.");
    } finally { setBusy(null); }
  };

  const grantAllModules = async (m: Member) => {
    setBusy(m.user_id);
    try {
      const toGrant = sections.filter((s) => !granted[`${s.id}::${m.user_id}`]);
      if (!toGrant.length) { toast.info("This member already has all modules."); return; }
      const { error } = await supabase.from("sarmaan_form_access" as any).insert(
        toGrant.map((s) => ({ form_id: formId, section_id: s.id, user_id: m.user_id, project_id: projectId ?? null, granted_by: user?.id ?? null })),
      );
      if (error) throw error;
      await loadGrants();
      toast.success(`All ${toGrant.length} modules granted.`);
    } catch (e: any) {
      toast.error(e?.message || "Could not grant all modules.");
    } finally { setBusy(null); }
  };

  const grantedCountForSection = Object.keys(granted).filter((k) => k.startsWith(`${activeSection}::`)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> {wholeChecklist ? "Checklist access" : "Checklist module access"}</DialogTitle>
          <DialogDescription>
            {wholeChecklist
              ? <>Grant project members access to the <strong>entire {formName}</strong>. One grant unlocks the whole checklist.</>
              : <>Grant project members access to individual modules of the <strong>{formName}</strong>. Each module is an independent form.</>}
          </DialogDescription>
        </DialogHeader>

        {!wholeChecklist && (
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <LayoutGrid className="h-3.5 w-3.5" /> Select module to manage
            </label>
            <select
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={activeSection}
              onChange={(e) => setActiveSection(e.target.value)}
            >
              {sections.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>
        )}


        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search members…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Button size="sm" variant="secondary" onClick={grantAllShown} disabled={busy === "__all"}>
            {busy === "__all" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Grant all shown
          </Button>
        </div>

        <ScrollArea className="h-[48vh] pr-3">
          {loadingMembers ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : filteredMembers.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No members found.</p>
          ) : (
            <div className="space-y-1.5">
              {filteredMembers.map((m) => {
                const isGranted = !!granted[`${activeSection}::${m.user_id}`];
                const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || m.email || "Member";
                const totalForMember = sections.filter((s) => granted[`${s.id}::${m.user_id}`]).length;
                return (
                  <div key={m.user_id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />{m.email || "no email"}
                        <span className="ml-1 rounded bg-muted px-1 text-[10px]">{totalForMember}/{sections.length} modules</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-[11px]" disabled={!!busy} onClick={() => grantAllModules(m)} title="Grant all modules">
                        <CheckSquare className="mr-1 h-3.5 w-3.5" /> All
                      </Button>
                      {isGranted ? (
                        <Button size="sm" variant="ghost" className="text-destructive" disabled={busy === m.user_id} onClick={() => revoke(m)}>
                          {busy === m.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => grant(m)}>
                          <Plus className="mr-1 h-4 w-4" /> Grant
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {grantedCountForSection} member(s) can access <strong>{activeSectionLabel}</strong>.
        </div>
      </DialogContent>
    </Dialog>
  );
}
