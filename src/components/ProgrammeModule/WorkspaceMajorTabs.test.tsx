import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import WorkspaceMajorTabs from "./WorkspaceMajorTabs";

afterEach(cleanup);
describe("major workspace destinations", () => {
  it("opens the Programme Report directly without selecting an Overview destination", () => {
    const onSelect = vi.fn();
    render(<WorkspaceMajorTabs selected="records" canReport canBrain onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("tab", { name: "Programme report" }));
    expect(onSelect).toHaveBeenCalledWith("report");
    fireEvent.click(screen.getByRole("tab", { name: "Record quality brain" }));
    expect(onSelect).toHaveBeenLastCalledWith("brain");
    fireEvent.click(screen.getByRole("tab", { name: "Beneficiary records" }));
    expect(onSelect).toHaveBeenLastCalledWith("records");
  });
  it("does not offer reporting to a user without report access", () => {
    render(<WorkspaceMajorTabs selected="records" canReport={false} canBrain onSelect={vi.fn()} />);
    expect(screen.queryByRole("tab", { name: "Programme report" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Beneficiary records" })).toBeEnabled();
  });
});