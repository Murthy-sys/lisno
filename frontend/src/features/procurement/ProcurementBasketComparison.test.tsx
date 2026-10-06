import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { http, HttpResponse } from "msw";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderWithQuery } from "../../test/render";
import { server } from "../../test/server";
import { ProcurementBasketComparison } from "./ProcurementBasketComparison";
import type { BasketAward, BasketAwardPreview, BasketEnquiry, BasketMilestoneReviewers } from "./procurementBasketApi";

const digest = "a".repeat(64);
const enquiry: BasketEnquiry = { id: "enquiry-one", projectId: "project-one", mainBasketId: "basket-one", version: 3,
  status: "sent", estimateSource: { estimateId: "estimate-one", estimateVersion: 2, estimateReviewRoundId: "round-one" }, preparationDigest: digest, vendorScopeCurrent: true,
  boqRevisionId: "boq-revision-one", boqRevision: 1, boqDigest: digest,
  lines: [{ id: "line-one", sourceLineItemKey: "room-one:paint-one", roomId: "room-one", roomName: "Living Room",
    subBasketId: null, subBasketName: null, mainLineId: "paint-one", mainLineName: "Interior painting",
    approvedQuantity: "2", approvedQuoteAmountPaise: 7_000_000, approvedUnit: "sq-ft", uomId: "uom-one", uomCode: "sq-ft", uomDecimalScale: 2,
    description: "Interior painting", quantityMilliUnits: 2000, scopeType: "execution", targetDate: "2026-11-30", deliveryLocation: "Site" }],
  invitations: [], bidCount: 2, awardId: null };
const line = { boqLineId: "line-one", description: "Interior painting", quantityMilliUnits: 2000, uomCode: "sq-ft", unitPricePaise: 3000000, gstBasisPoints: 0, netPaise: 6000000, gstPaise: 0, totalPaise: 6000000 };
const lineTerms = [{ boqLineId: "line-one", scopeType: "execution" as const, targetDate: "2026-11-30", deliveryLocation: "Site" }];
const enquiryWithoutTerms: BasketEnquiry = { ...enquiry, lines: enquiry.lines.map(({ scopeType: _scopeType, targetDate: _targetDate,
  deliveryLocation: _deliveryLocation, ...item }) => item) };
const rows = [
  { bidId: "bid-one", vendorId: "vendor-one", vendorName: "Sharma Interiors", officialKpiScoreBps: 8600, quoteNetPaise: 5000000, quoteGstPaise: 0, quoteGrossPaise: 5000000, priceScoreBps: 10000, comparisonScoreBps: 9300, recommended: true, priorityRank: 1, eligible: true, blockers: [], bidRevision: 1, lines: [{ ...line, unitPricePaise: 2500000, netPaise: 5000000, totalPaise: 5000000 }] },
  { bidId: "bid-two", vendorId: "vendor-two", vendorName: "Decor Masters", officialKpiScoreBps: 7000, quoteNetPaise: 6000000, quoteGstPaise: 0, quoteGrossPaise: 6000000, priceScoreBps: 8333, comparisonScoreBps: 7667, recommended: false, priorityRank: 2, eligible: true, blockers: [], bidRevision: 1, lines: [line] }
];
const milestones = [
  { id: "advance", name: "Advance", basisPoints: 2000, amountPaise: 1200000 },
  { id: "mobilisation", name: "Mobilisation", basisPoints: 1500, amountPaise: 900000 },
  { id: "progress_50", name: "Progress 50%", basisPoints: 2500, amountPaise: 1500000 },
  { id: "progress_85", name: "Progress 85%", basisPoints: 2500, amountPaise: 1500000 },
  { id: "final", name: "Final", basisPoints: 1500, amountPaise: 900000 }
] as const;
const assignedPreview: BasketAwardPreview = {
  bidId: "bid-two", vendorId: "vendor-two", vendorName: "Decor Masters",
  totals: { netPaise: 6000000, gstPaise: 0, totalPaise: 6000000 }, milestones: [...milestones],
  requiredSlots: ["program_manager", "designer", "procurement", "finance_head"], budgetOverrideRequired: false,
  designerOptions: [{ id: "designer-other", name: "Unrelated Designer" }],
  assignedSiteManager: { id: "site-manager-one", name: "Arun Site Manager" },
  assignedDesigner: { id: "designer-one", name: "Asha Designer" }, approverBlockers: [],
  programManagerId: "site-manager-one", recommendedBidId: "bid-one", lines: [line]
};

