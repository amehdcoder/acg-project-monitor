import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Settings, Shield, Wifi, Save } from "lucide-react";

interface FormSettingsProps {
  formName: string;
  formDescription: string;
  settings: {
    allowAnonymous: boolean;
    requireLocation: boolean;
    offlineEnabled: boolean;
    autoSave: boolean;
  };
  onFormNameChange: (name: string) => void;
  onFormDescriptionChange: (description: string) => void;
  onSettingsChange: (settings: {
    allowAnonymous: boolean;
    requireLocation: boolean;
    offlineEnabled: boolean;
    autoSave: boolean;
  }) => void;
}

const FormSettings = ({
  formName,
  formDescription,
  settings,
  onFormNameChange,
  onFormDescriptionChange,
  onSettingsChange,
}: FormSettingsProps) => {
  const updateSetting = (key: keyof typeof settings, value: boolean) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-6 p-6">
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <Settings className="h-5 w-5 text-primary" />
            Form Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="form-name">Form Name</Label>
            <Input
              id="form-name"
              value={formName}
              onChange={(e) => onFormNameChange(e.target.value)}
              placeholder="Enter form name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="form-description">Description</Label>
            <Textarea
              id="form-description"
              value={formDescription}
              onChange={(e) => onFormDescriptionChange(e.target.value)}
              placeholder="Describe the purpose of this form"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <Shield className="h-5 w-5 text-primary" />
            Access & Security
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="allow-anonymous">Allow Anonymous Submissions</Label>
              <p className="text-xs text-muted-foreground">
                Users can submit without logging in
              </p>
            </div>
            <Switch
              id="allow-anonymous"
              checked={settings.allowAnonymous}
              onCheckedChange={(value) => updateSetting("allowAnonymous", value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="require-location">Require GPS Location</Label>
              <p className="text-xs text-muted-foreground">
                Capture device location with each submission
              </p>
            </div>
            <Switch
              id="require-location"
              checked={settings.requireLocation}
              onCheckedChange={(value) => updateSetting("requireLocation", value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display">
            <Wifi className="h-5 w-5 text-primary" />
            Offline & Sync
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="offline-enabled">Enable Offline Mode</Label>
              <p className="text-xs text-muted-foreground">
                Allow data collection without internet
              </p>
            </div>
            <Switch
              id="offline-enabled"
              checked={settings.offlineEnabled}
              onCheckedChange={(value) => updateSetting("offlineEnabled", value)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <Label htmlFor="auto-save">Auto-Save Drafts</Label>
              <p className="text-xs text-muted-foreground">
                Automatically save form progress
              </p>
            </div>
            <Switch
              id="auto-save"
              checked={settings.autoSave}
              onCheckedChange={(value) => updateSetting("autoSave", value)}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FormSettings;
