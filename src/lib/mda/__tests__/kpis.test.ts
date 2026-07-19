import { describe, expect, it } from "vitest";
import { computeMdaKpis } from "../kpis";

describe("computeMdaKpis", () => {
  it("keeps legacy/custom MDA status values from crashing heatmap totals", () => {
    const questions = [
      {
        id: "status_of_mda",
        name: "status_of_mda",
        label: "Status of MDA",
        type: "select_one",
        options: [
          { value: "not_started", label: "Not Started" },
          { value: "ongoing", label: "Ongoing" },
          { value: "halted", label: "Halted" },
          { value: "completed", label: "Completed" },
        ],
      },
    ];
    const submissions = [
      {
        id: "legacy-status-1",
        state: "Jigawa",
        lga: "Babura",
        ward: "Ward 1",
        submittedAt: "2026-07-01T08:00:00.000Z",
        data: {
          state: "Jigawa",
          lga: "Babura",
          ward: "Ward 1",
          community_name: "Community A",
          status_of_mda: "partially_completed_legacy_value",
        },
      },
    ];

    const kpis = computeMdaKpis(submissions, questions);

    expect(kpis.completionHeatmap.categories).toContain("Unknown");
    expect(kpis.completionHeatmap.colTotals.Unknown.value).toBe(1);
    expect(kpis.funnel.checklist).toBe(1);
  });
});