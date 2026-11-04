import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import type { QuotationDetail } from "../client/quotationApi";
import { withPublishedReview, withQuotationApproval } from "./clientEstimateReviewTestUtils";
import type { EstimateQueueItem } from "./estimateWorkflowApi";
import { ProjectQuotationWorkspace } from "./ProjectQuotationWorkspace";

const actor = { user: { id: "client-one", role: "client" as "client" | "designer" }, reviewSession: { id: "session-one" } };
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => actor }));

beforeEach(() => {
  actor.user = { id: "client-one", role: "client" };
  actor.reviewSession = { id: "session-one" };
});

function quotation(projectId: string, name: string, quantity: number): QuotationDetail {
  const source = { revisionId: `revision-${projectId}`, itemVersion: 2, revisionVersion: 3, uomId: "unit" };
  return {
    projectId, projectNumber: projectId === "project-one" ? "Lisno000031" : "Lisno000084", estimateId: `estimate-${projectId}`, estimateVersion: 3, workflowVersion: 3, pricedRevision: 2,
    phase: "pre", status: "sent_to_client", reviewState: "ready_for_approval", editingAllowed: true,
    editingBlockReason: null, totalPaise: quantity * 40000, isIncomplete: false,
    rooms: [{ id: `room-${projectId}`, name }],
    baskets: [{ id: "furniture", name: "Furniture", subBaskets: [{ id: "storage", name: "Storage units" }] }],
    lines: [{ id: `line-${projectId}`, mainLineId: "storage", mainLineName: "Storage", roomId: `room-${projectId}`, roomName: name,
      mainBasketId: "furniture", mainBasketName: "Furniture", subBasketId: "storage", subBasketName: "Storage units",
      included: true, source, quantity, uomName: "Unit", pricingMode: "sub_vendor", modeTier: "signature", ratePaise: 40000,
      amountPaise: quantity * 40000, choices: [{ modeTier: "signature", available: true, unavailableReason: null, ratePaise: 40000, amountPaise: quantity * 40000, source }] }]
  };
}

function publishedEstimate(detail: QuotationDetail): EstimateQueueItem {
  const estimate = withPublishedReview({
    id: detail.estimateId!, projectId: detail.projectId, propertyType: "Villa", rooms: [], scopes: ["FC"],
    status: "sent_to_client" as const, approvalRequired: true, workflowVersion: 3 as const,
    lineItems: [{ catalogueId: "storage", roomName: detail.rooms[0]!.name, specification: "Storage", unit: "unit", quantity: detail.lines[0]!.quantity,
      rate: 400, amount: detail.totalPaise! / 100, included: true }], subtotal: detail.totalPaise! / 100, gst: 0, total: detail.totalPaise! / 100,
    lead: { _id: `lead-${detail.projectId}`, clientName: "Client", clientEmail: "client@example.test", projectName: `Home ${detail.projectId}`, location: "Bengaluru" }
  });
  estimate.publishedReview.workflowVersion = 3;
  estimate.publishedReview.phase = "pre";
  return withQuotationApproval(estimate, detail);
}

function setup() {
  const details = [quotation("project-one", "Kitchen", 2), quotation("project-two", "Bedroom", 7)];
  const writes: string[] = [];
  server.use(
    http.get("/api/v1/projects/:projectId/quotation", ({ params }) => HttpResponse.json({ data: details.find(detail => detail.projectId === params.projectId) })),
    http.get("/api/v1/projects/:projectId/quotation/revision", ({ params }) => {
      const detail = details.find(value => value.projectId === params.projectId)!;
      return HttpResponse.json({ data: { estimateId: detail.estimateId, estimateVersion: detail.estimateVersion, pricedRevision: detail.pricedRevision, status: detail.status, phase: detail.phase } });
    }),
    http.get("/api/v1/client/estimates", () => HttpResponse.json({ data: details.map(publishedEstimate) })),
    http.patch("/api/v1/projects/:projectId/quotation", ({ request }) => { writes.push(request.url); return HttpResponse.json({ error: { message: "Unexpected save" } }, { status: 500 }); }),
    http.post("/api/v1/estimates/:estimateId/decision", ({ request }) => { writes.push(request.url); return HttpResponse.json({ error: { message: "Unexpected decision" } }, { status: 500 }); })
  );
  function Harness() {
    const [, refreshSession] = useState(0);
    return <MemoryRouter initialEntries={["/projects/project-one/quotation"]}>
      <Link to="/projects/project-two/quotation">Open second project</Link>
      <button onClick={() => { actor.reviewSession = { id: "session-two" }; refreshSession(value => value + 1); }}>Switch session</button>
      <Routes><Route path="/projects/:projectId/quotation" element={<ProjectQuotationWorkspace />} /></Routes>
    </MemoryRouter>;
  }
  return { ...renderWithQuery(<Harness />), writes };
}

