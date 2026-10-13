import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import type { EstimationPreparationSource } from "../../api/types";
import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { BasketSourceReconciliation } from "./BasketSourceReconciliation";
import { PreparedOrderActions } from "./PreparedOrderActions";
import { ProcurementEstimateSource } from "./ProcurementEstimateSource";
import type { BasketEnquiry } from "./procurementBasketApi";

const source = { id: "order-one", projectId: "project-one", version: 4, status: "ready_to_issue", issueReadiness: { required: true, canIssue: false, blockers: ["Final client approval is required.", "Initial payment must be confirmed."], finalSource: null } };
const target: EstimationPreparationSource = { workflowVersion: 2, phase: "post", kind: "approved_final", estimateId: "estimate-one", estimateVersion: 12, estimateReviewRoundId: "final-review", sourceSnapshotId: "final-snapshot", sourceDigest: "digest" };
const enquiry: BasketEnquiry = { id: "enquiry-one", projectId: "project-one", mainBasketId: "basket-one", version: 7, status: "award_pending", estimateSource: { estimateId: "estimate-one", estimateVersion: 3, estimateReviewRoundId: "pre-review" }, preparationDigest: "old-digest", vendorScopeCurrent: true, boqRevisionId: "boq-one", boqRevision: 1, boqDigest: "boq-digest", lines: [], invitations: [], bidCount: 2, awardId: "award-one" };

