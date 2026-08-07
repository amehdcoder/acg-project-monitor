import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

/**
 * Regression guards: the MDA pages must never hand raw (unscoped) fetch results
 * to their tabs or exports. If someone re-wires a component to the raw cache /
 * entries array, these fail.
 */
describe("MDA Lens — page wiring cannot bypass the scope filter", () => {
  const supervisory = read("src/components/IntegratedSupervisory/IntegratedSupervisoryView.tsx");
  const microplan = read("src/components/Microplanning/MicroplanningView.tsx");

  it("supervisory view builds a lens-scoped cache from the live Kobo cache", () => {
    expect(supervisory).toMatch(/scopedCache\s*=\s*useMemo/);
    expect(supervisory).toContain("rowInLensScope(lens, state, lga, ward)");
    expect(supervisory).toContain("campaignInLensScope(lens, readKoboCampaign(r))");
  });

  it("supervisory export columns/rows come from the scoped cache, not the raw cache", () => {
    expect(supervisory).toContain("scopedCache?.columns");
    expect(supervisory).not.toMatch(/rows=\{\s*cache[.?]/);
  });

  it("microplanning applies the lens to every displayed entry", () => {
    expect(microplan).toContain("rowInLensScope(lens, e.state, e.lga, e.ward)");
    expect(microplan).toMatch(/displayEntries\s*=\s*useMemo/);
  });

  it("microplanning workbook export uses the scoped row-set", () => {
    expect(microplan).toMatch(/dataRows\s*=\s*filled\s*\?\s*displayEntries\.map/);
  });

  it("lens export columns are derived from displayEntries", () => {
    expect(microplan).toMatch(/lensExportColumns[\s\S]{0,400}displayEntries/);
  });
});
