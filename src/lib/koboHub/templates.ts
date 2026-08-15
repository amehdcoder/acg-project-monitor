/**
 * Universal Kobo Analytics — WHO widget template gallery.
 *
 * Each template is a preconfigured indicator pattern (KPI tile, chart or table)
 * that binds itself to the best-matching questions in the *live* inferred Kobo
 * schema. Templates that cannot bind (e.g. no numeric question in the form) are
 * reported as unavailable so the gallery can explain why.
 */
import type { HubField, HubSchema } from "./schema";
import { blankWidget, newWidgetId, type HubWidget } from "./dashboard";

export type TemplateCategory =
  | "Headline KPIs" | "Coverage & geography" | "Trends over time"
  | "Quality & completeness" | "Distributions" | "Repeat groups" | "Narrative";

export interface WidgetTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  /** Returns the widgets to insert, or null when the schema cannot support it. */
  build: (schema: HubSchema) => HubWidget[] | null;
  /** Why the template is unavailable for the current form. */
  requirement: string;
}

const NUMERIC = new Set(["integer", "decimal"]);
const CATEGORICAL = new Set(["select_one", "select_multiple", "boolean"]);

const numerics = (s: HubSchema) => s.fields.filter((f) => NUMERIC.has(f.type));
const categoricals = (s: HubSchema) =>
  s.fields.filter((f) => CATEGORICAL.has(f.type) && !Object.values(s.geo).includes(f.name));
const geoLevels = (s: HubSchema) =>
  (["state", "lga", "ward", "community"] as const)
    .map((k) => ({ key: k, name: s.geo[k] }))
    .filter((g): g is { key: typeof g.key; name: string } => !!g.name);

const match = (fields: HubField[], re: RegExp) =>
  fields.find((f) => re.test(f.label) || re.test(f.leaf));

const w = (p: Partial<HubWidget>): HubWidget => ({ ...blankWidget(), id: newWidgetId(), ...p });

