import { ApiProtocolError } from "../../core/http/apiClient";
import { componentAmountLineFixture } from "../estimate-authoring/__tests__/fixtures";
import {
  canDecideClientEstimate,
  clientEstimateMoney,
  publishedMoney,
  canEditClientPlan,
  canViewClientPlan,
  estimatesForProject,
  parseClientDrawingWorkspace,
  parseClientEstimates,
  parseClientPlanWorkspace,
  parseClientSectionReview
} from "./clientReviewModel";

const estimate = (id: string, projectId: string | null, status: string, designPlanStatus: string | null = null) => ({
  id, projectId, status, designPlanStatus, version: 3,
  total: 999_999,
  publishedReview: {
    id: `round-${id}`, version: 1, estimateVersion: 3, sendGeneration: 1,
    status: status === "client_approved" ? "approved" : status === "client_changes_requested" ? "changes_requested" : "pending",
    submittedAt: "2026-10-14T06:00:00Z", canDecide: status === "sent_to_client",
    snapshot: {
      total: id === "estimate-one" ? 100_000 : 950_000, subtotal: 90_000, gst: 10_000,
      lineItems: [{ id: `${id}-line`, quantity: 1, rate: id === "estimate-one" ? 100_000 : 950_000, amount: id === "estimate-one" ? 100_000 : 950_000, included: true }],
      projectName: id === "estimate-one" ? "Home A" : "Home B", location: "Pune", clientName: "Client"
    }
  }
});

