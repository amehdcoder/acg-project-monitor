import { flatIndicators, type ProjectLogframe } from "./logframe";

export function validateLogframe(lf: ProjectLogframe): string[] {
  const errors: string[] = [];
  if (!lf.project.name.trim()) errors.push("Enter a project title.");
  if (!lf.objectives.length) errors.push("Add at least one specific objective.");
  for (const objective of lf.objectives) {
    if (!objective.title.trim() || !objective.statement.trim()) errors.push("Each objective needs a title and narrative.");
    if (!objective.results.length) errors.push(`${objective.title || "Objective"}: add a result area.`);
    for (const result of objective.results) {
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