import { describe, expect, it } from "vitest";
import { buildAdxXml, buildSdmxCsv, buildSdmxJson, dhisPeriodToIsoInterval, validateAdxXml, validateSdmxPayload } from "../programmeModule/exchangeStandards";

const observation = { indicatorKey: "cases", remoteId: "NTD_CASES", value: 12, dimensions: { SEX: "F" } };

describe("health exchange standards", () => {
  it("converts DHIS2 periods to ADX intervals", () => expect(dhisPeriodToIsoInterval("202609")).toBe("2026-09-01/P1M"));
  it("builds valid IHE ADX XML", () => {
    const payload = buildAdxXml({ orgUnit: "OU1", dataSet: "DS1", period: "202609", observations: [observation] });
    expect(payload).toContain('xmlns="urn:ihe:qrph:adx:2015"');
    expect(validateAdxXml(payload)).toMatchObject({ valid: true, observationCount: 1 });
  });
  it("builds valid SDMX CSV and JSON", () => {
    const input = { agencyId: "HANDS", dataflowId: "NTD", period: "2026-09", observations: [observation], defaults: { FREQ: "M", REF_AREA: "NG" } };
    expect(validateSdmxPayload(buildSdmxCsv(input), "sdmx-csv", ["FREQ", "REF_AREA"])).toMatchObject({ valid: true, observationCount: 1 });
    expect(validateSdmxPayload(buildSdmxJson(input), "sdmx-json", ["FREQ", "REF_AREA"])).toMatchObject({ valid: true, observationCount: 1 });
  });
});
