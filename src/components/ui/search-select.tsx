import React, { useState, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, X, Search } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SearchSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
}

export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchable = true,
  disabled = false,
  className,
  size = "md",
}: SearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    if (!query) return options;
    const q = query.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open && searchable) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, searchable]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open) {
      e.preventDefault();
      if (filtered[highlightedIndex] && !filtered[highlightedIndex].disabled) {
        onChange(filtered[highlightedIndex].value);
        setOpen(false);
        setQuery("");
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setQuery("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  const h = size === "sm" ? "h-8" : "h-9";

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) setOpen(!open); }}
        className={cn(
          "flex items-center justify-between w-full rounded-md border border-input bg-transparent px-2.5 text-xs shadow-sm transition-colors",
          h,
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-ring",
          open && "border-ring ring-1 ring-ring"
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex items-center gap-1 ml-1">
          {selected && !disabled && (
            <span onClick={handleClear} className="p-0.5 rounded hover:bg-muted">
              <X className="h-3 w-3 text-muted-foreground" />
            </span>
          )}
          <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg overflow-hidden animate-fade-in">
          {searchable && (
            <div className="flex items-center gap-2 px-2.5 border-b border-border">
              <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search..."
                className="flex-1 h-8 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
              />
              {query && (
                <button onClick={() => setQuery("")} className="p-0.5 rounded hover:bg-muted">
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              )}
            </div>
          )}
          <div ref={listRef} className="max-h-48 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="py-4 text-center text-[11px] text-muted-foreground">No results</div>
            ) : (
              filtered.map((option, i) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => handleSelect(option.value)}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  className={cn(
                    "w-full flex items-center px-2.5 py-1.5 text-xs text-left transition-colors",
                    option.disabled && "opacity-40 cursor-not-allowed",
                    option.value === value
                      ? "bg-primary/10 text-primary font-medium"
                      : i === highlightedIndex
                      ? "bg-muted/50"
                      : "hover:bg-muted/30"
                  )}
                >
                  {option.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Simple wrapper for backward-compatible usage (string arrays)
interface SimpleSelectProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  size?: "sm" | "md";
}

export function SimpleSelect({ options, value, onChange, placeholder, className, size }: SimpleSelectProps) {
  return (
    <SearchSelect
      options={options.map((o) => ({ value: o, label: o }))}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      searchable={options.length > 6}
      className={className}
      size={size}
    />
  );
}
