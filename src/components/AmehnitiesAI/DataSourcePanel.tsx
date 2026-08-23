/**
 * Data-source toggles — choose exactly which Amehnities activity streams feed
 * the Transformer. Turning a source off rebuilds the training corpus without
 * that stream and stops its realtime events from being tokenised.
 */
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Database, Play, Pause } from "lucide-react";

export default function DataSourcePanel({
  allSources, enabledSources, toggleSource, setAllSources, sourceCounts, running, onToggleRunning, corpusReady,
}: {
  allSources: string[];
  enabledSources: string[];
  toggleSource: (label: string) => void;
  setAllSources: (on: boolean) => void;
  sourceCounts: Record<string, number>;
  running: boolean;
  onToggleRunning: () => void;
  corpusReady: boolean;
}) {
  const max = Math.max(1, ...Object.values(sourceCounts));

  return (
    <Card className="border-border/60 bg-card/70 p-4 backdrop-blur">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Database className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Training data sources</h3>
        <Badge variant="secondary" className="ml-auto">{enabledSources.length}/{allSources.length} on</Badge>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setAllSources(true)}>Enable all</Button>
        <Button size="sm" variant="outline" onClick={() => setAllSources(false)}>Disable all</Button>
        <Button size="sm" variant={running ? "secondary" : "default"} onClick={onToggleRunning} className="ml-auto gap-1.5">
          {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {running ? "Pause training" : "Resume training"}
        </Button>
      </div>

      <div className="space-y-2.5">
        {allSources.map((label) => {
          const on = enabledSources.includes(label);
          const count = sourceCounts[label] || 0;
          const id = `src-${label.replace(/\W+/g, "-")}`;
          return (
            <div key={label} className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
              <div className="flex items-center gap-3">
                <Switch id={id} checked={on} onCheckedChange={() => toggleSource(label)} />
                <Label htmlFor={id} className="flex-1 cursor-pointer text-xs font-medium">{label}</Label>
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{count.toLocaleString()}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={`h-full rounded-full transition-all ${on ? "bg-primary/70" : "bg-muted-foreground/30"}`}
                  style={{ width: `${(count / max) * 100}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
        {corpusReady ? "Corpus rebuilt from the enabled streams." : "Rebuilding the corpus…"} Disabled streams are also ignored by the live realtime feed.
      </p>
    </Card>
  );
}
