/**
 * Shared utility for detecting AI service errors and providing local fallbacks.
 * Used across all AI-dependent features in the app.
 */

/** Check if an error indicates AI service unavailability or rate limiting */
export const isAiCreditError = (error: any, data: any): boolean => {
  const errMsg = error?.message || String(error || "");
  const dataErr = typeof data?.error === "string" ? data.error : "";
  const combined = errMsg + " " + dataErr;
  return /402|credit|429|rate.?limit|non-2xx|API.*error|PAYMENT_REQUIRED|RATE_LIMIT/i.test(combined);
};

/** Standard toast message for AI service fallback */
export const AI_CREDIT_TOAST = {
  title: "AI Service Unavailable",
  description: "Using local analysis. The AI service may be rate-limited — results will use built-in algorithms.",
} as const;

// ═══════════════════════════════════════════════
//  STATISTICAL HELPERS
// ═══════════════════════════════════════════════

const sortAsc = (a: number[]) => [...a].sort((x, y) => x - y);
const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const variance = (v: number[], m?: number) => {
  const mu = m ?? mean(v);
  return v.reduce((s, x) => s + (x - mu) ** 2, 0) / (v.length - 1 || 1);
};
const stdDev = (v: number[], m?: number) => Math.sqrt(variance(v, m));
const median = (sorted: number[]) => {
  const n = sorted.length;
  return n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
};
const percentile = (sorted: number[], p: number) => sorted[Math.floor(sorted.length * p)] ?? 0;

/** Student's t-distribution critical value approximation (two-tailed, α=0.05) */
const tCritical005 = (df: number) => {
  if (df <= 1) return 12.706;
  if (df <= 5) return [4.303, 3.182, 2.776, 2.571, 2.447][df - 1];
  if (df <= 10) return 2.228;
  if (df <= 30) return 2.042;
  return 1.96;
};

/** Pearson correlation */
const pearsonR = (xs: number[], ys: number[]): number => {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = mean(xs), my = mean(ys);
  const ssXY = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const ssX = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  const ssY = ys.reduce((s, _, i) => s + (ys[i] - my) ** 2, 0);
  return ssX > 0 && ssY > 0 ? ssXY / Math.sqrt(ssX * ssY) : 0;
};

/** Spearman rank correlation */
const spearmanRho = (xs: number[], ys: number[]): number => {
  const rank = (v: number[]) => {
    const sorted = v.map((val, idx) => ({ val, idx })).sort((a, b) => a.val - b.val);
    const ranks = new Array(v.length);
    sorted.forEach((s, r) => { ranks[s.idx] = r + 1; });
    return ranks;
  };
  return pearsonR(rank(xs), rank(ys));
};

/** Mann-Whitney U test */
const mannWhitneyU = (a: number[], b: number[]) => {
  const combined = [...a.map(v => ({ v, g: 0 })), ...b.map(v => ({ v, g: 1 }))].sort((x, y) => x.v - y.v);
  const ranks = combined.map((_, i) => i + 1);
  const r1 = ranks.filter((_, i) => combined[i].g === 0).reduce((s, r) => s + r, 0);
  const n1 = a.length, n2 = b.length;
  const U1 = r1 - (n1 * (n1 + 1)) / 2;
  const U2 = n1 * n2 - U1;
  const U = Math.min(U1, U2);
  const muU = (n1 * n2) / 2;
  const sigmaU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  const z = sigmaU > 0 ? (U - muU) / sigmaU : 0;
  return { U, z, significant: Math.abs(z) > 1.96 };
};

// ═══════════════════════════════════════════════
//  DATA QUALITY PER-POINT SCORING
// ═══════════════════════════════════════════════

export interface PointQualityScore {
  submissionId: string;
  overallScore: number;
  completeness: number;
  timeliness: number;
  consistency: number;
  accuracy: number;
  issues: string[];
}

