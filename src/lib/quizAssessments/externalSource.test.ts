import { describe, expect, it } from "vitest";
import { detectExternalSource, participantLabel } from "./externalSource";

describe("external form link detection", () => {
  it("extracts the Google form ID from an editor link", () => {
    expect(detectExternalSource("https://docs.google.com/forms/d/1AbCdEfGh_ij-KL/edit")).toEqual({ provider: "google", formId: "1AbCdEfGh_ij-KL" });
  });
  it("rejects Google respondent links with guidance", () => {
    expect(detectExternalSource("https://docs.google.com/forms/d/e/1FAIpQL/viewform").problem).toMatch(/editor/);
  });
  it("detects Microsoft Forms IDs", () => {
    expect(detectExternalSource("https://forms.office.com/Pages/ResponsePage.aspx?id=AbC123_xyz-9")).toEqual({ provider: "microsoft", formId: "AbC123_xyz-9" });
  });
  it("detects Mentimeter links", () => {
    expect(detectExternalSource("https://www.menti.com/al8xyz").provider).toBe("mentimeter");
  });
});

describe("participant label", () => {
  it("joins the chosen fields in order", () => {
    expect(participantLabel({ name: "Ada", designation: "CHEW", lga: "Kano" }, ["name", "designation", "lga"])).toBe("Ada · CHEW · Kano");
  });
  it("falls back to name when chosen fields are empty", () => {
    expect(participantLabel({ name: "Ada", lga: null }, ["lga"])).toBe("Ada");
  });
});
