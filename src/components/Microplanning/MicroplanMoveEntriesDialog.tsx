/**
 * Super Admin dialog — move (or copy) collected microplan entries from a
 * source project into one or many target projects. Copying leaves the
 * source rows untouched; moving reassigns them in place.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, MoveRight, Copy, Search, ArrowRightLeft } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface Project { id: string; name: string }
interface Entry {
  id: string; state: string; lga: string; ward: string;
  community_name: string; settlement_name: string | null; created_at: string;
}

interface Props { open: boolean; onOpenChange: (v: boolean) => void; }

export default function MicroplanMoveEntriesDialog({ open, onOpenChange }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [targetIds, setTargetIds] = useState<Set<string>>(new Set());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase.from("projects").select("id, name").order("name");
      setProjects((data as any) || []);
    })();
  }, [open]);

  useEffect(() => {
    if (!sourceId) { setEntries([]); setSelectedEntryIds(new Set()); return; }
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase.from("microplan_entries")
          .select("id, state, lga, ward, community_name, settlement_name, created_at")
          .eq("project_id", sourceId)
          .order("created_at", { ascending: false })
          .limit(500);
        if (active) { setEntries((data as any) || []); setSelectedEntryIds(new Set()); }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [sourceId]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return entries;
    return entries.filter((e) =>
      `${e.state} ${e.lga} ${e.ward} ${e.community_name} ${e.settlement_name ?? ""}`
        .toLowerCase().includes(s));
  }, [entries, search]);

  const allSelected = filtered.length > 0 && filtered.every((e) => selectedEntryIds.has(e.id));
  const toggleAll = () => {
    setSelectedEntryIds((prev) => {
      const n = new Set(prev);
      if (allSelected) filtered.forEach((e) => n.delete(e.id));
      else filtered.forEach((e) => n.add(e.id));
      return n;
    });
  };

  const perform = async (mode: "move" | "copy") => {
    if (!sourceId || targetIds.size === 0 || selectedEntryIds.size === 0) return;
    setBusy(true);
    try {
      const ids = Array.from(selectedEntryIds);
      const targets = Array.from(targetIds);
      if (mode === "move") {
        // Move: reassign to first target, then copy to any extras
        const [first, ...extras] = targets;
        const { error: upErr } = await supabase.from("microplan_entries")
          .update({ project_id: first, updated_at: new Date().toISOString() })
          .in("id", ids);
        if (upErr) throw upErr;
        if (extras.length) await copyRows(ids, extras);
        toast.success(`Moved ${ids.length} entries → ${projects.find(p => p.id === first)?.name}${extras.length ? ` (+${extras.length} copies)` : ""}.`);
      } else {
        await copyRows(ids, targets);
        toast.success(`Copied ${ids.length} entries to ${targets.length} project(s).`);
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Operation failed.");
    } finally { setBusy(false); }
  };

  const copyRows = async (ids: string[], toProjects: string[]) => {
    // Fetch full rows to duplicate
    const { data: rows, error } = await supabase.from("microplan_entries")
      .select("*").in("id", ids);
    if (error) throw error;
    const inserts: any[] = [];
    for (const row of (rows as any[]) || []) {
      for (const pid of toProjects) {
        const { id: _oldId, created_at: _c, updated_at: _u, ...rest } = row;
        inserts.push({ ...rest, project_id: pid });
      }
    }
    if (inserts.length) {
      const { error: insErr } = await supabase.from("microplan_entries").insert(inserts);
      if (insErr) throw insErr;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Move microplan entries between projects
          </DialogTitle>
          <DialogDescription>
            Select a source project, tick the entries to move, then choose one or more target projects.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">From (source)</label>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={sourceId ?? ""} onChange={(e) => setSourceId(e.target.value || null)}>
              <option value="">Select source…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">To (one or more targets)</label>
            <ScrollArea className="h-[42px] rounded-md border px-2 py-1">
              <div className="flex flex-wrap gap-1">
                {projects.filter(p => p.id !== sourceId).map((p) => {
                  const active = targetIds.has(p.id);
                  return (
                    <button key={p.id} type="button"
                      onClick={() => setTargetIds((s) => {
                        const n = new Set(s); active ? n.delete(p.id) : n.add(p.id); return n;
                      })}
                      className={`rounded-full border px-2.5 py-0.5 text-xs ${active ? "bg-primary text-primary-foreground border-primary" : "bg-background"}`}>
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>

        {sourceId && (
          <>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search state/LGA/ward/community…" value={search}
                  onChange={(e) => setSearch(e.target.value)} className="pl-8" />
              </div>
              <Button variant="outline" size="sm" onClick={toggleAll} disabled={filtered.length === 0}>
                {allSelected ? "Clear" : "Select all"}
              </Button>
            </div>
            <ScrollArea className="h-[42vh] pr-3">
              {loading ? (
                <div className="flex h-32 items-center justify-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {entries.length === 0 ? "No entries in this project." : "No entries match search."}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {filtered.map((e) => {
                    const checked = selectedEntryIds.has(e.id);
                    return (
                      <label key={e.id}
                        className={`flex items-center gap-3 rounded-lg border p-2.5 cursor-pointer ${checked ? "border-primary/50 bg-primary/5" : ""}`}>
                        <Checkbox checked={checked} onCheckedChange={(v) => {
                          setSelectedEntryIds((s) => {
                            const n = new Set(s); v ? n.add(e.id) : n.delete(e.id); return n;
                          });
                        }} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{e.community_name}{e.settlement_name ? ` · ${e.settlement_name}` : ""}</p>
                          <p className="truncate text-xs text-muted-foreground">{e.state} → {e.lga} → {e.ward}</p>
                        </div>
                        <span className="text-[10px] text-muted-foreground">{new Date(e.created_at).toLocaleDateString()}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs">
          <Badge variant="secondary">{selectedEntryIds.size} selected · {targetIds.size} target(s)</Badge>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={busy || !selectedEntryIds.size || !targetIds.size}
              onClick={() => perform("copy")}>
              <Copy className="mr-1 h-4 w-4" /> Copy
            </Button>
            <Button size="sm" disabled={busy || !selectedEntryIds.size || !targetIds.size}
              onClick={() => perform("move")}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <MoveRight className="mr-1 h-4 w-4" />}
              Move
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
