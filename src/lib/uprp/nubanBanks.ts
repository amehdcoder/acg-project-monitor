// NUBAN bank prediction utility.
//
// IMPORTANT (why the old "first-3-digits" approach never fired):
// A Nigerian NUBAN account number does NOT embed the bank code in its leading
// digits. The 10-digit NUBAN is a 9-digit serial number followed by 1 check
// digit. The bank is only recoverable by running the official CBN NUBAN
// check-digit algorithm against every known bank code and keeping the codes
// whose check digit matches the account's last digit.
//
// Algorithm (CBN/NIBSS NUBAN standard):
//   1. Concatenate the 3-digit bank code + 9-digit serial => 12 digits.
//   2. Multiply each digit by the fixed weights 3,7,3 repeating.
//   3. Sum the products, take modulo 10.
//   4. checkDigit = 10 - (sum % 10); if that equals 10, checkDigit = 0.
//   5. The account is a valid NUBAN for that bank when checkDigit === last
//      digit of the account number.
//
// Several banks can validate for the same number (collisions are expected), so
// we surface ALL candidates and let the user confirm — this makes the field
// responsive for every valid 10-digit account instead of silently failing.

export interface NubanBank {
  /** CBN 3-digit bank code */
  code: string;
  /** Display name of the bank */
  name: string;
}

// 3-digit CBN code → bank name (commercial / merchant banks only — these are
// the institutions the NUBAN check-digit algorithm applies to).
export const NUBAN_BANK_CODES: Record<string, string> = {
  "044": "Access Bank of Nigeria Plc (Diamond Bank Plc)",
  "063": "Access Bank (Diamond) Plc",
  "050": "Ecobank Nigeria",
  "084": "Enterprise Bank Plc",
  "070": "Fidelity Bank Plc",
  "011": "First Bank of Nigeria Plc",
  "214": "First City Monument Bank (FCMB)",
  "058": "Guaranty Trust Bank Plc (GTB)",
  "301": "Jaiz Bank",
  "082": "Keystone Bank Ltd",
  "014": "Mainstreet Bank Plc",
  "076": "Polaris Bank",
  "039": "Stanbic IBTC Plc",
  "221": "Stanbic IBTC Bank Plc",
  "232": "Sterling Bank Plc",
  "032": "Union Bank Nigeria Plc",
  "033": "United Bank for Africa (UBA)",
  "215": "Unity Bank Plc",
  "035": "WEMA Bank Plc",
  "057": "Zenith Bank",
  "101": "Providus Bank",
  "104": "Parallex Bank Limited",
  "105": "Premium Trust Bank Ltd",
  "106": "Signature Bank Ltd",
  "103": "Globus Bank",
  "102": "Titan Trust Bank",
  "107": "Optimus Bank Ltd",
  "068": "Standard Chartered Bank",
  "100": "Suntrust Bank",
  "302": "Taj Bank",
  "303": "Lotus Bank Limited",
  "023": "Citibank Nigeria",
  "030": "Heritage Bank",
};

// Weights applied to the 12-digit (bankCode + serial) string, per the CBN spec.
const NUBAN_WEIGHTS = [3, 7, 3, 3, 7, 3, 3, 7, 3, 3, 7, 3];

/** Computes the NUBAN check digit for a 3-digit bank code + 9-digit serial. */
const computeCheckDigit = (bankCode: string, serial9: string): number | null => {
  const seed = `${bankCode}${serial9}`;
  if (seed.length !== 12 || /\D/.test(seed)) return null;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(seed[i]) * NUBAN_WEIGHTS[i];
  const mod = sum % 10;
  const check = 10 - mod;
  return check === 10 ? 0 : check;
};

/** True when `accountNumber` is a valid NUBAN for the given 3-digit bank code. */
export const validateNubanForBank = (accountNumber: string, bankCode: string): boolean => {
  const digits = (accountNumber || "").replace(/\D/g, "");
  if (digits.length !== 10) return false;
  const serial9 = digits.slice(0, 9);
  const expected = computeCheckDigit(bankCode, serial9);
  return expected !== null && expected === Number(digits[9]);
};

/**
 * Returns every bank for which the 10-digit account number is a valid NUBAN,
 * ordered with the most common retail banks first.
 */
export const suggestBanksFromAccount = (accountNumber: string): NubanBank[] => {
  const digits = (accountNumber || "").replace(/\D/g, "");
  if (digits.length !== 10) return [];

  // Priority ordering so the likeliest retail banks bubble to the top.
  const PRIORITY = ["044", "058", "057", "033", "011", "070", "032", "035", "232", "050", "214", "215", "082", "076", "039", "068", "101"];

  const matches: NubanBank[] = [];
  for (const code of Object.keys(NUBAN_BANK_CODES)) {
    if (validateNubanForBank(digits, code)) {
      matches.push({ code, name: NUBAN_BANK_CODES[code] });
    }
  }
  matches.sort((a, b) => {
    const ai = PRIORITY.indexOf(a.code);
    const bi = PRIORITY.indexOf(b.code);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
  return matches;
};

/**
 * Suggests the single most likely Nigerian bank for a 10-digit NUBAN account
 * number using the CBN check-digit algorithm. Returns null when the number is
 * not yet 10 digits or matches no known bank code.
 */
export const suggestBankFromAccount = (accountNumber: string): NubanBank | null => {
  const list = suggestBanksFromAccount(accountNumber);
  return list.length > 0 ? list[0] : null;
};
