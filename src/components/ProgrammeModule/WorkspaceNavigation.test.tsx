import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
    items: [
      { key: "records", label: "Beneficiary records", description: "Find records", icon: Users, show: true },
      { key: "households", label: "Households & MDA", description: "Restricted section", icon: Users, show: false },
    ],
  },
];

describe("WorkspaceNavigation", () => {
  it("groups the workspace and excludes inaccessible sections", async () => {
    const onViewChange = vi.fn();
    render(<WorkspaceNavigation groups={groups} view="dashboard" onViewChange={onViewChange} />);

    expect(screen.getByText("General dashboard")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /overview/i })).toBeInTheDocument();
    expect(screen.queryByText("Households & MDA")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /people & care/i }));
    await userEvent.click(screen.getByText("Beneficiary records"));
    expect(onViewChange).toHaveBeenCalledWith("records");
  });
});