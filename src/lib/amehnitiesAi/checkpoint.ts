/**
 * Amehnities AI — checkpoint serialisation.
 *
 * A checkpoint is a single self-describing JSON document (`.amz.json`) holding
 * the model config, the full training state (step, tokens seen, loss history,
 * vocabulary) and the raw Float32 weights (plus optional Adam moments) encoded
 * as base64 so the file stays portable and re-importable.
 */

export interface CheckpointCfg {
  dModel: number; nHeads: number; nLayers: number; dFF: number;
  ctx: number; vocab: number; lr: number; batch: number;
}

export interface CheckpointFile {
  format: "amehnities-ai-checkpoint";
  version: number;
  createdAt: string;
  model: CheckpointCfg;
  training: {
    step: number;
    tokensSeen: number;
    loss: number;
    perplexity: number;
    lossHistory: number[];
    streamSize: number;
    paramCount: number;
  };
  vocabulary: string[];
  /** Per-tensor sizes, in parameter order — used to validate architecture match. */
  shapes?: { size: number }[];
  weights: { dtype: "float32"; length: number; base64: string };
  optimizer: null | { dtype: "float32"; m: string; v: string };
}

export const CHECKPOINT_FORMAT = "amehnities-ai-checkpoint";
export const SUPPORTED_VERSIONS = [1];

export interface CheckpointIssue {
  level: "error" | "warning";
  title: string;
  detail: string;
}

/**
 * Deep validation of a parsed checkpoint against the currently running model:
 * format, version, architecture and tensor shapes.
 */
export function validateCheckpoint(file: CheckpointFile, current?: CheckpointCfg | null): CheckpointIssue[] {
  const issues: CheckpointIssue[] = [];
  if (file?.format !== CHECKPOINT_FORMAT) {
    issues.push({ level: "error", title: "Unrecognised file", detail: `Expected format "${CHECKPOINT_FORMAT}", found "${String(file?.format ?? "none")}".` });
    return issues;
  }
  if (!SUPPORTED_VERSIONS.includes(file.version)) {
    issues.push({ level: "error", title: "Unsupported version", detail: `Checkpoint version ${file.version} — this build reads version ${SUPPORTED_VERSIONS.join(", ")}.` });
  }
  const m = file.model;
  const required: (keyof CheckpointCfg)[] = ["dModel", "nHeads", "nLayers", "dFF", "ctx", "vocab"];
  const missing = required.filter((k) => !Number.isFinite(m?.[k] as number));
  if (missing.length) {
    issues.push({ level: "error", title: "Incomplete architecture", detail: `Missing model fields: ${missing.join(", ")}.` });
    return issues;
  }
  if (m.dModel % m.nHeads !== 0) {
    issues.push({ level: "error", title: "Invalid head split", detail: `dModel ${m.dModel} is not divisible by ${m.nHeads} heads.` });
  }
  const declared = file.weights?.length ?? 0;
  if (!declared) issues.push({ level: "error", title: "No weights", detail: "The checkpoint contains no weight tensor." });
  const expected = expectedParamCount(m);
  if (declared && declared !== expected) {
    issues.push({ level: "error", title: "Tensor shape mismatch", detail: `Weights hold ${declared.toLocaleString()} values but this architecture needs ${expected.toLocaleString()}.` });
  }
  if (file.shapes?.length) {
    const sum = file.shapes.reduce((a, s) => a + (s?.size || 0), 0);
    if (sum !== declared) {
      issues.push({ level: "error", title: "Corrupt tensor map", detail: `Declared tensor sizes total ${sum.toLocaleString()}, weights hold ${declared.toLocaleString()}.` });
    }
  }
  if (current) {
    const diffs = required.filter((k) => current[k] !== m[k]).map((k) => `${k}: ${current[k]} → ${m[k]}`);
    if (diffs.length) {
      issues.push({ level: "warning", title: "Architecture differs from the running model", detail: `Loading will rebuild the network (${diffs.join(", ")}).` });
    }
  }
  if (file.optimizer && (!file.optimizer.m || !file.optimizer.v)) {
    issues.push({ level: "warning", title: "Partial optimiser state", detail: "Adam moments are incomplete and will be re-initialised." });
  }
  return issues;
}

