import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EmptyState } from "./empty-state";

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(
      <EmptyState
        icon={vi.fn(() => <div data-testid="icon" />)}
        title="No data"
        description="Add something to get started."
      />
    );
    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.getByText("Add something to get started.")).toBeInTheDocument();
  });

  it("renders action button when provided", () => {
    const onClick = vi.fn();
    render(
      <EmptyState
        icon={vi.fn(() => <div />)}
        title="Empty"
        description="Nothing here"
        action={{ label: "Add Item", onClick, icon: vi.fn(() => <div />) }}
      />
    );
    expect(screen.getByText("Add Item")).toBeInTheDocument();
  });

  it("calls action onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <EmptyState
        icon={vi.fn(() => <div />)}
        title="Empty"
        description="Nothing here"
        action={{ label: "Click Me", onClick, icon: vi.fn(() => <div />) }}
      />
    );
    await user.click(screen.getByText("Click Me"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not render action when not provided", () => {
    render(
      <EmptyState
        icon={vi.fn(() => <div />)}
        title="Empty"
        description="Nothing here"
      />
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
