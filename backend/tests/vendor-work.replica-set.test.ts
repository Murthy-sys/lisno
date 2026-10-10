import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovedPurchaseOrderLine } from "../src/domain/project-purchase-order.js";
import { clientVendorWorkDecisionSchema, vendorWorkAssignmentId, vendorWorkSubmitSchema } from "../src/domain/vendor-work.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { SiteCompletionStateModel } from "../src/models/SiteCompletionState.js";
import { UserModel } from "../src/models/User.js";
import { VendorWorkAssignmentModel } from "../src/models/VendorWorkAssignment.js";
import { VendorWorkImageModel } from "../src/models/VendorWorkImage.js";
import { VendorWorkImageCleanupJobModel } from "../src/models/VendorWorkImageCleanupJob.js";
import { VendorWorkReviewModel } from "../src/models/VendorWorkReview.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createVendorWorkService, onPurchaseOrderApproved, readVendorWorkCompletion } from "../src/services/vendor-work.service.js";
import { createVendorExecutionService } from "../src/services/vendor-execution.service.js";
import type { ExecutionCommand } from "../src/contracts/vendor-execution.js";
import type { FileStorage } from "../src/storage/storage.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

vi.mock("../src/services/vendor-readiness.service.js", () => ({ vendorActivation: vi.fn(async (vendor: { status: string }) => ({ effectiveStatus: vendor.status === "active" ? "active" : "inactive" })) }));

const now = new Date("2026-10-01T09:00:00.000Z");
const vendorA: PublicUser = { id: "vendor-a-user", name: "Vendor A", email: "vendor-a@example.test", role: "vendor", vendorId: "vendor-a" };
const vendorB: PublicUser = { id: "vendor-b-user", name: "Vendor B", email: "vendor-b@example.test", role: "vendor", vendorId: "vendor-b" };
const clientA: PublicUser = { id: "client-a", name: "Client A", email: "client-a@example.test", role: "client" };
const clientB: PublicUser = { id: "client-b", name: "Client B", email: "client-b@example.test", role: "client" };
const admin: PublicUser = { id: "admin-a", name: "Admin", email: "admin@example.test", role: "super_admin" };
const site: PublicUser = { id: "site-a", name: "Site Manager", email: "site@example.test", role: "site_manager" };
const line = (id: string): ApprovedPurchaseOrderLine => ({
  id, procurementItemId: `item-${id}`, procurementItemVersion: 1, estimateId: "estimate-a", estimateVersion: 2,
  estimateReviewRoundId: "estimate-round-a", sourceSectionId: id === "electric" ? "EL" : "CA", sourceLineItemKey: `source-${id}`,
  roomName: "Living room", itemName: id === "electric" ? "Wiring" : "Cabinet", brand: "Approved brand", uomId: "sqm", uomCode: "SQM",
  uomName: "Square metre", quantityMilliUnits: 1_000, unitPricePaise: 10_000, gstBasisPoints: 1_800,
  scopeType: "execution", description: "Complete approved work", targetDate: "2026-11-01", deliveryLocation: "Villa site",
  netPaise: 10_000, gstPaise: 1_800, totalPaise: 11_800
});

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let storedFiles: Map<string, Buffer>;
let nextFile: number;
const storage: FileStorage = {
  async save(input) { const reference = `private-work-image-${++nextFile}`; storedFiles.set(reference, input.data); return { reference }; },
  async saveGenerated(input) { return this.save(input); },
  async read(reference) { const bytes = storedFiles.get(reference); if (!bytes) throw new Error("Missing file"); return bytes; },
  async open(reference) { const bytes = storedFiles.get(reference); if (!bytes) throw new Error("Missing file"); return Readable.from(bytes); },
  async delete(reference) { storedFiles.delete(reference); }
};
const audit = createAuditService(createMemoryRepository());
const service = createVendorWorkService({ audit, storage, maxUploadBytes: 100_000, now: () => now });
const execution = createVendorExecutionService({ audit, now: () => now });
let executionCommandNumber = 0;
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9YF5YwAAAABJRU5ErkJggg==", "base64");

