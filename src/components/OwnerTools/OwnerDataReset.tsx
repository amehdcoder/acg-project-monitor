import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertTriangle, Trash2, RotateCcw, Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

/**
 * Owner-only destructive controls:
 * 1. Clear microplanning data (all or filtered by project / state / LGA / year)
 * 2. Factory reset — empties every operational table while preserving the
 *    Owner login, profiles, and roles so the Owner stays signed in.
 *
 * Both call SECURITY DEFINER RPCs that re-check `is_owner(auth.uid())` server-side,
 * so even if this UI is rendered by mistake the database refuses unauthorised calls.
 */
const OwnerDataReset = () => {
  const { isOwner } = useAuth();

  // Microplanning clear filters
  const [mpProject, setMpProject] = useState("");
  const [mpState, setMpState] = useState("");
  const [mpLga, setMpLga] = useState("");
  const [mpYear, setMpYear] = useState("");
  const [mpBusy, setMpBusy] = useState(false);
  const [mpConfirmOpen, setMpConfirmOpen] = useState(false);

  // Factory reset
  const [resetPhrase, setResetPhrase] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  if (!isOwner) return null;

  const handleClearMicroplan = async () => {
    setMpBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("owner_clear_microplanning", {
        _project_id: mpProject || null,
        _state: mpState || null,
        _lga: mpLga || null,
        _year: mpYear ? Number(mpYear) : null,
      });
      if (error) throw error;
      const r = data as any;
      toast({
        title: "Microplanning data cleared",
        description: `${r?.entries_deleted ?? 0} entries, ${r?.allocations_deleted ?? 0} allocations, ${r?.history_deleted ?? 0} history rows removed.`,
      });
      setMpConfirmOpen(false);
      setMpProject(""); setMpState(""); setMpLga(""); setMpYear("");
    } catch (err: any) {
      toast({ title: "Clear failed", description: err.message, variant: "destructive" });
    } finally {
      setMpBusy(false);
    }
  };

  const handleFactoryReset = async () => {
    setResetBusy(true);
    try {
      const { data, error } = await (supabase as any).rpc("owner_factory_reset", { _confirm: resetPhrase });
      if (error) throw error;
      toast({
        title: "Factory reset complete",
        description: "All operational data cleared. The app is back to a virgin state.",
      });
      setResetOpen(false);
      setResetPhrase("");
      // Clear local-only caches that mirror server data
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith("ces_") || k.startsWith("microplan_") || k.startsWith("project_"))
          .forEach((k) => localStorage.removeItem(k));
      } catch {}
      setTimeout(() => window.location.reload(), 1500);
    } catch (err: any) {
      toast({ title: "Reset failed", description: err.message, variant: "destructive" });
    } finally {
      setResetBusy(false);
    }
  };

  const filterSummary = [
    mpProject && `project ${mpProject.slice(0, 8)}…`,
    mpState && `state=${mpState}`,
    mpLga && `LGA=${mpLga}`,
    mpYear && `year=${mpYear}`,
  ].filter(Boolean).join(", ") || "ALL microplanning data (no filters)";

  return (
    <div className="space-y-4">
      <Alert variant="destructive">
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription>
          <strong>Owner-only zone.</strong> Actions here are irreversible and run server-side after a re-check that you are the Owner.
        </AlertDescription>
      </Alert>

      {/* --- Clear microplanning --- */}
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-5 w-5" /> Clear Microplanning Data
          </CardTitle>
          <CardDescription>
            Delete microplan entries, medicine allocations, and allocation history. Leave filters blank to clear everything,
            or scope by project, state, LGA, or year.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Project ID (optional)</Label>
              <Input value={mpProject} onChange={(e) => setMpProject(e.target.value)} placeholder="UUID or blank" />
            </div>
            <div>
              <Label className="text-xs">State (optional)</Label>
              <Input value={mpState} onChange={(e) => setMpState(e.target.value)} placeholder="e.g. Kano" />
            </div>
            <div>
              <Label className="text-xs">LGA (optional)</Label>
              <Input value={mpLga} onChange={(e) => setMpLga(e.target.value)} placeholder="e.g. Dala" />
            </div>
            <div>
              <Label className="text-xs">Year (optional)</Label>
              <Input value={mpYear} onChange={(e) => setMpYear(e.target.value)} placeholder="e.g. 2026" inputMode="numeric" />
            </div>
          </div>
          <Button variant="destructive" onClick={() => setMpConfirmOpen(true)} disabled={mpBusy}>
            <Trash2 className="h-4 w-4 mr-2" /> Clear Microplanning Data
          </Button>
        </CardContent>
      </Card>

      {/* --- Factory reset --- */}
      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <RotateCcw className="h-5 w-5" /> Factory Reset (Virgin State)
          </CardTitle>
          <CardDescription>
            Empties every operational table — CES surveys, microplanning, forms, cases, chat, dashboards,
            notifications, audit logs, etc. The Owner login, user profiles, and roles are preserved so you stay signed in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setResetOpen(true)} disabled={resetBusy}>
            <AlertTriangle className="h-4 w-4 mr-2" /> Restore Factory State
          </Button>
        </CardContent>
      </Card>

      {/* Confirm: clear microplan */}
      <Dialog open={mpConfirmOpen} onOpenChange={setMpConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Confirm microplanning data deletion
            </DialogTitle>
            <DialogDescription>
              This will permanently delete: <strong>{filterSummary}</strong>. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMpConfirmOpen(false)} disabled={mpBusy}>Cancel</Button>
            <Button variant="destructive" onClick={handleClearMicroplan} disabled={mpBusy}>
              {mpBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm: factory reset */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" /> Confirm factory reset
            </DialogTitle>
            <DialogDescription>
              Type <code className="px-1.5 py-0.5 bg-muted rounded font-mono">RESET TO FACTORY</code> below to confirm.
              Every operational record across the platform will be deleted.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={resetPhrase}
            onChange={(e) => setResetPhrase(e.target.value)}
            placeholder="RESET TO FACTORY"
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)} disabled={resetBusy}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleFactoryReset}
              disabled={resetBusy || resetPhrase !== "RESET TO FACTORY"}
            >
              {resetBusy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-2" />}
              Reset to virgin state
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OwnerDataReset;
