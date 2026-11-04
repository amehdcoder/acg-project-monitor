import { fireEvent, render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Target } from "lucide-react";
import CollapsibleEyeSection from "./CollapsibleEyeSection";

describe("CollapsibleEyeSection", () => {
  afterEach(cleanup);

  it("is collapsed by default and does not mount its content", () => {
    render(
      <CollapsibleEyeSection title="Evidence section" icon={Target}>
        <p>Heavy evidence body</p>
      </CollapsibleEyeSection>,
    );
    expect(screen.getByRole("button", { name: /Evidence section/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Heavy evidence body")).toBeNull();
  });

  it("expands on open and hides again on close", () => {
    render(
      <CollapsibleEyeSection title="Evidence section" icon={Target}>
        <p>Heavy evidence body</p>
      </CollapsibleEyeSection>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Evidence section/ }));
    expect(screen.getByRole("button", { name: /Evidence section/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Heavy evidence body")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Evidence section/ }));
    expect(screen.queryByText("Heavy evidence body")).toBeNull();
  });
});