/** Parameter count implied by a config — mirrors the worker's tensor layout. */
export function expectedParamCount(c: CheckpointCfg): number {
  const { dModel: D, dFF: F, nLayers: L, ctx, vocab: V } = c;
  const perLayer = 4 * (D * D + D) /* q,k,v,o */ + (D * F + F) + (F * D + D) /* ffn */ + 4 * D /* two layernorms */;
  return V * D /* emb */ + ctx * D /* pos */ + L * perLayer + 2 * D /* final ln */ + D * V + V /* head */;
}

export function f32ToBase64(arr: Float32Array): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function base64ToF32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

/** Build the downloadable checkpoint document from a worker checkpoint payload. */
export function buildCheckpointFile(payload: any, vocabulary: string[]): CheckpointFile {
  const weights: Float32Array = payload.weights;
  return {
    format: "amehnities-ai-checkpoint",
    version: payload.version ?? 1,
    createdAt: payload.createdAt ?? new Date().toISOString(),
    model: payload.cfg,
    training: {
      step: payload.step ?? 0,
      tokensSeen: payload.tokensSeen ?? 0,
      loss: payload.lossEMA ?? 0,
      perplexity: Math.exp(Math.min(payload.lossEMA ?? 0, 20)),
      lossHistory: payload.lossHistory ?? [],
      streamSize: payload.streamSize ?? 0,
      paramCount: payload.paramCount ?? weights.length,
    },
    vocabulary,
    weights: { dtype: "float32", length: weights.length, base64: f32ToBase64(weights) },
    optimizer: payload.optimizer
      ? { dtype: "float32", m: f32ToBase64(payload.optimizer.m), v: f32ToBase64(payload.optimizer.v) }
      : null,
  };
}

export function checkpointFilename(file: CheckpointFile) {
  const stamp = file.createdAt.replace(/[:.]/g, "-").slice(0, 19);
  return `amehnities-ai_step-${file.training.step}_${stamp}.amz.json`;
}

export function downloadCheckpoint(file: CheckpointFile) {
  const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = checkpointFilename(file);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return blob.size;
}

/** Convert an in-memory checkpoint document into a worker-loadable payload. */
export function toWorkerCheckpoint(file: CheckpointFile) {
  if (!file?.weights?.base64) throw new Error("Checkpoint has no weights");
  const weights = base64ToF32(file.weights.base64);
  return {
    cfg: file.model,
    step: file.training.step,
    tokensSeen: file.training.tokensSeen,
    lossEMA: file.training.loss,
    lossHistory: file.training.lossHistory,
    weights,
    optimizer: file.optimizer
      ? { m: base64ToF32(file.optimizer.m), v: base64ToF32(file.optimizer.v) }
      : null,
  };
}

/** Parse a checkpoint document back into a worker-loadable payload. */
export function parseCheckpointFile(text: string) {
  const file = JSON.parse(text) as CheckpointFile;
  if (file?.format !== "amehnities-ai-checkpoint") throw new Error("Not an Amehnities AI checkpoint file");
  if (!file.weights?.base64) throw new Error("Checkpoint has no weights");
  const weights = base64ToF32(file.weights.base64);
  if (weights.length !== file.weights.length) throw new Error("Checkpoint weights are corrupted");
  return {
    file,
    ckpt: {
      cfg: file.model,
      step: file.training.step,
      tokensSeen: file.training.tokensSeen,
      lossEMA: file.training.loss,
      lossHistory: file.training.lossHistory,
      weights,
      optimizer: file.optimizer
        ? { m: base64ToF32(file.optimizer.m), v: base64ToF32(file.optimizer.v) }
        : null,
    },
  };
}
