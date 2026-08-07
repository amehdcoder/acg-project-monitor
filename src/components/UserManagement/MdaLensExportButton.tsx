/**
 * Scoped export button for MDA Lens users (and admins).
 *
 * Downloads a colour-coded, professionally formatted workbook containing only
 * the records inside the user's granted State / LGA scope — questions as
 * columns, responses as rows.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, FileSpreadsheet } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { exportLensWorkbook, type LensColumn } from "@/lib/mdaLens/lensExport";

interface Props {
  title: string;
  scopeLabel: string;
  sheetName: string;
  columns: LensColumn[];
  rows: Record<string, unknown>[];
  disabled?: boolean;
}

export default function MdaLensExportButton({ title, scopeLabel, sheetName, columns, rows, disabled }: Props) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!rows.length) {
      toast({ title: "Nothing to export", description: "No records match your granted scope yet." });
      return;
    }
    setBusy(true);
    try {
      await exportLensWorkbook({ title, scopeLabel, sheets: [{ name: sheetName, columns, rows }] });
      toast({ title: "Export ready", description: `${rows.length.toLocaleString()} records downloaded.` });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message ?? "Please try again.", variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <Button
      onClick={run}
      disabled={busy || disabled}
      className="h-9 gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-primary-foreground hover:from-emerald-600/90 hover:to-teal-600/90 shadow-sm"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
      Export my data
    </Button>
  );
}
