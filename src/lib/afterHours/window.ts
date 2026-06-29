// After-hours submission window (Nigerian time, Africa/Lagos).
// Submissions are locked from 7:00 PM until 8:00 AM the next morning.

export const AFTER_HOURS_START = 19; // 7 PM
export const AFTER_HOURS_END = 8; //  8 AM

/** Current hour (0-23) in Nigeria, regardless of device timezone. */
export function nigeriaHour(d: Date = new Date()): number {
  try {
    const s = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Lagos",
      hour: "numeric",
      hour12: false,
    }).format(d);
    return parseInt(s, 10) % 24;
  } catch {
    // Fallback: assume UTC+1 (WAT, no DST)
    return (d.getUTCHours() + 1) % 24;
  }
}

/** True when the current Nigerian time is within the locked window. */
export function isAfterHours(d: Date = new Date()): boolean {
  const h = nigeriaHour(d);
  return h >= AFTER_HOURS_START || h < AFTER_HOURS_END;
}

/** Human readable window label for dialogs. */
export const AFTER_HOURS_WINDOW_LABEL = "7:00 PM – 8:00 AM (Nigerian time)";
