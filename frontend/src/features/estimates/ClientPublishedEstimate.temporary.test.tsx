import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithQuery } from "../../test/render";
import { ClientPublishedEstimate } from "./ClientPublishedEstimate";
import type { EstimateQueueItem } from "./estimateWorkflowApi";

describe("published temporary estimate items", () => {
  it("shows actual basket parentage and immutable paise amounts without a fictitious Sub Basket", () => {
    const estimate: EstimateQueueItem = {
      id: "estimate-1", version: 3, propertyType: "Villa", rooms: [], scopes: [], selectedMainBasketIds: ["basket-paint"],
      lineItems: [], subtotal: 102.06, gst: 18.37, total: 120.43, status: "sent_to_client", approvalRequired: false,
      lead: { _id: "lead-1", clientName: "Asha", projectName: "Asha home", location: "Pune" },
      publishedReview: {
        id: "round-1", version: 1, estimateVersion: 3, sendGeneration: 1, status: "pending", submittedAt: "2026-10-01T08:00:00.000Z", decidedAt: null, decisionNote: null, canDecide: false,
        snapshot: {
          clientName: "Asha", projectName: "Asha home", location: "Pune", propertyType: "Villa", selectedMainBasketIds: ["basket-paint"],
          lineItems: [
            { id: "line-direct", source: "configuration", itemType: "temporary", catalogueId: "temporary-direct", mainBasketId: "basket-paint", mainBasketName: "Painting", subBasketId: null, subBasketName: null, mainLineId: "temporary-direct", mainLineName: "Site protection", roomId: "room-1", roomName: "Living room", specification: null, unit: "sq ft", uomName: "sq ft", rate: 80.05, ratePaise: 8005, quantity: 1.25, included: true, amount: 100.06, amountPaise: 10006 },
            { id: "line-grouped", source: "configuration", itemType: "temporary", catalogueId: "temporary-grouped", mainBasketId: "basket-paint", mainBasketName: "Painting", subBasketId: "sub-paint", subBasketName: "Decorative paints", mainLineId: "temporary-grouped", mainLineName: "Finish sample", roomId: "room-1", roomName: "Living room", specification: null, unit: "each", uomName: "each", rate: 2, ratePaise: 200, quantity: 1, included: true, amount: 2, amountPaise: 200 }
          ],
          subtotal: 102.06, gst: 18.37, total: 120.43, subtotalPaise: 10206, gstPaise: 1837, totalPaise: 12043
        }
      }
    };
    renderWithQuery(<ClientPublishedEstimate estimate={estimate} />);
    const review = screen.getByRole("region", { name: "Submitted estimate" });
    expect(within(review).getByText("Painting")).toBeVisible();
    expect(within(review).getByText("Site protection")).toBeVisible();
    expect(within(review).getByText("Finish sample")).toBeVisible();
    expect(within(review).getByText("Painting · Temporary item · Living room")).toBeVisible();
    expect(within(review).getByText("Decorative paints · Temporary item · Living room")).toBeVisible();
    expect(within(review).queryByText(/Sub Basket/)).not.toBeInTheDocument();
    expect(within(review).getByText("₹120.43")).toBeVisible();
  });
});
