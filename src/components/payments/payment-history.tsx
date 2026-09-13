import React, { useMemo } from "react";
import { cn, formatKES, formatDateTime, getMethodName } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { usePaymentStore, Payment } from "@/stores/payment-store";
import { CreditCard, Eye, Smartphone, Building2, Banknote } from "lucide-react";

interface PaymentHistoryProps {
  onPaymentClick: (payment: Payment) => void;
}

const METHOD_ICONS: Record<string, React.ElementType> = {
  mpesa: Smartphone,
  bank: Building2,
  cash: Banknote,
  cheque: CreditCard,
};

export function PaymentHistory({ onPaymentClick }: PaymentHistoryProps) {
  const { payments, loading, methodFilter } = usePaymentStore();

  const filteredPayments = useMemo(() => {
    if (!methodFilter) return payments;
    return payments.filter((p) => p.method === methodFilter);
  }, [payments, methodFilter]);

  const columns: Column<Payment>[] = [
    {
      key: "payment_no",
      header: "Payment No",
      sortable: true,
      render: (row) => (
        <span className="font-mono text-sm">{row.payment_no}</span>
      ),
    },
    {
      key: "method",
      header: "Method",
      sortable: true,
      render: (row) => {
        const Icon = METHOD_ICONS[row.method] || CreditCard;
        return (
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm capitalize">{getMethodName(row.method)}</span>
          </div>
        );
      },
    },
    {
      key: "mpesa_receipt",
      header: "Reference",
      render: (row) => (
        <span className="font-mono text-sm text-muted-foreground">
          {row.mpesa_receipt || row.reference || "—"}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      sortable: true,
      render: (row) => (
        <span className="font-mono text-sm font-medium">{formatKES(row.amount)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "created_at",
      header: "Date",
      sortable: true,
      render: (row) => (
        <span className="text-sm text-muted-foreground">{formatDateTime(row.created_at)}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <button
          onClick={(e) => { e.stopPropagation(); onPaymentClick(row); }}
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
          title="View details"
        >
          <Eye className="h-4 w-4 text-muted-foreground" />
        </button>
      ),
    },
  ];

  if (filteredPayments.length === 0 && !loading) {
    return (
      <EmptyState
        icon={CreditCard}
        title="No payments recorded"
        description="Payments will appear here once you start recording transactions."
      />
    );
  }

  return (
    <DataTable
      columns={columns}
      data={filteredPayments}
      loading={loading}
      onRowClick={onPaymentClick}
      rowKey={(row) => row.id}
      emptyMessage="No payments found"
    />
  );
}
