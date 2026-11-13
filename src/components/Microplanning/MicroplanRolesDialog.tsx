import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, ShieldCheck, UserPlus, Save, LayoutDashboard, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MICROPLAN_ACCESS_CHANGED, type MicroplanProjectRole } from "@/lib/microplanning/projectRoles";

interface Member {
  user_id: string; first_name: string | null; last_name: string | null; email: string | null;
  designation: string | null; is_member: boolean; assigned_role: string | null; effective_access: string;
}
type Account = Pick<Member, "user_id" | "first_name" | "last_name" | "email">;
const nameOf = (account: Account) => [account.first_name, account.last_name].filter(Boolean).join(" ") || account.email || "Member";

export default function MicroplanRolesDialog({ open, onOpenChange, projectId, projectName }: {
  open: boolean; onOpenChange: (open: boolean) => void; projectId: string; projectName?: string;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [newRole, setNewRole] = useState<MicroplanProjectRole>("collector");
  const [online, setOnline] = useState(navigator.onLine);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true); setError(null);
    try {
      const { data, error: readError } = await supabase.rpc("list_microplan_project_members", { _project_id: projectId });
      if (readError) throw readError;
      setMembers(data ?? []); setDrafts({});
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not load project access."); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    setMembers([]); setSearch(""); setAccountSearch(""); setSelectedAccount(""); setAccounts([]);
    void load();
    const connected = () => setOnline(navigator.onLine);
    window.addEventListener("online", connected); window.addEventListener("offline", connected);
    return () => { window.removeEventListener("online", connected); window.removeEventListener("offline", connected); };
  }, [open, load]);

  useEffect(() => {
    if (!open || !online || accountSearch.trim().length < 2) { setAccounts([]); return; }
    let active = true;
    const timer = window.setTimeout(async () => {
      const term = accountSearch.trim().replace(/[^\p{L}\p{N}@. _+-]/gu, "");
      if (term.length < 2) return;
      const { data, error: searchError } = await supabase.from("profiles")
        .select("user_id,first_name,last_name,email").eq("is_active", true).eq("approval_status", "approved")
        .or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`).order("first_name").limit(20);
      if (active) { setAccounts(data ?? []); if (searchError) setError("Could not search approved accounts."); }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [accountSearch, open, online]);

  const save = async (userId: string, role: string | null) => {
    if (!online || !projectId) return;
    setBusy(userId); setError(null);
    try {
      const { error: saveError } = await supabase.rpc("set_microplan_project_role", {
        _project_id: projectId, _user_id: userId, _role: role,
      });
      if (saveError) throw saveError;
      await load();
      window.dispatchEvent(new Event(MICROPLAN_ACCESS_CHANGED));
      toast({ title: role ? "Project role saved" : "Explicit role removed", description: projectName });
      setSelectedAccount("");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save project access."); }
    finally { setBusy(null); }
  };

  const filtered = useMemo(() => members.filter(member =>
    `${nameOf(member)} ${member.email ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())), [members, search]);

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="w-[96vw] max-w-2xl max-h-[90dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Microplanning access</DialogTitle>
        <DialogDescription>{projectName || "Selected project"} · Project-specific roles</DialogDescription>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3 border-y border-border py-3 text-xs">
        <div className="flex gap-2"><ClipboardList className="h-4 w-4 shrink-0 text-primary" /><div><strong>Collector</strong><p className="text-muted-foreground">Entry form and own submissions</p></div></div>
        <div className="flex gap-2"><LayoutDashboard className="h-4 w-4 shrink-0 text-primary" /><div><strong>Dashboard</strong><p className="text-muted-foreground">Complete project dashboard; no admin powers</p></div></div>
      </div>
      {!online && <p role="status" className="text-sm text-destructive">Connect to the internet to change access.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="space-y-4 pr-1">
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Project people <span className="text-muted-foreground">({members.length})</span></h3>
          <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input aria-label="Search project people" placeholder="Search project people…" className="pl-9" value={search} onChange={event => setSearch(event.target.value)} /></div>
          <div className="max-h-[34dvh] overflow-y-auto divide-y divide-border">
            {loading ? <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : filtered.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No matching project people.</p> : filtered.map(member => {
              const original = member.assigned_role ?? "default";
              const draft = drafts[member.user_id] ?? original;
              const name = nameOf(member);
              return <div key={member.user_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1"><p className="text-sm font-medium break-words">{name}</p><p className="text-xs text-muted-foreground break-all">{member.email}</p>
                  <div className="flex items-center gap-2 mt-1"><Badge variant={member.effective_access === "dashboard" ? "default" : "secondary"}>{member.effective_access === "entry" ? "Entry form" : member.effective_access === "dashboard" ? "Dashboard" : "No access"}</Badge><span className="text-xs text-muted-foreground">{member.is_member ? "Project member" : "Microplanning only"}</span></div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Select value={draft} onValueChange={value => setDrafts(previous => ({ ...previous, [member.user_id]: value }))} disabled={!!busy || !online}>
                    <SelectTrigger aria-label={`Role for ${name}`} className="w-[175px]"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="default">Inherited access</SelectItem><SelectItem value="collector">Collector</SelectItem><SelectItem value="dashboard">Dashboard</SelectItem></SelectContent>
                  </Select>
                  <Button size="icon" variant="outline" aria-label={`Save role for ${name}`} title={`Save role for ${name}`} disabled={draft === original || !!busy || !online} onClick={() => void save(member.user_id, draft === "default" ? null : draft)}>{busy === member.user_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}</Button>
                </div>
              </div>;
            })}
          </div>
        </section>
        <section className="space-y-2 border-t border-border pt-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><UserPlus className="h-4 w-4 text-primary" /> Grant an approved account access</h3>
          <Input aria-label="Find approved account" placeholder="Find by name or email…" value={accountSearch} onChange={event => { setAccountSearch(event.target.value); setSelectedAccount(""); }} disabled={!online || !!busy} />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedAccount} onValueChange={setSelectedAccount} disabled={!online || accounts.length === 0 || !!busy}>
              <SelectTrigger aria-label="Approved account" className="min-w-0 flex-1 basis-[200px]"><SelectValue placeholder="Select account" /></SelectTrigger>
              <SelectContent>{accounts.map(account => <SelectItem key={account.user_id} value={account.user_id}>{nameOf(account)} · {account.email}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={newRole} onValueChange={value => setNewRole(value as MicroplanProjectRole)} disabled={!online || !!busy}><SelectTrigger aria-label="New account role" className="w-[130px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="collector">Collector</SelectItem><SelectItem value="dashboard">Dashboard</SelectItem></SelectContent></Select>
            <Button className="gap-1.5" disabled={!selectedAccount || !online || !!busy} onClick={() => void save(selectedAccount,newRole)}><UserPlus className="h-4 w-4" /> Grant access</Button>
          </div>
        </section>
      </div>
    </DialogContent>
  </Dialog>;
}