import { Readable } from "node:stream";

import mongoose from "mongoose";
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { EstimateDesignDrawingModel } from "../src/models/EstimateDesignDrawing.js";
import { EstimateDesignRevisionModel } from "../src/models/EstimateDesignRevision.js";
import { EstimateDesignSourcePageModel } from "../src/models/EstimateDesignSourcePage.js";
import { EstimateDesignUploadModel } from "../src/models/EstimateDesignUpload.js";
import { EstimatePlanChangeRequestModel } from "../src/models/EstimatePlanChangeRequest.js";
import { EstimatePlanPageRevisionModel } from "../src/models/EstimatePlanPageRevision.js";
import { approvePlanTargetsForDrawingRevision, createEstimatePlanReviewService } from "../src/services/estimate-plan-review.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let base: Buffer;
let red: Buffer;
let blue: Buffer;
let green: Buffer;
const client = { id: "client-1", name: "Client", email: "client@example.com", role: "client" as const };

class Storage {
  values = new Map<string, Buffer>();
  async read(reference: string) { return Buffer.from(this.values.get(reference)!); }
  async open(reference: string) { return Readable.from(await this.read(reference)); }
  async saveGenerated(input: { data: Buffer }) { const reference = `generated-${this.values.size}.png`; this.values.set(reference, Buffer.from(input.data)); return { reference }; }
  async save(input: { data: Buffer }) { return this.saveGenerated(input); }
  async delete(reference: string) { this.values.delete(reference); }
}

async function pixels(value: Buffer) {
  return sharp(value).raw().toBuffer({ resolveWithObject: true });
}

function createService(storage: Storage) {
  return createEstimatePlanReviewService({
    estimateDesigns: { listClient: vi.fn(async () => ({ uploads: [], pages: [], drawings: [], revisions: [], readiness: { ready: false, total: 2, approved: 1, awaitingReview: 1, changesRequested: 0 } })) },
    storage,
    audit: { appendInMongoTransaction: vi.fn(async () => ({})) }
  } as never);
}

beforeAll(async () => {
  replica = await startMongoReplicaSet();
  base = await sharp({ create: { width: 100, height: 50, channels: 3, background: "white" } }).png().toBuffer();
  red = await sharp({ create: { width: 40, height: 50, channels: 3, background: "red" } }).png().toBuffer();
  blue = await sharp({ create: { width: 40, height: 50, channels: 3, background: "blue" } }).png().toBuffer();
  green = await sharp({ create: { width: 40, height: 50, channels: 3, background: "green" } }).png().toBuffer();
});
afterAll(async () => { await replica.stop(); });

