import { describe, it, vi } from "vitest";

vi.mock("jspdf-autotable", () => ({ default: vi.fn() }));

const mockSave = vi.fn();
const mockDoc = new Proxy({} as any, {
  get(_target, prop) {
    if (prop === "save") return mockSave;
    if (prop === "internal") {
      return {
        pageSize: { getWidth: () => 210, getHeight: () => 297 },
        getCurrentPageInfo: () => ({ pageNumber: 1 }),
        pages: { length: 1 },
      };
    }
    if (prop === "autoTable") return vi.fn();
    if (prop === "output") return () => new Blob(["pdf"]);
    if (prop === "getNumberOfPages") return () => 1;
    return vi.fn();
  },
});

vi.mock("jspdf", () => ({
  default: vi.fn(() => mockDoc),
  jsPDF: vi.fn(() => mockDoc),
}));

import { generateReceipt, generateReportPdf } from "./pdf";

describe("generateReceipt", () => {
  it("creates a PDF receipt without throwing", () => {
    generateReceipt({
      schoolName: "Test Academy",
      receiptNo: "RCP-001",
      paymentNo: "PAY-001",
      studentName: "John Mwangi",
      admissionNo: "ADM-001",
      grade: "Grade 3",
      amount: 15000,
      method: "mpesa",
      mpesaReceipt: "QHK7B4C2DE",
      date: "2026-09-13T12:00:00",
    });
  });

  it("calls save with correct filename", () => {
    mockSave.mockClear();
    generateReceipt({
      schoolName: "Test",
      receiptNo: "R-001",
      paymentNo: "P-001",
      studentName: "Student",
      admissionNo: "A-001",
      grade: "Grade 1",
      amount: 5000,
      method: "cash",
      date: "2026-01-01",
    });
    expect(mockSave).toHaveBeenCalledWith("receipt-R-001.pdf");
  });
});

describe("generateReportPdf", () => {
  it("creates a PDF report without throwing", () => {
    generateReportPdf(
      "Collection Summary",
      ["Vote Head", "Amount"],
      [["Tuition", "15,000"], ["Transport", "5,000"]],
      "report.pdf",
      [{ label: "Total", value: "KES 20,000" }]
    );
  });
});
