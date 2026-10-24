import { fireEvent, render, screen } from "@testing-library/react";
import { BarChart3, Users } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import WorkspaceNavigation, { type WorkspaceNavGroup } from "./WorkspaceNavigation";

const groups: WorkspaceNavGroup[] = [
  {
    label: "Overview",
    items: [
      { key: "dashboard", label: "General dashboard", description: "Project outcomes", icon: BarChart3, show: true },
    ],
  },
  {
    label: "People & care",
    hub: { key: "people", label: "People & care", description: "People and care sections", icon: Users },
    items: [
      { key: "records", label: "Beneficiary records", description: "Find records", icon: Users, show: true },
      { key: "households", label: "Households & MDA", description: "Restricted section", icon: Users, show: false },
    ],
  },
];

describe("WorkspaceNavigation", () => {
  it("groups the workspace and excludes inaccessible sections", () => {
    const onViewChange = vi.fn();
    render(<WorkspaceNavigation groups={groups} view="dashboard" onViewChange={onViewChange} />);

    expect(screen.getByText("General dashboard")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /overview/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /people & care/i })).toBeInTheDocument();
    expect(screen.queryByText("Households & MDA")).not.toBeInTheDocument();
    expect(onViewChange).not.toHaveBeenCalled();
  });

  it("opens the people card page directly without a dropdown", () => {
    const onViewChange = vi.fn();
    render(<WorkspaceNavigation groups={groups} view="records" onViewChange={onViewChange} />);
    fireEvent.click(screen.getByRole("button", { name: "People & care" }));
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith("people");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});