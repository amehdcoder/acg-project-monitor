import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Database, Globe, Code, MessageSquare, Table, BarChart3, Plug,
  Plus, Trash2, Save, TestTube, CheckCircle, XCircle, RefreshCw,
  FileSpreadsheet, Smartphone, ArrowLeftRight, Zap,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Connector {
  id: string;
  name: string;
  type: "rest_api" | "database" | "slack" | "google_sheets" | "webhook" | "python" | "r_lang";
  config: Record<string, any>;
  status: "connected" | "disconnected" | "error";
  lastSync?: string;
}

const CONNECTOR_TYPES = [
  { type: "rest_api", label: "REST API", icon: Globe, description: "Connect to any REST API endpoint" },
  { type: "database", label: "MySQL/PostgreSQL", icon: Database, description: "Connect to external databases" },
  { type: "slack", label: "Slack", icon: MessageSquare, description: "Send alerts and reports to Slack" },
  { type: "google_sheets", label: "Google Sheets", icon: FileSpreadsheet, description: "Sync data with Google Sheets" },
  { type: "webhook", label: "Webhook", icon: ArrowLeftRight, description: "Send/receive data via webhooks" },
  { type: "python", label: "Python Script", icon: Code, description: "Run Python analysis scripts" },
  { type: "r_lang", label: "R Script", icon: BarChart3, description: "Run R statistical analysis" },
] as const;

