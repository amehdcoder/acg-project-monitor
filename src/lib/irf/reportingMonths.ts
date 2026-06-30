// Reporting month options for the SARMAAN ACSM (SAIRF) forms.
//
// Months are anchored to the Nigerian calendar (Africa/Lagos) so the list always
// reflects "today" in Nigeria regardless of the device timezone. New months are
// added automatically as we enter them — the current Nigerian month is always the
// first (default) option. A small set of upcoming months is also offered so teams
// can pre-plan reporting periods.

export interface ReportingMonthOption {
  value: string; // YYYY-MM
  label: string; // e.g. "June 2026"
}

/** Current date parts (year, month index 0-11) in Africa/Lagos. */
function nowInLagos(): { year: number; month: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Lagos",
      year: "numeric",
      month: "numeric",
    }).formatToParts(new Date());
    const year = Number(parts.find((p) => p.type === "year")?.value);
    const month = Number(parts.find((p) => p.type === "month")?.value) - 1;
    if (Number.isFinite(year) && Number.isFinite(month)) return { year, month };
  } catch {
    /* fall through */
  }
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() };
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const START_YEAR = 2024;
const START_MONTH = 0; // January 2024
const FUTURE_MONTHS = 6; // allow planning a little ahead

/**
 * Build the reporting-month list (most recent first), spanning from January 2024
 * through a few months past the current Nigerian month. Because it is computed at
 * call time from the Africa/Lagos clock, the current month appears automatically
 * every time we roll into a new month.
 */
export function getReportingMonthOptions(): ReportingMonthOption[] {
  const { year, month } = nowInLagos();
  const out: ReportingMonthOption[] = [];

  // End anchor = current Nigerian month + FUTURE_MONTHS.
  let endYear = year;
  let endMonth = month + FUTURE_MONTHS;
  endYear += Math.floor(endMonth / 12);
  endMonth = ((endMonth % 12) + 12) % 12;

  let y = endYear;
  let m = endMonth;
  while (y > START_YEAR || (y === START_YEAR && m >= START_MONTH)) {
    out.push({
      value: `${y}-${String(m + 1).padStart(2, "0")}`,
      label: `${MONTH_NAMES[m]} ${y}`,
    });
    m -= 1;
    if (m < 0) { m = 11; y -= 1; }
  }
  return out;
}

/** The default (current Nigerian month) value. */
export function getCurrentReportingMonth(): string {
  const { year, month } = nowInLagos();
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}
