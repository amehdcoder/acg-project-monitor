// Owner-only manager: grant/revoke bulk export & import permission to
// Systems Admins and Super Admins. Regular users are never eligible.

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";
import { FileSpreadsheet, Loader2, Download, Upload } from "lucide-react";

interface AdminRow { user_id: string; first_name: string; last_name: string; email: string; }
interface Perm { can_export: boolean; can_import: boolean; }

export default function BulkUploadAccessManager({ open: openProp, onOpenChange, hideTrigger }: { open?: boolean; onOpenChange?: (v: boolean) => void; hideTrigger?: boolean } = {}) {
  const { user, isOwner } = useAuth();
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp ?? openInternal;
  const setOpen = onOpenChange ?? setOpenInternal;
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [perms, setPerms] = useState<Map<string, Perm>>(new Map());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: roles } = await supabase
        .from("user_roles").select("user_id, role")
        .in("role", ["super_admin", "systems_admin"]);
      const ids = Array.from(new Set((roles ?? []).map((r: any) => r.user_id)));
      const [{ data: profs }, { data: pp }] = await Promise.all([
        ids.length
          ? supabase.from("profiles").select("user_id, first_name, last_name, email").in("user_id", ids)
          : Promise.resolve({ data: [] as any }),
        supabase.from("form_bulk_permissions").select("user_id, can_export, can_import"),
      ]);
      if (cancelled) return;
      setAdmins((profs ?? []) as AdminRow[]);
      const m = new Map<string, Perm>();
      (pp ?? []).forEach((r: any) => m.set(r.user_id, { can_export: r.can_export, can_import: r.can_import }));
      setPerms(m);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return admins;
    return admins.filter((a) => `${a.first_name} ${a.last_name} ${a.email}`.toLowerCase().includes(q));
  }, [admins, search]);

  if (!isOwner) return null;

  const setFlag = async (uid: string, field: keyof Perm, value: boolean) => {
    const current = perms.get(uid) ?? { can_export: false, can_import: false };
    const next = { ...current, [field]: value };
    setPerms((prev) => new Map(prev).set(uid, next));
    try {
      if (!next.can_export && !next.can_import) {
        await supabase.from("form_bulk_permissions").delete().eq("user_id", uid);
      } else {
        await supabase.from("form_bulk_permissions").upsert(
          { user_id: uid, can_export: next.can_export, can_import: next.can_import, granted_by: user?.id ?? null },
          { onConflict: "user_id" },
        );
      }
    } catch (e: any) {
      toast({ title: "Save failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <FileSpreadsheet className="h-4 w-4" /> Owner: Bulk Upload Access
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" /> Bulk Upload Access
          </DialogTitle>
          <DialogDescription>
            Allow specific Systems Admins and Super Admins to export form templates and import bulk
            submissions. You (the Owner) always have full access.
          </DialogDescription>
        </DialogHeader>

        <Input placeholder="Search admins…" value={search} onChange={(e) => setSearch(e.target.value)} />

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-2 p-1">
              {filtered.map((a) => {
                const p = perms.get(a.user_id) ?? { can_export: false, can_import: false };
                return (
                  <div key={a.user_id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.first_name} {a.last_name}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.email}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Download className="h-3.5 w-3.5" /> Export
                        <Switch checked={p.can_export} onCheckedChange={(v) => setFlag(a.user_id, "can_export", v)} />
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Upload className="h-3.5 w-3.5" /> Import
                        <Switch checked={p.can_import} onCheckedChange={(v) => setFlag(a.user_id, "can_import", v)} />
                      </label>
                    </div>
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <p className="p-4 text-center text-xs text-muted-foreground">No matching admins.</p>
              )}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
