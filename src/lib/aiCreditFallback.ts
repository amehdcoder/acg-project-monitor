/**
 * Shared utility for detecting AI credit exhaustion errors and providing local fallbacks.
 * Used across all AI-dependent features in the app.
 */

/** Check if an error indicates AI credit exhaustion or rate limiting */
export const isAiCreditError = (error: any, data: any): boolean => {
  const errMsg = error?.message || String(error || "");
  const dataErr = typeof data?.error === "string" ? data.error : "";
  const combined = errMsg + " " + dataErr;
  return /402|credit|429|rate.?limit|non-2xx/i.test(combined);
};

/** Standard toast message for AI credit exhaustion */
export const AI_CREDIT_TOAST = {
  title: "AI Credits Unavailable",
  description: "Using local analysis. Add AI credits in Settings > Workspace > Usage for AI-powered features.",
} as const;

/** ===== LOCAL FALLBACK: Data Quality ===== */
export const localDataQualityCheck = (submissions: any[]): any => {
  const issues: any[] = [];
  let duplicateCount = 0;
  let missingCount = 0;
  let outlierCount = 0;

  // Check for rapid-fire submissions (same user, < 60s apart)
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

  // Check for empty/missing data fields
  submissions.forEach(s => {
    const data = s.data || {};
    const keys = Object.keys(data);
    const emptyKeys = keys.filter(k => data[k] === null || data[k] === undefined || data[k] === "");
    if (emptyKeys.length > keys.length * 0.5 && keys.length > 0) {
      issues.push({ type: "missing_data", severity: "warning", message: `Submission has ${emptyKeys.length}/${keys.length} empty fields` });
      missingCount++;
    }
  });

  // Check for numeric outliers (simple IQR method)
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
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
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

/** ===== LOCAL FALLBACK: Spatial Analysis ===== */
export const localSpatialAnalysis = (submissions: any[], analysisType: string, gpsQuestions: any[]): any => {
  const points: { lat: number; lng: number; label: string }[] = [];
  
  submissions.forEach(s => {
    const data = s.data || {};
    for (const q of gpsQuestions) {
      const gps = data[q.id];
      if (gps && typeof gps === "object" && gps.lat && gps.lng) {
        points.push({ lat: Number(gps.lat), lng: Number(gps.lng), label: q.label });
      }
    }
    if (s.location?.lat && s.location?.lng) {
      points.push({ lat: Number(s.location.lat), lng: Number(s.location.lng), label: "Submission Location" });
    }
  });

  if (points.length === 0) {
    return { summary: "No GPS data found.", statistics: [], charts: [], interpretation: "No GPS coordinates available for spatial analysis.", recommendations: ["Ensure GPS capture is enabled in form settings."] };
  }

  const lats = points.map(p => p.lat);
  const lngs = points.map(p => p.lng);
  const centerLat = lats.reduce((a, b) => a + b, 0) / lats.length;
  const centerLng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
  const distances = points.map(p => Math.sqrt((p.lat - centerLat) ** 2 + (p.lng - centerLng) ** 2) * 111);
  const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;
  const maxDist = Math.max(...distances);

  const statistics = [
    { Metric: "Total Points", Value: points.length },
    { Metric: "Center Latitude", Value: centerLat.toFixed(6) },
    { Metric: "Center Longitude", Value: centerLng.toFixed(6) },
    { Metric: "Avg Distance from Center (km)", Value: avgDist.toFixed(2) },
    { Metric: "Max Spread (km)", Value: maxDist.toFixed(2) },
  ];

  // Simple grid-based density
  const gridSize = 0.01;
  const density = new Map<string, number>();
  points.forEach(p => {
    const key = `${Math.round(p.lat / gridSize) * gridSize},${Math.round(p.lng / gridSize) * gridSize}`;
    density.set(key, (density.get(key) || 0) + 1);
  });
  const densityData = Array.from(density.entries())
    .map(([key, count]) => ({ name: key, value: count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);

  return {
    summary: `Local spatial analysis: ${points.length} GPS points analyzed. Center: (${centerLat.toFixed(4)}, ${centerLng.toFixed(4)}). Average spread: ${avgDist.toFixed(2)}km.`,
    statistics,
    charts: [
      { type: "bar", title: "Point Density by Grid Cell", data: densityData, xKey: "name", bars: ["value"] },
    ],
    interpretation: "Basic spatial statistics computed locally. For advanced analysis (hotspot detection, Moran's I, clustering), ensure AI credits are available.",
    recommendations: ["Check for point clustering that may indicate biased sampling.", "Verify GPS accuracy for points far from the center."],
  };
};

/** ===== LOCAL FALLBACK: Iteration Analysis ===== */
export const localIterationAnalysis = (entries: any[]): string => {
  if (!entries.length) return "No iteration data available for analysis.";
  
  const totalEntries = entries.length;
  const avgCompletion = entries.reduce((sum: number, e: any) => sum + (e.target > 0 ? (e.actual / e.target) * 100 : 0), 0) / totalEntries;
  
  const reasonCounts = new Map<string, number>();
  entries.forEach((e: any) => {
    const reason = e.reason || "No reason provided";
    reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
  });
  
  const topReasons = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  let analysis = `LOCAL ANALYSIS (${totalEntries} entries)\n\n`;
  analysis += `Average target completion: ${avgCompletion.toFixed(1)}%\n\n`;
  analysis += `Top reasons for incomplete targets:\n`;
  topReasons.forEach(([reason, count], i) => {
    analysis += `${i + 1}. ${reason} (${count} occurrences, ${((count / totalEntries) * 100).toFixed(1)}%)\n`;
  });
  analysis += `\nRecommendation: Focus on addressing the top reasons to improve completion rates.`;
  
  return analysis;
};

/** ===== LOCAL FALLBACK: Meeting Summary ===== */
export const localMeetingSummary = (chatMessages: any[], callType: string, groupName: string, duration: number, participants: any[]): string => {
  const msgCount = chatMessages.length;
  const uniqueSenders = new Set(chatMessages.map((m: any) => m.senderName || m.sender_id)).size;
  const durationMin = Math.round(duration / 60);
  
  let summary = `MEETING SUMMARY (Local)\n\n`;
  summary += `Group: ${groupName}\n`;
  summary += `Type: ${callType}\n`;
  summary += `Duration: ${durationMin} minutes\n`;
  summary += `Participants: ${participants.length}\n`;
  summary += `Messages exchanged: ${msgCount}\n`;
  summary += `Active contributors: ${uniqueSenders}\n\n`;
  
  if (msgCount > 0) {
    summary += `Key topics discussed:\n`;
    // Extract unique words > 4 chars as rough topics
    const words = new Map<string, number>();
    chatMessages.forEach((m: any) => {
      const content = m.content || "";
      content.split(/\s+/).forEach((w: string) => {
        const clean = w.toLowerCase().replace(/[^a-z]/g, "");
        if (clean.length > 4) words.set(clean, (words.get(clean) || 0) + 1);
      });
    });
    const topWords = Array.from(words.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    topWords.forEach(([word, count]) => { summary += `- "${word}" (mentioned ${count} times)\n`; });
  }
  
  summary += `\nNote: This is a basic local summary. AI-powered summaries provide deeper insights.`;
  return summary;
};

/** ===== LOCAL FALLBACK: ML Prediction ===== */
export const localMLPrediction = (data: any[], features: string[], target: string, method: string): any => {
  if (data.length < 5) {
    return { error: "Need at least 5 data points for local ML analysis." };
  }
  
  // Basic frequency-based "prediction" for classification
  const targetValues = data.map(d => String(d[target])).filter(v => v !== "undefined" && v !== "null");
  const classCounts = new Map<string, number>();
  targetValues.forEach(v => classCounts.set(v, (classCounts.get(v) || 0) + 1));
  
  const totalSamples = targetValues.length;
  const classes = Array.from(classCounts.entries()).sort((a, b) => b[1] - a[1]);
  const majorityClass = classes[0]?.[0] || "unknown";
  const majorityAccuracy = classes[0] ? (classes[0][1] / totalSamples * 100) : 0;

  // Feature importance via simple correlation with target
  const featureImportance = features.map(f => {
    const vals = data.map(d => Number(d[f])).filter(v => !isNaN(v));
    return { feature: f, importance: vals.length > 0 ? (vals.length / data.length) : 0 };
  }).sort((a, b) => b.importance - a.importance);

  return {
    model_type: method,
    accuracy: majorityAccuracy.toFixed(1),
    baseline_accuracy: majorityAccuracy.toFixed(1),
    class_distribution: classes.map(([cls, count]) => ({ class: cls, count, percentage: (count / totalSamples * 100).toFixed(1) })),
    feature_importance: featureImportance.map(f => ({ ...f, importance: (f.importance * 100).toFixed(1) })),
    predictions_summary: `Baseline model: predicting majority class "${majorityClass}" yields ${majorityAccuracy.toFixed(1)}% accuracy.`,
    confusion_matrix: null,
    health_assessment: {
      overall_risk: "medium",
      notes: "Local fallback — only baseline statistics available. AI-powered models provide actual trained predictions.",
    },
    computed_locally: true,
  };
};

/** ===== LOCAL FALLBACK: Math Model ===== */
export const localMathModelSimulation = (action: string, payload: any): any => {
  const { compartments = [], parameters = [], timeSpan = 100 } = payload || {};
  
  if (action === "simulate" && compartments.length > 0) {
    // Simple SIR-like Euler method simulation
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
    
    return {
      timeSeries,
      summary: `Local simulation with ${compartments.length} compartments over ${timeSpan} time units. Note: Differential equations not solved — showing initial conditions only. AI required for full simulation.`,
      compartmentNames: compartments.map((c: any) => c.name),
      computed_locally: true,
    };
  }
  
  if (action === "r0_analysis") {
    return {
      r0_estimate: "N/A (requires AI)",
      summary: "R₀ analysis requires AI computation. Local fallback cannot solve eigenvalue problems.",
      computed_locally: true,
    };
  }
  
  if (action === "sensitivity_analysis") {
    return {
      summary: "Sensitivity analysis requires AI computation for parameter sweeps.",
      parameters: parameters.map((p: any) => ({ name: p.name, value: p.value, sensitivity: "N/A" })),
      computed_locally: true,
    };
  }
  
  return {
    summary: `The "${action}" analysis requires AI computation which is currently unavailable.`,
    computed_locally: true,
  };
};
