/**
 * Rendering resilience of the at-risk register: missing, malformed and
 * multiple CDD / FLHF phone numbers must never break the table.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AtRiskCommunitiesTable from "./AtRiskCommunitiesTable";
import { parseLogistics } from "@/lib/isc/medicineAccountability";
import type { KoboCache } from "./koboClient";

const checklistCache = (rows: any[]) => ({ results: rows, fetchedAt: "", total: rows.length } as unknown as KoboCache);

const checklist = (over: Record<string, unknown> = {}) => ({
  State: "Kano", LGA: "Dala", Ward: "Gwammaja", COMMUNITIES: "Yakasai", FLHF: "Gwammaja PHC",
  Status_of_MDA: "not_started",
  Does_CDI_CDD_have_sufficient_d: "No,_all_are_insufficient",
  Independent_Monitor_s_Name: "Aisha Bello",
  _submission_time: "2026-08-20T09:00:00",
  ...over,
});

const logistics = (community: string, cdd: string, cddPhone?: unknown, inChargePhone?: unknown) => ({
  State: "Kano", LGA: "Dala", Ward: "Gwammaja",
  Health_Facility_Name: "Gwammaja PHC",
  Health_Facility_In_Charge_Name: "Musa Danladi",
  ...(inChargePhone !== undefined ? { FLHF_In_Charge_Phone: inChargePhone } : {}),
  group_xm3rz84: [{
    Target_Community_Settlement: community,
    CDD_Name: cdd,
    ...(cddPhone !== undefined ? { CDD_Phone_Number: cddPhone } : {}),
    group_je4ry53: [{ Medicine_IssuedtoCDD: "ivermectin", Quantity_Issued_to_CDD: 120 }],
  }],
});

describe("AtRiskCommunitiesTable rendering", () => {
  it("renders the community with both contact numbers", () => {
    render(
      <AtRiskCommunitiesTable
        checklistCache={checklistCache([checklist()])}
        logistics={parseLogistics([logistics("Yakasai", "Hauwa Idris", "08031234567", "08099998888")])}
      />,
    );
    expect(screen.getByText("Yakasai")).toBeInTheDocument();
    expect(screen.getByText("08031234567")).toBeInTheDocument();
    expect(screen.getByText("08099998888")).toBeInTheDocument();
  });

  it("shows 'Not captured' when phones are missing", () => {
    render(
      <AtRiskCommunitiesTable
        checklistCache={checklistCache([checklist()])}
        logistics={parseLogistics([logistics("Yakasai", "Hauwa Idris")])}
      />,
    );
    expect(screen.getAllByText("Not captured").length).toBeGreaterThanOrEqual(2);
  });

  it.each([
    ["empty", ""],
    ["null", null],
    ["short", "12"],
    ["alphabetic", "call the office"],
    ["object", { x: 1 }],
  ])("renders safely with a malformed CDD phone (%s)", (_l, value) => {
    expect(() =>
      render(
        <AtRiskCommunitiesTable
          checklistCache={checklistCache([checklist()])}
          logistics={parseLogistics([logistics("Yakasai", "Hauwa Idris", value as unknown)])}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByText("Yakasai")).toBeInTheDocument();
  });

  it("renders multiple CDD phone numbers for one community", () => {
    render(
      <AtRiskCommunitiesTable
        checklistCache={checklistCache([checklist()])}
        logistics={parseLogistics([
          logistics("Yakasai", "Hauwa Idris", "08031234567"),
          logistics("Yakasai", "Sadiya Umar", "+234 805 000 1111"),
        ])}
      />,
    );
    expect(screen.getByText("08031234567; +2348050001111")).toBeInTheDocument();
    expect(screen.getByText("Hauwa Idris; Sadiya Umar")).toBeInTheDocument();
  });

  it("renders the empty state without a crash when nothing is at risk", () => {
    render(
      <AtRiskCommunitiesTable
        checklistCache={checklistCache([checklist({ Status_of_MDA: "completed" })])}
        logistics={null}
      />,
    );
    expect(screen.getByText(/No community currently matches/i)).toBeInTheDocument();
  });

  it("offers the searchable State / LGA / Ward scope filters", () => {
    render(
      <AtRiskCommunitiesTable
        checklistCache={checklistCache([checklist()])}
        logistics={parseLogistics([logistics("Yakasai", "Hauwa Idris", "08031234567")])}
      />,
    );
    expect(screen.getByLabelText("Filter by State")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by LGA")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by Ward")).toBeInTheDocument();
    expect(screen.getByLabelText("Quick community lookup")).toBeInTheDocument();
  });
});
