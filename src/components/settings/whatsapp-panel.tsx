import { useEffect, useState } from "react";
import { whatsappApi } from "@/services/tauri-commands";
import { useAppStore } from "@/stores/app-store";
import {
  MessageCircle,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Send,
  KeyRound,
  RefreshCw,
} from "lucide-react";

interface WaStatus {
  whatsapp_configured: boolean;
  sms_configured: boolean;
  outbox_pending: number;
  link_requests_pending: number;
}

interface LinkRequest {
  otp_id: string;
  admission_no: string;
  student_name: string;
  grade: string;
  requester_phone: string;
  attempts: number;
  expires_at: string;
  created_at: string;
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${ok ? "bg-green-500" : "bg-gray-300"}`}
    />
  );
}

export function WhatsAppPanel({ schoolId }: { schoolId: string }) {
  const { addToast, authUser } = useAppStore();
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [requests, setRequests] = useState<LinkRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, string>>({});

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [st, reqs] = await Promise.all([
        whatsappApi.status(),
        whatsappApi.linkRequests(schoolId),
      ]);
      setStatus(st);
      setRequests(reqs || []);
    } catch (err) {
      console.error("WhatsApp panel load failed:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [schoolId]);

  const handleSweep = async () => {
    setSweeping(true);
    try {
      const res = await whatsappApi.sweepReminders(schoolId);
      addToast({
        title: res.queued > 0 ? `Queued ${res.queued} reminder(s)` : "Nothing due right now",
        variant: "success",
      });
      load();
    } catch (err) {
      addToast({ title: "Reminder sweep failed", description: String(err), variant: "error" });
    } finally {
      setSweeping(false);
    }
  };

  const handleReveal = async (otpId: string) => {
    try {
      const code = await whatsappApi.revealCode(otpId, authUser?.username || "bursar");
      setRevealed((s) => ({ ...s, [otpId]: code }));
    } catch (err) {
      addToast({ title: "Could not reveal code", description: String(err), variant: "error" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">WhatsApp Fee Bot</h3>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Parents send <code className="bg-muted px-1 rounded">BALANCE</code> on WhatsApp and get
        fees + a pay link instantly. New numbers verify with a 6-digit code sent to the parent
        number on file.
      </p>

      {/* Channel status */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-border p-2.5 flex items-center gap-2">
          <Dot ok={!!status?.whatsapp_configured} />
          <div>
            <p className="font-medium">WhatsApp</p>
            <p className="text-[10px] text-muted-foreground">
              {status?.whatsapp_configured ? "Connected" : "Not configured — set env vars"}
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-border p-2.5 flex items-center gap-2">
          <Dot ok={!!status?.sms_configured} />
          <div>
            <p className="font-medium">SMS fallback</p>
            <p className="text-[10px] text-muted-foreground">
              {status?.sms_configured ? "Connected" : "Optional — Africa's Talking"}
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-border p-2.5">
          <p className="font-medium">{status?.outbox_pending ?? 0} queued</p>
          <p className="text-[10px] text-muted-foreground">Messages waiting to send</p>
        </div>
        <div className="rounded-lg border border-border p-2.5">
          <p className="font-medium">{status?.link_requests_pending ?? 0} link requests</p>
          <p className="text-[10px] text-muted-foreground">Parents awaiting codes</p>
        </div>
      </div>

      {/* Manual reminder sweep */}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSweep}
          disabled={sweeping}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          {sweeping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Send due reminders now
        </button>
        <button
          onClick={load}
          className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted/50 transition-colors inline-flex items-center gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {/* Link requests (bursar relay) */}
      <div>
        <p className="text-xs font-medium mb-2 flex items-center gap-1.5">
          <KeyRound className="h-3.5 w-3.5 text-primary" />
          Parent link requests
        </p>
        {requests.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No pending requests.</p>
        ) : (
          <div className="space-y-2">
            {requests.map((r) => (
              <div key={r.otp_id} className="rounded-lg border border-border p-2.5 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="font-medium">
                    {r.student_name} <span className="text-muted-foreground">({r.admission_no}, {r.grade})</span>
                  </span>
                  {r.attempts > 0 && (
                    <span className="inline-flex items-center gap-1 text-warning">
                      <AlertTriangle className="h-3 w-3" />
                      {r.attempts} wrong tries
                    </span>
                  )}
                </div>
                <p className="text-muted-foreground font-mono">From: {r.requester_phone}</p>
                {revealed[r.otp_id] ? (
                  <p className="font-mono font-bold text-sm tracking-widest">
                    Code: {revealed[r.otp_id]}
                  </p>
                ) : (
                  <button
                    onClick={() => handleReveal(r.otp_id)}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Show code to relay (logged)
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {!status?.whatsapp_configured && (
        <div className="flex items-start gap-2 p-2.5 bg-warning/5 border border-warning/20 rounded-lg">
          <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-muted-foreground">
            WhatsApp is not configured on this server. Set{" "}
            <code className="bg-muted px-1 rounded">WHATSAPP_PHONE_NUMBER_ID</code>,{" "}
            <code className="bg-muted px-1 rounded">WHATSAPP_ACCESS_TOKEN</code>,{" "}
            <code className="bg-muted px-1 rounded">WHATSAPP_VERIFY_TOKEN</code> and{" "}
            <code className="bg-muted px-1 rounded">WHATSAPP_APP_SECRET</code>, then verify at{" "}
            <code className="bg-muted px-1 rounded">GET /webhook/whatsapp</code>. See{" "}
            <code className="bg-muted px-1 rounded">.env.example</code>.
          </p>
        </div>
      )}

      {requests.length > 0 && (
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <CheckCircle className="h-3 w-3 text-success" />
          Code reveals are written to the audit log.
        </p>
      )}
    </div>
  );
}
