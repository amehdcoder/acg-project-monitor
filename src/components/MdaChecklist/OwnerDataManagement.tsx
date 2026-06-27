/**
 * Owner Data Management — Integrated MDA Supervisory Checklist
 * ────────────────────────────────────────────────────────────────────────
 * Owner-only surface to (a) archive (soft-delete) checklist submissions so the
 * dashboard can be restored to a clean LIVE environment for real field data,
 * and (b) restore some or all archived submissions for a defined period.
 *
 * Nothing is permanently destroyed: archived rows are moved to a protected
 * archive store and can be restored at any time. Backed by the owner-only
 * RPCs `owner_archive_mda_submissions` / `owner_restore_mda_submissions`.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Database, Trash2, RotateCcw, Loader2, ShieldAlert, CalendarRange,
  Archive, History, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface Summary {
  live_count: number; live_from: string | null; live_to: string | null;
  archived_count: number; archived_from: string | null; archived_to: string | null;
}

interface Props {
  formId: string;
  onChanged?: () => void;
}

type Mode = "delete" | "restore";

const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" }) : "—");

export default function OwnerDataManagement({ formId, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("delete");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [useRange, setUseRange] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("owner_mda_data_summary", { _form_id: formId });
      if (error) throw error;
      setSummary(data as Summary);
    } catch (e: any) {
      toast.error(e?.message || "Could not load data summary");
    } finally {
      setLoading(false);
    }
  }, [formId]);

  useEffect(() => {
    if (open) loadSummary();
  }, [open, loadSummary]);

  const rangeArgs = () => {
    if (!useRange) return { _from: null, _to: null };
    return {
      _from: from ? new Date(from + "T00:00:00").toISOString() : null,
      _to: to ? new Date(to + "T23:59:59").toISOString() : null,
    };
  };

  const run = async () => {
    setConfirmOpen(false);
    setBusy(true);
    try {
      const fn = mode === "delete" ? "owner_archive_mda_submissions" : "owner_restore_mda_submissions";
      const { data, error } = await (supabase as any).rpc(fn, { _form_id: formId, ...rangeArgs() });
      if (error) throw error;
      const n = mode === "delete" ? (data?.archived ?? 0) : (data?.restored ?? 0);
      toast.success(
        mode === "delete"
          ? `${n.toLocaleString()} submission(s) archived. Dashboard restored to live data.`
          : `${n.toLocaleString()} submission(s) restored to the dashboard.`,
      );
      await loadSummary();
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message || "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const targetCount = mode === "delete" ? summary?.live_count ?? 0 : summary?.archived_count ?? 0;

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 border-rose-200 text-rose-700 hover:bg-rose-50">
            <Database className="h-4 w-4" /> Data Management
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg overflow-hidden p-0">
          <div className="bg-gradient-to-br from-[#0c2340] to-[#16365c] px-6 py-5 text-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-white">
                <ShieldAlert className="h-5 w-5" /> Owner Data Management
              </DialogTitle>
              <DialogDescription className="text-white/70">
                Clear test/simulation data to go live, or restore archived submissions. Nothing is permanently deleted.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="space-y-5 px-6 py-5">
            {/* Live vs archived snapshot */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Live submissions
                </div>
                <p className="mt-1 font-display text-2xl font-bold text-emerald-700">
                  {loading ? "…" : (summary?.live_count ?? 0).toLocaleString()}
                </p>
                <p className="text-[11px] text-muted-foreground">{fmtDate(summary?.live_from ?? null)} – {fmtDate(summary?.live_to ?? null)}</p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
                  <Archive className="h-3.5 w-3.5" /> Archived
                </div>
                <p className="mt-1 font-display text-2xl font-bold text-amber-700">
                  {loading ? "…" : (summary?.archived_count ?? 0).toLocaleString()}
                </p>
                <p className="text-[11px] text-muted-foreground">{fmtDate(summary?.archived_from ?? null)} – {fmtDate(summary?.archived_to ?? null)}</p>
              </div>
            </div>

            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
              <button
                onClick={() => setMode("delete")}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${mode === "delete" ? "bg-background text-rose-700 shadow-sm" : "text-muted-foreground"}`}
              >
                <Trash2 className="h-4 w-4" /> Archive
              </button>
              <button
                onClick={() => setMode("restore")}
                className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition ${mode === "restore" ? "bg-background text-emerald-700 shadow-sm" : "text-muted-foreground"}`}
              >
                <History className="h-4 w-4" /> Restore
              </button>
            </div>

            {/* Range selector */}
            <div className="rounded-xl border border-border p-3">
              <label className="flex cursor-pointer items-center justify-between">
                <span className="flex items-center gap-1.5 text-sm font-medium">
                  <CalendarRange className="h-4 w-4 text-muted-foreground" /> Limit to a date range
                </span>
                <input type="checkbox" className="h-4 w-4 accent-primary" checked={useRange} onChange={(e) => setUseRange(e.target.checked)} />
              </label>
              {useRange && (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">From</Label>
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">To</Label>
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
                  </div>
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                {useRange
                  ? `Only ${mode === "delete" ? "live" : "archived"} submissions in the selected period will be ${mode === "delete" ? "archived" : "restored"}.`
                  : `All ${mode === "delete" ? "live" : "archived"} submissions will be ${mode === "delete" ? "archived" : "restored"}.`}
              </p>
            </div>

            <Button
              className={`w-full ${mode === "delete" ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
              disabled={busy || loading || targetCount === 0}
              onClick={() => setConfirmOpen(true)}
            >
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : mode === "delete" ? <Trash2 className="mr-2 h-4 w-4" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              {mode === "delete" ? "Archive submissions" : "Restore submissions"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className={mode === "delete" ? "h-5 w-5 text-rose-600" : "h-5 w-5 text-emerald-600"} />
              {mode === "delete" ? "Archive submissions?" : "Restore submissions?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {mode === "delete"
                ? `This will move ${useRange ? "the selected" : "all"} live submissions out of the dashboard into a protected archive. You can restore them at any time.`
                : `This will move ${useRange ? "the selected" : "all"} archived submissions back into the live dashboard.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={mode === "delete" ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"}
              onClick={run}
            >
              {mode === "delete" ? "Yes, archive" : "Yes, restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
