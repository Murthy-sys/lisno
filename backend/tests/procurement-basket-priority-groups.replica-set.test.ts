import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { createProcurementBasketService } from "../src/services/procurement-basket.service.js";
import { readProcurementPriorities } from "../src/services/procurement-basket-priority.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const at = new Date("2026-11-25T00:00:00.000Z");
const buyer: PublicUser = { id: "priority-buyer", name: "Synthetic buyer", email: "buyer@example.test", role: "procurement" };
const designer: PublicUser = { id: "priority-designer", name: "Synthetic designer", email: "designer@example.test", role: "designer" };
const service = createProcurementBasketService();
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => { replica = await startMongoReplicaSet("procurement-priority-tests"); }, 120_000);
beforeEach(async () => {
  await replica.clear();
  await UserModel.collection.insertMany([buyer, designer].map(actor => ({ _id: actor.id, role: actor.role, active: true })) as any[]);
});
afterAll(async () => { await replica?.stop(); });

async function seedLine(id: string, activePriority: unknown, draftPriority?: unknown) {
  const hasDraft = arguments.length >= 3;
  await AiEstimatorKnowledgeMainLineModel.collection.insertOne({ _id: id, name: "Same Main Line name", status: "active",
    basketId: "basket-a", subBasketId: "sub-a", activeRevisionId: `${id}-active`, draftRevisionId: hasDraft ? `${id}-draft` : null } as any);
  for (const status of (hasDraft ? ["active", "draft"] : ["active"]) as Array<"active" | "draft">) {
    const priority = status === "active" ? activePriority : draftPriority;
    await AiEstimatorKnowledgeRevisionModel.collection.insertOne({ _id: `${id}-${status}`, mainLineId: id,
      status, version: status === "draft" ? 2 : 1, revisionNumber: status === "draft" ? 2 : 1,
      contentDigest: status === "active" ? "b".repeat(64) : null } as any);
    await AiEstimatorKnowledgeSectionModel.collection.insertOne({ _id: `${id}-${status}-overview`, mainLineId: id,
      revisionId: `${id}-${status}`, sectionKey: "overview", applicability: "configured", version: 1,
      payload: priority === undefined ? {} : { closurePriority: priority } } as any);
  }
}
const read = (ids: string[]) => mongoose.connection.transaction(session => readProcurementPriorities(ids, session),
  { readConcern: { level: "snapshot" }, readPreference: "primary" });
const sourceLine = (id: string, mainLineId: string, amountPaise: number, extra = {}) => ({
  id, source: "configuration", itemType: "main_line", catalogueId: mainLineId, mainLineId, mainLineName: "Same Main Line name",
  roomId: "living", roomName: "Living", mainBasketId: "basket-a", mainBasketName: "Painting", subBasketId: "sub-a", subBasketName: "Walls",
  quantity: 1, included: true, unit: "sqft", rate: amountPaise / 100, amount: amountPaise / 100, ratePaise: amountPaise, amountPaise,
  classification: "special", pricingMode: "pmc", ...extra
});
async function seedProject(projectId: string, lines: ReturnType<typeof sourceLine>[]) {
  const subtotalPaise = lines.filter(line => line.included).reduce((sum, line) => sum + line.amountPaise, 0);
  await ProjectModel.collection.insertOne({ _id: projectId, name: "Synthetic project", location: "Synthetic site",
    plannedEndAt: new Date("2026-12-01T00:00:00.000Z") } as any);
  await EstimateModel.collection.insertOne({ _id: `${projectId}-estimate`, projectId, version: 2,
    status: "client_approved", designPlanStatus: "approved", designPlanVersion: 1, designPlanApprovedAt: at,
    designPlanApprovedById: buyer.id, designPlanApprovalSource: "client_portal", procurementSourceEpoch: 7,
    lineItems: lines.map(line => ({ ...line, amountPaise: 999_000 })) } as any);
  await EstimateClientReviewRoundModel.collection.insertOne({ _id: `${projectId}-round`, projectId,
    estimateId: `${projectId}-estimate`, estimateVersion: 1, status: "approved", decision: "approve",
    decisionSource: "client_portal", decidedById: buyer.id, decidedAt: at,
    estimateSnapshot: { lineItems: lines, subtotalPaise, gstPaise: 0, totalPaise: subtotalPaise,
      subtotal: subtotalPaise / 100, gst: 0, total: subtotalPaise / 100 } } as any);
}

