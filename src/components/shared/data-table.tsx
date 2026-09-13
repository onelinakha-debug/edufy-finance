import React from "react";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { LucideIcon, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  className?: string;
  render: (row: T, index: number) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  emptyIcon?: LucideIcon;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: { label: string; onClick: () => void; icon?: LucideIcon };
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string;
  selectedRows?: Set<string>;
  onSelectionChange?: (selected: Set<string>) => void;
  compact?: boolean;
  className?: string;
}

export function DataTable<T>({
  columns, data, loading, emptyIcon, emptyTitle, emptyDescription, emptyAction,
  onRowClick, rowKey, selectedRows, onSelectionChange, compact, className,
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = React.useState<string | null>(null);
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");

  const sorted = React.useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const allSelected = data.length > 0 && selectedRows && data.every((r) => selectedRows.has(rowKey(r)));

  const toggleAll = () => {
    if (!onSelectionChange || !selectedRows) return;
    if (allSelected) onSelectionChange(new Set());
    else onSelectionChange(new Set(data.map(rowKey)));
  };

  const toggleRow = (key: string) => {
    if (!onSelectionChange || !selectedRows) return;
    const next = new Set(selectedRows);
    if (next.has(key)) next.delete(key); else next.add(key);
    onSelectionChange(next);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <LoadingSpinner size="lg" />
        <p className="text-xs text-muted-foreground mt-3">Loading data...</p>
      </div>
    );
  }

  if (data.length === 0) {
    if (emptyIcon) {
      return <EmptyState icon={emptyIcon} title={emptyTitle || "No data"} description={emptyDescription || "No records found."} action={emptyAction} />;
    }
    return (
      <div className="text-center py-16 text-sm text-muted-foreground">
        No records found.
      </div>
    );
  }

  const pad = compact ? "py-1.5 px-3" : "py-2.5 px-4";
  const headerPad = compact ? "py-2 px-3" : "py-2.5 px-4";

  return (
    <div className={cn("card-claude overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              {selectedRows && (
                <th className={cn("w-10", headerPad)}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-border"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "text-left font-medium text-muted-foreground whitespace-nowrap",
                    headerPad,
                    col.sortable && "cursor-pointer select-none hover:text-foreground transition-colors",
                    col.className
                  )}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && (
                      sortKey === col.key
                        ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                        : <ArrowUpDown className="h-3 w-3 opacity-30" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const key = rowKey(row);
              const isSelected = selectedRows?.has(key);
              return (
                <tr
                  key={key}
                  className={cn(
                    "border-b border-border last:border-0 transition-colors",
                    onRowClick && "cursor-pointer hover:bg-muted/40",
                    isSelected && "bg-primary/5"
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  style={{ animationDelay: `${i * 20}ms` }}
                >
                  {selectedRows && (
                    <td className={pad}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(key)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-border"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className={cn(pad, "whitespace-nowrap", col.className)}>
                      {col.render(row, i)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
