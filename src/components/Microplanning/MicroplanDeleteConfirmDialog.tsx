import { useEffect, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

export interface DeleteTargetEntry {
  id: string;
  state?: string | null;
  lga?: string | null;
  ward?: string | null;
  flhf_name?: string | null;
  community_name?: string | null;
  settlement_name?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: DeleteTargetEntry[];
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
}

const CONFIRM_WORD = "DELETE";

/**
 * Professional, deliberately high-friction delete confirmation.
 * Single deletes need an explicit acknowledgement checkbox; bulk deletes also
 * require typing DELETE, so an accidental click can never destroy records.
 */
const MicroplanDeleteConfirmDialog = ({ open, onOpenChange, entries, busy, onConfirm }: Props) => {
  const [ack, setAck] = useState(false);
  const [typed, setTyped] = useState("");

  const count = entries.length;
  const isBulk = count > 1;

  useEffect(() => {
    if (!open) { setAck(false); setTyped(""); }
  }, [open]);

  const preview = useMemo(() => entries.slice(0, 8), [entries]);
  const canDelete = ack && (!isBulk || typed.trim().toUpperCase() === CONFIRM_WORD) && !busy && count > 0;

  return (
    <AlertDialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            {isBulk ? `Delete ${count} microplan records?` : "Delete this microplan record?"}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-xs">
            This permanently removes {isBulk ? "these records" : "this record"} and any linked planning figures from the
            project. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3">
          <div className="max-h-[180px] overflow-auto rounded-md border border-border/60 divide-y divide-border/40">
            {preview.map((e) => (
              <div key={e.id} className="px-3 py-2 text-[11px]">
                <p className="font-semibold text-foreground">
                  {e.community_name || "—"}
                  {e.settlement_name ? <span className="text-muted-foreground"> / {e.settlement_name}</span> : null}
                </p>
                <p className="text-muted-foreground">
                  {[e.state, e.lga, e.ward, e.flhf_name].filter(Boolean).join(" → ") || "No geography recorded"}
                </p>
              </div>
            ))}
            {count > preview.length && (
              <div className="px-3 py-2 text-[11px] text-muted-foreground">
                + {count - preview.length} more record{count - preview.length === 1 ? "" : "s"}
              </div>
            )}
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <Checkbox checked={ack} onCheckedChange={(v) => setAck(v === true)} className="mt-0.5" />
            <span className="text-xs text-foreground">
              I understand {isBulk ? `all ${count} records` : "this record"} will be permanently deleted.
            </span>
          </label>

          {isBulk && (
            <div className="space-y-1.5">
              <Label htmlFor="bulk-delete-confirm" className="text-xs">
                Type <Badge variant="outline" className="mx-1 font-mono text-[10px]">{CONFIRM_WORD}</Badge> to confirm
              </Label>
              <Input
                id="bulk-delete-confirm"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={CONFIRM_WORD}
                autoComplete="off"
                className="font-mono"
              />
            </div>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canDelete}
            onClick={(e) => { e.preventDefault(); if (canDelete) void onConfirm(); }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {busy ? "Deleting…" : isBulk ? `Delete ${count} records` : "Delete record"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default MicroplanDeleteConfirmDialog;
