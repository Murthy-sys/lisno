import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ProcurementBasketApprovalQueue } from "./ProcurementBasketApprovalQueue";
import type { BasketAward } from "./procurementBasketApi";

const award: BasketAward = {
  id: "award-one", enquiryId: "enquiry-one", projectId: "project-one", mainBasketId: "basket-one",
  version: 4, status: "pending_approvals", requiresRevision: false, withdrawal: null, proposalRevisionId: "proposal-four", vendorId: "vendor-one",
  bidId: "bid-one", issuedPurchaseOrderId: null, approvals: [],
  lines: [{ boqLineId: "line-one", description: "Primer coat", quantityMilliUnits: 2000, uomCode: "sq-ft",
    unitPricePaise: 30000, gstBasisPoints: 1800, netPaise: 60000, gstPaise: 10800, totalPaise: 70800 }],
  proposal: { revision: 4, proposalDigest: "d".repeat(64), boqRevisionId: "boq-one", bidId: "bid-one",
    vendorId: "vendor-one", vendorName: "Sharma Interiors", totals: { netPaise: 60000, gstPaise: 10800, totalPaise: 70800 },
    approvedEstimatePaise: 50000, committedNetPaise: 1000, terms: "Complete the agreed scope.", advanceBasisPoints: 2000,
    lineTerms: [{ boqLineId: "line-one", scopeType: "execution", targetDate: "2026-11-30", deliveryLocation: "Aurora site" }],
    milestones: [{ id: "advance", name: "Advance", basisPoints: 2000, amountPaise: 14160 }],
    requiredSlots: ["budget_override"], budgetOverrideRequired: true, recommendedBidId: "bid-one",
    nonRecommendedReason: null, programManagerId: null, designerId: null, officialKpiAssessmentId: "kpi-one",
    officialKpiAssessmentRevision: 1 }
};