describe("client review contracts", () => {
  it("allows a frozen exact component amount without a fabricated unit rate", () => {
    const row = estimate("estimate-one", "project-one", "sent_to_client");
    const [parsed] = parseClientEstimates([{ ...row, publishedReview: { ...row.publishedReview, snapshot: {
      ...row.publishedReview.snapshot, lineItems: [componentAmountLineFixture], subtotalPaise: 78333, gstPaise: 14100, totalPaise: 92433
    } } }]);
    expect(canDecideClientEstimate(parsed!)).toBe(true);
    expect(parsed!.lineItems[0]).toMatchObject({ rate: null, ratePaise: null, amountPaise: 78333, componentPricing: { totalPaise: 78333 } });
    expect(() => parseClientEstimates([{ ...row, publishedReview: { ...row.publishedReview, snapshot: {
      ...row.publishedReview.snapshot, lineItems: [{ ...componentAmountLineFixture, amountPaise: 1 }]
    } } }])).toThrow();
  });
  it("joins estimates to projects by stable ID and keeps a pre-approval estimate without a project", () => {
    const rows = parseClientEstimates([
      estimate("estimate-one", "project-one", "client_approved", "ready_for_client"),
      estimate("estimate-two", "project-two", "sent_to_client"),
      estimate("estimate-three", null, "sent_to_client")
    ]);
    expect(estimatesForProject(rows, "project-one").map((row) => [row.id, row.total])).toEqual([["estimate-one", 100_000]]);
    expect(estimatesForProject(rows, "project-two").map((row) => [row.id, row.total])).toEqual([["estimate-two", 950_000]]);
    expect(estimatesForProject(rows, "Home A")).toEqual([]);
    expect(rows[2]?.projectId).toBeNull();
  });

  it("separates commercial decision, reviewable plan, and approved read-only plan states", () => {
    const rows = parseClientEstimates([
      estimate("estimate-one", null, "sent_to_client"),
      estimate("estimate-two", null, "client_changes_requested"),
      estimate("estimate-three", "project-three", "client_approved", "pending_assignment"),
      estimate("estimate-four", "project-four", "client_approved", "ready_for_client"),
      estimate("estimate-five", "project-five", "client_approved", "approved")
    ]);
    expect(rows.map((row) => [canDecideClientEstimate(row), canEditClientPlan(row), canViewClientPlan(row)])).toEqual([
      [true, true, true],
      [false, true, true],
      [false, false, false],
      [false, true, true],
      [false, false, true]
    ]);
  });

  it("ignores mutable draft amounts and confidential properties, handles unavailable prices, and respects exact paise", () => {
    const row = estimate("estimate-one", "project-one", "sent_to_client");
    const snapshot = { ...row.publishedReview.snapshot, total: 117, totalPaise: 11807, subtotalPaise: 10006, gstPaise: 1801,
      lineItems: [{ id: "line-one", quantity: 2, rate: null, amount: null, ratePaise: null, amountPaise: null, included: false, vendorRate: 123, margin: 40, designRules: { discussedVendorId: "private" }, estimateNotes: ["Subject to availability"] }] };
    const [parsed] = parseClientEstimates([{ ...row, total: 9999999, lead: { projectName: "Mutable name" }, vendorRate: 999,
      publishedReview: { ...row.publishedReview, snapshot } }]);
    expect(parsed!.total).toBe(118.07);
    expect(clientEstimateMoney(parsed!.total)).toBe("₹118.07");
    expect(parsed!.lead!.projectName).toBe("Home A");
    expect(parsed!.lineItems[0]!.rate).toBeNull();
    expect(parsed!.lineItems[0]).not.toHaveProperty("vendorRate");
    expect(parsed!.lineItems[0]).not.toHaveProperty("designRules");
    expect(parsed).not.toHaveProperty("vendorRate");
    expect(publishedMoney(40, null)).toBeNull();
    expect(publishedMoney(undefined)).toBeNull();
    expect(clientEstimateMoney(null)).toBe("Estimate unavailable");
  });

  it("fails closed for missing snapshots, source conflicts, outdated rounds and incomplete final comparisons", () => {
    const row = estimate("estimate-one", "project-one", "sent_to_client");
    const rows = parseClientEstimates([
      { ...row, publishedReview: null },
      { ...row, reviewSourceIssue: "source_conflict" },
      { ...row, version: 4 },
      { ...row, publishedReview: { ...row.publishedReview, phase: "post" } },
      { ...row, publishedReview: { ...row.publishedReview, status: "superseded" } }
    ]);
    expect(rows.map(canDecideClientEstimate)).toEqual([false, false, false, false, false]);
    for (const parsed of rows.slice(0, 2)) {
      expect(parsed.total).toBeNull(); expect(parsed.lineItems).toEqual([]); expect(parsed.lead).toBeNull();
    }
    expect(() => parseClientEstimates([{ ...row, publishedReview: { ...row.publishedReview, version: 0 } }])).toThrow(ApiProtocolError);
  });

  it("rejects missing actionable IDs and cross-linked plan pages and sections", () => {
    expect(() => parseClientEstimates([estimate("", null, "sent_to_client")])).toThrow(ApiProtocolError);
    expect(() => parseClientPlanWorkspace({
      uploads: [{ id: "upload-a", originalFilename: "plan.pdf", mimeType: "application/pdf", pageCount: 1, pages: [{ id: "page-a", uploadId: "upload-b", pageNumber: 1, width: 100, height: 100, currentRevisionId: "revision-a", status: "awaiting_review", annotationDraft: null }] }],
      pages: [{ id: "page-a", uploadId: "upload-b", pageNumber: 1, width: 100, height: 100, currentRevisionId: "revision-a", status: "awaiting_review", annotationDraft: null }],
      openRequests: []
    })).toThrow(ApiProtocolError);
    const planPage = { id: "page-a", uploadId: "upload-a", pageNumber: 1, width: 100, height: 100, currentRevisionId: "revision-a", status: "awaiting_review" };
    expect(() => parseClientPlanWorkspace({
      uploads: [{ id: "upload-a", originalFilename: "plan.pdf", mimeType: "application/pdf", pageCount: 1, pages: [{ ...planPage, annotationDraft: null }] }],
      pages: [{ ...planPage, annotationDraft: { id: "draft-a", sourcePageId: "page-b", version: 1, annotations: { schemaVersion: 1, imageWidth: 100, imageHeight: 100, elements: [] } } }],
      openRequests: []
    })).toThrow(ApiProtocolError);
    expect(() => parseClientSectionReview({ projectId: "project-other", progress: { approved: 0, rejected: 0, awaitingReview: 0, total: 0 }, sections: [] }, "project-one")).toThrow(ApiProtocolError);
  });

  it("accepts drawing history from an older source page while checking the current placement", () => {
    const currentPage = { id: "page-b", uploadId: "upload-b", pageNumber: 1, width: 600, height: 900 };
    const oldRevision = {
      id: "revision-a", drawingId: "drawing-a", revisionNumber: 1, sourcePageId: "page-a",
      crop: { x: 0, y: 0, width: 400, height: 700 }, reviewStatus: "changes_requested", annotations: null, annotationDraft: null
    };
    const currentRevision = {
      id: "revision-b", drawingId: "drawing-a", revisionNumber: 2, sourcePageId: "page-b",
      crop: { x: 10, y: 20, width: 200, height: 300 }, reviewStatus: "submitted", annotations: null, annotationDraft: null
    };
    const workspace = {
      uploads: [{ id: "upload-b", originalFilename: "replacement.pdf", mimeType: "application/pdf" }],
      pages: [currentPage],
      drawings: [{ id: "drawing-a", sourcePageId: "page-b", displayTitle: "Drawing", active: true }],
      revisions: [oldRevision, currentRevision],
      readiness: { ready: false, total: 1, approved: 0, awaitingReview: 1, changesRequested: 0 }
    };
    expect(parseClientDrawingWorkspace(workspace).revisions.map((revision) => revision.sourcePageId)).toEqual(["page-a", "page-b"]);
    expect(() => parseClientDrawingWorkspace({ ...workspace, pages: [] })).toThrow(ApiProtocolError);
    expect(() => parseClientDrawingWorkspace({
      ...workspace, drawings: [{ ...workspace.drawings[0], sourcePageId: "page-a" }]
    })).toThrow(ApiProtocolError);
    expect(() => parseClientDrawingWorkspace({
      ...workspace, revisions: [oldRevision, { ...currentRevision, annotationDraft: {
        id: "draft-b", revisionId: "revision-a", version: 1,
        annotations: { schemaVersion: 1, imageWidth: 200, imageHeight: 300, elements: [] }
      } }]
    })).toThrow(ApiProtocolError);
  });
});


