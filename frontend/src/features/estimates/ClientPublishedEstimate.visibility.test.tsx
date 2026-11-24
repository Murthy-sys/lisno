import userEvent from "@testing-library/user-event";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithQuery } from "../../test/render";
import { ClientPublishedEstimate } from "./ClientPublishedEstimate";
import { ClientQuotationSubmittedView } from "../client/ClientQuotationSubmittedView";
import type { EstimateQueueItem } from "./estimateWorkflowApi";
import { componentPricingFixture } from "../leads/estimateComponentPricing.testFixtures";
import { toEstimateAggregatePricing } from "../../../../shared/estimation/estimateAggregatePricing";

function projectedEstimate(showLine: boolean): EstimateQueueItem {
  return {
    id: "estimate-visibility", version: 2, propertyType: "Villa", rooms: [], scopes: [],
    lineItems: [], subtotal: 350, gst: 63, total: 413, status: "sent_to_client", approvalRequired: false,
    lead: { _id: "lead-visibility", clientName: "Sample client", projectName: "Sample home", location: "Pune" },
    publishedReview: {
      id: "round-visibility", version: 1, estimateVersion: 2, sendGeneration: 1, status: "pending",
      submittedAt: "2026-10-26T08:00:00.000Z", decidedAt: null, decisionNote: null, canDecide: true,
      snapshot: {
        clientName: "Sample client", projectName: "Sample home", location: "Pune", propertyType: "Villa",
        lineItems: showLine ? [{ id: "visible-line", source: "configuration", catalogueId: "paint", mainBasketId: "painting",
          mainBasketName: "Painting", subBasketId: "wall", subBasketName: "Wall finishes", mainLineName: "Wall painting",
          roomName: "Living room", specification: null, unit: "sq ft", rate: 100, ratePaise: 10000,
          quantity: 1, included: true, amount: 100, amountPaise: 10000 }] : [],
        subtotal: 350, gst: 63, total: 413, subtotalPaise: 35000, gstPaise: 6300, totalPaise: 41300
      }
    }
  };
}

