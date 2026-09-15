import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cn,
  formatDate,
  formatDateTime,
  formatRelative,
  formatKES,
  formatCompact,
  getStatusColor,
  getStatusBg,
  getMethodName,
  getFirstName,
  getInitials,
} from "./utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("handles conditional classes", () => {
    const result = cn("base", true && "active", false && "hidden");
    expect(result).toContain("base");
    expect(result).toContain("active");
    expect(result).not.toContain("hidden");
  });

  it("handles undefined and empty", () => {
    expect(cn("base", undefined, null, "")).toBe("base");
  });
});

describe("formatKES", () => {
  it("formats zero", () => {
    expect(formatKES(0)).toContain("0");
  });

  it("formats whole numbers", () => {
    expect(formatKES(1000)).toContain("1,000");
    expect(formatKES(50000)).toContain("50,000");
  });

  it("formats large numbers", () => {
    expect(formatKES(1000000)).toContain("1,000,000");
  });

  it("rounds to whole KES", () => {
    expect(formatKES(1500.50)).toContain("1,501");
  });

  it("formats negative numbers", () => {
    expect(formatKES(-5000)).toContain("5,000");
  });
});

describe("formatCompact", () => {
  it("returns exact number under 1000", () => {
    expect(formatCompact(999)).toBe("999");
    expect(formatCompact(0)).toBe("0");
  });

  it("formats thousands with K suffix", () => {
    expect(formatCompact(1000)).toBe("1.0K");
    expect(formatCompact(15000)).toBe("15.0K");
    expect(formatCompact(999999)).toBe("1000.0K");
  });

  it("formats millions with M suffix", () => {
    expect(formatCompact(1000000)).toBe("1.0M");
    expect(formatCompact(2500000)).toBe("2.5M");
  });
});

describe("formatDate", () => {
  it("formats a date string", () => {
    const result = formatDate("2026-01-15");
    expect(result).toContain("15");
    expect(result).toContain("2026");
  });

  it("formats a Date object", () => {
    const result = formatDate(new Date("2026-06-01"));
    expect(result).toContain("01");
    expect(result).toContain("Jun");
    expect(result).toContain("2026");
  });
});

describe("formatDateTime", () => {
  it("includes date and time", () => {
    const result = formatDateTime("2026-03-15T14:30:00");
    expect(result).toContain("15");
    expect(result).toContain("2026");
    expect(result).toContain("14:30");
  });
});

describe("formatRelative", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for less than 1 minute", () => {
    vi.setSystemTime(new Date("2026-09-13T12:00:30"));
    expect(formatRelative("2026-09-13T12:00:00")).toBe("just now");
  });

  it("returns minutes ago", () => {
    vi.setSystemTime(new Date("2026-09-13T12:05:00"));
    expect(formatRelative("2026-09-13T12:00:00")).toBe("5m ago");
  });

  it("returns hours ago", () => {
    vi.setSystemTime(new Date("2026-09-13T14:00:00"));
    expect(formatRelative("2026-09-13T12:00:00")).toBe("2h ago");
  });

  it("returns days ago", () => {
    vi.setSystemTime(new Date("2026-09-16T12:00:00"));
    expect(formatRelative("2026-09-13T12:00:00")).toBe("3d ago");
  });

  it("falls back to formatted date for 7+ days", () => {
    vi.setSystemTime(new Date("2026-09-21T12:00:00"));
    const result = formatRelative("2026-09-13T12:00:00");
    expect(result).toContain("13");
    expect(result).toContain("Sep");
  });
});

describe("getStatusColor", () => {
  it("returns success for active/paid/confirmed", () => {
    expect(getStatusColor("active")).toBe("text-success");
    expect(getStatusColor("paid")).toBe("text-success");
    expect(getStatusColor("confirmed")).toBe("text-success");
  });

  it("returns warning for partial/pending", () => {
    expect(getStatusColor("partial")).toBe("text-warning");
    expect(getStatusColor("pending")).toBe("text-warning");
  });

  it("returns destructive for overdue/failed", () => {
    expect(getStatusColor("overdue")).toBe("text-destructive");
    expect(getStatusColor("failed")).toBe("text-destructive");
  });

  it("returns muted for unknown", () => {
    expect(getStatusColor("unknown")).toBe("text-muted-foreground");
  });
});

describe("getStatusBg", () => {
  it("returns success bg", () => {
    const bg = getStatusBg("paid");
    expect(bg).toContain("bg-success/10");
    expect(bg).toContain("border-success/20");
  });

  it("returns warning bg", () => {
    const bg = getStatusBg("partial");
    expect(bg).toContain("bg-warning/10");
  });

  it("returns destructive bg", () => {
    const bg = getStatusBg("overdue");
    expect(bg).toContain("bg-destructive/10");
  });

  it("returns default bg for unknown", () => {
    expect(getStatusBg("foo")).toBe("bg-muted text-muted-foreground border-border");
  });
});

describe("getMethodName", () => {
  it("maps known methods", () => {
    expect(getMethodName("mpesa")).toBe("M-Pesa");
    expect(getMethodName("bank")).toBe("Bank Transfer");
    expect(getMethodName("cash")).toBe("Cash");
    expect(getMethodName("cheque")).toBe("Cheque");
  });

  it("returns raw string for unknown", () => {
    expect(getMethodName("bitcoin")).toBe("bitcoin");
  });
});

describe("getFirstName", () => {
  it("returns first word", () => {
    expect(getFirstName("John Doe")).toBe("John");
  });

  it("returns single name", () => {
    expect(getFirstName("Alice")).toBe("Alice");
  });

  it("handles empty string", () => {
    expect(getFirstName("")).toBe("");
  });

  it("handles undefined gracefully", () => {
    expect(getFirstName(undefined as unknown as string)).toBe("");
  });
});

describe("getInitials", () => {
  it("returns two initials", () => {
    expect(getInitials("John", "Doe")).toBe("JD");
  });

  it("handles single names", () => {
    expect(getInitials("Alice", "")).toBe("A");
  });

  it("returns ? for empty", () => {
    expect(getInitials("", "")).toBe("?");
  });

  it("lowercases become uppercase", () => {
    expect(getInitials("john", "doe")).toBe("JD");
  });
});
