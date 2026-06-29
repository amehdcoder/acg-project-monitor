import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Moon, Clock, ShieldCheck, Send, X, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  AFTER_HOURS_BLOCK_EVENT,
  AfterHoursBlockDetail,
} from "@/lib/afterHours/interceptor";
import { AFTER_HOURS_WINDOW_LABEL } from "@/lib/afterHours/window";

type Phase = "notice" | "reason" | "sent";

/**
 * Listens for blocked after-hours submission attempts and walks the user
 * through requesting approval. Mounted once near the app root.
 */
const AfterHoursGate = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("notice");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef<AfterHoursBlockDetail | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<AfterHoursBlockDetail>).detail;
      if (!detail) return;
      pending.current = detail;
      setReason("");
      setPhase("notice");
      setOpen(true);
    };
    window.addEventListener(AFTER_HOURS_BLOCK_EVENT, handler);
    return () => window.removeEventListener(AFTER_HOURS_BLOCK_EVENT, handler);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    pending.current = null;
    setReason("");
    setPhase("notice");
  }, []);

  const sendRequest = useCallback(async () => {
    const detail = pending.current;
    if (!detail) return;
    if (reason.trim().length < 5) {
      toast.error("Please enter a clear reason (at least 5 characters).");
      return;
    }
    if (!user) {
      toast.error("You must be signed in to send a request.");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await (supabase as any).rpc("request_after_hours_submission", {
        p_table: detail.table,
        p_payload: detail.payload,
        p_reason: reason.trim(),
        p_form_label: detail.label,
        p_project_id: null,
      } as any);
      if (error) throw error;
      setPhase("sent");
    } catch (err: any) {
      toast.error(err?.message || "Could not send approval request.");
    } finally {
      setSubmitting(false);
    }
  }, [reason, user]);

  const label = pending.current?.label ?? "submission";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent
        className="max-w-md overflow-hidden border-0 p-0 shadow-2xl"
        onInteractOutside={(e) => e.preventDefault()}
      >
        {/* Header band */}
        <div className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 px-6 pb-5 pt-7 text-white">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
              <Moon className="h-5 w-5 text-indigo-200" />
            </div>
            <div>
              <h2 className="text-base font-semibold tracking-tight">After-hours submission</h2>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-300">
                <Clock className="h-3 w-3" /> {AFTER_HOURS_WINDOW_LABEL}
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">
          {phase === "notice" && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                Submissions are locked during work-off hours. You are trying to submit a{" "}
                <span className="font-medium text-foreground">{label}</span> outside the allowed
                window. To proceed, send an approval request to your administrators with the reason
                for submitting now.
              </p>
              <div className="flex gap-2.5">
                <Button variant="outline" className="flex-1" onClick={close}>
                  <X className="mr-1.5 h-4 w-4" /> Exit
                </Button>
                <Button className="flex-1" onClick={() => setPhase("reason")}>
                  <Send className="mr-1.5 h-4 w-4" /> Send request
                </Button>
              </div>
            </div>
          )}

          {phase === "reason" && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground">
                  Why are you submitting after work hours?
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  This will be shown to the approver. Be specific.
                </p>
              </div>
              <Textarea
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Network was down during the day; capturing the data now so it isn't lost…"
                className="min-h-[120px] resize-none rounded-xl border-2 border-border bg-muted/30 px-4 py-3 text-sm focus-visible:border-indigo-400 focus-visible:ring-indigo-400/30"
              />
              <div className="flex gap-2.5">
                <Button variant="outline" className="flex-1" onClick={() => setPhase("notice")}>
                  Back
                </Button>
                <Button className="flex-1" onClick={sendRequest} disabled={submitting}>
                  {submitting ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-1.5 h-4 w-4" />
                  )}
                  Send for approval
                </Button>
              </div>
            </div>
          )}

          {phase === "sent" && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">Request sent</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Your {label} is held pending approval. Once an administrator approves it, it will
                  be saved and appear on the dashboard automatically. If rejected, it will be
                  discarded.
                </p>
              </div>
              <div className="flex items-center justify-center gap-1.5 rounded-lg bg-muted/50 py-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" /> Awaiting administrator review
              </div>
              <Button className="w-full" onClick={close}>
                Done
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AfterHoursGate;