describe("work order approval queue", () => {
  it.each([
    { slot: "procurement", label: "procurement", paymentRows: ["Advance", "Final"] },
    { slot: "program_manager", label: "Site Manager", paymentRows: ["Advance"] },
    { slot: "designer", label: "designer", paymentRows: ["Mobilisation"] }
  ] as const)("shows the saved payment rows and posts the current $label slot", async ({ slot, label, paymentRows }) => {
    const decisions: unknown[] = [];
    const procurementAward: BasketAward = { ...award, version: 2,
      proposal: { ...award.proposal, requiredSlots: ["program_manager", "designer", "procurement", "finance_head"],
        milestones: [
          { id: "advance", name: "Advance", basisPoints: 2000, amountPaise: 1200000, reviewerSlots: ["program_manager", "procurement"] },
          { id: "mobilisation", name: "Mobilisation", basisPoints: 1500, amountPaise: 900000, reviewerSlots: ["designer"] },
          { id: "progress_50", name: "Progress 50%", basisPoints: 2500, amountPaise: 1500000, reviewerSlots: [] },
          { id: "progress_85", name: "Progress 85%", basisPoints: 2500, amountPaise: 1500000, reviewerSlots: ["finance_head"] },
          { id: "final", name: "Final", basisPoints: 1500, amountPaise: 900000, reviewerSlots: ["procurement"] }
        ] } };
    server.use(
      http.get("/api/v1/work-order-approvals", () => HttpResponse.json({ data: [{ awardId: "award-one", projectId: "project-one", enquiryId: "enquiry-one",
        mainBasketId: "basket-one", projectName: "Aurora Villa", basketName: "Painting", vendorName: "Sharma Interiors",
        grossPaise: 6_000_000, slot, status: "pending_approvals" }] })),
      http.get("/api/v1/work-order-approvals/award-one", () => HttpResponse.json({ data: procurementAward })),
      http.post("/api/v1/work-order-approvals/award-one/decision", async ({ request }) => {
        decisions.push(await request.json());
        return HttpResponse.json({ data: procurementAward });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<MemoryRouter><ProcurementBasketApprovalQueue /></MemoryRouter>);
    const assigned = await screen.findByRole("button", { name: /Aurora Villa.*Painting.*Sharma Interiors/u });
    expect(assigned).toHaveTextContent(label);
    await user.click(assigned);
    const rows = await screen.findByRole("region", { name: "Payment rows for your approval" });
    expect(screen.getByText(`${label} decision · Proposal revision 4`)).toBeVisible();
    for (const name of ["Advance", "Mobilisation", "Progress 50%", "Progress 85%", "Final"]) {
      if (paymentRows.some((row) => row === name)) expect(within(rows).getByText(name)).toBeVisible();
      else expect(within(rows).queryByText(name)).not.toBeInTheDocument();
    }
    expect(screen.queryByText(/program manager/iu)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve revision" }));
    await waitFor(() => expect(decisions).toHaveLength(1));
    expect(decisions[0]).toMatchObject({ slot, decision: "approve", expectedVersion: 2, proposalRevisionId: "proposal-four" });
  });

  it("requires an explicit override reason and posts the frozen proposal revision", async () => {
    const decisions: unknown[] = [];
    let currentAward = award;
    server.use(
      http.get("/api/v1/work-order-approvals", () => HttpResponse.json({ data: [{ awardId: "award-one", projectId: "project-one", enquiryId: "enquiry-one",
        mainBasketId: "basket-one", projectName: "Aurora Villa", basketName: "Painting", vendorName: "Sharma Interiors",
        grossPaise: 70800, slot: "budget_override", status: "pending_approvals" }] })),
      http.get("/api/v1/work-order-approvals/award-one", () => HttpResponse.json({ data: currentAward })),
      http.post("/api/v1/work-order-approvals/award-one/decision", async ({ request }) => {
        decisions.push(await request.json());
        currentAward = { ...award, version: 6, status: "issued", issuedPurchaseOrderId: "order-one",
          approvals: [{ slot: "budget_override", actorId: "admin-one", decision: "approve",
            reason: "Verified approved budget exception.", decidedAt: "2026-10-05T00:00:00Z" }] };
        return HttpResponse.json({ data: currentAward });
      })
    );
    const user = userEvent.setup();
    const view = renderWithQuery(<MemoryRouter><ProcurementBasketApprovalQueue /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: /Aurora Villa.*Painting.*Sharma Interiors/u }));
    expect(await screen.findByRole("heading", { name: "Sharma Interiors" })).toBeVisible();
    expect(screen.getByText("Primer coat")).toBeVisible();
    expect(screen.getByRole("table", { name: "Proposed work order lines and details" })).toHaveTextContent("execution");
    expect(screen.getByRole("table", { name: "Proposed work order lines and details" })).toHaveTextContent("Aurora site");
    expect(screen.getByRole("button", { name: "Approve revision" })).toBeDisabled();
    await user.type(screen.getByLabelText("Reason for budget override"), "Verified approved budget exception.");
    const report = await axe.run(view.container, { rules: { "color-contrast": { enabled: false } } });
    expect(report.violations).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Approve revision" }));
    await waitFor(() => expect(decisions).toHaveLength(1));
    expect(decisions[0]).toMatchObject({ expectedVersion: 4, proposalRevisionId: "proposal-four",
      slot: "budget_override", decision: "approve", reason: "Verified approved budget exception." });
    expect(await screen.findByText("Your approval was recorded. The work order is issued and its payment schedule is locked.")).toBeVisible();
    expect(await screen.findByText("Approved")).toBeVisible();
  });

  it("reuses a decision key when the first request fails", async () => {
    const requests: Array<{ idempotencyKey: string }> = [];
    const issued: BasketAward = { ...award, version: 6, status: "issued", issuedPurchaseOrderId: "order-one",
      approvals: [{ slot: "budget_override", actorId: "admin-one", decision: "approve",
        reason: "Verified approved budget exception.", decidedAt: "2026-10-05T00:00:00Z" }] };
    let currentAward = award;
    server.use(
      http.get("/api/v1/work-order-approvals", () => HttpResponse.json({ data: [{ awardId: "award-one", projectId: "project-one",
        enquiryId: "enquiry-one", mainBasketId: "basket-one", projectName: "Aurora Villa", basketName: "Painting",
        vendorName: "Sharma Interiors", grossPaise: 70800, slot: "budget_override", status: "pending_approvals" }] })),
      http.get("/api/v1/work-order-approvals/award-one", () => HttpResponse.json({ data: currentAward })),
      http.post("/api/v1/work-order-approvals/award-one/decision", async ({ request }) => {
        requests.push(await request.json() as { idempotencyKey: string });
        if (requests.length === 1) return HttpResponse.json({ error: { code: "TEMPORARY_ERROR", message: "Decision unavailable." } }, { status: 503 });
        currentAward = issued;
        return HttpResponse.json({ data: issued });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<MemoryRouter><ProcurementBasketApprovalQueue /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: /Aurora Villa.*Painting.*Sharma Interiors/u }));
    await user.type(screen.getByLabelText("Reason for budget override"), "Verified approved budget exception.");
    await user.click(screen.getByRole("button", { name: "Approve revision" }));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(await screen.findByText("Decision unavailable.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Approve revision" }));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[1]?.idempotencyKey).toBe(requests[0]?.idempotencyKey);
    expect(await screen.findByText("Your approval was recorded. The work order is issued and its payment schedule is locked.")).toBeVisible();
  });

  it("refreshes a committed decision when its response is lost", async () => {
    const issued: BasketAward = { ...award, version: 6, status: "issued", issuedPurchaseOrderId: "order-one",
      approvals: [{ slot: "budget_override", actorId: "admin-one", decision: "approve",
        reason: "Verified approved budget exception.", decidedAt: "2026-10-05T00:00:00Z" }] };
    let currentAward = award;
    server.use(
      http.get("/api/v1/work-order-approvals", () => HttpResponse.json({ data: [{ awardId: "award-one", projectId: "project-one",
        enquiryId: "enquiry-one", mainBasketId: "basket-one", projectName: "Aurora Villa", basketName: "Painting",
        vendorName: "Sharma Interiors", grossPaise: 70800, slot: "budget_override", status: "pending_approvals" }] })),
      http.get("/api/v1/work-order-approvals/award-one", () => HttpResponse.json({ data: currentAward })),
      http.post("/api/v1/work-order-approvals/award-one/decision", () => {
        currentAward = issued;
        return HttpResponse.error();
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<MemoryRouter><ProcurementBasketApprovalQueue /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: /Aurora Villa.*Painting.*Sharma Interiors/u }));
    await user.type(screen.getByLabelText("Reason for budget override"), "Verified approved budget exception.");
    await user.click(screen.getByRole("button", { name: "Approve revision" }));
    expect(await screen.findByText("Your approval was recorded. The work order is issued and its payment schedule is locked.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Approve revision" })).not.toBeInTheDocument();
  });
});
