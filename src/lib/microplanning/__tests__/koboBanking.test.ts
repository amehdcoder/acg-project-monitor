import { describe, it, expect } from "vitest";
import { extractKoboBanking } from "../../../../supabase/functions/_shared/koboMicroplanBanking";
import { NIGERIA_BANK_NAMES } from "../../../../supabase/functions/_shared/nigeriaBankNames";
import banks from "../nigeriaBanks.json";

const G = "group_yf5bw16/group_pi0rq96/cdd_repeat";
describe("Kobo XLSForm banking mapping", () => {
  it("keeps the form bank list identical to the app list", () => {
    expect(NIGERIA_BANK_NAMES).toEqual(banks.names);
  });
  it("saves each CDD with bank details, FLHF banking and trachoma 1–9 sex counts", () => {
    const item = {
      "group_yf5bw16/group_jq2fc22/Trachoma_1_9_Male": "12",
      "group_yf5bw16/group_jq2fc22/Trachoma_1_9_Female": 9,
      [G]: [
        { [`${G}/cdd_details/CDD_Name`]: "Amina", [`${G}/cdd_details/CDD_Phone`]: "08031234567", [`${G}/cdd_details/CDD_Account_Number`]: "0123456789", [`${G}/cdd_details/CDD_Bank`]: "bank_0001" },
        { [`${G}/cdd_details/CDD_Name`]: "Bello", [`${G}/cdd_details/CDD_Bank`]: "other", [`${G}/cdd_details/CDD_Bank_Other`]: "New Rural MFB", [`${G}/cdd_details/CDD_Account_Number`]: "123" },
      ],
    };
    const out = extractKoboBanking(item);
    expect(out.trachoma_1_9_male).toBe(12);
    expect(out.trachoma_1_9_female).toBe(9);
    expect(out.cdd_details).toEqual([
      { name: "Amina", phone: "08031234567", account_name: "", account_number: "0123456789", bank: banks.names[0] },
      { name: "Bello", phone: "", account_name: "", account_number: "", bank: "New Rural MFB" },
    ]);
    expect(out.cdd_names).toBe("Amina, Bello");
    const parent = extractKoboBanking({ "group_kj94k59/FLHF_Account_Name": "PHC Gora", "group_kj94k59/FLHF_Account_Number": "0001112223", "group_kj94k59/FLHF_Bank": "bank_0002" });
    expect(parent).toMatchObject({ flhf_account_name: "PHC Gora", flhf_account_number: "0001112223", flhf_bank: banks.names[1] });
  });
});
