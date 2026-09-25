import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Eye, EyeOff, Loader2, Lock, LogIn, MapPin, FileBarChart2, ShieldCheck } from "lucide-react";
import { dhis2Login, type Dhis2LoginResult, type ExchangeConnection } from "@/lib/programmeModule/healthExchange";

interface Props {
  projectId: string;
  existing?: ExchangeConnection | null;
  onSignedIn?: (result: Dhis2LoginResult) => void;
}

export default function Dhis2LoginPanel({ projectId, existing, onSignedIn }: Props) {
  const [baseUrl, setBaseUrl] = useState(existing?.base_url ?? "https://");
  const [username, setUsername] = useState(existing?.auth_type === "basic" ? existing.username ?? "" : "");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Dhis2LoginResult | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await dhis2Login({
        project_id: projectId, base_url: baseUrl.trim(), username: username.trim(), password,
        ...(existing?.kind === "dhis2" ? { connection_id: existing.id } : {}),
      });
      setResult(r); setPassword("");
      onSignedIn?.(r);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const sendable = result?.reports.filter((r) => r.canWrite) ?? [];
  const viewOnly = result?.reports.filter((r) => !r.canWrite) ?? [];

  return (
    <Card className="overflow-hidden">
      <div className="grid md:grid-cols-[minmax(0,380px)_1fr]">
        <form onSubmit={submit} className="space-y-4 border-b bg-muted/30 p-5 md:border-b-0 md:border-r">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <LogIn className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold">Sign in to DHIS2</p>
              <p className="text-xs text-muted-foreground">Use your own DHIS2 account</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d2-url">DHIS2 address</Label>
            <Input id="d2-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://dhis2.example.org" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d2-user">Username</Label>
            <Input id="d2-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="d2-pass">Password</Label>
            <div className="relative">
              <Input id="d2-pass" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password" required className="pr-10" />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full gap-2" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
            {busy ? "Checking with DHIS2…" : "Sign in"}
          </Button>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Your password is kept securely on the server so scheduled reports keep working. It is never shown again.
          </p>
        </form>

        <div className="space-y-4 p-5">
          {!result ? (
            <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 text-center text-muted-foreground">
              <FileBarChart2 className="h-10 w-10 opacity-50" />
              <p className="font-medium text-foreground">Your reports will appear here</p>
              <p className="max-w-sm text-sm">After you sign in, you'll see exactly which DHIS2 reports your account can send and for which locations.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <p className="font-semibold">Signed in as {result.user.displayName ?? result.user.username}</p>
                {result.system.name && <Badge variant="secondary">{result.system.name}{result.system.version ? ` · v${result.system.version}` : ""}</Badge>}
              </div>
              {result.user.roles.length > 0 && (
                <p className="text-xs text-muted-foreground">Roles: {result.user.roles.join(", ")}</p>
              )}
              <div>
                <p className="mb-1.5 flex items-center gap-1 text-sm font-medium"><MapPin className="h-4 w-4" /> Locations you report for</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.orgUnits.length === 0
                    ? <span className="text-sm text-muted-foreground">No locations assigned to this account.</span>
                    : result.orgUnits.map((o) => <Badge key={o.id} variant="outline">{o.name}</Badge>)}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium">Reports you can send ({sendable.length})</p>
                {sendable.length === 0 ? (
                  <p className="text-sm text-muted-foreground">This account cannot send any report. Ask your DHIS2 administrator for data-entry access.</p>
                ) : (
                  <div className="max-h-72 divide-y overflow-auto rounded-md border">
                    {sendable.map((r) => (
                      <div key={r.id} className="flex items-center justify-between gap-2 p-2.5 text-sm">
                        <span className="min-w-0 truncate">{r.name}</span>
                        <span className="flex shrink-0 gap-1">
                          <Badge variant="secondary">{r.periodType}</Badge>
                          <Badge variant="outline">{r.elementCount} items</Badge>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {viewOnly.length > 0 && (
                <p className="text-xs text-muted-foreground">{viewOnly.length} more report(s) are assigned to you but are view-only.</p>
              )}
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
