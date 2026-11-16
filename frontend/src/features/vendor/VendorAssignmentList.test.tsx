import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import type { ExecutionWork } from "../execution/executionApi";
import { executionFixture } from "../execution/executionTestFixtures";
import { VendorAssignmentList } from "./VendorAssignmentList";

function show(items: ExecutionWork[]) {
  const onOpen = vi.fn();
  const rendered = render(<VendorAssignmentList items={items} onOpen={onOpen} />);
  return { onOpen, ...rendered };
}

describe("vendor assignment list", () => {
  it("keeps same-name assignments distinct with one detail action per assignment", async () => {
    const user = userEvent.setup();
    const second = { ...executionFixture, id: "work-two", projectId: "project-two", projectNumber: "Lisno000027", orderId: "order-two", orderNumber: "PO-205" };
    const { onOpen, container } = show([{ ...executionFixture, projectNumber: "Lisno000011" }, second]);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getAllByRole("columnheader").map(heading => heading.textContent)).toEqual(["Work", "Status", "Last update", "Due", "Assignment details"]);
    const button = screen.getByRole("button", { name: /Open Oak wall panelling, PO-205, Living room, Oak residence, Lisno000027/ });
    const row = button.closest("tr")!;
    expect(within(row).getByText("Project ID: Lisno000027")).toBeVisible();
    expect(within(row).getByText(/PO-205 · Revision 2/)).toBeVisible();
    await user.click(button);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("work-two");
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("shows the current report and omits repeated workflow instructions", () => {
    show([{ ...executionFixture, latestNote: "Project Manager changed the schedule",
      latestVendorReport: { ...executionFixture.latestVendorReport!, note: "Frame installation completed today" } }]);
    expect(screen.getByText("Frame installation completed today")).toBeVisible();
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
    expect(screen.queryByText("Project Manager changed the schedule")).not.toBeInTheDocument();
    expect(screen.queryByText(/Next step:|Workflow owner:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Workflow stages" })).not.toBeInTheDocument();
  });

  it("shows photo updates as In progress without a percentage", () => {
    show([{ ...executionFixture, progress: 0, latestVendorReport: { ...executionFixture.latestVendorReport!, updateType: "progress", progress: 0, note: "New site photos" } }]);
    expect(screen.getByText("In progress")).toBeVisible();
    expect(screen.getByText("New site photos")).toBeVisible();
    expect(screen.queryByText("Started working")).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
  });

  it("does not present prior-round reports, percentages or verification as current evidence", () => {
    show([{ ...executionFixture, status: "changes_requested", executionRound: 2, progress: 100,
      verification: { id: "old-verification", executionRound: 1, verifiedAt: "2026-10-08T08:00:00Z", verifiedById: "manager-one" } }]);
    expect(screen.getByText("Changes requested")).toBeVisible();
    expect(screen.getByText("No update this round")).toBeVisible();
    expect(screen.getByText("Fresh verification required")).toBeVisible();
    expect(screen.queryByText(/% reported|Site verified|Frame installed/)).not.toBeInTheDocument();
  });

  it("shows vendor completion with a separate pending verification cue", () => {
    show([{ ...executionFixture, status: "awaiting_verification", progress: 100, allowedActions: [] }]);
    expect(screen.getByText("Completed by vendor")).toBeVisible();
    expect(screen.getByText("Awaiting Project Manager verification")).toBeVisible();
    expect(screen.queryByText("Client accepted")).not.toBeInTheDocument();
  });

  it("keeps Client acceptance separate even when the returned owner remains vendor", () => {
    show([{ ...executionFixture, status: "awaiting_client", nextOwner: "vendor", allowedActions: [] }]);
    expect(screen.getByText("With Client")).toBeVisible();
    expect(screen.getByText("Awaiting Client acceptance")).toBeVisible();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("retains the vendor hold reason and reporting deadline", () => {
    show([{ ...executionFixture, status: "blocked", latestVendorReport: { ...executionFixture.latestVendorReport!, status: "blocked",
      reason: "The work area is locked", nextAction: "Project Manager to arrange access" } }]);
    expect(screen.getByText("On hold")).toBeVisible();
    expect(screen.getByText("Reason: The work area is locked")).toBeVisible();
    expect(screen.getByText("Next action: Project Manager to arrange access")).toBeVisible();
    expect(screen.getByText(/Update due .*Asia\/Kolkata/)).toBeVisible();
  });

  it("keeps proposed dates distinct from confirmed dates and preserves a staff hold", () => {
    show([{ ...executionFixture, hold: { reason: "Waiting for site clearance", startedAt: "2026-10-09T09:00:00Z", reviewDate: "2026-10-12" },
      allowedActions: [], proposedSchedule: { startDate: "2026-10-10", finishDate: "2026-10-25", reason: "Requested site access change" },
      daily: { ...executionFixture.daily, state: "exempt", dueAt: null } }]);
    expect(screen.getByText("On hold")).toBeVisible();
    expect(screen.getByText("Reason: Waiting for site clearance")).toBeVisible();
    expect(screen.getByText("18 Oct 2026")).toBeVisible();
    expect(screen.getByText("Proposed finish: 25 Oct 2026 · Awaiting confirmation")).toBeVisible();
    expect(screen.getByText("Hold review: 12 Oct 2026")).toBeVisible();
    expect(screen.getByText("No update due")).toBeVisible();
  });

  it("keeps source-unavailable assignments inspectable without advertising an update", () => {
    show([{ ...executionFixture, sourceAvailable: false, allowedActions: [] }]);
    expect(screen.getByText("Configuration link unavailable")).toBeVisible();
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /^Open / })).toBeVisible();
  });
});
