import { test, expect } from "./fixtures";

test("warmup — trigger Vite compilation", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({ timeout: 120_000 });
});

test.describe("Fees", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/fees");
    await expect(page.getByRole("heading", { name: "Fee Management" })).toBeVisible({ timeout: 15000 });
  });

  test("shows fee overview with stats", async ({ page }) => {
    await expect(page.getByText("Total Invoiced")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Collected", { exact: true })).toBeVisible();
    await expect(page.getByText("Outstanding", { exact: true })).toBeVisible();
  });

  test("term selector is visible", async ({ page }) => {
    await expect(page.getByText("Term 1").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Term 2").first()).toBeVisible();
    await expect(page.getByText("Term 3").first()).toBeVisible();
  });

  test("collection progress bar renders", async ({ page }) => {
    await expect(page.getByText("Collection Progress")).toBeVisible({ timeout: 10000 });
  });

  test("invoice list shows data", async ({ page }) => {
    await expect(page.getByText("INV-001")).toBeVisible({ timeout: 10000 });
  });
});
