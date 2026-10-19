import { useEffect, useMemo, useState } from "react";
import {
  KeyRound, Webhook, Plus, Trash2, Copy, Check, Loader2, Play, Pause,
  RefreshCw, BookOpen, ChevronDown, ChevronUp, ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { generateApiKey, generateWebhookSecret, sha256Hex } from "@/lib/integrations/apiKeys";

const API_SCOPES = [
  { id: "records:read", label: "Read beneficiary records" },
  { id: "aggregates:read", label: "Read monthly aggregates" },
  { id: "reports:read", label: "Read programme reports" },
];

const EVENT_CATALOGUE = [
  { id: "beneficiary.created", label: "Beneficiary registered" },
  { id: "beneficiary.updated", label: "Beneficiary updated" },
  { id: "service.recorded", label: "Service recorded" },
  { id: "home_visit.reported", label: "Home visit reported" },
  { id: "feedback.submitted", label: "Community feedback submitted" },
  { id: "programme_report.submitted", label: "Programme report submitted (full report, instant)" },
  { id: "programme_report.monthly_sync", label: "Programme report monthly sync (1st of each month)" },
  { id: "*", label: "All events" },
];

interface ApiKeyRow {
  id: string; name: string; key_prefix: string; scopes: string[];
  is_active: boolean; last_used_at: string | null; created_at: string; revoked_at: string | null;
}
interface EndpointRow {
  id: string; url: string; description: string | null; events: string[];
  is_active: boolean; created_at: string;
}
interface DeliveryRow {
  id: string; event: string; status: string; http_status: number | null;
  attempts: number; duration_ms: number | null; created_at: string; response_snippet: string | null;
}


const ApiWebhooksPanel = ({ projects }: { projects: { id: string; name: string }[] }) => {
  const [projectId, setProjectId] = useState("");
  const [keys, setKeys] = useState<ApiKeyRow[]>([]);
  const [endpoints, setEndpoints] = useState<EndpointRow[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(["records:read"]);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [newUrl, setNewUrl] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newEvents, setNewEvents] = useState<string[]>(["beneficiary.created"]);
  const [copied, setCopied] = useState<string | null>(null);
  const [showDocs, setShowDocs] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);

  const projectName = useMemo(() => projects.find((p) => p.id === projectId)?.name ?? "", [projects, projectId]);

  const load = async (pid: string) => {
    if (!pid) return;
    setLoading(true);
    const [k, e] = await Promise.all([
      supabase.from("api_keys").select("id, name, key_prefix, scopes, is_active, last_used_at, created_at, revoked_at")
        .eq("project_id", pid).order("created_at", { ascending: false }),
      supabase.from("webhook_endpoints").select("id, url, description, events, is_active, created_at")
        .eq("project_id", pid).order("created_at", { ascending: false }),
    ]);
    if (k.error) toast({ title: "Could not load API keys", description: k.error.message, variant: "destructive" });
    if (e.error) toast({ title: "Could not load webhooks", description: e.error.message, variant: "destructive" });
    setKeys((k.data as ApiKeyRow[]) ?? []);
    setEndpoints((e.data as EndpointRow[]) ?? []);
    if (e.data && e.data.length > 0) {
      const { data: d } = await supabase.from("webhook_deliveries")
        .select("id, event, status, http_status, attempts, duration_ms, created_at, response_snippet")
        .in("endpoint_id", e.data.map((x) => x.id))
        .order("created_at", { ascending: false }).limit(30);
      setDeliveries((d as DeliveryRow[]) ?? []);
    } else {
      setDeliveries([]);
    }
    setLoading(false);
  };

  useEffect(() => { if (projectId) load(projectId); }, [projectId]);

  const copy = async (text: string, tag: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(tag);
    setTimeout(() => setCopied(null), 2000);
  };

  const createKey = async () => {
    if (!newKeyName.trim()) {
      toast({ title: "Name required", description: "Give this key a name, e.g. \"Donor MEL dashboard\".", variant: "destructive" });
      return;
    }
    const { raw, prefix } = generateApiKey();
    const hash = await sha256Hex(raw);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("api_keys").insert({
      project_id: projectId, name: newKeyName.trim(), key_prefix: prefix,
      key_hash: hash, scopes: newKeyScopes, created_by: user?.id,
    });
    if (error) {
      toast({ title: "Could not create key", description: error.message, variant: "destructive" });
      return;
    }
    setCreatedKey(raw);
    setNewKeyName("");
    load(projectId);
  };

  const revokeKey = async (id: string) => {
    const { error } = await supabase.from("api_keys")
      .update({ is_active: false, revoked_at: new Date().toISOString() }).eq("id", id);
    if (error) toast({ title: "Could not revoke key", description: error.message, variant: "destructive" });
    else { toast({ title: "Key revoked" }); load(projectId); }
  };

  const addEndpoint = async () => {
    if (!/^https:\/\/.+/.test(newUrl.trim())) {
      toast({ title: "HTTPS URL required", description: "Webhook URLs must start with https://", variant: "destructive" });
      return;
    }
    if (newEvents.length === 0) {
      toast({ title: "Pick at least one event", variant: "destructive" });
      return;
    }
    const secret = generateWebhookSecret();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("webhook_endpoints").insert({
      project_id: projectId, url: newUrl.trim(), description: newDesc.trim() || null,
      secret, events: newEvents, created_by: user?.id,
    });
    if (error) {
      toast({ title: "Could not add endpoint", description: error.message, variant: "destructive" });
      return;
    }
    setCreatedSecret(secret);
    setNewUrl(""); setNewDesc("");
    load(projectId);
  };

  const toggleEndpoint = async (id: string, active: boolean) => {
    await supabase.from("webhook_endpoints").update({ is_active: active }).eq("id", id);
    load(projectId);
  };

  const removeEndpoint = async (id: string) => {
    const { error } = await supabase.from("webhook_endpoints").delete().eq("id", id);
    if (error) toast({ title: "Could not remove endpoint", description: error.message, variant: "destructive" });
    else load(projectId);
  };

  const sendTest = async (id: string) => {
    setTestingId(id);
    const { data, error } = await supabase.functions.invoke("webhook-dispatch", {
      body: { action: "test", endpoint_id: id },
    });
    setTestingId(null);
    if (error) {
      toast({ title: "Test failed", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: data?.ok ? "Test delivered" : "Test sent — endpoint did not confirm",
        description: data?.ok ? "The endpoint responded successfully." : "Check the delivery log below for the response.",
        variant: data?.ok ? "default" : "destructive",
      });
      load(projectId);
    }
  };

  const toggleIn = (list: string[], v: string, set: (x: string[]) => void) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const apiBase = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/external-api/v1`;

  return (
    <Card className="border-0 shadow-card overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
            <Webhook className="h-7 w-7 text-primary" />
          </div>
          <div>
            <CardTitle>API &amp; Webhooks</CardTitle>
            <CardDescription className="mt-1 text-base">
              Connect donor systems, MEL platforms and dashboards to live Amehnities data.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="space-y-2 max-w-md">
          <Label>Project</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger><SelectValue placeholder="Choose a project" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {projectId && (
          <>
            {/* API KEYS */}
            <section className="space-y-4 rounded-xl border border-border p-4">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">API keys for {projectName}</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                External systems call the REST API with a key. Keys are stored hashed — the full key is shown only once.
              </p>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input placeholder="Key name, e.g. Donor MEL dashboard" value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)} />
                <Button onClick={createKey} className="gap-2"><Plus className="h-4 w-4" /> Create key</Button>
              </div>
              <div className="flex flex-wrap gap-4">
                {API_SCOPES.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={newKeyScopes.includes(s.id)}
                      onCheckedChange={() => toggleIn(newKeyScopes, s.id, setNewKeyScopes)} />
                    {s.label}
                  </label>
                ))}
              </div>

              {createdKey && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-2">
                  <p className="text-sm font-medium text-foreground">Copy this key now — it will not be shown again.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 break-all rounded bg-background px-2 py-1 text-xs font-mono">{createdKey}</code>
                    <Button size="sm" variant="outline" onClick={() => copy(createdKey, "key")}>
                      {copied === "key" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {keys.length === 0 && <p className="text-sm text-muted-foreground">No API keys yet.</p>}
                {keys.map((k) => (
                  <div key={k.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2">
                    <code className="text-xs font-mono text-muted-foreground">{k.key_prefix}…</code>
                    <span className="font-medium text-sm">{k.name}</span>
                    <div className="flex gap-1">
                      {k.scopes.map((s) => <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>)}
                    </div>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleString()}` : "Never used"}
                    </span>
                    {k.is_active ? (
                      <Button size="sm" variant="destructive" onClick={() => revokeKey(k.id)}>Revoke</Button>
                    ) : (
                      <Badge variant="outline" className="text-destructive border-destructive/40">Revoked</Badge>
                    )}
                  </div>
                ))}
              </div>
            </section>

            {/* WEBHOOKS */}
            <section className="space-y-4 rounded-xl border border-border p-4">
              <div className="flex items-center gap-2">
                <Webhook className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">Webhook endpoints</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Amehnities POSTs signed JSON to your URL the moment an event happens. Verify the
                <code className="mx-1 text-xs">X-Amehnities-Signature</code> header with your signing secret.
              </p>

              <div className="grid gap-3">
                <Input placeholder="https://your-system.org/webhooks/amehnities" value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)} />
                <Input placeholder="Description (optional), e.g. Donor results platform" value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)} />
                <div className="flex flex-wrap gap-3">
                  {EVENT_CATALOGUE.map((ev) => (
                    <label key={ev.id} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={newEvents.includes(ev.id)}
                        onCheckedChange={() => toggleIn(newEvents, ev.id, setNewEvents)} />
                      {ev.label}
                    </label>
                  ))}
                </div>
                <Button onClick={addEndpoint} className="gap-2 w-fit"><Plus className="h-4 w-4" /> Add endpoint</Button>
              </div>

              {createdSecret && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 space-y-2">
                  <p className="text-sm font-medium text-foreground">Signing secret — copy it now; it is shown only once.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 break-all rounded bg-background px-2 py-1 text-xs font-mono">{createdSecret}</code>
                    <Button size="sm" variant="outline" onClick={() => copy(createdSecret, "secret")}>
                      {copied === "secret" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {endpoints.length === 0 && <p className="text-sm text-muted-foreground">No webhook endpoints yet.</p>}
                {endpoints.map((e) => (
                  <div key={e.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{e.url}</p>
                      <p className="text-xs text-muted-foreground">{e.description || e.events.join(", ")}</p>
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <Button size="sm" variant="outline" disabled={testingId === e.id} onClick={() => sendTest(e.id)}>
                        {testingId === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        <span className="ml-1">Test</span>
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggleEndpoint(e.id, !e.is_active)}>
                        {e.is_active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => removeEndpoint(e.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Delivery log */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold">Recent deliveries</h4>
                  <Button size="sm" variant="ghost" onClick={() => load(projectId)} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  </Button>
                </div>
                {deliveries.length === 0 && <p className="text-sm text-muted-foreground">No deliveries yet.</p>}
                {deliveries.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                    <Badge variant={d.status === "success" ? "default" : d.status === "failed" ? "destructive" : "secondary"}>
                      {d.status}
                    </Badge>
                    <span className="font-mono text-xs">{d.event}</span>
                    {d.http_status && <span className="text-xs text-muted-foreground">HTTP {d.http_status}</span>}
                    {d.duration_ms != null && <span className="text-xs text-muted-foreground">{d.duration_ms}ms</span>}
                    {d.attempts > 1 && <span className="text-xs text-muted-foreground">attempt {d.attempts}</span>}
                    <span className="ml-auto text-xs text-muted-foreground">{new Date(d.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* DOCS */}
            <section className="rounded-xl border border-border">
              <button type="button" onClick={() => setShowDocs(!showDocs)}
                className="flex w-full items-center gap-2 p-4 text-left">
                <BookOpen className="h-5 w-5 text-primary" />
                <span className="font-semibold">Integration guide</span>
                {showDocs ? <ChevronUp className="ml-auto h-4 w-4" /> : <ChevronDown className="ml-auto h-4 w-4" />}
              </button>
              {showDocs && (
                <div className="space-y-4 border-t border-border p-4 text-sm">
                  <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3">
                    <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
                    <p className="text-muted-foreground">
                      Keys are project-scoped and hashed at rest; webhook payloads are HMAC-SHA256 signed.
                      Share keys and secrets only over secure channels.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold">REST API base URL</h4>
                    <code className="mt-1 block break-all rounded bg-background px-2 py-1 text-xs font-mono">{apiBase}</code>
                  </div>
                  <div>
                    <h4 className="font-semibold">Example: pull beneficiary records</h4>
                    <pre className="mt-1 overflow-x-auto rounded bg-background p-3 text-xs font-mono">{`curl -H "Authorization: Bearer amk_..." \\
  "${apiBase}/beneficiaries?limit=100"

# Monthly donor-ready totals
curl -H "Authorization: Bearer amk_..." \\
  "${apiBase}/aggregates?period=2026-10"`}</pre>
                  </div>
                  <div>
                    <h4 className="font-semibold">Verify a webhook signature (Node.js)</h4>
                    <pre className="mt-1 overflow-x-auto rounded bg-background p-3 text-xs font-mono">{`const crypto = require("crypto");
const sig = req.headers["x-amehnities-signature"]; // "sha256=..."
const expected = "sha256=" + crypto
  .createHmac("sha256", process.env.WEBHOOK_SECRET)
  .update(rawBody).digest("hex");
if (sig !== expected) return res.status(401).end();`}</pre>
                  </div>
                  <div>
                    <h4 className="font-semibold">Events</h4>
                    <ul className="mt-1 list-inside list-disc text-muted-foreground">
                      {EVENT_CATALOGUE.filter((e) => e.id !== "*").map((e) => (
                        <li key={e.id}><code className="text-xs">{e.id}</code> — {e.label}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default ApiWebhooksPanel;
