import { test as base, expect } from "@playwright/test";

const MOCK_DATA = {
  list_schools: [{ id: "school-1", name: "Test Academy", school_type: "private_day", county: "Nairobi", address: "", phone: "", motto: "", created_at: "2026-01-01T00:00:00.000Z" }],
  get_school: { id: "school-1", name: "Test Academy", school_type: "private_day", county: "Nairobi", address: "", phone: "", motto: "", created_at: "2026-01-01T00:00:00.000Z" },
  create_school: { id: "school-1", name: "Test Academy", school_type: "private_day", county: "Nairobi", address: "", phone: "", motto: "", created_at: "2026-01-01T00:00:00.000Z" },
  get_school_profile: { id: "school-1", name: "Test Academy", school_type: "private_day", county: "Nairobi", address: "", phone: "", motto: "", created_at: "2026-01-01T00:00:00.000Z" },
  update_school_profile: { id: "school-1", name: "Test Academy" },
  get_grades: [
    { id: "g1", school_id: "school-1", name: "Grade 1", level: "primary", sort_order: 1, created_at: "2026-01-01T00:00:00.000Z" },
    { id: "g2", school_id: "school-1", name: "Grade 2", level: "primary", sort_order: 2, created_at: "2026-01-01T00:00:00.000Z" },
    { id: "g3", school_id: "school-1", name: "Grade 3", level: "primary", sort_order: 3, created_at: "2026-01-01T00:00:00.000Z" },
  ],
  create_grade: { id: "g4", school_id: "school-1", name: "New Grade", level: "primary", sort_order: 4, created_at: "2026-01-01T00:00:00.000Z" },
  count_students_in_grade: 2,
  get_promotion_history: [],
  get_students: [
    { id: "s1", school_id: "school-1", admission_no: "ADM-001", first_name: "James", last_name: "Mwangi", grade: "Grade 1", stream: "A", status: "active", guardian_name: "", guardian_phone: "", created_at: "2026-01-01T00:00:00.000Z" },
    { id: "s2", school_id: "school-1", admission_no: "ADM-002", first_name: "Mary", last_name: "Wanjiku", grade: "Grade 2", stream: "A", status: "active", guardian_name: "", guardian_phone: "", created_at: "2026-01-01T00:00:00.000Z" },
    { id: "s3", school_id: "school-1", admission_no: "ADM-003", first_name: "John", last_name: "Ochieng", grade: "Grade 3", stream: "A", status: "active", guardian_name: "", guardian_phone: "", created_at: "2026-01-01T00:00:00.000Z" },
  ],
  get_student_detail: { id: "s1", school_id: "school-1", admission_no: "ADM-001", first_name: "James", last_name: "Mwangi", grade: "Grade 1", stream: "A", status: "active", guardian_name: "", guardian_phone: "", created_at: "2026-01-01T00:00:00.000Z", invoices: [], payments: [] },
  get_fee_structures: [
    { id: "fs1", school_id: "school-1", name: "Grade 1 - Term 1 Fees", grade: "Grade 1", term: 1, academic_year: 2026, is_active: true, created_at: "2026-01-01T00:00:00.000Z" },
  ],
  get_vote_heads: [
    { id: "vh1", fee_structure_id: "fs1", name: "Tuition", category: "tuition", amount: 15000, is_mandatory: true, sort_order: 1 },
  ],
  get_discount_configs: [],
  get_invoices: [
    { id: "inv1", invoice_no: "INV-001", student_id: "s1", fee_structure_id: "fs1", total_amount: 15000, discount_amount: 0, net_amount: 15000, status: "partial", due_date: null, created_at: "2026-01-01T00:00:00.000Z", paid_at: "2026-01-15T00:00:00.000Z", paid: 10000, outstanding: 5000, student_name: "James Mwangi", admission_no: "ADM-001", grade: "Grade 1", term: 1, academic_year: 2026 },
    { id: "inv2", invoice_no: "INV-002", student_id: "s2", fee_structure_id: "fs1", total_amount: 15000, discount_amount: 0, net_amount: 15000, status: "unpaid", due_date: null, created_at: "2026-01-01T00:00:00.000Z", paid_at: null, paid: 0, outstanding: 15000, student_name: "Mary Wanjiku", admission_no: "ADM-002", grade: "Grade 2", term: 1, academic_year: 2026 },
  ],
  generate_invoices: [],
  get_invoice_detail: {
    id: "inv1", invoice_no: "INV-001", student_id: "s1", fee_structure_id: "fs1", total_amount: 15000, discount_amount: 0, net_amount: 15000, status: "partial", due_date: null, created_at: "2026-01-01T00:00:00.000Z", paid_at: "2026-01-15T00:00:00.000Z",
    student_name: "James Mwangi", admission_no: "ADM-001",
    items: [{ id: "ii1", vote_head_id: "vh1", amount: 15000, description: null, vote_head_name: "Tuition" }],
    payments: [{ id: "p1", payment_no: "PAY-001", amount: 10000, method: "mpesa", mpesa_receipt: "QHK7B4C2DE", created_at: "2026-01-15T00:00:00.000Z" }],
  },
  get_payments: [
    { id: "p1", school_id: "school-1", student_id: "s1", invoice_id: "inv1", amount: 10000, method: "mpesa", mpesa_receipt: "QHK7B4C2DE", payment_no: "PAY-001", reference: "", notes: "", status: "confirmed", received_by: "admin", created_at: "2026-01-15T00:00:00.000Z", student_name: "James Mwangi", admission_no: "ADM-001", invoice_no: "INV-001" },
  ],
  get_payment_detail: { payment: { id: "p1", school_id: "school-1", student_id: "s1", invoice_id: "inv1", amount: 10000, method: "mpesa", mpesa_receipt: "QHK7B4C2DE", payment_no: "PAY-001", reference: "", notes: "", status: "confirmed", received_by: "admin", created_at: "2026-01-01T00:00:00.000Z" }, student_name: "James Mwangi", admission_no: "ADM-001", invoice_no: "INV-001" },
  get_dashboard_stats: { total_students: 3, active_students: 3, total_invoiced: 30000, total_paid: 10000, total_outstanding: 20000, collection_rate: 33, recent_payments: [], overdue_count: 0 },
  get_invoice_stats: { total: 30000, paid: 10000, outstanding: 20000, partial: 10000, overdueCount: 0, overdueAmount: 0, paidCount: 1, totalCount: 2, collectionRate: 33, overdue: 0, partialCount: 1 },
  get_collection_summary: {
    total_invoiced: 30000, total_paid: 10000, total_outstanding: 20000, total_discounted: 0,
    collection_rate: 33,
    by_vote_head: [{ name: "Tuition", invoiced: 30000, paid: 10000 }],
    by_method: [{ method: "mpesa", count: 1, total: 10000 }],
    by_grade: [{ grade: "Grade 1", invoiced: 15000, paid: 10000, outstanding: 5000 }, { grade: "Grade 2", invoiced: 15000, paid: 0, outstanding: 15000 }],
    daily_trend: [{ date: "2026-01-15", amount: 10000 }],
  },
  get_outstanding_report: [
    { student_id: "s1", student_name: "James Mwangi", admission_no: "ADM-001", grade: "Grade 1", total_invoiced: 15000, total_paid: 10000, outstanding: 5000, oldest_unpaid_date: "2026-01-01T00:00:00.000Z", days_overdue: 14 },
    { student_id: "s2", student_name: "Mary Wanjiku", admission_no: "ADM-002", grade: "Grade 2", total_invoiced: 15000, total_paid: 0, outstanding: 15000, oldest_unpaid_date: "2026-01-01T00:00:00.000Z", days_overdue: 14 },
  ],
  get_student_history: [
    { date: "2026-01-15T00:00:00.000Z", description: "Tuition - INV-001", debit: 15000, credit: 10000, balance: 5000, method: "mpesa", reference: "QHK7B4C2DE" },
  ],
  get_age_analysis: [],
  list_users: [{ id: "u1", username: "admin", full_name: "Administrator", role: "admin", is_active: true, created_at: "2026-01-01T00:00:00.000Z" }],
  get_mpesa_config: null,
  get_setting: null,
  get_mpesa_transactions: [],
};

const MOCK_DATA_JSON = JSON.stringify(MOCK_DATA);

const test = base.extend<{ setupMock: void }>({
  setupMock: [async ({ page }, use) => {
    await page.addInitScript((dataJson: string) => {
      const data = JSON.parse(dataJson);
      (window as any).__TAURI_INTERNALS__ = {
        invoke: function(cmd: string, args?: unknown) {
          if (cmd in data) {
            return Promise.resolve(JSON.parse(JSON.stringify((data as any)[cmd])));
          }
          return Promise.resolve(null);
        },
        transformCallback: function(cb: unknown, once?: boolean) {
          const id = Math.floor(Math.random() * 100000);
          (window as any)["_" + id] = cb;
          return id;
        },
        metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
      };
      (window as any).__TAURI__ = (window as any).__TAURI_INTERNALS__;
    }, MOCK_DATA_JSON);
    await use();
  }, { auto: true }],
});

export { test, expect };
