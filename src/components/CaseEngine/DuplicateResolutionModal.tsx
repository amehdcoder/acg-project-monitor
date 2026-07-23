// Phase 3 — Duplicate Resolution Modal UI.
//
// Presented when the interceptor finds one or more high-confidence duplicate
// candidates. The user picks either an existing case (converts the submission
// into an update/follow-up) or confirms as a genuinely new entity (queued
// with `flagged_override: true`).

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, CheckCircle2, UserPlus } from "lucide-react";
import { useSubmitLock } from "@/hooks/useSubmitLock";
import type { DuplicateCandidate } from "@/lib/caseEngine/duplicateEngine";

interface Props {
  open: boolean;
  candidates: DuplicateCandidate[];
  onSelectExisting: (case_id: string) => Promise<void> | void;
  onConfirmNew: () => Promise<void> | void;
  onCancel: () => void;
}

const scoreTone = (score: number): string => {
  if (score >= 90) return "bg-red-500/15 text-red-700 border-red-500/30";
  if (score >= 80) return "bg-amber-500/15 text-amber-700 border-amber-500/30";
  return "bg-yellow-500/15 text-yellow-700 border-yellow-500/30";
};

export const DuplicateResolutionModal = ({
  open,
  candidates,
  onSelectExisting,
  onConfirmNew,
  onCancel,
}: Props) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectLock = useSubmitLock();
  const confirmLock = useSubmitLock();

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onCancel() : undefined)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Possible duplicate detected
          </DialogTitle>
          <DialogDescription>
            {candidates.length} existing case
            {candidates.length === 1 ? "" : "s"} closely match this
            registration. Please choose how to proceed.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[55vh] pr-3">
          <div className="space-y-2">
            {candidates.map(({ case: c, score, reasons }) => {
              const selected = selectedId === c.case_id;
              return (
                <Card
                  key={c.case_id}
                  className={`cursor-pointer transition-all ${
                    selected
                      ? "border-primary shadow-md"
                      : "hover:border-primary/50"
                  }`}
                  onClick={() => setSelectedId(c.case_id)}
                >
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium truncate">
                        {c.search_keys.first_name || ""}{" "}
                        {c.search_keys.last_name || ""}
                        {!c.search_keys.first_name && !c.search_keys.last_name
                          ? c.external_id || c.case_id.slice(0, 8)
                          : null}
                      </div>
                      <Badge variant="outline" className={scoreTone(score)}>
                        {score}% match
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                      {c.search_keys.national_id && (
                        <span>ID: {c.search_keys.national_id}</span>
                      )}
                      {c.search_keys.phone && (
                        <span>Phone: {c.search_keys.phone}</span>
                      )}
                      {c.search_keys.dob && <span>DOB: {c.search_keys.dob}</span>}
                      {c.external_id && <span>Ref: {c.external_id}</span>}
                    </div>
                    <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-0.5">
                      {reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="ghost" onClick={onCancel} className="sm:mr-auto">
            Cancel
          </Button>
          <Button
            variant="outline"
            disabled={confirmLock.locked}
            onClick={() => confirmLock.run(() => onConfirmNew())}
            className="gap-2"
          >
            <UserPlus className="h-4 w-4" />
            Confirm as new entity
          </Button>
          <Button
            disabled={!selectedId || selectLock.locked}
            onClick={() =>
              selectedId &&
              selectLock.run(() => onSelectExisting(selectedId))
            }
            className="gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            Use selected case
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DuplicateResolutionModal;
