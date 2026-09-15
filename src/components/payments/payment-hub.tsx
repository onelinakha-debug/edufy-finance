import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { cn, formatKES } from "@/lib/utils";
import { PAYMENT_METHODS } from "@/lib/constants";
import { usePaymentStore } from "@/stores/payment-store";
import { useFeeStore } from "@/stores/fee-store";
import { useAppStore } from "@/stores/app-store";
import { whatsappApi } from "@/services/tauri-commands";
import { SearchSelect } from "@/components/ui/search-select";
import { MpesaStkPush } from "@/components/payments/mpesa-stk";
import {
  X,
  Send,
  Loader2,
  CheckCircle,
  Smartphone,
  Building2,
  Banknote,
  CreditCard,
  FileCheck,
  AlertTriangle,
  Link2,
  Copy,
} from "lucide-react";

const paymentSchema = z.object({
  invoice_id: z.string().min(1, "Invoice is required"),
  amount: z.coerce.number().min(1, "Amount must be greater than 0"),
  method: z.string().min(1, "Payment method is required"),
  reference: z.string().optional(),
  mpesa_receipt: z.string().optional(),
  notes: z.string().optional(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface PaymentHubProps {
  onPaymentRecorded?: () => void;
}

const METHOD_ICONS: Record<string, React.ElementType> = {
  mpesa: Smartphone,
  bank: Building2,
  cash: Banknote,
  cheque: FileCheck,
};

/** Bursar generates a single-use parent pay link (valid 10 min) to share via SMS/WhatsApp. */
function ParentPayLink({ invoiceId }: { invoiceId: string }) {
  const { addToast, currentSchoolId } = useAppStore();
  const [phone, setPhone] = useState("");
  const [link, setLink] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    if (!currentSchoolId) {
      addToast({ title: "No school selected", variant: "error" });
      return;
    }
    setGenerating(true);
    try {
      const res = await whatsappApi.generateLink(currentSchoolId, invoiceId, phone.trim());
      const url = `${window.location.origin}/pay/${res.token}`;
      setLink(url);
      addToast({ title: "Pay link created (valid 10 min)", variant: "success" });
    } catch (err) {
      addToast({ title: "Could not create link", description: String(err), variant: "error" });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast({ title: "Copy failed — long-press to copy manually", variant: "warning" });
    }
  };

  return (
    <div className="mt-3 pt-3 border-t border-primary/20">
      <p className="text-xs font-medium mb-2 flex items-center gap-1.5">
        <Link2 className="h-3.5 w-3.5 text-primary" />
        Parent self-service link
      </p>
      <p className="text-[11px] text-muted-foreground mb-2">
        Share with the parent — they pay on their own phone, no bursar STK needed.
      </p>
      {!link ? (
        <div className="flex gap-2">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Parent phone (optional)"
            className="flex-1 h-8 rounded-md border border-input bg-transparent px-2.5 text-xs font-mono shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="px-3 h-8 text-xs font-medium rounded-md border border-border hover:bg-muted/50 transition-colors inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            Generate
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            value={link}
            readOnly
            className="flex-1 h-8 rounded-md border border-input bg-muted/30 px-2.5 text-[11px] font-mono truncate"
          />
          <button
            onClick={handleCopy}
            className="px-3 h-8 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
          >
            <Copy className="h-3.5 w-3.5" />
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );
}

export function PaymentHub({ onPaymentRecorded }: PaymentHubProps) {
  const [selectedMethod, setSelectedMethod] = useState<string>("mpesa");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showStkPush, setShowStkPush] = useState(false);
  const { recordPayment } = usePaymentStore();
  const { invoices, fetchInvoices } = useFeeStore();
  const { addToast, currentSchoolId } = useAppStore();

  useEffect(() => {
    fetchInvoices();
  }, []);

  const unpaidInvoices = invoices.filter(
    (inv) => inv.status === "unpaid" || inv.status === "partial" || inv.status === "overdue"
  );

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors },
  } = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      invoice_id: "",
      amount: 0,
      method: "mpesa",
      reference: "",
      mpesa_receipt: "",
      notes: "",
    },
  });

  const watchAmount = watch("amount");
  const watchInvoiceId = watch("invoice_id");
  const selectedInvoice = unpaidInvoices.find((inv) => inv.id === watchInvoiceId);

  // Calculate outstanding: net_amount minus what's already been paid
  const outstanding = selectedInvoice
    ? selectedInvoice.net_amount
    : 0;

  const isOverpayment = selectedInvoice && watchAmount > outstanding;
  const isUnderpayment = selectedInvoice && watchAmount > 0 && watchAmount < outstanding;

  const onSubmit = async (data: PaymentFormData) => {
    if (isOverpayment) {
      addToast({ title: "Amount exceeds outstanding balance", variant: "error" });
      return;
    }
    if (!data.invoice_id) {
      addToast({ title: "Please select an invoice", variant: "error" });
      return;
    }

    setSubmitting(true);
    try {
      await recordPayment({
        ...data,
        method: selectedMethod,
      });
      setSuccess(true);
      addToast({ title: "Payment recorded successfully", variant: "success" });
      reset();
      fetchInvoices();
      onPaymentRecorded?.();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      addToast({ title: "Error recording payment", description: String(err), variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card-claude p-4">
      <h3 className="text-lg font-semibold mb-1">Record Payment</h3>
      <p className="text-sm text-muted-foreground mb-6">
        Accept payment via M-Pesa, bank transfer, cash, or cheque
      </p>

      {/* Method selector */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        {PAYMENT_METHODS.filter((m) => m.value !== "airtel").map((m) => {
          const Icon = METHOD_ICONS[m.value] || CreditCard;
          return (
            <button
              key={m.value}
              type="button"
              onClick={() => setSelectedMethod(m.value)}
              className={cn(
                "flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors",
                selectedMethod === m.value
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border hover:bg-muted/50 text-muted-foreground"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Success banner */}
      {success && (
        <div className="mb-4 p-3 rounded-lg bg-success/10 border border-success/20 text-sm text-success flex items-center gap-2 animate-fade-in">
          <CheckCircle className="h-4 w-4" />
          Payment recorded successfully!
        </div>
      )}

      {unpaidInvoices.length === 0 && (
        <div className="mb-4 p-3 rounded-lg bg-warning/5 border border-warning/20 text-sm text-muted-foreground flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          No unpaid invoices found. Create fee structures and generate invoices first.
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Invoice selection */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Select Invoice</label>
          <SearchSelect
            options={unpaidInvoices.map((inv) => ({
              value: inv.id,
              label: `${inv.invoice_no} — ${formatKES(inv.net_amount)} (${inv.status})`
            }))}
            value={watch("invoice_id") || ""}
            onChange={(v) => {
              setValue("invoice_id", v, { shouldValidate: true });
              // Auto-fill amount with outstanding
              const inv = unpaidInvoices.find((i) => i.id === v);
              if (inv) setValue("amount", inv.net_amount, { shouldValidate: true });
            }}
            placeholder="Choose an invoice to pay"
            searchable={true}
            className={errors.invoice_id ? "ring-1 ring-destructive" : ""}
          />
          {errors.invoice_id && (
            <p className="text-xs text-destructive mt-1">{errors.invoice_id.message}</p>
          )}
          {selectedInvoice && (
            <p className="text-xs text-muted-foreground mt-1">
              Outstanding: <span className="font-medium">{formatKES(outstanding)}</span>
            </p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Amount (KES)</label>
          <input
            {...register("amount")}
            type="number"
            min={1}
            max={outstanding || undefined}
            placeholder="0"
            className={cn(
              "flex h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono",
              errors.amount && "border-destructive",
              isOverpayment && "border-destructive"
            )}
          />
          {errors.amount && (
            <p className="text-xs text-destructive mt-1">{errors.amount.message}</p>
          )}
          {isOverpayment && (
            <p className="text-xs text-destructive mt-1">
              Amount exceeds outstanding of {formatKES(outstanding)}
            </p>
          )}
          {isUnderpayment && (
            <p className="text-xs text-warning mt-1">
              Partial payment — {formatKES(outstanding - watchAmount)} will remain outstanding
            </p>
          )}
        </div>

        {/* Method-specific fields */}
        {selectedMethod === "mpesa" && selectedInvoice && (
          <div className="border border-primary/20 rounded-lg p-3 bg-primary/5">
            <MpesaStkPush
              invoiceId={selectedInvoice.id}
              invoiceNo={selectedInvoice.invoice_no}
              amount={watchAmount || selectedInvoice.net_amount}
              studentName={`${(selectedInvoice as any).student_first_name || (selectedInvoice as any).studentName || ""} ${(selectedInvoice as any).student_last_name || ""}`.trim() || "Student"}
              onSuccess={() => {
                fetchInvoices();
                onPaymentRecorded?.();
                reset();
                setSuccess(true);
                setShowStkPush(false);
                setTimeout(() => setSuccess(false), 3000);
              }}
              onCancel={() => setShowStkPush(false)}
            />
            <ParentPayLink invoiceId={selectedInvoice.id} />
          </div>
        )}

        {selectedMethod === "mpesa" && !selectedInvoice && (
          <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-center">
            <Smartphone className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Select an invoice above to use M-Pesa STK Push</p>
          </div>
        )}

        {selectedMethod === "bank" && (
          <div>
            <label className="block text-sm font-medium mb-1.5">Bank Reference / Slip Number</label>
            <input
              {...register("reference")}
              placeholder="e.g. Bank deposit slip number"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        )}

        {selectedMethod === "cheque" && (
          <div>
            <label className="block text-sm font-medium mb-1.5">Cheque Number</label>
            <input
              {...register("reference")}
              placeholder="e.g. Cheque number"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Notes (optional)</label>
          <textarea
            {...register("notes")}
            rows={2}
            placeholder="Any additional notes..."
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || unpaidInvoices.length === 0 || isOverpayment}
          className="w-full py-2.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Record Payment
            </>
          )}
        </button>
      </form>
    </div>
  );
}
