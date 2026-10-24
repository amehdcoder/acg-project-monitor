import { fireEvent, render, screen } from "@testing-library/react";
import { Activity, BarChart3, ShieldCheck, Users } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import WorkspaceNavigation, { type WorkspaceNavGroup } from "./WorkspaceNavigation";

const groups: WorkspaceNavGroup[] = [
  {
    label: "Overview",
    hub: { key: "overview", label: "Overview", description: "Project dashboards", icon: BarChart3 },
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
  {
    label: "Intelligence",
    hub: { key: "intelligence", label: "Intelligence", description: "Predictive analytics", icon: Activity },
    items: [
      { key: "risk", label: "Follow-up risk & CHEW visits", description: "Prioritised risk", icon: Activity, show: true },
    ],
  },
  {
    label: "Protection",
    hub: { key: "protection", label: "Protection", description: "Safeguarding and feedback", icon: ShieldCheck },
    items: [
      { key: "feedback", label: "Community feedback", description: "Public form and reports", icon: ShieldCheck, show: true },
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

  it("opens Overview cards directly instead of a dropdown", () => {
    const onViewChange = vi.fn();
    render(<WorkspaceNavigation groups={groups} view="dashboard" onViewChange={onViewChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Overview" }));
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith("overview");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens Intelligence cards directly instead of a dropdown", () => {
    const onViewChange = vi.fn();
    render(<WorkspaceNavigation groups={groups} view="risk" onViewChange={onViewChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Intelligence" }));
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith("intelligence");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("opens Protection cards directly instead of a dropdown", () => {
    const onViewChange = vi.fn();
    render(<WorkspaceNavigation groups={groups} view="feedback" onViewChange={onViewChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Protection" }));
    expect(onViewChange).toHaveBeenCalledTimes(1);
    expect(onViewChange).toHaveBeenCalledWith("protection");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});