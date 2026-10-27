/** Open the latest submitted month, not an unrelated previous calendar month. */
export function latestEyeReportingMonth(rows: { report_date?: string | null }[], now = new Date()): string {
  return rows.reduce((latest, row) => {
    const month = row.report_date?.slice(0, 7) ?? "";
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month > latest ? month : latest;
  }, "") || now.toISOString().slice(0, 7);
}