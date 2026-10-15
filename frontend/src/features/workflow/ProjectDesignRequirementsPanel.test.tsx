import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { ProjectDesignRequirementsPanel } from "./ProjectDesignRequirementsPanel";
import * as api from "./projectDesignRequirementsApi";
import type { ProjectDesignRequirements, ProjectDesignRequirement } from "./projectDesignRequirementsApi";
vi.mock("./projectDesignRequirementsApi", async (actual) => ({ ...await actual<typeof api>(), getProjectDesignRequirements: vi.fn(), actOnProjectDesignRequirement: vi.fn() }));
vi.mock("./useRefreshDesignWorkflow", () => ({ useRefreshDesignWorkflow: () => vi.fn().mockResolvedValue(undefined) }));
const row: ProjectDesignRequirement = { id: "entry-a", lineItemId: "estimate-line-a", mainLineId: "line-a", lineName: "Custom joinery", ruleKey: "designerPoApproval", label: "Designer PO approval", category: "po_approval", status: "pending", note: null, details: "Verify production readiness", checklist: [{ id: "point-a", text: "Verify selected finish" }], checkedPointIds: [], completedAt: null, completedById: null, deferredReason: null, dueAt: null, availableActions: ["approve"] };
const detail: ProjectDesignRequirements = { version: 3, sourceToken: "current-source", entries: [row], blockers: [], canReadInternal: true };
function setup(data = detail) {
  vi.mocked(api.getProjectDesignRequirements).mockResolvedValue(data);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ProjectDesignRequirementsPanel projectId="project-a" identity="designer-a:designer" /></QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(api.actOnProjectDesignRequirement).mockResolvedValue(detail); });
describe("project Design requirements", () => {
  it("requires notes and every current PO point; sends version and source token", async () => {
    const user = userEvent.setup(); const view = setup(); await screen.findByRole("button", { name: "Approve" });
    await user.click(screen.getByRole("button", { name: "Approve" })); expect(screen.getByRole("alert")).toHaveTextContent("Add an evidence");
    await user.type(screen.getByLabelText(/Evidence or decision note/), "Reviewed finish"); await user.click(screen.getByRole("button", { name: "Approve" })); expect(screen.getByRole("alert")).toHaveTextContent("Confirm every");
    await user.click(screen.getByLabelText("Verify selected finish")); await user.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(api.actOnProjectDesignRequirement).toHaveBeenCalledWith("project-a", { expectedVersion: 3, sourceToken: "current-source", entryId: "entry-a", action: "approve", note: "Reviewed finish", checkedPointIds: ["point-a"], idempotencyKey: expect.any(String) }));
    expect((await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
  it("reopens approved PO without resending approval points", async () => {
    const user = userEvent.setup(); setup({ ...detail, entries: [{ ...row, status: "approved", checkedPointIds: ["point-a"], availableActions: ["reopen"] }] });
    await screen.findByRole("button", { name: "Reopen" }); await user.type(screen.getByLabelText(/Evidence or decision note/), "Finish changed"); await user.click(screen.getByRole("button", { name: "Reopen" }));
    await waitFor(() => expect(api.actOnProjectDesignRequirement).toHaveBeenCalledWith("project-a", expect.objectContaining({ action: "reopen", checkedPointIds: [] })));
  });
  it("retries an unknown action with the identical command", async () => {
    const user = userEvent.setup(); vi.mocked(api.actOnProjectDesignRequirement).mockRejectedValueOnce(new Error("lost")).mockResolvedValueOnce(detail); setup({ ...detail, entries: [{ ...row, checklist: [], availableActions: ["complete"] }] });
    await screen.findByRole("button", { name: "Mark complete" }); await user.type(screen.getByLabelText(/Evidence or decision note/), "Verified"); await user.click(screen.getByRole("button", { name: "Mark complete" }));
    await user.click(await screen.findByRole("button", { name: "Retry saved action" })); await waitFor(() => expect(api.actOnProjectDesignRequirement).toHaveBeenCalledTimes(2)); expect(vi.mocked(api.actOnProjectDesignRequirement).mock.calls[0]).toEqual(vi.mocked(api.actOnProjectDesignRequirement).mock.calls[1]);
  });
  it("shows only the client selection and no internal PO points", async () => {
    setup({ ...detail, canReadInternal: false, entries: [{ ...row, ruleKey: "clientFinishApproval", category: "selection", details: "Oak finish", checklist: [], availableActions: ["approve"] }] });
    expect(await screen.findByText("Oak finish")).toBeVisible(); expect(screen.queryByText("Verify selected finish")).not.toBeInTheDocument(); expect(screen.getByRole("heading", { name: "Selections requiring your approval" })).toBeVisible();
  });
  it("does not invent a deadline before payment or unauthorized action", async () => {
    setup({ ...detail, entries: [{ ...row, category: "stock", ruleKey: "stockCheck", checklist: [], availableActions: [] }] }); expect(await screen.findByText("Deadline starts when initial payment is confirmed.")).toBeVisible(); expect(screen.queryByRole("button", { name: "Mark complete" })).not.toBeInTheDocument();
  });
});
