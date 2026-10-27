import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { VendorWorkAssignmentModel } from "../src/models/VendorWorkAssignment.js";
import { VendorExecutionStateModel } from "../src/models/VendorExecutionState.js";
import { readPMSources } from "../src/services/project-manager/sources.js";
import { createProjectManagerWorkspace } from "../src/services/project-manager/workspace.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const at = new Date("2026-10-27T08:00:00Z");
const pm: PublicUser = { id: "pm-source", name: "Source reviewer", email: "source@example.test", role: "site_manager" };
const approvedLines = [
  { id: "source-a", catalogueId: "CA01", roomName: "Same room label", roomId: "room-a", specification: "Joinery A", unit: "nos", quantity: 10, rate: 100, included: true, amount: 1000 },
  { id: "source-b", catalogueId: "CA02", roomName: "Same room label", roomId: "room-b", specification: "Joinery B", unit: "nos", quantity: 2, rate: 1500, included: true, amount: 3000 }
];
const allocations = [
  { id: "split-a", source: "source-a", quantity: 4, progress: 100 },
  { id: "split-b", source: "source-a", quantity: 6, progress: 0 },
  { id: "whole-b", source: "source-b", quantity: 2, progress: 80 }
];
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const workspace = createProjectManagerWorkspace({ audit: createAuditService(createMemoryRepository()), now: () => at, panels: {} });

beforeAll(async () => {
  replica = await startMongoReplicaSet("pm-source-integration");
  await Promise.all([ProjectModel, UserModel, EstimateModel, EstimateClientReviewRoundModel, ProjectPurchaseOrderModel,
    ProjectPurchaseOrderRevisionModel, VendorWorkAssignmentModel, VendorExecutionStateModel].map(model => model.syncIndexes()));
}, 120_000);
afterAll(async () => replica?.stop());
beforeEach(async () => {
  await replica.clear();
  await UserModel.create({ ...pm, _id: pm.id, emailNormalized: pm.email, passwordHash: "fixture-only", active: true });
  await ProjectModel.create({ _id: "project-source", name: "Source project", status: "active", programManagerId: pm.id, plannedStartAt: at, plannedEndAt: new Date("2026-12-01T00:00:00Z"),
    clientName: "Synthetic client", clientEmail: "client@example.test", clientEmailNormalized: "client@example.test", clientMobile: "9000000000" });
  await EstimateModel.create({ _id: "estimate-source", leadId: "lead-source", ownerId: pm.id, projectId: "project-source", version: 2,
    status: "client_approved", propertyType: "villa", lineItems: approvedLines, subtotal: 4000, gst: 720, total: 4720,
    reviews: [{ actorId: pm.id, action: "client_approved", note: "Approved", occurredAt: at }],
    designPlanStatus: "approved", designPlanVersion: 1, designPlanApprovedAt: at, designPlanApprovedById: pm.id, designPlanApprovalSource: "admin_proof", clientDecisionAt: at });
  await EstimateClientReviewRoundModel.collection.insertOne({ _id: "round-source", projectId: "project-source", estimateId: "estimate-source", estimateVersion: 1,
    status: "approved", decision: "approve", decisionSource: "admin_proof", decidedAt: at, decidedById: pm.id,
    estimateSnapshot: { clientName: "Synthetic client", projectName: "Source project", location: "Fixture", propertyType: "villa",
      lineItems: approvedLines, subtotal: 4000, gst: 720, total: 4720 } } as never);
  for (const allocation of allocations) {
    const orderId = `order-${allocation.id}`;
    const revisionId = `revision-${allocation.id}`;
    const workId = `work-${allocation.id}`;
    const line = { id: allocation.id, procurementItemId: `proc-${allocation.id}`, sourceSectionId: "CA", sourceLineItemKey: allocation.source,
      estimateId: "estimate-source", estimateVersion: 1, estimateReviewRoundId: "round-source", scopeType: "execution",
      quantityMilliUnits: allocation.quantity * 1000, uomCode: "nos", unitPricePaise: 999, netPaise: 999, gstPaise: 180, totalPaise: 1179 };
    await ProjectPurchaseOrderModel.collection.insertOne({ _id: orderId, projectId: "project-source", vendorId: `vendor-${allocation.id}`,
      orderNumber: orderId, createIdempotencyKey: orderId, status: "approved", approvedRevision: 1, approvedRevisionId: revisionId, cancelledAt: null } as never);
    await ProjectPurchaseOrderRevisionModel.collection.insertOne({ _id: revisionId, orderId, projectId: "project-source", vendorId: `vendor-${allocation.id}`,
      revision: 1, orderNumber: orderId, estimateId: "estimate-source", estimateVersion: 1, estimateReviewRoundId: "round-source", lines: [line] } as never);
    await VendorWorkAssignmentModel.collection.insertOne({ _id: workId, projectId: "project-source", vendorId: `vendor-${allocation.id}`, orderId,
      orderRevision: 1, lineId: allocation.id, procurementItemId: `proc-${allocation.id}`, estimateId: "estimate-source", estimateVersion: 1,
      estimateReviewRoundId: "round-source", sourceSectionId: "CA", sourceLineItemKey: allocation.source, roomName: "Mutable vendor label", itemName: allocation.id,
      scopeType: "execution", status: "in_progress", version: 1, progress: 0, currentRound: 1, note: "", createdAt: at, updatedAt: at } as never);
    await VendorExecutionStateModel.create({ _id: workId, assignmentId: workId, projectId: "project-source", vendorId: `vendor-${allocation.id}`,
      workflowVersion: 1, version: 1, executionRound: 1, status: "in_progress", progress: allocation.progress, acknowledgedAt: at,
      roundStartedAt: at, createdAt: at, updatedAt: at,
      schedule: { startDate: "2026-10-22", finishDate: "2026-10-31", revision: 1, confirmedAt: at, confirmedById: pm.id } });
  }
});