beforeAll(async () => {
  replica = await startMongoReplicaSet("vendor-work-tests");
  for (const model of [UserModel, ProjectModel, ProjectPurchaseOrderModel, SiteCompletionStateModel, VendorWorkAssignmentModel, VendorWorkReviewModel, VendorWorkImageModel, VendorWorkImageCleanupJobModel, AuditEventModel]) await model.syncIndexes();
}, 120_000);
beforeEach(async () => {
  await replica.clear(); storedFiles = new Map(); nextFile = 0; executionCommandNumber = 0;
  await UserModel.create([vendorA, vendorB, clientA, clientB, admin, site].map(actor => ({ _id: actor.id, name: actor.name, email: actor.email, emailNormalized: actor.email, passwordHash: "fixture-only", role: actor.role, vendorId: actor.vendorId ?? null, active: true })));
  await AiEstimatorKnowledgeVendorModel.collection.insertMany([{ _id: "vendor-a", status: "active" }, { _id: "vendor-b", status: "active" }] as any);
  for (const [projectId, clientId] of [["project-a", clientA.id], ["project-b", clientB.id]]) {
    await ProjectModel.create({ _id: projectId, name: projectId, clientId, clientName: clientId, clientEmail: `${clientId}@example.test`, clientEmailNormalized: `${clientId}@example.test`,
      clientMobile: "9000000000", clientAddress: "Site", status: "active", location: "Bengaluru", plannedStartAt: now, plannedEndAt: new Date("2026-12-01T09:00:00Z") });
  }
  await ProjectPurchaseOrderModel.collection.insertMany([
    { _id: "order-a", orderNumber: "PO-A", projectId: "project-a", vendorId: "vendor-a", status: "approved", approvedRevision: 1, approvedRevisionId: "revision-a", cancelledAt: null },
    { _id: "order-b", orderNumber: "PO-B", projectId: "project-b", vendorId: "vendor-b", status: "approved", approvedRevision: 1, approvedRevisionId: "revision-b", cancelledAt: null }
  ] as any);
  await EstimateClientReviewRoundModel.collection.insertOne({ _id: "estimate-round-a", estimateId: "estimate-a", estimateVersion: 2, projectId: null, status: "approved", decision: "approve",
    estimateSnapshot: { lineItems: [{ id: "source-cabinet" }, { id: "source-electric" }] } } as any);
  await ProjectWorkflowTaskModel.collection.insertOne({ _id: "site-task", projectId: "project-a", kind: "site_execution", assigneeRole: "site_manager", assigneeUserId: site.id } as any);
});
afterAll(async () => { await replica?.stop(); });

async function approve(orderId = "order-a", projectId = "project-a", vendorId = "vendor-a", lines = [line("cabinet")]) {
  await mongoose.connection.transaction(async session => {
    const order = (await ProjectPurchaseOrderModel.findById(orderId).session(session).lean())!;
    await ProjectPurchaseOrderRevisionModel.collection.updateOne({ _id: order.approvedRevisionId as any }, { $setOnInsert: { orderId, projectId, vendorId, revision: 1, lines } }, { upsert: true, session });
    await onPurchaseOrderApproved({ orderId, projectId, vendorId, revision: 1, lines }, session);
  });
}

