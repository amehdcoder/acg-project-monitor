import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProgrammeReportForm from "./ProgrammeReportForm";

vi.mock("@/lib/programmeModule/programmeReport", () => ({ aggregateIndicators: vi.fn(async () => ({})) }));
// Non-starter projects load a blank framework, so give this test a populated one.
vi.mock("@/lib/programmeModule/logframeStore", async () => {
  const { defaultLogframe } = await import("@/lib/programmeModule/logframe");
  return { loadProjectLogframe: vi.fn(async () => defaultLogframe()), saveProjectLogframe: vi.fn(async () => {}) };
});
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: null } }) },
  from: () => {
    const query = { select: () => query, eq: () => query, in: () => query, maybeSingle: async () => ({ data: null }), order: async () => ({ data: [] }), then: (resolve: (data: { data: [] }) => void) => resolve({ data: [] }) };
    return query;
  },
} }));
afterEach(cleanup);

describe("Programme Report entry tools", () => {
  it("keeps entered values when officers search and clear the indicator filter", async () => {
    render(<ProgrammeReportForm projectId="test-project" canManage={false} />);
    const value = await screen.findAllByLabelText("Value this period");
    fireEvent.change(value[0], { target: { value: "42" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Search report indicators" }), { target: { value: "no matching indicator" } });
    expect(screen.queryAllByLabelText("Value this period")).toHaveLength(0);
    fireEvent.change(screen.getByRole("textbox", { name: "Search report indicators" }), { target: { value: "" } });
    await waitFor(() => expect(screen.getAllByLabelText("Value this period")[0]).toHaveValue(42));
  });
});