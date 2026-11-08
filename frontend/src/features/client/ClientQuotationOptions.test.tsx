import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ClientQuotationOptions } from "./ClientQuotationOptions";

describe("Client quotation options", () => {
  it("keeps secondary actions collapsed, keyboard reachable and returns focus on Escape", async () => {
    const user = userEvent.setup();
    const { container } = render(<ClientQuotationOptions context="items"><button>Configure estimate</button></ClientQuotationOptions>);
    const trigger = screen.getByText("Estimate options", { selector: "summary" });
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    expect(container.querySelector("details")).toHaveAttribute("open");
    await user.tab();
    expect(screen.getByRole("button", { name: "Configure estimate" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(trigger).toHaveFocus();
  });

  it("closes an open disclosure on a view change without leaving focus on a hidden action", async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<ClientQuotationOptions context="items"><button>Configure estimate</button></ClientQuotationOptions>);
    await user.click(screen.getByText("Estimate options", { selector: "summary" }));
    await user.tab();
    rerender(<ClientQuotationOptions context="summary"><button>Configure estimate</button></ClientQuotationOptions>);
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Estimate options", { selector: "summary" })).toHaveFocus();
  });
});
