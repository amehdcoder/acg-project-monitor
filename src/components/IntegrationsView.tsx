import { useState } from "react";
import {
  FileSpreadsheet,
  BarChart3,
  Link2,
  CheckCircle,
  AlertCircle,
  Settings,
  RefreshCw,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";

interface Integration {
  id: string;
  name: string;
  description: string;
  icon: typeof FileSpreadsheet;
  connected: boolean;
  lastSync?: string;
  url?: string;
}

const integrations: Integration[] = [
  {
    id: "google-sheets",
    name: "Google Sheets",
    description: "Automatically sync your form data to Google Sheets for easy analysis and sharing",
    icon: FileSpreadsheet,
    connected: false,
  },
  {
    id: "looker-studio",
    name: "Google Looker Studio",
    description: "Create beautiful dashboards and reports with your collected data",
    icon: BarChart3,
    connected: false,
  },
];

const IntegrationsView = () => {
  const [sheetUrl, setSheetUrl] = useState("");
  const [lookerUrl, setLookerUrl] = useState("");
  const [autoSync, setAutoSync] = useState(true);

  const handleConnect = (integrationName: string) => {
    toast({
      title: `Connecting to ${integrationName}`,
      description: "This feature requires backend integration. Enable Lovable Cloud to continue.",
    });
  };

  const handleSaveSettings = () => {
    toast({
      title: "Settings Saved",
      description: "Your integration settings have been updated.",
    });
  };

  return (
    <div className="space-y-6 p-4 lg:p-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground lg:text-3xl">
          Integrations
        </h1>
        <p className="text-muted-foreground">
          Connect your data with Google Sheets and Looker Studio
        </p>
      </div>

      {/* Integration Cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {integrations.map((integration) => (
          <Card key={integration.id} className="border-0 shadow-card overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-muted/50 to-transparent pb-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                    <integration.icon className="h-7 w-7 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="font-display text-xl">
                      {integration.name}
                    </CardTitle>
                    <div className="mt-1 flex items-center gap-2">
                      {integration.connected ? (
                        <>
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span className="text-sm text-green-600">Connected</span>
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            Not connected
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              <CardDescription className="text-base">
                {integration.description}
              </CardDescription>

              {integration.id === "google-sheets" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="sheet-url">Google Sheet URL</Label>
                    <Input
                      id="sheet-url"
                      placeholder="https://docs.google.com/spreadsheets/d/..."
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
                    <div>
                      <p className="font-medium text-foreground">Auto-sync data</p>
                      <p className="text-sm text-muted-foreground">
                        Automatically sync new submissions
                      </p>
                    </div>
                    <Switch
                      checked={autoSync}
                      onCheckedChange={setAutoSync}
                    />
                  </div>
                </div>
              )}

              {integration.id === "looker-studio" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="looker-url">Looker Studio Dashboard URL</Label>
                    <Input
                      id="looker-url"
                      placeholder="https://lookerstudio.google.com/reporting/..."
                      value={lookerUrl}
                      onChange={(e) => setLookerUrl(e.target.value)}
                    />
                  </div>
                  <div className="rounded-lg bg-acg-gold/10 p-3">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">Tip:</span> Create your Looker Studio
                      dashboard first, then paste the URL here to embed it in your reports.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  variant="acg"
                  className="flex-1"
                  onClick={() => handleConnect(integration.name)}
                >
                  <Link2 className="h-4 w-4" />
                  {integration.connected ? "Reconnect" : "Connect"}
                </Button>
                {integration.connected && (
                  <>
                    <Button variant="outline" size="icon">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon">
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Settings Card */}
      <Card className="border-0 shadow-card">
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Integration Settings
          </CardTitle>
          <CardDescription>
            Configure how your data flows between ACG Monitor and external services
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sync-interval">Sync Interval</Label>
              <select
                id="sync-interval"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="realtime">Real-time</option>
                <option value="5min">Every 5 minutes</option>
                <option value="15min">Every 15 minutes</option>
                <option value="1hour">Every hour</option>
                <option value="manual">Manual only</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="data-format">Data Format</Label>
              <select
                id="data-format"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
                <option value="excel">Excel</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
            <div>
              <p className="font-medium text-foreground">Include Metadata</p>
              <p className="text-sm text-muted-foreground">
                Include submission timestamps, location, and device info
              </p>
            </div>
            <Switch defaultChecked />
          </div>

          <div className="flex items-center justify-between rounded-lg bg-muted/50 p-4">
            <div>
              <p className="font-medium text-foreground">Notify on Sync Errors</p>
              <p className="text-sm text-muted-foreground">
                Receive alerts when data sync fails
              </p>
            </div>
            <Switch defaultChecked />
          </div>

          <div className="flex justify-end pt-4">
            <Button variant="acg" onClick={handleSaveSettings}>
              Save Settings
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card className="border border-acg-gold/30 bg-acg-gold/5">
        <CardContent className="flex flex-col items-center gap-4 py-8 text-center sm:flex-row sm:text-left">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-acg-gold/20">
            <BarChart3 className="h-8 w-8 text-acg-gold" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-lg font-semibold text-foreground">
              Need help setting up integrations?
            </h3>
            <p className="mt-1 text-muted-foreground">
              Our team can help you connect your data sources and create custom dashboards
              for your monitoring needs.
            </p>
          </div>
          <Button variant="gold">
            Contact Support
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default IntegrationsView;
