import { test, expect } from "./fixtures";

test.describe("Reports", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible({ timeout: 15000 });
  });

  test("shows report tabs as buttons", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Collection Summary/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /Outstanding/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Student History/i })).toBeVisible();
  });

  test("collection report loads with data", async ({ page }) => {
    await page.getByRole("button", { name: /Collection Summary/i }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText("Tuition")).toBeVisible({ timeout: 10000 });
  });

  test("outstanding tab shows students", async ({ page }) => {
    await page.getByRole("button", { name: /Outstanding/i }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText("James Mwangi")).toBeVisible({ timeout: 10000 });
  });
});
