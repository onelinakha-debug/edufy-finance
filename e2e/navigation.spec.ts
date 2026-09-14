import { test, expect } from "./fixtures";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15000 });
  });

  test("sidebar links — Students and Fees navigate correctly", async ({ page }) => {
    await page.locator("nav a").filter({ hasText: "Students" }).click();
    await expect(page.getByRole("heading", { name: "Students" })).toBeVisible({ timeout: 5000 });

    await page.locator("nav a").filter({ hasText: "Fees" }).click();
    await expect(page.getByRole("heading", { name: "Fee Management" })).toBeVisible({ timeout: 5000 });
  });

  test("sidebar links — Payments navigates correctly", async ({ page }) => {
    await page.locator("nav a").filter({ hasText: "Payments" }).click();
    await expect(page.getByRole("heading", { name: "Payments", exact: true })).toBeVisible({ timeout: 5000 });
  });

  test("active sidebar item is highlighted", async ({ page }) => {
    const studentsLink = page.locator("nav a").filter({ hasText: "Students" });
    await studentsLink.click();
    await page.waitForTimeout(500);
    await expect(studentsLink).toHaveClass(/bg-sidebar-accent/);
  });

  test("clicking logo goes to dashboard", async ({ page }) => {
    await page.locator("nav a").filter({ hasText: "Students" }).click();
    await page.waitForTimeout(500);
    await page.locator("nav a").filter({ hasText: "Dashboard" }).click();
    await page.waitForTimeout(500);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });
});