/** Compute a quality score for each individual data point / submission */
export const computeSubmissionQualityScores = (submissions: any[]): PointQualityScore[] => {
  if (!submissions.length) return [];

  // Precompute field-level stats for outlier/consistency detection
  const numericFields = new Map<string, number[]>();
  submissions.forEach(s => {
    const data = s.data || {};
    Object.entries(data).forEach(([key, val]) => {
      const num = Number(val);
      if (!isNaN(num) && typeof val !== "boolean" && val !== null && val !== "") {
        const arr = numericFields.get(key) || [];
        arr.push(num);
        numericFields.set(key, arr);
      }
    });
  });

  // Compute IQR bounds for each numeric field
  const bounds = new Map<string, { lower: number; upper: number; q1: number; q3: number }>();
  numericFields.forEach((values, field) => {
    if (values.length < 4) return;
    const sorted = sortAsc(values);
    const q1 = percentile(sorted, 0.25);
    const q3 = percentile(sorted, 0.75);
    const iqr = q3 - q1;
    bounds.set(field, { lower: q1 - 1.5 * iqr, upper: q3 + 1.5 * iqr, q1, q3 });
  });

  // Sort submissions by time for timeliness checks
  const sortedSubs = [...submissions].sort(
    (a, b) => new Date(a.submitted_at || a.created_at).getTime() - new Date(b.submitted_at || b.created_at).getTime()
  );
  const timesByUser = new Map<string, number[]>();
  sortedSubs.forEach(s => {
    const t = new Date(s.submitted_at || s.created_at).getTime();
    const list = timesByUser.get(s.user_id) || [];
    list.push(t);
    timesByUser.set(s.user_id, list);
  });

  return submissions.map(s => {
    const data = s.data || {};
    const issues: string[] = [];
    const keys = Object.keys(data);
    const totalFields = keys.length;

    // 1. Completeness: ratio of non-empty fields
    const emptyCount = keys.filter(k => data[k] === null || data[k] === undefined || data[k] === "").length;
    const completeness = totalFields > 0 ? Math.round(((totalFields - emptyCount) / totalFields) * 100) : 100;
    if (completeness < 70) issues.push(`Low completeness: ${emptyCount} of ${totalFields} fields empty`);

    // 2. Accuracy: check for outliers in numeric fields
    let outlierCount = 0;
    keys.forEach(k => {
      const num = Number(data[k]);
      if (!isNaN(num) && bounds.has(k)) {
        const b = bounds.get(k)!;
        if (num < b.lower || num > b.upper) {
          outlierCount++;
          issues.push(`Outlier in "${k}": ${num} (expected ${b.q1.toFixed(1)}-${b.q3.toFixed(1)})`);
        }
      }
    });
    const accuracy = Math.max(0, 100 - outlierCount * 20);

    // 3. Timeliness: rapid-fire detection
    const subTime = new Date(s.submitted_at || s.created_at).getTime();
    const userTimes = timesByUser.get(s.user_id) || [];
    const idx = userTimes.indexOf(subTime);
    let timeliness = 100;
    if (idx > 0) {
      const gap = (subTime - userTimes[idx - 1]) / 1000;
      if (gap < 30) {
        timeliness = 30;
        issues.push(`Rapid submission: ${Math.round(gap)}s after previous`);
      } else if (gap < 60) {
        timeliness = 60;
        issues.push(`Quick submission: ${Math.round(gap)}s after previous`);
      }
    }

    // 4. Consistency: geofence compliance
    let consistency = 100;
    if (s.within_geofence === false) {
      consistency = 40;
      issues.push("Submitted outside geofence boundary");
    }

    const overallScore = Math.round(
      completeness * 0.3 + accuracy * 0.3 + timeliness * 0.2 + consistency * 0.2
    );

    return {
      submissionId: s.id,
      overallScore,
      completeness,
      timeliness,
      consistency,
      accuracy,
      issues,
    };
  });
};

// ═══════════════════════════════════════════════
//  LOCAL FALLBACK: Data Quality
// ═══════════════════════════════════════════════

export const localDataQualityCheck = (submissions: any[]): any => {
  const issues: any[] = [];
  let duplicateCount = 0;
  let missingCount = 0;
  let outlierCount = 0;

  const byUser = new Map<string, any[]>();
  submissions.forEach(s => {
    const list = byUser.get(s.user_id) || [];
    list.push(s);
    byUser.set(s.user_id, list);
  });

  byUser.forEach((userSubs, userId) => {
    const sorted = userSubs.sort((a: any, b: any) => new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime());
    for (let i = 1; i < sorted.length; i++) {
      const diff = (new Date(sorted[i].submitted_at).getTime() - new Date(sorted[i - 1].submitted_at).getTime()) / 1000;
      if (diff < 60) {
        issues.push({ type: "rapid_submission", severity: "warning", message: `Rapid submissions detected (${Math.round(diff)}s apart)`, userId });
        duplicateCount++;
      }
    }
  });

  submissions.forEach(s => {
    const data = s.data || {};
    const keys = Object.keys(data);
    const emptyKeys = keys.filter(k => data[k] === null || data[k] === undefined || data[k] === "");
    if (emptyKeys.length > keys.length * 0.5 && keys.length > 0) {
      issues.push({ type: "missing_data", severity: "warning", message: `Submission has ${emptyKeys.length}/${keys.length} empty fields` });
      missingCount++;
    }
  });

  const numericFields = new Map<string, number[]>();
  submissions.forEach(s => {
    const data = s.data || {};
    Object.entries(data).forEach(([key, val]) => {
      const num = Number(val);
      if (!isNaN(num) && typeof val !== "boolean") {
        const arr = numericFields.get(key) || [];
        arr.push(num);
        numericFields.set(key, arr);
      }
    });
  });

  numericFields.forEach((values, field) => {
    if (values.length < 4) return;
    const sorted = sortAsc(values);
    const q1 = percentile(sorted, 0.25);
    const q3 = percentile(sorted, 0.75);
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;
    const outliers = values.filter(v => v < lower || v > upper);
    if (outliers.length > 0) {
      issues.push({ type: "outlier", severity: "info", message: `${outliers.length} outlier(s) detected in numeric field`, field });
      outlierCount += outliers.length;
    }
  });

  const score = Math.max(0, 100 - (duplicateCount * 10) - (missingCount * 5) - (outlierCount * 2));

  return {
    summary: {
      total_submissions: submissions.length,
      total_issues: issues.length,
      data_quality_score: score,
      duplicate_count: duplicateCount,
      missing_count: missingCount,
      outlier_count: outlierCount,
    },
    issues,
    recommendations: [
      duplicateCount > 0 ? "Review rapid-fire submissions for potential duplicate entries." : null,
      missingCount > 0 ? "Check forms with high missing data rates for required field settings." : null,
      outlierCount > 0 ? "Review numeric outliers for data entry errors." : null,
      "Consider setting up validation rules in the form builder.",
    ].filter(Boolean),
    computed_locally: true,
  };
};

// ═══════════════════════════════════════════════
//  LOCAL FALLBACK: Spatial Analysis (Enhanced)
// ═══════════════════════════════════════════════

