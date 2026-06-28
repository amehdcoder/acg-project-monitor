import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: Supervisor Accountability ↔ Community Visit Timeline cross-filter.
 *
 * Uses the dev-only harness at /__test/mda-analyses, which mounts the analyses
 * dashboard with deterministic mock data:
 *   Aisha Bello   → 3 communities
 *   Musa Ibrahim  → 2 communities
 *   Grace Okeke   → 1 community
 */

const HARNESS = "/__test/mda-analyses";

async function gotoHarness(page: Page) {
  await page.goto(HARNESS);
  await expect(page.getByTestId("mda-harness-root")).toBeVisible();
  await expect(page.getByTestId("sup-accountability-section")).toBeVisible();
}

function timelineRows(page: Page) {
  return page.getByTestId("timeline-row");
}

test.describe("MDA Supervisor cross-filter", () => {
  test("clicking a Supervisor bar/chip filters the timeline to matching rows", async ({ page }) => {
    await gotoHarness(page);

    // Unfiltered: all 6 communities listed.
    await expect(timelineRows(page)).toHaveCount(6);
    await expect(page.getByTestId("timeline-count")).toHaveText("6");

    // The chip carries the supervisor's community count from the bar chart.
    const aishaChip = page.getByTestId("sup-chip").filter({ hasText: "Aisha Bello" });
    await expect(aishaChip).toContainText("(3)");

    // Click the supervisor (chip mirrors the bar's onClick handler).
    await aishaChip.click();

    // Timeline now shows ONLY that supervisor's rows, and the count matches the bar.
    await expect(timelineRows(page)).toHaveCount(3);
    await expect(page.getByTestId("timeline-count")).toHaveText("3");
    for (const row of await timelineRows(page).all()) {
      await expect(row).toHaveAttribute("data-worker", "Aisha Bello");
    }

    // Active filter indicator reflects the selection.
    await expect(page.getByTestId("active-filter-name")).toHaveText("Aisha Bello");
  });

  test("clicking a timeline supervisor filters the chart back with matching counts", async ({ page }) => {
    await gotoHarness(page);

    // Click a supervisor name inside the timeline (Musa Ibrahim → 2 communities).
    const musaCell = page
      .getByTestId("timeline-supervisor")
      .filter({ hasText: "Musa Ibrahim" })
      .first();
    await musaCell.click();

    // Timeline filters to exactly that supervisor's rows.
    await expect(timelineRows(page)).toHaveCount(2);
    await expect(page.getByTestId("timeline-count")).toHaveText("2");

    // Chart chip is now pressed/active and its count equals the filtered rows.
    const musaChip = page.getByTestId("sup-chip").filter({ hasText: "Musa Ibrahim" });
    await expect(musaChip).toHaveAttribute("aria-pressed", "true");
    await expect(musaChip).toContainText("(2)");

    // No other chip is active.
    const aishaChip = page.getByTestId("sup-chip").filter({ hasText: "Aisha Bello" });
    await expect(aishaChip).toHaveAttribute("aria-pressed", "false");
  });

  test("the reset control returns to the unfiltered view", async ({ page }) => {
    await gotoHarness(page);

    // Apply a filter first.
    await page.getByTestId("sup-chip").filter({ hasText: "Grace Okeke" }).click();
    await expect(timelineRows(page)).toHaveCount(1);
    await expect(page.getByTestId("reset-sup-filter")).toBeVisible();

    // Reset.
    await page.getByTestId("reset-sup-filter").click();

    // Back to the full unfiltered timeline and no reset control.
    await expect(timelineRows(page)).toHaveCount(6);
    await expect(page.getByTestId("timeline-count")).toHaveText("6");
    await expect(page.getByTestId("reset-sup-filter")).toHaveCount(0);
  });

  test("toggling the same supervisor twice clears the filter", async ({ page }) => {
    await gotoHarness(page);

    const aishaChip = page.getByTestId("sup-chip").filter({ hasText: "Aisha Bello" });
    await aishaChip.click();
    await expect(timelineRows(page)).toHaveCount(3);

    // Clicking again toggles the selection off.
    await aishaChip.click();
    await expect(timelineRows(page)).toHaveCount(6);
  });
});
