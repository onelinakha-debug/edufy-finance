import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

// ─── CSV EXPORT ──────────────────────────────────────────────────
export async function exportCSV(data: Record<string, unknown>[], filename: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers.map((h) => {
      const v = String(row[h] ?? "");
      return v.includes(",") || v.includes('"') || v.includes("\n") ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");

  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const filePath = await save({ defaultPath: `${filename}.csv`, filters: [{ name: "CSV", extensions: ["csv"] }] });
    if (filePath) await writeTextFile(filePath, csv);
  } else {
    downloadBlob(csv, `${filename}.csv`, "text/csv");
  }
}

// ─── CSV IMPORT ──────────────────────────────────────────────────
export async function importCSV(): Promise<Record<string, string>[]> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const filePath = await open({ filters: [{ name: "CSV", extensions: ["csv"] }], multiple: false });
    if (!filePath) return [];
    const content = await readTextFile(filePath as string);
    return parseCSV(content);
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return resolve([]);
      const text = await file.text();
      resolve(parseCSV(text));
    };
    input.click();
  });
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = values[i] || ""));
    return row;
  });
}

// ─── JSON EXPORT/IMPORT ──────────────────────────────────────────
export async function exportJSON(data: unknown, filename: string) {
  const json = JSON.stringify(data, null, 2);
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const filePath = await save({ defaultPath: `${filename}.json`, filters: [{ name: "JSON", extensions: ["json"] }] });
    if (filePath) await writeTextFile(filePath, json);
  } else {
    downloadBlob(json, `${filename}.json`, "application/json");
  }
}

export async function importJSON<T = unknown>(): Promise<T | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const filePath = await open({ filters: [{ name: "JSON", extensions: ["json"] }], multiple: false });
    if (!filePath) return null;
    const content = await readTextFile(filePath as string);
    return JSON.parse(content);
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return resolve(null);
      const text = await file.text();
      resolve(JSON.parse(text));
    };
    input.click();
  });
}

// ─── PRINT ───────────────────────────────────────────────────────
export function printElement(elementId: string) {
  const el = document.getElementById(elementId);
  if (!el) return;
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<html><head><title>Print</title><style>
    body{font-family:-apple-system,sans-serif;padding:20px;color:#1a1a1a;font-size:12px}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #e5e4e1;padding:6px 10px;text-align:left}
    th{background:#f5f5f3;font-weight:600}.hdr{text-align:center;border-bottom:2px solid #c96442;padding-bottom:10px;margin-bottom:15px}
    .hdr h1{color:#c96442;margin:0;font-size:16px}.ftr{margin-top:15px;text-align:center;font-size:10px;color:#999;border-top:1px solid #e5e4e1;padding-top:8px}
    @media print{body{padding:10px}}</style></head><body>
    <div class="hdr"><h1>Edufy Finance</h1><p>School Fee Management</p></div>
    ${el.innerHTML}
    <div class="ftr">Generated ${new Date().toLocaleString("en-KE")} • Edufy Finance</div>
    </body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); w.close(); }, 500);
}

// ─── DOWNLOAD ────────────────────────────────────────────────────
function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── DATE ────────────────────────────────────────────────────────
export function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-KE", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(d: string | Date): string {
  return new Date(d).toLocaleString("en-KE", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function formatRelative(d: string | Date): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

// ─── CURRENCY ────────────────────────────────────────────────────
export function formatKES(amount: number): string {
  return new Intl.NumberFormat("en-KE", { style: "currency", currency: "KES", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ─── STATUS ──────────────────────────────────────────────────────
export function getStatusColor(status: string): string {
  const map: Record<string, string> = {
    active: "text-success", paid: "text-success", confirmed: "text-success",
    partial: "text-warning", pending: "text-warning",
    overdue: "text-destructive", failed: "text-destructive",
    inactive: "text-muted-foreground", unpaid: "text-muted-foreground",
  };
  return map[status] || "text-muted-foreground";
}

export function getStatusBg(status: string): string {
  const map: Record<string, string> = {
    active: "bg-success/10 text-success border-success/20", paid: "bg-success/10 text-success border-success/20",
    confirmed: "bg-success/10 text-success border-success/20",
    partial: "bg-warning/10 text-warning border-warning/20", pending: "bg-warning/10 text-warning border-warning/20",
    overdue: "bg-destructive/10 text-destructive border-destructive/20",
    unpaid: "bg-muted text-muted-foreground border-border", inactive: "bg-muted text-muted-foreground border-border",
  };
  return map[status] || "bg-muted text-muted-foreground border-border";
}

export function getMethodName(method: string): string {
  const map: Record<string, string> = { mpesa: "M-Pesa", bank: "Bank Transfer", cash: "Cash", cheque: "Cheque" };
  return map[method] || method;
}

export function getFirstName(name: string): string {
  return name?.split(" ")[0] || "";
}

export function getInitials(firstName: string, lastName: string): string {
  return ((firstName?.[0] || "") + (lastName?.[0] || "")).toUpperCase() || "?";
}

// ─── CONFIRM ─────────────────────────────────────────────────────
export async function confirmAction(message: string): Promise<boolean> {
  if (isTauri()) {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    return await ask(message, { title: "Confirm", kind: "warning" });
  }
  return window.confirm(message);
}
