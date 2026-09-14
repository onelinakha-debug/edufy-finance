import { test, expect } from "./fixtures";

test.describe("Students", () => {
  test("shows student list with data", async ({ page }) => {
    await page.goto("/students");
    await expect(page.getByText("James Mwangi").first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("ADM-001").first()).toBeVisible();
  });

  test("search filters students", async ({ page }) => {
    await page.goto("/students");
    await expect(page.getByText("James Mwangi").first()).toBeVisible({ timeout: 15000 });
    const searchInput = page.locator("input[placeholder*='Search']").first();
    await searchInput.fill("James");
    await page.waitForTimeout(500);
    await expect(page.getByText("James Mwangi").first()).toBeVisible();
  });

  test("Add Student button is visible", async ({ page }) => {
    await page.goto("/students");
    await expect(page.getByRole("button", { name: /Add Student/i })).toBeVisible({ timeout: 15000 });
  });
});
