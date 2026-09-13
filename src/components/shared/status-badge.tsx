import React from "react";
import { cn, getStatusBg } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function StatusBadge({ status, size = "sm", className }: StatusBadgeProps) {
  const sizeClasses = { sm: "text-[10px] px-1.5 py-0.5", md: "text-xs px-2 py-0.5", lg: "text-xs px-2.5 py-1" };

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full border capitalize",
        sizeClasses[size],
        getStatusBg(status),
        className
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full mr-1", {
        "bg-success": ["active", "paid", "confirmed", "completed"].includes(status),
        "bg-warning": ["partial", "pending", "processing"].includes(status),
        "bg-destructive": ["overdue", "failed"].includes(status),
        "bg-muted-foreground": ["inactive", "unpaid", "draft", "waived"].includes(status),
      })} />
      {status}
    </span>
  );
}
