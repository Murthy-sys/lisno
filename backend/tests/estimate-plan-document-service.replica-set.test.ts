import { PDFDocument } from "pdf-lib";
import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPlanDocumentManifest } from "../src/domain/estimate-plan-document.js";
import { DesignPlanReviewRoundModel } from "../src/models/DesignPlanReviewRound.js";
import { EstimateDesignDrawingModel } from "../src/models/EstimateDesignDrawing.js";
import { EstimateDesignPlanDocumentModel } from "../src/models/EstimateDesignPlanDocument.js";
import { EstimateDesignRevisionModel } from "../src/models/EstimateDesignRevision.js";
import { EstimateDesignSourcePageModel } from "../src/models/EstimateDesignSourcePage.js";
import { EstimateDesignUploadModel } from "../src/models/EstimateDesignUpload.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { LeadModel } from "../src/models/Lead.js";
import { loadEstimatePlanDocumentManifest } from "../src/services/estimate-plan-document-manifest.js";
import { createEstimatePlanDocumentService } from "../src/services/estimate-plan-document.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const NOW = new Date("2026-10-01T00:00:00.000Z");
const designer = { id: "designer-a", name: "Designer A", email: "designer-a@example.test", role: "designer" as const };
const otherDesigner = { ...designer, id: "designer-b" };
const client = { id: "client-a", name: "Client A", email: "client-a@example.test", role: "client" as const };
const superAdmin = { id: "super-admin", name: "Super Admin", email: "super@example.test", role: "super_admin" as const };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => { replica = await startMongoReplicaSet(); await EstimateDesignPlanDocumentModel.syncIndexes(); });
beforeEach(async () => { await replica.clear(); });
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => { await replica.stop(); });

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

async function setup() {
  const objects = new Map<string, Buffer>();
  for (const suffix of ["a", "b"]) {
    const width = suffix === "a" ? 100 : 250;
    const pdf = await PDFDocument.create();
    pdf.addPage([width, 100]).drawText(`Native plan ${suffix}`, { x: 5, y: 50, size: 10 });
    const bytes = Buffer.from(await pdf.save());
    objects.set(`source/${suffix}.pdf`, bytes);
    await EstimateModel.create({ _id: `estimate-${suffix}`, leadId: `lead-${suffix}`, projectId: `project-${suffix}`, ownerId: "sales", status: "client_approved", propertyType: "Villa", designPlanDesignerId: `designer-${suffix}`, designPlanStatus: "in_progress", designPlanVersion: 1 });
    await LeadModel.create({ _id: `lead-${suffix}`, projectId: `project-${suffix}`, ownerId: "sales", clientName: `Client ${suffix}`, clientEmail: `client-${suffix}@example.test`, clientMobile: "9000000000", projectName: `Project ${suffix}`, location: "Pune", propertyType: "Villa", source: "direct", stage: "won", nextAction: "Review plan", nextActionAt: NOW });
    await EstimateDesignUploadModel.create({ _id: `upload-${suffix}`, estimateId: `estimate-${suffix}`, leadId: `lead-${suffix}`, purpose: "ordinary", originalFilename: `plan-${suffix}.pdf`, storedFileReference: `source/${suffix}.pdf`, mimeType: "application/pdf", sizeBytes: bytes.length, uploaderId: `designer-${suffix}`, uploadedAt: NOW, extractionStatus: "estimator_review" });
    await EstimateDesignSourcePageModel.create({ _id: `page-${suffix}`, uploadId: `upload-${suffix}`, pageNumber: 1, normalizedFileReference: `page/${suffix}.png`, width, height: 100 });
    await EstimateDesignDrawingModel.create({ _id: `drawing-${suffix}`, estimateId: `estimate-${suffix}`, uploadId: `upload-${suffix}`, sourcePageId: `page-${suffix}`, active: true, mappingStatus: "misc", displayTitle: `Drawing ${suffix}`, detectedTitle: `Drawing ${suffix}`, source: "ocr" });
    await EstimateDesignRevisionModel.create({ _id: `revision-${suffix}`, drawingId: `drawing-${suffix}`, revisionNumber: 1, sourcePageId: `page-${suffix}`, crop: { x: 0, y: 0, width, height: 100 }, croppedFileReference: `crop/${suffix}.png`, label: `Drawing ${suffix}`, mappingStatus: "misc", reviewStatus: "draft" });
  }
  const storage = {
    read: vi.fn(async (reference: string) => { const bytes = objects.get(reference); if (!bytes) throw new Error("source missing"); return Buffer.from(bytes); }),
    saveGenerated: vi.fn(async ({ data, extension }: { data: Buffer; extension: string }) => { const reference = `generated/${objects.size}${extension}`; objects.set(reference, Buffer.from(data)); return { reference }; }),
    delete: vi.fn(async (reference: string) => { objects.delete(reference); })
  };
  const set = await loadEstimatePlanDocumentManifest("estimate-a");
  const service = createEstimatePlanDocumentService({ storage: storage as never, now: () => NOW });
  return { objects, storage, service, set };
}

