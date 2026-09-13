import React, { useState, useEffect, useRef } from "react";
import { cn, formatKES } from "@/lib/utils";
import { mpesaApi } from "@/services/tauri-commands";
import { useAppStore } from "@/stores/app-store";
import {
  Smartphone,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Send,
} from "lucide-react";

interface MpesaStkPushProps {
  invoiceId: string;
  invoiceNo: string;
  amount: number;
  studentName: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

type StkStatus = "idle" | "sending" | "waiting" | "success" | "failed" | "timeout";

export function MpesaStkPush({
  invoiceId,
  invoiceNo,
  amount,
  studentName,
  onSuccess,
  onCancel,
}: MpesaStkPushProps) {
  const { addToast, currentSchoolId } = useAppStore();
  const [phone, setPhone] = useState("");
  const [status, setStatus] = useState<StkStatus>("idle");
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [mpesaReceipt, setMpesaReceipt] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const formatPhone = (value: string) => {
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.startsWith("254")) return cleaned;
    if (cleaned.startsWith("0")) return "254" + cleaned.slice(1);
    if (cleaned.length <= 9) return "254" + cleaned;
    return cleaned;
  };

  const handleSendStk = async () => {
    if (!currentSchoolId) return;
    const formattedPhone = formatPhone(phone);
    if (formattedPhone.length < 12) {
      addToast({ title: "Enter a valid phone number", variant: "error" });
      return;
    }

    setStatus("sending");
    setStatusMessage("Initiating M-Pesa payment...");

    try {
      const result = await mpesaApi.initiatePayment({
        school_id: currentSchoolId,
        invoice_id: invoiceId,
        phone: formattedPhone,
        amount,
      });

      setTransactionId(result.id);
      setStatus("waiting");
      setStatusMessage("STK Push sent! Parent should receive a prompt on their phone.");

      // Start polling
      startPolling(result.id);
    } catch (err) {
      setStatus("failed");
      setStatusMessage(String(err));
    }
  };

  const startPolling = (txId: string) => {
    let attempts = 0;
    const maxAttempts = 30; // 60 seconds max

    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts >= maxAttempts) {
        if (pollRef.current) clearInterval(pollRef.current);
        setStatus("timeout");
        setStatusMessage("Payment timed out. The parent may not have completed the transaction.");
        return;
      }

      try {
        const result = await mpesaApi.checkStatus(txId);
        if (result.status === "completed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus("success");
          setMpesaReceipt(result.mpesa_receipt);
          setStatusMessage("Payment completed successfully!");
          addToast({ title: "M-Pesa payment received!", variant: "success" });
          onSuccess?.();
        } else if (result.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus("failed");
          setStatusMessage(result.result_description || "Payment failed");
        }
        // else: still pending, keep polling
      } catch {
        // Ignore polling errors, keep trying
      }
    }, 2000);
  };

  const handleCancel = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setStatus("idle");
    setTransactionId(null);
    onCancel?.();
  };

  return (
    <div className="space-y-3">
      {/* Status indicator */}
      {status === "idle" && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <Smartphone className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">M-Pesa STK Push</span>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">
            Send a payment prompt to the parent's phone. They'll enter their M-Pesa PIN to complete.
          </p>
          <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Invoice</span>
              <span className="font-medium">{invoiceNo}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Student</span>
              <span className="font-medium">{studentName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-mono font-semibold text-primary">{formatKES(amount)}</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Parent Phone Number</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0712 345 678"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Will be formatted to 254XXXXXXXXX
            </p>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSendStk}
              disabled={!phone || phone.length < 10}
              className="flex-1 py-2 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              <Send className="h-3.5 w-3.5" />
              Send STK Push
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-2 text-xs font-medium rounded-md border border-border hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {status === "sending" && (
        <div className="flex flex-col items-center py-6 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium">{statusMessage}</p>
        </div>
      )}

      {status === "waiting" && (
        <div className="flex flex-col items-center py-6 gap-3">
          <div className="relative">
            <Clock className="h-8 w-8 text-primary animate-pulse" />
          </div>
          <p className="text-sm font-medium">{statusMessage}</p>
          <p className="text-xs text-muted-foreground">
            Waiting for parent to enter M-Pesa PIN...
          </p>
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Auto-checking every 2 seconds
          </div>
        </div>
      )}

      {status === "success" && (
        <div className="flex flex-col items-center py-6 gap-3">
          <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
            <CheckCircle className="h-6 w-6 text-success" />
          </div>
          <p className="text-sm font-medium text-success">{statusMessage}</p>
          {mpesaReceipt && (
            <div className="bg-muted/30 rounded-lg px-4 py-2 text-center">
              <p className="text-[10px] text-muted-foreground">M-Pesa Receipt</p>
              <p className="text-sm font-mono font-semibold">{mpesaReceipt}</p>
            </div>
          )}
        </div>
      )}

      {status === "failed" && (
        <div className="flex flex-col items-center py-6 gap-3">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <XCircle className="h-6 w-6 text-destructive" />
          </div>
          <p className="text-sm font-medium text-destructive">{statusMessage}</p>
          <div className="flex gap-2">
            <button
              onClick={() => { setStatus("idle"); setTransactionId(null); }}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Try Again
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {status === "timeout" && (
        <div className="flex flex-col items-center py-6 gap-3">
          <div className="w-12 h-12 rounded-full bg-warning/10 flex items-center justify-center">
            <Clock className="h-6 w-6 text-warning" />
          </div>
          <p className="text-sm font-medium text-warning">{statusMessage}</p>
          <div className="flex gap-2">
            <button
              onClick={() => { setStatus("idle"); setTransactionId(null); }}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted/50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
