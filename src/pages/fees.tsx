import React, { useState, useEffect, useMemo } from "react";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { FeeBuilder } from "@/components/fees/fee-builder";
import { InvoiceGenerator } from "@/components/fees/invoice-generator";
import { InvoiceList } from "@/components/fees/invoice-list";
import { InvoiceDetailView } from "@/components/fees/invoice-detail";
import { useFeeStore, Invoice } from "@/stores/fee-store";
import { useAppStore } from "@/stores/app-store";
import { formatKES, exportCSV, cn } from "@/lib/utils";
import { SearchSelect } from "@/components/ui/search-select";
import { Plus, FileText, Download } from "lucide-react";

type View = "list" | "create" | "generate" | "invoice-detail";

const TERMS = [
  { value: "1", label: "Term 1" },
  { value: "2", label: "Term 2" },
  { value: "3", label: "Term 3" },
];

const YEARS = [2024, 2025, 2026, 2027];

export default function FeesPage() {
  const { currentSchoolId } = useAppStore();
  const { structures, invoices, fetchStructures, fetchInvoices } = useFeeStore();
  const [view, setView] = useState<View>("list");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(null);
  const [term, setTerm] = useState(String(new Date().getMonth() < 4 ? 1 : new Date().getMonth() < 8 ? 2 : 3));
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    if (currentSchoolId) {
      fetchStructures(currentSchoolId, year, Number(term));
      fetchInvoices();
    }
  }, [currentSchoolId, term, year]);

  const handleInvoiceClick = (invoice: Invoice) => {
    setSelectedInvoiceId(invoice.id);
    setView("invoice-detail");
  };

  const handleBack = () => {
    setView("list");
    setSelectedInvoiceId(null);
    if (currentSchoolId) fetchInvoices();
  };

  const handleExport = () => {
    const data = invoices.map((inv) => ({
      "Invoice No": inv.invoice_no,
      "Amount": inv.net_amount,
      "Discount": inv.discount_amount,
      "Status": inv.status,
      "Created": inv.created_at,
      "Paid": inv.paid_at || "",
    }));
    exportCSV(data, `invoices-term${term}-${year}`);
  };

  const stats = useMemo(() => {
    const total = invoices.reduce((s, i) => s + i.net_amount, 0);
    const paid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.net_amount, 0);
    const partial = invoices.filter((i) => i.status === "partial").reduce((s, i) => s + i.net_amount, 0);
    const outstanding = invoices.filter((i) => i.status !== "paid" && i.status !== "waived").reduce((s, i) => s + i.net_amount, 0);
    const overdue = invoices.filter((i) => i.status === "overdue");
    const overdueCount = overdue.length;
    const overdueAmount = overdue.reduce((s, i) => s + i.net_amount, 0);
    const paidCount = invoices.filter((i) => i.status === "paid").length;
    const totalCount = invoices.length;
    const collectionRate = total > 0 ? Math.round(((paid + partial) / total) * 100) : 0;
    return { total, paid, partial, outstanding, overdueCount, overdueAmount, paidCount, totalCount, collectionRate };
  }, [invoices]);

  if (view === "invoice-detail" && selectedInvoiceId) {
    return (
      <PageContainer>
        <InvoiceDetailView invoiceId={selectedInvoiceId} onBack={handleBack} />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title="Fee Management"
        description={`${TERMS.find((t) => t.value === term)?.label} ${year} — ${structures.length} structures, ${invoices.length} invoices`}
        breadcrumbs={[{ label: "Fees" }]}
        actions={
          view === "list"
            ? [
                { label: "Export", icon: Download, onClick: handleExport, variant: "outline" as const },
                { label: "New Structure", icon: Plus, onClick: () => setView("create"), variant: "outline" as const },
                { label: "Generate Invoices", icon: FileText, onClick: () => setView("generate") },
              ]
            : undefined
        }
      />

      {view !== "list" && (
        <button onClick={handleBack} className="text-xs text-muted-foreground hover:text-foreground transition-colors mb-3 inline-flex items-center gap-1">
          ← Back to overview
        </button>
      )}

      {view === "list" && (
        <>
          {/* Term/Year selector */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center bg-muted rounded-md p-0.5">
              {TERMS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTerm(t.value)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                    term === t.value ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <SearchSelect
              options={YEARS.map((y) => ({ value: String(y), label: String(y) }))}
              value={String(year)}
              onChange={(v) => setYear(Number(v))}
              searchable={false}
              size="sm"
              className="w-24"
            />
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-3">
            <div className="stat-card">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Total Invoiced</span>
              <div className="text-base font-bold">{formatKES(stats.total)}</div>
              <span className="text-[10px] text-muted-foreground">{stats.totalCount} invoices</span>
            </div>
            <div className="stat-card">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Collected</span>
              <div className="text-base font-bold text-success">{formatKES(stats.paid)}</div>
              <span className="text-[10px] text-muted-foreground">{stats.paidCount} paid • {stats.collectionRate}%</span>
            </div>
            <div className="stat-card">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Outstanding</span>
              <div className="text-base font-bold text-warning">{formatKES(stats.outstanding)}</div>
              <span className="text-[10px] text-muted-foreground">{stats.totalCount - stats.paidCount} unpaid</span>
            </div>
            <div className="stat-card">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Overdue</span>
              <div className="text-base font-bold text-destructive">{stats.overdueCount}</div>
              <span className="text-[10px] text-muted-foreground">{formatKES(stats.overdueAmount)}</span>
            </div>
          </div>

          {/* Collection Progress */}
          <div className="card-claude p-3 mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-medium">Collection Progress</span>
              <span className="text-[11px] font-bold text-primary">{stats.collectionRate}%</span>
            </div>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${stats.collectionRate}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-muted-foreground">{formatKES(stats.paid)} collected</span>
              <span className="text-[10px] text-muted-foreground">{formatKES(stats.outstanding)} remaining</span>
            </div>
          </div>

          {/* Overdue Alert */}
          {stats.overdueCount > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-lg bg-destructive/5 border border-destructive/20">
              <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
              <span className="text-xs font-medium text-destructive">{stats.overdueCount} overdue invoice{stats.overdueCount !== 1 ? "s" : ""}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{formatKES(stats.overdueAmount)} outstanding</span>
            </div>
          )}

          {/* Quick Summary */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="card-claude p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Structures</p>
              <p className="text-sm font-bold">{structures.length}</p>
            </div>
            <div className="card-claude p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Partial</p>
              <p className="text-sm font-bold text-info">{formatKES(stats.partial)}</p>
            </div>
            <div className="card-claude p-2.5 text-center">
              <p className="text-[10px] text-muted-foreground uppercase">Rate</p>
              <p className="text-sm font-bold text-primary">{stats.collectionRate}%</p>
            </div>
          </div>

          <InvoiceList onInvoiceClick={handleInvoiceClick} />
        </>
      )}

      {view === "create" && currentSchoolId && (
        <FeeBuilder
          schoolId={currentSchoolId}
          onCreated={() => { setView("list"); if (currentSchoolId) fetchStructures(currentSchoolId, year, Number(term)); }}
        />
      )}

      {view === "generate" && currentSchoolId && (
        <InvoiceGenerator
          schoolId={currentSchoolId}
          onGenerated={() => setView("list")}
        />
      )}
    </PageContainer>
  );
}
