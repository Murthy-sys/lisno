import type { Server } from "node:http";
import jwt from "jsonwebtoken";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadEnvironment } from "../src/config/env.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../src/models/EstimateClientReviewRound.js";
import { ProjectModel } from "../src/models/Project.js";
import { ProjectProcurementItemModel } from "../src/models/ProjectProcurementItem.js";
import { ProjectPurchaseOrderModel } from "../src/models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../src/models/ProjectPurchaseOrderRevision.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { UserModel } from "../src/models/User.js";
import { UserInvitationModel } from "../src/models/UserInvitation.js";
import { VendorAccessIntentModel } from "../src/models/VendorAccessIntent.js";
import { VendorWorkAssignmentModel } from "../src/models/VendorWorkAssignment.js";
import { startServer, type RunningServer } from "../src/server.js";
import type { InvitationMailer } from "../src/services/invitation-mailer.js";
import type { VendorWorkMail } from "../src/services/vendor-work-mailer.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

// Readiness is independent of email dispatch. These saved vendors have already
// completed induction and physical-address verification in this fixture.
vi.mock("../src/services/vendor-readiness.service.js", () => ({
  vendorActivation: vi.fn(async () => ({ effectiveStatus: "active", gates: { physicalAddressVerified: true } }))
}));

const secret = "local-vendor-startup-test-secret-at-least-32-characters";
const projectId = "startup-project";
const vendorId = "startup-vendor";
const buyerId = "startup-procurement";
const adminId = "startup-admin";
const prefix = `/api/v1/procurement/projects/${projectId}/purchase-orders`;
type InvitationMail = Parameters<Exclude<InvitationMailer, { deliveryKind: "disabled" }>["sendInvitation"]>[0];
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let runtime: RunningServer | undefined;
let origin = "";
const sendInvitation = vi.fn(async (_mail: InvitationMail) => undefined);
const sendNewWork = vi.fn(async (_mail: VendorWorkMail) => undefined);

beforeAll(async () => {
  replica = await startMongoReplicaSet("vendor-access-startup-tests");
}, 120_000);
beforeEach(async () => {
  await replica.clear(); sendInvitation.mockReset(); sendNewWork.mockReset();
  sendInvitation.mockResolvedValue(undefined); sendNewWork.mockResolvedValue(undefined);
  await seed();
}, 30_000);
afterEach(async () => { await runtime?.stop(); runtime = undefined; });
afterAll(async () => { await replica?.stop(); });

async function start(options: { paused?: boolean; unavailable?: boolean } = {}) {
  let server: Server | undefined;
  const env = loadEnvironment({ JWT_SECRET: secret, MONGODB_URI: replica.uri, OCR_WORKER_TOKEN: "local-startup-test-worker-token-more-than-32-characters",
    VENDOR_ACCESS_DELIVERY_ENABLED: options.paused ? "false" : undefined,
    EXECUTION_REMINDERS_ENABLED: "false", UPLOADS_DIR: "/tmp/lisno-vendor-access-startup-uploads" });
  runtime = await startServer({
    loadEnvironment: () => ({ ...env, PORT: 0 }),
    // The replica helper owns its connection; retain it across lifecycle restarts.
    connect: async () => undefined, disconnect: async () => undefined,
    bindHost: "127.0.0.1", registerSignalHandlers: false, writeOutput: () => undefined,
    receiptMaintenanceRunner: async () => undefined,
    appFactory: dependencies => {
      const app = createApp({ ...dependencies,
        invitationMailer: options.unavailable ? { deliveryKind: "disabled" } : { deliveryKind: "local_test", sendInvitation },
        vendorWorkMailer: options.unavailable ? { deliveryKind: "disabled" } : { deliveryKind: "local_test", sendNewWork }
      });
      const listen = app.listen.bind(app);
      app.listen = ((...args: Parameters<typeof listen>) => { server = listen(...args); return server; }) as typeof app.listen;
      return app;
    }
  });
  const address = server!.address();
  if (!address || typeof address === "string") throw new Error("Expected local HTTP server address");
  origin = `http://127.0.0.1:${address.port}`;
}

