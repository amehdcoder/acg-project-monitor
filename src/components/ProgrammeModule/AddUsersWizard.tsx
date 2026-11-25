import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Check, ChevronLeft, ChevronRight, Eye, PenLine, Search, UserPlus, Users, Layers, LayoutGrid, FileText, X, BookOpenCheck } from "lucide-react";
import { useProjectUsers } from "@/lib/programmeModule/projectUsers";
import { saveTeamMember, type TeamMemberRow } from "@/lib/programmeModule/projectTeam";
import { ACCESS_PAGES } from "@/lib/programmeModule/accessStudio";
import { ACCESS_LEVELS, buildAccessPermissions, describeScope, type AccessLevel } from "@/lib/programmeModule/addUsersAccess";

type ScopeMode = "all" | "some";
const STEPS = ["People", "Access", "Where", "Review"] as const;
const LEVEL_ICON: Record<AccessLevel, typeof Eye> = { view: Eye, view_record: BookOpenCheck, record: PenLine };

interface Props {
  open: boolean; onOpenChange: (o: boolean) => void; projectId: string; moduleId?: string;
  components: { key: string; label: string }[]; members: TeamMemberRow[]; onSaved: () => void;
}

export default function AddUsersWizard({ open, onOpenChange, projectId, moduleId, components, members, onSaved }: Props) {
  const { toast } = useToast();
  const { users } = useProjectUsers(projectId);
  const [step, setStep] = useState(0);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [invite, setInvite] = useState({ name: "", email: "" });
  const [invites, setInvites] = useState<{ name: string; email: string }[]>([]);
  const [level, setLevel] = useState<AccessLevel>("view_record");
  const [compMode, setCompMode] = useState<ScopeMode>("all");
  const [comps, setComps] = useState<string[]>([]);
  const [pageMode, setPageMode] = useState<ScopeMode>("all");
  const [pages, setPages] = useState<string[]>([]);
  const [recMode, setRecMode] = useState<ScopeMode>("all");
  const [recs, setRecs] = useState<{ id: string; full_name: string; case_id: string }[]>([]);
  const [recQ, setRecQ] = useState("");
  const [recHits, setRecHits] = useState<{ id: string; full_name: string; case_id: string }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setStep(0); setPicked(new Set()); setInvites([]); setQ(""); } }, [open]);

  useEffect(() => {
    if (recMode !== "some" || recQ.trim().length < 2) { setRecHits([]); return; }
    const t = setTimeout(async () => {
      const term = recQ.trim().replace(/[%,()]/g, "");
      const { data } = await supabase.from("beneficiaries").select("id,full_name,case_id")
        .eq("project_id", projectId).or(`full_name.ilike.%${term}%,case_id.ilike.%${term}%`).limit(20);
      setRecHits(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [recQ, recMode, projectId]);

  const memberByUser = useMemo(() => new Map(members.filter((m) => m.user_id).map((m) => [m.user_id as string, m])), [members]);
  const filtered = users.filter((u) => `${u.full_name} ${u.email || ""}`.toLowerCase().includes(q.toLowerCase()));
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const scope = { components: compMode === "some" ? comps : [], pages: pageMode === "some" ? pages : [], beneficiaryIds: recMode === "some" ? recs.map((r) => r.id) : [] };
  const summary = describeScope(scope, (k) => components.find((c) => c.key === k)?.label || k);
  const peopleCount = picked.size + invites.length;
  const canNext = step === 0 ? peopleCount > 0
    : step === 2 ? !(compMode === "some" && !comps.length) && !(pageMode === "some" && !pages.length) && !(recMode === "some" && !recs.length)
    : true;

  const save = async () => {
    setBusy(true);
    try {
      const permissions = buildAccessPermissions(level, scope);
      for (const uid of picked) {
        const u = users.find((x) => x.user_id === uid)!;
        const existing = memberByUser.get(uid);
        await saveTeamMember({
          ...(existing || {}), id: existing?.id, project_id: projectId, module_id: existing?.module_id || moduleId || null,
          user_id: uid, full_name: existing?.full_name || u.full_name, email: existing?.email || u.email, phone: existing?.phone || u.phone,
          team_type: existing?.team_type || "partner", is_active: true,
          permissions: { ...(existing?.permissions || {}), ...permissions, access_category: undefined,
            hidden_views: permissions.hidden_views, components: permissions.components, beneficiary_ids: permissions.beneficiary_ids },
        });
      }
      for (const i of invites) {
        await saveTeamMember({ project_id: projectId, module_id: moduleId || null, full_name: i.name, email: i.email || null, team_type: "partner", permissions, is_active: true });
      }
      window.dispatchEvent(new Event("programme-access-changed"));
      toast({ title: "Users added", description: `${peopleCount} user(s) now have ${ACCESS_LEVELS.find((l) => l.key === level)?.label.toLowerCase()} access.` });
      onSaved(); onOpenChange(false);
    } catch (e) {
      toast({ title: "Could not add users", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const ScopeToggle = ({ mode, setMode, allLabel, someLabel }: { mode: ScopeMode; setMode: (m: ScopeMode) => void; allLabel: string; someLabel: string }) => (
    <div className="inline-flex rounded-lg border bg-muted/50 p-0.5">
      {(["all", "some"] as const).map((m) => (
        <button key={m} type="button" onClick={() => setMode(m)}
          className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>
          {m === "all" ? allLabel : someLabel}
        </button>
      ))}
    </div>
  );
  const Chip = ({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) => (
    <button type="button" onClick={onClick}
      className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted")}>
      {on && <Check className="h-3 w-3" />}{label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <div className="bg-gradient-to-br from-primary to-health-teal p-5 text-primary-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl"><UserPlus className="h-5 w-5" /> Add users to this project</DialogTitle>
            <DialogDescription className="text-primary-foreground/85">Choose people, decide what they can do, and where — in four quick steps.</DialogDescription>
          </DialogHeader>
          <ol className="mt-4 grid grid-cols-4 gap-2">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-center gap-2 text-xs">
                <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                  i < step ? "border-primary-foreground bg-primary-foreground text-primary" : i === step ? "border-primary-foreground bg-primary-foreground/20" : "border-primary-foreground/40 text-primary-foreground/70")}>
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </span>
                <span className={cn("hidden sm:inline", i === step ? "font-semibold" : "text-primary-foreground/75")}>{s}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {step === 0 && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search people on this project by name or email" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
                {filtered.map((u) => {
                  const on = picked.has(u.user_id); const already = memberByUser.has(u.user_id);
                  return (
                    <label key={u.user_id} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors", on ? "border-primary/50 bg-primary/5" : "hover:bg-muted/50")}>
                      <Checkbox checked={on} onCheckedChange={() => setPicked((s) => { const n = new Set(s); if (n.has(u.user_id)) n.delete(u.user_id); else n.add(u.user_id); return n; })} />
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{u.full_name.slice(0, 2).toUpperCase()}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{u.full_name}</span><span className="block truncate text-xs text-muted-foreground">{u.email}</span></span>
                      {already && <Badge variant="secondary" className="text-[10px]">On team</Badge>}
                    </label>
                  );
                })}
                {!filtered.length && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">No matching people with an account on this project.</p>}
              </div>
              <div className="rounded-lg border border-dashed p-3">
                <p className="mb-2 text-xs font-semibold text-muted-foreground">Someone without an account yet? Add them by name — link their account later.</p>
                <div className="flex flex-wrap gap-2">
                  <Input className="min-w-40 flex-1" placeholder="Full name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} />
                  <Input className="min-w-40 flex-1" type="email" placeholder="Email (optional)" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} />
                  <Button variant="outline" disabled={!invite.name.trim()} onClick={() => { setInvites([...invites, { name: invite.name.trim(), email: invite.email.trim() }]); setInvite({ name: "", email: "" }); }}>Add</Button>
                </div>
                {!!invites.length && <div className="mt-2 flex flex-wrap gap-1.5">{invites.map((i, n) => (
                  <Badge key={n} variant="secondary" className="gap-1">{i.name}<button type="button" aria-label={`Remove ${i.name}`} onClick={() => setInvites(invites.filter((_, k) => k !== n))}><X className="h-3 w-3" /></button></Badge>
                ))}</div>}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-3 sm:grid-cols-3">
              {ACCESS_LEVELS.map((l) => {
                const Icon = LEVEL_ICON[l.key]; const on = level === l.key;
                return (
                  <button key={l.key} type="button" onClick={() => setLevel(l.key)}
                    className={cn("flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all", on ? "border-primary bg-primary/5 shadow-card" : "border-border hover:border-primary/40")}>
                    <span className={cn("flex h-10 w-10 items-center justify-center rounded-lg", on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}><Icon className="h-5 w-5" /></span>
                    <span className="font-semibold">{l.label}</span>
                    <span className="text-xs text-muted-foreground">{l.hint}</span>
                  </button>
                );
              })}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <section>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="flex items-center gap-2 text-sm font-semibold"><Layers className="h-4 w-4 text-primary" /> Components</h4>
                  <ScopeToggle mode={compMode} setMode={setCompMode} allLabel="All components" someLabel="Choose components" /></div>
                {compMode === "some" && <div className="flex flex-wrap gap-2">{components.map((c) => <Chip key={c.key} on={comps.includes(c.key)} label={c.label} onClick={() => setComps(toggle(comps, c.key))} />)}</div>}
              </section>
              <section>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="flex items-center gap-2 text-sm font-semibold"><LayoutGrid className="h-4 w-4 text-primary" /> Tabs & features</h4>
                  <ScopeToggle mode={pageMode} setMode={setPageMode} allLabel="All tabs" someLabel="Choose tabs" /></div>
                {pageMode === "some" && <div className="space-y-3">{ACCESS_PAGES.map((g) => (
                  <div key={g.group}><p className="mb-1.5 text-xs font-medium text-muted-foreground">{g.group}</p>
                    <div className="flex flex-wrap gap-2">{g.items.map((i) => <Chip key={i.key} on={pages.includes(i.key)} label={i.label} onClick={() => setPages(toggle(pages, i.key))} />)}</div></div>
                ))}</div>}
              </section>
              <section>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-primary" /> Records</h4>
                  <ScopeToggle mode={recMode} setMode={setRecMode} allLabel="All records" someLabel="Specific records" /></div>
                {recMode === "some" && (
                  <div className="space-y-2">
                    <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input className="pl-9" placeholder="Search by name or Case ID" value={recQ} onChange={(e) => setRecQ(e.target.value)} /></div>
                    {!!recHits.length && <div className="max-h-40 overflow-y-auto rounded-lg border">{recHits.map((r) => {
                      const on = recs.some((x) => x.id === r.id);
                      return <button key={r.id} type="button" onClick={() => setRecs(on ? recs.filter((x) => x.id !== r.id) : [...recs, r])}
                        className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted/50">
                        <span>{r.full_name} <span className="text-xs text-muted-foreground">· {r.case_id}</span></span>{on && <Check className="h-4 w-4 text-primary" />}</button>;
                    })}</div>}
                    {!!recs.length && <div className="flex flex-wrap gap-1.5">{recs.map((r) => (
                      <Badge key={r.id} variant="secondary" className="gap-1">{r.full_name}<button type="button" aria-label={`Remove ${r.full_name}`} onClick={() => setRecs(recs.filter((x) => x.id !== r.id))}><X className="h-3 w-3" /></button></Badge>
                    ))}</div>}
                    <p className="text-xs text-muted-foreground">They will only see these records, plus any they register themselves.</p>
                  </div>
                )}
              </section>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div className="rounded-xl border bg-muted/30 p-4">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-primary" /> {peopleCount} user(s)</p>
                <div className="flex flex-wrap gap-1.5">
                  {[...picked].map((id) => <Badge key={id} variant="secondary">{users.find((u) => u.user_id === id)?.full_name}</Badge>)}
                  {invites.map((i, n) => <Badge key={n} variant="outline">{i.name}</Badge>)}
                </div>
              </div>
              <dl className="grid gap-2 sm:grid-cols-2">
                {[["Access", ACCESS_LEVELS.find((l) => l.key === level)?.label], ["Components", summary.components], ["Tabs & features", summary.pages], ["Records", summary.records]].map(([k, v]) => (
                  <div key={k} className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-sm font-medium">{v}</dd></div>
                ))}
              </dl>
              {[...picked].some((id) => memberByUser.has(id)) && <p className="text-xs text-muted-foreground">People already on the team get these settings in place of their current access.</p>}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t p-3">
          <Button variant="ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)} className="gap-1"><ChevronLeft className="h-4 w-4" /> Back</Button>
          <span className="ml-auto text-xs text-muted-foreground">{peopleCount ? `${peopleCount} selected` : ""}</span>
          {step < 3
            ? <Button disabled={!canNext} onClick={() => setStep(step + 1)} className="gap-1">Next <ChevronRight className="h-4 w-4" /></Button>
            : <Button disabled={busy} onClick={() => void save()} className="gap-1"><UserPlus className="h-4 w-4" /> {busy ? "Adding…" : `Add ${peopleCount} user(s)`}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