describe("client screen visibility projection", () => {
  it("displays the immutable aggregate price without stale component details or a missing-rate warning", () => {
    const estimate = projectedEstimate(true);
    const evidence = componentPricingFixture("paint");
    Object.assign(estimate.publishedReview!.snapshot.lineItems[0]!, { mainLineId: "paint", pricingMode: "in_house", modeTier: "signature",
      rateSource: "configuration", pricingBasis: evidence.formulaVersion, aggregatePricing: toEstimateAggregatePricing(evidence), componentPricing: evidence,
      rate: null, ratePaise: null, quantity: 2, amount: 783.33, amountPaise: 78333 });
    renderWithQuery(<ClientPublishedEstimate estimate={estimate} />);
    expect(screen.getByText("Price including margin")).toBeVisible();
    expect(screen.getByText("2 sq ft · ₹783.33")).toBeVisible();
    expect(screen.queryByText(/Rate unavailable|Component selling amounts|Finishes/)).not.toBeInTheDocument();
  });

  it("shows the submitted rounding adjustment alongside the saved GST without changing line amounts", () => {
    const estimate = projectedEstimate(true);
    Object.assign(estimate.publishedReview!.snapshot, { subtotal: 86.64, subtotalPaise: 8664, gst: 15.6, gstPaise: 1560,
      total: 102, totalPaise: 10200, roundOffPaise: -24 });
    renderWithQuery(<ClientQuotationSubmittedView estimate={estimate} workspace={false} canDecide={false}
      refreshing={false} onEdit={() => {}} onRefresh={async () => true} />);
    expect(screen.getByText("Submitted total including GST").nextElementSibling).toHaveTextContent("₹102");
    expect(screen.getByText("GST").nextElementSibling).toHaveTextContent("₹15.6");
    expect(screen.getByText("Round off").nextElementSibling).toHaveTextContent("−₹0.24");
    expect(screen.getByText("Rate").nextElementSibling).toHaveTextContent("₹100.00");
  });
  it.each([undefined, 48])("preserves published totals and only displays recorded round off (%s)", roundOffPaise => {
    const estimate = projectedEstimate(true);
    Object.assign(estimate.publishedReview!.snapshot, {
      subtotal: 86.88, subtotalPaise: 8688, gst: 15.64, gstPaise: 1564,
      total: roundOffPaise === undefined ? 102.52 : 103,
      totalPaise: roundOffPaise === undefined ? 10252 : 10300,
      ...(roundOffPaise === undefined ? {} : { roundOffPaise })
    });
    renderWithQuery(<ClientPublishedEstimate estimate={estimate} />);
    expect(screen.getByText(roundOffPaise === undefined ? "₹102.52" : "₹103")).toBeVisible();
    expect(screen.getByText("₹15.64")).toBeVisible();
    expect(screen.getByText("1 sq ft × ₹100")).toBeVisible();
    if (roundOffPaise === undefined) expect(screen.queryByText("Round off")).not.toBeInTheDocument();
    else expect(screen.getByText("+₹0.48")).toBeVisible();
  });
  it("displays a frozen component amount with no rate and does not use working values", () => {
    const estimate = projectedEstimate(true);
    const line = estimate.publishedReview!.snapshot.lineItems[0]!;
    Object.assign(line, { pricingMode: "in_house", rateSource: "configuration", pricingBasis: "in_house_components_v1",
      rate: null, ratePaise: null, quantity: 2, amount: 783.33, amountPaise: 78333, componentPricing: componentPricingFixture() });
    estimate.lineItems = [{ ...line, rate: 5, ratePaise: 500, amount: 10, amountPaise: 1000 }] as EstimateQueueItem["lineItems"];
    renderWithQuery(<ClientPublishedEstimate estimate={estimate} />);
    expect(screen.getByText("2 sq ft × Calculated from components")).toBeVisible();
    expect(screen.getByText("Component selling amounts for Wall painting · ₹783.33 before GST")).toBeVisible();
    expect(screen.queryByText(/Rate unavailable/)).not.toBeInTheDocument();
  });

  it("labels the frozen tier without repricing from the working estimate", () => {
    const estimate = projectedEstimate(true);
    estimate.publishedReview!.snapshot.lineItems[0]!.modeTier = "premium";
    estimate.lineItems = [{ ...estimate.publishedReview!.snapshot.lineItems[0]!, modeTier: "functional", rate: 1, ratePaise: 100, amount: 1, amountPaise: 100 }] as EstimateQueueItem["lineItems"];
    renderWithQuery(<ClientPublishedEstimate estimate={estimate} />);
    expect(screen.getByText("Configuration tier: Premium")).toBeVisible();
    expect(screen.queryByText("Configuration tier: Functional")).not.toBeInTheDocument();
    expect(screen.getByText("1 sq ft × ₹100")).toBeVisible();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("keeps the published total when the server sends only part of the quotation breakdown", () => {
    renderWithQuery(<ClientPublishedEstimate estimate={projectedEstimate(true)} />);
    const review = screen.getByRole("region", { name: "Submitted estimate" });
    expect(within(review).getByText("Wall painting")).toBeVisible();
    expect(within(review).getByText("1 item shown · GST included")).toBeVisible();
    expect(within(review).getByText("₹350")).toBeVisible();
    expect(within(review).getByText("₹413")).toBeVisible();
    expect(within(review).getByRole("button", { name: "Approve estimate" })).toBeEnabled();
  });

  it("keeps totals and approval available when every line is omitted from the screen", () => {
    renderWithQuery(<ClientPublishedEstimate estimate={projectedEstimate(false)} />);
    expect(screen.getByText("No item details are available for this quotation.")).toBeVisible();
    expect(screen.getByText("GST included")).toBeVisible();
    expect(screen.queryByText(/0 items/)).not.toBeInTheDocument();
    expect(screen.getByText("₹350")).toBeVisible();
    expect(screen.getByText("₹413")).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve estimate" })).toBeEnabled();
  });
});

it("distinguishes the v3 quotation approval from the later drawing approval", () => {
  const estimate = projectedEstimate(true);
  estimate.workflowVersion = 3;
  estimate.publishedReview = { ...estimate.publishedReview!, workflowVersion: 3, phase: "post", status: "approved", canDecide: false };
  estimate.preApprovedReview = { reviewRoundId: "initial-round", estimateVersion: 1, snapshot: estimate.publishedReview.snapshot };
  estimate.changesFromPre = { addedLineIds: [], removedLineIds: [], changedLineIds: [], scopeChanged: false, noChanges: true, beforeTotal: 413, afterTotal: 413 };
  renderWithQuery(<ClientPublishedEstimate estimate={estimate} />);
  expect(screen.getByText("Post-design approval: Designer-revised quotation")).toBeVisible();
  expect(screen.getByText("Your revised quotation approval is recorded. Design work can continue.")).toBeVisible();
  expect(screen.queryByText(/Design and procurement preparation can continue/)).not.toBeInTheDocument();
});

it("explains that initial approval remains current until a material revision", () => {
  const estimate = projectedEstimate(true);
  estimate.workflowVersion = 3;
  estimate.status = "client_approved";
  estimate.publishedReview = { ...estimate.publishedReview!, workflowVersion: 3, phase: "pre", status: "approved", canDecide: false };
  renderWithQuery(<ClientPublishedEstimate estimate={estimate} />);
  expect(screen.getByText(/Your approval remains current while the quotation is unchanged/)).toBeVisible();
  expect(screen.queryByText(/before design tasks begin/)).not.toBeInTheDocument();
});

it("does not expose a post-quotation decision while the unchanged initial approval is current", () => {
  const estimate = projectedEstimate(true);
  estimate.workflowVersion = 3;
  estimate.publishedReview = { ...estimate.publishedReview!, workflowVersion: 3, phase: "post" };
  estimate.preApprovedReview = { reviewRoundId: "initial-round", estimateVersion: 1, snapshot: estimate.publishedReview.snapshot };
  estimate.changesFromPre = { addedLineIds: ["visible-line"], removedLineIds: [], changedLineIds: [], scopeChanged: false, noChanges: false, beforeTotal: 300, afterTotal: 413 };
  estimate.quotationApprovalState = "initial_current";
  estimate.currentQuotationApproved = true;
  estimate.requiresClientReapproval = false;
  estimate.quotationApprovalSource = "initial_unchanged";
  estimate.currentQuotationApproval = { kind: "initial_unchanged", reviewRoundId: "initial-round", estimateVersion: 1, approvedAt: "2026-11-04T08:00:00.000Z" };
  renderWithQuery(<ClientPublishedEstimate estimate={estimate} />);
  expect(screen.getByText("Review status unavailable")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Approve designer-revised quotation" })).not.toBeInTheDocument();
});

it("displays recorded dimensions from the frozen snapshot without adopting working measurements", () => {
  const estimate = projectedEstimate(true);
  Object.assign(estimate.publishedReview!.snapshot.lineItems[0]!, { dimensionsMandatory: true, dimensions: { length: "2", width: "3", height: "4" },
    dimensionRule: { formula: "length_width", inputUnit: "ft", quantityUnit: "sq_ft", uomId: "unit", decimalScale: 2 } });
  estimate.lineItems = [{ ...estimate.publishedReview!.snapshot.lineItems[0]!, dimensions: { length: "9", width: "9", height: "9" } }] as EstimateQueueItem["lineItems"];
  renderWithQuery(<ClientPublishedEstimate estimate={estimate} />);
  expect(screen.getByText("Dimensions: 2 × 3 × 4 ft (L × W × H) · Quantity = L × W")).toBeVisible();
  expect(screen.queryByText(/9 × 9 × 9/)).not.toBeInTheDocument();
});

function splitEstimate(otherWorkPayablePaise = 29500): EstimateQueueItem {
  const estimate = projectedEstimate(true);
  const snapshot = estimate.publishedReview!.snapshot;
  const subtotalPaise = 10000 + (otherWorkPayablePaise ? 25000 : 0);
  Object.assign(snapshot, {
    subtotalPaise, gstPaise: subtotalPaise * 0.18, totalPaise: subtotalPaise * 1.18,
    subtotal: subtotalPaise / 100, gst: subtotalPaise * 0.18 / 100, total: subtotalPaise * 1.18 / 100,
    pmcPaymentSummary: { version: 1, vendorPayablePaise: 11800, lisnoPayablePaise: 2950,
      pmcTotalPayablePaise: 14750, otherWorkPayablePaise, roundOffPaise: 0,
      customerTotalPayablePaise: 14750 + otherWorkPayablePaise, nonPmcMilestoneBasisPaise: otherWorkPayablePaise }
  });
  Object.assign(snapshot.lineItems[0]!, { pricingMode: "pmc", pmcVendorPayable: true,
    pmcPaymentSplit: { version: 1, marginBps: 2000, vendorAmountPaise: 10000, lisnoAmountPaise: 2500,
      estimatedValuePaise: 12500, vendorPayablePaise: 11800, lisnoPayablePaise: 2950,
      totalPayablePaise: 14750, taxBasis: { subtotalPaise, gstPaise: subtotalPaise * 0.18 } } });
  return estimate;
}

it.each([0, 29500])("shows the frozen PMC obligation and recipients in approval confirmation, other work %s", async otherWork => {
  const estimate = splitEstimate(otherWork);
  renderWithQuery(<ClientPublishedEstimate estimate={estimate} />);
  expect(screen.getByText("PMC payable to Lisno").nextElementSibling).toHaveTextContent("₹29.5");
  expect(screen.getByText("PMC payable to vendors").nextElementSibling).toHaveTextContent("₹118");
  expect(screen.getByText("Payable to Lisno · 20% of estimated value before tax").nextElementSibling).toHaveTextContent("₹29.5");
  expect(screen.getByText("Total including GST").nextElementSibling).toHaveTextContent(otherWork ? "₹442.5" : "₹147.5");
  await userEvent.click(screen.getByRole("button", { name: "Approve estimate" }));
  const dialog = within(screen.getByRole("dialog"));
  expect(dialog.getByText("Total including GST").nextElementSibling).toHaveTextContent(otherWork ? "₹442.5" : "₹147.5");
  expect(dialog.getByText("PMC payable to Lisno").nextElementSibling).toHaveTextContent("₹29.5");
  expect(dialog.getByRole("button", { name: "Confirm approval" })).toBeEnabled();
});

it("retains authorized PMC recipient totals when all item details are hidden", () => {
  const estimate = splitEstimate();
  estimate.publishedReview!.snapshot.lineItems = [];
  renderWithQuery(<ClientQuotationSubmittedView estimate={estimate} workspace={false} canDecide refreshing={false}
    onEdit={() => {}} onRefresh={async () => true} />);
  expect(screen.getByText("Submitted total including GST").nextElementSibling).toHaveTextContent("₹442.5");
  expect(screen.getByText("PMC payable to Lisno").nextElementSibling).toHaveTextContent("₹29.5");
  expect(screen.queryByText("Wall painting")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Approve quotation" })).toBeEnabled();
});

it.each(["malformed-summary", "missing-summary", "missing-split"])("does not approve a vendor-only fallback for %s", condition => {
  const estimate = splitEstimate();
  const snapshot = estimate.publishedReview!.snapshot;
  if (condition === "malformed-summary") snapshot.pmcPaymentSummary!.customerTotalPayablePaise = 1;
  if (condition === "missing-summary") delete snapshot.pmcPaymentSummary;
  if (condition === "missing-split") delete snapshot.lineItems[0]!.pmcPaymentSplit;
  renderWithQuery(<ClientPublishedEstimate estimate={estimate} />);
  expect(screen.getByText("Total including GST").nextElementSibling).toHaveTextContent("Estimate unavailable");
  expect(screen.queryByRole("button", { name: "Approve estimate" })).not.toBeInTheDocument();
});

it("keeps a legacy approved amount separate from a later split-bearing revision", () => {
  const estimate = splitEstimate();
  estimate.publishedReview!.phase = "post";
  estimate.preApprovedReview = { reviewRoundId: "historic-round", estimateVersion: 1, snapshot: projectedEstimate(false).publishedReview!.snapshot };
  estimate.changesFromPre = { addedLineIds: [], removedLineIds: [], changedLineIds: ["visible-line"], scopeChanged: false, noChanges: false, beforeTotal: 413, afterTotal: 442.5 };
  renderWithQuery(<ClientPublishedEstimate estimate={estimate} />);
  expect(screen.getByText("Pre-estimate ₹413 · Final submitted estimate ₹442.5")).toBeVisible();
  expect(within(screen.getByLabelText("Changes from pre-estimate")).getByText("₹413")).toBeInTheDocument();
});
