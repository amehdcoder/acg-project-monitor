// Learned lesion staging.
//
// The rule-based grader in `lesionVision.ts` is the safety net. This file adds
// a model that *learns the stage from real cases*: every time a clinician
// confirms the stage of an assessment, that photograph's measurements, ticked
// signs and image features become one labelled training example. The examples
// train a small multinomial logistic-regression (softmax) classifier per
// project and per condition.
//
// Everything trains and runs in the browser on the device — the stored model is
// just a short list of numbers (means, scales and weights), so it syncs in a
// few kilobytes and works offline once fetched. No photographs ever leave the
// project's own storage for training; only the numeric features do.
//
// The learned stage is decision support for a trained clinician, never a
// diagnosis, and the rule-based stage is always shown beside it.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CLINICAL_CRITERIA, MEASUREMENT_FIELDS, stageLabelFor,
  type LesionCondition, type LesionMetrics,
} from "./lesionVision";

const db = supabase as unknown as { from: (t: string) => any };

/** Minimum confirmed cases before the learned stage is offered at all. */
export const MIN_TRAINING_CASES = 12;
/** Minimum confirmed cases per stage for that stage to be learnable. */
const MIN_PER_CLASS = 2;

export interface LesionFeatureInput {
  criteria: Record<string, boolean>;
  measures: Record<string, number | null>;
  metrics: LesionMetrics | null;
}

/** Feature names for a condition — stable order, stored with the model. */
export const featureNames = (condition: LesionCondition): string[] => [
  ...CLINICAL_CRITERIA[condition].map((c) => `sign:${c.key}`),
  ...MEASUREMENT_FIELDS[condition].map((m) => `measure:${m.key}`),
  "img:area_fraction",
  "img:width_fraction",
  "img:redness",
  "img:edge",
  "img:quality",
  "img:area_cm2",
  "img:longest_cm",
  "img:present",
];

const nz = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Turns one assessment's evidence into the numeric vector the model reads. */
export const buildFeatures = (
  condition: LesionCondition,
  input: LesionFeatureInput,
): number[] => {
  const m = input.metrics;
  return [
    ...CLINICAL_CRITERIA[condition].map((c) => (input.criteria?.[c.key] ? 1 : 0)),
    ...MEASUREMENT_FIELDS[condition].map((f) => nz(input.measures?.[f.key])),
    nz(m?.areaFraction),
    nz(m?.widthFraction),
    nz(m?.rednessIndex),
    nz(m?.edgeIrregularity),
    nz(m?.segmentationQuality),
    m?.areaMm2 != null ? m.areaMm2 / 100 : 0,
    m?.longestMm != null ? m.longestMm / 10 : 0,
    m ? 1 : 0,
  ];
};

/**
 * Rebuilds a feature vector from a stored assessment row, so historical
 * records recorded before this model existed still train it.
 */
export const featuresFromRow = (
  condition: LesionCondition,
  row: Record<string, unknown>,
): number[] => {
  const stored = row.features;
  if (Array.isArray(stored) && stored.length === featureNames(condition).length) {
    return stored.map((v) => nz(v));
  }
  const analysis = (row.analysis || {}) as Record<string, unknown>;
  const criteria = (analysis.criteria || {}) as Record<string, boolean>;
  const measures = (analysis.measures || {}) as Record<string, number | null>;
  const hasImage = row.area_fraction != null || row.image_path != null;
  const metrics = hasImage
    ? ({
      areaFraction: nz(row.area_fraction),
      widthFraction: nz(row.width_fraction),
      rednessIndex: nz(row.redness_index),
      edgeIrregularity: nz(analysis.edgeIrregularity),
      segmentationQuality: nz(analysis.segmentationQuality),
      areaMm2: row.area_mm2 != null ? nz(row.area_mm2) : null,
      longestMm: analysis.longestMm != null ? nz(analysis.longestMm) : null,
    } as unknown as LesionMetrics)
    : null;
  return buildFeatures(condition, { criteria, measures, metrics });
};

/* ------------------------------------------------------------------ */
/* The model                                                           */
/* ------------------------------------------------------------------ */

export interface LesionStageModel {
  condition: LesionCondition;
  /** Stages the model can predict, ascending. */
  classes: number[];
  features: string[];
  /** One weight row per class; last entry of each row is the bias. */
  weights: number[][];
  means: number[];
  scales: number[];
  samples: number;
  /** Hold-one-out accuracy on the confirmed cases, 0–1. */
  accuracy: number;
  trainedAt: string;
}

export interface TrainingSample {
  features: number[];
  stage: number;
}

const softmax = (scores: number[]) => {
  const max = Math.max(...scores);
  const exp = scores.map((s) => Math.exp(s - max));
  const sum = exp.reduce((a, b) => a + b, 0) || 1;
  return exp.map((e) => e / sum);
};

