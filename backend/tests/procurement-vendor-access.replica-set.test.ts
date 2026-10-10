import mongoose from "mongoose";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { UserModel } from "../src/models/User.js";
import { UserInvitationModel } from "../src/models/UserInvitation.js";
import { VendorAccessIntentModel } from "../src/models/VendorAccessIntent.js";
import { ProcurementVendorInvitationIntentModel } from "../src/models/ProcurementVendorInvitationIntent.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createUserInvitationService } from "../src/services/user-invitation.service.js";
import { createVendorWorkOnboardingService } from "../src/services/vendor-work-onboarding.service.js";
import { vendorActivation } from "../src/services/vendor-readiness.service.js";
import type { VendorLoginAccess, VendorOrderAccess } from "../src/contracts/vendor-access.js";
vi.mock("../src/services/vendor-readiness.service.js", () => ({ vendorActivation: vi.fn(async () => ({ effectiveStatus: "active" })) }));
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const NOW = new Date("2026-10-09T06:00:00Z");
const actor = { id: "procurement-one", role: "procurement" as const, name: "Procurement", email: "procurement@example.test" };
let services: ReturnType<typeof createVendorWorkOnboardingService>[] = [];
beforeAll(async () => { replica = await startMongoReplicaSet(); await Promise.all([VendorAccessIntentModel.syncIndexes(), ProcurementVendorInvitationIntentModel.syncIndexes(), UserInvitationModel.syncIndexes(), UserModel.syncIndexes()]); }, 120_000);
beforeEach(async () => { await replica.clear(); vi.mocked(vendorActivation).mockResolvedValue({ effectiveStatus: "active" } as any); });
afterEach(async () => { await Promise.all(services.map(service => service.stop().catch(() => undefined))); services = []; vi.restoreAllMocks(); });
afterAll(async () => { await replica?.stop(); });
async function fixture(mode: "ready" | "paused" | "unavailable" = "ready") {
  await UserModel.create({ _id: actor.id, name: actor.name, email: actor.email, emailNormalized: actor.email, role: actor.role, active: true, accountKind: "standard", passwordHash: "unchanged", version: 1 });
  for (const id of ["vendor-one", "vendor-two"]) await AiEstimatorKnowledgeVendorModel.collection.insertOne({ _id: id as any, name: id, version: 1, status: "active", dependencyEpoch: 0, procurementProfile: { nameOfRepresentative: "Vendor Contact", email: `${id}@example.test`, phoneNumber: "+919000000000" } });
  const repository = createMongoRepository(); const audit = createAuditService(repository); let now = NOW;
  const messages: any[] = []; const work: any[] = [];
  const invitationMailer = { deliveryKind: "local_test" as const, sendInvitation: vi.fn(async (input: any) => { messages.push(input); }) };
  const workMailer = { deliveryKind: "local_test" as const, sendNewWork: vi.fn(async (input: any) => { work.push(input); }) };
  const service = createVendorWorkOnboardingService({ repository, audit, invitationMailer: mode === "unavailable" ? { deliveryKind: "disabled" } : invitationMailer, workMailer, clock: () => now, deliveryEnabled: mode === "paused" ? false : undefined, authorizeProject: async (_actor, projectId) => { if (projectId !== "project-one") throw Object.assign(new Error("Not found"), { code: "NOT_FOUND" }); } });
  services.push(service);
  return { repository, audit, service, invitationMailer, workMailer, messages, work, clock: () => now, advance: (ms = 61_000) => { now = new Date(now.getTime() + ms); } };
}
function command(dto: VendorLoginAccess, idempotencyKey = "manual-request-one") { return { expectedVendorVersion: dto.vendorVersion, invitationId: dto.invitation?.id ?? null, expectedInvitationVersion: dto.invitation?.version ?? null, idempotencyKey }; }
function orderCommand(dto: VendorOrderAccess, idempotencyKey = "order-request-one") { return { expectedVendorVersion: dto.vendorVersion, invitationId: dto.invitation?.id ?? null, expectedInvitationVersion: dto.invitation?.version ?? null, idempotencyKey, expectedOrderVersion: dto.orderVersion, expectedOrderRevision: dto.revision, expectedAccessVersion: dto.version, action: dto.availableActions[0]! }; }
async function order(id = "order-one") { await ProjectPurchaseOrderModel.collection.insertOne({ _id: id as any, projectId: "project-one", vendorId: "vendor-one", status: "approved", version: 3, approvedRevision: 2, approvedRevisionId: `revision-${id}`, cancelledAt: null, totalAmountPaise: 12345 }); }
async function issued(f: Awaited<ReturnType<typeof fixture>>, id = "order-one") { await order(id); await mongoose.connection.transaction(session => f.service.recordIssued({ orderId: id, projectId: "project-one", vendorId: "vendor-one", revision: 2, approvedRevisionId: `revision-${id}`, actorId: actor.id, occurredAt: f.clock() }, session)); }
describe("Procurement vendor send and recovery", () => {
  it("sends before the first order, exposes provider acceptance separately, and activates only after setup", async () => {
    const f = await fixture(); const before = await f.service.readVendorAccess(actor, "vendor-one"); expect(before.availableActions).toEqual(["send_invitation"]);
    await f.service.sendVendorInvitation(actor, "vendor-one", command(before), "send_invitation"); await f.service.runOnce();
    expect(f.messages).toHaveLength(1); expect(await ProjectPurchaseOrderModel.countDocuments()).toBe(0);
    expect(await f.service.readVendorAccess(actor, "vendor-one")).toMatchObject({ access: "setup_pending", delivery: { state: "sent" } });
    const invitation = createUserInvitationService({ repository: f.repository, audit: f.audit, mailer: f.invitationMailer, clock: f.clock, passwordHasher: async () => "new-password-hash" });
    await invitation.accept({ rawToken: f.messages[0].rawToken, password: "StrongPassword!123" });
    expect(await f.service.readVendorAccess(actor, "vendor-one")).toMatchObject({ access: "active", availableActions: [] });
    expect((await UserModel.findOne({ vendorId: "vendor-one" }).lean())?.role).toBe("vendor");
  });
  it.each(["paused", "unavailable"] as const)("preflights %s without intent, token, invitation or audit", async mode => {
    const f = await fixture(mode); const dto = await f.service.readVendorAccess(actor, "vendor-one"); expect(dto.readiness.state).toBe(mode); expect(dto.availableActions).toEqual([]);
    await expect(f.service.sendVendorInvitation(actor, "vendor-one", command(dto), "send_invitation")).rejects.toMatchObject({ code: mode === "paused" ? "DELIVERY_PAUSED" : "DELIVERY_UNAVAILABLE" });
    expect(await ProcurementVendorInvitationIntentModel.countDocuments()).toBe(0); expect(await UserInvitationModel.countDocuments()).toBe(0); expect((await f.repository.pageAuditEvents({}, { limit: 10, offset: 0 })).total).toBe(0);
  });
  it("deduplicates ambiguous retries and rejects changed body or another actor using the key", async () => {
    const f = await fixture(); const dto = await f.service.readVendorAccess(actor, "vendor-one"); const input = command(dto);
    await Promise.all([f.service.sendVendorInvitation(actor, "vendor-one", input, "send_invitation"), f.service.sendVendorInvitation(actor, "vendor-one", input, "send_invitation")]); await f.service.runOnce();
    expect(await ProcurementVendorInvitationIntentModel.countDocuments()).toBe(1); expect(f.messages).toHaveLength(1);
    await expect(f.service.sendVendorInvitation(actor, "vendor-one", { ...input, expectedVendorVersion: 2 }, "send_invitation")).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await UserModel.create({ _id: "procurement-two", name: "Other", email: "other@example.test", emailNormalized: "other@example.test", role: "procurement", active: true, passwordHash: "unchanged", version: 1 });
    await expect(f.service.sendVendorInvitation({ ...actor, id: "procurement-two" }, "vendor-one", input, "send_invitation")).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("resends after cooldown with a new generation and rejects stale requests", async () => {
    const f = await fixture(); await f.service.sendVendorInvitation(actor, "vendor-one", command(await f.service.readVendorAccess(actor, "vendor-one")), "send_invitation"); await f.service.runOnce();
    const pending = await f.service.readVendorAccess(actor, "vendor-one");
    await expect(f.service.sendVendorInvitation(actor, "vendor-one", command(pending, "resend-request-one"), "resend_invitation")).rejects.toMatchObject({ code: "TOO_MANY_ATTEMPTS" });
    f.advance(); await f.service.sendVendorInvitation(actor, "vendor-one", command(pending, "resend-request-one"), "resend_invitation"); await f.service.runOnce();
    expect(f.messages).toHaveLength(2); expect((await UserInvitationModel.findOne().lean())?.tokenGeneration).toBe(2);
    f.advance(); await expect(f.service.sendVendorInvitation(actor, "vendor-one", command(pending, "resend-stale-one"), "resend_invitation")).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    const invitation = createUserInvitationService({ repository: f.repository, audit: f.audit, mailer: f.invitationMailer, clock: f.clock });
    await expect(invitation.inspect(f.messages[0].rawToken)).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
    await expect(invitation.inspect(f.messages[1].rawToken)).resolves.toMatchObject({ role: "vendor" });
  });
  it.each(["inactive", "role", "contact", "archived"])("invalidates the manual authority after %s changes", async kind => {
    const f = await fixture(); await f.service.sendVendorInvitation(actor, "vendor-one", command(await f.service.readVendorAccess(actor, "vendor-one")), "send_invitation"); await f.service.runOnce();
    if (kind === "inactive") await UserModel.updateOne({ _id: actor.id }, { $set: { active: false }, $inc: { version: 1 } });
    else if (kind === "role") await UserModel.updateOne({ _id: actor.id }, { $set: { role: "site_manager" }, $inc: { version: 1 } });
    else await AiEstimatorKnowledgeVendorModel.updateOne({ _id: "vendor-one" }, { $set: kind === "contact" ? { "procurementProfile.email": "changed@example.test" } : { status: "archived" }, $inc: { dependencyEpoch: 1 } });
    const invitation = createUserInvitationService({ repository: f.repository, audit: f.audit, mailer: f.invitationMailer, clock: f.clock, passwordHasher: async () => "hash" });
    await expect(invitation.inspect(f.messages[0].rawToken)).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
    await expect(invitation.accept({ rawToken: f.messages[0].rawToken, password: "StrongPassword!123" })).rejects.toMatchObject({ code: "INVITATION_UNAVAILABLE" });
    expect(await UserModel.countDocuments({ vendorId: "vendor-one" })).toBe(0);
  });
  it("rejects stale vendor profile and blocked readiness before writing an intent", async () => {
    const f = await fixture(); const dto = await f.service.readVendorAccess(actor, "vendor-one");
    await AiEstimatorKnowledgeVendorModel.updateOne({ _id: "vendor-one" }, { $inc: { version: 1 } });
    await expect(f.service.sendVendorInvitation(actor, "vendor-one", command(dto), "send_invitation")).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    vi.mocked(vendorActivation).mockResolvedValue({ effectiveStatus: "inactive" } as any);
    const fresh = await f.service.readVendorAccess(actor, "vendor-one"); expect(fresh.blockedReasonCode).toBe("VENDOR_UNAVAILABLE");
    await expect(f.service.sendVendorInvitation(actor, "vendor-one", command(fresh), "send_invitation")).rejects.toMatchObject({ code: "VENDOR_UNAVAILABLE" });
    expect(await ProcurementVendorInvitationIntentModel.countDocuments()).toBe(0);
  });
  it("recovers an old issued order without read writes, revision changes or reissuance", async () => {
    const f = await fixture(); await order(); const baseline = await ProjectPurchaseOrderModel.findById("order-one").lean();
    const dto = (await f.service.listProject(actor, "project-one")).items[0]!;
    expect(dto.id).toBeNull(); expect(await VendorAccessIntentModel.countDocuments()).toBe(0);
    await f.service.sendOrderAccess(actor, "project-one", "order-one", orderCommand(dto)); await f.service.runOnce();
    expect(f.messages).toHaveLength(1); expect(await VendorAccessIntentModel.countDocuments()).toBe(1);
    const after = await ProjectPurchaseOrderModel.findById("order-one").lean(); expect(after).toMatchObject({ version: baseline!.version, approvedRevisionId: baseline!.approvedRevisionId, totalAmountPaise: 12345 });
    await expect(f.service.sendOrderAccess(actor, "project-two", "order-one", orderCommand(dto))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("never dispatches unmarked legacy or paused-at-issue records on enablement/restart", async () => {
    const f = await fixture("paused"); await issued(f);
    await VendorAccessIntentModel.collection.updateOne({}, { $unset: { dispatchAuthorizedAt: "", dispatchAuthorization: "" }, $set: { state: "queued" } });
    const ready = createVendorWorkOnboardingService({ repository: f.repository, audit: f.audit, invitationMailer: f.invitationMailer, workMailer: f.workMailer, clock: f.clock, authorizeProject: async () => undefined }); services.push(ready); ready.start(); await ready.runOnce();
    expect(f.messages).toHaveLength(0); expect(await UserInvitationModel.countDocuments()).toBe(0);
    f.advance(); const dto = (await ready.listProject(actor, "project-one")).items[0]!;
    expect(dto.availableActions).toEqual(["send_invitation"]);
    await ready.sendOrderAccess(actor, "project-one", "order-one", orderCommand(dto)); await ready.runOnce(); expect(f.messages).toHaveLength(1);
  });
  it("keeps existing credentials and offers only work notification in order context", async () => {
    const f = await fixture(); await UserModel.create({ _id: "vendor-user", name: "Bound Vendor", email: "vendor-one@example.test", emailNormalized: "vendor-one@example.test", role: "vendor", vendorId: "vendor-one", active: true, passwordHash: "original-password", version: 1 }); await order();
    expect((await f.service.readVendorAccess(actor, "vendor-one")).availableActions).toEqual([]);
    const dto = (await f.service.listProject(actor, "project-one")).items[0]!; expect(dto.availableActions).toEqual(["send_work_notification"]);
    await f.service.sendOrderAccess(actor, "project-one", "order-one", orderCommand(dto)); await f.service.runOnce();
    expect(f.work).toHaveLength(1); expect(f.messages).toHaveLength(0); expect((await UserModel.findById("vendor-user").select("+passwordHash").lean())?.passwordHash).toBe("original-password");
  });
  it("reconciles initial manual setup when automatic issuance wins the first generation", async () => {
    const f = await fixture(); await f.service.stop();
    const dto = await f.service.readVendorAccess(actor, "vendor-one");
    await f.service.sendVendorInvitation(actor, "vendor-one", command(dto), "send_invitation");
    await issued(f);
    // The normal processor drains order intents before manual intents, making this ordering deterministic.
    await f.service.processPending();
    expect(f.messages).toHaveLength(1); expect(await UserInvitationModel.countDocuments()).toBe(1);
    expect((await UserInvitationModel.findOne().lean())?.tokenGeneration).toBe(1);
    expect((await ProcurementVendorInvitationIntentModel.findOne().lean())?.state).toBe("sent");
    expect((await VendorAccessIntentModel.findOne().lean())?.state).toBe("sent");
    expect(await f.service.readVendorAccess(actor, "vendor-one")).toMatchObject({ access: "setup_pending", delivery: { state: "sent", failureCode: null } });
  });
  it("reports provider failure and permits an explicit resend without replacing the vendor", async () => {
    const f = await fixture(); f.invitationMailer.sendInvitation.mockRejectedValueOnce(new Error("safe fake provider failure"));
    await f.service.sendVendorInvitation(actor, "vendor-one", command(await f.service.readVendorAccess(actor, "vendor-one")), "send_invitation"); await f.service.runOnce();
    const failed = await f.service.readVendorAccess(actor, "vendor-one"); expect(failed).toMatchObject({ access: "setup_pending", delivery: { state: "failed", failureCode: "INVITATION_DELIVERY_FAILED" } });
    f.advance(); await f.service.sendVendorInvitation(actor, "vendor-one", command(failed, "retry-manual-failed"), "resend_invitation"); await f.service.runOnce(); expect(f.messages).toHaveLength(1);
    expect(await f.service.readVendorAccess(actor, "vendor-one")).toMatchObject({ delivery: { state: "sent" } });
  });
  it("never takes over a Super Admin-managed pending setup invitation", async () => {
    const f = await fixture();
    await UserModel.create({ _id: "super-admin", name: "Super Admin", email: "super@example.test", emailNormalized: "super@example.test", role: "super_admin", active: true, passwordHash: "hash", version: 1 });
    const invitations = createUserInvitationService({ repository: f.repository, audit: f.audit, mailer: f.invitationMailer, clock: f.clock });
    await invitations.create({ id: "super-admin", name: "Super Admin", email: "super@example.test", role: "super_admin" }, { role: "vendor", vendorId: "vendor-one", name: "Vendor Contact", email: "vendor-one@example.test", mobile: "+919000000000" });
    f.advance(); const dto = await f.service.readVendorAccess(actor, "vendor-one");
    expect(dto).toMatchObject({ blockedReasonCode: "INVITATION_STAFF_ACTION_REQUIRED", availableActions: [] });
    await expect(f.service.sendVendorInvitation(actor, "vendor-one", command(dto), "resend_invitation")).rejects.toMatchObject({ code: "INVITATION_STAFF_ACTION_REQUIRED" });
    expect(await ProcurementVendorInvitationIntentModel.countDocuments()).toBe(0); expect((await UserInvitationModel.findOne().lean())?.tokenGeneration).toBe(1);
  });
  it("authorizes the sole active Super Admin and rejects vendor and site roles", async () => {
    const f = await fixture();
    for (const role of ["vendor", "site_manager"] as const) {
      const id = `denied-${role}`; await UserModel.create({ _id: id, name: "Denied", email: `${id}@example.test`, emailNormalized: `${id}@example.test`, role, ...(role === "vendor" ? { vendorId: "vendor-two" } : {}), active: true, passwordHash: "hash", version: 1 });
      await expect(f.service.readVendorAccess({ ...actor, id, role }, "vendor-one")).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(f.service.sendVendorInvitation({ ...actor, id, role }, "vendor-one", { expectedVendorVersion: 1, invitationId: null, expectedInvitationVersion: null, idempotencyKey: `denied-${role}` }, "send_invitation")).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await UserModel.create({ _id: "super-admin", name: "Super Admin", email: "super@example.test", emailNormalized: "super@example.test", role: "super_admin", active: true, passwordHash: "hash", version: 1 });
    const admin = { ...actor, id: "super-admin", role: "super_admin" as const };
    await f.service.sendVendorInvitation(admin, "vendor-one", command(await f.service.readVendorAccess(admin, "vendor-one")), "send_invitation"); await f.service.runOnce(); expect(f.messages).toHaveLength(1);
  });
  it("rechecks revoked issuer before queued dispatch and creates no credential generation", async () => {
    const f = await fixture(); await f.service.stop();
    await f.service.sendVendorInvitation(actor, "vendor-one", command(await f.service.readVendorAccess(actor, "vendor-one")), "send_invitation");
    await UserModel.updateOne({ _id: actor.id }, { $set: { active: false }, $inc: { version: 1 } });
    await f.service.processPending();
    expect(f.messages).toHaveLength(0); expect(await UserInvitationModel.countDocuments()).toBe(0);
    expect((await ProcurementVendorInvitationIntentModel.findOne().lean())?.state).toBe("intervention_required");
  });
  it("rejects saved representative or mobile changes after queueing", async () => {
    const f = await fixture(); await f.service.stop();
    await f.service.sendVendorInvitation(actor, "vendor-one", command(await f.service.readVendorAccess(actor, "vendor-one")), "send_invitation");
    await AiEstimatorKnowledgeVendorModel.updateOne({ _id: "vendor-one" }, { $set: { "procurementProfile.phoneNumber": "+919999999999" }, $inc: { version: 1, dependencyEpoch: 1 } });
    await f.service.processPending(); expect(f.messages).toHaveLength(0); expect(await UserInvitationModel.countDocuments()).toBe(0);
  });
  it("protects in-flight delivery from a second manual token rotation", async () => {
    const f = await fixture(); let release!: () => void; let started!: () => void;
    const sending = new Promise<void>(resolve => { started = resolve; });
    f.invitationMailer.sendInvitation.mockImplementationOnce(async input => { f.messages.push(input); started(); await new Promise<void>(resolve => { release = resolve; }); });
    await f.service.sendVendorInvitation(actor, "vendor-one", command(await f.service.readVendorAccess(actor, "vendor-one")), "send_invitation"); await sending;
    f.advance(); const dto = await f.service.readVendorAccess(actor, "vendor-one"); expect(dto.delivery.state).toBe("sending"); expect(dto.availableActions).toEqual([]);
    await expect(f.service.sendVendorInvitation(actor, "vendor-one", command(dto, "second-inflight-command"), "resend_invitation")).rejects.toMatchObject({ code: "DELIVERY_IN_PROGRESS" });
    release(); await f.service.runOnce(); expect(f.messages).toHaveLength(1); expect((await UserInvitationModel.findOne().lean())?.tokenGeneration).toBe(1);
  });
  it("recovers lost manual delivery acknowledgement without immediately resending", async () => {
    const f = await fixture(); await f.service.stop();
    await f.service.sendVendorInvitation(actor, "vendor-one", command(await f.service.readVendorAccess(actor, "vendor-one")), "send_invitation");
    const original = ProcurementVendorInvitationIntentModel.updateOne.bind(ProcurementVendorInvitationIntentModel);
    const fail = vi.spyOn(ProcurementVendorInvitationIntentModel, "updateOne").mockImplementation(((filter: any, change: any, ...rest: any[]) => { if (change?.$set?.state === "sent") throw new Error("lost acknowledgement"); return original(filter, change, ...rest); }) as any);
    await expect(f.service.processPending()).rejects.toThrow("lost acknowledgement"); fail.mockRestore();
    expect(f.messages).toHaveLength(1); expect((await ProcurementVendorInvitationIntentModel.findOne().lean())?.leaseUntil).not.toBeNull();
    f.advance(); expect(await f.service.processPending()).toBe(0);
    f.advance(15 * 60_000); await f.service.processPending();
    expect(f.messages).toHaveLength(1); expect((await ProcurementVendorInvitationIntentModel.findOne().lean())?.state).toBe("sent");
  });
  it("refuses another role holding the saved email without creating a manual intent", async () => {
    const f = await fixture(); await UserModel.create({ _id: "designer", name: "Designer", email: "vendor-one@example.test", emailNormalized: "vendor-one@example.test", role: "designer", active: true, passwordHash: "hash", version: 1 });
    const dto = await f.service.readVendorAccess(actor, "vendor-one"); expect(dto.blockedReasonCode).toBe("VENDOR_EMAIL_CONFLICT");
    await expect(f.service.sendVendorInvitation(actor, "vendor-one", command(dto), "send_invitation")).rejects.toMatchObject({ code: "VENDOR_EMAIL_CONFLICT" }); expect(await ProcurementVendorInvitationIntentModel.countDocuments()).toBe(0);
  });

  it("recovers manual resend acknowledgement using its generation receipt while retaining the original authority", async () => {
    const f = await fixture(); await f.service.stop();
    await f.service.sendVendorInvitation(actor, "vendor-one", command(await f.service.readVendorAccess(actor, "vendor-one")), "send_invitation"); await f.service.processPending();
    const first = (await UserInvitationModel.findOne().lean())!; f.advance();
    await f.service.sendVendorInvitation(actor, "vendor-one", command(await f.service.readVendorAccess(actor, "vendor-one"), "resend-acknowledgement"), "resend_invitation");
    const original = ProcurementVendorInvitationIntentModel.updateOne.bind(ProcurementVendorInvitationIntentModel);
    const fail = vi.spyOn(ProcurementVendorInvitationIntentModel, "updateOne").mockImplementation(((filter: any, change: any, ...rest: any[]) => { if (change?.$set?.state === "sent") throw new Error("lost resend acknowledgement"); return original(filter, change, ...rest); }) as any);
    await expect(f.service.processPending()).rejects.toThrow("lost resend acknowledgement"); fail.mockRestore();
    const resent = (await UserInvitationModel.findOne().lean())!;
    expect(resent.authority).toEqual(first.authority); expect(resent.generationReceipt).toMatchObject({ sourceKind: "procurement_vendor", commandId: "resend-acknowledgement", tokenGeneration: 2 });
    expect(resent.generationReceipt.sourceIntentId).not.toBe(first.authority.sourceIntentId);
    f.advance(16 * 60_000); await f.service.processPending();
    expect(f.messages).toHaveLength(2); expect((await ProcurementVendorInvitationIntentModel.findOne({ idempotencyKey: "resend-acknowledgement" }).lean())?.state).toBe("sent");
    expect((await UserInvitationModel.findOne().lean())?.tokenGeneration).toBe(2);
  });
  it("recovers an order resend originally authorized by a pre-order source without an extra email", async () => {
    const f = await fixture(); await f.service.stop();
    await f.service.sendVendorInvitation(actor, "vendor-one", command(await f.service.readVendorAccess(actor, "vendor-one")), "send_invitation"); await f.service.processPending(); f.advance(); await order();
    const dto = (await f.service.listProject(actor, "project-one")).items[0]!;
    await f.service.sendOrderAccess(actor, "project-one", "order-one", orderCommand(dto, "order-resend-acknowledgement"));
    const original = VendorAccessIntentModel.updateOne.bind(VendorAccessIntentModel);
    const fail = vi.spyOn(VendorAccessIntentModel, "updateOne").mockImplementation(((filter: any, change: any, ...rest: any[]) => { if (change?.$set?.state === "sent") throw new Error("lost order resend acknowledgement"); return original(filter, change, ...rest); }) as any);
    await expect(f.service.processPending()).rejects.toThrow("lost order resend acknowledgement"); fail.mockRestore();
    expect((await UserInvitationModel.findOne().lean())?.authority.kind).toBe("procurement_vendor");
    expect((await UserInvitationModel.findOne().lean())?.generationReceipt).toMatchObject({ sourceKind: "vendor_work_order", commandId: "order-resend-acknowledgement", tokenGeneration: 2 });
    f.advance(16 * 60_000); await f.service.processPending();
    expect(f.messages).toHaveLength(2); expect(f.work).toHaveLength(0);
    expect((await VendorAccessIntentModel.findOne().lean())?.state).toBe("sent");
  });
  it("does not acknowledge a different later generation after a resend worker loses its commit", async () => {
    const f = await fixture(); await f.service.stop();
    await f.service.sendVendorInvitation(actor, "vendor-one", command(await f.service.readVendorAccess(actor, "vendor-one")), "send_invitation"); await f.service.processPending(); f.advance();
    await f.service.sendVendorInvitation(actor, "vendor-one", command(await f.service.readVendorAccess(actor, "vendor-one"), "resend-before-admin"), "resend_invitation");
    const original = ProcurementVendorInvitationIntentModel.updateOne.bind(ProcurementVendorInvitationIntentModel);
    const fail = vi.spyOn(ProcurementVendorInvitationIntentModel, "updateOne").mockImplementation(((filter: any, change: any, ...rest: any[]) => { if (change?.$set?.state === "sent") throw new Error("lost resend acknowledgement"); return original(filter, change, ...rest); }) as any);
    await expect(f.service.processPending()).rejects.toThrow("lost resend acknowledgement"); fail.mockRestore(); f.advance();
    await UserModel.create({ _id: "super-admin", name: "Super Admin", email: "super@example.test", emailNormalized: "super@example.test", role: "super_admin", active: true, passwordHash: "hash", version: 1 });
    const adminService = createUserInvitationService({ repository: f.repository, audit: f.audit, mailer: f.invitationMailer, clock: f.clock });
    const prior = (await UserInvitationModel.findOne().lean())!;
    const current = (await f.repository.findUserInvitationById(String(prior._id)))!;
    await adminService.resend({ ...actor, id: "super-admin", role: "super_admin" }, current.id, { version: current.version });
    expect((await UserInvitationModel.findOne().lean())?.generationReceipt).toBeNull();
    f.advance(16 * 60_000); await f.service.processPending();
    expect(f.messages).toHaveLength(3); expect((await UserInvitationModel.findOne().lean())?.tokenGeneration).toBe(3);
    expect(await ProcurementVendorInvitationIntentModel.findOne({ idempotencyKey: "resend-before-admin" }).lean()).toMatchObject({ state: "intervention_required", failureCode: "VERSION_CONFLICT" });
  });

});