describe("ProjectQuotationWorkspace", () => {
  it("shows saved Client items and prevents approval until unsaved changes are discarded", async () => {
    const { container, writes } = setup();
    const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" });
    expect(quantity).toHaveValue(2);
    expect(screen.getByText("Project ID: Lisno000031")).toBeVisible();
    expect(await screen.findByRole("button", { name: "Review for pre-design approval" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Back to project" })).toHaveAttribute("href", "/client/projects/project-one");
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.clear(quantity); await user.type(quantity, "5");
    window.dispatchEvent(new Event("resize"));
    expect(screen.getByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" })).toBe(quantity);
    expect(quantity).toHaveValue(5);
    expect(quantity).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Approve pre-design quotation" })).not.toBeInTheDocument();
    expect(screen.getByText(/Save or discard your quotation changes/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(quantity).toHaveValue(2);
    expect(screen.getByRole("button", { name: "Review for pre-design approval" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Review for pre-design approval" }));
    expect(await screen.findByRole("heading", { name: "Pre-design quotation review" })).toBeVisible();
    expect(screen.getAllByText("Project ID: Lisno000031")).toHaveLength(1);
    expect(writes).toEqual([]);
  });

  it("does not carry a dirty draft or approval block into a different project", async () => {
    const { writes } = setup(); const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" });
    await user.clear(quantity); await user.type(quantity, "5");
    expect(await screen.findByText(/Save or discard your quotation changes/)).toBeVisible();
    // MemoryRouter represents an externally changed project; navigation confirmation is covered separately.
    await user.click(screen.getByRole("link", { name: "Open second project" }));
    expect(await screen.findByRole("spinbutton", { name: "Quantity for Storage in Bedroom Unit" })).toHaveValue(7);
    expect(screen.getByText("Project ID: Lisno000084")).toBeVisible();
    expect(screen.queryByText("Project ID: Lisno000031")).not.toBeInTheDocument();
    expect(screen.queryByRole("spinbutton", { name: /Kitchen/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review for pre-design approval" })).toBeEnabled();
    expect(screen.getByRole("link", { name: "Back to project" })).toHaveAttribute("href", "/client/projects/project-two");
    expect(screen.queryByText("Home project-one")).not.toBeInTheDocument();
    expect(writes).toEqual([]);
  });

  it("clears the previous session's local edits and pending approval state", async () => {
    setup(); const user = userEvent.setup();
    const quantity = await screen.findByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" });
    await user.clear(quantity); await user.type(quantity, "5");
    expect(await screen.findByText(/Save or discard your quotation changes/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Switch session" }));
    await waitFor(() => expect(screen.getByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" })).toHaveValue(2));
    expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review for pre-design approval" })).toBeEnabled();
  });

  it("keeps the Designer presentation read-only even when the quotation response permits editing", async () => {
    actor.user = { id: "secondary-designer", role: "designer" };
    const { writes } = setup(); const user = userEvent.setup();
    expect(await screen.findByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Include Storage in Kitchen" })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Signature tier for Storage in Kitchen" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Add item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Project estimate" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to design plans" })).toHaveAttribute("href", "/designer/design-plans");
    await user.click(screen.getByRole("button", { name: "View baskets" }));
    expect(screen.getByRole("heading", { name: "Main Baskets" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Remove/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue to item selection" }));
    expect(screen.getByRole("spinbutton", { name: "Quantity for Storage in Kitchen Unit" })).toHaveValue(2);
    expect(writes).toEqual([]);
  });
});
