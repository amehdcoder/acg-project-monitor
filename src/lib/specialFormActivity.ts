// Aggregates standalone special-form submissions (Bloomberg School Enrolment
// Validation, SeeClear Eye-Health Facility Checklist) into the shared
// field-activity shape so the Dashboard's Field Management widgets reflect ALL
// project/form activity — not just rows stored in form_submissions.
//
// These specialised forms persist their authoritative data in their own tables
// (bloomberg_validations, seeclear_monitoring) rather than form_submissions, so
// they must be fetched and normalised separately.

import { supabase } from "@/integrations/supabase/client";
import {
  BLOOMBERG_FORM_ID,
  SEECLEAR_FORM_ID,
} from "@/lib/specialFormBridge";

export interface SpecialFormSubmission {
  id: string;
  user_id: string;
  form_id: string;
  project_id: string;
  submitted_at: string | null;
  created_at: string;
  data: Record<string, any>;
  location: { lat: number; lng: number } | null;
  submission_type?: string;
  form_name: string;
  project_name: string;
  within_geofence: boolean | null;
  status: string;
}

// Synthetic project ids/names so standalone special forms disaggregate cleanly
// alongside real projects in the Dashboard's "by project" widgets.
export const BLOOMBERG_PROJECT_ID = "__bloomberg_validation__";
export const SEECLEAR_PROJECT_ID = "__seeclear_monitoring__";
export const BLOOMBERG_PROJECT_NAME = "Bloomberg Validation";
export const SEECLEAR_PROJECT_NAME = "SeeClear Monitoring";

// Realtime-subscribable tables that hold standalone special-form activity.
export const SPECIAL_FORM_TABLES = ["bloomberg_validations", "seeclear_monitoring"] as const;

interface FetchOpts {
  dateFrom?: Date | null;
  dateTo?: Date | null;
}

const PAGE = 1000;

async function fetchPaged(
  table: "bloomberg_validations" | "seeclear_monitoring",
  select: string,
  dateCol: string,
  opts: FetchOpts,
): Promise<any[]> {
  let all: any[] = [];
  let from = 0;
  while (true) {
    let q = supabase
      .from(table)
      .select(select)
      .order(dateCol, { ascending: false })
      .range(from, from + PAGE - 1);
    if (opts.dateFrom) q = q.gte(dateCol, opts.dateFrom.toISOString());
    if (opts.dateTo) q = q.lte(dateCol, opts.dateTo.toISOString());
    const { data, error } = await q;
    if (error || !data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

/**
 * Fetch normalised special-form submissions. These forms are not bound to a
 * single project, so they are returned whenever no project filter is applied.
 */
export async function fetchSpecialFormSubmissions(opts: FetchOpts = {}): Promise<SpecialFormSubmission[]> {
  try {
    const [bloomberg, seeclear] = await Promise.all([
      fetchPaged(
        "bloomberg_validations",
        "id, validator_id, submitted_at, created_at, gps_lat, gps_lng, state, lga, ward, location, school_name, grand_total, status",
        "submitted_at",
        opts,
      ).catch(() => []),
      fetchPaged(
        "seeclear_monitoring",
        "id, monitor_id, created_at, gps_lat, gps_lng, state, lga, ward, community, facility_name, overall_score, status",
        "created_at",
        opts,
      ).catch(() => []),
    ]);

    const bloombergRows: SpecialFormSubmission[] = (bloomberg || [])
      .filter((r: any) => r.validator_id)
      .map((r: any) => ({
        id: r.id,
        user_id: r.validator_id,
        form_id: BLOOMBERG_FORM_ID,
        project_id: BLOOMBERG_PROJECT_ID,
        submitted_at: r.submitted_at || r.created_at,
        created_at: r.created_at,
        data: {
          state: r.state,
          lga: r.lga,
          ward: r.ward,
          location: r.location,
          school_name: r.school_name,
          grand_total: r.grand_total,
        },
        location:
          typeof r.gps_lat === "number" && typeof r.gps_lng === "number"
            ? { lat: r.gps_lat, lng: r.gps_lng }
            : null,
        submission_type: "registration",
        form_name: "Bloomberg School Enrolment Validation",
        project_name: "Bloomberg Validation",
        within_geofence: null,
        status: r.status || "sent",
      }));

    const seeclearRows: SpecialFormSubmission[] = (seeclear || [])
      .filter((r: any) => r.monitor_id)
      .map((r: any) => ({
        id: r.id,
        user_id: r.monitor_id,
        form_id: SEECLEAR_FORM_ID,
        submitted_at: r.created_at,
        created_at: r.created_at,
        data: {
          state: r.state,
          lga: r.lga,
          ward: r.ward,
          community: r.community,
          facility_name: r.facility_name,
          overall_score: r.overall_score,
        },
        location:
          typeof r.gps_lat === "number" && typeof r.gps_lng === "number"
            ? { lat: r.gps_lat, lng: r.gps_lng }
            : null,
        submission_type: "monitoring",
        form_name: "SeeClear Eye-Health Facility Checklist",
        project_name: "SeeClear Monitoring",
        within_geofence: null,
        status: r.status || "sent",
      }));

    return [...bloombergRows, ...seeclearRows].filter((r) => (r.status || "sent") === "sent");
  } catch (e) {
    console.warn("fetchSpecialFormSubmissions failed (non-fatal):", e);
    return [];
  }
}
