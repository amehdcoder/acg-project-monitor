import { Button } from "@/components/ui/button";
import { Check, X, Pencil } from "lucide-react";

interface Props {
  questionLabel: string;
  displayValue: string;
  onConfirm: () => void;
  onReject: () => void;
  onEdit: () => void;
}

const ConfirmationOverlay = ({ questionLabel, displayValue, onConfirm, onReject, onEdit }: Props) => {
  return (
    <div className="p-6 space-y-6">
      {/* What was answered */}
      <div className="text-center space-y-3">
        <p className="text-sm text-muted-foreground">You answered:</p>
        <div className="bg-primary/5 border-2 border-primary/20 rounded-2xl p-6">
          <p className="text-2xl font-bold text-foreground leading-relaxed">{displayValue}</p>
        </div>
        <p className="text-xs text-muted-foreground italic">For: "{questionLabel}"</p>
      </div>

      {/* Confirmation prompt */}
      <div className="text-center">
        <p className="text-lg font-semibold text-foreground mb-1">Is this correct?</p>
        <p className="text-sm text-muted-foreground">Tap to confirm or change</p>
      </div>

      {/* Large action buttons */}
      <div className="grid grid-cols-3 gap-3">
        <Button
          onClick={onConfirm}
          className="min-h-[80px] flex-col gap-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border-2 border-emerald-500/40 hover:border-emerald-500/60 text-base font-bold"
          variant="outline"
        >
          <Check className="h-8 w-8" />
          Yes ✓
        </Button>
        <Button
          onClick={onReject}
          className="min-h-[80px] flex-col gap-2 bg-red-500/10 hover:bg-red-500/20 text-red-700 dark:text-red-400 border-2 border-red-500/40 hover:border-red-500/60 text-base font-bold"
          variant="outline"
        >
          <X className="h-8 w-8" />
          No ✗
        </Button>
        <Button
          onClick={onEdit}
          className="min-h-[80px] flex-col gap-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 border-2 border-amber-500/40 hover:border-amber-500/60 text-base font-bold"
          variant="outline"
        >
          <Pencil className="h-8 w-8" />
          Change
        </Button>
      </div>
    </div>
  );
};

export default ConfirmationOverlay;
