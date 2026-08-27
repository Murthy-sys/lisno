import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusBadge } from "./StatusBadge";

describe("StatusBadge", () => {
  it.each([
    ["neutral", "Not started"],
    ["success", "On track"],
    ["warning", "Needs attention"],
    ["danger", "Blocked"],
    ["info", "Planned"],
  ] as const)("shows a humanized %s label with a decorative icon", (tone, label) => {
    render(<StatusBadge tone={tone} label={label} />);

    const badge = screen.getByText(label).closest("span");
    expect(badge).toHaveClass("ui-status", `ui-status--${tone}`);
    expect(badge?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(badge).not.toHaveAttribute("role", "status");
  });

  it("exposes an optional reason to assistive technology", () => {
    render(<StatusBadge tone="danger" label="Blocked" reason="Awaiting client approval" />);

    expect(screen.getByText(/Awaiting client approval/)).toHaveClass("sr-only");
  });

  it("uses caller-supplied copy without transforming backend-style values", () => {
    render(<StatusBadge label="needs_review" />);

    expect(screen.getByText("needs_review")).toBeVisible();
  });

  it("leaves status presentation to the shared ui-status rules", () => {
    render(<StatusBadge tone="success" label="On track" />);

    const badge = screen.getByText("On track").closest("span");
    expect(badge).not.toHaveClass("status-badge", "status-badge--success");
  });
});
