import { test, expect, type Page } from "@playwright/test";

/**
 * MDA Lens users are strictly read-only.
 *
 * These tests drive the real gating helper (`guardLensWrite` / `isLensReadOnly`)
 * through the dev harness at `/__test/mda-lens`, proving that no microplanning
 * write affordance — row action, bulk action, or modal — is reachable, and that
 * even a programmatic (UI-bypass) attempt is refused.
 *
 * The database is the authoritative layer: RESTRICTIVE RLS policies plus
 * BEFORE INSERT/UPDATE/DELETE triggers on the microplanning tables and a check
 * inside `update_submission_guarded` reject lens writes regardless of client.
 */

const LENS = "/__test/mda-lens?states=Kano&lgas=Dala&enabled=1";
const NON_LENS = "/__test/mda-lens?states=Kano&lgas=Dala&enabled=0";

async function open(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByTestId("mda-lens-harness")).toBeVisible();
  await expect(page.getByTestId("write-readonly")).not.toBeEmpty();
}

test.describe("MDA Lens — microplanning writes are impossible", () => {
  test("lens user is flagged read-only and sees the notice", async ({ page }) => {
    await open(page, LENS);
    await expect(page.getByTestId("write-readonly")).toHaveText("true");
    await expect(page.getByTestId("readonly-notice")).toBeVisible();
  });

  test("row-level edit / delete / create actions are not rendered", async ({ page }) => {
    await open(page, LENS);
    await expect(page.getByTestId("row-actions")).toHaveCount(0);
    for (const id of ["entry-edit", "entry-delete", "entry-create"]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
  });

  test("bulk actions and delete requests are not rendered", async ({ page }) => {
    await open(page, LENS);
    await expect(page.getByTestId("bulk-actions")).toHaveCount(0);
    for (const id of ["bulk-delete", "bulk-edit", "delete-request", "bulk-import"]) {
      await expect(page.getByTestId(id)).toHaveCount(0);
    }
  });

  test("entry modal opens view-only with no save control", async ({ page }) => {
    await open(page, LENS);
    await page.getByTestId("open-entry-modal").click();
    await expect(page.getByTestId("entry-modal")).toBeVisible();
    await expect(page.getByTestId("modal-readonly")).toBeVisible();
    await expect(page.getByTestId("modal-save")).toHaveCount(0);
  });

  test("programmatic UI-bypass attempts are all blocked", async ({ page }) => {
    await open(page, LENS);
    const ops = ["create", "edit", "delete", "bulk-delete", "bulk-edit", "delete-request", "import", "submit"];
    const results = await page.evaluate((list) => {
      const tryWrite = (window as any).__LENS_TRY_WRITE__ as (op: string) => boolean;
      return list.map((op) => tryWrite(op));
    }, ops);
    expect(results).toEqual(ops.map(() => false));
    await expect(page.getByTestId("write-log")).toHaveText(
      ops.map((o) => `${o}:blocked`).join("|"),
    );
  });

  test("no write survives a reload or a scope-widening query param", async ({ page }) => {
    await open(page, `${LENS}&readOnly=0&admin=1&isOwner=1`);
    await expect(page.getByTestId("write-readonly")).toHaveText("true");
    await expect(page.getByTestId("entry-delete")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("write-readonly")).toHaveText("true");
    await expect(page.getByTestId("bulk-delete")).toHaveCount(0);
  });

  test("non-lens user keeps every write affordance (guard is not over-broad)", async ({ page }) => {
    await open(page, NON_LENS);
    await expect(page.getByTestId("write-readonly")).toHaveText("false");
    await expect(page.getByTestId("entry-edit")).toBeVisible();
    await expect(page.getByTestId("bulk-delete")).toBeVisible();
    await page.getByTestId("entry-delete").click();
    await expect(page.getByTestId("write-log")).toHaveText("delete:allowed");
    await page.getByTestId("open-entry-modal").click();
    await expect(page.getByTestId("modal-save")).toBeVisible();
  });
});