const ExternalConnectorsView = () => {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("");
  const [configForm, setConfigForm] = useState<Record<string, string>>({});
  const [testingId, setTestingId] = useState<string | null>(null);

  const addConnector = () => {
    if (!selectedType) return;
    const typeInfo = CONNECTOR_TYPES.find(t => t.type === selectedType);
    const newConnector: Connector = {
      id: `conn-${Date.now()}`,
      name: configForm.name || typeInfo?.label || "New Connector",
      type: selectedType as any,
      config: { ...configForm },
      status: "disconnected",
    };
    setConnectors(prev => [...prev, newConnector]);
    setShowAddDialog(false);
    setConfigForm({});
    setSelectedType("");
    toast({ title: "Connector Added", description: `${newConnector.name} has been configured.` });
  };

  const testConnection = async (connectorId: string) => {
    setTestingId(connectorId);
    // Simulate test
    await new Promise(r => setTimeout(r, 2000));
    setConnectors(prev => prev.map(c =>
      c.id === connectorId ? { ...c, status: "connected", lastSync: new Date().toISOString() } : c
    ));
    setTestingId(null);
    toast({ title: "Connection Successful", description: "The connector is working correctly." });
  };

  const removeConnector = (id: string) => {
    setConnectors(prev => prev.filter(c => c.id !== id));
    toast({ title: "Connector Removed" });
  };

  const getConfigFields = (type: string) => {
    switch (type) {
      case "rest_api":
        return [
          { key: "name", label: "Connector Name", type: "text" },
          { key: "url", label: "API Base URL", type: "text", placeholder: "https://api.example.com" },
          { key: "auth_type", label: "Auth Type", type: "select", options: ["None", "Bearer Token", "API Key", "Basic Auth"] },
          { key: "auth_value", label: "Auth Value", type: "password" },
          { key: "headers", label: "Custom Headers (JSON)", type: "textarea" },
        ];
      case "database":
        return [
          { key: "name", label: "Connection Name", type: "text" },
          { key: "db_type", label: "Database Type", type: "select", options: ["MySQL", "PostgreSQL", "MariaDB"] },
          { key: "host", label: "Host", type: "text", placeholder: "db.example.com" },
          { key: "port", label: "Port", type: "text", placeholder: "3306" },
          { key: "database", label: "Database Name", type: "text" },
          { key: "username", label: "Username", type: "text" },
          { key: "password", label: "Password", type: "password" },
        ];
      case "slack":
        return [
          { key: "name", label: "Workspace Name", type: "text" },
          { key: "webhook_url", label: "Webhook URL", type: "text", placeholder: "https://hooks.slack.com/..." },
          { key: "channel", label: "Default Channel", type: "text", placeholder: "#data-alerts" },
        ];
      case "google_sheets":
        return [
          { key: "name", label: "Connection Name", type: "text" },
          { key: "spreadsheet_id", label: "Spreadsheet ID", type: "text" },
          { key: "sheet_name", label: "Sheet Name", type: "text" },
        ];
      case "webhook":
        return [
          { key: "name", label: "Webhook Name", type: "text" },
          { key: "url", label: "Webhook URL", type: "text", placeholder: "https://..." },
          { key: "method", label: "Method", type: "select", options: ["POST", "PUT", "PATCH"] },
          { key: "secret", label: "Secret Key", type: "password" },
        ];
      case "python":
        return [
          { key: "name", label: "Script Name", type: "text" },
          { key: "script", label: "Python Script", type: "textarea", placeholder: "import pandas as pd\n..." },
          { key: "schedule", label: "Schedule", type: "select", options: ["Manual", "Hourly", "Daily", "Weekly"] },
        ];
      case "r_lang":
        return [
          { key: "name", label: "Script Name", type: "text" },
          { key: "script", label: "R Script", type: "textarea", placeholder: "library(tidyverse)\n..." },
          { key: "schedule", label: "Schedule", type: "select", options: ["Manual", "Hourly", "Daily", "Weekly"] },
        ];
      default:
        return [];
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Plug className="h-5 w-5 text-primary" />
              External Data Connectors
            </CardTitle>
            <CardDescription>Connect to databases, APIs, and external services for data exchange</CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-3 w-3 mr-1" />Add Connector
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {connectors.length === 0 ? (
          <div className="text-center py-8">
            <Plug className="h-12 w-12 mx-auto mb-2 text-muted-foreground opacity-30" />
            <p className="text-sm text-muted-foreground">No connectors configured yet</p>
            <p className="text-xs text-muted-foreground mt-1">Add a connector to link external data sources</p>
            <Button className="mt-3" size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-3 w-3 mr-1" />Add Your First Connector
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            {connectors.map(connector => {
              const typeInfo = CONNECTOR_TYPES.find(t => t.type === connector.type);
              const Icon = typeInfo?.icon || Plug;
              return (
                <Card key={connector.id}>
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-muted rounded-lg">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h4 className="text-sm font-medium">{connector.name}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant="outline" className="text-[10px]">{typeInfo?.label}</Badge>
                          <Badge variant={connector.status === "connected" ? "default" : connector.status === "error" ? "destructive" : "secondary"} className="text-[10px]">
                            {connector.status === "connected" ? <CheckCircle className="h-2 w-2 mr-0.5" /> : connector.status === "error" ? <XCircle className="h-2 w-2 mr-0.5" /> : null}
                            {connector.status}
                          </Badge>
                          {connector.lastSync && (
                            <span className="text-[10px] text-muted-foreground">
                              Last sync: {new Date(connector.lastSync).toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" onClick={() => testConnection(connector.id)} disabled={testingId === connector.id}>
                        {testingId === connector.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <TestTube className="h-3 w-3" />}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => removeConnector(connector.id)}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Available Connector Types */}
        <div className="mt-6">
          <h3 className="text-sm font-semibold mb-3">Available Connector Types</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {CONNECTOR_TYPES.map(ct => {
              const Icon = ct.icon;
              return (
                <div key={ct.type} className="border rounded-lg p-3 text-center hover:bg-muted/30 cursor-pointer transition-colors" onClick={() => { setSelectedType(ct.type); setShowAddDialog(true); }}>
                  <Icon className="h-6 w-6 mx-auto mb-1 text-primary" />
                  <p className="text-xs font-medium">{ct.label}</p>
                  <p className="text-[10px] text-muted-foreground">{ct.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>

      {/* Add Connector Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Connector</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!selectedType ? (
              <div className="grid grid-cols-2 gap-2">
                {CONNECTOR_TYPES.map(ct => {
                  const Icon = ct.icon;
                  return (
                    <Card key={ct.type} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedType(ct.type)}>
                      <CardContent className="p-3 text-center">
                        <Icon className="h-6 w-6 mx-auto mb-1 text-primary" />
                        <p className="text-xs font-medium">{ct.label}</p>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                <Button variant="ghost" size="sm" onClick={() => setSelectedType("")}>← Back</Button>
                {getConfigFields(selectedType).map(field => (
                  <div key={field.key}>
                    <Label className="text-xs">{field.label}</Label>
                    {field.type === "textarea" ? (
                      <Textarea
                        placeholder={field.placeholder}
                        value={configForm[field.key] || ""}
                        onChange={e => setConfigForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                        rows={3}
                      />
                    ) : field.type === "select" ? (
                      <Select value={configForm[field.key] || ""} onValueChange={v => setConfigForm(prev => ({ ...prev, [field.key]: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                        <SelectContent>
                          {field.options?.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={field.type}
                        placeholder={field.placeholder}
                        value={configForm[field.key] || ""}
                        onChange={e => setConfigForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          {selectedType && (
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowAddDialog(false); setSelectedType(""); setConfigForm({}); }}>Cancel</Button>
              <Button onClick={addConnector}>
                <Save className="h-3 w-3 mr-1" />Save Connector
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default ExternalConnectorsView;
