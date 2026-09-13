import React, { useState, useEffect, useMemo } from "react";
import { PageContainer } from "@/components/shared/page-container";
import { PageHeader } from "@/components/shared/page-header";
import { PaymentHub } from "@/components/payments/payment-hub";
import { PaymentHistory } from "@/components/payments/payment-history";
import { PaymentReceipt } from "@/components/payments/receipt-viewer";
import { usePaymentStore, Payment } from "@/stores/payment-store";
import { useAppStore } from "@/stores/app-store";
import { formatKES, formatRelative, exportCSV, getMethodName, cn } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Plus, CreditCard, Smartphone, Building2, Banknote, Search,
  Download, X, ArrowUpRight, Calendar, Eye,
} from "lucide-react";

type View = "list" | "record" | "receipt";

export default function PaymentsPage() {
  const { addToast } = useAppStore();
  const { payments, fetchPayments, methodFilter, setMethodFilter } = usePaymentStore();
  const [view, setView] = useState<View>("list");
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => { fetchPayments(); }, []);

  const filtered = useMemo(() => {
    let list = payments;
    if (methodFilter) list = list.filter((p) => p.method === methodFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) =>
        p.payment_no.toLowerCase().includes(q) ||
        (p.mpesa_receipt && p.mpesa_receipt.toLowerCase().includes(q)) ||
        (p.reference && p.reference.toLowerCase().includes(q))
      );
    }
    if (dateFrom) list = list.filter((p) => p.created_at >= dateFrom);
    if (dateTo) list = list.filter((p) => p.created_at <= dateTo + "T23:59:59");
    return list;
  }, [payments, methodFilter, search, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().split("T")[0];
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split("T")[0];
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    return {
      today: payments.filter((p) => p.created_at >= today && p.status === "confirmed").reduce((s, p) => s + p.amount, 0),
      week: payments.filter((p) => p.created_at >= weekAgo && p.status === "confirmed").reduce((s, p) => s + p.amount, 0),
      month: payments.filter((p) => p.created_at >= monthStart && p.status === "confirmed").reduce((s, p) => s + p.amount, 0),
      pending: payments.filter((p) => p.status === "pending").length,
    };
  }, [payments]);

  const handleExport = () => {
    const data = filtered.map((p) => ({
      "Payment No": p.payment_no,
      "Method": getMethodName(p.method),
      "Reference": p.mpesa_receipt || p.reference || "",
      "Amount": p.amount,
      "Status": p.status,
      "Date": p.created_at,
    }));
    exportCSV(data, `payments-${new Date().toISOString().split("T")[0]}`);
    addToast({ title: `Exported ${data.length} payments`, variant: "success" });
  };

  const handlePaymentClick = (payment: Payment) => {
    setSelectedPaymentId(payment.id);
    setView("receipt");
  };

  const handleBack = () => {
    setView("list");
    setSelectedPaymentId(null);
    fetchPayments();
  };

  if (view === "receipt" && selectedPaymentId) {
    return (
      <PageContainer>
        <PaymentReceipt paymentId={selectedPaymentId} onBack={handleBack} />
      </PageContainer>
    );
  }

  const METHOD_ICONS: Record<string, React.ElementType> = { mpesa: Smartphone, bank: Building2, cash: Banknote, cheque: CreditCard };

  return (
    <PageContainer>
      <PageHeader
        title="Payments"
        description={`${filtered.length} payment${filtered.length !== 1 ? "s" : ""} recorded`}
        breadcrumbs={[{ label: "Payments" }]}
        actions={
          view === "list"
            ? [
                { label: "Export", icon: Download, onClick: handleExport, variant: "outline" },
                { label: "Record Payment", icon: Plus, onClick: () => setView("record") },
              ]
            : undefined
        }
      />

      {view !== "list" && (
        <button onClick={handleBack} className="text-xs text-muted-foreground hover:text-foreground transition-colors mb-4 inline-flex items-center gap-1">
          ← Back to overview
        </button>
      )}

      {view === "list" && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Today", value: formatKES(stats.today), icon: Banknote },
              { label: "This Week", value: formatKES(stats.week), icon: CreditCard },
              { label: "This Month", value: formatKES(stats.month), icon: Building2 },
              { label: "Pending Recon", value: String(stats.pending), icon: Calendar },
            ].map((s) => (
              <div key={s.label} className="stat-card">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{s.label}</span>
                  <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="text-xl font-bold">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search receipt, reference..."
                className="flex h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-8 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted">
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
              placeholder="From"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
              placeholder="To"
            />
            <div className="flex items-center gap-1">
              {[
                { value: null, label: "All" },
                { value: "mpesa", label: "M-Pesa" },
                { value: "bank", label: "Bank" },
                { value: "cash", label: "Cash" },
                { value: "cheque", label: "Cheque" },
              ].map((m) => (
                <button
                  key={m.value ?? "all"}
                  onClick={() => setMethodFilter(m.value)}
                  className={cn(
                    "px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors",
                    methodFilter === m.value
                      ? "bg-primary text-primary-foreground"
                      : "border border-input hover:bg-muted text-muted-foreground"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            {(search || dateFrom || dateTo || methodFilter) && (
              <button
                onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); setMethodFilter(null); }}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            )}
          </div>

          {/* Payment table */}
          <DataTable
            columns={[
              {
                key: "payment_no", header: "Payment No", sortable: true,
                render: (p) => <span className="font-mono text-xs">{p.payment_no}</span>,
              },
              {
                key: "method", header: "Method", sortable: true,
                render: (p) => {
                  const Icon = METHOD_ICONS[p.method] || CreditCard;
                  return (
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs capitalize">{getMethodName(p.method)}</span>
                    </div>
                  );
                },
              },
              {
                key: "mpesa_receipt", header: "Reference",
                render: (p) => <span className="font-mono text-xs text-muted-foreground">{p.mpesa_receipt || p.reference || "—"}</span>,
              },
              {
                key: "amount", header: "Amount", sortable: true,
                render: (p) => <span className="font-mono text-xs font-medium">{formatKES(p.amount)}</span>,
              },
              {
                key: "status", header: "Status",
                render: (p) => <StatusBadge status={p.status} />,
              },
              {
                key: "created_at", header: "Date", sortable: true,
                render: (p) => <span className="text-xs text-muted-foreground">{formatRelative(p.created_at)}</span>,
              },
              {
                key: "actions", header: "",
                render: (p) => (
                  <button
                    onClick={(e) => { e.stopPropagation(); handlePaymentClick(p); }}
                    className="p-1 rounded hover:bg-muted transition-colors"
                  >
                    <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                ),
              },
            ]}
            data={filtered}
            onRowClick={handlePaymentClick}
            rowKey={(p) => p.id}
            emptyIcon={CreditCard}
            emptyTitle="No payments"
            emptyDescription="Record your first payment to get started."
            emptyAction={{ label: "Record Payment", onClick: () => setView("record"), icon: Plus }}
          />
        </>
      )}

      {view === "record" && <PaymentHub onPaymentRecorded={handleBack} />}
    </PageContainer>
  );
}
