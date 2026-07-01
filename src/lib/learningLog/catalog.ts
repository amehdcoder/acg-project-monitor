// Learning Log — a fixed catalogue of app features, the field issues that were
// identified while using them, how each was resolved, and the current status.
//
// This is auto-generated from a maintained feature list so the whole team can
// see, at a glance, the reliability journey of every major capability.

export type FeatureStatus = "Operational" | "Monitoring" | "Resolved" | "In Progress";

export interface LearningLogEntry {
  id: string;
  feature: string;
  category: string;
  description: string;
  /** Issue identified in the field, or null if none reported. */
  fieldIssue: string | null;
  /** How the issue was resolved. */
  resolution: string | null;
  status: FeatureStatus;
}

export const LEARNING_LOG: LearningLogEntry[] = [
  {
    id: "ces-3d",
    feature: "Coverage Evaluation 3D",
    category: "Field Intelligence",
    description: "2.5D village mapping, geofenced household visits and ordered offline sync.",
    fieldIssue: "GPS failed to lock indoors; 'Draw on Map' stopped drawing and the satellite base map loaded slowly.",
    resolution: "Added A-GPS warm-up with cached/last-known fallback, restored vertex drawing by making overlays non-interactive in draw mode, and seeded instant satellite tiles from an offline cache.",
    status: "Operational",
  },
  {
    id: "location-bridge",
    feature: "Checklist → CES Location Bridge",
    category: "Field Intelligence",
    description: "Prefills and locks State→Settlement from the MDA checklist into Coverage Evaluation 3D.",
    fieldIssue: "Prefill occasionally missing when navigating offline.",
    resolution: "Added a durable localStorage bridge plus a fallback entry flow with a clear banner.",
    status: "Operational",
  },
  {
    id: "mda-dashboard",
    feature: "Integrated MDA Supervisory Dashboard",
    category: "Analytics",
    description: "Bloomberg-style supervisory coverage, treatment status and adverse-reaction analytics.",
    fieldIssue: "Submission counts did not align and 'Unknown/Unspecified' status rows appeared.",
    resolution: "Centralised KPI logic, filtered blank-LGA rows, and keyed status to the primary checklist questions.",
    status: "Operational",
  },
  {
    id: "sairf-dashboard",
    feature: "SARMAAN ACSM Indicator Dashboard",
    category: "Analytics",
    description: "Advocacy, town-announcer, compound-meeting and community-dialogue insights for Kano State.",
    fieldIssue: "KPIs read zero because category-form answers live in a JSON column; some submissions were lost after a rename.",
    resolution: "Added a normalisation layer to flatten JSON answers and repaired orphaned reports' project links.",
    status: "Operational",
  },
  {
    id: "sairf-forms",
    feature: "SAIRF Standalone Activity Forms",
    category: "Data Collection",
    description: "Four access-gated activity forms with GPS, photo evidence and consent capture.",
    fieldIssue: "Validation blocked submission even when all required fields were filled (missing GPS); photo capture couldn't pick from Android gallery.",
    resolution: "Added pinpoint validation with scroll-to-error, a manual GPS fallback after 12s, and separate Capture / Choose upload buttons.",
    status: "Operational",
  },
  {
    id: "offline-forms",
    feature: "Offline Form Data Collection",
    category: "Data Collection",
    description: "End-to-end offline capture with background sync when connectivity returns.",
    fieldIssue: "Uploads failed with 'Failed to fetch' on weak networks and large photos.",
    resolution: "Added resilient upload with automatic photo downscaling (≤1600px) and network retries.",
    status: "Operational",
  },
  {
    id: "skip-logic",
    feature: "Form Skip Logic",
    category: "Form Builder",
    description: "Multi-condition skip logic with AND/OR operators and cached runtime evaluation.",
    fieldIssue: "Skip logic disappeared after saving a form.",
    resolution: "Fixed state restoration in the builder so conditions persist across saves.",
    status: "Operational",
  },
  {
    id: "after-hours",
    feature: "After-Hours Submission Gate",
    category: "Governance",
    description: "Locks submissions 7 PM–8 AM with an admin approval and replay workflow.",
    fieldIssue: "Approval dialog showed 'Unknown user' and approving could hit a duplicate-key error.",
    resolution: "Keyed requests on user_id and made the approval insert idempotent by regenerating the id on conflict.",
    status: "Operational",
  },
  {
    id: "accounts-email",
    feature: "Account Creation & Emails",
    category: "User Management",
    description: "Admin-created accounts with welcome / notification emails over SMTP.",
    fieldIssue: "Accounts were created but the welcome email never arrived.",
    resolution: "Replaced the crashing mail library with a hand-rolled SMTP-over-TLS client and surfaced exact SMTP errors in account history.",
    status: "Monitoring",
  },
  {
    id: "email-verify",
    feature: "Email Verification & Sign-up",
    category: "User Management",
    description: "Independent self sign-up with admin project assignment auto-approval.",
    fieldIssue: "Verification links were consumed by scanner pre-fetches; users stayed pending.",
    resolution: "Added a dedicated confirm page and an auto-approve trigger on project assignment.",
    status: "Operational",
  },
  {
    id: "android-crash",
    feature: "Android Compatibility",
    category: "Platform",
    description: "Reliable startup and rendering across low- and high-end Android WebViews.",
    fieldIssue: "App crashed on older devices (e.g. Infinix Hot Note 10) and sometimes showed a static splash.",
    resolution: "Added polyfills (crypto.randomUUID) and an 8-second mount watchdog that forces a reload.",
    status: "Monitoring",
  },
  {
    id: "street-view",
    feature: "Google Street View",
    category: "Maps",
    description: "In-app street view across geographic maps with an automatic fallback.",
    fieldIssue: "Street View failed to load when keys/billing were misconfigured.",
    resolution: "Added an auth-failure hook with an automatic Mapillary fallback and a secure key edge function.",
    status: "Operational",
  },
  {
    id: "dashboard-access",
    feature: "Dashboard Access Grants",
    category: "Governance",
    description: "Owner/Admin can grant members access to specific dashboards with email notification.",
    fieldIssue: "None reported yet — newly released.",
    resolution: null,
    status: "In Progress",
  },
  {
    id: "excel-export",
    feature: "Formatted Excel Export",
    category: "Analytics",
    description: "Colourful, section-structured Excel workbooks with per-form sheets and a merged-by-date sheet.",
    fieldIssue: "None reported yet — newly released.",
    resolution: null,
    status: "In Progress",
  },
  {
    id: "messaging",
    feature: "Messaging & Presence",
    category: "Collaboration",
    description: "Real-time direct chat with unread badges and 'Active now' indicators.",
    fieldIssue: "Widget crashed with a channel subscription error.",
    resolution: "Gave each realtime channel a unique instance id to avoid duplicate subscriptions.",
    status: "Operational",
  },
];

export const LEARNING_LOG_CATEGORIES = Array.from(new Set(LEARNING_LOG.map((e) => e.category))).sort();

export const STATUS_STYLES: Record<FeatureStatus, { bg: string; text: string; ring: string }> = {
  Operational: { bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-300", ring: "ring-emerald-500/30" },
  Monitoring: { bg: "bg-amber-50 dark:bg-amber-500/10", text: "text-amber-700 dark:text-amber-300", ring: "ring-amber-500/30" },
  Resolved: { bg: "bg-sky-50 dark:bg-sky-500/10", text: "text-sky-700 dark:text-sky-300", ring: "ring-sky-500/30" },
  "In Progress": { bg: "bg-violet-50 dark:bg-violet-500/10", text: "text-violet-700 dark:text-violet-300", ring: "ring-violet-500/30" },
};
