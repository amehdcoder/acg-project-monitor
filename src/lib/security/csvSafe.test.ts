import { describe, it, expect } from "vitest";
import { sanitizeCsvText } from "./csvSafe";

describe("sanitizeCsvText", () => {
  it("neutralises formulas in plain and quoted cells", () => {
    expect(sanitizeCsvText('a,=1+1\n"@x","ok"')).toBe("a,'=1+1\n\"'@x\",\"ok\"");
  });
  it("keeps negative numbers and byte-order mark", () => {
    expect(sanitizeCsvText("\ufeffv,-5\nb,-2.5")).toBe("\ufeffv,-5\nb,-2.5");
  });
  it("keeps commas and quotes inside quoted cells", () => {
    expect(sanitizeCsvText('"+a, ""b""",c')).toBe('"\'+a, ""b""",c');
  });
});