const standardise = (rows: number[][]) => {
  const n = rows.length;
  const d = rows[0]?.length || 0;
  const means = new Array(d).fill(0);
  const scales = new Array(d).fill(1);
  for (let j = 0; j < d; j += 1) {
    let sum = 0;
    for (let i = 0; i < n; i += 1) sum += rows[i][j];
    const mean = sum / n;
    let variance = 0;
    for (let i = 0; i < n; i += 1) variance += (rows[i][j] - mean) ** 2;
    means[j] = mean;
    scales[j] = Math.sqrt(variance / Math.max(1, n - 1)) || 1;
  }
  return { means, scales };
};

const applyScale = (x: number[], means: number[], scales: number[]) =>
  x.map((v, j) => (v - means[j]) / (scales[j] || 1));

const fitSoftmax = (
  rows: number[][], labels: number[], classCount: number,
  { epochs = 400, lr = 0.35, l2 = 0.01 } = {},
) => {
  const d = rows[0].length;
  const weights: number[][] = Array.from({ length: classCount }, () => new Array(d + 1).fill(0));
  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const grads: number[][] = Array.from({ length: classCount }, () => new Array(d + 1).fill(0));
    for (let i = 0; i < rows.length; i += 1) {
      const x = rows[i];
      const scores = weights.map((w) => {
        let s = w[d];
        for (let j = 0; j < d; j += 1) s += w[j] * x[j];
        return s;
      });
      const probs = softmax(scores);
      for (let k = 0; k < classCount; k += 1) {
        const err = probs[k] - (labels[i] === k ? 1 : 0);
        for (let j = 0; j < d; j += 1) grads[k][j] += err * x[j];
        grads[k][d] += err;
      }
    }
    const step = lr / rows.length;
    for (let k = 0; k < classCount; k += 1) {
      for (let j = 0; j < d; j += 1) {
        weights[k][j] -= step * (grads[k][j] + l2 * weights[k][j]);
      }
      weights[k][d] -= step * grads[k][d];
    }
  }
  return weights;
};

const predictIndex = (weights: number[][], x: number[]) => {
  const d = x.length;
  const scores = weights.map((w) => {
    let s = w[d];
    for (let j = 0; j < d; j += 1) s += w[j] * x[j];
    return s;
  });
  return softmax(scores);
};

/**
 * Trains the classifier on confirmed cases. Returns null when there are not
 * enough confirmed cases yet — the rules keep running until then.
 */
export const trainLesionModel = (
  condition: LesionCondition,
  samples: TrainingSample[],
): LesionStageModel | null => {
  const counts = new Map<number, number>();
  samples.forEach((s) => counts.set(s.stage, (counts.get(s.stage) || 0) + 1));
  const classes = [...counts.entries()]
    .filter(([, c]) => c >= MIN_PER_CLASS)
    .map(([stage]) => stage)
    .sort((a, b) => a - b);

  const usable = samples.filter((s) => classes.includes(s.stage));
  if (classes.length < 2 || usable.length < MIN_TRAINING_CASES) return null;

  const raw = usable.map((s) => s.features);
  const { means, scales } = standardise(raw);
  const rows = raw.map((x) => applyScale(x, means, scales));
  const labels = usable.map((s) => classes.indexOf(s.stage));
  const weights = fitSoftmax(rows, labels, classes.length);

  // Hold-one-out accuracy: honest enough on the small registers field teams
  // build up, and cheap at this size.
  let correct = 0;
  for (let i = 0; i < rows.length; i += 1) {
    const trainRows = rows.filter((_, j) => j !== i);
    const trainLabels = labels.filter((_, j) => j !== i);
    if (new Set(trainLabels).size < 2) { correct += 1; continue; }
    const w = fitSoftmax(trainRows, trainLabels, classes.length, { epochs: 160 });
    const p = predictIndex(w, rows[i]);
    const best = p.indexOf(Math.max(...p));
    if (best === labels[i]) correct += 1;
  }

  return {
    condition,
    classes,
    features: featureNames(condition),
    weights,
    means,
    scales,
    samples: usable.length,
    accuracy: +(correct / rows.length).toFixed(3),
    trainedAt: new Date().toISOString(),
  };
};

export interface LesionPrediction {
  stage: number;
  label: string;
  confidence: number;
  /** Probability for every stage the model knows, highest first. */
  ranked: { stage: number; label: string; probability: number }[];
}

