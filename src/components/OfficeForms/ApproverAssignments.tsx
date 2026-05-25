import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Trash2, UserPlus } from "lucide-react";
import { APPROVER_ROLE_META, type ApproverRole } from "./approvals";

interface Profile { user_id: string; first_name: string; last_name: string; email: string; }
interface Assignment { id: string; user_id: string; approver_role: ApproverRole; profile?: Profile; }

export default function ApproverAssignments({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const { user } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [rows, setRows] = useState<Assignment[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<ApproverRole>("hr");

  async function refresh() {
    const [{ data: profs }, { data: assigns }] = await Promise.all([
      supabase.from("profiles").select("user_id, first_name, last_name, email").eq("approval_status", "approved").order("first_name"),
      supabase.from("office_form_approvers" as any).select("id, user_id, approver_role").order("created_at"),
    ]);
    const profList = (profs as Profile[]) || [];
    setUsers(profList);
    const profMap = new Map(profList.map(p => [p.user_id, p]));
    setRows(((assigns as any[]) || []).map(a => ({ ...a, profile: profMap.get(a.user_id) })));
  }

  useEffect(() => { if (open) refresh(); }, [open]);

  async function add() {
    if (!selectedUser) { toast({ title: "Select a user" }); return; }
    const { error } = await supabase.from("office_form_approvers" as any).insert({
      user_id: selectedUser, approver_role: selectedRole, assigned_by: user?.id,
    });
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Approver assigned" });
    setSelectedUser("");
    refresh();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("office_form_approvers" as any).delete().eq("id", id);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    refresh();
  }

  const grouped = (Object.keys(APPROVER_ROLE_META) as ApproverRole[]).map(r => ({
    role: r, meta: APPROVER_ROLE_META[r], items: rows.filter(x => x.approver_role === r),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Office Approvers</DialogTitle>
        </DialogHeader>

        <Card className="p-4 border border-border/60">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr,180px,auto] gap-2">
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger>
              <SelectContent>
                {users.map(u => (
                  <SelectItem key={u.user_id} value={u.user_id}>
                    {(u.first_name || "") + " " + (u.last_name || "")} · {u.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedRole} onValueChange={v => setSelectedRole(v as ApproverRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(APPROVER_ROLE_META) as ApproverRole[]).map(r => (
                  <SelectItem key={r} value={r}>{APPROVER_ROLE_META[r].title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={add}><UserPlus className="h-4 w-4 mr-1.5" /> Assign</Button>
          </div>
        </Card>

        <div className="space-y-3">
          {grouped.map(g => (
            <Card key={g.role} className="border border-border/60 overflow-hidden">
              <div className={`px-4 py-2.5 ${g.meta.tintBg} flex items-center justify-between`}>
                <div>
                  <p className={`font-semibold text-sm ${g.meta.tintFg}`}>{g.meta.title}</p>
                  <p className="text-[11px] text-muted-foreground">{g.meta.subtitle}</p>
                </div>
                <span className={`text-xs font-semibold ${g.meta.tintFg}`}>{g.items.length}</span>
              </div>
              <div className="divide-y divide-border/40">
                {g.items.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-muted-foreground italic">No one assigned yet.</p>
                ) : g.items.map(it => (
                  <div key={it.id} className="px-4 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{(it.profile?.first_name || "") + " " + (it.profile?.last_name || "") || "Unknown user"}</p>
                      <p className="text-[11px] text-muted-foreground">{it.profile?.email}</p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => remove(it.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
