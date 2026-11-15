// Maps the Amehnities Geo Microplanning XLSForm (CDD repeat, FLHF/CDD banking,
// Trachoma 1–9 sex counts) onto microplan_entries columns. Pure: shared by the
// Kobo webhook (Deno) and vitest.
import { getFlat, pickFirst, pickNumber, type AnyRec } from "./microplanRepeatItem.ts";
import { nigerianAccountNumberError, cddLegacyColumns, type CddDetail } from "./microplanBanking.ts";
import { NIGERIA_BANK_NAMES } from "./nigeriaBankNames.ts";

const clip = (v: string | null, max = 150) => (v ? v.trim().slice(0, max) : "");

/** Resolve a bank from the typed-name calculate, an "other" entry, or a bank_NNNN choice code. */
export function resolveKoboBank(src: AnyRec, prefix: string): string {
  const p = prefix.toLowerCase();
  const code = pickFirst(src, [`${p}_bank`]);
  if (code === "other") return clip(pickFirst(src, [`${p}_bank_other`]));
  const m = code?.match(/^bank_(\d{1,4})$/);
  if (m) return NIGERIA_BANK_NAMES[Number(m[1]) - 1] ?? clip(pickFirst(src, [`${p}_bank_name`]));
  return clip(pickFirst(src, [`${p}_bank_name`]) ?? code);
}

const account = (v: string | null) => { const s = (v ?? "").replace(/\s+/g, ""); return s && !nigerianAccountNumberError(s) ? s : ""; };

export function extractKoboBanking(src: AnyRec): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const fName = clip(pickFirst(src, ["flhf_account_name"])), fNum = account(pickFirst(src, ["flhf_account_number"])), fBank = resolveKoboBank(src, "flhf");
  if (fName) out.flhf_account_name = fName;
  if (fNum) out.flhf_account_number = fNum;
  if (fBank) out.flhf_bank = fBank;
  const male = pickNumber(src, ["trachoma_1_9_male"]), female = pickNumber(src, ["trachoma_1_9_female"]);
  if (male != null && male >= 0) out.trachoma_1_9_male = Math.round(male);
  if (female != null && female >= 0) out.trachoma_1_9_female = Math.round(female);
  const rep = getFlat(src, "cdd_repeat");
  if (Array.isArray(rep)) {
    const list: CddDetail[] = rep.filter((x) => x && typeof x === "object").slice(0, 100).map((x) => {
      const r = x as AnyRec;
      return { name: clip(pickFirst(r, ["cdd_name"])), phone: clip(pickFirst(r, ["cdd_phone"]), 30), account_name: clip(pickFirst(r, ["cdd_account_name"])), account_number: account(pickFirst(r, ["cdd_account_number"])), bank: resolveKoboBank(r, "cdd") };
    }).filter((c) => c.name);
    if (list.length) { out.cdd_details = list; Object.assign(out, cddLegacyColumns(list)); }
  }
  return out;
}
