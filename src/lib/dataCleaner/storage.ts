// NTD Treatment Data Cleaner — persistent cleaning history, audit trail,
// user feedback and the learning model (per-area performance weights).
import { FeedbackArea, MdaTypeId } from "./schemas";

const HISTORY_KEY = "ntd_cleaner_history_v1";
const AUDIT_KEY = "ntd_cleaner_audit_v1";
const FEEDBACK_KEY = "ntd_cleaner_feedback_v1";
const WEIGHTS_KEY = "ntd_cleaner_weights_v1";

export interface CleaningSession {
  id: string;
  batchId: string;
  mdaType: MdaTypeId;
  fileName: string;
  date: string;
  totalRows: number;
  validRows: number;
  autoCorrections: number;
  criticalIssues: number;
  dataQualityScore: number;
  reviewer: string;
  concluded: boolean;
  selfRating?: number;
}

export interface AuditEntry {
  id: string;
  batchId: string;
  date: string;
  rowRef: string;
  field: string;
  oldValue: string;
  newValue: string;
  rule: string;
  user: string;
}

export interface FeedbackEntry {
  id: string;
  batchId: string;
  date: string;
  mdaType: MdaTypeId;
  reviewer: string;
  overallScore: number; // 0-100
  disaggregation: Partial<Record<FeedbackArea, number>>; // % allocation
  comment: string;
}

function read<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}
function write<T>(key: string, val: T[]) {
  localStorage.setItem(key, JSON.stringify(val));
}

export const getSessions = () => read<CleaningSession>(HISTORY_KEY);
export function saveSession(s: CleaningSession) {
  const all = getSessions().filter((x) => x.id !== s.id);
  all.unshift(s);
  write(HISTORY_KEY, all.slice(0, 200));
}

export const getAudit = () => read<AuditEntry>(AUDIT_KEY);
export function appendAudit(entries: AuditEntry[]) {
  const all = [...entries, ...getAudit()];
  write(AUDIT_KEY, all.slice(0, 5000));
}

export const getFeedback = () => read<FeedbackEntry>(FEEDBACK_KEY);
export function saveFeedback(f: FeedbackEntry) {
  const all = getFeedback();
  all.unshift(f);
  write(FEEDBACK_KEY, all.slice(0, 500));
  updateWeights(f);
}

// Learning model: each feedback area holds a confidence weight in 0..1.
// Higher weight => the system trusts its automated cleaning more in that area.
export type Weights = Record<string, number>;
const DEFAULT_WEIGHT = 0.75;

export function getWeights(): Weights {
  try {
    return JSON.parse(localStorage.getItem(WEIGHTS_KEY) || "{}");
  } catch {
    return {};
  }
}

// Each new feedback nudges the area weight toward the user-perceived score,
// scaled by how strongly the user disaggregated the score to that area.
function updateWeights(f: FeedbackEntry) {
  const w = getWeights();
  const lr = 0.2; // learning rate
  const overall = f.overallScore / 100;
  for (const [area, pct] of Object.entries(f.disaggregation)) {
    const influence = Math.min(1, (pct ?? 0) / 100 + 0.2);
    const cur = w[area] ?? DEFAULT_WEIGHT;
    w[area] = +(cur + lr * influence * (overall - cur)).toFixed(4);
  }
  localStorage.setItem(WEIGHTS_KEY, JSON.stringify(w));
}

// Aggregate learning summary for the System Performance view.
export function learningSummary() {
  const fb = getFeedback();
  const w = getWeights();
  const avg = fb.length ? fb.reduce((a, b) => a + b.overallScore, 0) / fb.length : 0;
  // trend over last 8 ratings
  const trend = fb.slice(0, 8).reverse().map((f) => ({ date: f.date.slice(0, 10), score: f.overallScore }));
  return { count: fb.length, avgScore: +avg.toFixed(1), weights: w, trend };
}
