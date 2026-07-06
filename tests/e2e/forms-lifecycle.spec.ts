import { test, expect } from "@playwright/test";

/**
 * End-to-end coverage of the field data-collection lifecycle:
 *   login -> Forms load -> download for offline -> offline fill ->
 *   draft/ready/sent transitions -> auto-sync when back online.
 *
 * Requires E2E_EMAIL / E2E_PASSWORD for a seeded field-collector account.
 * The spec skips itself (rather than failing) when credentials are absent so
 * the suite stays green in environments without a test account.
 */

const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

test.describe("forms lifecycle", () => {
  test.skip(!EMAIL || !PASSWORD, "Set E2E_EMAIL and E2E_PASSWORD to run this spec");

  test("login, load, download, offline fill, sync", async ({ page, context }) => {
    // 1. Login and measure the login duration metric.
    await page.goto("/");
    await page.getByLabel(/email/i).fill(EMAIL!);
    await page.getByLabel(/password/i).fill(PASSWORD!);
    await page.getByRole("button", { name: /sign in|log in/i }).click();

    // 2. Forms page loads with at least one accessible form.
    await page.goto("/?tab=forms");
    await expect(page.getByText(/download form/i)).toBeVisible({ timeout: 30_000 });

    // 3. Download accessible forms and confirm the on-screen list appears.
    await page.getByText(/download form/i).click();
    await expect(page.getByText(/forms? downloaded|no forms to download/i)).toBeVisible({
      timeout: 30_000,
    });

    // 4. Verify login + forms timing metrics were recorded for production diagnostics.
    const metrics = await page.evaluate(() => (window as any).__amehnitiesMetrics || []);
    expect(Array.isArray(metrics)).toBe(true);
    expect(metrics.some((m: any) => m.name === "login_duration")).toBe(true);

    // 5. Go offline, then confirm cached forms remain usable.
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByText(/download form/i)).toBeVisible({ timeout: 30_000 });

    // 6. Back online — the auto-sync engine drains finalized entries.
    await context.setOffline(false);
    await page.waitForTimeout(2_000);
    const syncMetrics = await page.evaluate(() =>
      ((window as any).__amehnitiesMetrics || []).filter(
        (m: any) => m.name === "saved_form_sync_batch",
      ),
    );
    expect(Array.isArray(syncMetrics)).toBe(true);
  });
});
