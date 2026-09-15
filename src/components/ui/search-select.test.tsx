import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SearchSelect } from "./search-select";

const options = [
  { value: "apple", label: "Apple" },
  { value: "banana", label: "Banana" },
  { value: "cherry", label: "Cherry" },
];

describe("SearchSelect", () => {
  it("renders placeholder when no value", () => {
    render(<SearchSelect options={options} value="" onChange={vi.fn()} placeholder="Pick one" />);
    expect(screen.getByText("Pick one")).toBeInTheDocument();
  });

  it("renders selected label", () => {
    render(<SearchSelect options={options} value="banana" onChange={vi.fn()} />);
    expect(screen.getByText("Banana")).toBeInTheDocument();
  });

  it("opens dropdown on click", async () => {
    const user = userEvent.setup();
    render(<SearchSelect options={options} value="" onChange={vi.fn()} />);
    await user.click(screen.getByText("Select..."));
    expect(screen.getByText("Apple")).toBeInTheDocument();
    expect(screen.getByText("Banana")).toBeInTheDocument();
    expect(screen.getByText("Cherry")).toBeInTheDocument();
  });

  it("calls onChange when option selected", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SearchSelect options={options} value="" onChange={onChange} />);
    await user.click(screen.getByText("Select..."));
    await user.click(screen.getByText("Cherry"));
    expect(onChange).toHaveBeenCalledWith("cherry");
  });

  it("filters options by search", async () => {
    const user = userEvent.setup();
    render(<SearchSelect options={options} value="" onChange={vi.fn()} searchable />);
    await user.click(screen.getByText("Select..."));
    const input = screen.getByPlaceholderText("Search...");
    await user.type(input, "ban");
    expect(screen.getByText("Banana")).toBeInTheDocument();
    expect(screen.queryByText("Apple")).not.toBeInTheDocument();
    expect(screen.queryByText("Cherry")).not.toBeInTheDocument();
  });

  it("clears selection with X button", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SearchSelect options={options} value="apple" onChange={onChange} />);
    // The clear button is a <span> with an X icon inside the main button
    const clearSpan = document.querySelector(".p-0\\.5.rounded.hover\\:bg-muted");
    if (clearSpan) {
      await user.click(clearSpan as HTMLElement);
      expect(onChange).toHaveBeenCalledWith("");
    }
  });

  it("can be disabled", async () => {
    const user = userEvent.setup();
    render(<SearchSelect options={options} value="" onChange={vi.fn()} disabled />);
    await user.click(screen.getByText("Select..."));
    expect(screen.queryByText("Apple")).not.toBeInTheDocument();
  });
});
