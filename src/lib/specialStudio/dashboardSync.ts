// Special Form Studio — bidirectional form <-> dashboard structure sync.
//
// The linked dashboard is described by a DashboardConfig that references form
// questions by their stable `name`. As the form is edited (fields added,
// removed, retyped) the config must stay valid; as the dashboard is
// restructured (metrics/status/geo changed) the form must gain matching
// questions. These helpers keep both directions consistent.

import type { FormGroup, Question, QuestionType } from "@/components/FormBuilder/types";
import type { DashboardConfig, DashboardWidget } from "./presets";

const uid = () => Math.random().toString(36).slice(2, 10);

export function flatQuestions(sections: FormGroup[]): Question[] {
  return sections.flatMap((s) => s.questions || []);
}

export function isNumeric(q: Question): boolean {
  return q.type === "number";
}

export function isCategorical(q: Question): boolean {
  return q.type === "select_one" || q.type === "select_multiple";
}

const GEO_HINT = /(state|lga|ward|community|settlement|facility|location|region|district|zone)/i;

export function isGeoLike(q: Question): boolean {
  if (q.type === "geopoint") return true;
  const s = `${q.name || ""} ${q.label || ""}`;
  return GEO_HINT.test(s);
}

/**
 * Reconcile a dashboard config against the current form structure.
 * Drops references to questions that no longer exist and auto-fills sensible
 * defaults when a slot is empty, so the dashboard always renders meaningfully.
 */
export function reconcileDashboardConfig(
  sections: FormGroup[],
  config: DashboardConfig | null | undefined,
): DashboardConfig {
  const questions = flatQuestions(sections);
  const byName = new Map<string, Question>();
  for (const q of questions) if (q.name) byName.set(q.name, q);

  const accent = config?.accent || "#6366f1";

  // KPIs: keep existing numeric references; if none left, suggest up to 2.
  let kpiFields = (config?.kpiFields || []).filter((n) => {
    const q = byName.get(n);
    return q && isNumeric(q);
  });
  if (kpiFields.length === 0) {
    kpiFields = questions
      .filter((q) => isNumeric(q) && q.name)
      .slice(0, 2)
      .map((q) => q.name!);
  }

  // Status field: keep if still categorical, else suggest first categorical.
  let statusField = config?.statusField;
  if (!statusField || !(byName.get(statusField) && isCategorical(byName.get(statusField)!))) {
    statusField = questions.find((q) => isCategorical(q) && q.name)?.name;
  }

  // Geo field: keep if still present, else suggest first geo-like field.
  let geoField = config?.geoField;
  if (!geoField || !byName.get(geoField)) {
    geoField = questions.find((q) => isGeoLike(q) && q.name)?.name;
  }

  return { enabled: true, kpiFields, statusField, geoField, accent };
}

/** True when a config no longer matches the given sections (needs reconcile). */
export function configNeedsSync(
  sections: FormGroup[],
  config: DashboardConfig | null | undefined,
): boolean {
  if (!config) return false;
  const next = reconcileDashboardConfig(sections, config);
  return (
    JSON.stringify(next.kpiFields) !== JSON.stringify(config.kpiFields || []) ||
    next.statusField !== config.statusField ||
    next.geoField !== config.geoField
  );
}

const DASHBOARD_SECTION_NAME = "sec_dashboard_metrics";

function ensureDashboardSection(sections: FormGroup[]): { sections: FormGroup[]; section: FormGroup } {
  const existing = sections.find((s) => s.name === DASHBOARD_SECTION_NAME);
  if (existing) return { sections, section: existing };
  const section: FormGroup = {
    id: uid(),
    name: DASHBOARD_SECTION_NAME,
    label: "Dashboard metrics",
    questions: [],
  };
  return { sections: [...sections, section], section };
}

function makeQuestion(name: string, label: string, type: QuestionType): Question {
  const q: Question = { id: uid(), type, label, name, required: false };
  if (type === "select_one") {
    q.options = [
      { id: uid(), label: "Option 1", value: "opt1" },
      { id: uid(), label: "Option 2", value: "opt2" },
    ];
  }
  return q;
}

