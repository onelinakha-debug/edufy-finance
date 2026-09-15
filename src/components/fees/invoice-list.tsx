import React from "react";
import { cn, formatKES, getStatusColor } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { useFeeStore, Invoice } from "@/stores/fee-store";
import { Eye, FileText } from "lucide-react";

interface InvoiceListProps {
  onInvoiceClick: (invoice: Invoice) => void;
}

export function InvoiceList({ onInvoiceClick }: InvoiceListProps) {
  const { invoices, invoicesLoading } = useFeeStore();

  const columns: Column<Invoice>[] = [
    {
      key: "invoice_no",
      header: "Invoice No",
      sortable: true,
      render: (row) => (
        <span className="font-mono text-sm">{row.invoice_no}</span>
      ),
    },
    {
      key: "net_amount",
      header: "Amount",
      sortable: true,
      render: (row) => (
        <span className="font-mono text-sm font-medium">{formatKES(row.net_amount)}</span>
      ),
    },
    {
      key: "discount_amount",
      header: "Discount",
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.discount_amount > 0 ? formatKES(row.discount_amount) : "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "due_date",
      header: "Due Date",
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.due_date
            ? new Date(row.due_date).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" })
            : "—"}
        </span>
      ),
    },
    {
      key: "created_at",
      header: "Created",
      sortable: true,
      render: (row) => (
        <span className="text-sm text-muted-foreground">
          {new Date(row.created_at).toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" })}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      render: (row) => (
        <button
          onClick={(e) => { e.stopPropagation(); onInvoiceClick(row); }}
          className="p-1.5 rounded-md hover:bg-muted transition-colors"
          title="View details"
        >
          <Eye className="h-4 w-4 text-muted-foreground" />
        </button>
      ),
    },
  ];

  if (invoices.length === 0 && !invoicesLoading) {
    return (
      <EmptyState
        icon={FileText}
        title="No invoices generated"
        description="Generate invoices from fee structures to start tracking payments."
        action={{ label: "Generate Invoices", onClick: () => window.dispatchEvent(new CustomEvent("generate-invoices")), icon: FileText }}
      />
    );
  }

  return (
    <DataTable
      columns={columns}
      data={invoices}
      loading={invoicesLoading}
      onRowClick={onInvoiceClick}
      rowKey={(row) => row.id}
      emptyTitle="No invoices found"
    />
  );
}
