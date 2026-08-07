import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: MDA Lens containment.
 *
 * Uses the dev-only harness at /__test/mda-lens, which mounts the real gating
 * surfaces (usePageAccess, Sidebar, BottomNavBar, LensScopeBanner,
 * ChecklistFilters) with a deterministic grant supplied via the URL.
 *
 * Grant under test: State = Kano, LGA = Dala.
 * Fixture rows: 1 Kano/Dala/Gwammaja, 2 Kano/Dala/Kabuwaya (both in scope),
 *               3 Kano/Ungogo, 4 Jigawa/Dutse, 5 Jigawa/Dala (all out of scope).
 */

const HARNESS = "/__test/mda-lens";
const SCOPED = `${HARNESS}?states=Kano&lgas=Dala`;

const LENS_PAGES = ["microplanning", "integrated-supervisory", "integrated-supervisory-raw"];
// Restricted destinations that must stay closed to a lens user.
const OTHER_PAGES = ["dashboard", "users", "analytics"];

async function gotoLens(page: Page, url = SCOPED) {
  await page.goto(url);
  await expect(page.getByTestId("mda-lens-harness")).toBeVisible();
  await expect(page.getByTestId("lens-enabled")).toHaveText("true");
}

test.describe("MDA Lens — page containment", () => {
  test("only the two MDA pages are reachable; every other page is denied", async ({ page }) => {
    await gotoLens(page);

    for (const id of LENS_PAGES) {
      await expect(page.getByTestId(`page-${id}`)).toHaveAttribute("data-allowed", "true");
    }
    for (const id of OTHER_PAGES) {
      await expect(page.getByTestId(`page-${id}`)).toHaveAttribute("data-allowed", "false");
    }
  });

  test("direct navigation to an unscoped page id is still denied", async ({ page }) => {
    // Deep-link straight at a non-MDA page: the access decision is recomputed
    // client-side and must not open up just because the URL asked for it.
    await gotoLens(page, `${SCOPED}&tab=users`);
    // The lens route guard bounces the request back into the granted pages.
    await expect(page.getByTestId("active-tab")).toHaveText("microplanning");
    await expect(page.getByTestId("page-users")).toHaveAttribute("data-allowed", "false");
    await expect(page.getByTestId("page-dashboard")).toHaveAttribute("data-allowed", "false");
    await expect(page.getByTestId("page-microplanning")).toHaveAttribute("data-allowed", "true");

    await gotoLens(page, `${SCOPED}&tab=analytics`);
    await expect(page.getByTestId("active-tab")).toHaveText("microplanning");
  });

  test("navigation surfaces expose only the two MDA destinations", async ({ page }) => {
    await gotoLens(page);

    const nav = page.locator("nav, aside").first();
    await expect(nav).toBeVisible();

    for (const label of ["User Management", "Analytics", "Cases", "Dashboard"]) {
      await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
    }
  });
});

test.describe("MDA Lens — locked geography filters", () => {
  test("State and LGA are pinned to the grant and cannot be changed", async ({ page }) => {
    await gotoLens(page);

    // The banner states the scope explicitly.
    await expect(page.getByText("Scoped to State & LGA(s)")).toBeVisible();

    // Locked levels auto-apply themselves.
    await expect(page.getByTestId("filter-state")).toHaveText("Kano");
    await expect(page.getByTestId("filter-lga")).toHaveText("Dala");

    // Both selects are disabled — no "All" escape hatch.
    await expect(page.locator("#isc-state")).toBeDisabled();
    await expect(page.locator("#isc-lga")).toBeDisabled();
  });

  test("Clear all cannot widen the scope back to every State/LGA", async ({ page }) => {
    await gotoLens(page);
    await expect(page.getByTestId("filter-state")).toHaveText("Kano");

    const clear = page.getByRole("button", { name: /clear all/i });
    if (await clear.count()) await clear.first().click();

    await expect(page.getByTestId("filter-state")).toHaveText("Kano");
    await expect(page.getByTestId("filter-lga")).toHaveText("Dala");
  });

  test("an unlocked Ward select still only offers wards inside the grant", async ({ page }) => {
    await gotoLens(page);
    await page.locator("#isc-ward").click();
    const options = page.getByRole("option");
    await expect(options.filter({ hasText: "Gwammaja" })).toHaveCount(1);
    await expect(options.filter({ hasText: "Kabuwaya" })).toHaveCount(1);
    // Wards belonging to out-of-scope LGAs/States are never offered.
    await expect(options.filter({ hasText: "Zango" })).toHaveCount(0);
    await expect(options.filter({ hasText: "Limawa" })).toHaveCount(0);
  });
});

test.describe("MDA Lens — data and exports stay inside the grant", () => {
  test("only in-scope rows are readable, and the export row-set matches them", async ({ page }) => {
    await gotoLens(page);

    await expect(page.getByTestId("scoped-count")).toHaveText("2");
    await expect(page.getByTestId("visible-ids")).toHaveText("1,2");

    // The export button reports the same scoped row count it would emit.
    await expect(page.getByTestId("lens-export")).toContainText("(2)");
  });

  test("a ward-pinned grant narrows both the view and the export further", async ({ page }) => {
    await gotoLens(page, `${HARNESS}?states=Kano&lgas=Dala&wards=Gwammaja`);

    await expect(page.getByTestId("scoped-count")).toHaveText("1");
    await expect(page.getByTestId("visible-ids")).toHaveText("1");
    await expect(page.getByTestId("lens-export")).toContainText("(1)");
    await expect(page.locator("#isc-ward")).toBeDisabled();
  });

  test("export is hidden when the grant withholds it", async ({ page }) => {
    await gotoLens(page, `${SCOPED}&export=0`);
    await expect(page.getByTestId("lens-export")).toHaveCount(0);
    // Data access is unaffected — only the download is withheld.
    await expect(page.getByTestId("scoped-count")).toHaveText("2");
  });
});
