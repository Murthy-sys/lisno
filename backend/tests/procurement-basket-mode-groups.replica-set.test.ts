import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { ProjectPurchaseOrderModeDecisionModel } from "../src/models/ProjectPurchaseOrderModeDecision.js";
import { createProcurementBasketService } from "../src/services/procurement-basket.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const at = new Date("2026-10-08T00:00:00.000Z");
const buyer: PublicUser = { id: "group-buyer", name: "Buyer", email: "buyer@example.test", role: "procurement" };
const designer: PublicUser = { id: "group-designer", name: "Designer", email: "designer@example.test", role: "designer" };
const service = createProcurementBasketService();
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const sourceLine = (id: string, amountPaise: number, classification?: string, pricingMode?: string, extra = {}) => ({
  id, source: "configuration", itemType: "main_line", catalogueId: "main-a", mainLineId: "main-a", mainLineName: "Wall finish",
  roomId: "room-a", roomName: "Living", mainBasketId: "basket-a", mainBasketName: "Painting",
  subBasketId: "sub-a", subBasketName: "Walls", quantity: 1, included: true, unit: "sqft",
  rate: amountPaise / 100, amount: amountPaise / 100, ratePaise: amountPaise, amountPaise,
  ...(classification === undefined ? {} : { classification }), ...(pricingMode === undefined ? {} : { pricingMode }), ...extra });
const lines = () => [sourceLine("standard", 10_000, "standard"), sourceLine("special-sub", 20_000, "special", "sub_vendor"),
  sourceLine("in-house", 30_000, "special", "in_house", { roomId: "room-b", roomName: "Dining" }),
  sourceLine("pmc", 40_000, "special", "pmc", { itemType: "temporary", subBasketId: null, subBasketName: null }),
  sourceLine("historical", 5_000, undefined, undefined, { mainBasketId: "basket-legacy" }),
  sourceLine("unknown", 6_000, "special", undefined, { mainBasketId: "basket-unknown" }),
  sourceLine("zero", 0, "special", "pmc"), sourceLine("excluded", 0, "special", "in_house", { included: false }),
  sourceLine("same-name", 7_000, "special", "in_house", { mainBasketId: "basket-b" })];

async function seedProject(projectId: string, approvedLines: ReturnType<typeof sourceLine>[]) {
  const subtotalPaise = approvedLines.filter(line => line.included).reduce((sum, line) => sum + line.amountPaise, 0);
  await ProjectModel.collection.insertOne({ _id: projectId, name: "Fixture project", location: "Fixture site",
    plannedEndAt: new Date("2026-12-01T00:00:00.000Z") } as any);
  await EstimateModel.collection.insertOne({ _id: `${projectId}-estimate`, projectId, version: 2,
    status: "client_approved", designPlanStatus: "approved", designPlanVersion: 1, designPlanApprovedAt: at,
    designPlanApprovedById: buyer.id, designPlanApprovalSource: "client_portal", procurementSourceEpoch: 7,
    lineItems: approvedLines.map(line => ({ ...line, classification: "special", pricingMode: "pmc", amount: 999, amountPaise: 99_900 })) } as any);
  await EstimateClientReviewRoundModel.collection.insertOne({ _id: `${projectId}-round`, projectId,
    estimateId: `${projectId}-estimate`, estimateVersion: 1, status: "approved", decision: "approve",
    decisionSource: "client_portal", decidedById: buyer.id, decidedAt: at,
    estimateSnapshot: { lineItems: approvedLines, subtotalPaise, gstPaise: 0, totalPaise: subtotalPaise,
      subtotal: subtotalPaise / 100, gst: 0, total: subtotalPaise / 100,
      selectedMainBasketIds: ["basket-legacy"], selectedMainBasketClassifications: [{ mainBasketId: "basket-legacy", classification: "standard" }] } } as any);
}
async function databaseState() {
  const collections = await mongoose.connection.db!.collections();
  return Object.fromEntries(await Promise.all(collections.map(async collection => [collection.collectionName,
    JSON.stringify(await collection.find().sort({ _id: 1 }).toArray())])));
}
beforeAll(async () => { replica = await startMongoReplicaSet("procurement-basket-mode-groups-tests"); }, 120_000);
beforeEach(async () => {
  await replica.clear();
  await UserModel.collection.insertMany([buyer, designer].map(actor => ({ _id: actor.id, role: actor.role, active: true })) as any[]);
  await seedProject("project-a", lines());
  await seedProject("project-b", [sourceLine("other-project", 12_124, "special", "pmc", { mainBasketId: "basket-other" })]);
});
afterAll(async () => { await replica?.stop(); });