async function executionCommand(actor: PublicUser, assignmentId: string, action: ExecutionCommand["action"], fields: Partial<ExecutionCommand> = {}) {
  const current = await execution.detail(actor, assignmentId);
  return execution.command(actor, assignmentId, { action, expectedVersion: current.version, idempotencyKey: `execution-command-${++executionCommandNumber}`, ...fields });
}
async function prepareTracked(assignmentId: string) {
  if ((await execution.detail(site, assignmentId)).tracking === "setup_required") await executionCommand(site, assignmentId, "setup");
  await executionCommand(vendorA, assignmentId, "acknowledge");
  await executionCommand(vendorA, assignmentId, "propose_schedule", { startDate: "2026-10-02", finishDate: "2026-11-01" });
  await executionCommand(site, assignmentId, "confirm_schedule", { startDate: "2026-10-02", finishDate: "2026-11-01" });
}
async function report(assignmentId: string, progress: number, note: string) {
  await executionCommand(vendorA, assignmentId, "report", { status: "in_progress", progress, note, reason: "Current execution update" });
  return service.getMine(vendorA, assignmentId);
}
async function verify(assignmentId: string) {
  if (!(await execution.detail(vendorA, assignmentId)).imageIds.length) await executionCommand(site, assignmentId, "exempt_evidence", { reason: "Physical inspection completed; client restricted photos" });
  const submitted = await executionCommand(vendorA, assignmentId, "submit", { note: "Ready for Site Manager inspection" });
  await executionCommand(site, assignmentId, "verify", { submissionId: submitted.submission!.id });
}
/** A pending review issued before execution tracking was enabled. */
async function historicalClientSubmission(assignmentId: string, imageIds: string[]) {
  const assignment = (await VendorWorkAssignmentModel.findById(assignmentId).lean())!;
  const reviewId = `legacy-review:${assignmentId}`;
  await VendorWorkReviewModel.create({ _id: reviewId, projectId: assignment.projectId, vendorId: assignment.vendorId, assignmentId, clientId: clientA.id, round: 1,
    assignmentVersionAtSubmit: assignment.version, note: "Historical approved submission", progress: 100, imageIds, submittedById: vendorA.id, submittedAt: now, status: "pending", version: 1, decision: null });
  await VendorWorkAssignmentModel.updateOne({ _id: assignmentId }, { $set: { status: "submitted_for_client", progress: 100, note: "Historical approved submission" }, $inc: { version: 1 } });
  return (await service.clientReviews(clientA, "project-a")).items.find(item => item.id === reviewId)!;
}

