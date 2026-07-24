import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  entryId: string | null;
  projectId?: string | null;
  entryLabel?: string;
  onSubmitted?: () => void;
}

const MicroplanDeleteRequestDialog = ({ open, onClose, entryId, projectId, entryLabel, onSubmitted }: Props) => {
  const { user } = useAuth();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!user?.id || !entryId) return;
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      toast({ title: "Reason too short", description: "Please provide at least 5 characters.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.from("microplan_delete_requests" as any).insert({
        entry_id: entryId,
        project_id: projectId ?? null,
        requester_id: user.id,
        requester_reason: trimmed,
      });
      if (error) {
        if (error.code === "23505") {
          toast({ title: "Already requested", description: "A pending delete request for this entry already exists.", variant: "destructive" });
        } else {
          toast({ title: "Request failed", description: error.message, variant: "destructive" });
        }
        return;
      }
      toast({ title: "✅ Request submitted", description: "An admin will review your deletion request." });
      setReason("");
      onSubmitted?.();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) { setReason(""); onClose(); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Request Entry Deletion
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Deletion requires admin approval. Explain why this microplan entry should be removed.
            {entryLabel && <span className="block mt-1 font-medium text-foreground">Entry: {entryLabel}</span>}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="del-reason" className="text-xs">Reason (required)</Label>
            <Textarea
              id="del-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              placeholder="e.g. Duplicate of settlement X entered twice by mistake…"
              maxLength={1000}
            />
            <p className="text-[10px] text-muted-foreground text-right">{reason.length}/1000</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="destructive" onClick={submit} disabled={busy || reason.trim().length < 5}>
            {busy ? "Submitting…" : "Submit Request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MicroplanDeleteRequestDialog;
