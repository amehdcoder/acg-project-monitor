// Tables whose INSERTs are treated as "form submissions" and therefore gated
// by the after-hours approval workflow. Must stay in sync with the SQL
// allow-list in public._after_hours_allowed_tables().

export const GATED_SUBMISSION_TABLES: Record<string, string> = {
  form_submissions: "Form submission",
  ces_surveys: "Coverage Evaluation 3D survey",
  ces_household_visits: "Coverage Evaluation household visit",
  irf_reports: "ACSM Indicator Report",
  acsm_reports: "ACSM report",
  sbc_reports: "SBC report",
  seeclear_monitoring: "SeeClear monitoring",
  ntd_assessments: "NTD assessment",
  standard_assessment_submissions: "Standard assessment",
  office_form_submissions: "Office form",
  uprp_submissions: "UPRP submission",
  microplan_entries: "Microplan entry",
  bloomberg_validations: "Enrolment validation",
  attendance_records: "Attendance record",
  stock_requests: "Stock request",
  feedback: "Feedback",
  quiz_attempts: "Quiz attempt",
};

export function gatedTableLabel(table: string): string {
  return GATED_SUBMISSION_TABLES[table] ?? "Submission";
}

export function isGatedTable(table: string): boolean {
  return table in GATED_SUBMISSION_TABLES;
}
