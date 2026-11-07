import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CoverageView from "./CoverageView";
import ReconciliationView from "./ReconciliationView";

vi.mock("@/hooks/useTargetPopFields", () => ({ useTargetPopFields: () => ({ calcTargetPop: () => 10, label: "Target" }) }));
vi.mock("@/hooks/useRealtimeCoverageEntries", () => ({ default: () => {} }));
vi.mock("@/hooks/useRealtimeReconciliationEntries", () => ({ default: () => {} }));
vi.mock("./TabSyncStatus", () => ({ TabSyncStatus: () => null }));
vi.mock("./KoboAllocationOverridePanel", () => ({ default: () => null }));
vi.mock("@/components/maps/LeafletStreetView", () => ({ useLeafletStreetView: () => ({ attach: () => {}, panel: null }) }));

const entries = Array.from({ length: 2000 }, (_, i) => ({
  id: `entry-${i}`, state: "Kano", lga: "Ajingi", ward: "Ajingi", flhf_name: "Clinic",
  community_name: `Community ${i}`, settlement_name: null, community_latitude: null,
  community_longitude: null, settlement_latitude: null, settlement_longitude: null,
  flhf_latitude: null, flhf_longitude: null, estimated_total_population: 10,
  estimated_children_5_14: 10, estimated_adults_15_plus: 0, total_treated: 5,
  medicine_used: 2, year_of_microplanning: 2026, campaign_type: null,
}));

describe("large dashboard datasets", () => {
  it("keeps coverage entry controls bounded while preserving totals and edits across pages", () => {
    render(<CoverageView entries={entries} onRefresh={() => {}} />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("spinbutton")).toHaveLength(60);
    expect(within(table).getByText("20,000")).toBeInTheDocument();
    const input = within(table).getAllByRole("spinbutton")[0];
    fireEvent.change(input, { target: { value: "8" } });
    const footer = screen.getByText("Page 1 of 100").parentElement;
    if (!footer) throw new Error("Missing paging controls");
    const buttons = within(footer).getAllByRole("button");
    fireEvent.click(buttons[1]);
    expect(within(table).getByText("Community 20")).toBeInTheDocument();
    fireEvent.click(buttons[0]);
    expect(within(table).getAllByRole("spinbutton")[0]).toHaveValue(8);
  });
  it("keeps reconciliation controls bounded without truncating allocated or used totals", () => {
    const allocations = entries.map(e => ({ entryId: e.id, state: e.state, lga: e.lga, ward: e.ward,
      flhf: e.flhf_name, community: e.community_name, settlement: "", medicineRequired: 10, medicineUsed: 2 }));
    render(<ReconciliationView entries={entries} allocationRows={allocations} onRefresh={() => {}} />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("spinbutton")).toHaveLength(20);
    expect(within(table).getByText("20,000")).toBeInTheDocument();
    expect(within(table).getByText("4,000")).toBeInTheDocument();
    expect(within(table).getByText("16,000")).toBeInTheDocument();
  });
});