import { z } from 'zod';
import { BANKING_TEXT_MAX, nigerianAccountNumberError } from '../../../supabase/functions/_shared/microplanBanking';

export { BANKING_TEXT_MAX, nigerianAccountNumberError };

const bankingText = z.string().trim().max(BANKING_TEXT_MAX).nullish();
const accountNumber = z.string().trim().superRefine((value, ctx) => {
  const message = nigerianAccountNumberError(value);
  if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
}).nullish();

export const microplanBankingSchema = z.object({
  cdd_account_name: bankingText,
  cdd_account_number: accountNumber,
  cdd_bank: bankingText,
  flhf_account_name: bankingText,
  flhf_account_number: accountNumber,
  flhf_bank: bankingText,
});

export const bankNameSchema = z.string().trim().min(2, 'Enter a bank name.').max(BANKING_TEXT_MAX);
export const bankNameKey = (name: string) => name.trim().toLocaleLowerCase().replace(/[^a-z0-9]/g, '');

/** Deduplicate names without silently choosing a different institution. */
export function mergeBankNames(...lists: string[][]): string[] {
  const names = new Map<string, string>();
  for (const name of lists.flat()) {
    const parsed = bankNameSchema.safeParse(name);
    if (parsed.success && !names.has(bankNameKey(parsed.data))) names.set(bankNameKey(parsed.data), parsed.data);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}