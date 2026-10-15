import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { LeadEstimateWorkspace } from "./LeadEstimateWorkspace";
import { leadKeys, type EstimateDraft } from "./leadsApi";
import type { EstimateRequirementsDetail } from "../client/estimateRequirementsApi";

vi.mock("../messages", () => ({ ProjectChatNavigation: () => null }));
const estimate: EstimateDraft = {
  id: "estimate-one", projectId: "project-one", version: 7, propertyType: "2BHK", rooms: [{ id: "living", typeId: "living", label: "Living Room", sqft: 100, length: 10, width: 10, icon: "" }], scopes: ["FC"],
  lineItems: [{ id: "line-one", source: "legacy", catalogueId: "FC01", roomName: "Living Room", specification: "Gypsum plain", unit: "sqft", rate: 95, quantity: 200, included: true }],
  subtotal: 19000, gst: 3420, total: 22420, status: "draft", approvalRequired: false, designPlanStatus: "approved",
  estimation: { workflowVersion: 2, phase: "post", status: "draft", requirementsVersion: 3, editClosedAt: null, preApproval: { reviewRoundId: "pre-round", estimateVersion: 2, approvedAt: "2026-10-13T10:00:00Z" }, finalApproval: null, designScopeRevision: 2, approvedDesignScopeRevision: 2, pendingReviewRoundId: null, preparationSnapshotId: null }
};
const requirements: EstimateRequirementsDetail = { projectId: "project-one", requirementsVersion: 3, estimateVersion: 7, phase: "post", editingAllowed: true, editingBlockReason: null, canResolve: true,
  requirements: [], mainBaskets: [], rooms: [], indicativeTotalPaise: 2242000, pricingComplete: true };

function setup(value: EstimateDraft = structuredClone(estimate), requests = structuredClone(requirements)) {
  const state = { estimate: value, requests }; let queryClient!: QueryClient;
  function Capture() { queryClient = useQueryClient(); return null; }
  const saves: unknown[] = []; const submits: unknown[] = [];
  server.use(
    http.get("/api/v1/leads/lead-one", () => HttpResponse.json({ data: { id: "lead-one", projectId: "project-one", clientName: "Sample client", projectName: "Sample project", location: "Sample city", propertyType: "2BHK", estimationWorkflowVersion: 2 } })),
    http.get("/api/v1/leads/lead-one/estimate", () => HttpResponse.json({ data: state.estimate })),
    http.get("/api/v1/projects/project-one/estimate-requirements", () => HttpResponse.json({ data: state.requests })),
    http.put("/api/v1/leads/lead-one/estimate", async ({ request }) => { const body = await request.json() as Record<string, unknown>; saves.push(body); state.estimate = { ...state.estimate, ...body, version: state.estimate.version! + 1 } as EstimateDraft; return HttpResponse.json({ data: state.estimate }); }),
    http.post("/api/v1/leads/lead-one/estimate/submit", async ({ request }) => { submits.push(await request.json()); state.estimate = { ...state.estimate, status: "sent_to_client", estimation: { ...state.estimate.estimation!, status: "sent_to_client", pendingReviewRoundId: "post-round" } }; return HttpResponse.json({ data: state.estimate }); })
  );
  renderWithQuery(<MemoryRouter initialEntries={["/estimator-sales/leads/lead-one/estimate"]}><Capture /><Routes><Route path="/estimator-sales/leads/:leadId/estimate" element={<LeadEstimateWorkspace returnTo="/designer/design-plans" />} /></Routes></MemoryRouter>);
  return { state, saves, submits, getClient: () => queryClient };
}

describe("Collaborative estimate workspace", () => {
  it("submits the just-saved version and retains the assigned designer workspace", async () => {
    const { saves, submits } = setup(); const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    await user.clear(quantity); await user.type(quantity, "120");
    await user.click(screen.getByRole("button", { name: "Submit final estimate" }));
    await waitFor(() => expect(submits).toEqual([{ expectedVersion: 8 }]));
    expect(saves[0]).toMatchObject({ expectedVersion: 7, lineItems: [expect.objectContaining({ quantity: 120 })] });
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to Sample client" }));
    expect(screen.getByRole("link", { name: "Back to design plans" })).toHaveAttribute("href", "/designer/design-plans");
  });

  it("preserves unsaved values and blocks rebasing silently after a background version update", async () => {
    const { state, getClient, saves } = setup(); const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i });
    await user.clear(quantity); await user.type(quantity, "123");
    state.estimate = { ...state.estimate, version: 8, lineItems: state.estimate.lineItems.map((line) => ({ ...line, quantity: 300 })) };
    await act(async () => { await getClient().refetchQueries({ queryKey: leadKeys.estimate("lead-one") }); });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled());
    expect(quantity).toHaveValue(123); expect(saves).toEqual([]);
    expect(screen.getByText(/Your local edits are preserved/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reload saved estimate (discard edits)" }));
    await waitFor(() => expect(quantity).toHaveValue(300)); expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
  });

  it("keeps final-closed estimates readonly despite an editable physical status", async () => {
    setup({ ...estimate, estimation: { ...estimate.estimation!, editClosedAt: "2026-10-13T12:00:00Z" } });
    expect(await screen.findByRole("spinbutton", { name: /false ceiling.*quantity/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit final estimate" })).not.toBeInTheDocument();
  });

  it("blocks final publication when design has not approved the current scope", async () => {
    setup({ ...estimate, estimation: { ...estimate.estimation!, approvedDesignScopeRevision: 1 } });
    expect(await screen.findByRole("button", { name: "Submit final estimate" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled();
  });
});