/**
 * Reverse direction: ensure every field referenced by the dashboard config
 * exists as a question in the form. Missing metrics/status/geo fields are
 * created inside a dedicated "Dashboard metrics" section so restructuring the
 * dashboard reshapes the form.
 */
export function applyConfigToForm(
  sectionsIn: FormGroup[],
  config: DashboardConfig,
): FormGroup[] {
  let sections = sectionsIn;
  const existingNames = new Set(flatQuestions(sections).map((q) => q.name).filter(Boolean) as string[]);
  const toCreate: Question[] = [];

  const humanize = (n: string) =>
    n.replace(/_[a-z0-9]{4}$/i, "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim() || n;

  for (const n of config.kpiFields || []) {
    if (n && !existingNames.has(n)) {
      toCreate.push(makeQuestion(n, humanize(n), "number"));
      existingNames.add(n);
    }
  }
  if (config.statusField && !existingNames.has(config.statusField)) {
    toCreate.push(makeQuestion(config.statusField, humanize(config.statusField), "select_one"));
    existingNames.add(config.statusField);
  }
  if (config.geoField && !existingNames.has(config.geoField)) {
    toCreate.push(makeQuestion(config.geoField, humanize(config.geoField), "text"));
    existingNames.add(config.geoField);
  }

  if (toCreate.length === 0) return sections;

  const ensured = ensureDashboardSection(sections);
  sections = ensured.sections.map((s) =>
    s.name === DASHBOARD_SECTION_NAME ? { ...s, questions: [...s.questions, ...toCreate] } : s,
  );
  return sections;
}

// ============================================================================
// Widget model (drag-and-drop dashboard designer)
// ============================================================================

const widgetUid = () => `w_${Math.random().toString(36).slice(2, 10)}`;

/**
 * Build a default widget list from legacy config fields so pre-existing
 * dashboards migrate seamlessly into the new drag-and-drop model.
 */
export function widgetsFromLegacy(config: DashboardConfig | null | undefined): DashboardWidget[] {
  if (!config) return [];
  const accent = config.accent || "#6366f1";
  const widgets: DashboardWidget[] = [];
  widgets.push({ id: widgetUid(), kind: "kpi", agg: "count", title: "Submissions", color: accent, span: 1 });
  for (const name of config.kpiFields || []) {
    widgets.push({ id: widgetUid(), kind: "kpi", field: name, agg: "sum", title: name, color: accent, span: 1 });
  }
  if (config.statusField) {
    widgets.push({ id: widgetUid(), kind: "donut", field: config.statusField, agg: "count", title: "Status breakdown", color: accent, span: 1 });
  }
  if (config.geoField) {
    widgets.push({ id: widgetUid(), kind: "bar", field: config.geoField, agg: "count", title: "By location", color: accent, span: 1 });
  }
  widgets.push({ id: widgetUid(), kind: "table", agg: "count", title: "Recent submissions", color: accent, span: 2 });
  return widgets;
}

/** Ensure a config has a widgets[] array, migrating from legacy fields once. */
export function ensureWidgets(config: DashboardConfig | null | undefined): DashboardWidget[] {
  if (config?.widgets && config.widgets.length) return config.widgets;
  return widgetsFromLegacy(config);
}

/**
 * Drop widgets that reference questions which no longer exist. Widgets with no
 * field (e.g. submission-count KPI, recent-submissions table) always survive.
 */
export function reconcileWidgets(
  sections: FormGroup[],
  widgets: DashboardWidget[] | undefined,
): DashboardWidget[] {
  if (!widgets || !widgets.length) return [];
  const names = new Set(flatQuestions(sections).map((q) => q.name).filter(Boolean) as string[]);
  return widgets.filter((w) => !w.field || names.has(w.field));
}

export function newWidget(kind: DashboardWidget["kind"], field: string | undefined, title: string, color: string): DashboardWidget {
  const defaultAgg: DashboardWidget["agg"] = kind === "kpi" ? "sum" : "count";
  return {
    id: widgetUid(),
    kind,
    field,
    agg: field ? defaultAgg : "count",
    title,
    color,
    span: kind === "table" ? 2 : 1,
  };
}
