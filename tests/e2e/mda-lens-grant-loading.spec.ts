import { test, expect, type Page } from "@playwright/test";

/**
 * E2E: MDA Lens grant-loading resilience.
 *
 * Reproduces the production symptom users reported — the two MDA pages render
 * for a few seconds and then flip to "Access Restricted" — and asserts it can
 * no longer happen:
 *   • while the grant is still loading, the page shows a loading state, never
 *     a granted-then-restricted transition;
 *   • an intermittent fetch failure is not treated as a revocation;
 *   • telemetry records the failure so it is detectable in production.
 */

const HARNESS = "/__test/mda-lens";
const SCOPE = "states=Kano&lgas=Dala";

const trail = (page: Page) =>
  page.evaluate(() => (window as unknown as { __LENS_ACCESS_TRAIL__?: string[] }).__LENS_ACCESS_TRAIL__ ?? []);

const telemetry = (page: Page) =>
  page.evaluate(() =>
    ((window as unknown as { __MDA_LENS_TELEMETRY__?: { event_type: string }[] }).__MDA_LENS_TELEMETRY__ ?? [])
      .map((e) => e.event_type),
  );

/** "granted" must never be followed by "restricted" — that is the flicker. */
function assertNoFlicker(states: string[]) {
  const granted = states.indexOf("granted");
  const restricted = states.lastIndexOf("restricted");
  expect(granted === -1 || restricted < granted, `flicker trail: ${states.join(">")}`).toBeTruthy();
}

test.describe("MDA Lens — slow grant loading", () => {
  test("a slow grant shows a loading state and then grants access, never the reverse", async ({ page }) => {
    await page.goto(`${HARNESS}?${SCOPE}&delay=1500`);
    await expect(page.getByTestId("access-loading")).toBeVisible();
    await expect(page.getByTestId("access-restricted")).toHaveCount(0);

    await expect(page.getByTestId("access-state")).toHaveText("granted", { timeout: 15_000 });
    await expect(page.getByTestId("visible-ids")).toHaveText("1,2");
    assertNoFlicker(await trail(page));
  });

  test("no out-of-scope rows are readable while the grant is still resolving", async ({ page }) => {
    await page.goto(`${HARNESS}?${SCOPE}&delay=1200`);
    await expect(page.getByTestId("access-loading")).toBeVisible();
    // Fail closed on data while pending: nothing is exposed before the grant lands.
    await expect(page.getByTestId("scoped-count")).toHaveText("0");
    await expect(page.getByTestId("lens-export")).toHaveCount(0);
    await expect(page.getByTestId("access-state")).toHaveText("granted", { timeout: 15_000 });
    await expect(page.getByTestId("scoped-count")).toHaveText("2");
  });
});

test.describe("MDA Lens — intermittent grant fetch failures", () => {
  test("a failing grant fetch resolves to restricted without a granted flash", async ({ page }) => {
    await page.goto(`${HARNESS}?${SCOPE}&fail=1&delay=200`);
    await expect(page.getByTestId("access-state")).toHaveText("restricted", { timeout: 15_000 });
    assertNoFlicker(await trail(page));
    await expect(page.getByTestId("grant-state")).toHaveText("failed");
    expect(await telemetry(page)).toContain("lens_fetch_failed");
  });

  test("a failure followed by a successful retry ends in granted access", async ({ page }) => {
    await page.goto(`${HARNESS}?${SCOPE}&failFirst=1&delay=150`);

    // Retry (what focus/online/realtime invalidation does in the real app).
    await page.getByTestId("refetch-lens").dispatchEvent("click");
    await expect(page.getByTestId("access-state")).toHaveText("granted", { timeout: 15_000 });
    await expect(page.getByTestId("visible-ids")).toHaveText("1,2");
    // The transient failure was recorded, and access never flickered away.
    const events = await telemetry(page);
    expect(events).toContain("lens_fetch_failed");
    expect(events).toContain("lens_resolved");
    assertNoFlicker(await trail(page));
  });

  test("failures during navigation never expose unscoped rows", async ({ page }) => {
    await page.goto(`${HARNESS}?${SCOPE}&fail=1&delay=100&tab=users`);
    await expect(page.getByTestId("access-state")).toHaveText("restricted", { timeout: 15_000 });
    await expect(page.getByTestId("page-users")).toHaveAttribute("data-allowed", "false");
    await expect(page.getByTestId("lens-export")).toHaveCount(0);
  });
});