describe("batched current Configuration priority reads", () => {
  it("selects draft before active, treats an unset draft as unset, and refreshes saved values", async () => {
    await seedLine("first", "P3", "P1");
    await seedLine("unset", "P1", undefined);
    await seedLine("active", "P2");
    const initial = await read(["first", "unset", "active", "first"]);
    expect([...initial.keys()]).toEqual(["first", "unset", "active"]);
    expect(initial.get("first")).toEqual({ state: "resolved", value: "P1", revision: { id: "first-draft", status: "draft", version: 2 } });
    expect(initial.get("unset")).toEqual({ state: "unset", value: null, revision: { id: "unset-draft", status: "draft", version: 2 } });
    expect(initial.get("active")?.value).toBe("P2");
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "first-draft-overview" }, { $set: { "payload.closurePriority": "P3" } });
    expect((await read(["first"])).get("first")?.value).toBe("P3");
    expect((await AiEstimatorKnowledgeSectionModel.findById("first-active-overview").lean())?.payload).toEqual({ closurePriority: "P3" });
  });
  it("never substitutes active values for missing draft, malformed, archived, or unowned Configuration", async () => {
    await seedLine("missing-draft", "P1");
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "missing-draft" }, { $set: { draftRevisionId: "missing-revision" } });
    await seedLine("invalid", "P4");
    await seedLine("archived", "P1");
    await AiEstimatorKnowledgeMainLineModel.collection.updateOne({ _id: "archived" }, { $set: { status: "archived" } });
    await seedLine("foreign-revision", "P1");
    await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: "foreign-revision-active" }, { $set: { mainLineId: "private-other" } });
    await seedLine("foreign-section", "P2");
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "foreign-section-active-overview" }, { $set: { mainLineId: "private-other" } });
    await seedLine("no-overview", "P1");
    await AiEstimatorKnowledgeSectionModel.collection.deleteOne({ _id: "no-overview-active-overview" });
    const result = await read(["missing", "missing-draft", "invalid", "archived", "foreign-revision", "foreign-section", "no-overview"]);
    expect([...result].map(([id, value]) => [id, value.state, value.value])).toEqual([
      ["missing", "unavailable", null], ["missing-draft", "unavailable", null], ["invalid", "invalid", null],
      ["archived", "unavailable", null], ["foreign-revision", "invalid", null], ["foreign-section", "invalid", null],
      ["no-overview", "unavailable", null]
    ]);
    expect(result.get("foreign-revision")?.revision).toBeNull();
    expect(result.get("foreign-section")?.revision).toBeNull();
    expect(JSON.stringify([...result])).not.toContain("private-other");
  });
  it("requires the existing snapshot transaction even for empty requests", async () => {
    const session = await mongoose.startSession();
    try { await expect(readProcurementPriorities([], session)).rejects.toThrow("active transaction"); }
    finally { await session.endSession(); }
  });
});

describe("authorized project basket priority projection", () => {
  it("groups mixed priorities and rooms without changing approved amounts, digests, or another project", async () => {
    await seedLine("first", "P3", "P1");
    await seedLine("third", "P3");
    await seedProject("project-a", [sourceLine("a-living", "first", 10_000), sourceLine("a-third", "third", 20_000),
      sourceLine("a-bedroom", "first", 30_000, { roomId: "bedroom", roomName: "Bedroom" })]);
    await seedProject("project-b", [sourceLine("b-third", "third", 7_124)]);
    const a = await service.list(buyer, "project-a");
    const b = await service.list(buyer, "project-b");
    expect(a.priorityGroups.map(group => [group.priority, group.lineCount, group.items.map(row => row.sourceLineItemKey)]))
      .toEqual([["P1", 2, ["a-living", "a-bedroom"]], ["P3", 1, ["a-third"]]]);
    expect(b.priorityGroups.map(group => [group.priority, group.items.map(row => row.sourceLineItemKey)]))
      .toEqual([["P3", ["b-third"]]]);
    expect(a.baskets[0]?.approvedEstimatePaise).toBe(60_000);
    expect(b.baskets[0]?.approvedEstimatePaise).toBe(7_124);
    const approvedBefore = await EstimateClientReviewRoundModel.findById("project-a-round").lean();
    const detailBefore = await service.get(buyer, "project-a", "basket-a");
    await AiEstimatorKnowledgeSectionModel.collection.updateOne({ _id: "first-draft-overview" }, { $set: { "payload.closurePriority": "P2" } });
    const changed = await service.list(buyer, "project-a");
    expect(changed.priorityGroups[0]?.priority).toBe("P2");
    expect(changed.baskets).toEqual(a.baskets);
    expect(changed.modeGroups).toEqual(a.modeGroups);
    expect((await service.get(buyer, "project-a", "basket-a")).preparationDigest).toBe(detailBefore.preparationDigest);
    expect(await EstimateClientReviewRoundModel.findById("project-a-round").lean()).toEqual(approvedBefore);
    expect((await service.list(buyer, "project-b")).priorityGroups).toEqual(b.priorityGroups);
    await expect(service.list(designer, "project-a")).rejects.toMatchObject({ status: 403 });
    await expect(service.list({ ...buyer, id: "missing-user" }, "project-a")).rejects.toMatchObject({ status: 401 });
  });
  it("retains committed excluded source rows without reviving other excluded work", async () => {
    await seedLine("first", "P1");
    await seedProject("project-a", [sourceLine("current", "first", 10_000), sourceLine("historical", "first", 20_000, { included: false }),
      sourceLine("excluded", "first", 30_000, { included: false })]);
    await ProjectPurchaseOrderModel.collection.insertOne({ _id: "order-a", projectId: "project-a", status: "issued",
      approvedRevisionId: "order-revision", cancelledAt: null, approvedNetPaise: 222, approvedGstPaise: 0, approvedTotalPaise: 222 } as any);
    await ProjectPurchaseOrderRevisionModel.collection.insertOne({ _id: "order-revision", orderId: "order-a", projectId: "project-a",
      lines: [{ procurementItemId: "child-a", sourceLineItemKey: "historical", netPaise: 222 }] } as any);
    const result = await service.list(buyer, "project-a");
    expect(result.priorityGroups[0]?.items.map(row => [row.sourceLineItemKey, row.scope]))
      .toEqual([["current", "included"], ["historical", "commitment_only"]]);
    expect(result.baskets[0]?.committedNetPaise).toBe(222);
  });
});