function source() {
  return mongoose.connection.transaction(async session => {
    const project = await ProjectModel.findById("project-source").session(session).lean();
    return readPMSources(pm, project!, session, at);
  });
}

describe("PM immutable progress source integration", () => {
  it("weights approved net amounts after quantity splitting and separates rooms by frozen ID", async () => {
    const data = await source();
    // A is 40% of ₹1,000 and B is 80% of ₹3,000: ₹2,800 / ₹4,000 = 70%.
    expect(data.progress).toMatchObject({ actual: 70, planned: 50, availability: "available", requiredLines: 2, coveredLines: 2,
      sourceRevision: "estimate-source:1:round-source", reportedComplete: 1, siteVerified: 0, clientAccepted: 0 });
    expect(data.lines.map(line => line.netPaise)).toEqual([100_000, 300_000]);
    const overview = await workspace.overview(pm, "project-source");
    expect(overview.project).toMatchObject({ approvedNetPaise: 400_000, progress: { actual: 70 } });
    const site = await workspace.site(pm, "project-source");
    expect(site.items.map(room => ({ id: room.id, title: room.title, progress: room.progress, children: room.children?.map(item => item.id) }))).toEqual([
      { id: "room-a", title: "Same room label", progress: 40, children: ["work-split-a", "work-split-b"] },
      { id: "room-b", title: "Same room label", progress: 80, children: ["work-whole-b"] }
    ]);
  });

  it("keeps approved weights and rooms when editable estimate content and issued vendor prices differ", async () => {
    await EstimateModel.collection.updateOne({ _id: "estimate-source" } as never, { $set: { status: "draft", subtotal: 999_999, total: 999_999,
      lineItems: approvedLines.map(line => ({ ...line, amount: 1, roomId: "wrong-room", roomName: "Renamed draft room" })) } });
    await ProjectPurchaseOrderRevisionModel.collection.updateMany({}, { $set: { "lines.0.netPaise": 9_999_999, "lines.0.unitPricePaise": 9_999_999 } });
    const data = await source();
    expect(data.progress.actual).toBe(70);
    expect(data.source).toMatchObject({ subtotalPaise: 400_000, estimateReviewRoundId: "round-source" });
    expect(data.source!.allLineItems.map(line => line.roomId)).toEqual(["room-a", "room-b"]);
  });

  it("does not invent progress for unissued scope or stale issued approval lineage", async () => {
    await ProjectPurchaseOrderModel.deleteOne({ _id: "order-whole-b" });
    await VendorWorkAssignmentModel.deleteOne({ _id: "work-whole-b" });
    let data = await source();
    expect(data.lines.find(line => line.id === "source-b")!.scope).toBe("unknown");
    expect(data.progress).toMatchObject({ actual: null, planned: null, availability: "source_unavailable" });
    const rooms = (await workspace.site(pm, "project-source")).items;
    expect(rooms.find(room => room.id === "room-b")).toMatchObject({ progress: null, children: [] });
    await ProjectPurchaseOrderRevisionModel.collection.updateMany({}, { $set: { estimateReviewRoundId: "superseded-round" } });
    data = await source();
    expect(data.progress.actual).toBeNull();
    expect(data.lines.every(line => line.scope === "unknown")).toBe(true);
  });

  it("requires an immutable approval snapshot and current tracked progress", async () => {
    await VendorExecutionStateModel.deleteOne({ _id: "work-split-a" });
    expect((await source()).progress).toMatchObject({ actual: null, availability: "source_unavailable" });
    await EstimateClientReviewRoundModel.deleteOne({ _id: "round-source" });
    const data = await source();
    expect(data.source).toBeNull();
    expect(data.progress).toMatchObject({ actual: null, planned: null, availability: "no_data", sourceRevision: null });
    expect(data.progress.issues).toContain("An immutable approved estimate snapshot is required to measure execution value.");
  });
});
