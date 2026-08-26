/**
 * Amehnities AI — a real, continuously-trained Transformer neural network
 * built from Amehnities app data and activity, visualised live.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Brain, Activity, Layers, Gauge, Play, Pause, Plus, Minus, Cpu, Radio, Sparkles, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAmehnitiesBrain } from "@/hooks/useAmehnitiesBrain";
import NeuralNetworkCanvas from "@/components/AmehnitiesAI/NeuralNetworkCanvas";
import AttentionMaps from "@/components/AmehnitiesAI/AttentionMaps";
import LossSparkline from "@/components/AmehnitiesAI/LossSparkline";
import TrainingControlPanel from "@/components/AmehnitiesAI/TrainingControlPanel";
import TrainingMetricsDashboard from "@/components/AmehnitiesAI/TrainingMetricsDashboard";
import DataSourcePanel from "@/components/AmehnitiesAI/DataSourcePanel";
import AskModelPanel from "@/components/AmehnitiesAI/AskModelPanel";
import CheckpointsPanel from "@/components/AmehnitiesAI/CheckpointsPanel";
import ValidationPanel from "@/components/AmehnitiesAI/ValidationPanel";
import DivergenceAlert from "@/components/AmehnitiesAI/DivergenceAlert";
import AmehnitiesChatBox from "@/components/AmehnitiesAI/AmehnitiesChatBox";
import FrontierChatConsole from "@/components/AmehnitiesAI/FrontierChatConsole";
import { useAiPermissions } from "@/hooks/useAiPermissions";

import ReviewQueuePanel from "@/components/AmehnitiesAI/ReviewQueuePanel";
import { useAuth } from "@/hooks/useAuth";
import { usePageAccess } from "@/hooks/usePageAccess";
import AiAccessManager from "@/components/AmehnitiesAI/AiAccessManager";
import { Lock, KeyRound, Eye } from "lucide-react";

const fmt = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`;

function Stat({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) {
  return (
    <Card className="relative overflow-hidden border-border/60 bg-card/70 p-4 backdrop-blur">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3.5 w-3.5 text-primary" />
        {label}
      </div>
      <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function AmehnitiesAIWorkspace() {
  const navigate = useNavigate();
  const { isOwner, isAdmin } = useAuth();
  const [accessOpen, setAccessOpen] = useState(false);
  // Granular capabilities the Owner assigned to this admin (Owner = all).
  const { can: canAi, viewOnly } = useAiPermissions();
  const canTrain = canAi("training");


  const {
    telemetry, running, toggle, budget, setBudget, grow, shrink,
    feed, sourceCounts, corpusReady, synthetic, predictions, vocab,
    allSources, enabledSources, toggleSource, setAllSources,
    exportCheckpoint, importCheckpoint, inspectCheckpoint, applyConfig,
    checkpoints, downloadSavedCheckpoint, askModel,
    evaluation, evalSeries, evalEnabled, trainTokens, valTokens,
    runEvaluation, setEvalEnabled, alert, guardEnabled, setGuardEnabled, dismissAlert,
    bestCheckpoints, autoSave, setAutoSave, bestMetric, setBestMetric,
    autoSaving, rollbackTo, downloadBestCheckpoint, clearBestCheckpoints,
    plasticity, setPlasticity, growth, maxParams,
    webLearning, setWebLearning, webStats,
  } = useAmehnitiesBrain();


  const cfg = telemetry?.cfg;
  const totalEvents = useMemo(() => Object.values(sourceCounts).reduce((a, b) => a + b, 0), [sourceCounts]);
  const maxSource = useMemo(() => Math.max(1, ...Object.values(sourceCounts)), [sourceCounts]);

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Ambient field */}
      <div aria-hidden className="pointer-events-none fixed inset-0 opacity-[0.55]"
        style={{ background: "radial-gradient(60rem 40rem at 15% -10%, hsl(var(--primary) / 0.16), transparent 60%), radial-gradient(45rem 30rem at 95% 0%, hsl(var(--primary) / 0.10), transparent 55%)" }} />

      <div className="relative mx-auto w-full max-w-7xl px-4 pb-24 pt-5 sm:px-6">
        <header className="mb-6 flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-xl border border-primary/30 bg-primary/10">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Amehnities AI</h1>
              <p className="text-xs text-muted-foreground sm:text-sm">
                A decoder-only Transformer trained live, in your browser, on Amehnities activity.
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5 border-primary/40 text-primary">
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${running ? "animate-pulse bg-primary" : "bg-muted-foreground"}`} />
              {running ? "Training" : "Paused"}
            </Badge>
            {viewOnly && (
              <Badge variant="secondary" className="gap-1.5 text-[11px]">
                <Eye className="h-3 w-3" /> View-only access
              </Badge>
            )}
            {canTrain && (
              <Button size="sm" variant={running ? "secondary" : "default"} onClick={toggle} className="gap-1.5">
                {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {running ? "Pause" : "Resume"}
              </Button>
            )}
            {isOwner && (
              <Button size="sm" variant="outline" onClick={() => setAccessOpen(true)} className="gap-1.5">
                <KeyRound className="h-4 w-4" /> Manage access
              </Button>
            )}
          </div>

        </header>

        {/* KPI strip */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={Cpu} label="Parameters" value={fmt(telemetry?.params ?? 0)}
            sub={cfg ? `${cfg.nLayers} blocks · d=${cfg.dModel} · ${cfg.nHeads} heads` : "booting"} />
          <Stat icon={Activity} label="Loss" value={(telemetry?.loss ?? 0).toFixed(3)}
            sub={`perplexity ${(telemetry?.perplexity ?? 0).toFixed(1)}`} />
          <Stat icon={Layers} label="Steps" value={fmt(telemetry?.step ?? 0)}
            sub={`${fmt(telemetry?.tokensSeen ?? 0)} tokens seen`} />
          <Stat icon={Radio} label="Activity corpus" value={fmt(totalEvents)}
            sub={corpusReady ? (synthetic ? "warm-up pattern blended" : "live app events") : "loading…"} />
        </section>

        {/* Network */}
        <Card className="mt-4 overflow-hidden border-border/60 bg-card/70 backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Architecture — live forward pass</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-lg border border-border/60 px-2.5 py-1.5">
                <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Compute budget</span>
                <div className="w-24">
                  <Slider value={[budget]} min={2} max={30} step={1} onValueChange={(v) => setBudget(v[0])} />
                </div>
                <span className="w-10 font-mono text-xs tabular-nums">{budget}ms</span>
              </div>
              <Button size="sm" variant="outline" onClick={shrink} className="gap-1"><Minus className="h-3.5 w-3.5" /> Scale down</Button>
              <Button size="sm" onClick={grow} className="gap-1"><Plus className="h-3.5 w-3.5" /> Scale up</Button>
            </div>
          </div>
          <div className="p-2 sm:p-4">
            <NeuralNetworkCanvas telemetry={telemetry} running={running} />
          </div>
          <p className="border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
            Training runs in a Web Worker with a hard per-tick time budget and pauses when this page is hidden — the rest of Amehnities stays fully responsive while the model grows.
          </p>
        </Card>

        {/* Grounded assistant over live application data */}
        <div className="mt-4">
          <AmehnitiesChatBox telemetry={telemetry} corpusEvents={totalEvents} />

          {/* Enterprise console: files, analysis, documents, multimodal media */}
          <div className="mt-4">
            <FrontierChatConsole telemetry={telemetry} corpusEvents={totalEvents} />
          </div>


          {/* Human-in-the-loop correction queue — admins only. */}
          {isAdmin && (
            <div className="mt-4">
              <ReviewQueuePanel />
            </div>
          )}
        </div>


        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card className="border-border/60 bg-card/70 p-4 backdrop-blur lg:col-span-2">
            <Tabs defaultValue="attention">
              <TabsList>
                <TabsTrigger value="attention">Attention</TabsTrigger>
                <TabsTrigger value="loss">Learning curve</TabsTrigger>
                <TabsTrigger value="weights">Weight fingerprint</TabsTrigger>
              </TabsList>

              <TabsContent value="attention" className="pt-4">
                <AttentionMaps
                  attention={telemetry?.attention ?? []}
                  headEntropy={telemetry?.headEntropy ?? []}
                  nHeads={cfg?.nHeads ?? 4}
                />
                <p className="mt-3 text-xs text-muted-foreground">
                  Causal attention averaged across heads. Lower entropy = the block has locked onto a specific temporal pattern in field activity.
                </p>
              </TabsContent>

              <TabsContent value="loss" className="pt-4">
                <LossSparkline history={telemetry?.lossHistory ?? []} />
                <div className="mt-2 flex justify-between font-mono text-xs text-muted-foreground">
                  <span>cross-entropy (EMA)</span>
                  <span>{(telemetry?.loss ?? 0).toFixed(4)}</span>
                </div>
              </TabsContent>

              <TabsContent value="weights" className="space-y-2 pt-4">
                {(telemetry?.weightNorms ?? []).map((n, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">Block {i + 1}</span>
                    <div className="grid flex-1 grid-cols-5 gap-1.5">
                      {(["q", "k", "v", "o", "ff"] as const).map((key) => (
                        <div key={key} className="space-y-1">
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, n[key] * 1600)}%` }} />
                          </div>
                          <div className="text-center text-[10px] uppercase text-muted-foreground">{key}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {!telemetry && <p className="text-sm text-muted-foreground">Initialising weights…</p>}
              </TabsContent>
            </Tabs>
          </Card>

          <div className="space-y-4">
            <Card className="border-border/60 bg-card/70 p-4 backdrop-blur">
              <div className="mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Next-event prediction</h3>
              </div>
              <div className="space-y-2">
                {predictions.length === 0 && <p className="text-sm text-muted-foreground">Warming up…</p>}
                {predictions.map((p) => (
                  <div key={p.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-mono text-foreground">{p.label}</span>
                      <span className="tabular-nums text-muted-foreground">{(p.p * 100).toFixed(1)}%</span>
                    </div>
                    <Progress value={p.p * 100} className="h-1.5" />
                  </div>
                ))}
              </div>
            </Card>

            <Card className="border-border/60 bg-card/70 p-4 backdrop-blur">
              <h3 className="mb-3 text-sm font-semibold">Training corpus mix</h3>
              <div className="space-y-2">
                {Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                  <div key={k} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span>{k}</span>
                      <span className="font-mono tabular-nums text-muted-foreground">{fmt(v)}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-primary/70" style={{ width: `${(v / maxSource) * 100}%` }} />
                    </div>
                  </div>
                ))}
                {!Object.keys(sourceCounts).length && <p className="text-sm text-muted-foreground">Reading activity…</p>}
              </div>
            </Card>

            <Card className="border-border/60 bg-card/70 p-4 backdrop-blur">
              <h3 className="mb-3 text-sm font-semibold">Live token feed</h3>
              <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
                {feed.slice(0, 25).map((e, i) => (
                  <div key={`${e.at}-${i}`} className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 px-2 py-1 text-xs">
                    <span className="truncate">{e.source}{e.kind ? ` · ${e.kind}` : ""}</span>
                    <span className="ml-2 shrink-0 font-mono text-[10px] text-muted-foreground">
                      {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
                {!feed.length && <p className="text-sm text-muted-foreground">No events yet.</p>}
              </div>
            </Card>
          </div>
        </div>

        {/* Divergence guardrail */}
        {alert && (
          <div className="mt-4">
            <DivergenceAlert
              alert={alert}
              onDismiss={dismissAlert}
              onResume={() => { dismissAlert(); toggle(); }}
              canRollback={bestCheckpoints.length > 0}
              onRollback={() => { rollbackTo(bestCheckpoints[0].id); dismissAlert(); }}
            />
          </div>
        )}

        {/* Training telemetry dashboard */}
        <div className="mt-4">
          <TrainingMetricsDashboard metrics={telemetry?.metrics ?? []} running={running} />
        </div>

        {/* Control, sources, inference and checkpoints */}
        <div className={`mt-4 grid gap-4 ${canTrain ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
          {canTrain && (
            <TrainingControlPanel
              telemetry={telemetry}
              budget={budget}
              exportCheckpoint={exportCheckpoint}
              importCheckpoint={importCheckpoint}
              applyConfig={applyConfig}
            />
          )}
          <DataSourcePanel
            allSources={allSources}
            enabledSources={enabledSources}
            toggleSource={toggleSource}
            setAllSources={setAllSources}
            sourceCounts={sourceCounts}
            running={running}
            onToggleRunning={toggle}
            corpusReady={corpusReady}
          />
          <AskModelPanel askModel={askModel} vocab={vocab} />
        </div>

        {canTrain && (
          <div className="mt-4">
            <ValidationPanel
              evaluation={evaluation}
              evalSeries={evalSeries}
              evalEnabled={evalEnabled}
              trainTokens={trainTokens}
              valTokens={valTokens}
              setEvalEnabled={setEvalEnabled}
              runEvaluation={runEvaluation}
              guardEnabled={guardEnabled}
              setGuardEnabled={setGuardEnabled}
              bestCheckpoints={bestCheckpoints}
              autoSave={autoSave}
              setAutoSave={setAutoSave}
              bestMetric={bestMetric}
              setBestMetric={setBestMetric}
              autoSaving={autoSaving}
              rollbackTo={rollbackTo}
              downloadBestCheckpoint={downloadBestCheckpoint}
              clearBestCheckpoints={clearBestCheckpoints}
            />
          </div>
        )}

        {canTrain && (
          <div className="mt-4">
            <CheckpointsPanel
              checkpoints={checkpoints}
              downloadSavedCheckpoint={downloadSavedCheckpoint}
              inspectCheckpoint={inspectCheckpoint}
              importCheckpoint={importCheckpoint}
            />
          </div>
        )}
      </div>

      {isOwner && <AiAccessManager open={accessOpen} onOpenChange={setAccessOpen} />}
    </div>
  );
}

/**
 * Access gate — Amehnities AI is Owner-only, plus any admin the Owner has
 * explicitly granted (page_id "amehnities-ai" in admin_page_access). The heavy
 * training workspace never mounts for anyone who is not entitled.
 */
export default function AmehnitiesAI() {
  const navigate = useNavigate();
  const { canAccessPage, loadingAccess } = usePageAccess();

  if (loadingAccess) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
          Checking your access…
        </div>
      </div>
    );
  }

  if (!canAccessPage("amehnities-ai")) {
    return (
      <div className="grid min-h-[100dvh] place-items-center bg-background px-4">
        <Card className="w-full max-w-md border-border/60 bg-card/70 p-6 text-center backdrop-blur">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl border border-primary/30 bg-primary/10">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Amehnities AI is restricted</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            This workspace is reserved for the Owner. Ask the Owner to grant you access from
            Amehnities AI → Manage access.
          </p>
          <Button className="mt-5 gap-1.5" variant="outline" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4" /> Back to app
          </Button>
        </Card>
      </div>
    );
  }

  return <AmehnitiesAIWorkspace />;
}
