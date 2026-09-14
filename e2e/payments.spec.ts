import { test, expect } from "./fixtures";

test.describe("Payments", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/payments");
    await expect(page.getByRole("heading", { name: "Payments", exact: true })).toBeVisible({ timeout: 15000 });
  });

  test("shows payment stats", async ({ page }) => {
    await expect(page.getByText("Today")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("This Week")).toBeVisible();
  });

  test("Record Payment button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /Record Payment/i })).toBeVisible({ timeout: 10000 });
  });

  test("payment list shows data", async ({ page }) => {
    await expect(page.getByText("PAY-001")).toBeVisible({ timeout: 10000 });
  });
});
