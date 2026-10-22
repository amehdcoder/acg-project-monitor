import { describe, expect, it } from "vitest";
import { componentJourneys } from "./componentJourney";
import { CISKULA_PRESET } from "./defaults";
import { GRADUATION_STAGES } from "./graduation";
import type { BeneficiaryReferralRow, BeneficiaryServiceRow } from "./types";

const beneficiary = {
  case_id: "CISKULA-2026-000001",
  status: "active",
  created_at: "2026-01-05T09:00:00Z",
  profile: {},
};

const service = (component_key: string, service_name: string, result = ""): BeneficiaryServiceRow => ({
  id: `${component_key}-${service_name}`,
  beneficiary_id: "b1",
  module_id: "m1",
  project_id: "p1",
  component_key,
  service_name,
  service_date: "2026-02-01",
  result,
  status: "on_track",
  data: {},
  created_at: "2026-02-01T10:00:00Z",
});

describe("componentJourneys", () => {
  it("includes only components with evidence that the beneficiary is receiving them", () => {
    const journeys = componentJourneys(beneficiary, CISKULA_PRESET.components, [service("eye_health", "Visual acuity test")], []);
    expect(journeys.map((j) => j.component.key)).toEqual(["eye_health"]);
    expect(journeys[0].steps.map((s) => s.key)).toEqual(["case_search", "registration", "care", "completion", "outcome"]);
  });

  it("tracks a linked MMDP case from case search through registration", () => {
    const journeys = componentJourneys(beneficiary, CISKULA_PRESET.components, [], [], {
      search_date: "2026-01-01",
      created_at: "2026-01-01T08:00:00Z",
      status: "registered",
      confirmed_at: "2026-01-02T08:00:00Z",
      accepted_at: "2026-01-05T09:00:00Z",
    });
    expect(journeys).toHaveLength(1);
    expect(journeys[0].component.key).toBe("mmdp_ntd");
    expect(journeys[0].steps[0].state).toBe("done");
    expect(journeys[0].steps[1].state).toBe("done");
    expect(journeys[0].steps[2].state).toBe("current");
    expect(journeys[0].percent).toBe(40);
  });

  it("marks completion and final outcome only from recorded evidence", () => {
    const journeys = componentJourneys(
      beneficiary,
      CISKULA_PRESET.components,
      [service("eye_health", "Cataract surgery", "Surgery successful")],
      [],
    );
    expect(journeys[0].percent).toBe(100);
    expect(journeys[0].latestOutcome).toBe("Surgery successful");
    expect(journeys[0].steps.every((s) => s.state === "done")).toBe(true);
  });

  it("uses the Graduation gate and all delivery stages for livelihood completion", () => {
    const selected = {
      ...beneficiary,
      profile: { graduation: { status: "selected", mapped_at: "2026-01-01T00:00:00Z" } },
    };
    const journeys = componentJourneys(
      selected,
      CISKULA_PRESET.components,
      GRADUATION_STAGES.map((stage) => service("livelihood", stage, "Completed")),
      [],
    );
    expect(journeys).toHaveLength(1);
    expect(journeys[0].component.key).toBe("livelihood");
    expect(journeys[0].percent).toBe(100);
  });

  it("does not count documents or unrelated components as active care", () => {
    const journeys = componentJourneys(
      beneficiary,
      CISKULA_PRESET.components,
      [service("documents", "Consent form", "Completed")],
      [],
    );
    expect(journeys).toEqual([]);
  });
});
