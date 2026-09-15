import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { payApi } from "@/services/tauri-commands";
import { formatKES } from "@/lib/utils";
import {
  GraduationCap,
  Loader2,
  CheckCircle,
  XCircle,
  Clock,
  Smartphone,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

interface PaySnapshot {
  invoice_no: string;
  student_name: string;
  admission_no: string;
  amount: number;
  phone: string;
  expires_at: string;
}

type PayStatus = "loading" | "ready" | "sending" | "waiting" | "success" | "failed" | "timeout" | "expired";

function formatPhoneInput(value: string): string {
  const cleaned = value.replace(/\D/g, "");
  if (cleaned.startsWith("254")) return cleaned;
  if (cleaned.startsWith("0")) return "254" + cleaned.slice(1);
  if (cleaned.length <= 9 && cleaned.length > 0) return "254" + cleaned;
  return cleaned;
}

export default function PayPage() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<PayStatus>("loading");
  const [snapshot, setSnapshot] = useState<PaySnapshot | null>(null);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("expired");
      setError("Invalid payment link.");
      return;
    }
    (async () => {
      try {
        const data = await payApi.snapshot(token);
        setSnapshot(data);
        setPhone(data.phone || "");
        setStatus("ready");
      } catch (err: any) {
        setStatus("expired");
        setError(err?.message || "This payment link is invalid or expired. Ask the school for a new one.");
      }
    })();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [token]);

  const startPolling = (txId: string) => {
    let attempts = 0;
    const maxAttempts = 30; // ~60s
    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts >= maxAttempts) {
        if (pollRef.current) clearInterval(pollRef.current);
        setStatus("timeout");
        setStatusMessage("Timed out waiting for M-Pesa. If you paid, the receipt will arrive by SMS/WhatsApp.");
        return;
      }
      try {
        const s = await payApi.status(txId);
        if (s.status === "completed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus("success");
          setReceipt(s.mpesa_receipt);
          setStatusMessage("Payment received. Asante!");
        } else if (s.status === "failed") {
          if (pollRef.current) clearInterval(pollRef.current);
          setStatus("failed");
          setStatusMessage(s.result_description || "Payment failed. No money was deducted.");
        }
      } catch {
        // keep polling on transient errors
      }
    }, 2000);
  };

  const handlePay = async () => {
    if (!token || !snapshot) return;
    const formatted = formatPhoneInput(phone);
    if (formatted.length !== 12) {
      setError("Enter a valid Safaricom number, e.g. 0712 345 678");
      return;
    }
    setError("");
    setStatus("sending");
    setStatusMessage("Sending M-Pesa prompt to your phone...");
    try {
      const res = await payApi.confirm(token, formatted);
      setStatus("waiting");
      setStatusMessage("Check your phone and enter your M-Pesa PIN to complete.");
      startPolling(res.transaction_id);
    } catch (err: any) {
      setStatus("ready");
      setError(err?.message || "Could not start payment. Try again.");
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#C96442] mb-3">
            <GraduationCap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">School Fee Payment</h1>
          <p className="text-xs text-gray-500 mt-1">Secure M-Pesa payment via Edufy Finance</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {status === "loading" && (
            <div className="flex flex-col items-center py-8 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-[#C96442]" />
              <p className="text-sm text-gray-500">Loading payment details...</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {(status === "ready" || status === "sending") && snapshot && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Student</span>
                  <span className="font-medium text-right">{snapshot.student_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Admission</span>
                  <span className="font-mono font-medium">{snapshot.admission_no}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Invoice</span>
                  <span className="font-mono font-medium">{snapshot.invoice_no}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2">
                  <span className="text-gray-500">Amount due</span>
                  <span className="font-mono font-bold text-[#C96442]">{formatKES(snapshot.amount)}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Smartphone className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                  M-Pesa phone number
                </label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0712 345 678"
                  inputMode="tel"
                  disabled={status === "sending"}
                  className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-gray-50 text-sm font-mono focus:outline-none focus:border-[#C96442] focus:bg-white transition-colors"
                />
              </div>

              <button
                onClick={handlePay}
                disabled={status === "sending" || phone.replace(/\D/g, "").length < 9}
                className="w-full h-11 rounded-lg bg-[#C96442] text-white text-sm font-medium hover:bg-[#b55535] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {status === "sending" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending prompt...
                  </>
                ) : (
                  <>Pay {snapshot ? formatKES(snapshot.amount) : ""} via M-Pesa</>
                )}
              </button>
              <p className="text-[11px] text-gray-400 text-center">
                You will receive an STK prompt on your phone. Enter your M-Pesa PIN to complete.
              </p>
            </div>
          )}

          {status === "waiting" && (
            <div className="flex flex-col items-center py-6 gap-3">
              <Clock className="h-10 w-10 text-[#C96442] animate-pulse" />
              <p className="text-sm font-medium text-center">{statusMessage}</p>
              <p className="text-xs text-gray-500 flex items-center gap-1.5">
                <RefreshCw className="h-3 w-3 animate-spin" />
                Confirming payment automatically...
              </p>
            </div>
          )}

          {status === "success" && (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center">
                <CheckCircle className="h-7 w-7 text-green-600" />
              </div>
              <p className="text-sm font-medium text-green-700">{statusMessage}</p>
              {snapshot && (
                <p className="text-xs text-gray-500">
                  {snapshot.student_name} — {formatKES(snapshot.amount)}
                </p>
              )}
              {receipt && (
                <div className="bg-gray-50 rounded-lg px-4 py-2 text-center">
                  <p className="text-[10px] text-gray-500">M-Pesa Receipt</p>
                  <p className="text-sm font-mono font-semibold">{receipt}</p>
                </div>
              )}
              <p className="text-[11px] text-gray-400">A receipt has been sent to the school and your phone.</p>
            </div>
          )}

          {(status === "failed" || status === "timeout") && (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
                <XCircle className="h-7 w-7 text-red-500" />
              </div>
              <p className="text-sm font-medium text-center">{statusMessage || "Payment did not go through."}</p>
              <button
                onClick={() => {
                  setStatus("ready");
                  setStatusMessage("");
                }}
                className="px-4 py-2 text-xs font-medium rounded-md bg-[#C96442] text-white hover:bg-[#b55535] transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {status === "expired" && !snapshot && (
            <div className="flex flex-col items-center py-6 gap-3">
              <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                <AlertCircle className="h-7 w-7 text-gray-400" />
              </div>
              <p className="text-sm text-gray-600 text-center">
                This payment link has expired or was already used. Please ask the school for a new payment link.
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-400 mt-4">
          Edufy Finance — Secure school fee payments
        </p>
      </div>
    </div>
  );
}
