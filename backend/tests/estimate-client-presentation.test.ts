import { describe, expect, it } from "vitest";
import { presentClientEstimate } from "../src/services/estimate-client-presentation.js";

const actor = { id: "client-a", name: "Client A", email: "a@example.test", role: "client" } as const;
const lead = { _id: "lead-a", projectId: "project-a", clientEmail: actor.email, projectName: "Draft label" };
const snapshot = {
  clientName: "Client A", projectName: "Published project", location: "Pune", propertyType: "Apartment",
  lineItems: [{ id: "original-line", catalogueId: "removed-item", roomName: "Room A", specification: "Published specification", unit: "sqft", rate: 10, quantity: 30, included: true, amount: 300 }],
  subtotal: 300, gst: 54, total: 354
};
const estimate = { _id: "estimate-a", leadId: "lead-a", projectId: "project-a", status: "sent_to_client", version: 3, total: 99999, rooms: [{ id: "original-room", length: 3 }], scopes: ["original-scope"], reviews: [{ note: "Internal note" }] };
const round = { _id: "round-a", estimateId: "estimate-a", leadId: "lead-a", projectId: "project-a", status: "pending", estimateVersion: 3, version: 1, sendGeneration: 2, recipientEmailNormalized: actor.email, createdAt: new Date("2026-09-30T00:00:00Z"), estimateSnapshot: snapshot };

