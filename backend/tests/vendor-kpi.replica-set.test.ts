import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { VendorKpiAssessmentModel } from "../src/models/VendorKpiAssessment.js";
import { VendorKpiRequestModel } from "../src/models/VendorKpiRequest.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { UserModel } from "../src/models/User.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createVendorKpiService, vendorKpiDirectorySummaries } from "../src/services/vendor-kpi.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { vendorProfileFixture } from "./procurement-vendor-profile.fixture.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const buyer: PublicUser = { id: "buyer", name: "Synthetic buyer", email: "buyer@example.invalid", role: "procurement" };
const superAdmin: PublicUser = { id: "super", name: "Synthetic admin", email: "super@example.invalid", role: "super_admin" };
const outsider: PublicUser = { id: "outsider", name: "Synthetic outsider", email: "outsider@example.invalid", role: "admin" };
const sent: { recipient: { name: string; email: string }; rawToken: string; expiresAt: string }[] = [];
let instant = new Date("2026-09-28T00:00:00.000Z");
const audit = createAuditService(createMemoryRepository());
const service = createVendorKpiService({ audit, now: () => instant, mailer: { deliveryKind: "local_test", async sendRequest(message) { sent.push(message); } } });
const disabled = createVendorKpiService({ audit, now: () => instant, mailer: { deliveryKind: "disabled" } });
const executionScores = [
  { key: "timeline", score: 90 }, { key: "quality", score: 95 }, { key: "budget", score: 85 }, { key: "site_discipline", score: 90 }
];
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("vendor-kpi-tests");
  await Promise.all([AiEstimatorKnowledgeVendorModel, VendorKpiAssessmentModel, VendorKpiRequestModel, AuditEventModel, AuthorizationCoordinationModel, UserModel].map(model => model.syncIndexes()));
}, 120_000);
beforeEach(async () => {
  await replica.clear(); sent.length = 0; instant = new Date("2026-09-28T00:00:00.000Z");
  await UserModel.create([buyer, superAdmin, outsider].map(user => ({ _id: user.id, name: user.name, email: user.email, emailNormalized: user.email, passwordHash: "fixture-only", role: user.role, active: true })));
  await AiEstimatorKnowledgeVendorModel.create({ _id: "vendor-a", code: "VA", name: "Synthetic vendor", displayOrder: 0, status: "active", version: 1,
    procurementProfile: vendorProfileFixture(), createdById: superAdmin.id, updatedById: superAdmin.id });
});
afterAll(async () => { await replica?.stop(); });

