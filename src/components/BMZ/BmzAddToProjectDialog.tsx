import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Plus, Search, ClipboardCheck, BarChart3, CheckCircle2 } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: { id: string; name: string }[];
  userId: string | undefined;
  /** Called after assignments change so the parent can refresh visibility. */
  onChanged?: () => void;
}

/**
 * Lets Owners / Admins add the Jigawa Eye Health (BMZ) Monitoring Checklist
 * & Dashboard to any project so that project's members can access them.
 */
export default function BmzAddToProjectDialog({ open, onOpenChange, projects, userId, onChanged }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [assigned, setAssigned] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await (supabase as any)
        .from("bmz_project_assignments")
        .select("project_id");
      if (cancelled) return;
      const ids = new Set<string>((data ?? []).map((r: any) => r.project_id));
      setAssigned(ids);
      setSelected(new Set(ids));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open]);

  const filtered = useMemo(
    () => projects.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())),
    [projects, search]
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const toAdd = [...selected].filter((id) => !assigned.has(id));
      const toRemove = [...assigned].filter((id) => !selected.has(id));

      if (toAdd.length > 0) {
        const { error } = await (supabase as any)
          .from("bmz_project_assignments")
          .insert(toAdd.map((project_id) => ({ project_id, added_by: userId })));
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await (supabase as any)
          .from("bmz_project_assignments")
          .delete()
          .in("project_id", toRemove);
        if (error) throw error;
      }

      toast({
        title: "Projects updated",
        description: `BMZ Eye Health Checklist is now available in ${selected.size} project${selected.size === 1 ? "" : "s"}.`,
      });
      setAssigned(new Set(selected));
      onChanged?.();
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Could not update projects",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add BMZ Eye Health Checklist to projects</DialogTitle>
          <DialogDescription>
            Select the projects where the Jigawa Eye Health Monitoring Checklist and its dashboard should
            appear for members. You can add or remove projects at any time.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#DCF1EA] px-3 py-1 text-xs font-medium text-[#0f6b52]">
            <ClipboardCheck className="h-3.5 w-3.5" /> Monitoring Checklist
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#DCF1EA] px-3 py-1 text-xs font-medium text-[#0f6b52]">
            <BarChart3 className="h-3.5 w-3.5" /> Monitoring Dashboard
          </span>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No projects found.</p>
        ) : (
          <ScrollArea className="h-64 rounded-md border">
            <div className="divide-y">
              {filtered.map((p) => {
                const checked = selected.has(p.id);
                const already = assigned.has(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggle(p.id)} />
                    <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                    {already && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0f6b52]">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Added
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
