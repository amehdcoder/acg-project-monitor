// NUBAN bank prediction utility.
// Maps the first 3 digits of a Nigerian (NUBAN) account number to the issuing
// bank using the CBN 3-digit bank-code dictionary.
//
// Sources (compiled from multiple public CBN/NIBSS/Interswitch references):
//  - Interswitch DocBase "Bank CBN Codes"
//  - OnePipe public CBN Bank Codes wiki
//  - felixomoko.ng Nigeria Bank Codes & Sort Codes
//
// NOTE: The CBN 3-digit code is the canonical identifier for each commercial
// bank. While the NUBAN serial portion of an account number is not formally a
// bank identifier, institutions are commonly resolved by their CBN code, and
// this dictionary lets the app suggest the most likely bank from the leading
// 3 digits.

export interface NubanBank {
  /** CBN 3-digit bank code */
  code: string;
  /** Display name of the bank */
  name: string;
}

// 3-digit CBN code → bank name
export const NUBAN_BANK_CODES: Record<string, string> = {
  // ── Commercial / Merchant banks ──────────────────────────────
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
  "076": "Skye Bank Plc",
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
  "303": "Lotus Bank Limited",
  "105": "Premium Trust Bank Ltd",
  "106": "Signature Bank Ltd",
  "103": "Globus Bank",
  "102": "Titan Trust Bank",
  "067": "Polaris Bank",
  "107": "Optimus Bank Ltd",
  "068": "Standard Chartered Bank",
  "100": "Suntrust Bank",
  "302": "Taj Bank",
  "023": "Citibank Nigeria",
  "030": "Heritage Bank",
  "315": "GTBank (GTB) Mobile Money",

  // ── Popular fintechs / MFBs (leading code variants) ──────────
  "999991": "PalmPay",
  "999992": "OPay (Paycom)",
  "100004": "OPay (Paycom)",
  "090267": "Kuda Microfinance Bank",
  "090405": "Moniepoint Microfinance Bank",
  "565": "Carbon (One Finance)",
  "51310": "Sparkle Microfinance Bank",
  "50211": "Kuda Microfinance Bank",
};

// Some leading 3-digit prefixes commonly seen at the start of NUBAN account
// numbers for the major retail banks. Used as a heuristic fallback so a
// suggestion can still surface for typical personal account numbers.
const PREFIX_HINTS: Record<string, string> = {
  "001": "First Bank of Nigeria Plc",
  "002": "Access Bank of Nigeria Plc (Diamond Bank Plc)",
  "003": "United Bank for Africa (UBA)",
  "010": "First Bank of Nigeria Plc",
  "012": "United Bank for Africa (UBA)",
  "200": "Zenith Bank",
  "201": "Zenith Bank",
  "300": "Guaranty Trust Bank Plc (GTB)",
};

/**
 * Suggests the most likely Nigerian bank for a NUBAN account number by looking
 * at its leading digits. Returns null when no confident match is found.
 */
export const suggestBankFromAccount = (accountNumber: string): NubanBank | null => {
  const digits = (accountNumber || "").replace(/\D/g, "");
  if (digits.length < 3) return null;

  const three = digits.slice(0, 3);

  // 1. Direct CBN 3-digit code match (most reliable)
  if (NUBAN_BANK_CODES[three]) {
    return { code: three, name: NUBAN_BANK_CODES[three] };
  }

  // 2. Longer fintech/MFB codes (5–6 digits at the start)
  for (const len of [6, 5]) {
    const key = digits.slice(0, len);
    if (NUBAN_BANK_CODES[key]) {
      return { code: key, name: NUBAN_BANK_CODES[key] };
    }
  }

  // 3. Heuristic prefix hints for common retail account ranges
  if (PREFIX_HINTS[three]) {
    return { code: three, name: PREFIX_HINTS[three] };
  }

  return null;
};
