import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "../../components/ui/Dialog";
import { NextActionDateTime } from "./NextActionDateTime";

function Example({ initial = "2026-01-31", onClose = vi.fn() }: { initial?: string; onClose?: () => void }) {
  const [value, setValue] = useState(initial);
  return <Dialog title="Initiate project" onClose={onClose}>
    <label htmlFor="next-date">Next action date</label>
    <NextActionDateTime id="next-date" value={value} onChange={setValue} required />
    <button type="button">Outside calendar</button>
    <output aria-label="Value">{value}</output>
  </Dialog>;
}

describe("NextActionDateTime", () => {
  it("selects a date without a time field, closes, and restores trigger focus", async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "Next action date" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "15 January 2026" }));
    expect(screen.queryByRole("dialog", { name: "Choose next action date" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveTextContent("15 January 2026");
    expect(screen.getByLabelText("Value")).toHaveTextContent("2026-01-15");
    expect(screen.queryByLabelText("Next action time")).not.toBeInTheDocument();
  });

  it("handles keyboard month boundaries and Escape without dismissing its parent", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Example onClose={onClose} />);
    const trigger = screen.getByRole("button", { name: "Next action date" });
    await user.click(trigger);
    await waitFor(() => expect(screen.getByRole("button", { name: "31 January 2026" })).toHaveFocus());
    await user.keyboard("{PageDown}");
    expect(screen.getByRole("button", { name: "28 February 2026" })).toHaveFocus();
    await user.keyboard("{ArrowRight}{Enter}");
    expect(screen.getByLabelText("Value")).toHaveTextContent("2026-03-01");
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole("dialog", { name: "Choose next action date" })).not.toBeInTheDocument();
  });

  it("dismisses outside, on trigger toggle and focus exit, and reopens during closing", async () => {
    const user = userEvent.setup();
    render(<Example />);
    const trigger = screen.getByRole("button", { name: "Next action date" });
    await user.click(trigger);
    await user.click(screen.getByRole("button", { name: "Outside calendar" }));
    expect(screen.getByRole("button", { name: "Outside calendar" })).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Choose next action date" })).toBeVisible();
    screen.getByRole("button", { name: "Close calendar" }).focus();
    await user.tab();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("selects Today as a date only and closes immediately for reduced motion", async () => {
    const query = vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    const user = userEvent.setup();
    render(<Example initial="" />);
    await user.click(screen.getByRole("button", { name: "Next action date" }));
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(screen.getByLabelText("Value").textContent).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(screen.queryByLabelText("Next action time")).not.toBeInTheDocument();
    expect(document.querySelector(".next-action-date-time__calendar")).toBeNull();
    query.mockRestore();
  });
});
