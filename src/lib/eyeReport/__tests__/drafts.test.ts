import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/programmeModule/offlineReadCache", () => ({ cacheGet: vi.fn(), cacheSet: vi.fn() }));
import { restoredPatients } from "../drafts";

describe("Eye report draft recovery", () => {
  it("restores all new-report WG-SS patients", () => {
    const patients = [{ id: "patient-1", draft: { patient_label: "Test patient", answers: { seeing: "a_lot" } } }];
    expect(restoredPatients({ patients }, [], false)).toEqual(patients);
  });
  it("never replaces saved-report patients with an unrelated draft", () => {
    expect(restoredPatients({ patients: ["old draft"] }, ["saved patient"], true)).toEqual(["saved patient"]);
  });
});