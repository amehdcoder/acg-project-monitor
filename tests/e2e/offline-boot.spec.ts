import { test, expect, Page } from "@playwright/test";

/**
 * Offline PWA boot + deep-link routing.
 *
 * Verifies the offline-first lifecycle: with no network the app must still
 * resolve deep links (/auth, protected dashboard routes) to the correct cached
 * view WITHOUT a blank white screen or the browser's native offline page.
 *
 * The dev server ships no service worker, so a full offline reload can only be
 * exercised when a SW is actually registered (published build / preview). To
 * stay meaningful everywhere, the specs drive React Router's client-side
 * navigation while offline — which is exactly the code path (ProtectedRoute →
 * deep-link intent → BootSkeleton/Auth) that guarantees a non-blank shell.
 */

async function expectNonBlankShell(page: Page) {
  await page.waitForFunction(
    () => {
      const root = document.getElementById("root");
      return !!root && root.childElementCount > 0 && (root.textContent || "").trim().length > 0;
    },
    { timeout: 20_000 },
  );
  const bodyText = (await page.locator("body").innerText()).toLowerCase();
  expect(bodyText).not.toContain("no internet");
  expect(bodyText).not.toContain("err_internet_disconnected");
}

// Drive React Router (BrowserRouter listens to popstate) without a page reload,
// simulating an in-app deep-link navigation while offline.
async function spaNavigate(page: Page, to: string) {
  await page.evaluate((path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, to);
}

test.describe("offline PWA boot & deep links", () => {
  test("Auth deep link renders offline without a blank screen", async ({ page, context }) => {
    await page.goto("/auth", { waitUntil: "domcontentloaded" });
    await expectNonBlankShell(page);
    await expect(page.getByRole("button", { name: /^login$/i }).first()).toBeVisible({
      timeout: 20_000,
    });

    // Go offline and re-resolve the Auth deep link via client-side routing.
    await context.setOffline(true);
    await spaNavigate(page, "/auth");
    await expectNonBlankShell(page);
    await expect(page.getByRole("button", { name: /^login$/i }).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("protected deep link offline resolves to a cached view, never blank", async ({
    page,
    context,
  }) => {
    await page.goto("/auth", { waitUntil: "domcontentloaded" });
    await expectNonBlankShell(page);

    await context.setOffline(true);
    // Signed-out protected deep link must resolve to the boot skeleton or the
    // Auth view — a rendered shell, never blank or the native offline page.
    await spaNavigate(page, "/?tab=forms");
    await expectNonBlankShell(page);
    await spaNavigate(page, "/satellite-messenger");
    await expectNonBlankShell(page);
  });

  test("full offline reload boots the cached shell when a service worker is active", async ({
    page,
    context,
  }) => {
    await page.goto("/auth", { waitUntil: "domcontentloaded" });
    await expectNonBlankShell(page);

    const hasSW = await page.evaluate(async () => {
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        return !!(reg && reg.active);
      } catch {
        return false;
      }
    });
    test.skip(!hasSW, "No active service worker (dev build) — offline reload not applicable");

    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expectNonBlankShell(page);
  });
});
