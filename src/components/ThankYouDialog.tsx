import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Heart } from "lucide-react";

interface ThankYouDialogProps {
  open: boolean;
  onClose: () => void;
  submitterName?: string;
  formName?: string;
  offline?: boolean;
}

const ThankYouDialog = ({ open, onClose, submitterName, formName, offline }: ThankYouDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-8 w-8 text-primary" aria-hidden="true" />
          </div>
          <DialogTitle className="text-center text-xl">
            Thank you{submitterName ? `, ${submitterName}` : ""}!
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-center text-sm leading-relaxed text-muted-foreground">
          <p>
            Your submission{formName ? ` for "${formName}"` : ""} has been{" "}
            {offline ? "saved offline and will sync once connected" : "received successfully"}.
          </p>
          <p className="rounded-md border bg-muted/30 p-3 text-foreground">
            Your contribution helps strengthen monitoring, supervision, and
            decision-making across our communities. Every record you collect
            matters — thank you for your dedication in the field.
          </p>
          <div className="flex items-center justify-center gap-1.5 pt-1 text-xs text-muted-foreground">
            <Heart className="h-3.5 w-3.5 fill-destructive text-destructive" aria-hidden="true" />
            <span>
              With appreciation, <strong className="text-foreground">Ameh Joseph</strong> &amp; the Amehnities Team
            </span>
          </div>
        </div>

        <DialogFooter className="sm:justify-center">
          <Button onClick={onClose} className="w-full sm:w-auto">
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ThankYouDialog;
