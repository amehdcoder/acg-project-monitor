/**
 * Neutralises spreadsheet formula injection: cells beginning with = + - @
 * (or tab / carriage return) are prefixed with an apostrophe so Excel,
 * Sheets and LibreOffice treat them as text. Plain negative numbers are kept.
 */
export function neutralizeFormula(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) return `'${s}`;
  return s;
}

/** Quote a CSV cell after neutralising formulas. */
export function csvCell(value: unknown): string {
  const s = neutralizeFormula(value);
  return `"${s.replace(/"/g, '""')}"`;
}