export const WIDGET_TEMPLATES: WidgetTemplate[] = [
  {
    id: "kpi-total",
    name: "Total records reported",
    description: "Headline count of every submission currently in scope.",
    category: "Headline KPIs",
    requirement: "Always available.",
    build: () => [w({
      title: "Total submissions", subtitle: "All records synced from KoboToolbox",
      kind: "kpi", agg: "count", span: 3, height: 130, colorIndex: 0,
    })],
  },
  {
    id: "kpi-geo-coverage",
    name: "Administrative coverage KPIs",
    description: "Distinct states, LGAs, wards and communities reached — the standard WHO coverage denominators.",
    category: "Coverage & geography",
    requirement: "Needs at least one geography question (state / LGA / ward / community).",
    build: (s) => {
      const levels = geoLevels(s);
      if (!levels.length) return null;
      return levels.slice(0, 4).map((g, i) => w({
        title: `${g.key.toUpperCase()}s reached`, subtitle: `Distinct ${g.key} values`,
        kind: "kpi", agg: "distinct", dimension: g.name, span: 3, height: 130, colorIndex: i,
      }));
    },
  },
  {
    id: "kpi-indicator-total",
    name: "Indicator total & average",
    description: "Cumulative total plus the mean per record for the first numeric indicator.",
    category: "Headline KPIs",
    requirement: "Needs at least one numeric question.",
    build: (s) => {
      const n = numerics(s)[0];
      if (!n) return null;
      return [
        w({ title: `${n.label} — total`, kind: "kpi", agg: "sum", measure: n.name, span: 3, height: 130, colorIndex: 3 }),
        w({ title: `${n.label} — average`, kind: "kpi", agg: "avg", measure: n.name, span: 3, height: 130, colorIndex: 4 }),
      ];
    },
  },
  {
    id: "trend-daily",
    name: "Daily reporting trend",
    description: "Submission volume by day — surfaces reporting gaps and surge days.",
    category: "Trends over time",
    requirement: "Always available.",
    build: () => [w({
      title: "Submission trend (daily)", subtitle: "Reporting volume per day",
      kind: "line", agg: "count", dimension: "__date", sort: "alpha",
      span: 12, height: 280, limit: 120, colorIndex: 0,
    })],
  },
  {
    id: "trend-monthly",
    name: "Monthly performance curve",
    description: "Monthly aggregation of records — ideal for campaign period comparisons.",
    category: "Trends over time",
    requirement: "Always available.",
    build: () => [w({
      title: "Monthly reporting curve", kind: "area", agg: "count", dimension: "__month",
      sort: "alpha", span: 6, height: 280, limit: 36, colorIndex: 1,
    })],
  },
  {
    id: "trend-indicator",
    name: "Indicator trend over time",
    description: "Sum of a numeric indicator per day — tracks delivery against the campaign calendar.",
    category: "Trends over time",
    requirement: "Needs at least one numeric question.",
    build: (s) => {
      const n = numerics(s)[0];
      if (!n) return null;
      return [w({
        title: `${n.label} by day`, kind: "line", agg: "sum", measure: n.name,
        dimension: "__date", sort: "alpha", span: 6, height: 280, limit: 120, colorIndex: 2,
      })];
    },
  },
  {
    id: "geo-league-table",
    name: "Geographic league table",
    description: "Ranked table of records by the lowest available administrative level.",
    category: "Coverage & geography",
    requirement: "Needs at least one geography question.",
    build: (s) => {
      const levels = geoLevels(s);
      const last = levels[levels.length - 1];
      if (!last) return null;
      return [w({
        title: `Records by ${last.key}`, subtitle: "Ranked performance league table",
        kind: "table", agg: "count", dimension: last.name, span: 6, height: 320, limit: 30, colorIndex: 1,
      })];
    },
  },
  {
    id: "geo-bar",
    name: "Coverage bar by LGA / district",
    description: "Horizontal bar of submissions by the second administrative level.",
    category: "Coverage & geography",
    requirement: "Needs at least one geography question.",
    build: (s) => {
      const levels = geoLevels(s);
      const lvl = levels[1] ?? levels[0];
      if (!lvl) return null;
      return [w({
        title: `Submissions by ${lvl.key}`, kind: "bar", agg: "count",
        dimension: lvl.name, span: 6, height: 340, limit: 20, colorIndex: 0,
      })];
    },
  },
  {
    id: "geo-indicator-stacked",
    name: "Indicator by geography, split by response",
    description: "Stacked column combining a geography level with a categorical response — a classic WHO disaggregation.",
    category: "Distributions",
    requirement: "Needs a geography question and a categorical question.",
    build: (s) => {
      const lvl = geoLevels(s)[1] ?? geoLevels(s)[0];
      const cat = categoricals(s)[0];
      if (!lvl || !cat) return null;
      return [w({
        title: `${cat.label} by ${lvl.key}`, subtitle: "Disaggregated stacked distribution",
        kind: "stacked", agg: "count", dimension: lvl.name, series: cat.name,
        span: 12, height: 340, limit: 15, colorIndex: 0,
      })];
    },
  },
  {
    id: "dist-donut",
    name: "Response distribution donut",
    description: "Share of each response option for the first categorical question.",
    category: "Distributions",
    requirement: "Needs at least one select question.",
    build: (s) => {
      const cat = categoricals(s)[0];
      if (!cat) return null;
      return [w({
        title: cat.label, kind: "donut", agg: "count", dimension: cat.name,
        span: 4, height: 300, limit: 10, colorIndex: 2,
      })];
    },
  },
  {
    id: "dist-all-selects",
    name: "All select questions (grid)",
    description: "Inserts a compact bar chart for every select question in the form.",
    category: "Distributions",
    requirement: "Needs at least one select question.",
    build: (s) => {
      const cats = categoricals(s).slice(0, 12);
      if (!cats.length) return null;
      return cats.map((c, i) => w({
        title: c.label, kind: "bar", agg: "count", dimension: c.name,
        span: 4, height: 280, limit: 10, colorIndex: i % 10,
      }));
    },
  },
  {
    id: "dist-treemap",
    name: "Composition treemap",
    description: "Treemap of the largest categories — good for programme mix at a glance.",
    category: "Distributions",
    requirement: "Needs at least one select question.",
    build: (s) => {
      const cat = categoricals(s)[0];
      if (!cat) return null;
      return [w({
        title: `${cat.label} composition`, kind: "treemap", agg: "count",
        dimension: cat.name, span: 6, height: 320, limit: 16, colorIndex: 5,
      })];
    },
  },
  {
    id: "quality-enumerator",
    name: "Enumerator / submitter workload",
    description: "Records per data collector — used for supervision and data-quality triage.",
    category: "Quality & completeness",
    requirement: "Needs a submitter, enumerator or supervisor question.",
    build: (s) => {
      const f = match(s.fields, /enumerat|collector|supervis|officer|interviewer|staff/i);
      if (!f) return null;
      return [w({
        title: "Workload by data collector", kind: "bar", agg: "count", dimension: f.name,
        span: 6, height: 320, limit: 25, colorIndex: 6,
      })];
    },
  },
  {
    id: "quality-completeness",
    name: "Response completeness table",
    description: "Table of a key question's responses including blanks, to expose missing data.",
    category: "Quality & completeness",
    requirement: "Needs at least one select question.",
    build: (s) => {
      const cat = categoricals(s)[0];
      if (!cat) return null;
      return [w({
        title: `${cat.label} — completeness`, subtitle: "Includes (blank) responses",
        kind: "table", agg: "count", dimension: cat.name, span: 6, height: 300, limit: 30,
        colorIndex: 7, sort: "desc",
      })];
    },
  },
  {
    id: "quality-outliers",
    name: "Indicator maximum by geography",
    description: "Highest recorded value per area — a fast outlier screen for numeric indicators.",
    category: "Quality & completeness",
    requirement: "Needs a numeric question and a geography question.",
    build: (s) => {
      const n = numerics(s)[0];
      const lvl = geoLevels(s)[1] ?? geoLevels(s)[0];
      if (!n || !lvl) return null;
      return [w({
        title: `${n.label} — maximum by ${lvl.key}`, kind: "column", agg: "max",
        measure: n.name, dimension: lvl.name, span: 6, height: 300, limit: 15, colorIndex: 4,
      })];
    },
  },
  {
    id: "repeat-volume",
    name: "Repeat group volume",
    description: "Counts children inside a flattened repeat block — e.g. household members or medicines.",
    category: "Repeat groups",
    requirement: "Needs at least one repeat group in the form.",
    build: (s) => {
      const rep = s.repeats[0];
      if (!rep) return null;
      const dim = rep.fields.find((f) => CATEGORICAL.has(f.type)) ?? rep.fields[0];
      return [
        w({ title: `${rep.label || rep.leaf} — records`, kind: "kpi", agg: "count", source: rep.name, span: 3, height: 130, colorIndex: 8 }),
        w({
          title: `${rep.label || rep.leaf} — ${dim?.label ?? "breakdown"}`, kind: "bar", agg: "count",
          source: rep.name, dimension: dim?.name, span: 6, height: 300, limit: 15, colorIndex: 8,
        }),
      ];
    },
  },
  {
    id: "repeat-indicator-sum",
    name: "Repeat indicator totals",
    description: "Sum of a numeric field inside a repeat block, broken down by its own categories.",
    category: "Repeat groups",
    requirement: "Needs a repeat group containing a numeric question.",
    build: (s) => {
      for (const rep of s.repeats) {
        const n = rep.fields.find((f) => NUMERIC.has(f.type));
        const dim = rep.fields.find((f) => CATEGORICAL.has(f.type));
        if (n) {
          return [w({
            title: `${n.label} total — ${rep.label || rep.leaf}`, kind: "column", agg: "sum",
            measure: n.name, dimension: dim?.name, source: rep.name,
            span: 6, height: 300, limit: 15, colorIndex: 9,
          })];
        }
      }
      return null;
    },
  },
  {
    id: "narrative-note",
    name: "Interpretation / methods note",
    description: "Free-text panel for indicator definitions, methods or WHO guidance references.",
    category: "Narrative",
    requirement: "Always available.",
    build: () => [w({
      title: "Interpretation note", kind: "text", span: 6, height: 200, colorIndex: 1,
      body: "Describe the indicator definition, numerator/denominator and any caveats affecting interpretation.",
    })],
  },
];

export const TEMPLATE_CATEGORIES: TemplateCategory[] = [
  "Headline KPIs", "Coverage & geography", "Trends over time",
  "Distributions", "Quality & completeness", "Repeat groups", "Narrative",
];
