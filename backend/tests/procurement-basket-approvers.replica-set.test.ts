import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { EstimateModel } from "../src/models/Estimate.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { UserModel } from "../src/models/User.js";
import { assertBasketFrozenApprovers, resolveBasketProjectApprovers } from "../src/services/procurement-basket-approvers.service.js";
import { tenderTransaction } from "../src/services/procurement-basket-tender-support.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const at = new Date("2026-10-06T00:00:00Z");
const slots = ["program_manager", "designer"];
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const resolve = (requiredSlots = slots, fence = false) => tenderTransaction(session =>
  resolveBasketProjectApprovers("project-a", "estimate-a", requiredSlots, session, fence));
beforeAll(async () => { replica = await startMongoReplicaSet("basket-project-approvers"); });
afterAll(async () => replica.stop());
afterEach(() => vi.restoreAllMocks());
beforeEach(async () => {
  await replica.clear();
  await ProjectModel.collection.insertOne({ _id: "project-a", status: "active", assignedDesignerIds: ["designer-a"],
    purchaseOrderApprovalEpoch: 0 } as never);
  await EstimateModel.collection.insertOne({ _id: "estimate-a", projectId: "project-a", designPlanDesignerId: "designer-a" } as never);
  await UserModel.create(["site-a", "site-b", "designer-a", "designer-b"].map(id => ({
    _id: id, name: id, email: `${id}@example.test`, emailNormalized: `${id}@example.test`,
    passwordHash: "fixture", active: true, role: id.startsWith("site") ? "site_manager" : "designer"
  })));
  await ProjectWorkflowTaskModel.create({ _id: "site-task", dedupeKey: "estimate-a:site", projectId: "project-a",
    estimateId: "estimate-a", designPlanVersion: 1, kind: "site_execution", title: "Site work",
    assigneeRole: "site_manager", assigneeUserId: "site-a", openedAt: at, dueAt: at, progress: 35 });
});

describe("project-assigned basket approvers", () => {
  it("resolves existing assignments without a Program Manager and keeps preview read-only", async () => {
    const beforeTask = await ProjectWorkflowTaskModel.findById("site-task").lean();
    expect(await resolve()).toEqual({ assignedSiteManager: { id: "site-a", name: "site-a" },
      assignedDesigner: { id: "designer-a", name: "designer-a" }, approverBlockers: [] });
    expect(await ProjectWorkflowTaskModel.findById("site-task").lean()).toEqual(beforeTask);
    expect(await ProjectModel.findById("project-a").lean()).toMatchObject({ purchaseOrderApprovalEpoch: 0 });
    await resolve(slots, true);
    const { awardApprovalEpoch: _epoch, ...task } = (await ProjectWorkflowTaskModel.findById("site-task").lean())!;
    const { awardApprovalEpoch: _beforeEpoch, ...before } = beforeTask!;
    expect(task).toEqual(before);
    expect(_epoch).toBe(1);
  });

  it.each(["missing", "inactive", "wrong-role", "ambiguous"])("reports a %s Site Manager assignment", async (state) => {
    if (state === "missing") await ProjectWorkflowTaskModel.updateOne({ _id: "site-task" }, { $set: { assigneeUserId: null } });
    if (state === "inactive") await UserModel.updateOne({ _id: "site-a" }, { $set: { active: false } });
    if (state === "wrong-role") await UserModel.updateOne({ _id: "site-a" }, { $set: { role: "program_manager" } });
    if (state === "ambiguous") {
      const task = (await ProjectWorkflowTaskModel.findById("site-task").lean())!;
      await ProjectWorkflowTaskModel.create({ ...task, _id: "duplicate", dedupeKey: "conflicting-site-task", assigneeUserId: "site-b" });
    }
    const current = await resolve();
    expect(current.assignedSiteManager).toBeNull();
    expect(current.approverBlockers).toEqual([expect.objectContaining({ slot: "program_manager" })]);
  });

  it("uses the approved-source Designer among multiple members and rejects contradictory task ownership", async () => {
    await ProjectModel.updateOne({ _id: "project-a" }, { $set: { assignedDesignerIds: ["designer-b", "designer-a"] } });
    expect((await resolve()).assignedDesigner?.id).toBe("designer-a");
    await ProjectWorkflowTaskModel.create({ _id: "design-task", dedupeKey: "estimate-a:design", projectId: "project-a",
      estimateId: "estimate-a", designPlanVersion: 1, kind: "design_plan_upload", title: "Design",
      assigneeRole: "designer", assigneeUserId: "designer-b", openedAt: at });
    expect((await resolve()).approverBlockers).toEqual([expect.objectContaining({ code: "PROCUREMENT_BASKET_DESIGNER_AMBIGUOUS" })]);
  });

  it.each(["missing", "inactive", "ambiguous"])("reports a %s Designer assignment", async (state) => {
    if (state === "inactive") await UserModel.updateOne({ _id: "designer-a" }, { $set: { active: false } });
    else {
      await EstimateModel.updateOne({ _id: "estimate-a" }, { $set: { designPlanDesignerId: null } });
      await ProjectModel.updateOne({ _id: "project-a" }, { $set: { assignedDesignerIds: state === "missing" ? [] : ["designer-a", "designer-b"] } });
    }
    expect((await resolve()).approverBlockers).toEqual([expect.objectContaining({ slot: "designer" })]);
  });

  it("does not block Procurement-only awards on unrelated assignments or freeze their identities", async () => {
    await ProjectWorkflowTaskModel.deleteMany({});
    await ProjectModel.updateOne({ _id: "project-a" }, { $set: { assignedDesignerIds: [] } });
    const current = await resolve(["procurement"], true);
    expect(current.approverBlockers).toEqual([]);
    expect(() => assertBasketFrozenApprovers({ requiredSlots: ["procurement"],
      programManagerId: "old-site", designerId: "old-designer" }, current)).not.toThrow();
  });

  it.each(["site-b", null])("serializes concurrent Site Manager reassignment to %s without changing task progress", async (assigneeUserId) => {
    let reached!: () => void;
    let release!: () => void;
    const reachedFence = new Promise<void>(resolve => { reached = resolve; });
    const released = new Promise<void>(resolve => { release = resolve; });
    const original = ProjectWorkflowTaskModel.updateOne;
    let gated = false;
    vi.spyOn(ProjectWorkflowTaskModel, "updateOne").mockImplementation(((filter: any, update: any, options: any) => {
      if (!gated && update.$inc?.awardApprovalEpoch) {
        gated = true;
        reached();
        return released.then(() => original.call(ProjectWorkflowTaskModel, filter, update, options));
      }
      return original.call(ProjectWorkflowTaskModel, filter, update, options);
    }) as never);
    const pending = tenderTransaction(async session => {
      const current = await resolveBasketProjectApprovers("project-a", "estimate-a", slots, session, true);
      assertBasketFrozenApprovers({ requiredSlots: slots, programManagerId: "site-a", designerId: "designer-a" }, current);
    }).catch(error => error);
    await reachedFence;
    await original.call(ProjectWorkflowTaskModel, { _id: "site-task" },
      { $set: { assigneeUserId }, $inc: { version: 1 } });
    release();
    expect(await pending).toMatchObject({ status: 409, code: assigneeUserId ? "PROCUREMENT_BASKET_PROPOSAL_STALE" : "PROCUREMENT_BASKET_SITE_MANAGER_REQUIRED" });
    expect(await ProjectWorkflowTaskModel.findById("site-task").lean()).toMatchObject({ assigneeUserId, version: 2, progress: 35, awardApprovalEpoch: 0 });
  });
});