export const predictStage = (
  model: LesionStageModel,
  features: number[],
): LesionPrediction | null => {
  if (features.length !== model.means.length) return null;
  const x = applyScale(features, model.means, model.scales);
  const probs = predictIndex(model.weights, x);
  const ranked = model.classes
    .map((stage, i) => ({
      stage,
      label: stageLabelFor(model.condition, stage),
      probability: probs[i],
    }))
    .sort((a, b) => b.probability - a.probability);
  return {
    stage: ranked[0].stage,
    label: ranked[0].label,
    confidence: ranked[0].probability,
    ranked,
  };
};

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

const toModel = (row: Record<string, unknown>): LesionStageModel => ({
  condition: String(row.condition) as LesionCondition,
  classes: (row.classes as number[]) || [],
  features: (row.features as string[]) || [],
  weights: (row.weights as number[][]) || [],
  means: (row.means as number[]) || [],
  scales: (row.scales as number[]) || [],
  samples: Number(row.samples || 0),
  accuracy: Number(row.accuracy || 0),
  trainedAt: String(row.trained_at || ""),
});

export const fetchLesionModel = async (
  projectId: string, condition: LesionCondition,
): Promise<LesionStageModel | null> => {
  const { data } = await db.from("lesion_stage_models")
    .select("*").eq("project_id", projectId).eq("condition", condition).maybeSingle();
  return data ? toModel(data as Record<string, unknown>) : null;
};

export const saveLesionModel = async (projectId: string, model: LesionStageModel) => {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await db.from("lesion_stage_models").upsert({
    project_id: projectId,
    condition: model.condition,
    classes: model.classes,
    features: model.features,
    weights: model.weights,
    means: model.means,
    scales: model.scales,
    samples: model.samples,
    accuracy: model.accuracy,
    trained_by: auth.user?.id ?? null,
    trained_at: model.trainedAt,
  }, { onConflict: "project_id,condition" });
  if (error) throw error;
};

/** Confirmed cases for a project and condition, ready for training. */
export const fetchTrainingSamples = async (
  projectId: string, condition: LesionCondition,
): Promise<TrainingSample[]> => {
  const { data } = await db.from("beneficiary_lesion_assessments")
    .select("confirmed_stage,features,analysis,area_fraction,area_mm2,width_fraction,redness_index,image_path")
    .eq("project_id", projectId)
    .eq("condition", condition)
    .not("confirmed_stage", "is", null)
    .limit(2000);
  return ((data as Record<string, unknown>[]) || []).map((row) => ({
    features: featuresFromRow(condition, row),
    stage: Number(row.confirmed_stage),
  }));
};

/** A clinician confirms (or corrects) the stage — this is the training label. */
export const confirmAssessmentStage = async (
  assessmentId: string, condition: LesionCondition, stage: number,
) => {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await db.from("beneficiary_lesion_assessments").update({
    confirmed_stage: stage,
    confirmed_stage_label: stageLabelFor(condition, stage),
    confirmed_by: auth.user?.id ?? null,
    confirmed_at: new Date().toISOString(),
  }).eq("id", assessmentId);
  if (error) throw error;
};

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export interface LesionModelState {
  model: LesionStageModel | null;
  confirmedCount: number;
  loading: boolean;
  training: boolean;
  /** Retrains from every confirmed case and stores the result. */
  retrain: () => Promise<{ trained: boolean; message: string }>;
  reload: () => Promise<void>;
}

export const useLesionStageModel = (
  projectId: string, condition: LesionCondition,
): LesionModelState => {
  const [model, setModel] = useState<LesionStageModel | null>(null);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [training, setTraining] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const [stored, { count }] = await Promise.all([
      fetchLesionModel(projectId, condition),
      db.from("beneficiary_lesion_assessments")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("condition", condition)
        .not("confirmed_stage", "is", null),
    ]);
    setModel(stored && stored.features.length === featureNames(condition).length ? stored : null);
    setConfirmedCount(Number(count || 0));
    setLoading(false);
  }, [projectId, condition]);

  useEffect(() => { void reload(); }, [reload]);

  const retrain = useCallback(async () => {
    setTraining(true);
    try {
      const samples = await fetchTrainingSamples(projectId, condition);
      const next = trainLesionModel(condition, samples);
      if (!next) {
        setConfirmedCount(samples.length);
        return {
          trained: false,
          message: `${samples.length} confirmed case${samples.length === 1 ? "" : "s"} so far — the model needs at least ${MIN_TRAINING_CASES} across two or more stages before it can learn.`,
        };
      }
      await saveLesionModel(projectId, next);
      setModel(next);
      setConfirmedCount(samples.length);
      return {
        trained: true,
        message: `Learned from ${next.samples} confirmed cases — agrees with the clinician ${Math.round(next.accuracy * 100)}% of the time on held-out cases.`,
      };
    } finally {
      setTraining(false);
    }
  }, [projectId, condition]);

  return { model, confirmedCount, loading, training, retrain, reload };
};
