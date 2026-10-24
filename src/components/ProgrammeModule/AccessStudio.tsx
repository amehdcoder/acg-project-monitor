import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { KeyRound, Eye, RotateCcw, Save, Hospital, Stethoscope, Pill, FileText, ClipboardList, Users, ShieldCheck, Layers, UserCheck, LayoutGrid } from "lucide-react";
import { PERMISSION_LIST, useTeamMembers, type TeamPermissions, type PermissionKey } from "@/lib/programmeModule/projectTeam";
import { VIEW_AS_ROLES, defaultRolePermissions, type ViewAsRole } from "@/lib/programmeModule/viewAs";
import { ACCESS_PAGES, PROFILE_SECTIONS, pageAllowed, toggleList, useAccessProfiles } from "@/lib/programmeModule/accessStudio";

const ICONS: Record<ViewAsRole, typeof Eye> = {
  facility_focal: Hospital, clinician: Stethoscope, pharmacist: Pill, records_officer: FileText,
  programme_officer: ClipboardList, team_member: Users, safeguarding_officer: ShieldCheck,
};
type Section = "actions" | "pages" | "profile" | "people";
const SECTIONS: { key: Section; label: string; icon: typeof Eye }[] = [
  { key: "actions", label: "What they can do", icon: KeyRound },
  { key: "pages", label: "Pages & dashboards", icon: LayoutGrid },
  { key: "profile", label: "Record profile detail", icon: Layers },
  { key: "people", label: "Who follows this", icon: UserCheck },
];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;
const KEEP = ["components", "programme_areas", "programme_staff", "health_worker", "dashboards", "feedback_share"] as const;

