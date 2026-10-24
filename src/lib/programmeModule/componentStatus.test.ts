import { describe, expect, it } from "vitest";
import { DEFAULT_SERVICE_STATUSES, humanizeStatus, labelFor } from "./defaults";
import {
  EXIT_REASONS, finalOutcomesFor, SUSPENSION_REASONS,
} from "./componentOutcomes";

describe("service status labels", () => {
  it("labels the mental-health statuses without underscores", () => {
    expect(labelFor(DEFAULT_SERVICE_STATUSES, "at_risk")).toBe("At risk");
    expect(labelFor(DEFAULT_SERVICE_STATUSES, "needs_follow_up")).toBe("Needs follow-up");
    expect(labelFor(DEFAULT_SERVICE_STATUSES, "on_track")).toBe("On track");
  });

  it("labels the lifecycle statuses", () => {
    expect(labelFor(DEFAULT_SERVICE_STATUSES, "completed")).toBe("Completed");
    expect(labelFor(DEFAULT_SERVICE_STATUSES, "suspended")).toBe("Suspended");
    expect(labelFor(DEFAULT_SERVICE_STATUSES, "exited")).toBe("Exited");
  });

  it("humanizes any unknown snake_case status instead of showing it raw", () => {
    expect(labelFor(DEFAULT_SERVICE_STATUSES, "some_new_status")).toBe("Some new status");
    expect(humanizeStatus("at_risk")).toBe("At risk");
  });
});

describe("component service lifecycle outcomes", () => {
  const mental = { key: "mental_health", label: "Mental Health & Psychosocial Support" };
  const eye = { key: "eye_health", label: "Eye Health" };

  it("offers context-specific final outcomes per component and action", () => {
    expect(finalOutcomesFor(mental, "completed")).toContain("Symptoms resolved or minimal");
    expect(finalOutcomesFor(eye, "completed")).toContain("Surgery completed successfully");
    expect(finalOutcomesFor(mental, "suspended").length).toBeGreaterThan(0);
    expect(finalOutcomesFor(eye, "exited")).toContain("Lost to follow-up");
  });

  it("requires a documented reason for suspension and exit", () => {
    expect(SUSPENSION_REASONS.length).toBeGreaterThan(0);
    expect(EXIT_REASONS).toContain("Lost to follow-up");
  });

  it("always returns at least one outcome for every action on a generic component", () => {
    for (const action of ["completed", "suspended", "exited"] as const) {
      expect(finalOutcomesFor({ key: "other" }, action).length).toBeGreaterThan(0);
    }
  });
});
