import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Target, Save, Loader2, Users, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formId: string;
  formName: string;
}

interface AssignedUser {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface TargetRow {
  user_id: string;
  daily_target: number;
  is_active: boolean;
}

const FormDailyTargetDialog = ({ open, onOpenChange, formId, formName }: Props) => {
  const { user } = useAuth();
  const [assignedUsers, setAssignedUsers] = useState<AssignedUser[]>([]);
  const [targets, setTargets] = useState<Record<string, TargetRow>>({});
  const [bulkTarget, setBulkTarget] = useState(5);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    if (!formId) return;
    setLoading(true);
    try {
      // Get users assigned to this form
      const { data: assignments } = await supabase
        .from("user_form_assignments")
        .select("user_id")
        .eq("form_id", formId);

      const userIds = (assignments || []).map((a: any) => a.user_id);
      if (userIds.length === 0) {
        setAssignedUsers([]);
        setLoading(false);
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, first_name, last_name, email")
        .in("user_id", userIds)
        .eq("is_active", true);

      setAssignedUsers(profiles || []);

      // Get existing targets
      const { data: existingTargets } = await supabase
        .from("form_daily_targets")
        .select("user_id, daily_target, is_active")
        .eq("form_id", formId);

      const targetMap: Record<string, TargetRow> = {};
      (existingTargets || []).forEach((t: any) => {
        targetMap[t.user_id] = { user_id: t.user_id, daily_target: t.daily_target, is_active: t.is_active };
      });
      // Initialize missing users with default
      (profiles || []).forEach((p: AssignedUser) => {
        if (!targetMap[p.user_id]) {
          targetMap[p.user_id] = { user_id: p.user_id, daily_target: 5, is_active: true };
        }
      });
      setTargets(targetMap);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [formId]);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  const updateTarget = (userId: string, field: keyof TargetRow, value: any) => {
    setTargets(prev => ({
      ...prev,
      [userId]: { ...prev[userId], [field]: value },
    }));
  };

  const applyBulkTarget = () => {
    setTargets(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(uid => {
        updated[uid] = { ...updated[uid], daily_target: bulkTarget };
      });
      return updated;
    });
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const rows = Object.values(targets).map(t => ({
        form_id: formId,
        user_id: t.user_id,
        daily_target: t.daily_target,
        is_active: t.is_active,
        set_by: user.id,
      }));

      // Upsert all targets
      const { error } = await supabase
        .from("form_daily_targets")
        .upsert(rows, { onConflict: "form_id,user_id" });

      if (error) throw error;

      // Notify each user about their target
      const notifications = Object.values(targets)
        .filter(t => t.is_active)
        .map(t => {
          const profile = assignedUsers.find(u => u.user_id === t.user_id);
          return {
            user_id: t.user_id,
            title: "Daily Submission Target Set",
            message: `Your daily target for "${formName}" has been set to ${t.daily_target} submissions. Good luck!`,
            type: "info",
            category: "target",
            related_id: formId,
          };
        });

      if (notifications.length > 0) {
        await supabase.from("notifications").insert(notifications);
      }

      toast({ title: "Targets saved", description: `Daily targets set for ${rows.length} users and notifications sent.` });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const filtered = assignedUsers.filter(u =>
    `${u.first_name} ${u.last_name} ${u.email}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <Target className="h-5 w-5 text-primary" />
            Daily Submission Targets
          </DialogTitle>
          <DialogDescription>
            Set daily submission targets for <span className="font-semibold text-foreground">{formName}</span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : assignedUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No users assigned to this form yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Assign users to this form first.</p>
          </div>
        ) : (
          <>
            {/* Bulk target */}
            <div className="flex items-center gap-2 rounded-lg border border-border p-3 bg-muted/30">
              <span className="text-xs font-medium text-muted-foreground">Set all to:</span>
              <Input
                type="number"
                min={1}
                max={999}
                value={bulkTarget}
                onChange={e => setBulkTarget(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 h-8 text-sm"
              />
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={applyBulkTarget}>
                Apply to All
              </Button>
              <Badge variant="secondary" className="ml-auto text-xs">
                {assignedUsers.length} users
              </Badge>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9 h-8 text-sm"
              />
            </div>

            <Separator />

            {/* User list */}
            <ScrollArea className="flex-1 max-h-[350px] pr-2">
              <div className="space-y-2">
                {filtered.map(u => {
                  const t = targets[u.user_id];
                  if (!t) return null;
                  return (
                    <div
                      key={u.user_id}
                      className="flex items-center gap-3 rounded-lg border border-border/50 p-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {u.first_name} {u.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Input
                          type="number"
                          min={1}
                          max={999}
                          value={t.daily_target}
                          onChange={e => updateTarget(u.user_id, "daily_target", Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 h-8 text-sm text-center"
                        />
                        <span className="text-xs text-muted-foreground">/day</span>
                        <Switch
                          checked={t.is_active}
                          onCheckedChange={v => updateTarget(u.user_id, "is_active", v)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save & Notify Users
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default FormDailyTargetDialog;
