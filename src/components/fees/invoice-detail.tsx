import React, { useState, useEffect } from "react";
import { cn, formatKES, getStatusColor, formatDateTime } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/status-badge";
import { LoadingPage } from "@/components/shared/loading-spinner";
import { useFeeStore, InvoiceDetail } from "@/stores/fee-store";
import { useAppStore } from "@/stores/app-store";
import { ArrowLeft, Printer, Download } from "lucide-react";

interface InvoiceDetailProps {
  invoiceId: string;
  onBack: () => void;
}

export function InvoiceDetailView({ invoiceId, onBack }: InvoiceDetailProps) {
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { fetchInvoiceDetail } = useFeeStore();
  const { addToast } = useAppStore();

  useEffect(() => {
    loadDetail();
  }, [invoiceId]);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const data = await fetchInvoiceDetail(invoiceId);
      setDetail(data);
    } catch (err) {
      addToast({ title: "Error loading invoice", description: String(err), variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingPage />;
  if (!detail) return null;

  const { invoice, items, payments, student_name, admission_no } = detail;
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const outstanding = invoice.net_amount - totalPaid;

  return (
    <div className="animate-fade-in">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to invoices
      </button>

      <div className="card-claude p-4 mb-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold">{invoice.invoice_no}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {student_name} ({admission_no})
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={invoice.status} size="md" />
            <button className="p-2 rounded-md hover:bg-muted transition-colors" title="Print">
              <Printer className="h-4 w-4 text-muted-foreground" />
            </button>
            <button className="p-2 rounded-md hover:bg-muted transition-colors" title="Download">
              <Download className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Fee breakdown */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Fee Breakdown</h3>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fee Item</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className="font-medium">{item.vote_head_name}</span>
                      {item.description && (
                        <span className="text-xs text-muted-foreground ml-2">— {item.description}</span>
                      )}
                    </td>
                    <td className="text-right font-mono">{formatKES(item.amount)}</td>
                  </tr>
                ))}
                {invoice.discount_amount > 0 && (
                  <tr>
                    <td className="text-success">Discount</td>
                    <td className="text-right font-mono text-success">-{formatKES(invoice.discount_amount)}</td>
                  </tr>
                )}
                <tr className="font-semibold">
                  <td>Total</td>
                  <td className="text-right font-mono">{formatKES(invoice.net_amount)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment summary */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">Total Invoiced</p>
            <p className="text-lg font-semibold">{formatKES(invoice.net_amount)}</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">Amount Paid</p>
            <p className="text-lg font-semibold text-success">{formatKES(totalPaid)}</p>
          </div>
          <div className="p-4 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground mb-1">Outstanding</p>
            <p className={cn("text-lg font-semibold", outstanding > 0 ? "text-warning" : "text-success")}>
              {formatKES(outstanding)}
            </p>
          </div>
        </div>

        {/* Payments */}
        <div>
          <h3 className="text-sm font-medium text-muted-foreground mb-3">
            Payments ({payments.length})
          </h3>
          {payments.length > 0 ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Payment No</th>
                    <th>Method</th>
                    <th>Reference</th>
                    <th className="text-right">Amount</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td className="font-mono text-sm">{p.payment_no}</td>
                      <td className="capitalize">{p.method}</td>
                      <td className="font-mono text-sm text-muted-foreground">
                        {p.mpesa_receipt || "—"}
                      </td>
                      <td className="text-right font-mono font-medium">{formatKES(p.amount)}</td>
                      <td className="text-sm text-muted-foreground">{formatDateTime(p.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4">No payments recorded for this invoice.</p>
          )}
        </div>
      </div>
    </div>
  );
}
