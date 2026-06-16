import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRound, Download, Upload, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { downloadOfflineProfiles, importOfflineProfiles } from "@/lib/offlineProfileTransfer";

/**
 * Lets a field user export their encrypted offline credential profile to a
 * passphrase-protected file, and restore it on another device or after the
 * browser data is cleared — preserving offline login.
 */
export default function OfflineProfileManager() {
  const [exportPass, setExportPass] = useState("");
  const [importPass, setImportPass] = useState("");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const handleExport = async () => {
    if (exportPass.length < 8) {
      toast.error("Choose a passphrase of at least 8 characters.");
      return;
    }
    setExporting(true);
    try {
      const count = await downloadOfflineProfiles(exportPass);
      toast.success(`Exported ${count} offline profile${count === 1 ? "" : "s"}. Keep the file and passphrase safe.`);
      setExportPass("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (file: File | null) => {
    if (!file) return;
    if (importPass.length < 8) {
      toast.error("Enter the passphrase used when the file was exported.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setImporting(true);
    try {
      const text = await file.text();
      const res = await importOfflineProfiles(text, importPass);
      toast.success(`Restored offline login for ${res.restored} account${res.restored === 1 ? "" : "s"}.`);
      setImportPass("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5 text-primary" />Offline Login Backup
        </CardTitle>
        <CardDescription>
          Export your offline credentials into an encrypted file so you can restore offline login on a new device or
          after clearing browser data. The file is protected by a passphrase you choose — keep both safe.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Export */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="h-4 w-4 text-muted-foreground" />Export passphrase
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="password"
              value={exportPass}
              onChange={(e) => setExportPass(e.target.value)}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
            <Button onClick={handleExport} disabled={exporting} className="gap-2 sm:w-44">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export Backup
            </Button>
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Import */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-sm font-medium">
            <KeyRound className="h-4 w-4 text-muted-foreground" />Restore passphrase
          </Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="password"
              value={importPass}
              onChange={(e) => setImportPass(e.target.value)}
              placeholder="Passphrase used at export"
              autoComplete="off"
            />
            <input
              ref={fileRef}
              type="file"
              accept=".json,.amprofile.json,application/json"
              hidden
              onChange={(e) => handleImport(e.target.files?.[0] || null)}
            />
            <Button
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={importing}
              className="gap-2 sm:w-44"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Restore Backup
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Select your <code>.amprofile.json</code> backup file. Restored credentials re-enable offline login on this device.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
