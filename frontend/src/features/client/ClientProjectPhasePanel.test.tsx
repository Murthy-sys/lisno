import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ClientProjectPhasePanel } from "./ClientProjectPhasePanel";

describe("ClientProjectPhasePanel", () => {
  it("preserves an entered review and keyboard access across collapse and refresh", async () => {
    const user = userEvent.setup();
    const content = <label>Review note<input /></label>;
    const view = render(<ClientProjectPhasePanel title="Design flow" enabled initiallyOpen>{content}</ClientProjectPhasePanel>);
    const note = screen.getByRole("textbox", { name: "Review note" });
    await user.type(note, "Keep the existing door");
    const toggle = screen.getByRole("button", { name: "Design flow" });
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(note).not.toBeVisible();
    view.rerender(<ClientProjectPhasePanel title="Design flow" enabled initiallyOpen>{content}</ClientProjectPhasePanel>);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.keyboard("{Enter}");
    expect(note).toBeVisible();
    expect(note).toHaveValue("Keep the existing door");
  });

  it("keeps estimation visible before approval and applies the approved default without remounting", () => {
    const content = <label>Estimate note<input defaultValue="Unsaved quotation" /></label>;
    const view = render(<ClientProjectPhasePanel title="Estimation" enabled={false}>{content}</ClientProjectPhasePanel>);
    const note = screen.getByRole("textbox", { name: "Estimate note" });
    expect(screen.queryByRole("button", { name: "Estimation" })).not.toBeInTheDocument();
    view.rerender(<ClientProjectPhasePanel title="Estimation" enabled>{content}</ClientProjectPhasePanel>);
    expect(screen.getByRole("button", { name: "Estimation" })).toHaveAttribute("aria-expanded", "false");
    expect(note).toBeInTheDocument();
    expect(note).not.toBeVisible();
  });
});
