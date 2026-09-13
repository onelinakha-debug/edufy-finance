import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { mpesaApi } from "@/services/tauri-commands";
import { useAppStore } from "@/stores/app-store";
import {
  Smartphone,
  Loader2,
  CheckCircle,
  AlertTriangle,
  TestTube,
  Eye,
  EyeOff,
  ExternalLink,
} from "lucide-react";

interface MpesaConfigPanelProps {
  schoolId: string;
}

export function MpesaConfigPanel({ schoolId }: MpesaConfigPanelProps) {
  const { addToast } = useAppStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [config, setConfig] = useState({
    consumer_key: "",
    consumer_secret: "",
    passkey: "",
    shortcode: "",
    callback_url: "",
  });
  const [existingConfig, setExistingConfig] = useState<any>(null);

  useEffect(() => {
    if (schoolId) loadConfig();
  }, [schoolId]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const data = await mpesaApi.getConfig(schoolId);
      if (data) {
        setExistingConfig(data);
        setConfig({
          consumer_key: data.consumer_key || "",
          consumer_secret: data.consumer_secret || "",
          passkey: data.passkey || "",
          shortcode: data.shortcode || "",
          callback_url: data.callback_url || "",
        });
      }
    } catch (err) {
      console.error("Failed to load M-Pesa config:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!config.consumer_key || !config.consumer_secret || !config.passkey || !config.shortcode) {
      addToast({ title: "Fill in all required fields", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      const result = await mpesaApi.saveConfig({ school_id: schoolId, ...config });
      setExistingConfig(result);
      addToast({ title: "M-Pesa credentials saved", variant: "success" });
    } catch (err) {
      addToast({ title: "Failed to save credentials", description: String(err), variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await mpesaApi.testConnection(schoolId);
      addToast({ title: result, variant: "success" });
    } catch (err) {
      addToast({ title: "Connection test failed", description: String(err), variant: "error" });
    } finally {
      setTesting(false);
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">M-Pesa (Daraja API)</h3>
        </div>
        {existingConfig && (
          <span className="text-[10px] px-2 py-0.5 rounded bg-success/10 text-success border border-success/20">
            Configured
          </span>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Set up Safaricom Daraja API credentials to accept M-Pesa payments via STK Push.
        Parents receive a payment prompt on their phone.
      </p>

      <a
        href="https://developer.safaricom.co.ke"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
      >
        Get credentials from Safaricom Developer Portal
        <ExternalLink className="h-3 w-3" />
      </a>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Consumer Key *</label>
            <input
              value={config.consumer_key}
              onChange={(e) => setConfig({ ...config, consumer_key: e.target.value })}
              placeholder="Safaricom consumer key"
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Consumer Secret *</label>
            <div className="relative">
              <input
                value={config.consumer_secret}
                onChange={(e) => setConfig({ ...config, consumer_secret: e.target.value })}
                placeholder="Safaricom consumer secret"
                type={showSecrets ? "text" : "password"}
                className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 pr-8 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
              />
              <button
                type="button"
                onClick={() => setShowSecrets(!showSecrets)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showSecrets ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1">Passkey *</label>
            <input
              value={config.passkey}
              onChange={(e) => setConfig({ ...config, passkey: e.target.value })}
              placeholder="Daraja passkey"
              type={showSecrets ? "text" : "password"}
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Shortcode *</label>
            <input
              value={config.shortcode}
              onChange={(e) => setConfig({ ...config, shortcode: e.target.value })}
              placeholder="e.g. 174379"
              className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1">Callback URL (optional)</label>
          <input
            value={config.callback_url}
            onChange={(e) => setConfig({ ...config, callback_url: e.target.value })}
            placeholder="https://yourdomain.com/mpesa/callback"
            className="flex h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-mono"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Leave blank for polling mode (recommended for desktop apps)
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
          Save Credentials
        </button>
        {existingConfig && (
          <button
            onClick={handleTest}
            disabled={testing}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-muted/50 transition-colors inline-flex items-center gap-1.5 disabled:opacity-60"
          >
            {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />}
            Test Connection
          </button>
        )}
      </div>

      <div className="flex items-start gap-2 p-2.5 bg-primary/5 border border-primary/20 rounded-lg">
        <AlertTriangle className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
        <div className="text-[11px] text-muted-foreground">
          <p className="font-medium text-foreground mb-0.5">How STK Push works:</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>Bursar enters parent's phone number and amount</li>
            <li>Parent receives STK prompt on their phone</li>
            <li>Parent enters M-Pesa PIN to complete payment</li>
            <li>Payment is automatically recorded in the system</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