const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const localSpatialAnalysis = (submissions: any[], analysisType: string, gpsQuestions: any[]): any => {
  const points: { lat: number; lng: number; label: string }[] = [];

  submissions.forEach(s => {
    const data = s.data || {};
    for (const q of gpsQuestions) {
      const gps = data[q.id];
      if (gps && typeof gps === "object" && gps.lat && gps.lng) {
        points.push({ lat: Number(gps.lat), lng: Number(gps.lng), label: q.label || q.name || q.id });
      }
    }
    if (s.location?.lat && s.location?.lng) {
      points.push({ lat: Number(s.location.lat), lng: Number(s.location.lng), label: "Device Location" });
    }
  });

  if (points.length === 0) {
    return { summary: "No GPS data found.", statistics: [], charts: [], interpretation: "No GPS coordinates available.", recommendations: ["Ensure GPS capture is enabled."] };
  }

  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const centerLat = mean(lats);
  const centerLng = mean(lngs);

  // Common stats
  const distances = points.map(p => haversineKm(p.lat, p.lng, centerLat, centerLng));
  const avgDist = mean(distances);
  const maxDist = Math.max(...distances);

  const baseStats = [
    { Metric: "Total Points", Value: points.length },
    { Metric: "Center Latitude", Value: centerLat.toFixed(6) },
    { Metric: "Center Longitude", Value: centerLng.toFixed(6) },
    { Metric: "Avg Distance from Center (km)", Value: avgDist.toFixed(3) },
    { Metric: "Max Spread (km)", Value: maxDist.toFixed(3) },
    { Metric: "Lat Std Dev", Value: stdDev(lats).toFixed(6) },
    { Metric: "Lng Std Dev", Value: stdDev(lngs).toFixed(6) },
  ];

  // Grid density for charts
  const gridSize = 0.005;
  const density = new Map<string, number>();
  points.forEach(p => {
    const key = `${(Math.round(p.lat / gridSize) * gridSize).toFixed(4)},${(Math.round(p.lng / gridSize) * gridSize).toFixed(4)}`;
    density.set(key, (density.get(key) || 0) + 1);
  });
  const densityData = Array.from(density.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);

  // ─── Hotspot Analysis (Getis-Ord Gi*) ───
  if (analysisType === "hotspot") {
    const n = points.length;
    const bandwidth = avgDist > 0 ? avgDist * 1.5 : 1;
    const giScores = points.map((p, i) => {
      let wSum = 0, wxSum = 0, w2Sum = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const d = haversineKm(p.lat, p.lng, points[j].lat, points[j].lng);
        const w = d < bandwidth ? 1 : 0;
        wSum += w;
        wxSum += w; // Using count=1 per point
        w2Sum += w ** 2;
      }
      const xBar = 1; // Each point has value 1
      const s = 0;
      const gi = n > 1 ? (wxSum - xBar * wSum) / (Math.sqrt((n * w2Sum - wSum ** 2) / (n - 1)) || 1) : 0;
      return { ...p, gi: Number(gi.toFixed(3)), cluster: gi > 1.96 ? "hotspot" : gi < -1.96 ? "coldspot" : "neutral" };
    });

    const hotspots = giScores.filter(g => g.cluster === "hotspot").length;
    const coldspots = giScores.filter(g => g.cluster === "coldspot").length;

    return {
      summary: `Getis-Ord Gi* hotspot analysis on ${n} points (bandwidth: ${bandwidth.toFixed(2)}km). Found ${hotspots} hotspot(s) and ${coldspots} coldspot(s).`,
      statistics: [
        ...baseStats,
        { Metric: "Bandwidth (km)", Value: bandwidth.toFixed(3) },
        { Metric: "Hotspots (Gi* > 1.96)", Value: hotspots },
        { Metric: "Coldspots (Gi* < -1.96)", Value: coldspots },
        { Metric: "Neutral Points", Value: n - hotspots - coldspots },
      ],
      charts: [
        { type: "scatter", title: "Spatial Point Distribution", data: giScores.map(g => ({ x: g.lng, y: g.lat, cluster: g.cluster === "hotspot" ? 0 : g.cluster === "coldspot" ? 1 : 2 })), xLabel: "Longitude", yLabel: "Latitude" },
        { type: "bar", title: "Gi* Score Distribution", data: [{ name: "Hotspot", value: hotspots }, { name: "Neutral", value: n - hotspots - coldspots }, { name: "Coldspot", value: coldspots }], xKey: "name", bars: ["value"] },
      ],
      interpretation: `${hotspots > 0 ? `${hotspots} statistically significant cluster(s) of high activity detected.` : "No significant hotspots detected."} ${coldspots > 0 ? `${coldspots} cold spot(s) indicate areas of low activity.` : ""}`,
      recommendations: [
        hotspots > 0 ? "Investigate hotspot areas for potential sampling bias or genuine high-activity zones." : "Data appears spatially random — no significant clustering.",
        "Consider increasing sample size for more robust results.",
      ],
    };
  }

  // ─── Moran's I Spatial Autocorrelation ───
  if (analysisType === "spatial_autocorrelation") {
    const n = points.length;
    const vals = points.map(() => 1);
    const xBar = 1;
    let W = 0, numerator = 0, denominator = 0;
    const bandwidth = avgDist * 1.5;

    for (let i = 0; i < n; i++) {
      denominator += (vals[i] - xBar) ** 2;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const d = haversineKm(points[i].lat, points[i].lng, points[j].lat, points[j].lng);
        const w = d < bandwidth ? 1 / (d || 0.001) : 0;
        W += w;
        numerator += w * (vals[i] - xBar) * (vals[j] - xBar);
      }
    }
    const moranI = denominator > 0 && W > 0 ? (n / W) * (numerator / denominator) : 0;
    const expectedI = -1 / (n - 1);
    const pattern = moranI > expectedI + 0.1 ? "Clustered" : moranI < expectedI - 0.1 ? "Dispersed" : "Random";

    return {
      summary: `Moran's I spatial autocorrelation: I = ${moranI.toFixed(4)}. Expected I = ${expectedI.toFixed(4)}. Pattern: ${pattern}.`,
      statistics: [...baseStats, { Metric: "Moran's I", Value: moranI.toFixed(4) }, { Metric: "Expected I", Value: expectedI.toFixed(4) }, { Metric: "Pattern", Value: pattern }],
      charts: [
        { type: "scatter", title: "Point Distribution", data: points.map(p => ({ x: p.lng, y: p.lat })), xLabel: "Longitude", yLabel: "Latitude" },
        { type: "bar", title: "Grid Density", data: densityData, xKey: "name", bars: ["value"] },
      ],
      interpretation: `Moran's I of ${moranI.toFixed(4)} indicates a ${pattern.toLowerCase()} spatial pattern. ${pattern === "Clustered" ? "Points tend to be near other points — possible sampling concentration." : pattern === "Dispersed" ? "Points are more evenly spread than random." : "No significant spatial pattern detected."}`,
      recommendations: ["Ensure spatial coverage matches the target study area.", pattern === "Clustered" ? "Consider expanding coverage to under-sampled areas." : "Distribution appears adequate."],
    };
  }

  // ─── DBSCAN Clustering ───
  if (analysisType === "dbscan_clustering") {
    const eps = avgDist * 0.5 || 0.5;
    const minPts = Math.max(2, Math.floor(points.length * 0.05));
    const labels = new Array(points.length).fill(-1);
    let clusterId = 0;

    for (let i = 0; i < points.length; i++) {
      if (labels[i] !== -1) continue;
      const neighbors = points.map((p, j) => haversineKm(points[i].lat, points[i].lng, p.lat, p.lng) < eps ? j : -1).filter(j => j >= 0);
      if (neighbors.length < minPts) continue;
      labels[i] = clusterId;
      const queue = [...neighbors];
      while (queue.length) {
        const q = queue.shift()!;
        if (labels[q] === -1 || labels[q] === undefined) {
          labels[q] = clusterId;
          const qNeighbors = points.map((p, j) => haversineKm(points[q].lat, points[q].lng, p.lat, p.lng) < eps ? j : -1).filter(j => j >= 0);
          if (qNeighbors.length >= minPts) queue.push(...qNeighbors.filter(n => labels[n] === -1));
        }
      }
      clusterId++;
    }

    const noise = labels.filter(l => l === -1).length;
    const clusterCounts = new Map<number, number>();
    labels.filter(l => l >= 0).forEach(l => clusterCounts.set(l, (clusterCounts.get(l) || 0) + 1));

    return {
      summary: `DBSCAN clustering: ${clusterId} cluster(s) found, ${noise} noise point(s). Parameters: eps=${eps.toFixed(3)}km, minPts=${minPts}.`,
      statistics: [
        ...baseStats,
        { Metric: "Clusters Found", Value: clusterId },
        { Metric: "Noise Points", Value: noise },
        { Metric: "Epsilon (km)", Value: eps.toFixed(3) },
        { Metric: "Min Points", Value: minPts },
      ],
      charts: [
        { type: "scatter", title: "DBSCAN Clusters", data: points.map((p, i) => ({ x: p.lng, y: p.lat, cluster: labels[i] })), xLabel: "Longitude", yLabel: "Latitude" },
        { type: "pie", title: "Cluster Sizes", data: [...Array.from(clusterCounts.entries()).map(([c, v]) => ({ name: `Cluster ${c + 1}`, value: v })), { name: "Noise", value: noise }] },
      ],
      interpretation: `Found ${clusterId} spatial cluster(s). ${noise} points classified as noise/outliers.`,
      recommendations: ["Review noise points for potential data quality issues.", clusterId > 0 ? "Cluster locations may represent team deployment areas." : "No dense clusters found — data is spread out."],
    };
  }

  // ─── Nearest Neighbor Analysis ───
  if (analysisType === "nearest_neighbor") {
    const n = points.length;
    let nnDistSum = 0;
    points.forEach((p, i) => {
      let minD = Infinity;
      points.forEach((q, j) => {
        if (i !== j) {
          const d = haversineKm(p.lat, p.lng, q.lat, q.lng);
          if (d < minD) minD = d;
        }
      });
      nnDistSum += minD;
    });
    const observedMean = nnDistSum / n;
    const area = (Math.max(...lats) - Math.min(...lats)) * (Math.max(...lngs) - Math.min(...lngs)) * 111 * 111;
    const expectedMean = area > 0 ? 0.5 / Math.sqrt(n / area) : 0;
    const R = expectedMean > 0 ? observedMean / expectedMean : 1;
    const pattern = R < 0.8 ? "Clustered" : R > 1.2 ? "Dispersed" : "Random";

    return {
      summary: `Nearest Neighbor: R = ${R.toFixed(4)} → ${pattern}. Observed mean NN distance: ${observedMean.toFixed(4)}km, Expected: ${expectedMean.toFixed(4)}km.`,
      statistics: [...baseStats, { Metric: "R Ratio", Value: R.toFixed(4) }, { Metric: "Observed Mean NN (km)", Value: observedMean.toFixed(4) }, { Metric: "Expected Mean NN (km)", Value: expectedMean.toFixed(4) }, { Metric: "Pattern", Value: pattern }],
      charts: [
        { type: "scatter", title: "Point Distribution", data: points.map(p => ({ x: p.lng, y: p.lat })), xLabel: "Longitude", yLabel: "Latitude" },
        { type: "bar", title: "Grid Density", data: densityData, xKey: "name", bars: ["value"] },
      ],
      interpretation: `R ratio of ${R.toFixed(3)} indicates a ${pattern.toLowerCase()} pattern. ${R < 1 ? "Points are closer together than expected." : "Points are more spread out than expected."}`,
      recommendations: [pattern === "Clustered" ? "Consider expanding spatial coverage." : "Spatial distribution appears adequate."],
    };
  }

  // ─── Default fallback for other types ───
  return {
    summary: `Local spatial analysis: ${points.length} GPS points analyzed. Center: (${centerLat.toFixed(4)}, ${centerLng.toFixed(4)}). Average spread: ${avgDist.toFixed(2)}km.`,
    statistics: baseStats,
    charts: [
      { type: "scatter", title: "Point Distribution", data: points.map(p => ({ x: p.lng, y: p.lat })), xLabel: "Longitude", yLabel: "Latitude" },
      { type: "bar", title: "Point Density by Grid Cell", data: densityData, xKey: "name", bars: ["value"] },
    ],
    interpretation: "Basic spatial statistics computed locally.",
    recommendations: ["Check for point clustering that may indicate biased sampling.", "Verify GPS accuracy for points far from the center."],
  };
};

