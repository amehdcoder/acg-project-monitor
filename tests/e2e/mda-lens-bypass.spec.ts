import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: MDA Lens bypass attempts.
 *
 * Every scenario here is something a determined user can actually do from the
 * browser: rewrite the query string, add path segments, replay a cached route
 * via history/back-forward, or reload with a stale bfcache entry. None of them
 * may open an unscoped page, widen the scoped geography, or surface an export
 * containing out-of-scope rows.
 */

const HARNESS = "/__test/mda-lens";
const SCOPED = `${HARNESS}?states=Kano&lgas=Dala`;
const IN_SCOPE_IDS = "1,2";

async function gotoLens(page: Page, url = SCOPED) {
  await page.goto(url);
  await expect(page.getByTestId("mda-lens-harness")).toBeVisible();
  await expect(page.getByTestId("lens-enabled")).toHaveText("true");
}

const expectContained = async (page: Page) => {
  await expect(page.getByTestId("page-users")).toHaveAttribute("data-allowed", "false");
  await expect(page.getByTestId("page-dashboard")).toHaveAttribute("data-allowed", "false");
  await expect(page.getByTestId("page-analytics")).toHaveAttribute("data-allowed", "false");
  await expect(page.getByTestId("page-microplanning")).toHaveAttribute("data-allowed", "true");
};

test.describe("MDA Lens — query parameter tampering", () => {
  for (const tab of ["users", "analytics", "dashboard", "forms", "cases", "settings", "../users"]) {
    test(`?tab=${tab} is bounced back into the granted pages`, async ({ page }) => {
      await gotoLens(page, `${SCOPED}&tab=${encodeURIComponent(tab)}`);
      await expect(page.getByTestId("active-tab")).toHaveText("microplanning");
      await expectContained(page);
    });
  }

  test("duplicated and conflicting tab params cannot smuggle a page through", async ({ page }) => {
    await gotoLens(page, `${SCOPED}&tab=microplanning&tab=users`);
    await expect(page.getByTestId("active-tab")).toHaveText("microplanning");
    await expectContained(page);
  });

  test("widening the geography params does not widen the visible rows", async ({ page }) => {
    // Scope is decided by the grant, not the URL: the harness grant IS the URL
    // here, so the real proof is that the *rows* always obey the resolved grant
    // and that adding filter-ish params to a fixed grant changes nothing.
    await gotoLens(page, `${SCOPED}&state=Jigawa&lga=Dutse&ward=Limawa&all=1`);
    await expect(page.getByTestId("scoped-count")).toHaveText("2");
    await expect(page.getByTestId("visible-ids")).toHaveText(IN_SCOPE_IDS);
  });

  test("export=0 hides the export affordance and cannot be re-enabled from the URL", async ({ page }) => {
    await gotoLens(page, `${SCOPED}&export=0&can_export=1&allowExport=true`);
    await expect(page.getByTestId("lens-export")).toHaveCount(0);
  });
});

test.describe("MDA Lens — path segment tampering", () => {
  for (const suffix of ["/users", "/admin", "/../users", "/integrated-supervisory/records/all"]) {
    test(`extra path segment "${suffix}" does not unlock anything`, async ({ page }) => {
      await page.goto(`${HARNESS}${suffix}?states=Kano&lgas=Dala`);
      // Either the route does not exist (404) or the harness renders contained.
      const harness = page.getByTestId("mda-lens-harness");
      if (await harness.count()) {
        await expectContained(page);
        await expect(page.getByTestId("visible-ids")).toHaveText(IN_SCOPE_IDS);
      } else {
        await expect(page.locator("body")).not.toContainText("User Management");
      }
    });
  }
});

test.describe("MDA Lens — cached route state", () => {
  test("history back/forward cannot restore an unscoped destination", async ({ page }) => {
    await gotoLens(page, `${SCOPED}&tab=microplanning`);
    await gotoLens(page, `${SCOPED}&tab=users`);
    await expect(page.getByTestId("active-tab")).toHaveText("microplanning");

    await page.goBack();
    await expect(page.getByTestId("mda-lens-harness")).toBeVisible();
    await expectContained(page);

    await page.goForward();
    await expect(page.getByTestId("mda-lens-harness")).toBeVisible();
    await expect(page.getByTestId("active-tab")).toHaveText("microplanning");
    await expectContained(page);
  });

  test("pushState to a restricted route does not change the access decision", async ({ page }) => {
    await gotoLens(page);
    await page.evaluate(() => window.history.pushState({}, "", "/users"));
    await expectContained(page);
    await expect(page.getByTestId("visible-ids")).toHaveText(IN_SCOPE_IDS);
  });

  test("reload keeps the same scope; a cached grant never widens it", async ({ page }) => {
    await gotoLens(page);
    await expect(page.getByTestId("visible-ids")).toHaveText(IN_SCOPE_IDS);
    await page.reload();
    await expect(page.getByTestId("mda-lens-harness")).toBeVisible();
    await expect(page.getByTestId("visible-ids")).toHaveText(IN_SCOPE_IDS);
    await expectContained(page);
  });

  test("a stale cached grant in localStorage cannot grant a wider scope", async ({ page }) => {
    await gotoLens(page);
    await page.evaluate(() => {
      const wide = {
        lens: {
          user_id: "harness-user", enabled: true, microplan_tabs: [], supervisory_tabs: [],
          states: [], lgas: [], wards: [], project_ids: [], campaign_types: [], can_export: true,
        },
        at: Date.now(),
      };
      localStorage.setItem("amehnities:mda-lens:v2:harness-user", JSON.stringify(wide));
      localStorage.setItem("amehnities:mda-lens:harness-user", JSON.stringify(wide.lens));
    });
    await page.reload();
    await expect(page.getByTestId("mda-lens-harness")).toBeVisible();
    // The resolved grant (not the cache) decides: still Kano/Dala only.
    await expect(page.getByTestId("visible-ids")).toHaveText(IN_SCOPE_IDS);
  });
});
