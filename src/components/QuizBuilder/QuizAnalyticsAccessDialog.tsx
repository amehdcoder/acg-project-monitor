/**
 * Admin dialog: grant or revoke access to the Analytics tab of a quiz for any
 * user — including staff outside the quiz's project (rows in
 * `public.quiz_analytics_access`, which RLS reads to unlock the quiz, its
 * questions, in-app attempts and the KoboToolbox-synced submissions).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BarChart3, Loader2, Mail, Plus, Search, Trash2 } from "lucide-react";

interface Member {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  quizId: string;
  quizTitle: string;
}

export default function QuizAnalyticsAccessDialog({ open, onOpenChange, quizId, quizTitle }: Props) {
  const { user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [granted, setGranted] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const loadGrants = useCallback(async () => {
    const { data } = await supabase
      .from("quiz_analytics_access")
      .select("id, user_id")
      .eq("quiz_id", quizId);
    const map: Record<string, string> = {};
    (data ?? []).forEach((r: any) => { map[r.user_id] = r.id; });
    setGranted(map);
  }, [quizId]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        // Every active account — grants intentionally reach beyond the project.
        const { data } = await supabase
          .from("profiles")
          .select("user_id, first_name, last_name, email")
          .eq("is_active", true)
          .order("first_name")
          .limit(1000);
        if (active) setMembers((data as any) ?? []);
        await loadGrants();
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [open, quizId, loadGrants]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return members;
    return members.filter((m) =>
      `${m.first_name ?? ""} ${m.last_name ?? ""} ${m.email ?? ""}`.toLowerCase().includes(s));
  }, [members, search]);

  const grant = async (m: Member) => {
    setBusy(m.user_id);
    try {
      const { error } = await supabase.from("quiz_analytics_access").insert({
        quiz_id: quizId,
        user_id: m.user_id,
        granted_by: user?.id ?? null,
      });
      if (error) throw error;
      await loadGrants();
      toast({ title: "Analytics access granted" });
    } catch (e: any) {
      toast({ title: "Could not grant access", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const revoke = async (m: Member) => {
    const id = granted[m.user_id];
    if (!id) return;
    setBusy(m.user_id);
    try {
      const { error } = await supabase.from("quiz_analytics_access").delete().eq("id", id);
      if (error) throw error;
      await loadGrants();
      toast({ title: "Analytics access revoked" });
    } catch (e: any) {
      toast({ title: "Could not revoke access", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] w-[calc(100vw-1.5rem)] max-w-lg flex-col overflow-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <BarChart3 className="h-5 w-5 text-indigo-600" /> Analytics access
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Choose who can open the Analytics tab of <strong>{quizTitle}</strong>. Grants work for users
            inside and outside the quiz's project, and cover KoboToolbox-synced submissions.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>

        <ScrollArea className="h-[50vh] min-h-[220px] flex-1 pr-3">
          {loading ? (
            <div className="flex h-32 items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No users found.</p>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((m) => {
                const isGranted = !!granted[m.user_id];
                const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || m.email || "User";
                return (
                  <div key={m.user_id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" />{m.email || "no email"}
                      </p>
                    </div>
                    {isGranted ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Badge className="bg-emerald-600 text-[10px] hover:bg-emerald-600">Granted</Badge>
                        <Button
                          size="sm" variant="ghost" className="text-destructive"
                          disabled={busy === m.user_id} onClick={() => revoke(m)}
                        >
                          {busy === m.user_id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" disabled={!!busy} onClick={() => grant(m)}>
                        <Plus className="mr-1 h-4 w-4" /> Grant
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {Object.keys(granted).length} user(s) can currently open this quiz's analytics.
        </div>
      </DialogContent>
    </Dialog>
  );
}
