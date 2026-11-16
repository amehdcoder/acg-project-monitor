import bankChoices from './koboBankChoices.json' with { type: 'json' };
import { getFlat, type AnyRec } from './microplanRepeatItem.ts';
import { validatedMicroplanBanking, validatedCddDetails, cddLegacyColumns } from './microplanBanking.ts';

function value(src: AnyRec, keys: string[]): unknown {
  for (const key of keys) {
    const exact = getFlat(src, key);
    if (exact !== undefined) return exact;
    const token = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const [k, v] of Object.entries(src)) {
      if (k.split('/').at(-1)?.toLowerCase().replace(/[^a-z0-9]/g, '') === token) return v;
    }
    for (const v of Object.values(src)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const found = value(v as AnyRec, [key]);
        if (found !== undefined) return found;
      }
    }
  }
  return undefined;
}

function bank(src: AnyRec, prefix: string): unknown {
  const selected = value(src, [`${prefix}_bank`]);
  const label = value(src, [`${prefix}_bank_name`]);
  if (selected === 'other') {
    const typed = value(src, [`${prefix}_bank_other`]);
    if (typeof typed !== 'string' || !typed.trim()) throw new Error(`${prefix}: enter the unlisted bank name.`);
    return typed.trim();
  }
  if (typeof label === 'string' && label.trim()) return label.trim();
  if (typeof selected === 'string' && /^bank_\d+$/.test(selected)) {
    const resolved = (bankChoices as Record<string, string>)[selected];
    if (!resolved) throw new Error(`${prefix}: unknown bank choice; update the form bank list.`);
    return resolved;
  }
  return selected;
}

/** Only fields present in this scope are emitted: omitted legacy fields never erase saved data. */
/** NTD (MDA) sub-type from the updated XLSForm: standard or trachoma population scheme. */
export function koboMdaType(src: AnyRec): 'standard' | 'trachoma' | null {
  const raw = value(src, ['MDA_Type', 'mda_type']);
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  if (key.startsWith('standard')) return 'standard';
  if (key.startsWith('trachoma')) return 'trachoma';
  return null;
}

const TRACHOMA_GROUPS: Array<[string, string]> = [
  ['trachoma_0_5_months', '_0_5_Months'], ['trachoma_6m_6y', '_6_Months_6_Years'],
  ['trachoma_7_14y', '_7_14_Years'], ['trachoma_15_plus', '_15_Years'],
];

export function extractKoboMicroplanSchema(src: AnyRec, mapping: Record<string, string> = {}, parentMdaType: 'standard' | 'trachoma' | null = null): AnyRec {
  const out: AnyRec = {};
  const mdaType = koboMdaType(src) ?? parentMdaType;
  for (const prefix of ['flhf', 'cdd']) {
    const input: AnyRec = {};
    for (const suffix of ['account_name', 'account_number', 'bank']) {
      const col = `${prefix}_${suffix}`;
      const raw = mapping[col] ? value(src, [mapping[col]]) : suffix === 'bank' ? bank(src, prefix) : value(src, [col]);
      if (raw !== undefined) input[col] = raw;
    }
    const validated = validatedMicroplanBanking(input);
    for (const key of Object.keys(input)) out[key] = validated[key as keyof typeof validated];
  }
  const repeat = value(src, ['cdd_repeat']);
  const stored = value(src, ['cdd_details']);
  if (repeat !== undefined || Array.isArray(stored)) {
    const raw = repeat ?? stored;
    if (!Array.isArray(raw)) throw new Error('CDD repeat must be an array.');
    const rows = raw.map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`CDD ${index + 1} is invalid.`);
      const r = item as AnyRec;
      return {
        name: value(r, ['CDD_Name', 'name']), phone: value(r, ['CDD_Phone', 'phone']),
        account_name: value(r, ['CDD_Account_Name', 'account_name']),
        account_number: value(r, ['CDD_Account_Number', 'account_number']),
        bank: bank(r, 'cdd') ?? value(r, ['bank']),
      };
    });
    const details = validatedCddDetails(rows);
    Object.assign(out, { cdd_details: details }, cddLegacyColumns(details));
  }
  for (const col of ['trachoma_1_9_male', 'trachoma_1_9_female']) {
    const raw = value(src, mapping[col] ? [mapping[col]] : [col.replace('1_9', '5_9'), col]);
    if (raw === undefined) continue;
    if (raw === null || raw === '') { out[col] = null; continue; }
    if (typeof raw !== 'number' && typeof raw !== 'string') throw new Error(`${col}: expected a whole-number count.`);
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < 0 || n > 100000000) throw new Error(`${col}: expected a non-negative whole-number count.`);
    out[col] = n;
  }
  if (mdaType) out.mda_type = mdaType;
  const hasTrachomaScope = TRACHOMA_GROUPS.some(([col, field]) => value(src, [mapping[col] ?? field]) !== undefined);
  // Population lives in the community repeat; a parent scope without it is validated per item.
  if (mdaType === 'trachoma' && hasTrachomaScope) {
    // Trachoma MDA: every Trachoma age group and the 1–9 sex split are mandatory;
    // the standard age groups are skipped, so total population is the Trachoma sum.
    let total = 0;
    for (const [col, field] of TRACHOMA_GROUPS) {
      const raw = value(src, [mapping[col] ?? field]);
      const n = Number(raw);
      if (raw === undefined || raw === null || raw === '' || !Number.isSafeInteger(n) || n < 0) throw new Error(`Trachoma MDA: ${field} is required as a non-negative whole number.`);
      out[col] = n; total += n;
    }
    for (const col of ['trachoma_1_9_male', 'trachoma_1_9_female']) {
      if (typeof out[col] !== 'number') throw new Error(`Trachoma MDA: ${col.replace('1_9', '5_9')} (children 5–9 years) is required.`);
    }
    out.estimated_total_population = total;
  }
  return out;
}