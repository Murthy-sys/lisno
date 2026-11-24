import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

import type { EstimateClientReviewSnapshot } from "../../api/types";
import { FeedbackProvider } from "../../components/feedback/FeedbackProvider";
import type { EstimateQueueItem } from "../estimates/estimateWorkflowApi";
import { ClientQuotationSubmittedView } from "./ClientQuotationSubmittedView";

type Snapshot = EstimateClientReviewSnapshot;
type Line = Snapshot["lineItems"][number];
const line = (overrides: Partial<Line> = {}): Line => ({
  id: "ceiling", source: "configuration", catalogueId: "ceiling", mainLineId: "ceiling", mainLineName: "POP false ceiling",
  roomId: "living", roomName: "Living & Dining", mainBasketId: "gypsum", mainBasketName: "POP / Gypsum",
  subBasketId: "ceiling-group", subBasketName: "Ceiling", quantity: 1, unit: "sq-ft", rate: 360, ratePaise: 36000,
  amount: 360, amountPaise: 36000, included: true, specification: null, modeTier: "functional", ...overrides
});
function quotation(): EstimateQueueItem {
  return {
    id: "estimate-ceiling", projectId: "project-ceiling", version: 1, workflowVersion: 3, propertyType: "Villa", rooms: [], scopes: [],
    lineItems: [], subtotal: 10, gst: 1.8, total: 12, status: "sent_to_client", approvalRequired: false,
    lead: { _id: "lead-ceiling", clientName: "Synthetic client", projectName: "Cedar residence", location: "Pune" },
    publishedReview: {
      id: "round-ceiling", version: 1, estimateVersion: 1, sendGeneration: 1, workflowVersion: 3, phase: "pre", status: "pending",
      submittedAt: "2026-11-24T08:00:00.000Z", decidedAt: null, decisionNote: null, canDecide: true,
      snapshot: { clientName: "Synthetic client", projectName: "Cedar residence", propertyType: "Villa", location: "Pune",
        lineItems: [line()], subtotal: 360, gst: 64.8, total: 425,
        subtotalPaise: 36000, gstPaise: 6480, roundOffPaise: 20, totalPaise: 42500 }
    }
  };
}
function pmcQuotation(mixed: boolean, margin: 10 | 20 = 20): EstimateQueueItem {
  const estimate = quotation();
  // Explicit saved commercial evidence, using unequal vendor/Lisno values.
  const vendorAmountPaise = margin === 20 ? 10000 : 9000;
  const lisnoAmountPaise = margin === 20 ? 2500 : 1000;
  const vendorPayablePaise = margin === 20 ? 11800 : 10620;
  const lisnoPayablePaise = margin === 20 ? 2950 : 1180;
  const totalPayablePaise = margin === 20 ? 14750 : 11800;
  const subtotalPaise = margin === 20 ? mixed ? 35000 : 10000 : mixed ? 34000 : 9000;
  const gstPaise = margin === 20 ? mixed ? 6300 : 1800 : mixed ? 6120 : 1620;
  const totalPaise = margin === 20 ? mixed ? 41300 : 11800 : mixed ? 40120 : 10620;
  const snapshot = estimate.publishedReview!.snapshot;
  Object.assign(snapshot, {
    subtotalPaise, gstPaise, totalPaise, roundOffPaise: 0,
    subtotal: subtotalPaise / 100, gst: gstPaise / 100, total: totalPaise / 100,
    lineItems: [line({ pricingMode: "pmc", pmcVendorPayable: true, amountPaise: vendorAmountPaise, amount: vendorAmountPaise / 100,
      ratePaise: vendorAmountPaise, rate: vendorAmountPaise / 100,
      pmcPaymentSplit: { version: 1, marginBps: margin * 100, vendorAmountPaise, lisnoAmountPaise,
        estimatedValuePaise: margin === 20 ? 12500 : 10000, vendorPayablePaise, lisnoPayablePaise, totalPayablePaise,
        taxBasis: { subtotalPaise, gstPaise } } }),
      ...(mixed ? [line({ id: "paint", mainLineId: "paint", mainLineName: "Wall paint", amountPaise: 25000, amount: 250, pricingMode: "sub_vendor" })] : [])],
    pmcPaymentSummary: { version: 1, vendorPayablePaise, lisnoPayablePaise, pmcTotalPayablePaise: totalPayablePaise,
      otherWorkPayablePaise: mixed ? 29500 : 0, nonPmcMilestoneBasisPaise: mixed ? 29500 : 0, roundOffPaise: 0,
      customerTotalPayablePaise: margin === 20 ? mixed ? 44250 : 14750 : mixed ? 41300 : 11800 }
  });
  return estimate;
}
function setup(estimate = quotation(), options: { canDecide?: boolean; workspace?: boolean; refreshing?: boolean } = {}) {
  const props = { estimate, canDecide: true, workspace: false, refreshing: false, onEdit: vi.fn(), onRefresh: vi.fn(async () => true), ...options };
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}><FeedbackProvider>{children}</FeedbackProvider></QueryClientProvider>;
  const view = render(<ClientQuotationSubmittedView {...props} />, { wrapper });
  return { ...view, props, rerenderQuotation: (next: EstimateQueueItem) => view.rerender(<ClientQuotationSubmittedView {...props} estimate={next} />) };
}
const summary = () => screen.getByRole("region", { name: "Price summary" });
function expectTotal(value: string) {
  expect(within(summary()).getByText("Total payable inclusive of all charges").nextElementSibling?.textContent).toBe(value);
  expect(summary().querySelectorAll("dd")).toHaveLength(1);
  expect(within(summary()).queryByText(/Submitted subtotal|^GST$|^Round off$|PMC payable to|Total PMC estimated value|Other work including GST/)).not.toBeInTheDocument();
  expect(screen.getByText("Submitted total including GST").nextElementSibling?.textContent).toBe(value);
}

