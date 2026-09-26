export type CellKind = "reconstruction" | "missing" | "unreadable" | "category";
export interface ScoredCell {
  col: string; kind: CellKind; severity: "critical" | "high" | "warning";
  score: number; original: any; suggested: any; message: string;
}
export interface ScoredRow { rowScore: number; rowQ95: number; rowQ995: number; cells: ScoredCell[] }
export interface BrainStats {
  mda: string; steps: number; corpusRows: number; bootstrapRows: number; trainRows: number; valRows: number;
  trainLoss: number; valLoss: number; bestVal: number; aeLoss: number; tfLoss: number;
  lr: number; weightDecay: number; noise: number; dropout: number; overfitEvents: number;
  lastCheckpointAt: number; lossHistory: { t: number; train: number; val: number }[]; log: string[];
  sources: { name: string; rows: number; at: string }[];
  state: "cold" | "learning" | "consolidating" | "overfit-guard" | "paused";
  ready: boolean; running: boolean; distrustedRows: number; columns: number;
}