describe("vendor work and Client review", () => {
  it("shows Site Manager verified 100% without changing vendor-authored progress or unlocking vendor submission", async () => {
    await approve();
    await approve("order-b", "project-b", "vendor-b", [line("electric")]);
    const taskId = vendorWorkAssignmentId("order-a", 1, "cabinet");
    await SiteCompletionStateModel.create({ _id: "project-a", projectId: "project-a", version: 1,
      progress: 100, note: "Site Manager inspected this project", status: "draft", currentRound: 0,
      updatedById: admin.id, updatedAt: now, verifiedAssignmentIds: [taskId] });

    const own = await service.getMine(vendorA, taskId);
    expect(own).toMatchObject({ progress: 0, displayProgress: 100, progressSource: "site_manager", status: "ready", version: 1 });
    expect((await service.listMine(vendorA)).items[0]).toMatchObject({ progress: 0, displayProgress: 100, progressSource: "site_manager" });
    expect((await service.projectProgress(admin, "project-a")).assignments[0]).toMatchObject({ progress: 0, displayProgress: 100, progressSource: "site_manager" });
    expect((await service.listMine(vendorB)).items[0]).toMatchObject({ progress: 0, displayProgress: 0, progressSource: "vendor" });
    await expect(service.submit(vendorA, taskId, { expectedVersion: 1, idempotencyKey: "submit-only-display", note: "Not vendor reported" }))
      .rejects.toMatchObject({ code: "EXECUTION_SETUP_REQUIRED" });
    expect(await VendorWorkAssignmentModel.findById(taskId).lean()).toMatchObject({ progress: 0, status: "ready", version: 1 });
    expect(await VendorWorkReviewModel.countDocuments({ assignmentId: taskId })).toBe(0);

    await SiteCompletionStateModel.updateOne({ _id: "project-a" }, { $set: { status: "changes_requested", progress: 0, verifiedAssignmentIds: null } });
    expect(await service.getMine(vendorA, taskId)).toMatchObject({ progress: 0, displayProgress: 0, progressSource: "vendor" });
  });

  it("creates one stable assignment per approved line and blocks an amended approval after work starts", async () => {
    await approve("order-a", "project-a", "vendor-a", [line("cabinet"), line("electric")]);
    await approve("order-a", "project-a", "vendor-a", [line("cabinet"), line("electric")]);
    expect(await VendorWorkAssignmentModel.countDocuments({ projectId: "project-a" })).toBe(2);
    const tasks = await service.listMine(vendorA);
    expect(tasks.items.map(task => task.sectionLabel)).toEqual(["Carpentry", "Electrical"]);
    expect(tasks.items.every(task => task.orderRevision === 1 && task.progress === 0)).toBe(true);
    const cabinet = vendorWorkAssignmentId("order-a", 1, "cabinet");
    await prepareTracked(cabinet);
    await report(cabinet, 10, "Started");
    await expect(mongoose.connection.transaction(session => onPurchaseOrderApproved({ orderId: "order-a", projectId: "project-a", vendorId: "vendor-a", revision: 2, lines: [line("cabinet")] }, session)))
      .rejects.toMatchObject({ code: "VENDOR_WORK_AMENDMENT_RECONCILIATION_REQUIRED" });
    expect(await VendorWorkAssignmentModel.countDocuments({ status: "superseded" })).toBe(0);
  });

  it("keeps vendor and project identities isolated, and requires an explicit 100% submission", async () => {
    await approve(); await approve("order-b", "project-b", "vendor-b", [line("electric")]);
    const taskId = vendorWorkAssignmentId("order-a", 1, "cabinet");
    await expect(service.getMine(vendorB, taskId)).rejects.toMatchObject({ status: 404 });
    await expect(service.clientReviews(clientB, "project-a")).rejects.toMatchObject({ status: 404 });
    expect((await service.clientReviews(clientA, "project-a")).items).toEqual([]);
    await expect(service.submit(vendorA, taskId, { expectedVersion: 1, idempotencyKey: "submit-a", note: "Ready for inspection" }))
      .rejects.toMatchObject({ code: "EXECUTION_SETUP_REQUIRED" });
    await expect(service.progress(vendorA, taskId, { expectedVersion: 1, idempotencyKey: "progress-a", progress: 100, note: "Installation complete" })).rejects.toMatchObject({ code: "EXECUTION_SETUP_REQUIRED" });
    await prepareTracked(taskId);
    await expect(service.progress(vendorA, taskId, { expectedVersion: 1, idempotencyKey: "progress-a", progress: 100, note: "Installation complete" })).rejects.toMatchObject({ code: "EXECUTION_REPORT_REQUIRED" });
    const progress = await report(taskId, 100, "Installation complete");
    expect(progress.version).toBe(2);
    await expect(service.progress(vendorA, taskId, { expectedVersion: 1, idempotencyKey: "progress-b", progress: 100, note: "Different" })).rejects.toMatchObject({ code: "VENDOR_WORK_VERSION_CONFLICT" });
    await expect(service.submit(vendorA, taskId, { expectedVersion: 2, idempotencyKey: "submit-before-verified", note: "Complete but unverified" })).rejects.toMatchObject({ code: "EXECUTION_VERIFICATION_REQUIRED" });
    await verify(taskId);
    const review = await service.submit(vendorA, taskId, { expectedVersion: 2, idempotencyKey: "submit-a", note: "Ready for inspection" });
    expect(review.status).toBe("pending");
    expect((await service.submit(vendorA, taskId, { expectedVersion: 2, idempotencyKey: "submit-a", note: "Ready for inspection" })).id).toBe(review.id);
    expect(await VendorWorkReviewModel.countDocuments({ assignmentId: taskId })).toBe(1);
  });

  it("keeps images on their exact review round and reopens only requested work", async () => {
    await approve("order-a", "project-a", "vendor-a", [line("cabinet"), line("electric")]);
    const cabinet = vendorWorkAssignmentId("order-a", 1, "cabinet");
    const electric = vendorWorkAssignmentId("order-a", 1, "electric");
    const uploaded = await service.uploadImage(vendorA, cabinet, { expectedVersion: 1, idempotencyKey: "image-a01" }, {
      data: png, extension: ".png", originalFilename: "cabinet.png", mimeType: "image/png", sizeBytes: png.length
    });
    expect(uploaded.imageCount).toBe(1);
    const imageId = String((await VendorWorkImageModel.findOne({ assignmentId: cabinet }).lean())?._id);
    await expect(service.image(clientA, "project-a", cabinet, imageId)).rejects.toMatchObject({ status: 404 });
    const first = await historicalClientSubmission(cabinet, [imageId]);
    expect(first.imageIds).toEqual([imageId]);
    const opened = await service.image(clientA, "project-a", cabinet, imageId);
    const chunks: Buffer[] = [];
    for await (const chunk of opened.stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(png);
    await expect(service.image(clientB, "project-a", cabinet, imageId)).rejects.toMatchObject({ status: 404 });
    await expect(service.image(vendorB, "project-a", cabinet, imageId)).rejects.toMatchObject({ status: 404 });
    const changed = await service.clientDecision(clientA, "project-a", first.id, { expectedVersion: 1, idempotencyKey: "decision-a", decision: "request_changes", reason: "Align the upper cabinet" });
    expect(changed.status).toBe("changes_requested");
    expect((await service.getMine(vendorA, cabinet)).requestedChangeReason).toBe("Align the upper cabinet");
    expect((await service.getMine(vendorA, electric)).status).toBe("ready");
    await expect(service.clientDecision(clientA, "project-a", first.id, { expectedVersion: 1, idempotencyKey: "decision-b", decision: "approve", reason: null }))
      .rejects.toMatchObject({ code: "VENDOR_WORK_VERSION_CONFLICT" });
    const reopened = await service.getMine(vendorA, cabinet);
    await expect(service.submit(vendorA, cabinet, { expectedVersion: reopened.version, idempotencyKey: "submit-b", note: "Upper cabinet aligned" }))
      .rejects.toMatchObject({ code: "EXECUTION_VERIFICATION_REQUIRED" });
    await prepareTracked(cabinet);
    const revised = await report(cabinet, 100, "Upper cabinet aligned");
    await verify(cabinet);
    const second = await service.submit(vendorA, cabinet, { expectedVersion: revised.version, idempotencyKey: "submit-b", note: "Upper cabinet aligned" });
    expect(second.round).toBe(2);
    expect(second.imageIds).toEqual([]);
    await service.clientDecision(clientA, "project-a", second.id, { expectedVersion: 1, idempotencyKey: "decision-c", decision: "approve", reason: null });
    const completion = await mongoose.connection.transaction(session => readVendorWorkCompletion("project-a", session));
    expect(completion).toMatchObject({ totalAssignments: 2, approvedAssignments: 1, pendingAssignments: 1, openReviews: 0 });
    expect(await AuditEventModel.countDocuments({ action: "client_vendor_work_decided", entityId: { $in: [first.id, second.id] } })).toBe(2);
  });

  it("replays a recorded legacy progress receipt after cutover without permitting a new legacy report", async () => {
    await approve();
    const assignmentId = vendorWorkAssignmentId("order-a", 1, "cabinet");
    const original = { expectedVersion: 1, idempotencyKey: "historic-progress-receipt", progress: 40, note: "Historic progress" };
    await VendorWorkAssignmentModel.updateOne({ _id: assignmentId }, { $set: { version: 2, status: "in_progress", progress: 40, note: original.note,
      receipts: [{ kind: "progress", idempotencyKey: original.idempotencyKey, requestDigest: createHash("sha256").update(JSON.stringify(original)).digest("hex"), recordedAt: now }] } });
    const before = await VendorWorkAssignmentModel.findById(assignmentId).lean();
    expect(await service.progress(vendorA, assignmentId, original)).toMatchObject({ progress: 40, version: 2 });
    expect(await VendorWorkAssignmentModel.findById(assignmentId).lean()).toEqual(before);
    await prepareTracked(assignmentId);
    expect(await service.progress(vendorA, assignmentId, original)).toMatchObject({ progress: 40, version: 2 });
    await expect(service.progress(vendorA, assignmentId, { ...original, note: "Changed replay" })).rejects.toMatchObject({ code: "VENDOR_WORK_VERSION_CONFLICT" });
    await expect(service.progress(vendorA, assignmentId, { ...original, expectedVersion: 2, idempotencyKey: "new-legacy-report" })).rejects.toMatchObject({ code: "EXECUTION_REPORT_REQUIRED" });
    expect(await AuditEventModel.countDocuments({ action: "vendor_work_progress_updated" })).toBe(0);
  });

  it("rejects image persistence after revocation and validates decisions", async () => {
    await approve();
    expect(clientVendorWorkDecisionSchema.safeParse({ expectedVersion: 1, idempotencyKey: "decision-a", decision: "request_changes", reason: null }).success).toBe(false);
    expect(vendorWorkSubmitSchema.safeParse({ expectedVersion: 1, idempotencyKey: "submit-a", note: "" }).success).toBe(false);
    await UserModel.updateOne({ _id: vendorA.id }, { $set: { active: false } });
    await expect(service.progress(vendorA, vendorWorkAssignmentId("order-a", 1, "cabinet"), { expectedVersion: 1, idempotencyKey: "progress-a", progress: 50, note: "" }))
      .rejects.toMatchObject({ status: 403 });
    expect(await VendorWorkImageModel.countDocuments()).toBe(0);
  });

  it("cleans stored image bytes if metadata or audit cannot commit", async () => {
    await approve();
    const failing = createVendorWorkService({ audit: { ...audit, async appendInMongoTransaction() { throw new Error("Synthetic audit outage"); } }, storage, maxUploadBytes: 100_000, now: () => now });
    await expect(failing.uploadImage(vendorA, vendorWorkAssignmentId("order-a", 1, "cabinet"), { expectedVersion: 1, idempotencyKey: "image-fail" }, {
      data: png, extension: ".png", originalFilename: "cabinet.png", mimeType: "image/png", sizeBytes: png.length
    })).rejects.toThrow("Synthetic audit outage");
    expect(storedFiles.size).toBe(0);
    expect(await VendorWorkImageModel.countDocuments()).toBe(0);
    expect((await service.getMine(vendorA, vendorWorkAssignmentId("order-a", 1, "cabinet"))).version).toBe(1);
  });

  it("keeps a retryable cleanup record when image deletion fails", async () => {
    await approve();
    const failing = createVendorWorkService({ audit: { ...audit, async appendInMongoTransaction() { throw new Error("Synthetic audit outage"); } }, storage, maxUploadBytes: 100_000, now: () => now });
    const deletion = vi.spyOn(storage, "delete").mockRejectedValueOnce(new Error("Synthetic storage outage"));
    await expect(failing.uploadImage(vendorA, vendorWorkAssignmentId("order-a", 1, "cabinet"), { expectedVersion: 1, idempotencyKey: "image-fail" }, {
      data: png, extension: ".png", originalFilename: "cabinet.png", mimeType: "image/png", sizeBytes: png.length
    })).rejects.toThrow("Synthetic audit outage");
    expect(storedFiles.size).toBe(1);
    expect(await VendorWorkImageCleanupJobModel.countDocuments({ status: "pending" })).toBe(1);
    deletion.mockRestore();
    expect(await service.cleanupImages()).toEqual({ deleted: 1, failed: 0 });
    expect(storedFiles.size).toBe(0);
  });

  it("revokes a suspended vendor's task and image reads while preserving Client review", async () => {
    await approve();
    const assignmentId = vendorWorkAssignmentId("order-a", 1, "cabinet");
    const uploaded = await service.uploadImage(vendorA, assignmentId, { expectedVersion: 1, idempotencyKey: "image-suspension" }, {
      data: png, extension: ".png", originalFilename: "cabinet.png", mimeType: "image/png", sizeBytes: png.length
    });
    const imageId = uploaded.imageIds[0]!;
    await historicalClientSubmission(assignmentId, [imageId]);
    const progress = await service.getMine(vendorA, assignmentId);
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: "vendor-a" }, { $set: { status: "inactive" } });
    await expect(service.authorizeVendor(vendorA)).rejects.toMatchObject({ status: 403 });
    await expect(service.listMine(vendorA)).rejects.toMatchObject({ status: 403, code: "VENDOR_WORK_ACCESS_BLOCKED" });
    await expect(service.getMine(vendorA, assignmentId)).rejects.toMatchObject({ status: 403 });
    await expect(service.image(vendorA, "project-a", assignmentId, imageId)).rejects.toMatchObject({ status: 403 });
    await expect(service.image(vendorA, "project-a", "unknown-assignment", "unknown-image")).rejects.toMatchObject({ status: 403 });
    await expect(service.progress(vendorA, assignmentId, { expectedVersion: progress.version + 1, idempotencyKey: "progress-after-suspension", progress: 100, note: "" }))
      .rejects.toMatchObject({ status: 403 });
    expect((await service.clientReviews(clientA, "project-a")).items).toHaveLength(1);
    expect((await service.image(clientA, "project-a", assignmentId, imageId)).mimeType).toBe("image/png");
  });

  it("keeps an old pending Client round visible beyond 200 newer history rows", async () => {
    await approve("order-a", "project-a", "vendor-a", [line("cabinet"), line("electric")]);
    const pendingAssignment = vendorWorkAssignmentId("order-a", 1, "cabinet");
    const historicAssignment = vendorWorkAssignmentId("order-a", 1, "electric");
    const history = Array.from({ length: 205 }, (_, index) => ({
      _id: `historic-review-${index}`, projectId: "project-a", vendorId: "vendor-a", assignmentId: historicAssignment,
      clientId: clientA.id, round: index + 1, assignmentVersionAtSubmit: index + 1, note: "Historic work", progress: 100,
      imageIds: [], submittedById: vendorA.id, submittedAt: new Date(now.getTime() + (index + 1) * 1_000),
      status: "changes_requested", version: 2,
      decision: { decision: "request_changes", reason: "Revise section", actorId: clientA.id, decidedAt: new Date(now.getTime() + (index + 1) * 1_000), idempotencyKey: `decision-${index}`, requestDigest: "a".repeat(64) }
    }));
    await VendorWorkReviewModel.collection.insertMany([
      { _id: "pending-old", projectId: "project-a", vendorId: "vendor-a", assignmentId: pendingAssignment,
        clientId: clientA.id, round: 1, assignmentVersionAtSubmit: 1, note: "Awaiting Client", progress: 100,
        imageIds: [], submittedById: vendorA.id, submittedAt: new Date(now.getTime() - 1_000), status: "pending", version: 1, decision: null },
      ...history
    ] as any);
    const first = await service.clientReviews(clientA, "project-a", { limit: 50, offset: 0 });
    expect(first).toMatchObject({ total: 206, pendingTotal: 1, limit: 50, offset: 0 });
    expect(first.items[0]?.id).toBe("pending-old");
    expect(first.items).toHaveLength(50);
    const last = await service.clientReviews(clientA, "project-a", { limit: 50, offset: 200 });
    expect(last.items).toHaveLength(6);
    expect(last.items.some(item => item.id === "pending-old")).toBe(false);
    expect(new Set([...first.items, ...last.items].map(item => item.id)).size).toBe(56);
  });
});
