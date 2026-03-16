import { useState, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Upload,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Loader2,
  Download,
} from "lucide-react";
import { parseXLSForm, validateXLSFormFile } from "@/lib/xlsformParser";
import { Question, FormGroup } from "./types";
import { toast } from "@/hooks/use-toast";

interface XLSFormImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (questions: Question[], groups: FormGroup[], formName?: string) => void;
}

const XLSFormImportDialog = ({
  open,
  onOpenChange,
  onImport,
}: XLSFormImportDialogProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseResult, setParseResult] = useState<{
    questions: Question[];
    groups: FormGroup[];
    formName?: string;
    errors: string[];
    warnings: string[];
  } | null>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validation = validateXLSFormFile(file);
    if (!validation.valid) {
      toast({
        title: "Invalid File",
        description: validation.error,
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    setParseResult(null);
  };

  const handleParse = async () => {
    if (!selectedFile) return;

    setIsParsing(true);
    try {
      const result = await parseXLSForm(selectedFile);
      setParseResult({
        questions: result.questions,
        groups: result.groups,
        formName: result.settings.formTitle,
        errors: result.errors,
        warnings: result.warnings,
      });
    } catch (error) {
      toast({
        title: "Parse Error",
        description: "Failed to parse the XLSForm. Please check the file format.",
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = () => {
    if (!parseResult || parseResult.errors.length > 0) return;

    onImport(
      parseResult.questions,
      parseResult.groups,
      parseResult.formName
    );

    toast({
      title: "XLSForm Imported",
      description: `Successfully imported ${parseResult.questions.length} questions${
        parseResult.groups.length > 0
          ? ` in ${parseResult.groups.length} groups`
          : ""
      }.`,
    });

    handleClose();
  };

  const handleClose = () => {
    setSelectedFile(null);
    setParseResult(null);
    onOpenChange(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Count ALL questions: ungrouped + all questions inside groups
  const totalQuestions =
    (parseResult?.questions.length || 0) +
    (parseResult?.groups.reduce((sum, g) => sum + g.questions.length, 0) || 0);
  const totalGroups = parseResult?.groups.length || 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import XLSForm
          </DialogTitle>
          <DialogDescription>
            Upload an ODK-standard XLSForm (.xlsx) to import questions, skip
            logic, and validation rules.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Upload Area */}
          <div
            className="relative cursor-pointer rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary/50 hover:bg-muted/50"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileSelect}
              className="hidden"
            />
            {selectedFile ? (
              <div className="flex items-center justify-center gap-3">
                <FileSpreadsheet className="h-8 w-8 text-primary" />
                <div className="text-left">
                  <p className="font-medium text-foreground">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
            ) : (
              <>
                <Upload className="mx-auto h-10 w-10 text-muted-foreground" />
                <p className="mt-2 text-sm font-medium text-foreground">
                  Click to upload or drag and drop
                </p>
                <p className="text-xs text-muted-foreground">
                  XLSForm (.xlsx, .xls) up to 10MB
                </p>
              </>
            )}
          </div>

          {/* Parse Button */}
          {selectedFile && !parseResult && (
            <Button
              onClick={handleParse}
              disabled={isParsing}
              className="w-full"
              variant="acg"
            >
              {isParsing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Parse XLSForm
                </>
              )}
            </Button>
          )}

          {/* Parse Results */}
          {parseResult && (
            <div className="space-y-3">
              {/* Errors */}
              {parseResult.errors.length > 0 && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-medium">Errors found:</p>
                    <ul className="mt-1 list-inside list-disc text-sm">
                      {parseResult.errors.map((error, i) => (
                        <li key={i}>{error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Warnings */}
              {parseResult.warnings.length > 0 && (
                <Alert className="border-acg-gold/30 bg-acg-gold/5">
                  <AlertTriangle className="h-4 w-4 text-acg-gold" />
                  <AlertDescription>
                    <p className="font-medium text-acg-gold">Warnings:</p>
                    <ul className="mt-1 list-inside list-disc text-sm text-muted-foreground">
                      {parseResult.warnings.slice(0, 5).map((warning, i) => (
                        <li key={i}>{warning}</li>
                      ))}
                      {parseResult.warnings.length > 5 && (
                        <li>...and {parseResult.warnings.length - 5} more</li>
                      )}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}

              {/* Success Summary */}
              {parseResult.errors.length === 0 && (
                <Alert className="border-green-500/30 bg-green-500/5">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <AlertDescription>
                    <p className="font-medium text-green-600">
                      Ready to import
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded bg-background p-2">
                        <span className="font-display text-lg font-bold text-foreground">
                          {totalQuestions}
                        </span>
                        <p className="text-xs text-muted-foreground">Questions</p>
                      </div>
                      <div className="rounded bg-background p-2">
                        <span className="font-display text-lg font-bold text-foreground">
                          {totalGroups}
                        </span>
                        <p className="text-xs text-muted-foreground">Groups</p>
                      </div>
                    </div>
                    {parseResult.formName && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Form: <strong>{parseResult.formName}</strong>
                      </p>
                    )}
                    {/* Show skip logic / calculation summary */}
                    {(() => {
                      const allQs = [...parseResult.questions, ...parseResult.groups.flatMap(g => g.questions)];
                      const withRelevant = allQs.filter(q => q.relevant).length;
                      const withCalc = allQs.filter(q => q.calculation).length;
                      const withFilter = allQs.filter(q => q.choiceFilter).length;
                      if (withRelevant + withCalc + withFilter === 0) return null;
                      return (
                        <div className="mt-2 flex flex-wrap gap-2 text-xs">
                          {withRelevant > 0 && (
                            <span className="rounded bg-primary/10 px-2 py-0.5 text-primary">{withRelevant} skip logic</span>
                          )}
                          {withCalc > 0 && (
                            <span className="rounded bg-primary/10 px-2 py-0.5 text-primary">{withCalc} calculations</span>
                          )}
                          {withFilter > 0 && (
                            <span className="rounded bg-primary/10 px-2 py-0.5 text-primary">{withFilter} choice filters</span>
                          )}
                        </div>
                      );
                    })()}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Help Link */}
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-xs text-muted-foreground">
              <strong>XLSForm Format:</strong> Upload a spreadsheet with{" "}
              <code className="rounded bg-muted px-1">survey</code>,{" "}
              <code className="rounded bg-muted px-1">choices</code>, and{" "}
              optionally{" "}
              <code className="rounded bg-muted px-1">settings</code> sheets.
            </p>
            <a
              href="https://xlsform.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <Download className="h-3 w-3" />
              Learn more about XLSForm
            </a>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="acg"
            onClick={handleImport}
            disabled={
              !parseResult ||
              parseResult.errors.length > 0 ||
              totalQuestions === 0
            }
          >
            Import {totalQuestions > 0 && `(${totalQuestions} questions)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default XLSFormImportDialog;
