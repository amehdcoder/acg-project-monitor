/**
 * Training dataset import — upload or paste supervised examples and run a
 * live fine-tuning pass that updates the persisted model in realtime.
 */
import { useMemo, useRef, useState } from "react";
import { Database, Upload, Play, Loader2, FileText, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { parseDataset, describeDataset, type ParsedDataset } from "@/lib/amehnitiesAi/trainingDataset";
import type { DatasetRun } from "@/hooks/useAmehnitiesBrain";

const PLACEHOLDER = `Paste examples in any of these shapes:

{"prompt": "What is MDA coverage?", "completion": "The share of the eligible population that swallowed the medicine."}
{"instruction": "Define geographic coverage", "output": "The proportion of targeted communities reached."}

…or CSV with a prompt,completion header, "Q: … / A: …" transcripts, or plain prose.`;

export default function DatasetImportPanel({
  trainOnDataset, datasetTraining, datasetRuns,
}: {
  trainOnDataset: (parsed: ParsedDataset, opts?: { epochs?: number }) => Promise<DatasetRun>;
  datasetTraining: boolean;
  datasetRuns: DatasetRun[];
}) {
  const [text, setText] = useState("");
  const [name, setName] = useState("Pasted examples");
  const [epochs, setEpochs] = useState(3);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo<ParsedDataset | null>(
    () => (text.trim() ? parseDataset(text, name) : null),
    [text, name],
  );

  const pickFile = async (f?: File | null) => {
    if (!f) return;
    try {
      const content = await f.text();
      setText(content);
      setName(f.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Uploaded dataset");
      toast.success("Dataset loaded", { description: `${f.name} · ${(f.size / 1024).toFixed(1)} KB` });
    } catch {
      toast.error("Could not read that file");
    } finally { if (fileRef.current) fileRef.current.value = ""; }
  };

  const run = async () => {
    if (!parsed) return;
    try {
      const res = await trainOnDataset(parsed, { epochs });
      toast.success("Training run complete", {
        description: `${res.examples} examples × ${res.epochs} epochs · steps ${res.startStep.toLocaleString()} → ${res.endStep.toLocaleString()} · loss ${res.loss.toFixed(4)} · saved as a new version`,
      });
    } catch (e: any) {
      toast.error("Training run failed", { description: e?.message });
    }
  };

  return (
    <Card className="border-border/60 bg-card/70 p-4 backdrop-blur">
      <div className="mb-3 flex items-center gap-2">
        <Database className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Training dataset</h3>
        {parsed && (
          <Badge variant="outline" className="ml-auto border-emerald-500/50 text-emerald-600 dark:text-emerald-400">
            {parsed.examples.length} example{parsed.examples.length === 1 ? "" : "s"}
          </Badge>
        )}
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={PLACEHOLDER}
        className="min-h-[140px] font-mono text-[11px] leading-relaxed"
      />

      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-[11px]" onClick={() => fileRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" /> Upload file
        </Button>
        <input ref={fileRef} type="file" accept=".txt,.json,.jsonl,.csv,.tsv,.md,text/*"
          className="hidden" onChange={(e) => void pickFile(e.target.files?.[0])} />
        {parsed && (
          <span className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            <FileText className="h-3 w-3 shrink-0" /> {describeDataset(parsed)}
          </span>
        )}
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label className="text-xs font-medium">Epochs</Label>
          <span className="font-mono text-xs tabular-nums text-primary">{epochs}</span>
        </div>
        <Slider value={[epochs]} min={1} max={12} step={1} onValueChange={(v) => setEpochs(v[0])} />
        <p className="text-[11px] leading-snug text-muted-foreground">
          Examples are shuffled per epoch and packed with role-boundary tokens
          (<span className="font-mono">{"<|user|>"}</span> / <span className="font-mono">{"<|assistant|>"}</span> /
          <span className="font-mono">{"<|eot|>"}</span>), deduplicated and length-capped — standard small-language-model
          instruction-tuning practice. Keep epochs low on small sets to avoid memorisation.
        </p>
      </div>

      <Button className="mt-3 w-full gap-1.5" size="sm"
        disabled={!parsed?.examples.length || datasetTraining} onClick={run}>
        {datasetTraining ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
        {datasetTraining ? "Training on your examples…" : "Train now & save"}
      </Button>
      <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
        The run streams into the live network, persists the improved model to this device, indexes the examples into
        the chat knowledge base, and cuts a rollback version automatically.
      </p>

      {datasetRuns.length > 0 && (
        <div className="mt-3 border-t border-border/60 pt-3">
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Recent runs</h4>
          <div className="space-y-1">
            {datasetRuns.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                <span className="truncate">
                  {r.name} · {r.examples}×{r.epochs} · {r.tokens.toLocaleString()} tokens · loss {r.loss.toFixed(4)}
                  {" · "}{new Date(r.at).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
