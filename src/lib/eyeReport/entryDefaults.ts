/** Local calendar day, including devices whose timezone differs from UTC. */
export function localReportDate(now = new Date()): string {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

/** Existing reports retain evidence; a new facility entry starts a fresh day. */
export function facilityEntryDefaults<T>(editing: boolean, date: string, patients: T[], now = new Date()) {
  return editing ? { date, patients } : { date: localReportDate(now), patients: [] as T[] };
}