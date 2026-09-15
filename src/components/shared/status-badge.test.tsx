import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./status-badge";

describe("StatusBadge", () => {
  it("renders status text", () => {
    render(<StatusBadge status="active" />);
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("capitalizes the text", () => {
    render(<StatusBadge status="paid" />);
    expect(screen.getByText("paid")).toHaveClass("capitalize");
  });

  it("applies success bg for paid", () => {
    const { container } = render(<StatusBadge status="paid" />);
    const badge = container.querySelector("span");
    expect(badge?.className).toContain("bg-success/10");
  });

  it("applies warning bg for pending", () => {
    const { container } = render(<StatusBadge status="pending" />);
    const badge = container.querySelector("span");
    expect(badge?.className).toContain("bg-warning/10");
  });

  it("applies destructive bg for overdue", () => {
    const { container } = render(<StatusBadge status="overdue" />);
    const badge = container.querySelector("span");
    expect(badge?.className).toContain("bg-destructive/10");
  });

  it("applies default bg for unknown status", () => {
    const { container } = render(<StatusBadge status="custom" />);
    const badge = container.querySelector("span");
    expect(badge?.className).toContain("bg-muted");
  });

  it("renders with different sizes", () => {
    const { rerender } = render(<StatusBadge status="active" size="sm" />);
    let badge = screen.getByText("active");
    expect(badge.className).toContain("text-[10px]");

    rerender(<StatusBadge status="active" size="lg" />);
    badge = screen.getByText("active");
    expect(badge.className).toContain("text-xs");
  });
});
