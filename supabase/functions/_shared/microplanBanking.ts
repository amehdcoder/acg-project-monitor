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