import { flatIndicators, type ProjectLogframe } from "./logframe";
import { validLogframeColor } from "./logframeColor";

export function validateLogframe(lf: ProjectLogframe): string[] {
  const errors: string[] = [];
  if (!lf.project.name.trim()) errors.push("Enter a project title.");
  if (!lf.objectives.length) errors.push("Add at least one specific objective.");
  for (const objective of lf.objectives) {
    if (!validLogframeColor(objective.color)) errors.push(`${objective.title}: choose a valid six-digit hex colour.`);
    if (!objective.title.trim() || !objective.statement.trim()) errors.push("Each objective needs a title and narrative.");
    if (!objective.results.length) errors.push(`${objective.title || "Objective"}: add a result area.`);
    for (const result of objective.results) {
      if (!validLogframeColor(result.color)) errors.push(`${result.title}: choose a valid six-digit hex colour.`);
      if (!result.title.trim()) errors.push("Each result area needs a title.");
      for (const activity of result.activities) {
        if (!activity.title.trim()) errors.push(`${activity.code || "Activity"}: enter an activity title.`);
      }
    }
  }
  const codes = new Set<string>();
  for (const indicator of flatIndicators(lf.objectives)) {
    const code = indicator.code.trim().toLowerCase();
    if (!code || !indicator.title.trim()) errors.push("Each indicator and activity needs a code and indicator name.");
    if (codes.has(code)) errors.push(`Duplicate code: ${indicator.code}.`);
    codes.add(code);
    if (!validLogframeColor(indicator.color)) errors.push(`${indicator.code}: choose a valid six-digit hex colour.`);
    const dimensions = indicator.disaggregationConfig ?? [];
    const labels = dimensions.map(d => d.label.trim().toLowerCase());
    if (labels.some(l => !l) || new Set(labels).size !== labels.length) errors.push(`${indicator.code}: dimension names must be present and unique.`);
    for (const dimension of dimensions) {
      if (dimension.kind !== "options") continue;
      const options = (dimension.options ?? []).map(o => o.trim());
      if (options.some(o => !o) || new Set(options.map(o => o.toLowerCase())).size !== options.length || (!options.length && !dimension.allowOther)) errors.push(`${indicator.code}: ${dimension.label} needs unique, non-empty options or additional options enabled.`);
    }
    if (indicator.autoKey === "referral_completion") {
      for (const target of [...indicator.targets, indicator.totalTarget]) {
        if (target == null || target.trim() === "") continue;
        const value = Number(target.replace(/%/g, ""));
        if (!Number.isFinite(value) || value < 0 || value > 100) errors.push(`${indicator.code}: referral targets must be between 0 and 100%.`);
      }
    }
  }
  return [...new Set(errors)];
}