describe("vendor KPI persistence and one-time delivery", () => {
  it("preflights disabled mail without request, token, or audit writes", async () => {
    await expect(disabled.request(buyer, "vendor-a", { idempotencyKey: "disabled-001", expectedRequestVersion: null })).rejects.toMatchObject({ code: "VENDOR_KPI_MAIL_UNAVAILABLE" });
    expect(await VendorKpiRequestModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(0);
    await expect(service.read(outsider, "vendor-a")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("saves an official staff score with CAS and keeps self separate", async () => {
    const first = await service.save(buyer, "vendor-a", { rubricVersion: 1, expectedRevision: null, idempotencyKey: "staff-001", scores: executionScores });
    expect(first.officialScoreBps).toBe(9000);
    expect(first.procurementAssessment?.revision).toBe(1);
    expect(first.selfAssessment).toBeNull();
    await expect(service.save(superAdmin, "vendor-a", { rubricVersion: 1, expectedRevision: null, idempotencyKey: "staff-002", scores: executionScores })).rejects.toMatchObject({ code: "VENDOR_KPI_VERSION_CONFLICT" });
    const replay = await service.save(buyer, "vendor-a", { rubricVersion: 1, expectedRevision: null, idempotencyKey: "staff-001", scores: executionScores });
    expect(replay.procurementAssessment?.id).toBe(first.procurementAssessment?.id);
    const summary = await vendorKpiDirectorySummaries([(await AiEstimatorKnowledgeVendorModel.findById("vendor-a").lean())!]);
    expect(summary.get("vendor-a")).toEqual({ status: "rated", officialScoreBps: 9000, selfStatus: "not_submitted" });
  });
  it("delivers one token, reveals only basic details, consumes once and allows the same-key receipt retry", async () => {
    const requested = await service.request(buyer, "vendor-a", { idempotencyKey: "request-001", expectedRequestVersion: null });
    expect(requested.request).toMatchObject({ status: "sent", version: 1 });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.recipient.email).toBe("vendor@example.invalid");
    const publicView = await service.inspect(sent[0]!.rawToken);
    expect(publicView.vendor).toEqual({ name: "Synthetic vendor", vendorType: "execution", workProfile: "Interior installation",
      representativeName: "Synthetic Representative", representativePosition: "Owner" });
    const serialized = JSON.stringify(publicView);
    for (const sensitive of ["code", "mainBasket", "subBasket", "aadhar", "pan", "bankAccount", "phoneNumber", "email", "staff", "procurementAssessment"]) expect(serialized).not.toContain(sensitive);
    const input = { token: sent[0]!.rawToken, rubricVersion: 1, idempotencyKey: "submit-001", scores: executionScores };
    const receipt = await service.submit(input);
    expect(receipt.averageScoreBps).toBe(9000);
    expect(await service.submit(input)).toEqual(receipt);
    await expect(service.inspect(input.token)).rejects.toMatchObject({ code: "VENDOR_KPI_LINK_UNAVAILABLE" });
    await expect(service.submit({ ...input, idempotencyKey: "submit-002" })).rejects.toMatchObject({ code: "VENDOR_KPI_LINK_UNAVAILABLE" });
    expect(await VendorKpiAssessmentModel.countDocuments({ source: "vendor_self" })).toBe(1);
    expect((await service.read(superAdmin, "vendor-a")).selfAssessment?.averageScoreBps).toBe(9000);
    expect((await service.read(superAdmin, "vendor-a")).officialScoreBps).toBeNull();
  });
  it("uses empty text for missing legacy representative details without exposing private fields", async () => {
    await service.request(buyer, "vendor-a", { idempotencyKey: "request-legacy-001", expectedRequestVersion: null });
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: "vendor-a" },
      { $unset: { "procurementProfile.nameOfRepresentative": "", "procurementProfile.position": "", "procurementProfile.workProfile": "" } });
    expect((await service.inspect(sent[0]!.rawToken)).vendor).toEqual({ name: "Synthetic vendor", vendorType: "execution",
      workProfile: "", representativeName: "", representativePosition: "" });
    const receipt = await service.submit({ token: sent[0]!.rawToken, rubricVersion: 1, idempotencyKey: "submit-legacy-001", scores: executionScores });
    expect(receipt.averageScoreBps).toBe(9000);
  });
  it("rejects expiry, changed email, and archive without exposing a summary", async () => {
    await service.request(buyer, "vendor-a", { idempotencyKey: "request-001", expectedRequestVersion: null });
    const token = sent[0]!.rawToken;
    await AiEstimatorKnowledgeVendorModel.updateOne({ _id: "vendor-a" }, { $set: { "procurementProfile.email": "changed@example.invalid" } });
    await expect(service.inspect(token)).rejects.toMatchObject({ code: "VENDOR_KPI_LINK_UNAVAILABLE" });
    await AiEstimatorKnowledgeVendorModel.updateOne({ _id: "vendor-a" }, { $set: { "procurementProfile.email": "vendor@example.invalid", status: "archived", archivedAt: instant, archivedById: buyer.id } });
    await expect(service.inspect(token)).rejects.toMatchObject({ code: "VENDOR_KPI_LINK_UNAVAILABLE" });
  });
  it.each(["archived", "missing"] as const)("returns one unavailable response when the public submit vendor is %s", async state => {
    await service.request(buyer, "vendor-a", { idempotencyKey: "request-001", expectedRequestVersion: null });
    if (state === "archived") await AiEstimatorKnowledgeVendorModel.updateOne({ _id: "vendor-a" }, { $set: { status: "archived", archivedAt: instant, archivedById: buyer.id } });
    else await AiEstimatorKnowledgeVendorModel.deleteOne({ _id: "vendor-a" });
    await expect(service.submit({ token: sent[0]!.rawToken, rubricVersion: 1, idempotencyKey: "submit-001", scores: executionScores }))
      .rejects.toMatchObject({ status: 410, code: "VENDOR_KPI_LINK_UNAVAILABLE" });
    await expect(service.inspect(sent[0]!.rawToken)).rejects.toMatchObject({ status: 410, code: "VENDOR_KPI_LINK_UNAVAILABLE" });
    expect(await VendorKpiAssessmentModel.countDocuments()).toBe(0);
  });
  it("marks an unconfirmed pending delivery failed on same-key replay and permits a controlled new request", async () => {
    await service.request(buyer, "vendor-a", { idempotencyKey: "request-001", expectedRequestVersion: null });
    const oldToken = sent[0]!.rawToken;
    await VendorKpiRequestModel.collection.updateOne({ vendorId: "vendor-a" }, { $set: { status: "pending", sentAt: null, requestedAt: new Date(instant.getTime() - 3 * 60_000) } });
    const replay = await service.request(buyer, "vendor-a", { idempotencyKey: "request-001", expectedRequestVersion: null });
    expect(replay.request).toMatchObject({ status: "failed", version: 1 });
    expect(replay.requestEligibility).toBe("ready");
    expect(sent).toHaveLength(1);
    await expect(service.inspect(oldToken)).rejects.toMatchObject({ status: 410, code: "VENDOR_KPI_LINK_UNAVAILABLE" });
    const retry = await service.request(buyer, "vendor-a", { idempotencyKey: "request-002", expectedRequestVersion: 1 });
    expect(retry.request).toMatchObject({ status: "sent", version: 2 });
    expect(sent).toHaveLength(2);
  });
});
