import React, { useState, useEffect } from "react";
import { cn, formatKES } from "@/lib/utils";
import { mpesaApi } from "@/services/tauri-commands";
import { useAppStore } from "@/stores/app-store";
import { useFeeStore } from "@/stores/fee-store";
import { SearchSelect } from "@/components/ui/search-select";
import {
  Globe,
  Server,
  Loader2,
  Play,
  CheckCircle,
  AlertTriangle,
  Link2,
  ArrowRight,
  Phone,
  Clock,
} from "lucide-react";

interface C2bMonitorProps {
  schoolId: string;
}

export function C2bMonitor({ schoolId }: C2bMonitorProps) {
  const { addToast } = useAppStore();
  const { invoices, fetchInvoices } = useFeeStore();
  const [serverRunning, setServerRunning] = useState(false);
  const [serverPort, setServerPort] = useState(8089);
  const [registering, setRegistering] = useState(false);
  const [starting, setStarting] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTx, setLoadingTx] = useState(false);
  const [matchModal, setMatchModal] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState("");

  useEffect(() => {
    if (schoolId) {
      fetchInvoices();
      loadC2bTransactions();
    }
  }, [schoolId]);

  const loadC2bTransactions = async () => {
    setLoadingTx(true);
    try {
      const txs = await mpesaApi.listC2bTransactions(schoolId, 50);
      setTransactions(txs || []);
    } catch (err) {
      console.error("Failed to load C2B transactions:", err);
    } finally {
      setLoadingTx(false);
    }
  };

  const handleRegisterUrls = async () => {
    setRegistering(true);
    try {
      const result = await mpesaApi.registerC2bUrls(schoolId);
      addToast({ title: "C2B URLs registered", description: result, variant: "success" });
    } catch (err) {
      addToast({ title: "Failed to register C2B URLs", description: String(err), variant: "error" });
    } finally {
      setRegistering(false);
    }
  };

  const handleStartServer = async () => {
    setStarting(true);
    try {
      const result = await mpesaApi.startC2bServer(schoolId, serverPort);
      setServerRunning(true);
      addToast({ title: "C2B server started", description: result, variant: "success" });
    } catch (err) {
      addToast({ title: "Failed to start server", description: String(err), variant: "error" });
    } finally {
      setStarting(false);
    }
  };

  const handleMatchPayment = async (txId: string) => {
    if (!selectedInvoice) {
      addToast({ title: "Select an invoice first", variant: "error" });
      return;
    }
    try {
      await mpesaApi.matchC2bPayment(txId, selectedInvoice);
      addToast({ title: "C2B payment matched to invoice", variant: "success" });
      setMatchModal(null);
      setSelectedInvoice("");
      loadC2bTransactions();
    } catch (err) {
      addToast({ title: "Failed to match payment", description: String(err), variant: "error" });
    }
  };

  const unmatchedPayments = transactions.filter((t) => t.status === "unmatched");
  const matchedPayments = transactions.filter((t) => t.status === "completed");

  const unpaidInvoices = invoices.filter(
    (inv) => inv.status === "unpaid" || inv.status === "partial" || inv.status === "overdue"
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Globe className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">C2B (Paybill / Till)</h3>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Receive payments directly to your school's M-Pesa paybill or till number.
        Safaricom sends callbacks to your local server.
      </p>

      {/* Server controls */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label className="text-xs font-medium">Server Port</label>
          <input
            type="number"
            value={serverPort}
            onChange={(e) => setServerPort(Number(e.target.value))}
            className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
          />
        </div>
        <div className="flex items-end gap-2">
          <button
            onClick={handleStartServer}
            disabled={starting || serverRunning}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors inline-flex items-center gap-1.5 disabled:opacity-60",
              serverRunning
                ? "bg-success/10 text-success border border-success/20"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
          >
            {starting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : serverRunning ? (
              <CheckCircle className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {serverRunning ? "Running" : "Start Server"}
          </button>
          <button
            onClick={handleRegisterUrls}
            disabled={registering}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted/50 transition-colors inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {registering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            Register URLs
          </button>
        </div>
      </div>

      {/* Status */}
      {serverRunning && (
        <div className="p-2.5 bg-success/5 border border-success/20 rounded-lg text-[11px] space-y-1">
          <p className="font-medium text-success">Server running on port {serverPort}</p>
          <p className="text-muted-foreground">Confirmation: <span className="font-mono">http://localhost:{serverPort}/c2b/confirm</span></p>
          <p className="text-muted-foreground">Validation: <span className="font-mono">http://localhost:{serverPort}/c2b/validate</span></p>
        </div>
      )}

      {!serverRunning && (
        <div className="flex items-start gap-2 p-2.5 bg-warning/5 border border-warning/20 rounded-lg">
          <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 flex-shrink-0" />
          <div className="text-[11px] text-muted-foreground">
            <p className="font-medium text-foreground mb-0.5">Setup Steps:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Enter your paybill/till shortcode in M-Pesa Setup above</li>
              <li>Click "Register URLs" to tell Safaricom where to send callbacks</li>
              <li>Click "Start Server" to receive payments locally</li>
              <li>For production: use ngrok or a public URL instead of localhost</li>
            </ol>
          </div>
        </div>
      )}

      {/* Unmatched payments */}
      {unmatchedPayments.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-warning">Unmatched Payments ({unmatchedPayments.length})</h4>
            <button onClick={loadC2bTransactions} className="text-[10px] text-primary hover:underline">
              Refresh
            </button>
          </div>
          {unmatchedPayments.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center justify-between p-2.5 rounded-lg border border-warning/30 bg-warning/5"
            >
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-warning" />
                <div>
                  <p className="text-xs font-medium">{tx.phone}</p>
                  <p className="text-[10px] text-muted-foreground">
                    Ref: {tx.account_reference || "N/A"} | Receipt: {tx.mpesa_receipt || "N/A"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-semibold">{formatKES(tx.amount)}</span>
                <button
                  onClick={() => setMatchModal(tx.id)}
                  className="px-2 py-1 text-[10px] font-medium rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors inline-flex items-center gap-1"
                >
                  <Link2 className="h-3 w-3" />
                  Match
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent matched */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold">Recent C2B Payments ({matchedPayments.length})</h4>
          <button onClick={loadC2bTransactions} disabled={loadingTx} className="text-[10px] text-primary hover:underline inline-flex items-center gap-1">
            {loadingTx && <Loader2 className="h-3 w-3 animate-spin" />}
            Refresh
          </button>
        </div>
        {matchedPayments.length === 0 && (
          <div className="text-center py-6 text-xs text-muted-foreground">
            No C2B payments received yet
          </div>
        )}
        {matchedPayments.map((tx) => (
          <div key={tx.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-3.5 w-3.5 text-success" />
              <div>
                <p className="text-xs font-medium">{tx.phone}</p>
                <p className="text-[10px] text-muted-foreground">
                  {tx.mpesa_receipt} | {tx.account_reference || "No ref"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-mono font-semibold">{formatKES(tx.amount)}</p>
              <p className="text-[10px] text-muted-foreground">{new Date(tx.created_at).toLocaleDateString("en-KE")}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Match modal */}
      {matchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card-claude p-4 w-full max-w-md space-y-3">
            <h3 className="text-sm font-semibold">Match C2B Payment to Invoice</h3>
            <p className="text-[11px] text-muted-foreground">
              Select the invoice this payment should be applied to.
            </p>
            <SearchSelect
              options={unpaidInvoices.map((inv) => ({
                value: inv.id,
                label: `${inv.invoice_no} — ${formatKES(inv.net_amount)} (${inv.status})`,
              }))}
              value={selectedInvoice}
              onChange={setSelectedInvoice}
              placeholder="Select invoice"
              searchable
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setMatchModal(null); setSelectedInvoice(""); }}
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted/50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleMatchPayment(matchModal)}
                disabled={!selectedInvoice}
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 inline-flex items-center gap-1"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                Match & Record
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
