import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";

afterEach(cleanup);

/**
 * Visual-regression guard for choice control icons.
 *
 * The radio circle and the multi-select square must keep a perfect 1:1 aspect
 * ratio in every context — small viewports, wrapped option labels and any
 * theme. They achieve this through a fixed box (`h-4 w-4`), an explicit
 * `aspect-square`, and flex-lock utilities (`shrink-0 grow-0 basis-4`) so a
 * flex parent can never stretch or squash them into an oval / rectangle.
 *
 * These assertions fail loudly if any of those guarantees are removed.
 */

// Classes that lock the control to a square regardless of layout pressure.
const REQUIRED_LOCK_CLASSES = [
  "aspect-square",
  "shrink-0",
  "grow-0",
  "basis-4",
  "h-4",
  "w-4",
];

// A realistic "squeeze" container: a narrow flex row with a long wrapping label,
// which is exactly the situation that previously deformed the circle.
const SqueezeRow = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center space-x-2" style={{ width: 120 }}>
    {children}
    <span>Yes, but unavailable for interview at this particular time</span>
  </div>
);

describe("choice control aspect ratio", () => {
  it("radio item keeps the square-lock utility classes", () => {
    const { getByRole } = render(
      <RadioGroup value="a">
        <SqueezeRow>
          <RadioGroupItem value="a" aria-label="opt" />
        </SqueezeRow>
      </RadioGroup>,
    );
    const radio = getByRole("radio");
    for (const cls of REQUIRED_LOCK_CLASSES) {
      expect(radio.className).toContain(cls);
    }
    // It must round to a circle, not a pill.
    expect(radio.className).toContain("rounded-full");
  });

  it("checkbox keeps the square-lock utility classes", () => {
    const { getByRole } = render(
      <SqueezeRow>
        <Checkbox aria-label="opt" />
      </SqueezeRow>,
    );
    const box = getByRole("checkbox");
    for (const cls of REQUIRED_LOCK_CLASSES) {
      expect(box.className).toContain(cls);
    }
    // Square corners (slightly rounded), never a full circle.
    expect(box.className).toContain("rounded-sm");
    expect(box.className).not.toContain("rounded-full");
  });

  it("does not allow flex-grow/shrink to override the fixed box", () => {
    const { getByRole } = render(
      <RadioGroup value="a">
        <RadioGroupItem value="a" aria-label="opt" />
      </RadioGroup>,
    );
    const radio = getByRole("radio");
    // No utilities that would let the parent resize it asymmetrically.
    expect(radio.className).not.toMatch(/\bflex-1\b/);
    expect(radio.className).not.toMatch(/\bgrow\b/);
    expect(radio.className).not.toMatch(/\bw-full\b/);
    expect(radio.className).not.toMatch(/\bh-full\b/);
  });
});