describe("published Client estimate presentation", () => {
  it("reads configured labels and paise only from the immutable review snapshot", () => {
    const configured = {
      ...snapshot, subtotal: 121.25, gst: 21.83, total: 143.08,
      subtotalPaise: 12_125, gstPaise: 2_183, totalPaise: 14_308,
      selectedMainBasketIds: ["basket-lower"],
      lineItems: [{
        id: "configured-line", source: "configuration", catalogueId: "main-line-lower",
        roomId: "original-room", roomName: "Room A", specification: null,
        unit: "sqft", rate: 48.5, ratePaise: 4_850, quantity: 2.5,
        included: true, amount: 121.25, amountPaise: 12_125,
        mainBasketId: "basket-lower", subBasketId: "sub-lower", mainLineId: "main-line-lower",
        revisionId: "rev-old", sourceItemStatus: "inactive", sourceRevisionStatus: "draft",
        sourceItemVersion: 7, sourceRevisionVersion: 3,
        uomId: "uom-sqft", mainBasketName: "Original basket",
        subBasketName: "Original child", mainLineName: "Original console", uomName: "Square feet"
      }]
    };
    const result = presentClientEstimate(actor, { ...estimate, lineItems: [{ catalogueId: "changed" }] }, lead,
      { ...round, estimateSnapshot: configured });
    expect(result).toMatchObject({
      subtotalPaise: 12_125, totalPaise: 14_308,
      lineItems: [{ mainBasketName: "Original basket", mainLineName: "Original console" }],
      publishedReview: { snapshot: { lineItems: [{ mainLineId: "main-line-lower" }] } }
    });
    for (const field of ["sourceItemStatus", "sourceRevisionStatus", "sourceItemVersion", "sourceRevisionVersion"]) {
      expect(result?.lineItems[0]).not.toHaveProperty(field);
      expect(result?.publishedReview?.snapshot.lineItems[0]).not.toHaveProperty(field);
    }
  });
  it("reads a direct temporary item from its frozen basket path and rejects an ordinary null parent", () => {
    const direct = {
      ...snapshot, subtotal: 70.03, gst: 12.61, total: 82.64,
      subtotalPaise: 7_003, gstPaise: 1_261, totalPaise: 8_264,
      lineItems: [{
        id: "temporary-line", source: "configuration", itemType: "temporary",
        catalogueId: "temporary-a", roomId: "original-room", roomName: "Room A",
        specification: null, unit: "nos", rate: 70.03, ratePaise: 7_003,
        quantity: 1, included: true, amount: 70.03, amountPaise: 7_003,
        mainBasketId: "basket-a", subBasketId: null, mainLineId: "temporary-a",
        revisionId: "rev-a", uomId: "uom-nos", mainBasketName: "Painting",
        subBasketName: null, mainLineName: "Custom finish", uomName: "Number"
      }]
    };
    const result = presentClientEstimate(actor, estimate, lead, { ...round, estimateSnapshot: direct });
    expect(result).toMatchObject({
      reviewSourceIssue: null, totalPaise: 8_264,
      publishedReview: { snapshot: { lineItems: [{ itemType: "temporary", subBasketId: null, subBasketName: null }] } }
    });
    expect(presentClientEstimate(actor, estimate, lead, { ...round,
      estimateSnapshot: { ...direct, lineItems: [{ ...direct.lineItems[0], itemType: "main_line" }] }
    })).toMatchObject({ reviewSourceIssue: "missing_snapshot", publishedReview: null });
  });
  it("uses persisted submitted values and IDs without exposing internal review notes", () => {
    const result = presentClientEstimate(actor, estimate, lead, round)!;
    expect(result).toMatchObject({ total: 354, projectId: "project-a", lead: { projectName: "Published project" }, publishedReview: { canDecide: true, snapshot }, reviewSourceIssue: null });
    expect(result.lineItems[0].id).toBe("original-line");
    expect(result.rooms).toEqual(estimate.rooms);
    expect(JSON.stringify(result)).not.toContain("Internal note");
  });

  it("retains the submitted proposal while excluding Sales draft room dimensions and prices", () => {
    const result = presentClientEstimate(actor, { ...estimate, status: "draft", version: 5 }, lead, { ...round, status: "changes_requested", decision: "request_changes", decisionNote: "Use wood" })!;
    expect(result).toMatchObject({ status: "draft", total: 354, rooms: [], scopes: [], publishedReview: { canDecide: false, decisionNote: "Use wood" } });
  });

  it("preserves the published proposal and design mapping after design feedback leaves the commercial round pending", () => {
    const result = presentClientEstimate(actor, { ...estimate, status: "client_changes_requested" }, lead, round)!;
    expect(result).toMatchObject({ total: 354, reviewSourceIssue: null, rooms: estimate.rooms, scopes: estimate.scopes,
      publishedReview: { id: "round-a", status: "pending", canDecide: false, snapshot } });
  });

  it.each(["client_changes_requested", "draft", "pending_manager_assignment", "pending_designer_approval", "designer_changes_requested", "ready_for_client"])(
    "keeps a pending commercial proposal readable during subsequent Sales revision: %s", (status) => {
      const result = presentClientEstimate(actor, { ...estimate, status, version: 4, rooms: [{ id: "draft-room", length: 99 }], total: 777777 }, lead, round)!;
      expect(result).toMatchObject({ total: 354, reviewSourceIssue: null, rooms: [], scopes: [],
        publishedReview: { id: "round-a", status: "pending", canDecide: false, snapshot } });
    }
  );

  it.each([
    { status: "draft", version: 3 },
    { status: "client_changes_requested", version: 2 },
    { status: "sent_to_client", version: 4 },
    { status: "client_approved", version: 4 }
  ])("rejects inconsistent live state for a pending commercial round: %j", (state) => {
    expect(presentClientEstimate(actor, { ...estimate, ...state }, lead, round))
      .toMatchObject({ publishedReview: null, reviewSourceIssue: "source_conflict", rooms: [] });
  });

  it("never selects a round sent to a different Client", () => {
    expect(presentClientEstimate(actor, estimate, lead, { ...round, recipientEmailNormalized: "b@example.test" })).toBeNull();
    expect(presentClientEstimate(actor, estimate, { ...lead, clientEmail: "b@example.test" }, round)).toBeNull();
  });

  it.each([
    { projectId: "project-b" }, { estimateId: "estimate-b" }, { leadId: "lead-b" }, { estimateVersion: 2 }, { version: 0 }
  ])("fails closed for conflicting published source %j", (conflict) => {
    expect(presentClientEstimate(actor, estimate, lead, { ...round, ...conflict })).toMatchObject({ publishedReview: null, reviewSourceIssue: "source_conflict", total: 0, lineItems: [], rooms: [] });
  });

  it("keeps unlinked dashboard reviews and approved postdecision project links", () => {
    expect(presentClientEstimate(actor, { ...estimate, projectId: null }, { ...lead, projectId: null }, { ...round, projectId: null })).toMatchObject({ projectId: null, publishedReview: { canDecide: true } });
    expect(presentClientEstimate(actor, { ...estimate, status: "client_approved", version: 4 }, lead, { ...round, projectId: null, status: "approved", decision: "approve" })).toMatchObject({ projectId: "project-a", publishedReview: { canDecide: false } });
  });

  it("does not manufacture a review for missing or malformed legacy snapshots", () => {
    expect(presentClientEstimate(actor, estimate, lead, null)).toMatchObject({ publishedReview: null, reviewSourceIssue: "missing_snapshot", lineItems: [], total: 0 });
    expect(presentClientEstimate(actor, estimate, lead, { ...round, estimateSnapshot: { total: 123 } })).toMatchObject({ publishedReview: null, reviewSourceIssue: "missing_snapshot" });
    expect(presentClientEstimate(actor, { ...estimate, status: "draft" }, lead, null)).toBeNull();
  });
});
