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
  weights: { dtype: "float32"; length: number; base64: string };
  optimizer: null | { dtype: "float32"; m: string; v: string };
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