describe("durable plan document preparation", () => {
  it("prepares a real native PDF once and preserves the ready artifact for repeated preparation", async () => {
    const { service, storage, objects, set } = await setup();
    const first = await service.prepare(designer, "estimate-a", set.manifestHash);
    expect(first).toMatchObject({ readyForSubmission: true, documents: [{ status: "ready", pageCount: 1 }] });
    expect(JSON.stringify(first)).not.toMatch(/storageReference|source\/a\.pdf|croppedFileReference/);
    const id = first.documents[0]!.documentId!;
    const before = await EstimateDesignPlanDocumentModel.findById(id).select("+manifest +storageReference +attemptToken").lean();
    const prepared = await service.prepareForSubmission(designer, "estimate-a");
    expect(prepared.documents[0]!.documentId).toBe(id);
    expect(await EstimateDesignPlanDocumentModel.findById(id).select("+manifest +storageReference +attemptToken").lean()).toEqual(before);
    expect(storage.saveGenerated).toHaveBeenCalledOnce();
    const file = await service.readStaff(designer, "estimate-a", id);
    expect(file.bytes).toEqual(objects.get("source/a.pdf"));
    expect((await PDFDocument.load(file.bytes)).getPageCount()).toBe(1);
    objects.set(prepared.documents[0]!.storageReference, Buffer.from("corrupt artifact"));
    await expect(service.readStaff(designer, "estimate-a", id)).rejects.toMatchObject({ code: "DESIGN_PLAN_ATTACHMENT_CONFLICT" });
  });

  it("reports original PDF pages without any extracted drawings", async () => {
    const { storage, objects } = await setup();
    const original = await PDFDocument.load(objects.get("source/a.pdf")!);
    original.addPage([200, 300]);
    const bytes = Buffer.from(await original.save());
    objects.set("source/a.pdf", bytes);
    await EstimateDesignUploadModel.updateOne({ _id: "upload-a" }, { $set: { sizeBytes: bytes.length } });
    await EstimateDesignSourcePageModel.create({ _id: "page-a-2", uploadId: "upload-a", pageNumber: 2, normalizedFileReference: "page/a-2.png", width: 200, height: 300 });
    const set = await loadEstimatePlanDocumentManifest("estimate-a");
    const service = createEstimatePlanDocumentService({ storage: storage as never, now: () => NOW });
    const ready = await service.prepare(designer, "estimate-a", set.manifestHash);
    expect(ready.documents[0]!.pageCount).toBe(2);
  });

  it("allows only one concurrent preparation owner for the same manifest", async () => {
    const { storage, objects, set } = await setup();
    const entered = deferred(); const finish = deferred();
    const render = vi.fn(async () => { entered.resolve(); await finish.promise; return objects.get("source/a.pdf")!; });
    const service = createEstimatePlanDocumentService({ storage: storage as never, render, now: () => NOW });
    const first = service.prepare(designer, "estimate-a", set.manifestHash);
    await entered.promise;
    const second = await service.prepare(designer, "estimate-a", set.manifestHash);
    expect(second).toMatchObject({ readyForSubmission: false, documents: [{ status: "preparing" }] });
    expect(render).toHaveBeenCalledOnce();
    finish.resolve();
    expect(await first).toMatchObject({ readyForSubmission: true });
    expect(await EstimateDesignPlanDocumentModel.countDocuments()).toBe(1);
    expect(storage.saveGenerated).toHaveBeenCalledOnce();
  });

  it("reclaims an expired attempt and never removes the winning artifact when the old renderer finishes", async () => {
    const { storage, objects, set } = await setup();
    let time = NOW.getTime();
    const entered = deferred(); const finish = deferred();
    const slow = createEstimatePlanDocumentService({ storage: storage as never, now: () => new Date(time), render: async () => { entered.resolve(); await finish.promise; return objects.get("source/a.pdf")!; } });
    const fast = createEstimatePlanDocumentService({ storage: storage as never, now: () => new Date(time) });
    const old = slow.prepare(designer, "estimate-a", set.manifestHash);
    const oldRejected = expect(old).rejects.toMatchObject({ code: "DESIGN_PLAN_DOCUMENT_STALE" });
    await entered.promise;
    time += 121_000;
    expect((await fast.listStaff(designer, "estimate-a")).documents[0]).toMatchObject({ status: "failed", failureCode: "DESIGN_PLAN_PREPARATION_EXPIRED" });
    const winner = await fast.prepareForSubmission(designer, "estimate-a");
    finish.resolve();
    await oldRejected;
    expect(storage.delete).toHaveBeenCalledOnce();
    expect(storage.delete).not.toHaveBeenCalledWith(winner.documents[0]!.storageReference);
    expect(objects.has(winner.documents[0]!.storageReference)).toBe(true);
    expect(await fast.readStaff(designer, "estimate-a", winner.documents[0]!.documentId)).toMatchObject({ bytes: objects.get("source/a.pdf") });
  });

  it.each(["render", "storage"])("retains a retryable safe failure after %s failure", async (failure) => {
    const { storage, objects, set } = await setup();
    const render = vi.fn(async () => objects.get("source/a.pdf")!);
    if (failure === "render") render.mockRejectedValueOnce(new Error("private source reference"));
    else storage.saveGenerated.mockRejectedValueOnce(new Error("private storage credential"));
    const service = createEstimatePlanDocumentService({ storage: storage as never, render, now: () => NOW });
    await expect(service.prepare(designer, "estimate-a", set.manifestHash)).rejects.toMatchObject({ code: "DESIGN_PLAN_PDF_FAILED" });
    const failed = await service.listStaff(designer, "estimate-a");
    expect(failed.documents[0]).toMatchObject({ status: "failed", failureCode: "DESIGN_PLAN_PDF_FAILED" });
    expect(JSON.stringify(failed)).not.toContain("private");
    expect(await service.prepare(designer, "estimate-a", set.manifestHash)).toMatchObject({ readyForSubmission: true });
    expect(await EstimateDesignPlanDocumentModel.countDocuments()).toBe(1);
  });

  it.each(["after-render", "after-storage"])("rejects stale manifests %s and cleans up only unreferenced generated bytes", async (point) => {
    const { storage, objects, set } = await setup();
    let current = set;
    const change = () => { current = { ...set, manifestHash: "e".repeat(64) }; };
    const save = storage.saveGenerated.getMockImplementation()!;
    if (point === "after-storage") storage.saveGenerated.mockImplementation(async (input) => { const result = await save(input); change(); return result; });
    const service = createEstimatePlanDocumentService({ storage: storage as never, now: () => NOW, loadManifest: async () => current, render: async () => { if (point === "after-render") change(); return objects.get("source/a.pdf")!; } });
    await expect(service.prepare(designer, "estimate-a", set.manifestHash)).rejects.toMatchObject({ code: "DESIGN_PLAN_DOCUMENT_STALE" });
    expect(await EstimateDesignPlanDocumentModel.countDocuments({ status: "ready" })).toBe(0);
    expect(storage.delete).toHaveBeenCalledTimes(point === "after-storage" ? 1 : 0);
    expect(objects.size).toBe(2);
  });

  it("fences a timed-out publication before deleting its bytes so a delayed write cannot publish a missing object", async () => {
    const { service, storage, set } = await setup();
    const update = EstimateDesignPlanDocumentModel.updateOne.bind(EstimateDesignPlanDocumentModel);
    let delayed: { filter: any; changes: any } | undefined;
    vi.spyOn(EstimateDesignPlanDocumentModel, "updateOne").mockImplementation(((filter: any, changes: any, options: any) => {
      if (changes?.$set?.status === "ready" && !delayed) { delayed = { filter, changes }; return Promise.reject(new Error("publication timeout")); }
      return update(filter, changes, options);
    }) as never);
    const remove = storage.delete.getMockImplementation()!;
    storage.delete.mockImplementation(async (reference) => {
      expect(await EstimateDesignPlanDocumentModel.findOne().select("+attemptToken").lean()).toMatchObject({ status: "failed", attemptToken: null });
      await remove(reference);
    });
    await expect(service.prepare(designer, "estimate-a", set.manifestHash)).rejects.toMatchObject({ code: "DESIGN_PLAN_PDF_FAILED" });
    expect(storage.delete).toHaveBeenCalledOnce();
    expect((await update(delayed!.filter, delayed!.changes)).modifiedCount).toBe(0);
  });

  it("keeps a successfully committed artifact when Mongo loses the publication response", async () => {
    const { service, storage, set } = await setup();
    const update = EstimateDesignPlanDocumentModel.updateOne.bind(EstimateDesignPlanDocumentModel);
    let failedResponse = false;
    vi.spyOn(EstimateDesignPlanDocumentModel, "updateOne").mockImplementation(((filter: any, changes: any, options: any) => {
      if (changes?.$set?.status === "ready" && !failedResponse) {
        failedResponse = true;
        return update(filter, changes, options).then(() => { throw new Error("lost Mongo response"); });
      }
      return update(filter, changes, options);
    }) as never);
    expect(await service.prepare(designer, "estimate-a", set.manifestHash)).toMatchObject({ readyForSubmission: true });
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("retains stored bytes if both the publication outcome and fencing write are unavailable", async () => {
    const { service, storage, objects, set } = await setup();
    const update = EstimateDesignPlanDocumentModel.updateOne.bind(EstimateDesignPlanDocumentModel);
    vi.spyOn(EstimateDesignPlanDocumentModel, "updateOne").mockImplementation(((filter: any, changes: any, options: any) => {
      if (["ready", "failed"].includes(changes?.$set?.status)) return Promise.reject(new Error("Mongo unavailable"));
      return update(filter, changes, options);
    }) as never);
    await expect(service.prepare(designer, "estimate-a", set.manifestHash)).rejects.toThrow();
    expect(storage.delete).not.toHaveBeenCalled();
    expect(objects.size).toBe(3);
    expect(await EstimateDesignPlanDocumentModel.findOne().lean()).toMatchObject({ status: "preparing" });
  });

  it("keeps committed bytes when the lost-response recovery read also times out", async () => {
    const { service, storage, objects, set } = await setup();
    const update = EstimateDesignPlanDocumentModel.updateOne.bind(EstimateDesignPlanDocumentModel);
    vi.spyOn(EstimateDesignPlanDocumentModel, "updateOne").mockImplementation(((filter: any, changes: any, options: any) => {
      if (changes?.$set?.status === "ready") return update(filter, changes, options).then(() => { throw new Error("lost response"); });
      return update(filter, changes, options);
    }) as never);
    vi.spyOn(EstimateDesignPlanDocumentModel, "findById").mockImplementation(() => ({ select: () => ({ lean: async () => { throw new Error("recovery read timeout"); } }) }) as never);
    await expect(service.prepare(designer, "estimate-a", set.manifestHash)).rejects.toThrow();
    const row = await EstimateDesignPlanDocumentModel.findOne().select("+storageReference").lean();
    expect(row!.status).toBe("ready");
    expect(objects.has(row!.storageReference)).toBe(true);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it("enforces asymmetric staff/Client scope and reads the exact round-pinned bytes", async () => {
    const { service, set, objects } = await setup();
    const prepared = await service.prepareForSubmission(designer, "estimate-a");
    const document = prepared.documents[0]!;
    await DesignPlanReviewRoundModel.create({
      _id: "round-a", estimateId: "estimate-a", projectId: "project-a", leadId: "lead-a", designPlanVersion: 1, planManifestHash: set.manifestHash,
      planDocuments: [{ documentId: document.documentId, sourceUploadId: "upload-a", manifestHash: document.manifestHash }],
      submittedRevisionIds: ["revision-a"], recipientEmail: client.email, clientName: client.name, projectName: "Project A", submittedById: designer.id, submittedAt: NOW, assignedAdminId: superAdmin.id,
      attachments: [{ uploadId: "upload-a", filename: document.filename, mimeType: "application/pdf", byteSize: document.byteSize, sha256: document.sha256, storageReference: document.storageReference }], status: "pending", deliveryStatus: "sent"
    });
    const staffFile = await service.readStaff(designer, "estimate-a", document.documentId);
    expect(await service.readClient(client, "estimate-a", document.documentId, "round-a")).toEqual(staffFile);
    await expect(service.readClient({ ...client, id: "client-b", email: "client-b@example.test" }, "estimate-a", document.documentId, "round-a")).rejects.toMatchObject({ status: 404 });
    await expect(service.readClient(client, "estimate-b", document.documentId, "round-a")).rejects.toMatchObject({ status: 404 });
    await expect(service.readStaff(otherDesigner, "estimate-a", document.documentId)).rejects.toMatchObject({ status: 403 });
    await expect(service.readStaff(otherDesigner, "estimate-b", document.documentId)).rejects.toMatchObject({ status: 404 });
    await expect(service.prepare(superAdmin, "estimate-a", set.manifestHash)).rejects.toMatchObject({ status: 403 });
    await expect(service.prepare(designer, "estimate-a", "f".repeat(64))).rejects.toMatchObject({ code: "DESIGN_PLAN_DOCUMENT_STALE" });
    const row = await EstimateDesignPlanDocumentModel.findById(document.documentId).select("+manifest").lean();
    expect(row!.manifestHash).toBe(hashPlanDocumentManifest(row!.manifest));
    const swappedBytes = Buffer.from("different internally consistent artifact bytes");
    objects.set("generated/swapped.pdf", swappedBytes);
    await EstimateDesignPlanDocumentModel.updateOne({ _id: document.documentId }, { $set: {
      storageReference: "generated/swapped.pdf", byteSize: swappedBytes.length, sha256: createHash("sha256").update(swappedBytes).digest("hex")
    } });
    await expect(service.readClient(client, "estimate-a", document.documentId, "round-a")).rejects.toMatchObject({ code: "DESIGN_PLAN_ATTACHMENT_CONFLICT" });
  });
});