it("retains the frozen client tier metadata and fails closed for malformed tiers", () => {
 const row = estimate("estimate-one", "project-one", "client_approved");
 for (const modeTier of ["signature", "premium", "functional"] as const) {
  const payload = { ...row, publishedReview: { ...row.publishedReview, snapshot: { ...row.publishedReview.snapshot, lineItems: [{ ...row.publishedReview.snapshot.lineItems[0], source: "configuration", modeTier }] } } };
  expect(parseClientEstimates([payload])[0]?.publishedReview?.snapshot.lineItems[0]).toMatchObject({ modeTier });
 }
 expect(() => parseClientEstimates([{ ...row, publishedReview: { ...row.publishedReview, snapshot: { ...row.publishedReview.snapshot, lineItems: [{ ...row.publishedReview.snapshot.lineItems[0], modeTier: "unknown" }] } } }])).toThrow();
});


it("preserves frozen dimension provenance and rejects mismatched calculated quantity", () => {
 const row = estimate("estimate-one", "project-one", "client_approved");
 const measured = { ...row.publishedReview.snapshot.lineItems[0], source: "configuration", uomId: "sqft", uomDecimalScale: 2,
  dimensionsMandatory: true, dimensions: { length: "2", width: "0.5", height: "9" },
  dimensionRule: { formula: "length_width", inputUnit: "ft", quantityUnit: "sq_ft", uomId: "sqft", decimalScale: 2 } };
 const payload = { ...row, publishedReview: { ...row.publishedReview, snapshot: { ...row.publishedReview.snapshot, lineItems: [measured] } } };
 expect(parseClientEstimates([payload])[0]?.publishedReview?.snapshot.lineItems[0]).toMatchObject({ quantity: 1, dimensions: measured.dimensions });
 expect(() => parseClientEstimates([{ ...payload, publishedReview: { ...payload.publishedReview, snapshot: { ...payload.publishedReview.snapshot, lineItems: [{ ...measured, quantity: 99 }] } } }])).toThrow();
 expect(parseClientEstimates([{ ...payload, publishedReview: { ...payload.publishedReview, snapshot: { ...payload.publishedReview.snapshot, lineItems: [{ ...measured, dimensionsMandatory: false, quantity: 99 }] } } }])[0]?.publishedReview?.snapshot.lineItems[0]).toMatchObject({ quantity: 99, dimensions: measured.dimensions });
});
