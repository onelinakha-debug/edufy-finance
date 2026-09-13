import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Search, LayoutDashboard, Users, Receipt, CreditCard, BarChart3,
  Settings, ArrowRight, Command, X,
} from "lucide-react";

const COMMANDS = [
  { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, keywords: ["home", "overview"] },
  { label: "Students", path: "/students", icon: Users, keywords: ["learner", "pupil"] },
  { label: "Fee Management", path: "/fees", icon: Receipt, keywords: ["invoice", "structure", "fee"] },
  { label: "Payments", path: "/payments", icon: CreditCard, keywords: ["mpesa", "cash", "bank"] },
  { label: "Reports", path: "/reports", icon: BarChart3, keywords: ["collection", "outstanding", "history"] },
  { label: "Settings", path: "/settings", icon: Settings, keywords: ["config", "backup", "users"] },
];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        open ? onClose() : null;
      }
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const filtered = COMMANDS.filter((cmd) => {
    const q = query.toLowerCase();
    return cmd.label.toLowerCase().includes(q) || cmd.keywords.some((k) => k.includes(q));
  });

  const handleSelect = (path: string) => {
    navigate(path);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="fixed inset-0 bg-background/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-card border border-border rounded-xl shadow-2xl animate-fade-in overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages, actions..."
            className="flex-1 h-10 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">ESC</kbd>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">No results found</div>
          ) : (
            filtered.map((cmd) => {
              const Icon = cmd.icon;
              return (
                <button
                  key={cmd.path}
                  onClick={() => handleSelect(cmd.path)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors text-left"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1">{cmd.label}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100" />
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export function CommandPaletteTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 h-8 px-3 text-xs text-muted-foreground bg-muted/50 border border-border rounded-md hover:bg-muted transition-colors"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Search...</span>
      <kbd className="text-[10px] bg-background border border-border rounded px-1 py-0.5 ml-2 font-mono">⌘K</kbd>
    </button>
  );
}
