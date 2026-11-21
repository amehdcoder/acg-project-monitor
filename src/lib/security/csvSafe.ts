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

/**
 * Neutralise formulas in every cell of an already-built CSV text while keeping
 * its quoting, delimiters, line breaks and any leading byte-order mark.
 */
export function sanitizeCsvText(csv: string, delimiter = ","): string {
  let out = "";
  let i = 0;
  if (csv.charCodeAt(0) === 0xfeff) { out = "\ufeff"; i = 1; }
  const n = csv.length;
  while (i <= n) {
    if (csv[i] === '"') {
      // Quoted cell: read to closing quote, honouring doubled quotes.
      let j = i + 1; let raw = "";
      while (j < n) {
        if (csv[j] === '"') { if (csv[j + 1] === '"') { raw += '"'; j += 2; continue; } j++; break; }
        raw += csv[j++];
      }
      out += `"${neutralizeFormula(raw).replace(/"/g, '""')}"`;
      i = j;
    } else {
      let j = i;
      while (j < n && csv[j] !== delimiter && csv[j] !== "\n" && csv[j] !== "\r") j++;
      const raw = csv.slice(i, j);
      const safe = neutralizeFormula(raw);
      out += safe !== raw && /[",]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
      i = j;
    }
    if (i >= n) break;
    out += csv[i++]; // delimiter or line-break character
  }
  return out;
}
