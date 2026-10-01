import mongoose from "mongoose";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inspectProjectVendorWorkflow, runProjectVendorWorkflowInventory } from
  "../src/migrations/project-vendor-workflow-inventory.js";
import { PROCUREMENT_ACTIVE_INDEX_KEY, PROCUREMENT_ACTIVE_INDEX_NAME } from
  "../src/migrations/project-procurement-source-index.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectProcurementItemModel } from "../src/models/ProjectProcurementItem.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { VendorWorkAssignmentModel } from "../src/models/VendorWorkAssignment.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const db = () => mongoose.connection.db!;
const collection = (name: string) => db().collection(name);
const names = {
  projects: ProjectModel.collection.name,
  tasks: ProjectWorkflowTaskModel.collection.name,
  orders: ProjectPurchaseOrderModel.collection.name,
  revisions: ProjectPurchaseOrderRevisionModel.collection.name,
  assignments: VendorWorkAssignmentModel.collection.name,
  children: ProjectProcurementItemModel.collection.name
};
const child = (id: string, projectId: string, extra: Record<string, unknown> = {}) => ({
  _id: id, projectId, estimateId: "estimate-1", estimateVersion: 1, estimateReviewRoundId: "round-1",
  sourceSectionId: "section-1", sourceLineItemKey: `line-${id}`, itemNameNormalized: "material",
  brandNormalized: "brand", uomId: "sheet", vendorId: null, removedAt: null, ...extra
});

beforeAll(async () => {
  replica = await startMongoReplicaSet("vendor-workflow-inventory-test");
  await Promise.all(Object.values(names).map((name) => db().createCollection(name)));
  await collection(names.children).createIndex(PROCUREMENT_ACTIVE_INDEX_KEY, {
    unique: true, name: PROCUREMENT_ACTIVE_INDEX_NAME, partialFilterExpression: { removedAt: null }
  });
}, 120_000);
afterAll(async () => { await replica?.stop(); });

describe("vendor workflow cutover inventory", () => {
  it("reports transition and allocations without writing to any collection", async () => {
    await collection(names.projects).insertMany([
      { _id: "vendor-project" as any, status: "active", completionAuthority: "vendor_client", completionAuthorityVersion: 1 },
      { _id: "legacy-project" as any, status: "active", completionAuthority: "legacy_staff", completionAuthorityVersion: 1 },
      { _id: "completed-project" as any, status: "completed", completionAuthority: "legacy_staff", completionAuthorityVersion: 1 }
    ]);
    await collection(names.tasks).insertMany([
      { _id: "superseded-trade" as any, projectId: "vendor-project", kind: "trade_execution", supersededAt: new Date() },
      { _id: "legacy-trade" as any, projectId: "legacy-project", kind: "trade_execution", supersededAt: null }
    ]);
    await collection(names.orders).insertOne({ _id: "order-1" as any, projectId: "vendor-project", status: "approved",
      approvedRevision: 1, cancelledAt: null });
    await collection(names.revisions).insertOne({ _id: "revision-1" as any, orderId: "order-1", revision: 1,
      lines: [{ procurementItemId: "child-1" }] });
    await collection(names.assignments).insertOne({ _id: "assignment-1" as any, projectId: "vendor-project",
      orderId: "order-1", orderRevision: 1, status: "ready" });
    await collection(names.children).insertMany([
      child("child-1", "vendor-project", { allocationTrackingVersion: 1, allocatedWorkPaise: 125_000 }),
      child("removed-child", "vendor-project", { removedAt: new Date(), removedById: "buyer", removalReason: "Duplicate" })
    ]);
    const before = await Promise.all(Object.values(names).map(async (name) => ({
      name, rows: await collection(name).find().toArray(), indexes: await collection(name).listIndexes().toArray()
    })));

    const report = await inspectProjectVendorWorkflow(db());
    expect(report).toMatchObject({
      mode: "dry-run", projects: { total: 3, activeByAuthority: { vendor_client: 1, legacy_staff: 1 },
        completedByAuthority: { legacy_staff: 1 } },
      staffTradeTasks: { total: 2, unsuperseded: 1, unsupersededForVendorProjects: 0 },
      purchaseOrders: { total: 1, withApprovedRevision: 1 }, vendorTasks: { total: 1, active: 1 },
      procurementChildren: { active: 1, removed: 1, activeWithTrackedAllocation: 1,
        trackedAllocationTotalPaise: "125000", activeIndexPresent: true, supersededIndexPresent: false },
      transition: { alreadyVendorManaged: 1, activeLegacyRequiresExplicitCutover: 1, completedHistoryPreserved: 1 },
      conflicts: [], additionalConflictCount: 0
    });
    expect(await Promise.all(Object.values(names).map(async (name) => ({
      name, rows: await collection(name).find().toArray(), indexes: await collection(name).listIndexes().toArray()
    })))).toEqual(before);
  });

  it("flags authority, staff-task, order-task, and removed-child conflicts without client details", async () => {
    await collection(names.projects).insertOne({ _id: "missing-authority" as any, status: "active" });
    await collection(names.tasks).insertOne({ _id: "live-vendor-trade" as any, projectId: "vendor-project",
      kind: "trade_execution", supersededAt: null });
    await collection(names.orders).insertOne({ _id: "legacy-order" as any, projectId: "legacy-project",
      status: "pending_approval", approvedRevision: null });
    await collection(names.orders).insertOne({ _id: "orphan-task-order" as any, projectId: "vendor-project",
      status: "approved", approvedRevision: 1 });
    await collection(names.revisions).insertOne({ _id: "revision-2" as any, orderId: "orphan-task-order", revision: 1,
      lines: [{ procurementItemId: "removed-child" }] });
    const report = await inspectProjectVendorWorkflow(db());
    expect(report.conflicts.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "ACTIVE_AUTHORITY_MISSING_OR_INVALID", "ACTIVE_AUTHORITY_VERSION_INVALID",
      "VENDOR_AUTHORITY_HAS_OPEN_STAFF_TRADE_TASK", "LEGACY_AUTHORITY_HAS_PURCHASE_ORDER",
      "APPROVED_ORDER_WITHOUT_VENDOR_TASK", "REMOVED_CHILD_REFERENCED_BY_APPROVED_ORDER"
    ]));
    expect(JSON.stringify(report)).not.toContain("clientEmail");
  });

  it("rejects apply and ambiguous database targets before connecting", async () => {
    await expect(runProjectVendorWorkflowInventory(["--apply", "--database=test"], {})).rejects.toThrow("never writes");
    await expect(runProjectVendorWorkflowInventory([], {})).rejects.toThrow("--database");
    await expect(runProjectVendorWorkflowInventory(["--database=test"], {})).rejects.toThrow("MONGODB_URI");
  });
});
