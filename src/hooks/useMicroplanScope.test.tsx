import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "scope-test-user" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => ({ select: () => ({ eq: async () => ({ data: [{
    designation: "collector", states: ["Jigawa"], lgas: [], wards: [],
    flhfs: [], communities: [], settlements: [],
  }] }) }) }),
} }));

import { useMicroplanScope } from "./useMicroplanScope";

describe("microplanning scope stability", () => {
  it("retains the same access model across unrelated tab renders", async () => {
    const { result, rerender } = renderHook(() => useMicroplanScope(false));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const previous = result.current;
    rerender();
    expect(result.current).toBe(previous);
    expect(result.current.isInScope({ state: "Jigawa" })).toBe(true);
    expect(result.current.isInScope({ state: "Kano" })).toBe(false);
  });

  it("changes the access model when administrator bypass changes", async () => {
    const { result, rerender } = renderHook(({ bypass }) => useMicroplanScope(bypass), { initialProps: { bypass: true } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    const previous = result.current;
    expect(previous.isInScope({ state: "Kano" })).toBe(true);
    rerender({ bypass: false });
    await waitFor(() => expect(result.current.designations).toEqual(["collector"]));
    expect(result.current).not.toBe(previous);
    expect(result.current.isInScope({ state: "Kano" })).toBe(false);
  });
});