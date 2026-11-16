import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ExecutionWork } from "../execution/executionApi";
import { executionFixture } from "../execution/executionTestFixtures";
import { VendorAssignmentList } from "./VendorAssignmentList";

function show(items: ExecutionWork[]) {
  const onOpen = vi.fn();
  render(<VendorAssignmentList items={items} onOpen={onOpen} />);
  return onOpen;
}

describe("vendor assignment list", () => {
  it("keeps same-name assignments distinct with one detail action per assignment", async () => {
    const user = userEvent.setup();
    const second = { ...executionFixture, id: "work-two", projectId: "project-two", projectNumber: "Lisno000027", orderId: "order-two", orderNumber: "PO-205" };
    const onOpen = show([{ ...executionFixture, projectNumber: "Lisno000011" }, second]);
    expect(screen.getAllByRole("button")).toHaveLength(2);
    expect(screen.getByRole("table", { name: "Vendor assignments" })).toBeVisible();
    const secondButton = screen.getByRole("button", { name: /Open Oak wall panelling, PO-205, Living room, Oak residence, Lisno000027/ });
    const secondRow = secondButton.closest("tr")!;
    expect(within(secondRow).getByText("Project ID: Lisno000027")).toBeVisible();
    expect(within(secondRow).getByText(/PO-205 · Revision 2/)).toBeVisible();
    await user.click(secondButton);
    expect(onOpen).toHaveBeenCalledExactlyOnceWith("work-two");
  });

  it("shows the current vendor report without relabeling a newer workflow note", () => {
    show([{ ...executionFixture, latestNote: "Project Manager changed the schedule", latestVendorReport: { ...executionFixture.latestVendorReport!, note: "Frame installation completed today" } }]);
    expect(screen.getByText("Frame installation completed today")).toBeVisible();
    expect(screen.getByText(/Latest report:/)).toBeVisible();
    expect(screen.queryByText("Project Manager changed the schedule")).not.toBeInTheDocument();
    expect(screen.getByText("Next step: Daily update")).toBeVisible();
    expect(screen.getByText("40% vendor reported")).toBeVisible();
  });

  it("does not present previous-round reports or verification as current rework evidence", () => {
    show([{ ...executionFixture, status: "changes_requested", executionRound: 2, progress: 100,
      verification: { id: "verification-old", executionRound: 1, verifiedAt: "2026-10-08T08:00:00Z", verifiedById: "manager-one" } }]);
    expect(screen.getByText("Changes requested")).toBeVisible();
    expect(screen.getByText("100% vendor reported")).toBeVisible();
    expect(screen.getByText("No current-round report")).toBeVisible();
    expect(screen.queryByText(/Site verified/)).not.toBeInTheDocument();
    expect(screen.queryByText("Frame installed")).not.toBeInTheDocument();
    expect(screen.getByText(/Completion requires fresh Project Manager verification/)).toBeVisible();
  });

  it("explains pending Client review even when the server owner remains vendor", () => {
    show([{ ...executionFixture, status: "awaiting_client", nextOwner: "vendor", allowedActions: [], canSubmitToClient: false }]);
    expect(screen.getByText("With Client")).toBeVisible();
    expect(screen.getByText(/waiting for the Client's decision/)).toBeVisible();
    expect(screen.getByText("Workflow owner: Vendor")).toBeVisible();
    expect(screen.queryByText(/Next step:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send to Client" })).not.toBeInTheDocument();
  });

  it("shows the vendor submission step separately from the Client handoff owner", () => {
    show([{ ...executionFixture, status: "site_verified", nextOwner: "client", allowedActions: [], canSubmitToClient: true }]);
    expect(screen.getByText("Next step: Send to Client")).toBeVisible();
    expect(screen.getByText("Workflow owner: Client")).toBeVisible();
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("retains a blocker's reason and next action without exempting the daily obligation", () => {
    show([{ ...executionFixture, status: "blocked", latestVendorReport: { ...executionFixture.latestVendorReport!, status: "blocked", reason: "The work area is locked", nextAction: "Project Manager to arrange access" } }]);
    expect(screen.getByText("Reason: The work area is locked")).toBeVisible();
    expect(screen.getByText("Next action: Project Manager to arrange access")).toBeVisible();
    expect(screen.getByText("Due")).toBeVisible();
    expect(screen.getByText(/Due .*Asia\/Kolkata/)).toBeVisible();
  });

  it("keeps proposed dates distinct from confirmed commitments and preserves hold context", () => {
    show([{ ...executionFixture, hold: { reason: "Waiting for site clearance", startedAt: "2026-10-09T09:00:00Z", reviewDate: "2026-10-12" },
      allowedActions: [], nextOwner: "site_manager", proposedSchedule: { startDate: "2026-10-10", finishDate: "2026-10-25", reason: "Requested site access change" },
      daily: { ...executionFixture.daily, state: "exempt", dueAt: null } }]);
    expect(screen.getByText("On hold")).toBeVisible();
    expect(screen.getByText(/Waiting for site clearance/)).toBeVisible();
    expect(screen.getByText("18 Oct 2026")).toBeVisible();
    expect(screen.getByText("Proposed finish: 25 Oct 2026 · Awaiting confirmation")).toBeVisible();
    expect(screen.getByText("Hold review: 12 Oct 2026")).toBeVisible();
    expect(screen.getByText("No daily report due")).toBeVisible();
    expect(screen.queryByText(/Next step:/)).not.toBeInTheDocument();
  });
});
