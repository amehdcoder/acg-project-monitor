export const BANKING_TEXT_MAX = 150;
export const BANKING_FIELDS = [
  'cdd_account_name', 'cdd_account_number', 'cdd_bank',
  'flhf_account_name', 'flhf_account_number', 'flhf_bank',
] as const;
export type BankingField = typeof BANKING_FIELDS[number];

/** Format only: a local check cannot establish account existence or ownership. */
export function nigerianAccountNumberError(value: string): string | null {
  if (!value) return null;
  if (!/^[0-9]{10}$/.test(value)) return 'Enter exactly 10 digits for a Nigerian account number.';
  if (value === '0000000000') return 'An account number cannot contain only zeros.';
  return null;
}

export function validatedMicroplanBanking(input: Record<string, unknown>): Record<BankingField, string | null> {
  const result = {} as Record<BankingField, string | null>;
  for (const field of BANKING_FIELDS) {
    const raw = input[field];
    const label = `${field.startsWith('cdd_') ? 'CDD' : 'FLHF'} ${field.endsWith('account_number') ? 'account number' : field.endsWith('account_name') ? 'account name' : 'bank'}`;
    if (raw == null) { result[field] = null; continue; }
    if (typeof raw !== 'string') throw new Error(`${label} must be text.`);
    const value = raw.trim();
    const error = field.endsWith('account_number')
      ? nigerianAccountNumberError(value)
      : value.length > BANKING_TEXT_MAX ? `Use no more than ${BANKING_TEXT_MAX} characters.` : null;
    if (error) throw new Error(`${label}: ${error}`);
    result[field] = value || null;
  }
  return result;
}
export type CddDetail = { name: string; phone: string; account_name: string; account_number: string; bank: string };

/** Validate repeated CDD rows; blank rows are dropped. */
export function validatedCddDetails(raw: unknown): CddDetail[] {
  if (raw == null) return [];
  if (!Array.isArray(raw) || raw.length > 100) throw new Error('CDD list is invalid.');
  const out: CddDetail[] = [];
  raw.forEach((item, i) => {
    if (!item || typeof item !== 'object') throw new Error(`CDD ${i + 1} is invalid.`);
    const r = item as Record<string, unknown>;
    const get = (k: string, max: number) => { const v = r[k]; if (v != null && typeof v !== 'string') throw new Error(`CDD ${i + 1}: ${k} must be text.`); const s = String(v ?? '').trim(); if (s.length > max) throw new Error(`CDD ${i + 1}: ${k} is too long.`); return s; };
    const row = { name: get('name', 150), phone: get('phone', 30), account_name: get('account_name', BANKING_TEXT_MAX), account_number: get('account_number', 10), bank: get('bank', BANKING_TEXT_MAX) };
    if (!Object.values(row).some(Boolean)) return;
    if (!row.name) throw new Error(`CDD ${i + 1}: enter the CDD's name.`);
    const err = nigerianAccountNumberError(row.account_number); if (err) throw new Error(`CDD ${i + 1} (${row.name}): ${err}`);
    out.push(row);
  });
  return out;
}

/** Legacy summary columns kept in sync so risk scores, exports and older devices keep working. */
export function cddLegacyColumns(list: CddDetail[]) {
  const first = list[0];
  return {
    cdd_names: list.map(c => c.name).join(', '),
    cdd_phone_numbers: list.map(c => c.phone).filter(Boolean).join(', '),
    cdd_account_name: first?.account_name || null, cdd_account_number: first?.account_number || null, cdd_bank: first?.bank || null,
  };
}

/** Turn older comma-separated records into individual rows. */
export function cddDetailsFromLegacy(input: { cdd_details?: unknown; cdd_names?: string | null; cdd_phone_numbers?: string | null; cdd_account_name?: string | null; cdd_account_number?: string | null; cdd_bank?: string | null }): CddDetail[] {
  if (Array.isArray(input.cdd_details) && input.cdd_details.length) return input.cdd_details as CddDetail[];
  const names = String(input.cdd_names || '').split(',').map(s => s.trim()).filter(Boolean);
  const phones = String(input.cdd_phone_numbers || '').split(',').map(s => s.trim());
  return names.map((name, i) => ({ name, phone: phones[i] || '', account_name: i === 0 ? input.cdd_account_name || '' : '', account_number: i === 0 ? input.cdd_account_number || '' : '', bank: i === 0 ? input.cdd_bank || '' : '' }));
}