describe("Submitted quotation price summary", () => {
  it("shows only the saved total including GST and round-off beside approval using two decimal places", () => {
    setup();
    expectTotal("₹425.00");
    expect(summary().compareDocumentPosition(screen.getByRole("button", { name: "Approve quotation" })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("button", { name: "View quotation PDF" })).toBeEnabled();
    expect(within(screen.getByRole("article")).getByText("Rate").nextElementSibling).toHaveTextContent("₹360.00");
  });

  it.each([
    { round: -24, subtotal: 8664, gst: 1560, total: 10200, payable: "₹102.00" },
    { round: undefined, subtotal: 8664, gst: 1560, total: 10224, payable: "₹102.24" },
    { round: 0, subtotal: 0, gst: 0, total: 0, payable: "₹0.00" }
  ])("preserves the recorded round-off $round without changing the submitted total", ({ round, subtotal, gst, total, payable }) => {
    const estimate = quotation();
    Object.assign(estimate.publishedReview!.snapshot, { subtotalPaise: subtotal, gstPaise: gst, totalPaise: total, roundOffPaise: round });
    setup(estimate);
    expectTotal(payable);
    expect(within(summary()).queryByText("Round off")).not.toBeInTheDocument();
  });

  it("uses recorded paise ahead of working and legacy amounts", () => {
    const estimate = quotation();
    Object.assign(estimate.publishedReview!.snapshot, { subtotal: 999, gst: 999, total: 999 });
    setup(estimate);
    expectTotal("₹425.00");
    expect(summary()).not.toHaveTextContent("999");
  });

  it("reads historical rupee-only prices without fabricating a new round-off", () => {
    const estimate = quotation();
    const snapshot = estimate.publishedReview!.snapshot;
    delete snapshot.subtotalPaise; delete snapshot.gstPaise; delete snapshot.totalPaise; delete snapshot.roundOffPaise;
    Object.assign(snapshot, { subtotal: 123.45, gst: 22.22, total: 145.67 });
    setup(estimate);
    expectTotal("₹145.67");
    expect(within(summary()).queryByText("Round off")).not.toBeInTheDocument();
  });

  it.each([null, NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1])("does not fall back from invalid authoritative paise (%s) to old rupees or zero", invalid => {
    const estimate = quotation();
    Object.assign(estimate.publishedReview!.snapshot, { totalPaise: invalid });
    setup(estimate);
    expectTotal("Estimate unavailable");
    expect(summary()).not.toHaveTextContent(/₹0\.00|₹360|₹64|₹425|NaN|Infinity/);
    expect(screen.queryByRole("button", { name: "Approve quotation" })).not.toBeInTheDocument();
  });

  it.each([null, undefined, NaN])("does not invent missing or invalid legacy monetary values (%s)", invalid => {
    const estimate = quotation();
    const snapshot = estimate.publishedReview!.snapshot;
    delete snapshot.totalPaise;
    Object.assign(snapshot, { total: invalid });
    setup(estimate);
    expectTotal("Estimate unavailable");
  });

  it.each([
    { mixed: false, margin: 20 as const, total: "₹147.50" },
    { mixed: true, margin: 20 as const, total: "₹442.50" },
    { mixed: true, margin: 10 as const, total: "₹413.00" }
  ])("includes the configured $margin% PMC share in the single customer total (mixed=$mixed)", ({ mixed, margin, total }) => {
    setup(pmcQuotation(mixed, margin));
    expect(screen.getByText(`Payable to Lisno · ${margin}% of estimated value before tax`)).toBeVisible();
    expectTotal(total);
    expect(screen.getByRole("button", { name: "Approve quotation" })).toBeEnabled();
  });

  it("retains the full customer total including PMC charges when every item is hidden", () => {
    const estimate = pmcQuotation(true);
    estimate.publishedReview!.snapshot.lineItems = [];
    setup(estimate);
    expectTotal("₹442.50");
    expect(screen.getByText("No visible item details are available in this submitted estimate.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve quotation" })).toBeEnabled();
  });

  it.each(["malformed-summary", "missing-summary", "missing-split"])("keeps an invalid PMC obligation unavailable (%s)", condition => {
    const estimate = pmcQuotation(true);
    const snapshot = estimate.publishedReview!.snapshot;
    if (condition === "malformed-summary") snapshot.pmcPaymentSummary!.customerTotalPayablePaise = 1;
    if (condition === "missing-summary") delete snapshot.pmcPaymentSummary;
    if (condition === "missing-split") delete snapshot.lineItems[0]!.pmcPaymentSplit;
    setup(estimate);
    expectTotal("Estimate unavailable");
    expect(screen.queryByRole("button", { name: "Approve quotation" })).not.toBeInTheDocument();
    expect(within(summary()).queryByText("₹413.00")).not.toBeInTheDocument();
  });

  it("keeps the full saved amount through search, room changes and omitted internal scope", async () => {
    const estimate = quotation();
    estimate.publishedReview!.snapshot.lineItems = [line({ amountPaise: 10000 }),
      line({ id: "kitchen", roomId: "kitchen", roomName: "Kitchen", mainLineName: "Kitchen finish", amountPaise: 20000 }),
      line({ id: "private", mainLineName: "Internal cost", amountPaise: 6000, clientVisible: false })];
    const snapshotBefore = structuredClone(estimate.publishedReview!.snapshot);
    setup(estimate);
    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox", { name: "Search estimate items" }), "not present");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expectTotal("₹425.00");
    await user.clear(screen.getByRole("searchbox", { name: "Search estimate items" }));
    await user.click(within(screen.getByRole("navigation", { name: "Rooms" })).getByRole("button", { name: /Kitchen/ }));
    expect(screen.getByRole("article", { name: "Kitchen finish in Kitchen" })).toBeVisible();
    expectTotal("₹425.00");
    expect(screen.queryByText("Internal cost")).not.toBeInTheDocument();
    expect(estimate.publishedReview!.snapshot).toEqual(snapshotBefore);
  });

  it("replaces both totals when a different project and post-design review is opened", () => {
    const view = setup();
    const next = pmcQuotation(true, 10);
    next.id = "estimate-studio"; next.projectId = "project-studio";
    Object.assign(next.publishedReview!, { id: "round-studio", phase: "post", estimateVersion: 4 });
    next.publishedReview!.snapshot.projectName = "Harbor studio";
    view.rerenderQuotation(next);
    expect(screen.getByRole("heading", { name: "Post-design quotation review" })).toBeVisible();
    expectTotal("₹413.00");
    expect(summary()).not.toHaveTextContent("₹425.00");
  });

  it.each([false, true])("keeps the summary available in the read-only review (workspace=%s)", workspace => {
    setup(quotation(), { workspace, canDecide: false, refreshing: true });
    expectTotal("₹425.00");
    expect(screen.queryByRole("button", { name: "Approve quotation" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh estimate" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "View quotation PDF" })).toBeEnabled();
  });

  it("preserves keyboard navigation, approval confirmation and accessible summary semantics", async () => {
    const { props } = setup();
    const user = userEvent.setup();
    expect((await axe.run(summary(), { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    const approve = screen.getByRole("button", { name: "Approve quotation" });
    approve.focus(); await user.keyboard("{Enter}");
    const dialog = screen.getByRole("dialog", { name: "Approve this pre-design quotation?" });
    expect(within(dialog).getByText("Total including GST").nextElementSibling?.textContent).toBe("₹425");
    expect(within(dialog).getByRole("button", { name: "Confirm approval" })).toBeEnabled();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(approve).toHaveFocus();
    const refresh = screen.getByRole("button", { name: "Refresh available items" });
    refresh.focus(); await user.keyboard("{Enter}");
    expect(props.onRefresh).toHaveBeenCalledOnce();
    const back = screen.getByRole("button", { name: "Back to estimate" });
    back.focus(); await user.keyboard("{Enter}");
    expect(props.onEdit).toHaveBeenCalledOnce();
  });
});
