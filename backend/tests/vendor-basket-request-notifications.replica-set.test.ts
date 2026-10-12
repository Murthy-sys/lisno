import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { VendorBasketRequestDto } from "../src/contracts/vendor-basket-request.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { UserModel } from "../src/models/User.js";
import { VendorBasketRequestModel } from "../src/models/VendorBasketRequest.js";
import { VendorBasketRequestNotificationModel } from "../src/models/VendorBasketRequestNotification.js";
import { aiEstimatorKnowledgeActorGuard } from "../src/services/ai-estimator-knowledge-actor.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { appendSubmittedBasketNotification, createVendorBasketRequestNotificationService } from "../src/services/vendor-basket-request-notifications.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const ADMIN: PublicUser = { id: "basket-alert-admin", role: "super_admin", name: "Review Fixture", email: "admin@basket-alert.invalid" };
const PROCUREMENT: PublicUser = { id: "basket-alert-procurement", role: "procurement", name: "Procurement Fixture", email: "procurement@basket-alert.invalid" };
const submittedAt = new Date("2026-10-12T09:00:00.000Z");
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("basket-request-notifications");
  await Promise.all([UserModel, AuthorizationCoordinationModel, VendorBasketRequestModel, VendorBasketRequestNotificationModel].map(model => model.syncIndexes()));
}, 120_000);
beforeEach(async () => {
  await replica.clear();
  await UserModel.create([ADMIN, PROCUREMENT].map(actor => ({ _id: actor.id, name: actor.name,
    email: actor.email, emailNormalized: actor.email, role: actor.role, active: true, passwordHash: "fixture-only" })));
  await AuthorizationCoordinationModel.create({ _id: "authorization", revision: 1, updatedAt: submittedAt });
});
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => { await replica.stop(); });

function requestDto(id: string, extra: Partial<VendorBasketRequestDto> = {}): VendorBasketRequestDto {
  return { id, requesterId: PROCUREMENT.id, vendorId: null, vendorName: "Fixture Vendor", proposedName: `Basket ${id}`,
    status: "pending", version: 1, basketId: null, subBasketId: null, mainLineId: null, reason: null,
    createdAt: submittedAt.toISOString(), decidedAt: null, decidedById: null, ...extra };
}
async function submit(value: VendorBasketRequestDto) {
  await mongoose.connection.transaction(async session => {
    await VendorBasketRequestModel.create([{
      _id: value.id, requesterId: value.requesterId, vendorId: null, vendorKey: "name:fixture vendor",
      vendorName: value.vendorName, vendorNameNormalized: "fixture vendor", proposedName: value.proposedName,
      proposedNameNormalized: value.proposedName.toLowerCase(), status: "pending", version: 1,
      idempotencyKey: `submit-${value.id}`, requestFingerprint: "fixture", createdAt: submittedAt,
      ...(value.proposalId ? { kind: "configuration_proposal", proposalId: value.proposalId } : {})
    }], { session });
    await appendSubmittedBasketNotification({ request: value, requester: PROCUREMENT }, session);
  });
}

