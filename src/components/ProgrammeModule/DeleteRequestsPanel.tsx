import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  decideDeleteRequest, useCanApproveDeletion, useDeleteRequests,
} from "@/lib/programmeModule/facilityOps";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId?: string;
  onDecided?: () => void;
}

const tone: Record<string, string> = {
  pending: "border-amber-400/40 bg-amber-500/10 text-amber-700",
  approved: "border-emerald-400/40 bg-emerald-500/10 text-emerald-700",
  declined: "border-red-400/40 bg-red-500/10 text-red-700",
};

/** Deletion requests raised by administrators, decided by a project Super Admin or the Owner. */
const DeleteRequestsPanel = ({ open, onOpenChange, projectId, onDecided }: Props) => {
  const { toast } = useToast();
  const { requests, loading, reload } = useDeleteRequests(projectId);
  const canApprove = useCanApproveDeletion(projectId);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");

  const decide = async (id: string, approve: boolean) => {
    setBusy(id);
    try {
      await decideDeleteRequest(id, approve, notes[id]);
      toast({ title: approve ? "Beneficiary deleted" : "Request declined" });
      await reload();
      onDecided?.();
    } catch (e) {
      toast({ title: "Could not complete the review", description: (e as Error).message, variant: "destructive" });
    } finally {
      setBusy("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-amber-600" /> Beneficiary deletion requests
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Administrators can request removal of a registered beneficiary. Only a Super Admin assigned
          to this project, or the Owner, can approve it.
        </p>

        <div className="space-y-3">
          {!loading && requests.length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">No deletion requests.</Card>
          )}
          {requests.map((r) => (
            <Card key={r.id} className="space-y-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-foreground">{r.beneficiary_name}</p>
                <span className="text-xs text-muted-foreground">{r.case_id}</span>
                <div className="flex-1" />
                <Badge variant="outline" className={cn("border", tone[r.status])}>{r.status}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">{r.reason || "No reason given"}</p>
              {r.status === "pending" && canApprove && (
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    className="min-w-[180px] flex-1"
                    placeholder="Review note (optional)"
                    value={notes[r.id] || ""}
                    onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))}
                  />
                  <Button size="sm" variant="destructive" disabled={busy === r.id}
                    onClick={() => void decide(r.id, true)}>
                    Approve deletion
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy === r.id}
                    onClick={() => void decide(r.id, false)}>
                    Decline
                  </Button>
                </div>
              )}
              {r.status === "pending" && !canApprove && (
                <p className="text-xs text-muted-foreground">Awaiting Super Admin or Owner approval.</p>
              )}
              {r.review_note && <p className="text-xs text-muted-foreground">Note: {r.review_note}</p>}
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteRequestsPanel;