export default function AccessStudio({ open, onOpenChange, projectId, onPreview }: {
  open: boolean; onOpenChange: (o: boolean) => void; projectId?: string; onPreview: (role: ViewAsRole) => void;
}) {
  const { toast } = useToast();
  const { profiles, save, reset } = useAccessProfiles(projectId);
  const { members, reload: reloadMembers } = useTeamMembers(projectId);
  const [role, setRole] = useState<ViewAsRole>("facility_focal");
  const [section, setSection] = useState<Section>("actions");
  const [draft, setDraft] = useState<TeamPermissions>({});
  const [busy, setBusy] = useState(false);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  useEffect(() => { setDraft(profiles[role] || defaultRolePermissions(role)); }, [role, profiles]);
  useEffect(() => {
    setChosen(new Set(members.filter((m) => m.permissions?.access_category === role).map((m) => m.id)));
  }, [role, members]);

  const groups = useMemo(() => {
    const g: Record<string, typeof PERMISSION_LIST> = {};
    for (const p of PERMISSION_LIST) (g[p.group] ||= []).push(p);
    return Object.entries(g);
  }, []);
  const granted = PERMISSION_LIST.filter((p) => draft[p.key]).length;
  const pagesOn = ACCESS_PAGES.flatMap((g) => g.items).filter((i) => pageAllowed(draft, i.key)).length;
  const pagesAll = ACCESS_PAGES.flatMap((g) => g.items).length;
  const customised = Boolean(profiles[role]);

  const setPerm = (k: PermissionKey, on: boolean) => setDraft((d) => ({ ...d, [k]: on || undefined }));
  const setPage = (k: string, on: boolean) => setDraft((d) => ({ ...d, hidden_views: toggleList(d.hidden_views, k, on) }));
  const setSectionOn = (k: string, on: boolean) => setDraft((d) => ({ ...d, hidden_sections: toggleList(d.hidden_sections, k, on) }));

  const persist = async () => {
    setBusy(true);
    try {
      await save(role, draft);
      // Apply to the team members who follow this category, keeping their own component/cadre setup.
      const updates = members.filter((m) => chosen.has(m.id) || m.permissions?.access_category === role);
      for (const m of updates) {
        const follow = chosen.has(m.id);
        const own = Object.fromEntries(KEEP.filter((k) => m.permissions?.[k] !== undefined).map((k) => [k, m.permissions[k]]));
        const permissions = follow ? { ...draft, ...own, access_category: role } : { ...m.permissions, access_category: undefined };
        await db.from("programme_team_members").update({ permissions }).eq("id", m.id);
      }
      await reloadMembers();
      toast({ title: "Access saved", description: `${VIEW_AS_ROLES.find((r) => r.key === role)?.label} access updated${chosen.size ? ` for ${chosen.size} team member(s)` : ""}.` });
    } catch (e) {
      toast({ title: "Could not save access", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const Row = ({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) => (
    <label className={cn("flex cursor-pointer items-center justify-between gap-3 rounded-lg border p-3 transition-colors", on ? "border-primary/40 bg-primary/5" : "border-border")}>
      <span className="min-w-0"><span className="block text-sm font-medium">{label}</span>{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span>
      <Switch checked={on} onCheckedChange={onChange} />
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92dvh] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        <div className="bg-gradient-to-br from-primary to-health-teal p-5 text-primary-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl"><KeyRound className="h-5 w-5" /> Access studio</DialogTitle>
            <DialogDescription className="text-primary-foreground/85">Decide what every kind of user can see and do in the Longitudinal Beneficiary Records — down to each page, dashboard and record section.</DialogDescription>
          </DialogHeader>
        </div>
        <div className="grid min-h-0 flex-1 md:grid-cols-[260px_1fr]">
          <aside className="overflow-y-auto border-b bg-muted/40 p-3 md:border-b-0 md:border-r">
            <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">User categories</p>
            <div className="flex gap-2 overflow-x-auto md:flex-col">
              {VIEW_AS_ROLES.map((r) => {
                const Icon = ICONS[r.key]; const on = r.key === role;
                return (
                  <button key={r.key} type="button" onClick={() => setRole(r.key)}
                    className={cn("flex shrink-0 items-center gap-3 rounded-lg p-2.5 text-left text-sm transition-all", on ? "bg-background font-semibold shadow-card ring-1 ring-primary/30" : "hover:bg-background/70")}>
                    <span className={cn("flex h-8 w-8 items-center justify-center rounded-md", on ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground")}><Icon className="h-4 w-4" /></span>
                    <span className="flex-1">{r.label}</span>
                    {profiles[r.key] && <span className="h-2 w-2 rounded-full bg-health-teal" title="Customised" />}
                  </button>
                );
              })}
            </div>
          </aside>
          <main className="flex min-h-0 flex-col">
            <div className="flex flex-wrap items-center gap-2 border-b p-3">
              {SECTIONS.map((s) => (
                <Button key={s.key} size="sm" variant={section === s.key ? "default" : "ghost"} className="gap-1.5" onClick={() => setSection(s.key)}>
                  <s.icon className="h-4 w-4" /> {s.label}
                </Button>
              ))}
              <div className="ml-auto flex gap-2 text-xs">
                <Badge variant="secondary">{granted} actions</Badge>
                <Badge variant="secondary">{pagesOn}/{pagesAll} pages</Badge>
                {customised ? <Badge className="bg-health-teal text-primary-foreground">Customised</Badge> : <Badge variant="outline">Default</Badge>}
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
              {section === "actions" && groups.map(([g, items]) => (
                <section key={g}><h4 className="mb-2 text-sm font-semibold">{g}</h4>
                  <div className="grid gap-2 sm:grid-cols-2">{items.map((p) => <Row key={p.key} label={p.label} hint={p.hint} on={Boolean(draft[p.key])} onChange={(v) => setPerm(p.key, v)} />)}</div>
                </section>
              ))}
              {section === "pages" && ACCESS_PAGES.map((g) => (
                <section key={g.group}>
                  <div className="mb-2 flex items-center justify-between"><h4 className="text-sm font-semibold">{g.group}</h4>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => g.items.forEach((i) => setPage(i.key, true))}>All on</Button>
                      <Button size="sm" variant="ghost" onClick={() => g.items.forEach((i) => setPage(i.key, false))}>All off</Button>
                    </div></div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{g.items.map((i) => <Row key={i.key} label={i.label} on={pageAllowed(draft, i.key)} onChange={(v) => setPage(i.key, v)} />)}</div>
                </section>
              ))}
              {section === "pages" && <p className="text-xs text-muted-foreground">Pages still also need the matching action (for example, safeguarding pages need "See safeguarding").</p>}
              {section === "profile" && (
                <section><h4 className="mb-1 text-sm font-semibold">Sections inside each beneficiary profile</h4>
                  <p className="mb-3 text-xs text-muted-foreground">Overview and component tabs always show; switch off any extra detail this category should not open.</p>
                  <div className="grid gap-2 sm:grid-cols-2">{PROFILE_SECTIONS.map((s) => <Row key={s.key} label={s.label} on={!(draft.hidden_sections || []).includes(s.key)} onChange={(v) => setSectionOn(s.key, v)} />)}</div>
                </section>
              )}
              {section === "people" && (
                <section><h4 className="mb-1 text-sm font-semibold">Project team members who follow this category</h4>
                  <p className="mb-3 text-xs text-muted-foreground">Ticked people get these settings when you save. Their own component and cadre choices are kept.</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {members.filter((m) => m.is_active).map((m) => (
                      <label key={m.id} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3">
                        <Checkbox checked={chosen.has(m.id)} onCheckedChange={(v) => setChosen((s) => { const n = new Set(s); if (v) n.add(m.id); else n.delete(m.id); return n; })} />
                        <span className="min-w-0"><span className="block text-sm font-medium">{m.full_name}</span><span className="block truncate text-xs text-muted-foreground">{m.designation || m.email || ""}</span></span>
                      </label>
                    ))}
                    {!members.length && <p className="text-sm text-muted-foreground">No project team members yet — add them under Manage → Project team.</p>}
                  </div>
                </section>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t p-3">
              <Button variant="ghost" className="gap-1.5" disabled={!customised || busy} onClick={() => void reset(role)}><RotateCcw className="h-4 w-4" /> Reset to default</Button>
              <Button variant="outline" className="gap-1.5" onClick={() => onPreview(role)}><Eye className="h-4 w-4" /> Preview as this user</Button>
              <Button className="ml-auto gap-1.5" disabled={busy} onClick={() => void persist()}><Save className="h-4 w-4" /> {busy ? "Saving…" : "Save access"}</Button>
            </div>
          </main>
        </div>
      </DialogContent>
    </Dialog>
  );
}
