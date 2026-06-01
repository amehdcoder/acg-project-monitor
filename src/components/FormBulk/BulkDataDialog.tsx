// Per-form bulk data dialog: export an Excel template matching the form's data
// structure, then import a populated template to create submissions in bulk.

import { useRef, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  FileSpreadsheet, Download, Upload, Loader2, CheckCircle2, AlertTriangle, ListChecks,
} from "lucide-react";
import { exportFormTemplate, importFormSubmissions, type BulkForm, type ImportResult } from "@/lib/formBulk";
import { useBulkDataAccess } from "@/hooks/useBulkDataAccess";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  form: BulkForm | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported?: () => void;
}

export default function BulkDataDialog({ form, open, onOpenChange, onImported }: Props) {
  const { user } = useAuth();
  const { canExport, canImport } = useBulkDataAccess();
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!form) return null;

  const handleExport = async () => {
    setExporting(true);
    try {
      const cols = await exportFormTemplate(form);
      toast({ title: "Template exported", description: `${cols} field column(s) ready to populate.` });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleFile = async (file: File) => {
    if (!user) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await importFormSubmissions(file, form, user.id);
      setResult(res);
      if (res.inserted > 0) {
        toast({ title: "Import complete", description: `${res.inserted} submission(s) added.` });
        onImported?.();
      } else if (res.errors.length === 0) {
        toast({ title: "Nothing imported", description: "No populated rows were found." });
      } else {
        toast({ title: "Import had issues", description: res.errors[0], variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Import failed", description: e?.message, variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" /> Bulk Submissions
          </DialogTitle>
          <DialogDescription>
            Export an Excel template for <span className="font-medium">{form.name}</span>, fill it offline,
            then import it to create many submissions at once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1 — export */}
          {canExport && (
            <div className="rounded-lg border bg-emerald-50/50 p-4">
              <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">1</span>
                Download template
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                A spreadsheet whose columns exactly match this form's fields, with an Instructions sheet
                and dropdowns for choice questions.
              </p>
              <Button onClick={handleExport} disabled={exporting} className="w-full bg-emerald-700 hover:bg-emerald-800">
                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Export Excel Template
              </Button>
            </div>
          )}

          {/* Step 2 — import */}
          {canImport && (
            <div className="rounded-lg border p-4">
              <p className="mb-1 flex items-center gap-2 text-sm font-semibold">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">2</span>
                Import populated template
              </p>
              <p className="mb-3 text-xs text-muted-foreground">
                Upload the filled-in template. One row becomes one submission. Empty rows are skipped.
              </p>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
              <Button
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={importing}
                className="w-full border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Choose Excel File
              </Button>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="flex items-center gap-2 font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> {result.inserted} imported
                <span className="text-muted-foreground">· {result.skipped} empty row(s) skipped</span>
              </p>
              {result.errors.length > 0 && (
                <div className="mt-2 space-y-1">
                  <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600">
                    <AlertTriangle className="h-3.5 w-3.5" /> {result.errors.length} issue(s):
                  </p>
                  <ul className="max-h-32 space-y-0.5 overflow-auto text-[11px] text-muted-foreground">
                    {result.errors.slice(0, 25).map((e, i) => (
                      <li key={i} className="flex gap-1"><ListChecks className="mt-0.5 h-3 w-3 shrink-0" /> {e}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