describe("Procurement estimate lifecycle", () => {
  it("allows preparation while explaining backend final and payment blockers", () => {
    renderWithQuery(<><ProcurementEstimateSource source={{ ...target, kind: "released_post" }} readiness={source.issueReadiness} /><PreparedOrderActions source={source} kind="order" canManage /></>);
    expect(screen.getByText("Procurement preparation is open")).toBeVisible();
    expect(screen.getByText(/Vendor work has not been released/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Issue approved work orders" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reconcile estimate source" })).toBeEnabled();
  });
  it("requires explicit issue confirmation with pinned version and reuses the key after transient failure", async () => {
    const bodies: unknown[] = [];
    server.use(http.post("/api/v1/procurement/projects/project-one/purchase-orders/order-one/issue", async ({ request }) => {
      bodies.push(await request.json()); return bodies.length === 1 ? HttpResponse.json({ error: { code: "TEMPORARY", message: "Please retry." } }, { status: 503 }) : HttpResponse.json({ data: { ...source, status: "approved" } });
    }));
    renderWithQuery(<PreparedOrderActions source={{ ...source, issueReadiness: { ...source.issueReadiness, canIssue: true, blockers: [] } }} kind="order" canManage />);
    const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Issue approved work orders" }));
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus(); expect(bodies).toHaveLength(0);
    expect((await axe.run(screen.getByRole("dialog"), { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Confirm issue" })); expect(await screen.findByRole("alert")).toHaveTextContent("Please retry.");
    await user.click(screen.getByRole("button", { name: "Confirm issue" }));
    expect(await screen.findByText(/Work orders issued/)).toBeVisible(); expect(bodies).toHaveLength(2);
    expect(bodies[0]).toEqual({ expectedVersion: 4, idempotencyKey: expect.any(String) }); expect(bodies[1]).toEqual(bodies[0]);
  });
  it("requires physical scope acknowledgement before reconciling a project request", async () => {
    const bodies: Record<string, unknown>[] = [];
    server.use(http.post("/api/v1/procurement/projects/project-one/purchase-order-requests/order-one/reconcile", async ({ request }) => {
      const body = await request.json() as Record<string, unknown>; bodies.push(body);
      return body.acknowledgeScopeChanges ? HttpResponse.json({ data: { ...source, status: "changes_requested" } }) : HttpResponse.json({ error: { code: "PURCHASE_ORDER_SCOPE_REVIEW_REQUIRED", message: "Physical quantities changed." } }, { status: 409 });
    }));
    renderWithQuery(<PreparedOrderActions source={source} kind="request" canManage />);
    const user = userEvent.setup(); await user.click(screen.getByRole("button", { name: "Reconcile estimate source" }));
    expect(screen.getByRole("textbox", { name: "Reconciliation reason" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Confirm reconciliation" })); expect(bodies).toHaveLength(0);
    await user.type(screen.getByRole("textbox", { name: "Reconciliation reason" }), "Update final scope.");
    await user.click(screen.getByRole("button", { name: "Confirm reconciliation" }));
    expect(await screen.findByRole("checkbox")).not.toBeChecked(); expect(screen.getByRole("button", { name: "Confirm reconciliation" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox")); await user.click(screen.getByRole("button", { name: "Confirm reconciliation" }));
    expect(await screen.findByText(/Preparation reconciled/)).toBeVisible(); expect(bodies[1]).toMatchObject({ expectedVersion: 4, reason: "Update final scope.", acknowledgeScopeChanges: true });
    expect(bodies[1]!.idempotencyKey).not.toBe(bodies[0]!.idempotencyKey);
  });
  it("retains the reason but prevents resending stale reconciliation", async () => {
    const post = vi.fn(() => HttpResponse.json({ error: { code: "VERSION_CONFLICT", message: "Another buyer changed this order." } }, { status: 409 }));
    server.use(http.post("/api/v1/procurement/projects/project-one/purchase-orders/order-one/reconcile", post));
    renderWithQuery(<PreparedOrderActions source={source} kind="order" canManage />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reconcile estimate source" })); await user.type(screen.getByRole("textbox", { name: "Reconciliation reason" }), "Keep this reason.");
    await user.click(screen.getByRole("button", { name: "Confirm reconciliation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Close this dialog"); expect(screen.getByRole("textbox", { name: "Reconciliation reason" })).toHaveValue("Keep this reason.");
    expect(screen.getByRole("button", { name: "Confirm reconciliation" })).toBeDisabled(); expect(post).toHaveBeenCalledOnce();
  });
  it("has no mutation controls for read-only access or issued artifacts", () => {
    const { unmount } = renderWithQuery(<PreparedOrderActions source={source} kind="order" canManage={false} />); expect(screen.queryByRole("button")).not.toBeInTheDocument(); unmount();
    renderWithQuery(<PreparedOrderActions source={{ ...source, status: "approved" }} kind="order" canManage />); expect(screen.queryByRole("region", { name: "Prepared order release" })).not.toBeInTheDocument();
  });
  it("reconciles the frozen enquiry to the exact final snapshot and version", async () => {
    const post = vi.fn(async ({ request }: { request: Request }) => {
      expect(await request.json()).toEqual({ expectedVersion: 7, expectedSourceSnapshotId: "final-snapshot", reason: "Retain unchanged bids.", idempotencyKey: expect.any(String) }); return HttpResponse.json({ data: enquiry });
    }); server.use(http.post("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/reconcile-source", post));
    renderWithQuery(<BasketSourceReconciliation enquiry={enquiry} target={target} disabled={false} />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reconcile enquiry with final estimate" }));
    await user.type(screen.getByRole("textbox", { name: "Reconciliation reason" }), "Retain unchanged bids."); await user.click(screen.getByRole("button", { name: "Confirm reconciliation" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(post).toHaveBeenCalledOnce(); expect(screen.getByRole("button", { name: "Reconcile enquiry with final estimate" })).toHaveFocus();
  });
  it("directs changed basket scope through withdrawal, BOQ revision and new bids", async () => {
    server.use(http.post("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/reconcile-source", () => HttpResponse.json({ error: { code: "PROCUREMENT_BASKET_SCOPE_RECONCILIATION_REQUIRED", message: "Scope changed." } }, { status: 409 })));
    renderWithQuery(<BasketSourceReconciliation enquiry={enquiry} target={target} disabled={false} />); const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Reconcile enquiry with final estimate" })); await user.type(screen.getByRole("textbox", { name: "Reconciliation reason" }), "Review scope."); await user.click(screen.getByRole("button", { name: "Confirm reconciliation" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Start BOQ revision"); expect(screen.getByRole("button", { name: "Confirm reconciliation" })).toBeDisabled();
  });
});