async function request(path: string, actor: "procurement" | "super_admin", body?: unknown) {
  const token = jwt.sign({ id: actor === "procurement" ? buyerId : adminId, role: actor, sessionVersion: 1 }, secret, { expiresIn: 3600 });
  const response = await fetch(`${origin}${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const payload = await response.json() as { data: any; error?: { code?: string } };
  expect(response.status, payload.error?.code).toBeGreaterThanOrEqual(200);
  expect(response.status, payload.error?.code).toBeLessThan(300);
  return payload.data;
}
async function issue(suffix = "one") {
  const draft = await request(prefix, "procurement", { vendorId, terms: "Install approved cabinets", idempotencyKey: `startup-create-${suffix}`,
    lines: [{ procurementItemId: "startup-item", quantityMilliUnits: 1000, unitPricePaise: 10000, gstBasisPoints: 0,
      scopeType: "execution", description: "Install approved cabinet", targetDate: "2099-10-31", deliveryLocation: "Project site" }] });
  const submitted = await request(`${prefix}/${draft.id}/submit`, "procurement", { expectedVersion: draft.version, idempotencyKey: `startup-submit-${suffix}` });
  const command = { expectedVersion: submitted.version, submittedRevisionId: submitted.submittedRevisionId,
    idempotencyKey: `startup-approve-${suffix}`, decision: "approve", reason: null, budgetOverrideReason: null };
  const approved = await request(`${prefix}/${draft.id}/decision`, "super_admin", command);
  expect(approved.status).toBe("approved");
  return { approved, command };
}
async function sentIntent(orderId: string) {
  await expect.poll(async () => (await VendorAccessIntentModel.findOne({ orderId }).lean())?.state,
    { timeout: 5000, interval: 25 }).toBe("sent");
}
async function seed() {
  const at = new Date();
  await UserModel.create([
    { _id: buyerId, name: "Procurement", email: "startup-procurement@example.test", emailNormalized: "startup-procurement@example.test", role: "procurement" },
    { _id: adminId, name: "Super Admin", email: "startup-admin@example.test", emailNormalized: "startup-admin@example.test", role: "super_admin" }
  ].map(user => ({ ...user, active: true, accountKind: "standard", passwordHash: "fixture-only", version: 1, sessionVersion: 1 })));
  await AiEstimatorKnowledgeVendorModel.collection.insertOne({ _id: vendorId, code: "STARTUP-V", name: "Fixture Trade Vendor", displayOrder: 1,
    status: "active", version: 1, createdById: buyerId, updatedById: buyerId,
    procurementProfile: { nameOfRepresentative: "Vendor Contact", email: "startup-vendor@example.test", phoneNumber: "+919000000000" } });
  await ProjectModel.create({ _id: projectId, name: "Startup Fixture", clientId: "startup-client", clientName: "Client",
    clientEmail: "startup-client@example.test", clientEmailNormalized: "startup-client@example.test", clientMobile: "9000000000",
    clientAddress: "Site", status: "active", location: "Bengaluru", plannedStartAt: at, plannedEndAt: new Date("2099-12-01") });
  const lineItems = [{ id: "source-line", catalogueId: "CA01", roomName: "Living", specification: "Cabinet", unit: "sheet", rate: 10000,
    quantity: 1, included: true, amount: 10000 }];
  await EstimateModel.create({ _id: "startup-estimate", leadId: "startup-lead", ownerId: buyerId, version: 2, status: "client_approved",
    propertyType: "villa", rooms: [], scopes: [], lineItems, subtotal: 10000, gst: 0, total: 10000, approvalRequired: false,
    projectId, reviews: [{ actorId: adminId, action: "client_approved", note: "Approved", occurredAt: at }],
    designPlanStatus: "approved", designPlanVersion: 1, designPlanApprovedAt: at, designPlanApprovedById: adminId,
    designPlanApprovalSource: "admin_proof", clientDecisionAt: at });
  await EstimateClientReviewRoundModel.create({ _id: "startup-round", estimateId: "startup-estimate", leadId: "startup-lead", projectId: null,
    estimateVersion: 1, sendGeneration: 1, dedupeKey: "a".repeat(64), recipientEmail: "startup-client@example.test",
    recipientEmailNormalized: "startup-client@example.test", estimateSnapshot: { clientName: "Client", projectName: "Startup Fixture",
      location: "Bengaluru", propertyType: "villa", lineItems, subtotal: 10000, gst: 0, total: 10000 },
    pdfFilename: "approved.pdf", pdfMimeType: "application/pdf", pdfByteSize: 1, pdfSha256: "b".repeat(64), pdfStorageReference: "approved.pdf",
    deliveryStatus: "sent", deliveryAttemptGeneration: 1, deliveryAttemptCount: 1, deliveryAttemptedAt: at, deliveredAt: at,
    assignedAdminId: adminId, status: "approved", decision: "approve", decisionSource: "admin_proof", decisionNote: "Approved",
    decidedById: adminId, decidedAt: at, version: 2 });
  await ProjectWorkflowTaskModel.create({ _id: "startup-task", dedupeKey: "startup-procurement-task", projectId,
    estimateId: "startup-estimate", designPlanVersion: 1, kind: "procurement", title: "Procurement", assigneeRole: "procurement",
    assigneeUserId: buyerId, status: "open", progress: 0, version: 1, openedAt: at });
  await ProjectProcurementItemModel.create({ _id: "startup-item", projectId, estimateId: "startup-estimate", estimateVersion: 1,
    estimateReviewRoundId: "startup-round", sourceSectionId: "CA", sourceLineItemKey: "source-line", itemName: "Cabinet",
    itemNameNormalized: "cabinet", brand: "Fixture", brandNormalized: "fixture", uomId: "sheet", uomCode: "SHT", uomName: "Sheet",
    uomSearch: "sht sheet", vendorId, vendorCode: "STARTUP-V", vendorName: "Fixture Trade Vendor", vendorSearch: "fixture trade vendor",
    pricePaise: 10000, allocatedWorkPaise: 100000, version: 1, createdById: buyerId, updatedById: buyerId });
}

describe("server startup and committed work-order email delivery", () => {
  it("dispatches setup within five seconds with the flag omitted, without a test-only processor call", async () => {
    await start();
    const { approved, command } = await issue();
    await sentIntent(approved.id);
    expect(sendInvitation).toHaveBeenCalledTimes(1); expect(sendNewWork).not.toHaveBeenCalled();
    expect(await UserInvitationModel.countDocuments()).toBe(1);
    expect(await VendorWorkAssignmentModel.countDocuments({ orderId: approved.id })).toBe(1);
    const invitation = await UserInvitationModel.findOne().select("+tokenHash").lean();
    expect(invitation).toMatchObject({ role: "vendor", vendorId, deliveryStatus: "sent", tokenGeneration: 1 });
    expect(invitation?.tokenHash).toBeTruthy();
    // Replaying approval can wake recovery but cannot generate another email/token.
    await request(`${prefix}/${approved.id}/decision`, "super_admin", command);
    await sentIntent(approved.id);
    expect(sendInvitation).toHaveBeenCalledTimes(1);
    expect(await VendorAccessIntentModel.countDocuments({ orderId: approved.id })).toBe(1);
    const current = await ProjectPurchaseOrderModel.findById(approved.id).lean();
    expect(current).toMatchObject({ status: "approved", approvedRevisionId: approved.approvedRevisionId });
    expect(await ProjectPurchaseOrderRevisionModel.countDocuments({ orderId: approved.id })).toBe(1);
    const setup = { token: sendInvitation.mock.calls[0]![0].rawToken, password: "FixturePassword!123",
      passwordConfirmation: "FixturePassword!123" };
    const accept = await fetch(`${origin}/api/v1/auth/user-invitations/accept`, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(setup) });
    expect(accept.status).toBe(201);
    expect(await accept.json()).toEqual({ data: { accepted: true } });
    const login = await fetch(`${origin}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "startup-vendor@example.test", password: setup.password }) });
    expect(login.status).toBe(200);
    const authenticated = await login.json() as { data: { user: { role: string; vendorId: string } } };
    expect(authenticated.data.user.role).toBe("vendor");
    expect(authenticated.data.user.vendorId).toBe(vendorId);
    expect(await UserModel.countDocuments({ vendorId })).toBe(1);
    const duplicate = await fetch(`${origin}/api/v1/auth/user-invitations/accept`, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(setup) });
    expect(duplicate.status).toBeGreaterThanOrEqual(400);
    expect(await UserModel.countDocuments({ vendorId })).toBe(1);
  }, 30_000);

  it("notifies an active bound vendor without altering its password or issued source", async () => {
    await UserModel.create({ _id: "startup-account", name: "Vendor Account", email: "bound-vendor@example.test",
      emailNormalized: "bound-vendor@example.test", role: "vendor", vendorId, active: true, accountKind: "standard", passwordHash: "unchanged", version: 1 });
    await start();
    const { approved } = await issue();
    const revision = await ProjectPurchaseOrderRevisionModel.findById(approved.approvedRevisionId).lean();
    await sentIntent(approved.id);
    expect(sendInvitation).not.toHaveBeenCalled(); expect(sendNewWork).toHaveBeenCalledTimes(1);
    expect(sendNewWork.mock.calls[0]?.[0]).toMatchObject({ orderId: approved.id, projectId, setupPending: false,
      recipient: { email: "bound-vendor@example.test" } });
    expect(await UserInvitationModel.countDocuments()).toBe(0);
    expect(await UserModel.findById("startup-account").select("+passwordHash").lean()).toMatchObject({ passwordHash: "unchanged", vendorId });
    expect(await ProjectPurchaseOrderRevisionModel.findById(approved.approvedRevisionId).lean()).toEqual(revision);
  }, 30_000);

  it.each([{ paused: true, reason: "DELIVERY_PAUSED", readiness: "paused" },
    { unavailable: true, reason: "DELIVERY_UNAVAILABLE", readiness: "unavailable" }])(
    "shows $readiness and creates no invitation/token/mail writes", async options => {
      await start(options);
      const { approved } = await issue();
      expect(await VendorAccessIntentModel.findOne({ orderId: approved.id }).lean()).toMatchObject({
        state: "delivery_unavailable", failureCode: options.reason, dispatchAuthorizedAt: null });
      const access = await request(`/api/v1/projects/${projectId}/vendor-access`, "procurement");
      expect(access.readiness).toMatchObject({ state: options.readiness, reasonCode: options.reason });
      expect(access.items[0].availableActions).toEqual([]);
      expect(sendInvitation).not.toHaveBeenCalled(); expect(sendNewWork).not.toHaveBeenCalled();
      expect(await UserInvitationModel.countDocuments()).toBe(0);
      expect(await AuditEventModel.countDocuments({ entityType: "user_invitation" })).toBe(0);
      expect(await ProjectPurchaseOrderModel.findById(approved.id).lean()).toMatchObject({ status: "approved" });
    }, 30_000);

  it.each(["paused", "historical"])("does not release a %s order on restart; a fresh issuance still sends", async kind => {
    await start({ paused: true });
    const { approved } = await issue("paused");
    await runtime!.stop(); runtime = undefined;
    // Simulate a genuine pre-feature record, without eligibility fields.
    if (kind === "historical") await VendorAccessIntentModel.collection.updateOne({ orderId: approved.id }, {
      $set: { state: "queued", failureCode: null }, $unset: { dispatchAuthorizedAt: "", dispatchAuthorization: "" }
    });
    const historical = await VendorAccessIntentModel.findOne({ orderId: approved.id }).lean();
    await start();
    const fresh = await issue("fresh");
    await sentIntent(fresh.approved.id);
    expect(sendInvitation).toHaveBeenCalledTimes(1);
    expect(await VendorAccessIntentModel.findOne({ orderId: approved.id }).lean()).toEqual(historical);
    expect(await UserInvitationModel.countDocuments()).toBe(1);
  }, 30_000);

  it("keeps issuance committed when the fake provider fails and exposes a delivery failure", async () => {
    sendInvitation.mockRejectedValue(new Error("Fixture provider unavailable"));
    await start();
    const { approved } = await issue();
    await expect.poll(async () => (await VendorAccessIntentModel.findOne({ orderId: approved.id }).lean())?.state,
      { timeout: 5000, interval: 25 }).toBe("failed");
    expect(await ProjectPurchaseOrderModel.findById(approved.id).lean()).toMatchObject({ status: "approved", approvedRevisionId: approved.approvedRevisionId });
    expect(await VendorWorkAssignmentModel.countDocuments({ orderId: approved.id })).toBe(1);
    expect(await UserInvitationModel.findOne().lean()).toMatchObject({ deliveryStatus: "failed" });
    const access = await request(`/api/v1/projects/${projectId}/vendor-access`, "procurement");
    expect(access.items[0]).toMatchObject({ state: "failed", failureCode: "INVITATION_DELIVERY_FAILED" });
  }, 30_000);
});