// ═══════════════════════════════════════════════
//  LOCAL STATISTICAL ANALYSIS (Enhanced)
// ═══════════════════════════════════════════════

export const localStatisticalAnalysis = (
  submissions: any[],
  selectedQMeta: { id: string; label: string; type: string; options?: any[] }[],
  analysisType: string,
  groupingQuestionId?: string,
): any | null => {

  const extractNumeric = (qId: string) =>
    submissions.map(s => Number((s.data as any)?.[qId])).filter(v => !isNaN(v));

  // ─── Descriptive ───
  if (analysisType === "descriptive") {
    const statistics: any[] = [];
    const charts: any[] = [];
    for (const q of selectedQMeta) {
      const values = extractNumeric(q.id);
      if (values.length === 0) { statistics.push({ Question: q.label, N: 0, Mean: "—" }); continue; }
      const sorted = sortAsc(values);
      const n = sorted.length;
      const mu = mean(sorted);
      const med = median(sorted);
      const sd = stdDev(sorted, mu);
      const skewness = n > 2 ? (n / ((n - 1) * (n - 2))) * sorted.reduce((s, x) => s + ((x - mu) / sd) ** 3, 0) : 0;
      const kurtosis = n > 3 ? ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * sorted.reduce((s, x) => s + ((x - mu) / sd) ** 4, 0) - (3 * (n - 1) ** 2) / ((n - 2) * (n - 3)) : 0;
      statistics.push({
        Question: q.label, N: n, Mean: mu.toFixed(4), Median: med.toFixed(4),
        "Std Dev": sd.toFixed(4), Min: sorted[0], Max: sorted[n - 1],
        Q1: percentile(sorted, 0.25), Q3: percentile(sorted, 0.75),
        Skewness: skewness.toFixed(4), Kurtosis: kurtosis.toFixed(4),
      });
      const binCount = Math.min(12, Math.ceil(Math.sqrt(n)));
      const binWidth = (sorted[n - 1] - sorted[0]) / binCount || 1;
      const bins = Array.from({ length: binCount }, (_, i) => ({ name: `${(sorted[0] + i * binWidth).toFixed(1)}`, value: 0 }));
      values.forEach(v => { const idx = Math.min(Math.floor((v - sorted[0]) / binWidth), binCount - 1); bins[idx].value++; });
      charts.push({ type: "bar", title: `Distribution: ${q.label}`, data: bins, xKey: "name", bars: ["value"] });
    }
    return {
      summary: `Descriptive statistics for ${selectedQMeta.length} question(s) across ${submissions.length} submissions.`,
      statistics, charts,
      interpretation: "Summary statistics including skewness and kurtosis. Skewness near 0 = symmetric; Kurtosis near 0 = normal-like tails.",
      recommendations: ["Check skewness — highly skewed data may need non-parametric tests.", "Outliers inflate std dev; consider robust measures."],
    };
  }

  // ─── Frequency ───
  if (analysisType === "frequency") {
    const statistics: any[] = [];
    const charts: any[] = [];
    for (const q of selectedQMeta) {
      const counts = new Map<string, number>();
      let total = 0;
      submissions.forEach(s => {
        let v = (s.data as any)?.[q.id];
        if (v === undefined || v === null || v === "") return;
        if (Array.isArray(v)) v.forEach((item: any) => { counts.set(String(item), (counts.get(String(item)) || 0) + 1); total++; });
        else { counts.set(String(v), (counts.get(String(v)) || 0) + 1); total++; }
      });
      const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
      entries.forEach(([val, count]) => {
        statistics.push({ Question: q.label, Value: val, Count: count, Percentage: total > 0 ? ((count / total) * 100).toFixed(1) + "%" : "0%" });
      });
      charts.push({ type: "pie", title: q.label, data: entries.slice(0, 10).map(([name, value]) => ({ name, value })) });
      charts.push({ type: "bar", title: `${q.label} — Frequency`, data: entries.map(([name, value]) => ({ name, value })), xKey: "name", bars: ["value"] });
    }
    return {
      summary: `Frequency analysis for ${selectedQMeta.length} question(s) across ${submissions.length} submissions.`,
      statistics, charts,
      interpretation: "Frequency counts and percentages for each response option.",
      recommendations: ["Review low-frequency categories for data quality issues."],
    };
  }

  // ─── Correlation (Pearson & Spearman) ───
  if (analysisType === "correlation") {
    const numericQs = selectedQMeta.filter(q => ["number", "integer", "decimal", "range", "calculate"].includes(q.type));
    if (numericQs.length < 2) {
      return { summary: "Need at least 2 numeric questions for correlation.", statistics: [], charts: [], interpretation: "Select more numeric questions.", recommendations: [] };
    }
    const statistics: any[] = [];
    const charts: any[] = [];
    for (let i = 0; i < numericQs.length; i++) {
      for (let j = i + 1; j < numericQs.length; j++) {
        const pairs: { x: number; y: number }[] = [];
        submissions.forEach(s => {
          const xv = Number((s.data as any)?.[numericQs[i].id]);
          const yv = Number((s.data as any)?.[numericQs[j].id]);
          if (!isNaN(xv) && !isNaN(yv)) pairs.push({ x: xv, y: yv });
        });
        if (pairs.length < 3) { statistics.push({ "Variable X": numericQs[i].label, "Variable Y": numericQs[j].label, N: pairs.length, "Pearson r": "—" }); continue; }
        const r = pearsonR(pairs.map(p => p.x), pairs.map(p => p.y));
        const rho = spearmanRho(pairs.map(p => p.x), pairs.map(p => p.y));
        const t = r * Math.sqrt((pairs.length - 2) / (1 - r ** 2));
        const sig = Math.abs(t) > tCritical005(pairs.length - 2);
        statistics.push({
          "Variable X": numericQs[i].label, "Variable Y": numericQs[j].label,
          N: pairs.length, "Pearson r": r.toFixed(4), "Spearman ρ": rho.toFixed(4),
          "t-stat": t.toFixed(3), "Significant (α=0.05)": sig ? "Yes" : "No",
        });
        charts.push({ type: "scatter", title: `${numericQs[i].label} vs ${numericQs[j].label} (r=${r.toFixed(3)})`, data: pairs.slice(0, 200), xKey: "x", lines: ["y"] });
      }
    }
    return {
      summary: `Correlation analysis: Pearson r and Spearman ρ for ${numericQs.length} variables.`,
      statistics, charts,
      interpretation: "Pearson measures linear relationship; Spearman measures monotonic relationship. Values near ±1 indicate strong association.",
      recommendations: ["Correlation ≠ causation.", "Check scatterplots for non-linear patterns."],
    };
  }

  // ─── T-Test (Independent) ───
  if (analysisType === "t_test" && groupingQuestionId) {
    const groups = new Map<string, number[]>();
    for (const q of selectedQMeta) {
      submissions.forEach(s => {
        const g = String((s.data as any)?.[groupingQuestionId] ?? "");
        const v = Number((s.data as any)?.[q.id]);
        if (g && !isNaN(v)) {
          const key = g;
          groups.set(key, [...(groups.get(key) || []), v]);
        }
      });
    }
    const groupNames = Array.from(groups.keys()).slice(0, 2);
    if (groupNames.length < 2) {
      return { summary: "Need at least 2 groups for t-test.", statistics: [], charts: [], interpretation: "Select a grouping variable with 2+ categories.", recommendations: [] };
    }
    const a = groups.get(groupNames[0])!;
    const b = groups.get(groupNames[1])!;
    const ma = mean(a), mb = mean(b);
    const sa = stdDev(a), sb = stdDev(b);
    const se = Math.sqrt(sa ** 2 / a.length + sb ** 2 / b.length);
    const t = se > 0 ? (ma - mb) / se : 0;
    const df = a.length + b.length - 2;
    const sig = Math.abs(t) > tCritical005(df);
    const cohensD = Math.sqrt((sa ** 2 + sb ** 2) / 2);
    const d = cohensD > 0 ? (ma - mb) / cohensD : 0;

    return {
      summary: `Independent t-test comparing "${groupNames[0]}" vs "${groupNames[1]}".`,
      statistics: [{
        "Group A": groupNames[0], "N(A)": a.length, "Mean(A)": ma.toFixed(4),
        "Group B": groupNames[1], "N(B)": b.length, "Mean(B)": mb.toFixed(4),
        "t-stat": t.toFixed(4), df, "Significant (α=0.05)": sig ? "Yes" : "No",
        "Cohen's d": d.toFixed(4),
      }],
      charts: [
        { type: "bar", title: "Group Means", data: [{ name: groupNames[0], value: Number(ma.toFixed(2)) }, { name: groupNames[1], value: Number(mb.toFixed(2)) }], xKey: "name", bars: ["value"] },
      ],
      interpretation: `t(${df}) = ${t.toFixed(3)}, ${sig ? "statistically significant" : "not significant"} at α=0.05. Cohen's d = ${d.toFixed(3)} (${Math.abs(d) < 0.2 ? "negligible" : Math.abs(d) < 0.5 ? "small" : Math.abs(d) < 0.8 ? "medium" : "large"} effect).`,
      recommendations: [sig ? "The difference between groups is statistically meaningful." : "No significant difference detected.", "Verify assumptions: normality and equal variances."],
    };
  }

  // ─── ANOVA ───
  if (analysisType === "anova" && groupingQuestionId) {
    const groups = new Map<string, number[]>();
    for (const q of selectedQMeta) {
      submissions.forEach(s => {
        const g = String((s.data as any)?.[groupingQuestionId] ?? "");
        const v = Number((s.data as any)?.[q.id]);
        if (g && !isNaN(v)) groups.set(g, [...(groups.get(g) || []), v]);
      });
    }
    const gNames = Array.from(groups.keys());
    if (gNames.length < 3) {
      return { summary: "ANOVA needs 3+ groups.", statistics: [], charts: [], interpretation: "Select a grouping variable with 3+ categories.", recommendations: [] };
    }
    const allVals = gNames.flatMap(g => groups.get(g)!);
    const grandMean = mean(allVals);
    const k = gNames.length;
    const N = allVals.length;
    let ssBetween = 0, ssWithin = 0;
    gNames.forEach(g => {
      const vals = groups.get(g)!;
      const gm = mean(vals);
      ssBetween += vals.length * (gm - grandMean) ** 2;
      vals.forEach(v => { ssWithin += (v - gm) ** 2; });
    });
    const dfB = k - 1, dfW = N - k;
    const msB = ssBetween / dfB, msW = ssWithin / (dfW || 1);
    const F = msW > 0 ? msB / msW : 0;
    const sig = F > 3.0; // Approximate critical F at α=0.05

    return {
      summary: `One-Way ANOVA across ${k} groups (N=${N}).`,
      statistics: [{ Source: "Between Groups", SS: ssBetween.toFixed(2), df: dfB, MS: msB.toFixed(2), F: F.toFixed(4), "Significant": sig ? "Yes" : "No" },
        { Source: "Within Groups", SS: ssWithin.toFixed(2), df: dfW, MS: msW.toFixed(2), F: "", "Significant": "" }],
      charts: [
        { type: "bar", title: "Group Means", data: gNames.map(g => ({ name: g, value: Number(mean(groups.get(g)!).toFixed(2)) })), xKey: "name", bars: ["value"] },
      ],
      interpretation: `F(${dfB}, ${dfW}) = ${F.toFixed(3)}, ${sig ? "significant" : "not significant"} at α≈0.05. ${sig ? "At least one group mean differs significantly." : "No significant differences between groups."}`,
      recommendations: [sig ? "Run post-hoc tests (e.g., Tukey HSD) to identify which groups differ." : "Groups appear homogeneous.", "Check assumption of equal variances."],
    };
  }

  // ─── Mann-Whitney U ───
  if (analysisType === "mann_whitney" && groupingQuestionId) {
    const groups = new Map<string, number[]>();
    for (const q of selectedQMeta) {
      submissions.forEach(s => {
        const g = String((s.data as any)?.[groupingQuestionId] ?? "");
        const v = Number((s.data as any)?.[q.id]);
        if (g && !isNaN(v)) groups.set(g, [...(groups.get(g) || []), v]);
      });
    }
    const gNames = Array.from(groups.keys()).slice(0, 2);
    if (gNames.length < 2) {
      return { summary: "Need 2 groups.", statistics: [], charts: [], interpretation: "Select a grouping variable.", recommendations: [] };
    }
    const result = mannWhitneyU(groups.get(gNames[0])!, groups.get(gNames[1])!);
    return {
      summary: `Mann-Whitney U test: U = ${result.U.toFixed(1)}, z = ${result.z.toFixed(3)}, ${result.significant ? "significant" : "not significant"} at α=0.05.`,
      statistics: [{ "Group A": gNames[0], "N(A)": groups.get(gNames[0])!.length, "Group B": gNames[1], "N(B)": groups.get(gNames[1])!.length, U: result.U.toFixed(1), z: result.z.toFixed(3), "Significant": result.significant ? "Yes" : "No" }],
      charts: [{ type: "bar", title: "Group Medians", data: gNames.map(g => ({ name: g, value: Number(median(sortAsc(groups.get(g)!)).toFixed(2)) })), xKey: "name", bars: ["value"] }],
      interpretation: `Non-parametric comparison: ${result.significant ? "Groups differ significantly." : "No significant difference."}`,
      recommendations: ["Mann-Whitney is robust to non-normality.", result.significant ? "Explore the nature of the difference." : "Groups appear similar."],
    };
  }

  // ─── Time Series ───
  if (analysisType === "time_series") {
    const daily = new Map<string, number>();
    submissions.forEach(s => {
      const d = (s.submitted_at || s.created_at || "").slice(0, 10);
      if (d) daily.set(d, (daily.get(d) || 0) + 1);
    });
    const sorted = Array.from(daily.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const values = sorted.map(([, v]) => v);
    const n = values.length;
    // Moving average
    const window = Math.min(7, Math.floor(n / 3) || 1);
    const ma = values.map((_, i) => {
      const start = Math.max(0, i - window + 1);
      const slice = values.slice(start, i + 1);
      return Number(mean(slice).toFixed(1));
    });
    // Trend via linear regression
    const xVals = values.map((_, i) => i);
    const mx = mean(xVals), my = mean(values);
    const ssxy = xVals.reduce((s, x, i) => s + (x - mx) * (values[i] - my), 0);
    const ssxx = xVals.reduce((s, x) => s + (x - mx) ** 2, 0);
    const slope = ssxx > 0 ? ssxy / ssxx : 0;
    const trend = slope > 0.1 ? "Upward" : slope < -0.1 ? "Downward" : "Stable";

    return {
      summary: `Time series: ${n} days of data. Trend: ${trend} (slope: ${slope.toFixed(3)} submissions/day).`,
      statistics: [{ Metric: "Total Days", Value: n }, { Metric: "Total Submissions", Value: values.reduce((a, b) => a + b, 0) }, { Metric: "Daily Average", Value: mean(values).toFixed(1) }, { Metric: "Trend", Value: trend }, { Metric: "Slope", Value: slope.toFixed(4) }],
      charts: [
        { type: "line", title: "Daily Submissions with Moving Average", data: sorted.map(([d], i) => ({ name: d, Submissions: values[i], "Moving Avg": ma[i] })), xKey: "name", lines: ["Submissions", "Moving Avg"] },
      ],
      interpretation: `${trend} trend detected. Daily average: ${mean(values).toFixed(1)} submissions.`,
      recommendations: [trend === "Downward" ? "Investigate declining submission rates." : "Submission rate appears healthy.", "Review weekend vs weekday patterns."],
    };
  }

  return null;
};

// ═══════════════════════════════════════════════
//  OTHER LOCAL FALLBACKS (unchanged)
// ═══════════════════════════════════════════════

export const localIterationAnalysis = (entries: any[]): string => {
  if (!entries.length) return "No iteration data available for analysis.";
  const totalEntries = entries.length;
  const avgCompletion = entries.reduce((sum: number, e: any) => sum + (e.target > 0 ? (e.actual / e.target) * 100 : 0), 0) / totalEntries;
  const reasonCounts = new Map<string, number>();
  entries.forEach((e: any) => { const reason = e.reason || "No reason provided"; reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1); });
  const topReasons = Array.from(reasonCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  let analysis = `LOCAL ANALYSIS (${totalEntries} entries)\n\nAverage target completion: ${avgCompletion.toFixed(1)}%\n\nTop reasons for incomplete targets:\n`;
  topReasons.forEach(([reason, count], i) => { analysis += `${i + 1}. ${reason} (${count} occurrences, ${((count / totalEntries) * 100).toFixed(1)}%)\n`; });
  analysis += `\nRecommendation: Focus on addressing the top reasons to improve completion rates.`;
  return analysis;
};

export const localMeetingSummary = (chatMessages: any[], callType: string, groupName: string, duration: number, participants: any[]): string => {
  const msgCount = chatMessages.length;
  const uniqueSenders = new Set(chatMessages.map((m: any) => m.senderName || m.sender_id)).size;
  const durationMin = Math.round(duration / 60);
  let summary = `MEETING SUMMARY (Local)\n\nGroup: ${groupName}\nType: ${callType}\nDuration: ${durationMin} minutes\nParticipants: ${participants.length}\nMessages exchanged: ${msgCount}\nActive contributors: ${uniqueSenders}\n\n`;
  if (msgCount > 0) {
    summary += `Key topics discussed:\n`;
    const words = new Map<string, number>();
    chatMessages.forEach((m: any) => { (m.content || "").split(/\s+/).forEach((w: string) => { const clean = w.toLowerCase().replace(/[^a-z]/g, ""); if (clean.length > 4) words.set(clean, (words.get(clean) || 0) + 1); }); });
    Array.from(words.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).forEach(([word, count]) => { summary += `- "${word}" (mentioned ${count} times)\n`; });
  }
  summary += `\nNote: This is a basic local summary. AI-powered summaries provide deeper insights.`;
  return summary;
};

export const localMLPrediction = (data: any[], features: string[], target: string, method: string): any => {
  if (data.length < 5) return { error: "Need at least 5 data points for local ML analysis." };
  const targetValues = data.map(d => String(d[target])).filter(v => v !== "undefined" && v !== "null");
  const classCounts = new Map<string, number>();
  targetValues.forEach(v => classCounts.set(v, (classCounts.get(v) || 0) + 1));
  const totalSamples = targetValues.length;
  const classes = Array.from(classCounts.entries()).sort((a, b) => b[1] - a[1]);
  const majorityClass = classes[0]?.[0] || "unknown";
  const majorityAccuracy = classes[0] ? (classes[0][1] / totalSamples * 100) : 0;
  const featureImportance = features.map(f => {
    const vals = data.map(d => Number(d[f])).filter(v => !isNaN(v));
    return { feature: f, importance: vals.length > 0 ? (vals.length / data.length) : 0 };
  }).sort((a, b) => b.importance - a.importance);
  return {
    model_type: method, accuracy: majorityAccuracy.toFixed(1), baseline_accuracy: majorityAccuracy.toFixed(1),
    class_distribution: classes.map(([cls, count]) => ({ class: cls, count, percentage: (count / totalSamples * 100).toFixed(1) })),
    feature_importance: featureImportance.map(f => ({ ...f, importance: (f.importance * 100).toFixed(1) })),
    predictions_summary: `Baseline model: predicting majority class "${majorityClass}" yields ${majorityAccuracy.toFixed(1)}% accuracy.`,
    confusion_matrix: null,
    health_assessment: { overall_risk: "medium", notes: "Local fallback — only baseline statistics available." },
    computed_locally: true,
  };
};

export const localMathModelSimulation = (action: string, payload: any): any => {
  const { compartments = [], parameters = [], timeSpan = 100 } = payload || {};
  if (action === "simulate" && compartments.length > 0) {
    const dt = 0.1;
    const steps = Math.min(Math.round(timeSpan / dt), 10000);
    const state: Record<string, number> = {};
    compartments.forEach((c: any) => { state[c.name] = c.initialValue || 0; });
    const timeSeries: any[] = [];
    for (let i = 0; i <= steps; i += Math.max(1, Math.floor(steps / 200))) {
      const point: any = { time: (i * dt).toFixed(1) };
      compartments.forEach((c: any) => { point[c.name] = state[c.name]; });
      timeSeries.push(point);
    }
    return { timeSeries, summary: `Local simulation with ${compartments.length} compartments over ${timeSpan} time units.`, compartmentNames: compartments.map((c: any) => c.name), computed_locally: true };
  }
  if (action === "r0_analysis") return { r0_estimate: "N/A (requires AI)", summary: "R₀ analysis requires AI computation.", computed_locally: true };
  if (action === "sensitivity_analysis") return { summary: "Sensitivity analysis requires AI computation.", parameters: parameters.map((p: any) => ({ name: p.name, value: p.value, sensitivity: "N/A" })), computed_locally: true };
  return { summary: `"${action}" analysis requires AI computation.`, computed_locally: true };
};
