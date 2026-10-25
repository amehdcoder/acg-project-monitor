import { describe, expect, it } from "vitest";
import { progressSubmissionError } from "./beneficiaryPortal";
import { GRADUATION_STAGES } from "./graduation";
describe("verified personal progress", () => {
  it("does not let verified but unselected beneficiaries submit completion", () => {
    expect(progressSubmissionError("verified", GRADUATION_STAGES[0], "Completed training", "2026-10-25", "2026-10-25")).toBe("Progress submissions open after selection.");
  });
  it("accepts selected beneficiaries' stage progress for review", () => {
    expect(progressSubmissionError("selected", GRADUATION_STAGES[0], "Completed training", "2026-10-25", "2026-10-25")).toBeNull();
  });
  it("rejects stages outside the Graduation pathway", () => {
    expect(progressSubmissionError("selected", "Cataract surgery", "Completed training", "2026-10-25", "2026-10-25")).toBe("Choose a Graduation stage.");
  });
  it("rejects future activity dates", () => {
    expect(progressSubmissionError("selected", GRADUATION_STAGES[0], "Completed training", "2026-10-26", "2026-10-25")).toBe("Choose today or a previous activity date.");
  });
  it("requires meaningful progress notes", () => {
    expect(progressSubmissionError("selected", GRADUATION_STAGES[0], "ok", "2026-10-25", "2026-10-25")).toBe("Add activity notes between 5 and 4000 characters.");
  });
});