// Longitudinal Beneficiary Record — configuration schema.
//
// 100% of the record structure lives in this configuration object which is
// stored in `programme_modules.config`. No UI code needs to change to add a
// programme component, a section, a question, a status, a referral reason or a
// different Case ID format.

import type { Question } from "@/components/FormBuilder/types";

export interface ProgrammeComponent {
  /** Stable machine key used on services + timeline rows. Never rename. */
  key: string;
  label: string;
  /** lucide-react icon name, e.g. "Eye", "Accessibility", "Brain". */
  icon: string;
  /** HSL triple, e.g. "210 90% 45%" — rendered through inline CSS variables. */
  color: string;
  description?: string;
  hidden?: boolean;
  order: number;
  /** Services this component can deliver — offered in the service dialog. */
  services?: string[];
  /** Extra questions captured when recording a service for this component. */
  questions?: Question[];
  /** Counts towards the "x of y components" progress ring. */
  countsTowardsProgress?: boolean;
}

export interface ProfileSection {
  id: string;
  label: string;
  /** Where the section renders on the Overview tab. */
  placement: "header" | "personal" | "clinical" | "location" | "hidden";
  order: number;
  hidden?: boolean;
  questions: Question[];
}

export interface StatusOption {
  value: string;
  label: string;
  tone: "success" | "warning" | "danger" | "neutral" | "info";
}

export interface WorkflowConfig {
  statuses: StatusOption[];
  riskLevels: StatusOption[];
  serviceStatuses: StatusOption[];
  referralStatuses: StatusOption[];
  referralReasons: string[];
  /** Days after registration/service when a follow-up becomes due. */
  followUpIntervalDays: number;
}

export interface CaseIdConfig {
  prefix: string;
  includeYear: boolean;
  width: number;
}

export interface BrandingConfig {
  title: string;
  subtitle?: string;
  tagline?: string;
  /** HSL triple used for the module header and accents. */
  accent: string;
  logoUrl?: string;
  partnerLogos?: { name: string; url?: string }[];
  footerNote?: string;
  navItems?: string[];
}

export interface LayoutConfig {
  /** Profile field keys rendered in the record header row. */
  headerFields: string[];
  /** Profile field keys rendered in the "Key clinical & social" card. */
  clinicalFields: string[];
  quickActions: { key: string; label: string; icon: string }[];
  showTimeline: boolean;
  showReferrals: boolean;
  showNextFollowUp: boolean;
  showLocationMap: boolean;
  showProgressRing: boolean;
  showDataQuality: boolean;
}

export interface DataQualityRule {
  id: string;
  /** Profile field key (or "component:<key>") that must be present. */
  field: string;
  label: string;
  severity: "critical" | "warning";
}

export interface ProgrammeModuleConfig {
  version: number;
  branding: BrandingConfig;
  caseId: CaseIdConfig;
  components: ProgrammeComponent[];
  sections: ProfileSection[];
  workflow: WorkflowConfig;
  layout: LayoutConfig;
  dataQuality: DataQualityRule[];
}

export interface ProgrammeModuleRow {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  config: ProgrammeModuleConfig;
  is_active: boolean;
  is_template: boolean;
  created_at: string;
  updated_at: string;
}

export interface BeneficiaryRow {
  id: string;
  module_id: string;
  project_id: string;
  case_id: string;
  full_name: string;
  profile: Record<string, unknown>;
  status: string;
  risk_level: string | null;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  state: string | null;
  lga: string | null;
  ward: string | null;
  village: string | null;
  next_follow_up_date: string | null;
  created_at: string;
  updated_at: string;
  /** Client-only: true while the record is still queued offline. */
  __pending?: boolean;
}

export interface BeneficiaryServiceRow {
  id: string;
  beneficiary_id: string;
  module_id: string;
  project_id: string;
  component_key: string;
  service_name: string | null;
  service_date: string;
  result: string | null;
  status: string;
  data: Record<string, unknown>;
  created_at: string;
  __pending?: boolean;
}

export interface BeneficiaryReferralRow {
  id: string;
  beneficiary_id: string;
  project_id: string;
  component_key: string | null;
  referred_to: string;
  reason: string | null;
  referral_date: string;
  status: string;
  notes: string | null;
  created_at: string;
  __pending?: boolean;
}

export interface BeneficiaryAuditRow {
  id: string;
  beneficiary_id: string;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  actor_id: string;
  created_at: string;
}
