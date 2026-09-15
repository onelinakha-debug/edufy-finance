import React, { useState, useEffect } from "react";
import { cn, formatKES, formatDateTime, getMethodName } from "@/lib/utils";
import { StatusBadge } from "@/components/shared/status-badge";
import { LoadingPage } from "@/components/shared/loading-spinner";
import { usePaymentStore, PaymentDetail } from "@/stores/payment-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useAppStore } from "@/stores/app-store";
import { generateReceipt } from "@/lib/pdf";
import {
  ArrowLeft,
  Printer,
  Download,
  Smartphone,
  Building2,
  Banknote,
  CreditCard,
  User,
  Hash,
  Calendar,
  FileText,
} from "lucide-react";

interface PaymentReceiptProps {
  paymentId: string;
  onBack: () => void;
}

const METHOD_ICONS: Record<string, React.ElementType> = {
  mpesa: Smartphone,
  bank: Building2,
  cash: Banknote,
  cheque: CreditCard,
};

export function PaymentReceipt({ paymentId, onBack }: PaymentReceiptProps) {
  const [detail, setDetail] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { fetchPaymentDetail } = usePaymentStore();
  const { profile } = useSettingsStore();
  const { addToast } = useAppStore();

  useEffect(() => {
    loadDetail();
  }, [paymentId]);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const data = await fetchPaymentDetail(paymentId);
      setDetail(data);
    } catch (err) {
      addToast({ title: "Error loading payment", description: String(err), variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingPage />;
  if (!detail) return null;

  const { payment, student_name, admission_no, invoice_no } = detail;
  const MethodIcon = METHOD_ICONS[payment.method] || CreditCard;

  return (
    <div className="animate-fade-in">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to payments
      </button>

      <div className="max-w-lg mx-auto">
        {/* Receipt card */}
        <div className="card-claude overflow-hidden">
          {/* Header */}
          <div className="bg-primary/5 border-b border-border px-6 py-4 text-center">
            <h2 className="text-lg font-semibold">Payment Receipt</h2>
            <p className="text-sm text-muted-foreground">{payment.payment_no}</p>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6">
            {/* Amount */}
            <div className="text-center py-4">
              <p className="text-3xl font-bold">{formatKES(payment.amount)}</p>
              <div className="mt-2">
                <StatusBadge status={payment.status} size="md" />
              </div>
            </div>

            {/* Details */}
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <MethodIcon className="h-4 w-4" />
                  Payment Method
                </span>
                <span className="font-medium capitalize">{getMethodName(payment.method)}</span>
              </div>

              {payment.mpesa_receipt && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Hash className="h-4 w-4" />
                    M-Pesa Receipt
                  </span>
                  <span className="font-mono font-medium">{payment.mpesa_receipt}</span>
                </div>
              )}

              {payment.reference && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Reference
                  </span>
                  <span className="font-mono">{payment.reference}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Student
                </span>
                <span>{student_name}</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Hash className="h-4 w-4" />
                  Admission No
                </span>
                <span className="font-mono">{admission_no}</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Invoice
                </span>
                <span className="font-mono">{invoice_no}</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Date & Time
                </span>
                <span>{formatDateTime(payment.created_at)}</span>
              </div>

              {payment.received_by && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Received by</span>
                  <span>{payment.received_by}</span>
                </div>
              )}

              {payment.notes && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm">{payment.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="border-t border-border px-6 py-4 flex items-center justify-center gap-3">
            <button className="px-4 py-2 text-sm font-medium rounded-md border border-input hover:bg-muted transition-colors inline-flex items-center gap-2">
              <Printer className="h-4 w-4" />
              Print Receipt
            </button>
            <button
              onClick={() => {
                generateReceipt({
                  schoolName: profile?.name || "School",
                  schoolAddress: profile?.address || undefined,
                  schoolPhone: profile?.phone || undefined,
                  receiptNo: payment.payment_no,
                  paymentNo: payment.payment_no,
                  studentName: student_name,
                  admissionNo: admission_no,
                  grade: "",
                  amount: payment.amount,
                  method: payment.method,
                  mpesaReceipt: payment.mpesa_receipt || undefined,
                  reference: payment.reference || undefined,
                  notes: payment.notes || undefined,
                  date: payment.created_at,
                  receivedBy: payment.received_by || undefined,
                });
                addToast({ title: "Receipt downloaded", variant: "success" });
              }}
              className="px-4 py-2 text-sm font-medium rounded-md border border-input hover:bg-muted transition-colors inline-flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
