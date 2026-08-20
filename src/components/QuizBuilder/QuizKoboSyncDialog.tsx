/**
 * KoboToolbox Sync Settings for a quiz.
 *
 * Mirrors the Checklist Dashboard sync architecture:
 *   1. Connection (server URL, API token, form asset UID, sync mode)
 *   2. Schema auto-detection → interactive question setup (correct answer +
 *      points, MDA intervention grouping)
 *   3. Realtime REST Service webhook registration (instant analytics updates)
 *   4. Manual backfill pull for submissions received before setup
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import {
  CheckCircle2, Copy, Download, Eye, EyeOff, Link2, Loader2, PlugZap,
  RefreshCw, Save, ShieldCheck, Webhook, ListChecks,
} from "lucide-react";
import {
  groupsOf, parseKoboForm, questionGroupKey,
  type QuizKoboIdentityFields, type QuizKoboQuestion,
} from "@/lib/quizKobo/scoring";
import type { QuizKoboConfig } from "@/hooks/useQuizKobo";

const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL as string;

interface Props {
  open: boolean;
  onClose: () => void;
  quizId: string;
  quizTitle: string;
  config: QuizKoboConfig | null;
  onSaved: () => void;
}

const copyText = async (text: string, label: string) => {
  try { await navigator.clipboard.writeText(text); toast({ title: `${label} copied` }); }
  catch { toast({ title: "Copy failed", variant: "destructive" }); }
};

export default function QuizKoboSyncDialog({ open, onClose, quizId, quizTitle, config, onSaved }: Props) {
  const [serverUrl, setServerUrl] = useState("https://kf.kobotoolbox.org");
  const [formUid, setFormUid] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [syncMode, setSyncMode] = useState("webhook");
  const [formTitle, setFormTitle] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuizKoboQuestion[]>([]);
  const [identity, setIdentity] = useState<QuizKoboIdentityFields>({});
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [busy, setBusy] = useState<null | "test" | "import" | "save" | "register" | "pull">(null);
  const [groupFilter, setGroupFilter] = useState("all");

  useEffect(() => {
    if (!open) return;
    setServerUrl(config?.server_url ?? "https://kf.kobotoolbox.org");
    setFormUid(config?.form_uid ?? "");
    setApiToken(config?.api_token ?? "");
    setSyncMode(config?.sync_mode ?? "webhook");
    setFormTitle(config?.form_title ?? null);
    setQuestions(Array.isArray(config?.question_config) ? config!.question_config : []);
    setIdentity(config?.identity_fields ?? {});
  }, [open, config]);

  const webhookUrl = `${SUPABASE_URL}/functions/v1/kobo-quiz-webhook/${quizId}`;
  const groups = useMemo(() => groupsOf(questions), [questions]);
  const visibleQuestions = useMemo(
    () => (groupFilter === "all" ? questions : questions.filter((q) => questionGroupKey(q) === groupFilter)),
    [questions, groupFilter],
  );
  const totalPoints = useMemo(
    () => visibleQuestions.filter((q) => q.enabled !== false).reduce((s, q) => s + (Number(q.points) || 0), 0),
    [visibleQuestions],
  );

  const callManager = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("kobo-form-manager", { body });
    if (error) throw new Error(error.message);
    if ((data as any)?.error) throw new Error((data as any).detail || (data as any).error);
    return data as any;
  };

  const testConnection = async () => {
    setBusy("test");
    try {
      const res = await callManager({
        action: "test_connection", server_url: serverUrl, form_uid: formUid, api_token: apiToken,
      });
      setFormTitle(res?.form_title ?? null);
      toast({ title: "Connection successful", description: `${res?.form_title ?? formUid} — ${res?.submission_count ?? 0} submissions on Kobo.` });
    } catch (e) {
      toast({ title: "Connection failed", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const importSchema = async () => {
    setBusy("import");
    try {
      const res = await callManager({
        action: "fetch_submissions", server_url: serverUrl, form_uid: formUid, api_token: apiToken,
        page_size: 1, page: 0,
      });
      const parsed = parseKoboForm(res?.survey ?? [], res?.choices ?? []);
      if (!parsed.questions.length) throw new Error("No scorable questions found on this Kobo form.");
      // Preserve any answer keys / points already configured.
      const prior = new Map(questions.map((q) => [q.name, q]));
      setQuestions(parsed.questions.map((q) => {
        const old = prior.get(q.name);
        return old ? { ...q, correct: old.correct, points: old.points, enabled: old.enabled } : q;
      }));
      setIdentity(parsed.identity);
      setFormTitle(res?.form_title ?? formTitle);
      toast({
        title: "Schema imported",
        description: `${parsed.questions.length} questions across ${parsed.groups.length} MDA intervention group(s).`,
      });
    } catch (e) {
      toast({ title: "Schema import failed", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const save = async () => {
    if (!formUid.trim() || !apiToken.trim()) {
      toast({ title: "Form UID and API token are required", variant: "destructive" });
      return;
    }
    setBusy("save");
    try {
      const payload = {
        quiz_id: quizId,
        server_url: serverUrl.trim().replace(/\/+$/, ""),
        form_uid: formUid.trim(),
        form_title: formTitle,
        api_token: apiToken.trim(),
        sync_mode: syncMode,
        question_config: questions as unknown as any,
        identity_fields: identity as unknown as any,
      };
      const { error } = await supabase
        .from("quiz_kobo_configs")
        .upsert(payload, { onConflict: "quiz_id" });
      if (error) throw error;
      toast({ title: "Kobo sync settings saved" });
      onSaved();
    } catch (e) {
      toast({ title: "Save failed", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const registerWebhook = async () => {
    if (!config?.webhook_secret) {
      toast({ title: "Save the connection first", variant: "destructive" });
      return;
    }
    setBusy("register");
    try {
      const body = {
        name: `Amehnities Quiz Sync — ${quizTitle}`.slice(0, 100),
        endpoint: webhookUrl,
        active: true,
        email_notification: false,
        export_type: "json",
        settings: { custom_headers: { "x-kobo-secret": config.webhook_secret } },
      };
      const existing = await callManager({
        action: "kobo_proxy_hooks", server_url: serverUrl, form_uid: formUid, api_token: apiToken,
      }).catch(() => null);
      void existing;
      // Kobo REST Service creation happens through the browser-visible URL when
      // the proxy action is unavailable — surface manual instructions instead.
      await navigator.clipboard.writeText(JSON.stringify(body, null, 2)).catch(() => {});
      toast({
        title: "REST Service details copied",
        description: "Paste the endpoint and x-kobo-secret header into KoboToolbox → Settings → REST Services.",
      });
    } finally { setBusy(null); }
  };

  const pullBackfill = async () => {
    if (!config?.webhook_secret) {
      toast({ title: "Save the connection first", variant: "destructive" });
      return;
    }
    setBusy("pull");
    try {
      let page = 0;
      let fetched = 0;
      let saved = 0;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const res = await callManager({
          action: "fetch_submissions", server_url: serverUrl, form_uid: formUid, api_token: apiToken,
          page_size: 200, page,
        });
        const results: any[] = Array.isArray(res?.results) ? res.results : [];
        if (!results.length) break;
        fetched += results.length;
        const resp = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-kobo-secret": config.webhook_secret },
          body: JSON.stringify(results),
        });
        const out = await resp.json().catch(() => ({}));
        saved += Number(out?.saved ?? 0);
        if (results.length < 200 || page > 50) break;
        page += 1;
      }
      await supabase.from("quiz_kobo_configs")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("quiz_id", quizId);
      toast({ title: "Backfill complete", description: `${saved} of ${fetched} submissions scored and stored.` });
      onSaved();
    } catch (e) {
      toast({ title: "Backfill failed", description: (e as Error).message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const updateQuestion = (name: string, patch: Partial<QuizKoboQuestion>) =>
    setQuestions((prev) => prev.map((q) => (q.name === name ? { ...q, ...patch } : q)));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlugZap className="h-5 w-5 text-primary" /> KoboToolbox Sync Settings
          </DialogTitle>
          <DialogDescription>
            Connect <strong>{quizTitle}</strong> to a KoboToolbox form, auto-detect its questions and stream
            submissions into the analytics dashboard in real time.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="connection">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="connection" className="gap-1"><Link2 className="h-3 w-3" /> Connection</TabsTrigger>
            <TabsTrigger value="questions" className="gap-1"><ListChecks className="h-3 w-3" /> Question setup</TabsTrigger>
            <TabsTrigger value="webhook" className="gap-1"><Webhook className="h-3 w-3" /> Realtime webhook</TabsTrigger>
          </TabsList>

          {/* ── Connection ─────────────────────────────────────────── */}
          <TabsContent value="connection" className="space-y-4 pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Kobo server URL</Label>
                <Input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="https://kf.kobotoolbox.org" />
              </div>
              <div className="space-y-1.5">
                <Label>Form asset UID</Label>
                <Input value={formUid} onChange={(e) => setFormUid(e.target.value)} placeholder="aBcDeFgHiJkLmNoPqR" />
              </div>
              <div className="space-y-1.5">
                <Label>API token</Label>
                <div className="flex gap-2">
                  <Input
                    type={showToken ? "text" : "password"}
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    placeholder="Kobo API token"
                  />
                  <Button type="button" variant="outline" size="icon" onClick={() => setShowToken((s) => !s)}>
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Sync mode</Label>
                <Select value={syncMode} onValueChange={setSyncMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="webhook">Realtime webhook (recommended)</SelectItem>
                    <SelectItem value="pull">Manual pull only</SelectItem>
                    <SelectItem value="both">Webhook + periodic pull</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formTitle && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Linked form: <strong>{formTitle}</strong>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={testConnection} disabled={busy !== null || !formUid || !apiToken} className="gap-1.5">
                {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Test connection
              </Button>
              <Button variant="outline" onClick={importSchema} disabled={busy !== null || !formUid || !apiToken} className="gap-1.5">
                {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Import questions
              </Button>
              <Button onClick={save} disabled={busy !== null} className="gap-1.5">
                {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save settings
              </Button>
            </div>
          </TabsContent>

          {/* ── Question setup ─────────────────────────────────────── */}
          <TabsContent value="questions" className="space-y-3 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-64">
                <Label className="text-xs">MDA intervention group</Label>
                <Select value={groupFilter} onValueChange={setGroupFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All questions ({questions.length})</SelectItem>
                    {groups.map((g) => (
                      <SelectItem key={g.code} value={g.code}>{g.label} ({g.count})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Badge variant="secondary" className="mt-5">Max score: {totalPoints} pts</Badge>
              {identity.nameField && (
                <Badge variant="outline" className="mt-5">Participant ID: {identity.nameField}</Badge>
              )}
            </div>

            {!questions.length ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Import the Kobo schema on the Connection tab to configure answer keys.
              </p>
            ) : (
              <div className="rounded-lg border overflow-x-auto max-h-[45vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">On</TableHead>
                      <TableHead className="min-w-[280px]">Question</TableHead>
                      <TableHead className="min-w-[180px]">Intervention group</TableHead>
                      <TableHead className="min-w-[220px]">Correct answer</TableHead>
                      <TableHead className="w-24">Points</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleQuestions.map((q) => (
                      <TableRow key={q.name}>
                        <TableCell>
                          <Switch
                            checked={q.enabled !== false}
                            onCheckedChange={(v) => updateQuestion(q.name, { enabled: v })}
                          />
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="font-medium line-clamp-2">{q.label}</div>
                          <div className="text-muted-foreground">{q.name} · {q.type}</div>
                        </TableCell>
                        <TableCell className="text-xs">{q.groupLabel || questionGroupKey(q)}</TableCell>
                        <TableCell>
                          {q.choices.length ? (
                            <Select
                              value={q.correct[0] ?? ""}
                              onValueChange={(v) => updateQuestion(q.name, { correct: [v] })}
                            >
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select correct option" /></SelectTrigger>
                              <SelectContent>
                                {q.choices.map((c) => (
                                  <SelectItem key={c.name} value={c.name} className="text-xs">{c.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              className="h-8 text-xs"
                              value={q.correct.join(" ")}
                              onChange={(e) => updateQuestion(q.name, { correct: e.target.value.split(/\s+/).filter(Boolean) })}
                              placeholder="Expected value"
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number" min={0} className="h-8 w-20 text-xs"
                            value={q.points}
                            onChange={(e) => updateQuestion(q.name, { points: Number(e.target.value) || 0 })}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline" size="sm"
                onClick={() => setQuestions((p) => p.map((q) => (
                  questionGroupKey(q) === groupFilter || groupFilter === "all" ? { ...q, points: 4 } : q
                )))}
                disabled={!questions.length}
              >
                Set 4 pts for shown
              </Button>
              <Button
                variant="outline" size="sm"
                onClick={() => setQuestions((p) => p.map((q) => (
                  questionGroupKey(q) === groupFilter || groupFilter === "all" ? { ...q, points: 1 } : q
                )))}
                disabled={!questions.length}
              >
                Set 1 pt for shown
              </Button>
              <Button onClick={save} disabled={busy !== null} className="gap-1.5">
                {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save answer key
              </Button>
            </div>
          </TabsContent>

          {/* ── Webhook ────────────────────────────────────────────── */}
          <TabsContent value="webhook" className="space-y-4 pt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Webhook className="h-4 w-4 text-primary" /> REST Service endpoint
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input readOnly value={webhookUrl} className="font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={() => copyText(webhookUrl, "Endpoint")}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" /> Custom header <code>x-kobo-secret</code>
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      type={showSecret ? "text" : "password"}
                      value={config?.webhook_secret ?? "Save the connection to generate a secret"}
                      className="font-mono text-xs"
                    />
                    <Button variant="outline" size="icon" onClick={() => setShowSecret((s) => !s)}>
                      {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="outline" size="icon"
                      onClick={() => copyText(config?.webhook_secret ?? "", "Secret")}
                      disabled={!config?.webhook_secret}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  In KoboToolbox open the form → <strong>Settings → REST Services → Register a new service</strong>,
                  paste the endpoint above, set the type to JSON and add the custom header
                  <code className="mx-1">x-kobo-secret</code>with the secret. Every new submission is then scored and
                  pushed live to the Analytics tab.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={registerWebhook} disabled={busy !== null} className="gap-1.5">
                    {busy === "register" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
                    Copy REST Service config
                  </Button>
                  <Button variant="outline" onClick={pullBackfill} disabled={busy !== null || !config} className="gap-1.5">
                    {busy === "pull" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Pull existing submissions
                  </Button>
                </div>
                {config?.last_event_at && (
                  <p className="text-xs text-muted-foreground">
                    Last submission received {new Date(config.last_event_at).toLocaleString()}
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
