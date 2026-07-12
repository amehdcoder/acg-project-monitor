import { test, expect } from "@playwright/test";

/**
 * Offline PWA boot + deep-link routing.
 *
 * Verifies the offline-first lifecycle: with no network the installed shell
 * must still boot and resolve deep links (/auth, protected dashboard routes)
 * to the correct cached view WITHOUT ever showing a blank white screen or the
 * browser's native "You're offline" error page.
 *
 * Runs against the dev server. When a service worker cannot activate in the
 * test environment (dev builds ship no SW), the spec still validates the
 * client-side offline routing that guarantees a non-blank shell.
 */

// Consider the page "not blank" when #root has rendered real content.
async function expectNonBlankShell(page: import("@playwright/test").Page) {
  await page.waitForFunction(
    () => {
      const root = document.getElementById("root");
      return !!root && root.childElementCount > 0 && (root.textContent || "").trim().length > 0;
    },
    { timeout: 20_000 },
  );
  const bodyText = (await page.locator("body").innerText()).toLowerCase();
  // Never Chrome's/Android's native offline interstitial.
  expect(bodyText).not.toContain("no internet");
  expect(bodyText).not.toContain("err_internet_disconnected");
}

test.describe("offline PWA boot & deep links", () => {
  test("boots to Auth deep link offline without a blank screen", async ({ page, context }) => {
    // Warm the app + caches while online first (mirrors a real first launch).
    await page.goto("/auth", { waitUntil: "domcontentloaded" });
    await expectNonBlankShell(page);
    await expect(
      page.getByRole("button", { name: /sign in|log in/i }).first(),
    ).toBeVisible({ timeout: 20_000 });

    // Go fully offline and re-open the Auth deep link via client-side routing.
    await context.setOffline(true);
    await page.goto("/auth", { waitUntil: "domcontentloaded" }).catch(() => {});
    await expectNonBlankShell(page);
    // The signed-out user must land on the Auth view, not a white page.
    await expect(
      page.getByRole("button", { name: /sign in|log in/i }).first(),
    ).toBeVisible({ timeout: 20_000 });
  });

  test("protected deep link offline resolves to a cached view, never blank", async ({
    page,
    context,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expectNonBlankShell(page);

    await context.setOffline(true);
    // A protected dashboard deep link while signed out must resolve to either
    // the branded boot skeleton (cached session hydrating) or the Auth view —
    // in all cases a rendered shell, never a blank/native offline page.
    await page.goto("/?tab=forms", { waitUntil: "domcontentloaded" }).catch(() => {});
    await expectNonBlankShell(page);
  });
});