describe("real approved source to procurement mode group transaction", () => {
  it("propagates approved per-line and legacy modes, preserves whole baskets, and performs no writes", async () => {
    const before = await databaseState();
    const result = await service.list(buyer, "project-a");
    const detail = await service.get(buyer, "project-a", "basket-a");
    expect(result.estimateSource).toEqual({ estimateId: "project-a-estimate", estimateVersion: 1, estimateReviewRoundId: "project-a-round" });
    expect(result.modeGroups.map(group => [group.mode, group.includedLineCount, group.approvedEstimatePaise]))
      .toEqual([["in_house", 2, 37_000], ["sub_vendor", 3, 35_000], ["pmc", 1, 40_000], ["unrecorded", 1, 6_000]]);
    expect(result.modeGroups.reduce((sum, group) => sum + group.approvedEstimatePaise, 0)).toBe(118_000);
    expect(result.baskets.reduce((sum, basket) => sum + basket.approvedEstimatePaise, 0)).toBe(118_000);
    expect(result.modeGroups.every(group => group.currentCostPaise === null && group.boqReadyLineCount === 0)).toBe(true);
    expect(detail.lines.map(line => line.sourceLineItemKey)).toEqual(["standard", "special-sub", "in-house", "pmc", "zero", "excluded"]);
    expect(detail.lines.find(line => line.sourceLineItemKey === "pmc")?.estimateMode).toMatchObject({ mode: "pmc", provenance: "line" });
    expect((await service.get(buyer, "project-a", "basket-legacy")).lines[0]?.estimateMode)
      .toMatchObject({ mode: "sub_vendor", provenance: "legacy_basket", approvedClassification: null });
    expect((await service.list(buyer, "project-b")).modeGroups[2]?.approvedEstimatePaise).toBe(12_124);
    expect(await databaseState()).toEqual(before);
  });
  it("preserves approved grouping after newer draft fields and a different Procurement decision", async () => {
    const before = await service.list(buyer, "project-a");
    await EstimateModel.collection.updateOne({ _id: "project-a-estimate" }, { $set: {
      "lineItems.0.classification": "special", "lineItems.0.pricingMode": "in_house" } });
    await ProjectPurchaseOrderModeDecisionModel.collection.insertOne({ _id: "decision-a", projectId: "project-a",
      estimateId: "project-a-estimate", estimateVersion: 1, estimateReviewRoundId: "project-a-round",
      sourceLineItemKey: "standard", mainLineId: "main-a", mode: "pmc", quantity: "1", discountBps: 0,
      markupBasis: "starting", revisionId: null, revisionDigest: null, exceptionReason: null,
      version: 1, updatedAt: at } as any);
    const after = await service.list(buyer, "project-a");
    expect(after.modeGroups).toEqual(before.modeGroups);
    expect((await service.get(buyer, "project-a", "basket-a")).lines[0]?.mode?.decision?.mode).toBe("pmc");
  });
  it("reconciles actionable and reference-only commitments without leaking another project's order", async () => {
    await ProjectPurchaseOrderModel.collection.insertMany([
      { _id: "order-a", projectId: "project-a", status: "issued", approvedRevisionId: "revision-a", cancelledAt: null,
        approvedNetPaise: 666, approvedGstPaise: 0, approvedTotalPaise: 666 },
      { _id: "order-b", projectId: "project-b", status: "issued", approvedRevisionId: "revision-b", cancelledAt: null,
        approvedNetPaise: 999, approvedGstPaise: 0, approvedTotalPaise: 999 }
    ] as any[]);
    await ProjectPurchaseOrderRevisionModel.collection.insertMany([
      { _id: "revision-a", orderId: "order-a", projectId: "project-a", lines: [
        { procurementItemId: "child-a", sourceLineItemKey: "standard", netPaise: 111 },
        { procurementItemId: "child-zero", sourceLineItemKey: "zero", netPaise: 222 },
        { procurementItemId: "child-excluded", sourceLineItemKey: "excluded", netPaise: 333 }] },
      { _id: "revision-b", orderId: "order-b", projectId: "project-b", lines: [
        { procurementItemId: "child-other", sourceLineItemKey: "standard", netPaise: 999 }] }
    ] as any[]);
    const result = await service.list(buyer, "project-a");
    expect(result.modeGroups.map(group => group.committedNetPaise)).toEqual([333, 111, 222, 0]);
    expect(result.baskets.reduce((sum, basket) => sum + basket.committedNetPaise, 0)).toBe(666);
    expect(result.modeGroups.reduce((sum, group) => sum + group.includedLineCount, 0)).toBe(7);
  });
  it("keeps invalid display metadata visible without adding a new commercial blocker", async () => {
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "project-a-round" }, { $set: {
      "estimateSnapshot.lineItems.0.pricingMode": "in_house", "estimateSnapshot.lineItems.1.classification": "invalid" } });
    const result = await service.list(buyer, "project-a");
    expect(result.modeGroups.find(group => group.mode === "unrecorded"))
      .toMatchObject({ includedLineCount: 3, approvedEstimatePaise: 36_000, modeIssueCount: 3 });
    const detail = await service.get(buyer, "project-a", "basket-a");
    expect(detail.lines[0]?.estimateMode?.issues[0]?.code).toBe("ESTIMATE_MODE_CONFLICT");
    expect(detail.lines[1]?.estimateMode?.issues[0]?.code).toBe("ESTIMATE_CLASSIFICATION_INVALID");
    expect(detail.lines).toHaveLength(6);
  });
  it("retains actor denial, project identity, missing basket and approved-source guards", async () => {
    await expect(service.list(designer, "project-a")).rejects.toMatchObject({ status: 403 });
    await expect(service.list({ ...buyer, id: "missing-user" }, "project-a")).rejects.toMatchObject({ status: 401 });
    await expect(service.get(buyer, "project-b", "basket-a")).rejects.toMatchObject({ status: 404 });
    await EstimateClientReviewRoundModel.collection.updateOne({ _id: "project-a-round" }, { $set: { projectId: "project-b" } });
    await expect(service.list(buyer, "project-a")).rejects.toMatchObject({ code: "PROCUREMENT_APPROVAL_SOURCE_CONFLICT" });
  });
});
