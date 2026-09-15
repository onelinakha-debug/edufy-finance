# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: students.spec.ts >> Students >> Add Student button is visible
- Location: e2e\students.spec.ts:19:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /Add Student/i })
Expected: visible
Error: strict mode violation: getByRole('button', { name: /Add Student/i }) resolved to 2 elements:
    1) <button title="Add Student" class="inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 gap-1.5 text-xs h-8">…</button> aka getByRole('button', { name: 'Add Student', description: 'Add Student' })
    2) <button class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">…</button> aka getByRole('button', { name: 'Add Student' }).nth(1)

Call log:
  - Expect "toBeVisible" getByRole('button', { name: /Add Student/i }) with timeout 15000ms
  - waiting for getByRole('button', { name: /Add Student/i })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: E
      - generic [ref=e8]: Edufy
    - navigation [ref=e9]:
      - link "Dashboard" [ref=e10] [cursor=pointer]:
        - /url: /dashboard
      - link "Students" [ref=e13] [cursor=pointer]:
        - /url: /students
      - link "Fees" [ref=e16] [cursor=pointer]:
        - /url: /fees
      - link "Payments" [ref=e19] [cursor=pointer]:
        - /url: /payments
      - link "Reports" [ref=e22] [cursor=pointer]:
        - /url: /reports
      - link "Settings" [ref=e25] [cursor=pointer]:
        - /url: /settings
    - button [ref=e29] [cursor=pointer]
  - generic [ref=e32]:
    - banner [ref=e33]:
      - button "Search... ⌘K" [ref=e34] [cursor=pointer]:
        - generic [ref=e38]: Search...
        - generic [ref=e39]: ⌘K
      - button "Switch to dark mode" [ref=e41] [cursor=pointer]
    - main [ref=e44]:
      - generic [ref=e45]:
        - generic [ref=e46]:
          - generic [ref=e47]: Students
          - generic [ref=e49]:
            - generic [ref=e50]:
              - heading "Students" [level=1] [ref=e51]
              - paragraph [ref=e52]: 3 students total
            - generic [ref=e53]:
              - button "Import CSV" [ref=e54] [cursor=pointer]
              - button "Export" [ref=e58] [cursor=pointer]
              - button "Add Student" [ref=e62] [cursor=pointer]
        - generic [ref=e64]:
          - textbox "Search name or admission no..." [ref=e69]
          - button "All Grades" [ref=e71] [cursor=pointer]
          - button "All Status" [ref=e77] [cursor=pointer]
        - table [ref=e84]:
          - rowgroup [ref=e85]:
            - row [ref=e86]:
              - columnheader [ref=e87]:
                - checkbox [ref=e88]
              - columnheader "Adm No" [ref=e89] [cursor=pointer]
              - columnheader "Name" [ref=e94] [cursor=pointer]
              - columnheader "Grade" [ref=e99] [cursor=pointer]
              - columnheader "Stream" [ref=e104]
              - columnheader "Status" [ref=e106]
              - columnheader "Enrolled" [ref=e108] [cursor=pointer]
          - rowgroup [ref=e113]:
            - row [ref=e114] [cursor=pointer]:
              - cell [ref=e115]:
                - checkbox [ref=e116]
              - cell "ADM-001" [ref=e117]
              - cell [ref=e118]:
                - paragraph [ref=e120]: James Mwangi
              - cell "Grade 1" [ref=e121]
              - cell "A" [ref=e122]
              - cell "active" [ref=e123]
              - cell "—" [ref=e126]
            - row [ref=e127] [cursor=pointer]:
              - cell [ref=e128]:
                - checkbox [ref=e129]
              - cell "ADM-002" [ref=e130]
              - cell [ref=e131]:
                - paragraph [ref=e133]: Mary Wanjiku
              - cell "Grade 2" [ref=e134]
              - cell "A" [ref=e135]
              - cell "active" [ref=e136]
              - cell "—" [ref=e139]
            - row [ref=e140] [cursor=pointer]:
              - cell [ref=e141]:
                - checkbox [ref=e142]
              - cell "ADM-003" [ref=e143]
              - cell [ref=e144]:
                - paragraph [ref=e146]: John Ochieng
              - cell "Grade 3" [ref=e147]
              - cell "A" [ref=e148]
              - cell "active" [ref=e149]
              - cell "—" [ref=e152]
```

# Test source

```ts
  1  | import { test, expect } from "./fixtures";
  2  | 
  3  | test.describe("Students", () => {
  4  |   test("shows student list with data", async ({ page }) => {
  5  |     await page.goto("/students");
  6  |     await expect(page.getByText("James Mwangi").first()).toBeVisible({ timeout: 15000 });
  7  |     await expect(page.getByText("ADM-001").first()).toBeVisible();
  8  |   });
  9  | 
  10 |   test("search filters students", async ({ page }) => {
  11 |     await page.goto("/students");
  12 |     await expect(page.getByText("James Mwangi").first()).toBeVisible({ timeout: 15000 });
  13 |     const searchInput = page.locator("input[placeholder*='Search']").first();
  14 |     await searchInput.fill("James");
  15 |     await page.waitForTimeout(500);
  16 |     await expect(page.getByText("James Mwangi").first()).toBeVisible();
  17 |   });
  18 | 
  19 |   test("Add Student button is visible", async ({ page }) => {
  20 |     await page.goto("/students");
> 21 |     await expect(page.getByRole("button", { name: /Add Student/i })).toBeVisible({ timeout: 15000 });
     |                                                                      ^ Error: expect(locator).toBeVisible() failed
  22 |   });
  23 | });
  24 | 
```