describe("durable basket request notifications", { timeout: 30_000 }, () => {
  it("atomically records legacy, full Main Basket, Sub-Basket and revision submissions with exact identity", async () => {
    await submit(requestDto("legacy"));
    await submit(requestDto("main", { proposalId: "proposal-main", kind: "configuration_proposal", target: { kind: "new_main_basket" } }));
    await submit(requestDto("sub", { proposalId: "proposal-sub", kind: "configuration_proposal", target: { kind: "new_sub_basket", basketId: "existing-parent-b" }, targetParentName: "Parent B" }));
    await submit(requestDto("revised", { proposalId: "proposal-revised", kind: "configuration_proposal" }));
    const page = await createVendorBasketRequestNotificationService().list(ADMIN, {});
    expect(page.unreadCount).toBe(4);
    expect(page.pagination).toEqual({ limit: 20, offset: 0, total: 4, hasMore: false });
    expect(page.items.find(row => row.requestId === "sub")).toMatchObject({ type: "basket_request.submitted", proposalId: "proposal-sub",
      target: { kind: "new_sub_basket", basketId: "existing-parent-b" }, targetParentName: "Parent B", requester: { id: PROCUREMENT.id, name: PROCUREMENT.name },
      createdAt: submittedAt.toISOString(), readAt: null, status: "pending" });
    expect(page.items.find(row => row.requestId === "legacy")).toMatchObject({ proposalId: null, target: { kind: "new_main_basket" }, targetParentName: null });
    expect(Object.keys(page.items[0]!).sort()).toEqual(["id", "type", "requestId", "proposalId", "target", "targetParentName", "proposedName", "vendorName", "requester", "status", "createdAt", "readAt"].sort());
  });

  it("keeps one immutable notification and read state across concurrent and repeated helper calls", async () => {
    const value = requestDto("retry");
    await submit(value);
    const service = createVendorBasketRequestNotificationService({ now: () => new Date("2026-10-12T09:01:00Z") });
    const first = (await service.list(ADMIN, {})).items[0]!;
    const marked = await service.read(ADMIN, first.id);
    await Promise.all([1, 2, 3].map(() => mongoose.connection.transaction(async session => {
      await appendSubmittedBasketNotification({ request: { ...value, proposedName: "Changed display must not overwrite" }, requester: PROCUREMENT }, session);
    })));
    expect(await VendorBasketRequestNotificationModel.countDocuments()).toBe(1);
    expect((await service.list(ADMIN, {})).items).toEqual([marked]);
    expect(await service.read(ADMIN, first.id)).toEqual(marked);
  });

  it.each(["missing", "inactive"] as const)("rolls back submission with a %s Super Admin", async kind => {
    if (kind === "missing") await UserModel.deleteOne({ _id: ADMIN.id });
    else await UserModel.updateOne({ _id: ADMIN.id }, { $set: { active: false } });
    await expect(submit(requestDto(kind))).rejects.toMatchObject({ code: "SOLE_SUPER_ADMIN_REQUIRED" });
    expect(await VendorBasketRequestModel.countDocuments()).toBe(0);
    expect(await VendorBasketRequestNotificationModel.countDocuments()).toBe(0);
  });

  it("fails closed for multiple active Super Admin records even in a corrupt recipient directory", async () => {
    await UserModel.collection.dropIndex("one_super_admin");
    try {
      await UserModel.create({ _id: "second-admin", name: "Duplicate Fixture", email: "duplicate@basket-alert.invalid", emailNormalized: "duplicate@basket-alert.invalid",
        role: "super_admin", active: true, passwordHash: "fixture-only" });
      await expect(submit(requestDto("multiple"))).rejects.toMatchObject({ code: "SOLE_SUPER_ADMIN_REQUIRED" });
      expect(await VendorBasketRequestModel.countDocuments()).toBe(0);
      expect(await VendorBasketRequestNotificationModel.countDocuments()).toBe(0);
    } finally {
      await UserModel.deleteOne({ _id: "second-admin" });
      await UserModel.collection.createIndex({ role: 1 }, { name: "one_super_admin", unique: true, partialFilterExpression: { role: "super_admin" } });
    }
  });

  it("rolls back a request when notification persistence fails, then safely retries", async () => {
    vi.spyOn(VendorBasketRequestNotificationModel, "updateOne").mockImplementationOnce(() => { throw new Error("fixture notification persistence failure"); });
    await expect(submit(requestDto("failed"))).rejects.toThrow("fixture notification persistence failure");
    expect(await VendorBasketRequestModel.countDocuments()).toBe(0);
    expect(await VendorBasketRequestNotificationModel.countDocuments()).toBe(0);
    await submit(requestDto("failed"));
    expect(await VendorBasketRequestModel.countDocuments()).toBe(1);
    expect(await VendorBasketRequestNotificationModel.countDocuments()).toBe(1);
  });

  it("rolls back its alert with any later failure in the caller's transaction", async () => {
    await expect(mongoose.connection.transaction(async session => {
      const value = requestDto("abort");
      await VendorBasketRequestModel.create([{ _id: value.id, requesterId: PROCUREMENT.id, vendorKey: "name:fixture vendor", vendorName: value.vendorName,
        vendorNameNormalized: "fixture vendor", proposedName: value.proposedName, proposedNameNormalized: "abort", status: "pending", version: 1,
        idempotencyKey: "abort-request", requestFingerprint: "fixture", createdAt: submittedAt }], { session });
      await appendSubmittedBasketNotification({ request: value, requester: PROCUREMENT }, session);
      throw new Error("fixture audit failure after alert");
    })).rejects.toThrow("fixture audit failure after alert");
    expect(await VendorBasketRequestModel.countDocuments()).toBe(0);
    expect(await VendorBasketRequestNotificationModel.countDocuments()).toBe(0);
  });

  it("does not allow helper writes outside a transaction or for an absent pending request", async () => {
    const session = await mongoose.startSession();
    try {
      await expect(appendSubmittedBasketNotification({ request: requestDto("no-transaction"), requester: PROCUREMENT }, session)).rejects.toThrow("active transaction");
    } finally { await session.endSession(); }
    await expect(mongoose.connection.transaction(session => appendSubmittedBasketNotification({ request: requestDto("absent"), requester: PROCUREMENT }, session)))
      .rejects.toThrow("persisted pending request");
    expect(await VendorBasketRequestNotificationModel.countDocuments()).toBe(0);
  });

  it("joins decided status and counts all unread notifications independently of the page", async () => {
    for (let index = 0; index < 3; index += 1) await submit(requestDto(`page-${index}`));
    await VendorBasketRequestModel.updateOne({ _id: "page-1" }, { $set: { status: "rejected", decidedById: ADMIN.id, decidedAt: submittedAt } });
    const service = createVendorBasketRequestNotificationService();
    const all = await service.list(ADMIN, {});
    expect(all.items.find(row => row.requestId === "page-1")?.status).toBe("rejected");
    const page = await service.list(ADMIN, { limit: 1, offset: 1 });
    expect(page.items).toEqual([all.items[1]]);
    expect(page.unreadCount).toBe(3);
    expect(page.pagination).toEqual({ total: 3, limit: 1, offset: 1, hasMore: true });
    await service.read(ADMIN, all.items[0]!.id);
    expect((await service.list(ADMIN, { limit: 1, offset: 2 })).unreadCount).toBe(2);
    expect(await VendorBasketRequestModel.countDocuments({ status: "pending" })).toBe(2);
  });

  it("excludes orphan and foreign-recipient records from rows, totals and unread counts", async () => {
    await submit(requestDto("owned"));
    await submit(requestDto("orphan"));
    const service = createVendorBasketRequestNotificationService();
    const before = await service.list(ADMIN, {});
    const orphan = before.items.find(row => row.requestId === "orphan")!;
    const stored = await VendorBasketRequestNotificationModel.findOne({ requestId: "owned" }).lean();
    await VendorBasketRequestNotificationModel.create({ ...stored, _id: "foreign-notification", recipientId: "retired-admin" });
    await VendorBasketRequestModel.deleteOne({ _id: "orphan" });
    const page = await service.list(ADMIN, {});
    expect(page.items.map(row => row.requestId)).toEqual(["owned"]);
    expect(page.unreadCount).toBe(1);
    expect(page.pagination.total).toBe(1);
    await expect(service.read(ADMIN, orphan.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.read(ADMIN, "foreign-notification")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await VendorBasketRequestNotificationModel.findById("foreign-notification").lean())?.readAt).toBeNull();
  });

  it("revalidates recipient identity and current review permission on list and mark-read", async () => {
    await submit(requestDto("authorization"));
    const service = createVendorBasketRequestNotificationService();
    const id = (await service.list(ADMIN, {})).items[0]!.id;
    await expect(service.list(PROCUREMENT, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.read(PROCUREMENT, id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.list({ ...ADMIN, id: "forged-admin" }, {})).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await UserModel.updateOne({ _id: ADMIN.id }, { $set: { active: false } });
    await expect(service.list(ADMIN, {})).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await expect(service.read(ADMIN, id)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await UserModel.updateOne({ _id: ADMIN.id }, { $set: { active: true, role: "admin" } });
    await expect(service.list(ADMIN, {})).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    expect((await VendorBasketRequestNotificationModel.findById(id).lean())?.readAt).toBeNull();
  });

  it("coordinates recipient revocation with a concurrently starting submission", async () => {
    let release!: () => void;
    let entered!: () => void;
    const barrier = new Promise<void>(resolve => { release = resolve; });
    const reached = new Promise<void>(resolve => { entered = resolve; });
    const original = aiEstimatorKnowledgeActorGuard.requireMutationActor.bind(aiEstimatorKnowledgeActorGuard);
    vi.spyOn(aiEstimatorKnowledgeActorGuard, "requireMutationActor").mockImplementationOnce(async (actor, session) => {
      entered(); await barrier; return original(actor, session);
    });
    const pending = submit(requestDto("recipient-race"));
    // Attach rejection handling before releasing the paused transaction.
    const result = pending.then(() => null, error => error);
    await reached;
    try {
      await mongoose.connection.transaction(async session => {
        await AuthorizationCoordinationModel.updateOne({ _id: "authorization" }, { $inc: { revision: 1 } }, { session });
        await UserModel.updateOne({ _id: ADMIN.id }, { $set: { active: false } }, { session });
      });
    } finally { release(); }
    expect(await result).toMatchObject({ code: "SOLE_SUPER_ADMIN_REQUIRED" });
    expect(await VendorBasketRequestModel.countDocuments()).toBe(0);
    expect(await VendorBasketRequestNotificationModel.countDocuments()).toBe(0);
  });

  it.each([{ limit: 0 }, { limit: 101 }, { offset: -1 }, { offset: 100001 }, { recipientId: "other" }])("rejects invalid page input %j", async query => {
    await expect(createVendorBasketRequestNotificationService().list(ADMIN, query)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
