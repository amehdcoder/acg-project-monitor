// Clone a built-in / special dashboard into an editable Dashboard Studio dashboard.
// Non-destructive: creates form-backed data sources + a new custom_dashboard
// pre-seeded with starter widgets, then hands control to the Studio.

import { supabase } from "@/integrations/supabase/client";
import { fieldsFromForm, fieldsFromRows, mergeFields } from "@/hooks/useDashboardSources";
import type { SourceField } from "@/lib/dashboardStudio/types";
import type { StudioWidgetConfig } from "@/lib/dashboardStudio/aggregate";

export interface BuiltInPreset {
  key: string;
  name: string;
  description: string;
  /** Exact form names that power this dashboard (first match per name is used). */
  formNames: string[];
}

/** The built-in dashboards editors can clone into the Studio. */
export const BUILT_IN_PRESETS: BuiltInPreset[] = [
  {
    key: "sarmaan_acsm",
    name: "SARMAAN ACSM Indicator Tracking",
    description: "SARMAAN ACSM Indicator Reporting Form (SAIRF) submissions.",
    formNames: ["SARMAAN ACSM Indicator Reporting Form (SAIRF)"],
  },
  {
    key: "sarmaan_learning",
    name: "SARMAAN Programme Implementation Learning & Improvement",
    description: "SARMAAN Supervisory Checklist submissions.",
    formNames: ["SARMAAN Supervisory Checklist"],
  },
  {
    key: "mda_supervisory",
    name: "Integrated MDA Supervisory",
    description: "Integrated MDA Supervisory Checklist submissions.",
    formNames: ["Integrated MDA Supervisory Checklist"],
  },
  {
    key: "bloomberg",
    name: "Bloomberg School Enrolment Validation",
    description: "Bloomberg School Enrolment Validation submissions.",
    formNames: ["Bloomberg School Enrolment Validation"],
  },
  {
    key: "seeclear",
    name: "See Clear (Eye Health Facility Monitoring)",
    description: "Eye Health Facility Monitoring Checklist submissions.",
    formNames: ["Eye Health Facility Monitoring Checklist"],
  },
];

const BASE_FORM_FIELDS: SourceField[] = [
  { id: "submitted_at", label: "Submitted at", type: "date" },
  { id: "location", label: "Location", type: "text" },
  { id: "state", label: "State", type: "text" },
  { id: "status", label: "Status", type: "text" },
];

async function buildFormSource(formId: string, formName: string, userId: string) {
  const [{ data: formRow }, { data: subs }] = await Promise.all([
    supabase.from("forms").select("name, questions").eq("id", formId).maybeSingle(),
    supabase
      .from("form_submissions")
      .select("data, submitted_at, location, state, status")
      .eq("form_id", formId)
      .order("submitted_at", { ascending: false })
      .limit(200),
  ]);
  const rows = (subs ?? []).map((r: any) => ({
    submitted_at: r.submitted_at, location: r.location, state: r.state, status: r.status,
    ...(r.data && typeof r.data === "object" ? r.data : {}),
  }));
  const schema = mergeFields(
    BASE_FORM_FIELDS,
    fieldsFromForm((formRow as any)?.questions),
    fieldsFromRows(rows),
  );
  const { data, error } = await supabase
    .from("dashboard_data_sources")
    .insert([{ name: formName, source_kind: "form", config: { formId } as any, schema: schema as any, created_by: userId }])
    .select()
    .single();
  if (error) throw error;
  return { id: (data as any).id as string, schema };
}

/** Pick a sensible default dimension (state/lga/ward) for starter charts. */
function pickDimension(schema: SourceField[]): string | undefined {
  const prefs = ["lga", "state", "ward", "community"];
  for (const p of prefs) {
    const f = schema.find((s) => s.id.toLowerCase() === p);
    if (f) return f.id;
  }
  return schema.find((s) => s.type === "text")?.id;
}

/**
 * Clone a preset into a new editable Studio dashboard.
 * Returns { id, name } of the new dashboard, or null on failure.
 */
export async function cloneBuiltInDashboard(
  preset: BuiltInPreset,
  userId: string,
): Promise<{ id: string; name: string } | null> {
  // 1) Resolve forms by name (distinct, first id per name).
  const { data: allForms } = await supabase.from("forms").select("id, name");
  const resolved: { id: string; name: string }[] = [];
  for (const wanted of preset.formNames) {
    const match = (allForms ?? []).find((f: any) => f.name === wanted);
    if (match) resolved.push({ id: match.id, name: match.name });
  }
  if (resolved.length === 0) {
    throw new Error(`No matching forms found for "${preset.name}".`);
  }

  // 2) Build a data source per form.
  const sources: { id: string; schema: SourceField[] }[] = [];
  for (const f of resolved) {
    sources.push(await buildFormSource(f.id, f.name, userId));
  }
  const primary = sources[0];

  // 3) Create the dashboard.
  const dashName = `${preset.name} (Studio)`;
  const { data: dash, error: dashErr } = await supabase
    .from("custom_dashboards")
    .insert([{ name: dashName, description: preset.description, created_by: userId, layout: [] as any, default_data_source_id: primary.id }])
    .select()
    .single();
  if (dashErr) throw dashErr;
  const dashboardId = (dash as any).id as string;

  // 4) Seed starter widgets.
  const dim = pickDimension(primary.schema);
  const numeric = primary.schema.find((s) => s.type === "number");
  const starters: { title: string; widget_type: string; config: StudioWidgetConfig; position: any }[] = [
    {
      title: "Total records",
      widget_type: "scorecard",
      config: { dataSourceId: primary.id, chartType: "scorecard", aggregation: "count" },
      position: { order: 0, w: 4 },
    },
    {
      title: dim ? `Records by ${dim}` : "Breakdown",
      widget_type: "column",
      config: { dataSourceId: primary.id, chartType: "column", aggregation: "count", dimension: dim },
      position: { order: 1, w: 8 },
    },
    {
      title: "All submissions",
      widget_type: "table",
      config: {
        dataSourceId: primary.id, chartType: "table", aggregation: numeric ? "sum" : "count",
        dimension: dim, metric: numeric?.id,
      },
      position: { order: 2, w: 12 },
    },
  ];
  await supabase.from("dashboard_widgets").insert(
    starters.map((s) => ({
      dashboard_id: dashboardId, title: s.title, widget_type: s.widget_type,
      config: s.config as any, position: s.position as any, data_source_id: primary.id,
    })),
  );

  return { id: dashboardId, name: dashName };
}
