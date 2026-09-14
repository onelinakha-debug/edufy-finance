import { test, expect } from "./fixtures";

test.describe("Smoke Tests", () => {
  test("loads the app and shows dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15000 });
  });

  test("sidebar navigation — all links exist and navigate correctly", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15000 });

    const menuItems = ["Students", "Fees", "Payments", "Reports", "Settings"];
    for (const item of menuItems) {
      const link = page.locator("nav a").filter({ hasText: item }).first();
      await expect(link).toBeVisible({ timeout: 5000 });
    }
  });

  test("header renders correctly", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15000 });
    const header = page.locator("header");
    await expect(header).toBeVisible();
  });

  test("page titles are visible for each section", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 15000 });

    const sections: { path: string; text: string }[] = [
      { path: "/students", text: "Students" },
      { path: "/fees", text: "Fee Management" },
      { path: "/payments", text: "Payments" },
      { path: "/settings", text: "Settings" },
    ];

    for (const section of sections) {
      await page.goto(section.path);
      await expect(page.getByText(section.text, { exact: false }).first()).toBeVisible({ timeout: 15000 });
    }
  });
});
