import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { saveDeviceCase } from "@/lib/deviceCases";

interface CaseProperty { id: string; name: string; label: string; defaultValue?: string }

interface Props {
  caseType: any;
  deviceId: string;
  projectId: string;
  collectorLabel: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Opens a new case entirely offline; it queues and syncs like a form record. */
const DeviceCaseFiller = ({ caseType, deviceId, projectId, collectorLabel, onClose, onSaved }: Props) => {
  const properties: CaseProperty[] = useMemo(
    () => (Array.isArray(caseType?.properties) ? caseType.properties : []),
    [caseType],
  );
  const [caseName, setCaseName] = useState("");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(properties.map((p) => [p.name, p.defaultValue ?? ""])),
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!caseName.trim()) {
      toast.error("Give this case a name first.");
      return;
    }
    setSaving(true);
    try {
      await saveDeviceCase({
        caseTypeId: caseType.id,
        caseTypeLabel: caseType.label || caseType.name,
        deviceId,
        projectId,
        collectorLabel,
        caseName: caseName.trim(),
        properties: values,
      });
      toast.success("Case saved — it will sync automatically");
      onSaved();
      onClose();
    } catch {
      toast.error("Could not save this case on the device.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto max-w-2xl px-4 py-3 flex items-center gap-2">
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="font-display text-lg font-semibold truncate">
              New {caseType.label || caseType.name}
            </h1>
            <p className="text-xs text-muted-foreground truncate">{collectorLabel}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Case details</CardTitle>
            <CardDescription>Works offline — saved on this device until a connection returns.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="case-name">Case name *</Label>
              <Input id="case-name" value={caseName} onChange={(e) => setCaseName(e.target.value)}
                placeholder="e.g. Amina Bello — Kaugama" />
            </div>
            {properties.map((p) => (
              <div key={p.id || p.name} className="space-y-1.5">
                <Label htmlFor={`prop-${p.name}`}>{p.label || p.name}</Label>
                <Input
                  id={`prop-${p.name}`}
                  value={values[p.name] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.value }))}
                />
              </div>
            ))}
            <Button className="w-full" onClick={() => void save()} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save case
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default DeviceCaseFiller;
