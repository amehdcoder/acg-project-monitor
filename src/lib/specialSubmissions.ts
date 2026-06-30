import { supabase } from "@/integrations/supabase/client";
import { getCategoryForm } from "@/lib/irf/categoryForms";

/**
 * Standalone "special" forms store their submissions in their own dedicated
 * tables (NOT `form_submissions`). The generic Submission History only reads
 * `form_submissions`, so these submissions were invisible to the user who made
 * them. This registry lets "My Submissions" surface every standalone-form
 * submission a user has made, alongside the normal ones.
 */
export interface SpecialSource {
  /** Database table holding the submissions. */
  table: string;
  /** Column that identifies the submitting user. */
  userCol: string;
  /** Human friendly form/programme name. */
  label: string;
  /** Accent colour (hex) used for the colourful card treatment. */
  accent: string;
  /** Optional resolver for a more specific per-row title. */
  title?: (row: any) => string | undefined;
}

const EXCLUDE_KEYS = new Set([
  "id", "project_id", "created_by", "user_id", "submitted_by", "owner_id",
  "created_at", "updated_at", "submitted_at", "synced_at", "deleted_at",
  "evidence", "answers", "gps_lat", "gps_lng", "location", "within_geofence",
  "submission_status", "status",
]);

export const SPECIAL_SOURCES: SpecialSource[] = [
  {
    table: "irf_reports",
    userCol: "created_by",
    label: "SARMAAN ACSM (SAIRF)",
    accent: "#1a4a6e",
    title: (r) => getCategoryForm(r.form_category)?.name || "SARMAAN ACSM Report",
  },
  { table: "acsm_reports", userCol: "created_by", label: "ACSM Report", accent: "#7c3aed" },
  { table: "sbc_reports", userCol: "created_by", label: "SBC Report", accent: "#db2777" },
  { table: "seeclear_monitoring", userCol: "created_by", label: "SeeClear Monitoring", accent: "#0891b2" },
  { table: "ntd_assessments", userCol: "created_by", label: "NTD Assessment", accent: "#16a34a" },
  { table: "ces_surveys", userCol: "created_by", label: "Coverage Evaluation 3D", accent: "#ea580c" },
  { table: "standard_assessment_submissions", userCol: "submitted_by", label: "Standard Assessment", accent: "#2563eb" },
  { table: "uprp_submissions", userCol: "created_by", label: "UPRP Submission", accent: "#9333ea" },
];

export interface SpecialSubmission {
  id: string;
  form_id: string;
  form_name: string;
  sourceLabel: string;
  accent: string;
  data: Record<string, any>;
  created_at: string;
  submitted_at: string | null;
  isSpecial: true;
  lat?: number | null;
  lng?: number | null;
}

function humanize(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function buildData(row: any): Record<string, any> {
  const out: Record<string, any> = {};
  Object.entries(row).forEach(([k, v]) => {
    if (EXCLUDE_KEYS.has(k)) return;
    if (v === null || v === undefined || v === "") return;
    if (typeof v === "object" && !Array.isArray(v)) return;
    out[humanize(k)] = v;
  });
  // Merge free-form answers if present.
  if (row.answers && typeof row.answers === "object") {
    Object.entries(row.answers).forEach(([k, v]) => {
      if (v === null || v === undefined || v === "") return;
      out[humanize(k)] = v;
    });
  }
  return out;
}

/**
 * Fetch every standalone special-form submission made by a user. Each table is
 * queried independently and failures are swallowed so a single missing
 * column/table never breaks the whole page.
 */
export async function fetchUserSpecialSubmissions(
  userId: string,
  opts: { allUsers?: boolean } = {},
): Promise<SpecialSubmission[]> {
  const results = await Promise.all(
    SPECIAL_SOURCES.map(async (src) => {
      try {
        let q = supabase.from(src.table as any).select("*");
        if (!opts.allUsers) q = q.eq(src.userCol, userId);
        const { data, error } = await q.order("created_at", { ascending: false }).limit(500);
        if (error || !data) return [] as SpecialSubmission[];
        return (data as any[]).map((row) => ({
          id: `${src.table}:${row.id}`,
          form_id: `${src.table}:${row.form_category || src.table}`,
          form_name: src.title?.(row) || src.label,
          sourceLabel: src.label,
          accent: src.accent,
          data: buildData(row),
          created_at: row.created_at,
          submitted_at: row.submitted_at || row.created_at || null,
          isSpecial: true as const,
          lat: row.gps_lat ?? null,
          lng: row.gps_lng ?? null,
        }));
      } catch {
        return [] as SpecialSubmission[];
      }
    }),
  );
  return results.flat();
}
