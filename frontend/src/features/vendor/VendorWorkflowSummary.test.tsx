import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { executionFixture } from "../execution/executionTestFixtures";
import { VendorWorkflowSummary } from "./VendorWorkflowSummary";

describe("vendor work summary", () => {
  it("shows one status and current report, with workflow activity collapsed", async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    const { container } = render(<VendorWorkflowSummary work={{ ...executionFixture, latestNote: "Project Manager confirmed access" }} disabled={false} onAction={onAction} />);
    expect(screen.getByRole("heading", { name: "In progress" })).toBeVisible();
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Workflow stages" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Latest vendor report" })).getByText("Frame installed")).toBeVisible();
    expect(screen.getByText("Project Manager confirmed access")).not.toBeVisible();
    await user.click(screen.getByText("Latest workflow activity"));
    expect(within(screen.getByRole("region", { name: "Latest workflow activity" })).getByText("Project Manager confirmed access")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Go to next action" }));
    expect(onAction).toHaveBeenCalledOnce();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("shows repeated photo updates as In progress at the existing internal progress", () => {
    render(<VendorWorkflowSummary work={{ ...executionFixture, progress: 0, latestVendorReport: { ...executionFixture.latestVendorReport!, updateType: "progress", progress: 0, note: "New site photos" } }} disabled={false} onAction={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "In progress" })).toBeVisible();
    expect(screen.getByText("New site photos")).toBeVisible();
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
  });

  it("does not reuse a prior-round update during rework", () => {
    render(<VendorWorkflowSummary work={{ ...executionFixture, executionRound: 2, status: "changes_requested", latestNote: "Review the finish" }} disabled={false} onAction={vi.fn()} />);
    const report = screen.getByRole("region", { name: "Latest vendor report" });
    expect(within(report).getByText("No vendor report is available for this execution round.")).toBeVisible();
    expect(within(report).queryByText("Frame installed")).not.toBeInTheDocument();
  });

  it("keeps completed work pending Project Manager verification", () => {
    render(<VendorWorkflowSummary work={{ ...executionFixture, status: "awaiting_verification", progress: 100, allowedActions: [] }} disabled={false} onAction={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Completed by vendor" })).toBeVisible();
    expect(screen.getByText("Awaiting Project Manager verification")).toBeVisible();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("disables the action shortcut while current details are unavailable", () => {
    render(<VendorWorkflowSummary work={executionFixture} disabled onAction={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Go to next action" })).toBeDisabled();
  });
});
