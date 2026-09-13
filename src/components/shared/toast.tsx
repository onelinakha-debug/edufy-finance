import React, { useEffect, useState } from "react";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from "lucide-react";

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  default: Info,
};

const COLORS = {
  success: "border-success/30 bg-success/5",
  error: "border-destructive/30 bg-destructive/5",
  warning: "border-warning/30 bg-warning/5",
  default: "border-border bg-card",
};

const TEXT_COLORS = {
  success: "text-success",
  error: "text-destructive",
  warning: "text-warning",
  default: "text-foreground",
};

export function ToastContainer() {
  const { toasts, removeToast } = useAppStore();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={removeToast} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: { id: string; title: string; description?: string; variant?: string }; onDismiss: (id: string) => void }) {
  const [visible, setVisible] = useState(false);
  const variant = (toast.variant || "default") as keyof typeof ICONS;
  const Icon = ICONS[variant] || ICONS.default;

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(toast.id), 300);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border shadow-lg transition-all duration-300",
        COLORS[variant] || COLORS.default,
        visible ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"
      )}
    >
      <Icon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", TEXT_COLORS[variant])} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{toast.title}</p>
        {toast.description && <p className="text-xs text-muted-foreground mt-0.5">{toast.description}</p>}
      </div>
      <button onClick={() => onDismiss(toast.id)} className="p-0.5 rounded hover:bg-muted transition-colors">
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    </div>
  );
}
