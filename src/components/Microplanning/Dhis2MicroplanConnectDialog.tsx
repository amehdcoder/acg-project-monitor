import { useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function Dhis2MicroplanConnectDialog({ open, onOpenChange, projectId, existingId, onConnected }: {
  open: boolean; onOpenChange: (o: boolean) => void; projectId: string; existingId?: string; onConnected: (id: string) => void;
}) {
  const [mode, setMode] = useState<"pat" | "login">("pat");
  const [baseUrl, setBaseUrl] = useState("https://");
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError("");
    const body: Record<string, unknown> = {
      action: "dhis2_login", scope: "microplanning", project_id: projectId, base_url: baseUrl.trim(),
      ...(existingId ? { connection_id: existingId } : {}),
      ...(mode === "pat" ? { token: token.trim() } : { username: username.trim(), password }),
    };
    const { data, error: err } = await supabase.functions.invoke("health-exchange", { body });
    setBusy(false);
    if (err) {
      let msg = err.message;
      if (err instanceof FunctionsHttpError) { try { msg = (await err.context.json()).error ?? msg; } catch { /* keep */ } }
      setError(msg); return;
    }
    setToken(""); setPassword("");
    toast.success(`Connected as ${data.user?.displayName ?? data.user?.username}`);
    onConnected(data.connection_id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Connect DHIS2 for Geo Microplanning</DialogTitle>
          <DialogDescription>This setup is separate from the Cases page.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "pat" | "login")}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="pat">Access token</TabsTrigger>
              <TabsTrigger value="login">Sign in</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="space-y-1.5">
            <Label htmlFor="mp-url">DHIS2 address</Label>
            <Input id="mp-url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://dhis2.example.org" required />
          </div>
          {mode === "pat" ? (
            <div className="space-y-1.5">
              <Label htmlFor="mp-pat">Personal access token</Label>
              <Input id="mp-pat" type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="d2pat_…" required autoComplete="off" />
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="mp-user">Username</Label>
                <Input id="mp-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mp-pass">Password</Label>
                <Input id="mp-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              </div>
            </>
          )}
          {error && <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{busy ? "Checking with DHIS2…" : "Connect"}
          </Button>
          <p className="flex gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />Details are checked with DHIS2 straight away and kept securely on the server.</p>
        </form>
      </DialogContent>
    </Dialog>
  );
}