describe("basket bid comparison and award", () => {
  it.each([
    { slot: "program_manager" as const, code: "SITE_MANAGER_REQUIRED", message: "Assign a Site Manager to this project's Site execution task before submitting the award." },
    { slot: "designer" as const, code: "DESIGNER_INACTIVE", message: "The assigned project Designer is inactive. Update the project's Designer assignment." },
    { slot: "designer" as const, code: "DESIGNER_ASSIGNMENT_CONFLICT", message: "The project's Designer assignments conflict. Resolve the project assignment before submitting." }
  ])("shows the server assignment blocker $code without choosing another person", async (blocker) => {
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/comparison", () =>
        HttpResponse.json({ data: { enquiryId: enquiry.id, boqRevisionId: "boq-revision-one", boqDigest: digest,
          comparisonDigest: digest, averageBidNetPaise: 6000000, rows: [rows[1]], recommendedBidId: "bid-two",
          awardId: null, bidHistory: [], bidHistoryHasMore: false, counteroffers: [], counteroffersHasMore: false } })),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/award-preview", () =>
        HttpResponse.json({ data: { ...assignedPreview, approverBlockers: [blocker],
          ...(blocker.slot === "program_manager" ? { assignedSiteManager: null, programManagerId: null } : { assignedDesigner: null }) } }))
    );
    const user = userEvent.setup();
    renderWithQuery(<ProcurementBasketComparison projectId="project-one" basketId="basket-one" enquiry={enquiry} frozen={false} afterChange={async () => {}} />);
    await user.click(await screen.findByRole("button", { name: "Award" }));
    const modal = await screen.findByRole("dialog", { name: "Award vendor" });
    expect(await within(modal).findByText(blocker.message)).toHaveAttribute("role", "alert");
    for (const role of ["Site Manager", "Designer", "Procurement", "Finance"]) {
      await user.click(within(modal).getByRole("button", { name: `Advance ${role} approver` }));
    }
    await waitFor(() => expect(within(modal).queryByText("Updating payment schedule…")).not.toBeInTheDocument());
    expect(within(modal).getByRole("button", { name: "Send for approvals" })).toBeDisabled();
    expect(within(modal).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(modal).queryByText("Unrelated Designer")).not.toBeInTheDocument();
    expect(within(modal).queryByText(/Program Manager/u)).not.toBeInTheDocument();
  });

  it("does not validate the selected bid with another bid's approver preview", async () => {
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/comparison", () =>
        HttpResponse.json({ data: { enquiryId: enquiry.id, boqRevisionId: "boq-revision-one", boqDigest: digest,
          comparisonDigest: digest, averageBidNetPaise: 6000000, rows: [rows[1]], recommendedBidId: "bid-two",
          awardId: null, bidHistory: [], bidHistoryHasMore: false, counteroffers: [], counteroffersHasMore: false } })),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/award-preview", () =>
        HttpResponse.json({ data: { ...assignedPreview, bidId: "bid-one" } }))
    );
    const user = userEvent.setup();
    renderWithQuery(<ProcurementBasketComparison projectId="project-one" basketId="basket-one" enquiry={enquiry} frozen={false} afterChange={async () => {}} />);
    await user.click(await screen.findByRole("button", { name: "Award" }));
    const modal = await screen.findByRole("dialog", { name: "Award vendor" });
    for (const role of ["Site Manager", "Designer", "Procurement", "Finance"]) {
      await user.click(await within(modal).findByRole("button", { name: `Advance ${role} approver` }));
    }
    await waitFor(() => expect(within(modal).queryByText("Updating payment schedule…")).not.toBeInTheDocument());
    expect(within(modal).getByRole("button", { name: "Send for approvals" })).toBeDisabled();
    expect(within(modal).queryByText("Asha Designer")).not.toBeInTheDocument();
  });

  it.each([
    { changedSlot: "program_manager", status: "pending_approvals" },
    { changedSlot: "designer", status: "pending_approvals" },
    { changedSlot: "program_manager", status: "ready_to_issue" },
    { changedSlot: "designer", status: "ready_to_issue" }
  ] as const)("revises a $status award when the project $changedSlot assignment changed", async ({ changedSlot, status }) => {
    const updates: unknown[] = [];
    const submissions: unknown[] = [];
    let savedAward: BasketAward = {
      id: "award-one", enquiryId: enquiry.id, projectId: "project-one", mainBasketId: "basket-one", version: 3,
      status, requiresRevision: false, withdrawal: null, vendorId: "vendor-two", bidId: "bid-two",
      proposalRevisionId: "old-proposal", issuedPurchaseOrderId: null,
      proposal: { revision: 1, proposalDigest: digest, boqRevisionId: "boq-revision-one", bidId: "bid-two", vendorId: "vendor-two",
        vendorName: "Decor Masters", totals: assignedPreview.totals, approvedEstimatePaise: 7000000, committedNetPaise: 0,
        terms: null, advanceBasisPoints: 2000, milestones: milestones.map((milestone) => ({ ...milestone,
          reviewerSlots: milestone.id === "advance" ? ["program_manager", "designer", "procurement", "finance_head"] : [] })),
        requiredSlots: assignedPreview.requiredSlots, budgetOverrideRequired: false, recommendedBidId: "bid-one", nonRecommendedReason: null,
        programManagerId: changedSlot === "program_manager" ? "old-manager" : "site-manager-one",
        designerId: changedSlot === "designer" ? "old-designer" : "designer-one", officialKpiAssessmentId: "kpi-one", officialKpiAssessmentRevision: 1 },
      approvals: [{ slot: changedSlot, actorId: "old-approver", decision: "approve", reason: null, decidedAt: "2026-10-05T00:00:00Z" }], lines: [line]
    };
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/comparison", () =>
        HttpResponse.json({ data: { enquiryId: enquiry.id, boqRevisionId: "boq-revision-one", boqDigest: digest,
          comparisonDigest: digest, averageBidNetPaise: 6000000, rows: [rows[1]], recommendedBidId: "bid-one",
          awardId: "award-one", bidHistory: [], bidHistoryHasMore: false, counteroffers: [], counteroffersHasMore: false } })),
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/awards/award-one", () => HttpResponse.json({ data: savedAward })),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/award-preview", () => HttpResponse.json({ data: assignedPreview })),
      http.put("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/awards/award-one", async ({ request }) => {
        updates.push(await request.json());
        savedAward = { ...savedAward, version: 4, status: "draft", proposalRevisionId: "new-proposal", approvals: [],
          proposal: { ...savedAward.proposal, revision: 2, programManagerId: "site-manager-one", designerId: "designer-one" } };
        return HttpResponse.json({ data: savedAward });
      }),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/awards/award-one/submit", async ({ request }) => {
        submissions.push(await request.json());
        savedAward = { ...savedAward, version: 5, status: "pending_approvals", autoIssueOnApproval: true };
        return HttpResponse.json({ data: savedAward });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<ProcurementBasketComparison projectId="project-one" basketId="basket-one" enquiry={enquiry} frozen={false} afterChange={async () => {}} />);
    await user.click(await screen.findByRole("button", { name: "Review current bid" }));
    const modal = await screen.findByRole("dialog", { name: "Award vendor" });
    expect(await within(modal).findByText("Asha Designer")).toBeVisible();
    expect(within(modal).getByText("Arun Site Manager")).toBeVisible();
    expect(within(modal).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(modal).getByText(/saved proposal differs/u)).toBeVisible();
    expect(within(modal).queryByRole("button", { name: "Retry issue and lock" })).not.toBeInTheDocument();
    const submit = within(modal).getByRole("button", { name: "Send for approvals" });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ expectedVersion: 3, bidId: "bid-two" });
    expect(updates[0]).not.toHaveProperty("designerId");
    expect(submissions[0]).toMatchObject({ expectedVersion: 4, autoIssueOnApproval: true });
    expect(await within(modal).findByText("Awaiting Site Manager, Designer, Procurement, Finance.")).toBeVisible();
  });

  it.each([false, true])("keeps the award modal keyboard accessible and dismisses its frozen view with reduced motion %s", async (reducedMotion) => {
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: reducedMotion && query === "(prefers-reduced-motion: reduce)",
      media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(),
      removeEventListener: vi.fn(), dispatchEvent: vi.fn() })));
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/comparison", () =>
        HttpResponse.json({ data: { enquiryId: enquiry.id, boqRevisionId: "boq-revision-one", boqDigest: digest,
          comparisonDigest: digest, averageBidNetPaise: 5000000, rows: [rows[0]], recommendedBidId: "bid-one",
          awardId: null, bidHistory: [], bidHistoryHasMore: false, counteroffers: [], counteroffersHasMore: false } })),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/award-preview", () =>
        HttpResponse.json({ data: { bidId: "bid-one", vendorId: "vendor-one", vendorName: "Sharma Interiors",
          totals: { netPaise: 5000000, gstPaise: 0, totalPaise: 5000000 }, milestones, requiredSlots: ["procurement"],
          budgetOverrideRequired: false, designerOptions: [], programManagerId: null, recommendedBidId: "bid-one", lines: rows[0]!.lines } }))
    );
    try {
      let freezeAward = () => {};
      function ComparisonHarness() {
        const [frozen, setFrozen] = useState(false);
        freezeAward = () => setFrozen(true);
        return <ProcurementBasketComparison projectId="project-one" basketId="basket-one" enquiry={enquiry}
          frozen={frozen} afterChange={async () => {}} />;
      }
      const user = userEvent.setup();
      renderWithQuery(<ComparisonHarness />);
      const trigger = await screen.findByRole("button", { name: "Award" });
      await user.click(trigger);
      const modal = await screen.findByRole("dialog", { name: "Award vendor" });
      expect(modal).toHaveAttribute("aria-modal", "true");
      const close = within(modal).getByRole("button", { name: "Close award vendor" });
      await waitFor(() => expect(close).toHaveFocus());
      const submit = within(modal).getByRole("button", { name: "Send for approvals" });
      await waitFor(() => expect(submit).toBeEnabled());
      await user.tab({ shift: true });
      expect(submit).toHaveFocus();
      await user.tab();
      expect(close).toHaveFocus();
      await user.keyboard("{Escape}");
      if (!reducedMotion) {
        expect(modal).toBeInTheDocument();
        expect(submit).toBeDisabled();
      } else {
        expect(modal).not.toBeInTheDocument();
      }
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Award vendor" })).not.toBeInTheDocument());
      await waitFor(() => expect(trigger).toHaveFocus());
      await user.click(trigger);
      const reopened = await screen.findByRole("dialog", { name: "Award vendor" });
      await waitFor(() => expect(within(reopened).getByRole("button", { name: "Close award vendor" })).toHaveFocus());
      act(() => freezeAward());
      expect(within(reopened).getByRole("button", { name: "Send for approvals" })).toBeDisabled();
      expect(within(reopened).getByRole("button", { name: "Close award vendor" })).toBeEnabled();
      await user.click(screen.getByRole("button", { name: "Close Award vendor" }));
      await waitFor(() => expect(reopened).not.toBeInTheDocument());
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("sends an award in one action and retries a saved draft without creating another proposal", async () => {
    const awardRequests: unknown[] = [];
    const previewRequests: unknown[] = [];
    const submitRequests: Array<{ expectedVersion: number; idempotencyKey: string; autoIssueOnApproval: boolean }> = [];
    let submissionFails = true;
    let awardId: string | null = null;
    let savedAward: BasketAward | null = null;
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/comparison", () => HttpResponse.json({ data: { enquiryId: enquiry.id, boqRevisionId: "boq-revision-one", boqDigest: digest, comparisonDigest: digest, averageBidNetPaise: 5500000, rows: [...rows].reverse(), recommendedBidId: "bid-one", awardId,
        bidHistory: [{ bidId: "bid-one", vendorId: "vendor-one", revision: 1, submittedAt: "2026-10-05T00:00:00Z", totals: { netPaise: 5000000, gstPaise: 0, totalPaise: 5000000 }, lines: rows[0]!.lines }], bidHistoryHasMore: false,
        counteroffers: [], counteroffersHasMore: false } })),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/award-preview", async ({ request }) => { previewRequests.push(await request.json()); return HttpResponse.json({ data: { bidId: "bid-two", vendorId: "vendor-two", vendorName: "Decor Masters", totals: { netPaise: 6000000, gstPaise: 0, totalPaise: 6000000 }, milestones, requiredSlots: ["program_manager", "designer", "procurement", "finance_head"], budgetOverrideRequired: false, designerOptions: [{ id: "designer-one", name: "Asha Designer" }], assignedSiteManager: { id: "manager-one", name: "Arun Site Manager" }, assignedDesigner: { id: "designer-one", name: "Asha Designer" }, approverBlockers: [], programManagerId: "manager-one", recommendedBidId: "bid-one", lines: [line] } }); }),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/awards", async ({ request }) => {
        const input = await request.json() as { milestoneReviewers: BasketMilestoneReviewers[] };
        awardRequests.push(input); awardId = "award-one";
        const award: BasketAward = { id: awardId, enquiryId: enquiry.id, projectId: "project-one", mainBasketId: "basket-one", version: 1, status: "draft", requiresRevision: false, withdrawal: null, vendorId: "vendor-two", bidId: "bid-two", proposalRevisionId: "proposal-one", issuedPurchaseOrderId: null,
          proposal: { revision: 1, proposalDigest: digest, boqRevisionId: "boq-revision-one", bidId: "bid-two", vendorId: "vendor-two", vendorName: "Decor Masters", totals: { netPaise: 6000000, gstPaise: 0, totalPaise: 6000000 }, approvedEstimatePaise: 7000000, committedNetPaise: 0, terms: null, advanceBasisPoints: 2000, milestones: milestones.map((milestone) => ({ ...milestone, reviewerSlots: input.milestoneReviewers.find((row) => row.id === milestone.id)?.reviewerSlots ?? [] })), requiredSlots: ["program_manager", "designer", "procurement", "finance_head"], budgetOverrideRequired: false, recommendedBidId: "bid-one", nonRecommendedReason: "Delivery capacity is confirmed.", programManagerId: "manager-one", designerId: "designer-one", officialKpiAssessmentId: "kpi-one", officialKpiAssessmentRevision: 1 }, approvals: [], lines: [line] };
        savedAward = award;
        return HttpResponse.json({ data: award });
      }),
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/awards/award-one", () => HttpResponse.json({ data: savedAward })),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/awards/award-one/submit", async ({ request }) => {
        submitRequests.push(await request.json() as { expectedVersion: number; idempotencyKey: string; autoIssueOnApproval: boolean });
        if (submissionFails) return HttpResponse.json({ error: { code: "REVIEWER_UNAVAILABLE", message: "No active Finance reviewer is assigned." } }, { status: 409 });
        savedAward = { ...savedAward!, version: 2, status: "pending_approvals", autoIssueOnApproval: true };
        return HttpResponse.json({ data: savedAward });
      })
    );
    const user = userEvent.setup(); renderWithQuery(<ProcurementBasketComparison projectId="project-one" basketId="basket-one" enquiry={enquiryWithoutTerms} frozen={false} afterChange={async () => {}} />);
    const table = await screen.findByRole("table", { name: "Vendor bid comparison" });
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Sharma Interiors");
    const decorRow = within(table).getByRole("row", { name: /Decor Masters/u });
    expect(within(decorRow).getByText("#2")).toBeVisible();
    expect(screen.getByText("Average bid price (before GST)").parentElement).toHaveTextContent("₹55,000.00");
    expect(within(table).getByRole("row", { name: /Sharma Interiors/u })).toHaveTextContent("Top priority");
    expect(within(decorRow).getByText("₹30,000.00")).toBeVisible();
    expect(within(decorRow).getByText("₹60,000.00")).toBeVisible();
    expect(screen.queryByText("Line totals, GST and quoted amounts")).not.toBeInTheDocument();
    expect(screen.queryByText("Bid and counteroffer history")).not.toBeInTheDocument();
    await user.click(within(decorRow).getByRole("button", { name: "Award" }));
    const drawer = await screen.findByRole("dialog", { name: "Award vendor" });
    expect(within(drawer).queryByRole("heading", { name: "Work order details" })).not.toBeInTheDocument();
    expect(within(drawer).queryByLabelText("Work order terms")).not.toBeInTheDocument();
    expect(within(drawer).queryByText("Complete these details before preparing the award.")).not.toBeInTheDocument();
    expect(within(drawer).getByText("₹12,000.00")).toBeVisible();
    expect(within(drawer).getByText(/Select Site Manager, Designer, Procurement, Finance on at least one payment row/u)).toBeVisible();
    const advanceApprovers = within(drawer).getByRole("group", { name: "Advance approvers" });
    within(advanceApprovers).getByRole("button", { name: "Advance Site Manager approver" }).focus();
    await user.keyboard(" ");
    await user.click(within(advanceApprovers).getByRole("button", { name: "Advance Designer approver" }));
    expect(within(advanceApprovers).getByRole("button", { name: "Advance Site Manager approver" })).toHaveAttribute("aria-pressed", "true");
    expect(within(advanceApprovers).getByRole("button", { name: "Advance Designer approver" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(within(drawer).getByRole("group", { name: "Mobilisation approvers" })).getByRole("button", { name: "Mobilisation Procurement approver" }));
    await user.click(within(drawer).getByRole("button", { name: "Final Finance approver" }));
    expect(within(drawer).queryByText(/Select .* on at least one payment row/u)).not.toBeInTheDocument();
    expect(within(drawer).queryByLabelText("Reason for awarding outside the recommendation")).not.toBeInTheDocument();
    expect(within(drawer).queryByText(/Frozen quotation/u)).not.toBeInTheDocument();
    expect(within(drawer).queryByRole("table")).not.toBeInTheDocument();
    expect(table).toBeInTheDocument();
    expect(within(drawer).queryByRole("combobox")).not.toBeInTheDocument();
    expect(within(drawer).getByText("Asha Designer")).toBeVisible();
    expect(within(drawer).getByText("Arun Site Manager")).toBeVisible();
    expect((await axe.run(drawer, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await waitFor(() => expect(within(drawer).getByRole("button", { name: "Send for approvals" })).toBeEnabled());
    expect(within(drawer).queryByRole("button", { name: "Prepare award" })).not.toBeInTheDocument();
    expect(within(drawer).queryByRole("button", { name: "Submit for approvals" })).not.toBeInTheDocument();
    await user.click(within(drawer).getByRole("button", { name: "Send for approvals" }));
    await waitFor(() => expect(awardRequests).toHaveLength(1));
    expect(previewRequests.at(-1)).toMatchObject({ milestoneReviewers: [
      { id: "advance", reviewerSlots: ["program_manager", "designer"] }, { id: "mobilisation", reviewerSlots: ["procurement"] },
      { id: "progress_50", reviewerSlots: [] }, { id: "progress_85", reviewerSlots: [] }, { id: "final", reviewerSlots: ["finance_head"] }
    ] });
    expect(awardRequests[0]).toMatchObject({ bidId: "bid-two", expectedVersion: 3, advanceBasisPoints: 2000, milestoneReviewers: [
      { id: "advance", reviewerSlots: ["program_manager", "designer"] }, { id: "mobilisation", reviewerSlots: ["procurement"] },
      { id: "progress_50", reviewerSlots: [] }, { id: "progress_85", reviewerSlots: [] }, { id: "final", reviewerSlots: ["finance_head"] }
    ] });
    expect(awardRequests[0]).not.toHaveProperty("designerId");
    expect(previewRequests.at(-1)).not.toHaveProperty("designerId");
    expect(awardRequests[0]).not.toHaveProperty("lineTerms");
    expect(awardRequests[0]).not.toHaveProperty("terms");
    expect(awardRequests[0]).not.toHaveProperty("nonRecommendedReason");
    expect(await within(drawer).findByText("No active Finance reviewer is assigned.")).toBeVisible();
    expect(submitRequests).toHaveLength(1);
    expect(submitRequests[0]).toMatchObject({ expectedVersion: 1, autoIssueOnApproval: true });
    expect(within(drawer).getByText("Not sent. Send this award to create approval tasks.")).toBeVisible();
    submissionFails = false;
    await user.click(within(drawer).getByRole("button", { name: "Send for approvals" }));
    await waitFor(() => expect(submitRequests).toHaveLength(2));
    expect(awardRequests).toHaveLength(1);
    expect(submitRequests[1]).toMatchObject({ expectedVersion: 1, autoIssueOnApproval: true });
    expect(submitRequests[1]!.idempotencyKey).toBe(submitRequests[0]!.idempotencyKey);
    expect(await within(drawer).findByText(/Awaiting Site Manager, Designer, Procurement, Finance/u)).toBeVisible();
  });

  it("reviews a frozen saved bid and revises its award to the latest eligible bid with a new approval revision", async () => {
    const updateRequests: unknown[] = [];
    const submitRequests: unknown[] = [];
    const oldLine = { ...line, unitPricePaise: 2750000, netPaise: 5500000, totalPaise: 5500000 };
    let savedAward: BasketAward = {
      id: "award-one", enquiryId: enquiry.id, projectId: "project-one", mainBasketId: "basket-one", version: 3,
      status: "pending_approvals", requiresRevision: false, withdrawal: null, vendorId: "vendor-one", bidId: "old-bid", proposalRevisionId: "old-proposal", issuedPurchaseOrderId: null,
      proposal: { revision: 1, proposalDigest: digest, boqRevisionId: "boq-revision-one", bidId: "old-bid",
        vendorId: "vendor-one", vendorName: "Sharma Interiors", totals: { netPaise: 5500000, gstPaise: 0, totalPaise: 5500000 },
        approvedEstimatePaise: 7000000, committedNetPaise: 0, terms: "Use the approved BOQ.", lineTerms, advanceBasisPoints: 2000,
        milestones: [...milestones], requiredSlots: ["program_manager", "designer", "procurement", "finance_head"],
        budgetOverrideRequired: false, recommendedBidId: "old-bid", nonRecommendedReason: "Old nonrecommended reason.",
        programManagerId: "manager-one", designerId: "designer-one", officialKpiAssessmentId: "kpi-one", officialKpiAssessmentRevision: 1 },
      approvals: [{ slot: "program_manager", actorId: "manager-one", decision: "approve", reason: null, decidedAt: "2026-10-05T00:00:00Z" }], lines: [oldLine]
    };
    const latestMilestones = milestones.map((milestone) => ({ ...milestone, amountPaise: Math.round(5000000 * milestone.basisPoints / 10000) }));
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/comparison", () => HttpResponse.json({ data: {
        enquiryId: enquiry.id, boqRevisionId: "boq-revision-one", boqDigest: digest, comparisonDigest: digest, averageBidNetPaise: 5500000,
        rows, recommendedBidId: "bid-one", awardId: "award-one", bidHistory: [], bidHistoryHasMore: false,
        counteroffers: [], counteroffersHasMore: false } })),
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/awards/award-one", () => HttpResponse.json({ data: savedAward })),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/award-preview", () => HttpResponse.json({ data: {
        bidId: "bid-one", vendorId: "vendor-one", vendorName: "Sharma Interiors", totals: { netPaise: 5000000, gstPaise: 0, totalPaise: 5000000 },
        milestones: latestMilestones, requiredSlots: ["procurement"], budgetOverrideRequired: false,
        designerOptions: [], programManagerId: "manager-one", recommendedBidId: "bid-one", lines: rows[0]!.lines } })),
      http.put("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/awards/award-one", async ({ request }) => {
        const input = await request.json() as { milestoneReviewers: BasketMilestoneReviewers[] };
        updateRequests.push(input);
        savedAward = { ...savedAward, version: 4, status: "draft", bidId: "bid-one", proposalRevisionId: "new-proposal", approvals: [], lines: rows[0]!.lines,
          proposal: { ...savedAward.proposal, revision: 2, bidId: "bid-one", totals: { netPaise: 5000000, gstPaise: 0, totalPaise: 5000000 },
            milestones: latestMilestones.map((milestone) => ({ ...milestone, reviewerSlots: input.milestoneReviewers.find((row) => row.id === milestone.id)?.reviewerSlots ?? [] })), requiredSlots: ["procurement"], recommendedBidId: "bid-one", nonRecommendedReason: null } };
        return HttpResponse.json({ data: savedAward });
      }),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/awards/award-one/submit", async ({ request }) => {
        submitRequests.push(await request.json());
        savedAward = { ...savedAward, version: 5, status: "pending_approvals" };
        return HttpResponse.json({ data: savedAward });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<ProcurementBasketComparison projectId="project-one" basketId="basket-one" enquiry={enquiry} frozen={false} afterChange={async () => {}} />);
    await user.click(await screen.findByRole("button", { name: "Review saved award" }));
    const frozenDrawer = await screen.findByRole("dialog", { name: "Award vendor" });
    expect(within(frozenDrawer).getByText(/saved bid is no longer current/u)).toBeVisible();
    expect(within(frozenDrawer).getByText("Awaiting Designer, Procurement, Finance.")).toBeVisible();
    expect(within(frozenDrawer).getAllByText("₹55,000.00").length).toBeGreaterThan(0);
    expect(within(frozenDrawer).queryByRole("button", { name: "Send for approvals" })).not.toBeInTheDocument();
    await user.click(within(frozenDrawer).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(frozenDrawer).not.toBeInTheDocument());
    const currentRow = within(screen.getByRole("table", { name: "Vendor bid comparison" })).getByRole("row", { name: /Sharma Interiors/u });
    await user.click(within(currentRow).getByRole("button", { name: "Revise award to this bid" }));
    const drawer = await screen.findByRole("dialog", { name: "Award vendor" });
    expect(within(drawer).getByText(/new proposal revision/u)).toBeVisible();
    expect(within(drawer).getByText("Awaiting Designer, Procurement, Finance.")).toBeVisible();
    for (const milestone of milestones) {
      const chips = within(drawer).getByRole("group", { name: `${milestone.name} approvers` });
      expect(within(chips).getByRole("button", { name: `${milestone.name} Procurement approver` })).toHaveAttribute("aria-pressed", "true");
      for (const role of ["Site Manager", "Designer", "Finance"]) expect(within(chips).getByRole("button", { name: `${milestone.name} ${role} approver` })).toBeDisabled();
    }
    await waitFor(() => expect(within(drawer).getByRole("button", { name: "Send for approvals" })).toBeEnabled());
    await user.click(within(drawer).getByRole("button", { name: "Send for approvals" }));
    await waitFor(() => expect(updateRequests).toHaveLength(1));
    expect(updateRequests[0]).toMatchObject({ expectedVersion: 3, bidId: "bid-one", advanceBasisPoints: 2000,
      terms: "Use the approved BOQ.",
      milestoneReviewers: milestones.map(({ id }) => ({ id, reviewerSlots: ["procurement"] })) });
    expect(updateRequests[0]).not.toHaveProperty("nonRecommendedReason");
    expect(within(drawer).queryByRole("heading", { name: "Required approvals" })).not.toBeInTheDocument();
    await waitFor(() => expect(submitRequests).toHaveLength(1));
    expect(submitRequests[0]).toMatchObject({ expectedVersion: 4, autoIssueOnApproval: true });
    expect(await within(drawer).findByText("Awaiting Procurement.")).toBeVisible();
    expect(within(drawer).queryByRole("button", { name: "Retry issue and lock" })).not.toBeInTheDocument();
  });

  it.each([
    { label: "blocked automatic issue when the response is lost", issueBlocker: { code: "SOURCE_CHANGED", message: "Approved source changed. Review the order before retrying." }, failureMode: "lost" },
    { label: "legacy ready award after an uncommitted error", issueBlocker: null, failureMode: "uncommitted" }
  ])("offers a controlled issue retry for $label", async ({ issueBlocker, failureMode }) => {
    const currentBid = rows[0]!;
    const currentMilestones = milestones.map((milestone) => ({ ...milestone,
      amountPaise: Math.round(currentBid.quoteGrossPaise * milestone.basisPoints / 10000) }));
    let savedAward: BasketAward = { id: "award-one", enquiryId: enquiry.id, projectId: "project-one",
      mainBasketId: "basket-one", version: 4, status: "ready_to_issue", requiresRevision: false,
      withdrawal: null, vendorId: "vendor-one", bidId: "bid-one", proposalRevisionId: "proposal-one",
      issuedPurchaseOrderId: null, lines: currentBid.lines, issueBlocker,
      proposal: { revision: 1, proposalDigest: digest, boqRevisionId: "boq-revision-one", bidId: "bid-one",
        vendorId: "vendor-one", vendorName: "Sharma Interiors", totals: { netPaise: 5000000, gstPaise: 0, totalPaise: 5000000 },
        approvedEstimatePaise: 7000000, committedNetPaise: 0, terms: "Complete the approved work.", lineTerms,
        advanceBasisPoints: 2000, milestones: currentMilestones, requiredSlots: ["procurement"],
        budgetOverrideRequired: false, recommendedBidId: "bid-one", nonRecommendedReason: null,
        programManagerId: null, designerId: null, officialKpiAssessmentId: "kpi-one", officialKpiAssessmentRevision: 1 },
      approvals: [{ slot: "procurement", actorId: "buyer-one", decision: "approve", reason: null,
        decidedAt: "2026-10-05T00:00:00Z" }] };
    const issueRequests: Array<{ expectedVersion: number; idempotencyKey: string }> = [];
    let awardReads = 0;
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/comparison", () =>
        HttpResponse.json({ data: { enquiryId: enquiry.id, boqRevisionId: "boq-revision-one", boqDigest: digest,
          comparisonDigest: digest, averageBidNetPaise: 5000000, rows: [currentBid], recommendedBidId: "bid-one",
          awardId: "award-one", bidHistory: [], bidHistoryHasMore: false, counteroffers: [], counteroffersHasMore: false } })),
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/awards/award-one", () => {
        awardReads += 1;
        return HttpResponse.json({ data: savedAward });
      }),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/award-preview", () =>
        HttpResponse.json({ data: { bidId: "bid-one", vendorId: "vendor-one", vendorName: "Sharma Interiors",
          totals: { netPaise: 5000000, gstPaise: 0, totalPaise: 5000000 }, milestones: currentMilestones,
          requiredSlots: ["procurement"], budgetOverrideRequired: false, designerOptions: [],
          programManagerId: null, recommendedBidId: "bid-one", lines: currentBid.lines } })),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/awards/award-one/issue", async ({ request }) => {
        issueRequests.push(await request.json() as { expectedVersion: number; idempotencyKey: string });
        if (failureMode === "uncommitted" && issueRequests.length === 1)
          return HttpResponse.json({ error: { code: "ISSUE_UNAVAILABLE", message: "Issue service temporarily unavailable." } }, { status: 503 });
        savedAward = { ...savedAward, status: "issued", version: 5, issueBlocker: null, issuedPurchaseOrderId: "order-one" };
        if (failureMode === "lost") return HttpResponse.error();
        return HttpResponse.json({ data: { awardId: savedAward.id, purchaseOrderId: "order-one",
          orderNumber: "WO-1", status: "issued" } });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<ProcurementBasketComparison projectId="project-one" basketId="basket-one"
      enquiry={{ ...enquiry, awardId: "award-one", status: "award_pending" }} frozen={false} afterChange={async () => {}} />);
    const review = await screen.findByRole("button", { name: "Review saved award" });
    await user.click(review);
    const drawer = await screen.findByRole("dialog", { name: "Award vendor" });
    expect(within(drawer).queryByText(/saved bid is no longer current/u)).not.toBeInTheDocument();
    expect(within(drawer).getAllByText("Approver chips not recorded")).toHaveLength(5);
    expect(within(drawer).queryByRole("button", { name: "Advance Procurement approver" })).not.toBeInTheDocument();
    if (issueBlocker) expect(within(drawer).getByRole("alert")).toHaveTextContent(issueBlocker.message);
    const issue = await within(drawer).findByRole("button", { name: "Retry issue and lock" });
    await waitFor(() => expect(issue).toBeEnabled());
    const readsBeforeIssue = awardReads;
    await user.click(issue);
    await waitFor(() => expect(issueRequests).toHaveLength(1));
    expect(issueRequests[0]).toMatchObject({ expectedVersion: 4 });
    await waitFor(() => expect(awardReads).toBeGreaterThan(readsBeforeIssue));
    if (failureMode === "uncommitted") {
      expect(await within(drawer).findByText("Issue service temporarily unavailable.")).toBeVisible();
      await user.click(within(drawer).getByRole("button", { name: "Retry issue and lock" }));
      await waitFor(() => expect(issueRequests).toHaveLength(2));
      expect(issueRequests[1]).toMatchObject({ expectedVersion: 4, idempotencyKey: issueRequests[0]!.idempotencyKey });
    }
    expect(await within(drawer).findByText("Work order issued and payment schedule locked.")).toBeVisible();
    expect(within(drawer).queryByRole("button", { name: "Retry issue and lock" })).not.toBeInTheDocument();
    expect(within(drawer).queryByText("Issue service temporarily unavailable.")).not.toBeInTheDocument();
  });

  it.each([
    { label: "new low-value award", start: "new", failure: "none", gross: 14160, extraSlot: false },
    { label: "new low-value overbudget award", start: "new", failure: "none", gross: 14160, extraSlot: false },
    { label: "saved draft", start: "draft", failure: "none", gross: 14160, extraSlot: false },
    { label: "rejected revision", start: "rejected", failure: "none", gross: 14160, extraSlot: false },
    { label: "pending Procurement decision retry", start: "pending_approvals", failure: "decision", gross: 14160, extraSlot: false },
    { label: "lost committed decision response", start: "new", failure: "lost", gross: 14160, extraSlot: false },
    { label: "legacy pending award", start: "legacy", failure: "none", gross: 14160, extraSlot: false },
    { label: "exactly ₹50,000", start: "new", failure: "none", gross: 5000000, extraSlot: false },
    { label: "low-value award requiring budget override", start: "new", failure: "none", gross: 14160, extraSlot: true }
  ])("completes the correct action for $label", async ({ label, start, failure, gross, extraSlot }) => {
    const selectedBid = { ...rows[1]!, quoteNetPaise: gross, quoteGstPaise: 0, quoteGrossPaise: gross,
      lines: [{ ...line, unitPricePaise: gross / 2, netPaise: gross, totalPaise: gross }] };
    const paymentRows = milestones.map((row) => ({ ...row, amountPaise: Math.round(gross * row.basisPoints / 10000),
      reviewerSlots: ["procurement" as const] }));
    const requiredSlots: BasketAward["proposal"]["requiredSlots"] = extraSlot ? ["procurement", "budget_override"] : ["procurement"];
    const initialAward: BasketAward = { id: "award-one", enquiryId: enquiry.id, projectId: "project-one", mainBasketId: "basket-one",
      version: 3, status: start === "legacy" ? "pending_approvals" : start, requiresRevision: false, withdrawal: null,
      vendorId: "vendor-two", bidId: "bid-two", proposalRevisionId: "proposal-one", issuedPurchaseOrderId: null,
      autoIssueOnApproval: start !== "legacy", lines: selectedBid.lines, approvals: [],
      proposal: { revision: 1, proposalDigest: digest, boqRevisionId: "boq-revision-one", bidId: "bid-two",
        vendorId: "vendor-two", vendorName: selectedBid.vendorName, totals: { netPaise: gross, gstPaise: 0, totalPaise: gross },
        approvedEstimatePaise: label === "new low-value overbudget award" ? 10000 : 7000000, committedNetPaise: 0, terms: null, advanceBasisPoints: 2000,
        milestones: paymentRows, requiredSlots, budgetOverrideRequired: extraSlot, recommendedBidId: "bid-one",
        nonRecommendedReason: "Historical reason remains recorded.", programManagerId: null, designerId: null,
        officialKpiAssessmentId: "kpi-one", officialKpiAssessmentRevision: 1 } };
    let savedAward: BasketAward | null = start === "new" ? null : initialAward;
    const saves: Record<string, unknown>[] = [];
    const submits: Record<string, unknown>[] = [];
    const decisions: Record<string, unknown>[] = [];
    const issues: Record<string, unknown>[] = [];
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/comparison", () =>
        HttpResponse.json({ data: { enquiryId: enquiry.id, boqRevisionId: "boq-revision-one", boqDigest: digest,
          comparisonDigest: digest, averageBidNetPaise: gross, rows: [selectedBid], recommendedBidId: "bid-one",
          awardId: savedAward?.id ?? null, bidHistory: [], bidHistoryHasMore: false, counteroffers: [], counteroffersHasMore: false } })),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/award-preview", () =>
        HttpResponse.json({ data: { ...initialAward.proposal, designerOptions: [], assignedSiteManager: null,
          assignedDesigner: null, approverBlockers: [], lines: selectedBid.lines } })),
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/awards/award-one", () => HttpResponse.json({ data: savedAward })),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/awards", async ({ request }) => {
        saves.push(await request.json() as Record<string, unknown>);
        savedAward = { ...initialAward, status: "draft", version: 1 };
        return HttpResponse.json({ data: savedAward });
      }),
      http.put("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/awards/award-one", async ({ request }) => {
        saves.push(await request.json() as Record<string, unknown>);
        savedAward = { ...initialAward, status: "draft", version: 4, proposalRevisionId: "proposal-two",
          proposal: { ...initialAward.proposal, revision: 2 } };
        return HttpResponse.json({ data: savedAward });
      }),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/awards/award-one/submit", async ({ request }) => {
        submits.push(await request.json() as Record<string, unknown>);
        savedAward = { ...savedAward!, status: "pending_approvals", version: savedAward!.version + 1, autoIssueOnApproval: true };
        return HttpResponse.json({ data: savedAward });
      }),
      http.post("/api/v1/work-order-approvals/award-one/decision", async ({ request }) => {
        decisions.push(await request.json() as Record<string, unknown>);
        if (failure === "decision" && decisions.length === 1)
          return HttpResponse.json({ error: { code: "TEMPORARY_FAILURE", message: "Approval service unavailable. Please retry." } }, { status: 503 });
        savedAward = { ...savedAward!, version: savedAward!.version + 1, status: start === "legacy" ? "ready_to_issue" : "issued",
          issuedPurchaseOrderId: start === "legacy" ? null : "order-one", approvals: [{ slot: "procurement", actorId: "buyer-one",
            decision: "approve", reason: null, decidedAt: "2026-10-06T00:00:00Z" }] };
        return failure === "lost" ? HttpResponse.error() : HttpResponse.json({ data: savedAward });
      }),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/awards/award-one/issue", async ({ request }) => {
        issues.push(await request.json() as Record<string, unknown>);
        savedAward = { ...savedAward!, version: savedAward!.version + 1, status: "issued", issuedPurchaseOrderId: "order-one" };
        return HttpResponse.json({ data: { awardId: "award-one", purchaseOrderId: "order-one", orderNumber: "WO-1", status: "issued" } });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<ProcurementBasketComparison projectId="project-one" basketId="basket-one" enquiry={enquiry}
      frozen={false} afterChange={async () => {}} />);
    await user.click(await screen.findByRole("button", { name: start === "new" ? "Award" : "Review saved award" }));
    const drawer = await screen.findByRole("dialog", { name: "Award vendor" });
    expect(within(drawer).queryByLabelText(/Reason for/u)).not.toBeInTheDocument();
    expect(within(drawer).queryByText(/Frozen quotation/u)).not.toBeInTheDocument();
    const direct = gross < 5000000 && !extraSlot;
    const action = within(drawer).getByRole("button", { name: direct ? "Issue work order & lock payment" : "Send for approvals" });
    await waitFor(() => expect(action).toBeEnabled());
    if (extraSlot) expect(within(drawer).getByText(/Super Admin budget override approval is required/u)).toBeVisible();
    await user.click(action);
    if (failure === "decision") {
      expect(await within(drawer).findByText("Approval service unavailable. Please retry.")).toBeVisible();
      const retry = within(drawer).getByRole("button", { name: "Issue work order & lock payment" });
      await waitFor(() => expect(retry).toBeEnabled());
      await user.click(retry);
    }
    expect(await within(drawer).findByText(direct ? "Work order issued and payment schedule locked." :
      extraSlot ? "Awaiting Procurement, Super Admin budget override." : "Awaiting Procurement.")).toBeVisible();
    expect(saves).toHaveLength(start === "new" || start === "rejected" ? 1 : 0);
    saves.forEach((request) => expect(request).not.toHaveProperty("nonRecommendedReason"));
    expect(submits).toHaveLength(["pending_approvals", "legacy"].includes(start) ? 0 : 1);
    submits.forEach((request) => expect(request).toMatchObject({ autoIssueOnApproval: true }));
    expect(decisions).toHaveLength(direct ? failure === "decision" ? 2 : 1 : 0);
    if (direct) expect(decisions[0]).toMatchObject({ slot: "procurement", decision: "approve",
      proposalRevisionId: start === "rejected" ? "proposal-two" : "proposal-one",
      expectedVersion: start === "new" ? 2 : start === "rejected" ? 5 : start === "draft" ? 4 : 3 });
    if (failure === "decision") expect(decisions[1]).toEqual(decisions[0]);
    expect(issues).toHaveLength(start === "legacy" ? 1 : 0);
    if (start === "new" && direct && failure === "none")
      expect((await axe.run(drawer, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });

  it("withdraws a pending award even when stale preparation blocks bid comparison", async () => {
    const withdrawalRequests: unknown[] = [];
    let savedAward: BasketAward = {
      id: "award-one", enquiryId: enquiry.id, projectId: "project-one", mainBasketId: "basket-one", version: 3,
      status: "ready_to_issue", requiresRevision: false, withdrawal: null, vendorId: "vendor-one", bidId: "bid-one",
      proposalRevisionId: "proposal-one", issuedPurchaseOrderId: null, lines: rows[0]!.lines,
      proposal: { revision: 1, proposalDigest: digest, boqRevisionId: "boq-revision-one", bidId: "bid-one", vendorId: "vendor-one",
        vendorName: "Sharma Interiors", totals: { netPaise: 5000000, gstPaise: 0, totalPaise: 5000000 },
        approvedEstimatePaise: 6000000, committedNetPaise: 0, terms: "Complete the approved BOQ.", lineTerms, advanceBasisPoints: 2000,
        milestones: [...milestones], requiredSlots: ["procurement"], budgetOverrideRequired: false,
        recommendedBidId: "bid-one", nonRecommendedReason: null, programManagerId: null, designerId: null,
        officialKpiAssessmentId: "kpi-one", officialKpiAssessmentRevision: 1 },
      approvals: [{ slot: "procurement", actorId: "buyer-one", decision: "approve", reason: null, decidedAt: "2026-10-05T00:00:00Z" }]
    };
    server.use(
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/comparison", () => HttpResponse.json({ error: { code: "PROCUREMENT_BASKET_PREPARATION_CONFLICT", message: "The saved BOQ preparation changed." } }, { status: 409 })),
      http.get("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/awards/award-one", () => HttpResponse.json({ data: savedAward })),
      http.post("/api/v1/procurement/projects/project-one/baskets/basket-one/enquiries/enquiry-one/awards/award-one/withdraw", async ({ request }) => {
        withdrawalRequests.push(await request.json());
        savedAward = { ...savedAward, version: 4, status: "draft", requiresRevision: true,
          proposalRevisionId: "withdrawal-proposal", approvals: [],
          withdrawal: { priorProposalRevisionId: "proposal-one", reason: "Approved basket mode changed.",
            withdrawnAt: "2026-10-05T00:00:00Z", withdrawnById: "buyer-one" },
          proposal: { ...savedAward.proposal, revision: 2 } };
        return HttpResponse.json({ data: savedAward });
      })
    );
    const user = userEvent.setup();
    renderWithQuery(<ProcurementBasketComparison projectId="project-one" basketId="basket-one"
      enquiry={{ ...enquiry, status: "award_pending", awardId: "award-one" }} frozen={false} afterChange={async () => {}} />);
    const recovery = await screen.findByRole("region", { name: "Award recovery" });
    await user.click(await within(recovery).findByRole("button", { name: "Withdraw award to revise BOQ" }));
    expect(within(recovery).getByRole("button", { name: "Confirm withdrawal" })).toBeDisabled();
    await user.type(within(recovery).getByRole("textbox", { name: "Withdrawal reason" }), "Approved basket mode changed.");
    await user.click(within(recovery).getByRole("button", { name: "Confirm withdrawal" }));
    await waitFor(() => expect(withdrawalRequests).toHaveLength(1));
    expect(withdrawalRequests[0]).toMatchObject({ expectedVersion: 3, reason: "Approved basket mode changed." });
    expect(await within(recovery).findByText(/award was withdrawn/u)).toBeVisible();
    expect(within(recovery).queryByRole("button", { name: "Withdraw award to revise BOQ" })).not.toBeInTheDocument();
  });
});