beforeEach(async () => {
  await replica.clear();
  await EstimateDesignUploadModel.create({ _id: "upload-1", estimateId: "estimate-1", leadId: "lead-1", originalFilename: "plan.pdf", storedFileReference: "source.pdf", mimeType: "application/pdf", sizeBytes: 100, uploaderId: "estimator-1", uploadedAt: new Date(), extractionStatus: "submitted" });
  await EstimateDesignSourcePageModel.create({ _id: "page-1", uploadId: "upload-1", pageNumber: 1, normalizedFileReference: "base.png", width: 100, height: 50 });
  await EstimateDesignDrawingModel.create([
    { _id: "drawing-a", uploadId: "upload-1", sourcePageId: "page-1", estimateId: "estimate-1", active: true, verified: true, roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc", detectedTitle: "A", displayTitle: "A", source: "ocr" },
    { _id: "drawing-b", uploadId: "upload-1", sourcePageId: "page-1", estimateId: "estimate-1", active: true, verified: true, roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc", detectedTitle: "B", displayTitle: "B", source: "ocr" }
  ]);
  await EstimateDesignRevisionModel.create([
    { _id: "revision-a1", drawingId: "drawing-a", revisionNumber: 1, sourcePageId: "page-1", crop: { x: 0, y: 0, width: 40, height: 50 }, croppedFileReference: "a1.png", roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc", label: "A", reviewStatus: "submitted" },
    { _id: "revision-b1", drawingId: "drawing-b", revisionNumber: 1, sourcePageId: "page-1", crop: { x: 60, y: 0, width: 40, height: 50 }, croppedFileReference: "b1.png", roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc", label: "B", reviewStatus: "approved" }
  ]);
});

describe("estimate plan selective composition", () => {
  it("patches the current drawing revisions while preserving uncovered base pixels", async () => {
    const storage = new Storage();
    storage.values.set("base.png", base); storage.values.set("a1.png", red); storage.values.set("b1.png", blue);
    const api = createService(storage);
    await api.listClient(client, "estimate-1");
    const rendered = await pixels(await streamBytes(await api.pageImage(client, "page-1")));
    const rgb = (x: number, y: number) => {
      const offset = (y * rendered.info.width + x) * rendered.info.channels;
      return [...rendered.data.subarray(offset, offset + 3)];
    };
    expect(rgb(0, 0)).toEqual([255, 0, 0]);
    expect(rgb(50, 25)).toEqual([255, 255, 255]);
    expect(rgb(80, 25)).toEqual([0, 0, 255]);
  });

  it("advances one manifest entry without changing the other drawing", async () => {
    const storage = new Storage();
    storage.values.set("base.png", base); storage.values.set("a1.png", red); storage.values.set("a2.png", green); storage.values.set("b1.png", blue);
    const api = createService(storage);
    await api.listClient(client, "estimate-1");
    await EstimatePlanChangeRequestModel.create({
      _id: "request-a", estimateId: "estimate-1", uploadId: "upload-1", sourcePageId: "page-1",
      clientId: client.id, idempotencyKey: "replace-a", version: 1, summary: "Revise A",
      annotations: { schemaVersion: 1, imageWidth: 100, imageHeight: 50, elements: [] },
      targets: [{ drawingId: "drawing-a", requestedRevisionId: "revision-a1", status: "open", resolvedByRevisionId: null }],
      unassigned: false, unassignedResolved: false, status: "open"
    });
    await EstimateDesignRevisionModel.create({ _id: "revision-a2", drawingId: "drawing-a", revisionNumber: 2, sourcePageId: "page-1", crop: { x: 0, y: 0, width: 40, height: 50 }, croppedFileReference: "a2.png", roomId: null, scopeSectionId: null, catalogueId: null, mappingStatus: "misc", label: "A", reviewStatus: "submitted", replacesRevisionId: "revision-a1" });
    await api.advanceForDrawingRevision("revision-a2");
    const manifests = await EstimatePlanPageRevisionModel.find({ sourcePageId: "page-1" }).sort({ revisionNumber: 1 }).lean();
    expect(manifests).toHaveLength(2);
    expect(manifests[0]!.patches.map((patch: any) => patch.drawingRevisionId)).toEqual(["revision-a1", "revision-b1"]);
    expect(manifests[1]!.patches.map((patch: any) => patch.drawingRevisionId)).toEqual(["revision-a2", "revision-b1"]);
    expect((await EstimateDesignRevisionModel.findById("revision-b1").lean())!.reviewStatus).toBe("approved");
    const request = await EstimatePlanChangeRequestModel.findById("request-a").lean();
    expect(request!.version).toBe(2);
    expect(request!.targets[0]).toMatchObject({ status: "replacement_submitted", resolvedByRevisionId: "revision-a2" });
    await mongoose.connection.transaction((session) => approvePlanTargetsForDrawingRevision("revision-a2", session));
    const approvedRequest = await EstimatePlanChangeRequestModel.findById("request-a").lean();
    expect(approvedRequest).toMatchObject({ version: 3, status: "resolved" });
    expect(approvedRequest!.targets[0]).toMatchObject({ status: "approved", resolvedByRevisionId: "revision-a2" });
    const rendered = await pixels(await streamBytes(await api.pageImage(client, "page-1")));
    expect([...rendered.data.subarray(0, 3)]).toEqual([0, 128, 0]);
  });
});

async function streamBytes(stream: NodeJS.ReadableStream) {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}
