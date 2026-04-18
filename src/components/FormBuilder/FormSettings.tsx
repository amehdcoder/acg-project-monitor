import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings, Shield, Wifi, Save, MapPin, Lock, Users, Info, Clock } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface FormSettingsProps {
  formName: string;
  formDescription: string;
  settings: {
    allowAnonymous: boolean;
    requireLocation: boolean;
    offlineEnabled: boolean;
    autoSave: boolean;
    enforceGeofence?: boolean;
    autoSaveInterval?: number;
  };
  onFormNameChange: (name: string) => void;
  onFormDescriptionChange: (description: string) => void;
  onSettingsChange: (settings: {
    allowAnonymous: boolean;
    requireLocation: boolean;
    offlineEnabled: boolean;
    autoSave: boolean;
    enforceGeofence?: boolean;
    autoSaveInterval?: number;
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
  const updateSetting = (key: keyof typeof settings, value: boolean | number) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <TooltipProvider>
      <div className="space-y-6 p-6">
        {/* Form Details */}
        <Card className="border-0 shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display">
              <Settings className="h-5 w-5 text-primary" />
              Form Details
            </CardTitle>
            <CardDescription>
              Basic information about your form
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="form-name">Form Name *</Label>
              <Input
                id="form-name"
                value={formName}
                onChange={(e) => onFormNameChange(e.target.value)}
                placeholder="Enter form name"
                className={!formName.trim() ? "border-destructive" : ""}
              />
              {!formName.trim() && (
                <p className="text-xs text-destructive">Form name is required</p>
              )}
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
              <p className="text-xs text-muted-foreground">
                This description will be shown to users when they fill the form
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Access & Security */}
        <Card className="border-0 shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display">
              <Shield className="h-5 w-5 text-primary" />
              Access & Security
            </CardTitle>
            <CardDescription>
              Control who can submit and what data is collected
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
              <div className="flex items-start gap-3">
                <Users className="h-5 w-5 mt-0.5 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="allow-anonymous">Allow Anonymous Submissions</Label>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>When enabled, users can submit forms without logging in. 
                        User identity won't be tracked for these submissions.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Users can submit without logging in
                  </p>
                  {settings.allowAnonymous && (
                    <Badge variant="outline" className="mt-2 text-yellow-600 border-yellow-300 bg-yellow-50">
                      User tracking disabled
                    </Badge>
                  )}
                </div>
              </div>
              <Switch
                id="allow-anonymous"
                checked={settings.allowAnonymous}
                onCheckedChange={(value) => updateSetting("allowAnonymous", value)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 mt-0.5 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="require-location">Require GPS Location</Label>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Device GPS coordinates will be captured with each submission. 
                        Users must allow location access to submit the form.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Capture device location with each submission
                  </p>
                  {settings.requireLocation && (
                    <Badge variant="outline" className="mt-2 text-green-600 border-green-300 bg-green-50">
                      Location tracking enabled
                    </Badge>
                  )}
                </div>
              </div>
              <Switch
                id="require-location"
                checked={settings.requireLocation}
                onCheckedChange={(value) => updateSetting("requireLocation", value)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 mt-0.5 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="enforce-geofence">Enforce Geofence Restrictions</Label>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>When enabled with a defined geofence, submissions outside 
                        the boundary will be blocked. Configure geofence in the Geofencing tab.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Block submissions outside geofence boundaries
                  </p>
                  {settings.enforceGeofence && (
                    <Badge variant="outline" className="mt-2 text-red-600 border-red-300 bg-red-50">
                      Strict boundary enforcement
                    </Badge>
                  )}
                </div>
              </div>
              <Switch
                id="enforce-geofence"
                checked={settings.enforceGeofence ?? false}
                onCheckedChange={(value) => updateSetting("enforceGeofence", value)}
              />
            </div>

            {settings.enforceGeofence && (
              <Alert>
                <Shield className="h-4 w-4" />
                <AlertDescription>
                  Users outside the defined geofence area will not be able to submit this form.
                  Make sure to configure your geofence boundaries in the Geofencing tab.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Offline & Sync */}
        <Card className="border-0 shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-display">
              <Wifi className="h-5 w-5 text-primary" />
              Offline & Sync
            </CardTitle>
            <CardDescription>
              Configure offline data collection behavior
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
              <div className="flex items-start gap-3">
                <Wifi className="h-5 w-5 mt-0.5 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="offline-enabled">Enable Offline Mode</Label>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Allow data collectors to fill and save forms without internet. 
                        Forms will be stored locally and synced automatically when connection is restored.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Allow data collection without internet
                  </p>
                  {settings.offlineEnabled && (
                    <Badge variant="outline" className="mt-2 text-blue-600 border-blue-300 bg-blue-50">
                      Offline-capable
                    </Badge>
                  )}
                </div>
              </div>
              <Switch
                id="offline-enabled"
                checked={settings.offlineEnabled}
                onCheckedChange={(value) => updateSetting("offlineEnabled", value)}
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50">
              <div className="flex items-start gap-3">
                <Save className="h-5 w-5 mt-0.5 text-muted-foreground" />
                <div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="auto-save">Auto-Save Drafts</Label>
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="h-3.5 w-3.5 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Automatically save form progress as users fill it. 
                        Prevents data loss if the app closes unexpectedly.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Automatically save form progress
                  </p>
                  {settings.autoSave && (
                    <Badge variant="outline" className="mt-2 text-green-600 border-green-300 bg-green-50">
                      Auto-save active
                    </Badge>
                  )}
                </div>
              </div>
              <Switch
                id="auto-save"
                checked={settings.autoSave}
                onCheckedChange={(value) => updateSetting("autoSave", value)}
              />
            </div>

            {settings.autoSave && (
              <div className="flex items-center justify-between rounded-lg border border-border p-3 bg-muted/30">
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 mt-0.5 text-muted-foreground" />
                  <div>
                    <Label htmlFor="auto-save-interval">Auto-Save Interval (seconds)</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      How often to save draft progress
                    </p>
                  </div>
                </div>
                <Input
                  id="auto-save-interval"
                  type="number"
                  min={5}
                  max={300}
                  value={settings.autoSaveInterval ?? 30}
                  onChange={(e) => updateSetting("autoSaveInterval", parseInt(e.target.value) || 30)}
                  className="w-20"
                />
              </div>
            )}

            {settings.offlineEnabled && (
              <Alert>
                <Wifi className="h-4 w-4" />
                <AlertDescription>
                  Forms submitted offline will be stored in the device's local storage and 
                  automatically synced when internet connectivity is restored.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
};

export default FormSettings;
