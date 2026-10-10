import mongoose from "mongoose";
import { vendorActivation } from "../src/services/vendor-readiness.service.js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { UserModel } from "../src/models/User.js";
import { UserInvitationModel } from "../src/models/UserInvitation.js";
import { VendorAccessIntentModel } from "../src/models/VendorAccessIntent.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createUserInvitationService } from "../src/services/user-invitation.service.js";
import { createVendorWorkOnboardingService, type VendorAccessIssuedSource } from "../src/services/vendor-work-onboarding.service.js";
import type { InvitationMailer } from "../src/services/invitation-mailer.js";
vi.mock("../src/services/vendor-readiness.service.js", () => ({ vendorActivation: vi.fn(async () => ({ effectiveStatus: "active" })) }));
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const NOW = new Date("2026-10-08T06:00:00Z");
const source: VendorAccessIssuedSource = { projectId: "p-one", vendorId: "v-one", orderId: "o-one", revision: 1, approvedRevisionId: "revision-one", actorId: "issuer", occurredAt: NOW };
beforeAll(async () => { replica = await startMongoReplicaSet(); await Promise.all([VendorAccessIntentModel.syncIndexes(), UserInvitationModel.syncIndexes(), UserModel.syncIndexes()]); }, 120_000);
beforeEach(async () => { await replica.clear(); vi.mocked(vendorActivation).mockResolvedValue({ effectiveStatus: "active" } as any); });
afterEach(() => { vi.restoreAllMocks(); });
afterAll(async () => { await replica?.stop(); });
async function fixture(disabled = false) {
  await UserModel.create({ _id: "issuer", name: "Procurement", email: "issuer@example.test", emailNormalized: "issuer@example.test", role: "procurement", active: true, accountKind: "standard", passwordHash: "unused", version: 1 });
  await AiEstimatorKnowledgeVendorModel.collection.insertOne({ _id: "v-one" as any, name: "Vendor", status: "active", version: 1, dependencyEpoch: 0, procurementProfile: { nameOfRepresentative: "Vendor Contact", email: "vendor@example.test", phoneNumber: "+919000000000" } });
  await ProjectPurchaseOrderModel.collection.insertOne({ _id: "o-one" as any, projectId: "p-one", vendorId: "v-one", status: "approved", version: 1, approvedRevision: 1, approvedRevisionId: "revision-one", cancelledAt: null, accessAuthorityEpoch: 0 });
  const repository = createMongoRepository(); const audit = createAuditService(repository); let now = NOW;
  const messages: any[] = []; const work: any[] = [];
  const invitationMailer: InvitationMailer = disabled ? { deliveryKind: "disabled" } : { deliveryKind: "local_test", sendInvitation: vi.fn(async input => { messages.push(input); }) };
  const workMailer = { deliveryKind: "local_test" as const, sendNewWork: vi.fn(async (input: any) => { work.push(input); }) };
  const service = createVendorWorkOnboardingService({ repository, audit, invitationMailer, workMailer, clock: () => now, authorizeProject: async () => undefined });
  await mongoose.connection.transaction(async session => { await service.recordIssued(source, session); });
  return { repository, audit, messages, work, invitationMailer, workMailer, service, advance: (ms = 61_000) => { now = new Date(now.getTime() + ms); }, clock: () => now };
}
async function boundUser(id = "vendor-user", email = "vendor@example.test", active = true) { return UserModel.create({ _id: id, name: "Vendor User", email, emailNormalized: email, role: "vendor", vendorId: "v-one", active, accountKind: "standard", passwordHash: "unchanged", version: 1 }); }
describe("work-order onboarding transactions and identity", () => {
  it("records intent atomically and deduplicates a repeated issuance without sending", async () => {
    const f = await fixture();
    await mongoose.connection.transaction(async session => { await f.service.recordIssued(source, session); });
    await expect(mongoose.connection.transaction(async session => { await f.service.recordIssued({ ...source, orderId: "rolled-back" }, session); throw new Error("rollback"); })).rejects.toThrow("rollback");
    expect(await VendorAccessIntentModel.countDocuments()).toBe(1); expect(f.messages).toHaveLength(0);
  });
  it("retains unavailable business intent without any invitation token or audit", async () => {
    const f = await fixture(true); await f.service.runOnce();
    expect(await UserInvitationModel.countDocuments()).toBe(0);
    expect((await VendorAccessIntentModel.findOne().lean())?.state).toBe("delivery_unavailable");
    expect((await f.repository.pageAuditEvents({}, { limit: 10, offset: 0 })).total).toBe(0);
  });
  it("creates one setup generation across duplicate workers and later orders", async () => {
    const f = await fixture(); await Promise.all([f.service.processPending(), f.service.processPending()]);
    expect(f.messages).toHaveLength(1);
    await ProjectPurchaseOrderModel.collection.insertOne({ _id: "o-two" as any, projectId: "p-one", vendorId: "v-one", status: "approved", version: 1, approvedRevision: 1, approvedRevisionId: "revision-two", cancelledAt: null });
    await mongoose.connection.transaction(async session => { await f.service.recordIssued({ ...source, orderId: "o-two", approvedRevisionId: "revision-two" }, session); });
    await f.service.runOnce();
    expect(f.messages).toHaveLength(1); expect(f.work).toHaveLength(1);
    expect(await UserInvitationModel.countDocuments()).toBe(1);
    expect((await UserInvitationModel.findOne().lean())?.tokenGeneration).toBe(1);
  });
  it("sends new-work mail to an active bound account without resetting credentials", async () => {
    const f = await fixture(); await boundUser(); await f.service.runOnce();
    expect(f.work).toHaveLength(1); expect(f.messages).toHaveLength(0); expect(await UserInvitationModel.countDocuments()).toBe(0);
    expect((await UserModel.findById("vendor-user").select("+passwordHash").lean())?.passwordHash).toBe("unchanged");
  });
  it.each(["ambiguous", "inactive", "email_conflict"])("blocks %s identity without rebinding", async kind => {
    const f = await fixture();
    if (kind === "email_conflict") await UserModel.create({ _id: "other", name: "Other", email: "vendor@example.test", emailNormalized: "vendor@example.test", role: "designer", active: true, passwordHash: "unchanged", version: 1 });
    else { await boundUser("vendor-user", "vendor@example.test", kind !== "inactive"); if (kind === "ambiguous") await boundUser("second", "second@example.test"); }
    await f.service.runOnce(); expect(f.work).toHaveLength(0); expect(f.messages).toHaveLength(0);
    expect((await VendorAccessIntentModel.findOne().lean())?.state).toBe("intervention_required");
  });
  it.each(["cancel", "contact"])("rechecks %s changes after password hashing and before account creation", async kind => {
    const f = await fixture(); await f.service.runOnce();
    const service = createUserInvitationService({ repository: f.repository, audit: f.audit, mailer: f.invitationMailer, clock: f.clock, passwordHasher: async () => {
      if (kind === "cancel") await ProjectPurchaseOrderModel.collection.updateOne({ _id: "o-one" as any }, { $set: { cancelledAt: NOW, status: "cancelled" } });
      else await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: "v-one" as any }, { $set: { "procurementProfile.email": "changed@example.test" }, $inc: { dependencyEpoch: 1 } });
      return "hash";
    } });
    await expect(service.accept({ rawToken: f.messages[0].rawToken, password: "StrongPassword!123" })).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
    expect(await UserModel.countDocuments({ vendorId: "v-one" })).toBe(0);
  });
  it("serializes duplicate acceptance with the source and vendor fences", async () => {
    const f = await fixture(); await f.service.runOnce();
    const service = createUserInvitationService({ repository: f.repository, audit: f.audit, mailer: f.invitationMailer, clock: f.clock, passwordHasher: async () => "hash" });
    const result = await Promise.allSettled([1, 2].map(() => service.accept({ rawToken: f.messages[0].rawToken, password: "StrongPassword!123" })));
    expect(result.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(await UserModel.countDocuments({ vendorId: "v-one" })).toBe(1);
    expect((await ProjectPurchaseOrderModel.findById("o-one").lean())?.accessAuthorityEpoch).toBeGreaterThan(0);
  });
  it("does not issue setup when current vendor readiness is blocked", async () => {
    const f = await fixture(); vi.mocked(vendorActivation).mockResolvedValue({ effectiveStatus: "inactive" } as any);
    await f.service.runOnce(); expect(await UserInvitationModel.countDocuments()).toBe(0); expect(f.messages).toHaveLength(0);
    expect((await VendorAccessIntentModel.findOne().lean())?.state).toBe("intervention_required");
  });
  it("rotates a failed setup generation only after cooldown and leaves one usable token", async () => {
    const f = await fixture();
    const send = vi.mocked((f.invitationMailer as Exclude<InvitationMailer, { deliveryKind: "disabled" }>).sendInvitation);
    send.mockRejectedValueOnce(new Error("provider refused"));
    await f.service.runOnce();
    const failed = await UserInvitationModel.findOne().select("+tokenHash").lean();
    expect(failed?.deliveryStatus).toBe("failed"); expect(failed?.tokenGeneration).toBe(1);
    expect(await f.service.runOnce()).toBe(0);
    f.advance(); await f.service.runOnce();
    const resent = await UserInvitationModel.findOne().select("+tokenHash").lean();
    expect(resent?.deliveryStatus).toBe("sent"); expect(resent?.tokenGeneration).toBe(2); expect(resent?.tokenHash).not.toBe(failed?.tokenHash);
    expect(await UserInvitationModel.countDocuments()).toBe(1);
    expect((await f.repository.pageUserInvitations({}, { limit: 20, offset: 0 }, f.clock().toISOString())).items[0]?.currentLinkAvailable).toBe(true);
  });
  it("preflights unavailable retries before any queue change and requires role, version and cooldown once ready", async () => {
    const f = await fixture(true); await f.service.runOnce();
    const row = (await VendorAccessIntentModel.findOne().lean())!;
    const actor = { id: "issuer", role: "procurement" as const, email: "issuer@example.test", name: "Procurement" };
    const command = { expectedVersion: row.version, idempotencyKey: "retry-request-one" };
    await expect(f.service.retry(actor, "p-one", String(row._id), command)).rejects.toMatchObject({ code: "DELIVERY_UNAVAILABLE" });
    expect((await VendorAccessIntentModel.findOne().lean())?.retryReceipts).toHaveLength(0);
    const ready = createVendorWorkOnboardingService({ repository: f.repository, audit: f.audit, invitationMailer: { deliveryKind: "local_test", sendInvitation: async () => undefined }, workMailer: f.workMailer, clock: f.clock, authorizeProject: async () => undefined });
    await expect(ready.retry(actor, "p-one", String(row._id), command)).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
    f.advance();
    await expect(ready.retry({ ...actor, role: "site_manager" }, "p-one", String(row._id), command)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(ready.retry(actor, "p-one", String(row._id), { ...command, expectedVersion: row.version + 1 })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await ready.retry(actor, "p-one", String(row._id), command);
    await ready.retry(actor, "p-one", String(row._id), command);
    await ready.stop();
    expect((await VendorAccessIntentModel.findOne().lean())?.retryReceipts).toHaveLength(1);
  });
  it("keeps a post-provider acknowledgement failure leased instead of immediately resending", async () => {
    const f = await fixture(); await boundUser();
    const original = VendorAccessIntentModel.updateOne.bind(VendorAccessIntentModel);
    vi.spyOn(VendorAccessIntentModel, "updateOne").mockImplementation(((filter: any, update: any, ...args: any[]) => {
      if (update?.$set?.state === "sent") throw new Error("database acknowledgement unavailable");
      return original(filter, update, ...args);
    }) as any);
    await expect(f.service.runOnce()).rejects.toThrow("database acknowledgement unavailable");
    expect(f.work).toHaveLength(1);
    f.advance(120_000); expect(await f.service.runOnce()).toBe(0); expect(f.work).toHaveLength(1);
    expect((await VendorAccessIntentModel.findOne().lean())?.leaseUntil).not.toBeNull();
  });
  it("recovers an exhausted uncertain delivery only after lease expiry and permits one explicit retry", async () => {
    const f = await fixture(); await boundUser();
    await VendorAccessIntentModel.updateOne({}, { $set: { attempts: 4 } });
    const original = VendorAccessIntentModel.updateOne.bind(VendorAccessIntentModel);
    const failure = vi.spyOn(VendorAccessIntentModel, "updateOne").mockImplementation(((filter: any, update: any, ...args: any[]) => {
      if (update?.$set?.state === "sent") throw new Error("database acknowledgement unavailable");
      return original(filter, update, ...args);
    }) as any);
    await expect(f.service.runOnce()).rejects.toThrow("database acknowledgement unavailable");
    failure.mockRestore();
    f.advance(120_000); await f.service.runOnce();
    expect((await VendorAccessIntentModel.findOne().lean())?.state).toBe("queued");
    f.advance(15 * 60_000); await f.service.runOnce();
    const actor = { id: "issuer", role: "procurement" as const, email: "issuer@example.test", name: "Procurement" };
    const recovered = (await f.service.listProject(actor, "p-one")).items[0]!;
    expect(recovered).toMatchObject({ state: "failed", attempts: 5, failureCode: "DELIVERY_ACKNOWLEDGEMENT_UNCERTAIN", canRetry: false });
    expect(f.work).toHaveLength(1);
    f.advance();
    const request = { expectedVersion: recovered.version, idempotencyKey: "recover-uncertain-delivery" };
    await f.service.retry(actor, "p-one", recovered.id!, request);
    await f.service.retry(actor, "p-one", recovered.id!, request);
    await f.service.runOnce();
    expect(f.work).toHaveLength(2);
    expect(await VendorAccessIntentModel.countDocuments()).toBe(1);
    expect(await UserInvitationModel.countDocuments()).toBe(0);
    expect(await UserModel.countDocuments({ vendorId: "v-one" })).toBe(1);
    expect((await f.service.listProject(actor, "p-one")).items[0]).toMatchObject({ state: "sent", access: "active", attempts: 1 });
  });
  it("derives current access after account deactivation, duplicate binding and vendor readiness changes", async () => {
    const f = await fixture(); await boundUser(); await f.service.runOnce();
    const actor = { id: "issuer", role: "procurement" as const, email: "issuer@example.test", name: "Procurement" };
    const access = async () => (await f.service.listProject(actor, "p-one")).items[0]!.access;
    expect(await access()).toBe("active");
    await UserModel.updateOne({ _id: "vendor-user" }, { $set: { active: false } });
    expect(await access()).toBe("blocked");
    await UserModel.updateOne({ _id: "vendor-user" }, { $set: { active: true } });
    await boundUser("duplicate-vendor-user", "duplicate@example.test");
    expect(await access()).toBe("blocked");
    await UserModel.deleteOne({ _id: "duplicate-vendor-user" });
    vi.mocked(vendorActivation).mockResolvedValue({ effectiveStatus: "inactive" } as any);
    expect(await access()).toBe("blocked");
    expect(f.work).toHaveLength(1); expect(f.messages).toHaveLength(0);
    expect((await UserModel.findById("vendor-user").select("+passwordHash").lean())?.passwordHash).toBe("unchanged");
  });
  it("records a rejected work notification as failed when reusing a previously sent setup", async () => {
    const f = await fixture(); await f.service.runOnce();
    await ProjectPurchaseOrderModel.collection.insertOne({ _id: "o-two" as any, projectId: "p-one", vendorId: "v-one", status: "approved", version: 1, approvedRevision: 1, approvedRevisionId: "revision-two", cancelledAt: null });
    await mongoose.connection.transaction(async session => { await f.service.recordIssued({ ...source, orderId: "o-two", approvedRevisionId: "revision-two" }, session); });
    f.workMailer.sendNewWork.mockRejectedValueOnce(new Error("work notification rejected"));
    await f.service.runOnce();
    expect(await VendorAccessIntentModel.findOne({ orderId: "o-two" }).lean()).toMatchObject({ state: "failed", failureCode: "VENDOR_DELIVERY_FAILED", leaseUntil: null });
    expect(f.messages).toHaveLength(1); f.advance(); await f.service.runOnce();
    expect(await VendorAccessIntentModel.findOne({ orderId: "o-two" }).lean()).toMatchObject({ state: "sent" });
    expect(f.messages).toHaveLength(1); expect(f.work).toHaveLength(1);
  });

});
