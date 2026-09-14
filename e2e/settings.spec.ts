import { test, expect } from "./fixtures";

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 15000 });
  });

  test("shows settings sidebar buttons", async ({ page }) => {
    await expect(page.getByRole("button", { name: /School Profile/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /Grade Levels/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Users/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Payment Methods/i })).toBeVisible();
  });

  test("school profile form renders", async ({ page }) => {
    await expect(page.getByText("School Name")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("input").first()).toBeVisible();
  });

  test("users section shows data", async ({ page }) => {
    await page.getByRole("button", { name: /Users/i }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText("Administrator").first()).toBeVisible({ timeout: 10000 });
  });

  test("payment methods section shows config", async ({ page }) => {
    await page.getByRole("button", { name: /Payment Methods/i }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole("heading", { name: /M-Pesa/i })).toBeVisible({ timeout: 10000 });
  });
});
