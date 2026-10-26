import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithQuery } from "../../test/render";
import { ClientPublishedEstimate } from "./ClientPublishedEstimate";
import type { EstimateQueueItem } from "./estimateWorkflowApi";

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
    expect(screen.getByText("View the PDF/quotation for the item breakdown.")).toBeVisible();
    expect(screen.getByText("GST included")).toBeVisible();
    expect(screen.queryByText(/0 items/)).not.toBeInTheDocument();
    expect(screen.getByText("₹350")).toBeVisible();
    expect(screen.getByText("₹413")).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve estimate" })).toBeEnabled();
  });
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
