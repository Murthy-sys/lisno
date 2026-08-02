import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateDesignDrawingModel } from "../src/models/EstimateDesignDrawing.js";
import { EstimateDesignRevisionModel } from "../src/models/EstimateDesignRevision.js";
import { EstimateDesignSourcePageModel } from "../src/models/EstimateDesignSourcePage.js";
import { EstimateDesignUploadModel } from "../src/models/EstimateDesignUpload.js";
import { EstimatePlanChangeRequestModel } from "../src/models/EstimatePlanChangeRequest.js";
import { createEstimatePlanReviewService } from "../src/services/estimate-plan-review.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const estimator = { id: "owner-1", name: "Owner", email: "owner@example.com", role: "estimator_sales" as const };
const designer = { id: "designer-1", name: "Designer", email: "designer@example.com", role: "designer" as const };
const outsider = { id: "owner-2", name: "Other", email: "other@example.com", role: "estimator_sales" as const };
const client = { id: "client-1", name: "Client", email: "client@example.com", role: "client" as const };

function service() {
  return createEstimatePlanReviewService({
    estimateDesigns: { listClient: vi.fn() },
    storage: { open: vi.fn(), read: vi.fn(), save: vi.fn(), saveGenerated: vi.fn(), delete: vi.fn() },
    audit: { appendInMongoTransaction: vi.fn(async () => ({})) },
    now: () => new Date("2026-08-03T12:00:00.000Z")
  } as never);
}

beforeAll(async () => { replica = await startMongoReplicaSet(); });
afterAll(async () => { await replica.stop(); });
beforeEach(async () => {
  await replica.clear();
  await EstimateModel.create({ _id: "estimate-1", leadId: "lead-1", ownerId: estimator.id, assignedDesignerId: designer.id, status: "client_changes_requested", propertyType: "apartment" });
  await EstimateDesignUploadModel.create({ _id: "upload-1", estimateId: "estimate-1", leadId: "lead-1", originalFilename: "plan.pdf", storedFileReference: "source.pdf", mimeType: "application/pdf", sizeBytes: 100, uploaderId: estimator.id, uploadedAt: new Date(), extractionStatus: "changes_requested" });
  await EstimateDesignSourcePageModel.create([
    { _id: "page-1", uploadId: "upload-1", pageNumber: 1, normalizedFileReference: "page.png", width: 100, height: 100 },
    { _id: "page-2", uploadId: "upload-1", pageNumber: 2, normalizedFileReference: "page-2.png", width: 100, height: 100 }
  ]);
  await EstimateDesignDrawingModel.create([
    { _id: "drawing-a", uploadId: "upload-1", sourcePageId: "page-1", estimateId: "estimate-1", active: true, verified: true, roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc", detectedTitle: "A", displayTitle: "A", source: "ocr" },
    { _id: "drawing-other-page", uploadId: "upload-1", sourcePageId: "page-2", estimateId: "estimate-1", active: true, verified: true, roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc", detectedTitle: "B", displayTitle: "B", source: "ocr" }
  ]);
  await EstimateDesignRevisionModel.create([
    { _id: "revision-a", drawingId: "drawing-a", revisionNumber: 1, sourcePageId: "page-1", crop: { x: 0, y: 0, width: 50, height: 50 }, croppedFileReference: "a.png", roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc", label: "A", reviewStatus: "changes_requested" },
    { _id: "revision-b", drawingId: "drawing-other-page", revisionNumber: 1, sourcePageId: "page-2", crop: { x: 0, y: 0, width: 50, height: 50 }, croppedFileReference: "b.png", roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc", label: "B", reviewStatus: "submitted" }
  ]);
  await EstimatePlanChangeRequestModel.create({
    _id: "request-1", estimateId: "estimate-1", uploadId: "upload-1", sourcePageId: "page-1",
    clientId: client.id, idempotencyKey: "request", version: 1, summary: "Move the wall",
    annotations: { schemaVersion: 1, imageWidth: 100, imageHeight: 100, elements: [] },
    targets: [], unassigned: true, unassignedResolved: false, status: "open"
  });
});

describe("estimate plan staff workflow", () => {
  it("returns metadata-only queues to the owner and assigned designer", async () => {
    for (const user of [estimator, designer]) {
      const rows = await service().listStaff(user, {});
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: "request-1", estimateId: "estimate-1", summary: "Move the wall", status: "open" });
      expect(rows[0]).not.toHaveProperty("annotations");
    }
    await expect(service().listStaff(outsider, {})).resolves.toEqual([]);
    await expect(service().listStaff(client, {})).rejects.toMatchObject({ status: 403 });
    await expect(service().getStaff(outsider, "request-1")).rejects.toMatchObject({ status: 403 });
  });

  it("links unassigned feedback only to active drawings on the same page", async () => {
    const api = service();
    const linked = await api.updateTargets(estimator, "request-1", { version: 1, targetDrawingIds: ["drawing-a"] });
    expect(linked).toMatchObject({ version: 2, unassigned: false, targets: [{ drawingId: "drawing-a", requestedRevisionId: "revision-a", status: "open" }] });
    await expect(api.updateTargets(estimator, "request-1", { version: 1, targetDrawingIds: ["drawing-a"] })).rejects.toMatchObject({ status: 409 });
  });

  it("rejects cross-page targets and resolves page-only feedback with a bounded note", async () => {
    const api = service();
    await expect(api.updateTargets(estimator, "request-1", { version: 1, targetDrawingIds: ["drawing-other-page"] })).rejects.toMatchObject({ status: 400 });
    const resolved = await api.resolvePage(estimator, "request-1", { version: 1, note: "Handled in the full sheet." });
    expect(resolved).toMatchObject({ version: 2, status: "resolved", unassigned: true });
  });
});
