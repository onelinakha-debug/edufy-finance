# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: payments.spec.ts >> Payments >> Record Payment button is visible
- Location: e2e\payments.spec.ts:14:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /Record Payment/i })
Expected: visible
Error: strict mode violation: getByRole('button', { name: /Record Payment/i }) resolved to 2 elements:
    1) <button title="Record Payment" class="inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 gap-1.5 text-xs h-8">…</button> aka getByRole('button', { name: 'Record Payment', description: 'Record Payment' })
    2) <button class="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">…</button> aka getByRole('button', { name: 'Record Payment' }).nth(1)

Call log:
  - Expect "toBeVisible" getByRole('button', { name: /Record Payment/i }) with timeout 10000ms
  - waiting for getByRole('button', { name: /Record Payment/i })

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
          - generic [ref=e47]: Payments
          - generic [ref=e49]:
            - generic [ref=e50]:
              - heading "Payments" [level=1] [ref=e51]
              - paragraph [ref=e52]: 1 payment recorded
            - generic [ref=e53]:
              - button "Export" [ref=e54] [cursor=pointer]
              - button "Record Payment" [ref=e58] [cursor=pointer]
        - generic [ref=e60]:
          - generic [ref=e61]:
            - generic [ref=e62]: Today
            - generic [ref=e67]: Ksh 0
          - generic [ref=e68]:
            - generic [ref=e69]: This Week
            - generic [ref=e73]: Ksh 0
          - generic [ref=e74]:
            - generic [ref=e75]: This Month
            - generic [ref=e81]: Ksh 0
          - generic [ref=e82]:
            - generic [ref=e83]: Pending Recon
            - generic [ref=e87]: "0"
        - generic [ref=e88]:
          - textbox "Search receipt, reference..." [ref=e93]
          - textbox [ref=e94]:
            - /placeholder: From
          - textbox [ref=e95]:
            - /placeholder: To
          - generic [ref=e96]:
            - button "All" [ref=e97] [cursor=pointer]
            - button "M-Pesa" [ref=e98] [cursor=pointer]
            - button "Bank" [ref=e99] [cursor=pointer]
            - button "Cash" [ref=e100] [cursor=pointer]
            - button "Cheque" [ref=e101] [cursor=pointer]
        - table [ref=e104]:
          - rowgroup [ref=e105]:
            - row [ref=e106]:
              - columnheader "Payment No" [ref=e107] [cursor=pointer]
              - columnheader "Method" [ref=e112] [cursor=pointer]
              - columnheader "Reference" [ref=e117]
              - columnheader "Amount" [ref=e119] [cursor=pointer]
              - columnheader "Status" [ref=e124]
              - columnheader "Date" [ref=e126] [cursor=pointer]
              - columnheader [ref=e131]
          - rowgroup [ref=e132]:
            - row [ref=e133] [cursor=pointer]:
              - cell "PAY-001" [ref=e134]
              - cell "M-Pesa" [ref=e135]
              - cell "QHK7B4C2DE" [ref=e140]
              - cell "Ksh 10,000" [ref=e141]
              - cell "confirmed" [ref=e142]
              - cell "15 Jan 2026" [ref=e145]
              - cell [ref=e146]:
                - button [ref=e147]
```

# Test source

```ts
  1  | import { test, expect } from "./fixtures";
  2  | 
  3  | test.describe("Payments", () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto("/payments");
  6  |     await expect(page.getByRole("heading", { name: "Payments", exact: true })).toBeVisible({ timeout: 15000 });
  7  |   });
  8  | 
  9  |   test("shows payment stats", async ({ page }) => {
  10 |     await expect(page.getByText("Today")).toBeVisible({ timeout: 10000 });
  11 |     await expect(page.getByText("This Week")).toBeVisible();
  12 |   });
  13 | 
  14 |   test("Record Payment button is visible", async ({ page }) => {
> 15 |     await expect(page.getByRole("button", { name: /Record Payment/i })).toBeVisible({ timeout: 10000 });
     |                                                                         ^ Error: expect(locator).toBeVisible() failed
  16 |   });
  17 | 
  18 |   test("payment list shows data", async ({ page }) => {
  19 |     await expect(page.getByText("PAY-001")).toBeVisible({ timeout: 10000 });
  20 |   });
  21 | });
  22 | 
```