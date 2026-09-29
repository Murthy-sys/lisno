import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { UserModel } from "../src/models/User.js";
import { VendorInductionDraftModel, VendorInductionQuestionnaireModel, VendorInductionRequestModel, VendorInductionReviewModel, VendorInductionSubmissionModel } from "../src/models/VendorInduction.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { currentVendorInductionApproval, vendorInductionApprovals } from "../src/services/vendor-induction-read.js";
import { createVendorInductionService } from "../src/services/vendor-induction.service.js";
import { vendorProfileFixture } from "./procurement-vendor-profile.fixture.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const buyer: PublicUser = { id: "buyer", name: "Synthetic buyer", email: "buyer@example.invalid", role: "procurement" };
const superAdmin: PublicUser = { id: "super", name: "Synthetic admin", email: "super@example.invalid", role: "super_admin" };
const outsider: PublicUser = { id: "outsider", name: "Synthetic outsider", email: "outsider@example.invalid", role: "admin" };
const question = { id: "site_safety", key: "site_safety", section: "Site safety", prompt: "Do you provide PPE?", helpText: null,
  type: "yes_no" as const, required: true, enabled: true, options: [], unit: null, min: null, max: null, showIf: null };
const followup = { id: "ppe_details", key: "ppe_details", section: "Site safety", prompt: "Describe your PPE process", helpText: null,
  type: "paragraph" as const, required: true, enabled: true, options: [], unit: null, min: null, max: null,
  showIf: { questionId: "site_safety", optionIds: ["yes"] } };
const disabledQuestion = { ...question, id: "internal_payment", key: "internal_payment", prompt: "What is Lisno payment policy?", enabled: false };
const messages: { recipient: { name: string; email: string }; rawToken: string; expiresAt: string; changeNote: string | null }[] = [];
let instant = new Date("2026-09-28T00:00:00.000Z");
const audit = createAuditService(createMemoryRepository());
const activationForVendor = async (vendor: Record<string, any>) => ({ lifecycleStatus: vendor.status,
  effectiveStatus: "under_review" as const, gates: { inductionApproved: false, vendorSelfKpiComplete: false,
    procurementKpiComplete: false, profileComplete: true, physicalAddressVerified: true } });
const service = createVendorInductionService({ audit, activationForVendor, now: () => instant,
  mailer: { deliveryKind: "local_test", async sendRequest(message) { messages.push(message); } } });
const disabled = createVendorInductionService({ audit, activationForVendor, now: () => instant, mailer: { deliveryKind: "disabled" } });
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("vendor-induction-tests");
  await Promise.all([AiEstimatorKnowledgeVendorModel, VendorInductionDraftModel, VendorInductionQuestionnaireModel, VendorInductionRequestModel,
    VendorInductionSubmissionModel, VendorInductionReviewModel, AuditEventModel, AuthorizationCoordinationModel, UserModel].map(model => model.syncIndexes()));
}, 120_000);
beforeEach(async () => {
  await replica.clear(); messages.length = 0; instant = new Date("2026-09-28T00:00:00.000Z");
  await UserModel.create([buyer, superAdmin, outsider].map(user => ({ _id: user.id, name: user.name, email: user.email,
    emailNormalized: user.email, passwordHash: "fixture-only", role: user.role, active: true })));
  await AiEstimatorKnowledgeVendorModel.create({ _id: "vendor-a", code: "VA", name: "Synthetic vendor", displayOrder: 0,
    status: "active", version: 1, procurementProfile: vendorProfileFixture(), createdById: superAdmin.id, updatedById: superAdmin.id });
});
afterAll(async () => { await replica?.stop(); });

async function published() {
  await service.saveDraft(buyer, "vendor-a", { expectedVersion: null, idempotencyKey: "draft-001", vendorType: "execution",
    questions: [question, followup, disabledQuestion] });
  return service.publish(superAdmin, "vendor-a", { expectedDraftVersion: 1, idempotencyKey: "publish-001" });
}
async function requested() { await published(); await service.request(buyer, "vendor-a", { expectedRequestVersion: null, idempotencyKey: "request-001" }); return messages[0]!.rawToken; }

describe("vendor induction transactional workflow", () => {
  it("preflights disabled mail without request, token or audit mutation", async () => {
    await published(); const auditBefore = await AuditEventModel.countDocuments();
    await expect(disabled.request(buyer, "vendor-a", { expectedRequestVersion: null, idempotencyKey: "request-001" }))
      .rejects.toMatchObject({ code: "VENDOR_INDUCTION_MAIL_UNAVAILABLE" });
    expect(await VendorInductionRequestModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments()).toBe(auditBefore);
    await expect(service.read(outsider, "vendor-a")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
  it("freezes enabled questions, accepts one submission, and activates only after a staff approval", async () => {
    const first = await published();
    expect(first.published?.questions.map(item => item.id)).toEqual(["site_safety", "ppe_details"]);
    await expect(service.publish(buyer, "vendor-a", { expectedDraftVersion: 1, idempotencyKey: "publish-002" }))
      .rejects.toMatchObject({ code: "VENDOR_INDUCTION_ALREADY_PUBLISHED" });
    await service.request(buyer, "vendor-a", { expectedRequestVersion: null, idempotencyKey: "request-001" });
    expect(messages).toHaveLength(1);
    const token = messages[0]!.rawToken;
    const publicView = await service.inspect(token);
    expect(publicView.vendor).toEqual({ name: "Synthetic vendor", vendorType: "execution", workProfile: "Interior installation",
      representativeName: "Synthetic Representative", representativePosition: "Owner" });
    expect(JSON.stringify(publicView)).not.toMatch(/internal_payment|mainBasket|subBasket|aadhar|bankAccount|phoneNumber|vendor-a|"code"/u);
    await expect(service.submit({ token, idempotencyKey: "submit-001", answers: [{ questionId: "site_safety", value: true }] }))
      .rejects.toMatchObject({ code: "VENDOR_INDUCTION_INVALID" });
    const input = { token, idempotencyKey: "submit-001", answers: [{ questionId: "site_safety", value: true }, { questionId: "ppe_details", value: "PPE issued daily" }] };
    const receipt = await service.submit(input);
    expect(await service.submit(input)).toEqual(receipt);
    await expect(service.inspect(token)).rejects.toMatchObject({ code: "VENDOR_INDUCTION_LINK_UNAVAILABLE" });
    await expect(service.submit({ ...input, idempotencyKey: "submit-002" })).rejects.toMatchObject({ code: "VENDOR_INDUCTION_LINK_UNAVAILABLE" });
    expect(await VendorInductionSubmissionModel.countDocuments()).toBe(1);
    expect(await currentVendorInductionApproval("vendor-a", "execution")).toBe(false);
    const awaiting = await service.read(superAdmin, "vendor-a");
    expect(awaiting.requestEligibility).toBe("awaiting_review");
    expect(awaiting.submission?.questionnaire.questions).toHaveLength(2);
    const approved = await service.review(superAdmin, "vendor-a", { submissionId: awaiting.submission!.id,
      decision: "approved", reason: null, expectedReviewVersion: null, idempotencyKey: "review-001" });
    expect(approved.review?.decision).toBe("approved");
    expect(await currentVendorInductionApproval("vendor-a", "execution")).toBe(true);
    expect((await vendorInductionApprovals([(await AiEstimatorKnowledgeVendorModel.findById("vendor-a").lean())!])).get("vendor-a")).toBe(true);
    expect(await currentVendorInductionApproval("vendor-a", "supplier")).toBe(false);
    const reopened = await service.reopen(buyer, "vendor-a", { reason: "Updated safety process needed", expectedReviewVersion: 1, idempotencyKey: "reopen-001" });
    expect(reopened.review?.decision).toBe("reopened");
    expect(await currentVendorInductionApproval("vendor-a", "execution")).toBe(false);
    expect(reopened.history.reviews.map(row => row.decision)).toEqual(["reopened", "approved"]);
  });
  it("keeps published and submitted snapshots immutable when a new draft is saved", async () => {
    const token = await requested();
    await service.submit({ token, idempotencyKey: "submit-001", answers: [{ questionId: "site_safety", value: false }] });
    await service.saveDraft(buyer, "vendor-a", { expectedVersion: 1, idempotencyKey: "draft-002", vendorType: "execution",
      questions: [{ ...question, prompt: "Is PPE supplied by your company?" }] });
    const detail = await service.read(buyer, "vendor-a");
    expect(detail.draft?.questions[0]?.prompt).toBe("Is PPE supplied by your company?");
    expect(detail.submission?.questionnaire.questions[0]?.prompt).toBe("Do you provide PPE?");
  });
  it("invalidates email/type/archive links and supersedes older requests", async () => {
    const token = await requested();
    await AiEstimatorKnowledgeVendorModel.updateOne({ _id: "vendor-a" }, { $set: { "procurementProfile.email": "other@example.invalid" } });
    await expect(service.inspect(token)).rejects.toMatchObject({ code: "VENDOR_INDUCTION_LINK_UNAVAILABLE" });
    await AiEstimatorKnowledgeVendorModel.updateOne({ _id: "vendor-a" }, { $set: { "procurementProfile.email": "vendor@example.invalid" } });
    instant = new Date(instant.getTime() + 16 * 60_000);
    await service.request(buyer, "vendor-a", { expectedRequestVersion: 1, idempotencyKey: "request-002" });
    await expect(service.inspect(token)).rejects.toMatchObject({ code: "VENDOR_INDUCTION_LINK_UNAVAILABLE" });
    const fresh = messages[1]!.rawToken;
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: "vendor-a" }, { $set: { "procurementProfile.vendorType": "supplier" } });
    await expect(service.inspect(fresh)).rejects.toMatchObject({ code: "VENDOR_INDUCTION_LINK_UNAVAILABLE" });
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: "vendor-a" }, { $set: { "procurementProfile.vendorType": "execution" } });
    await AiEstimatorKnowledgeVendorModel.updateOne({ _id: "vendor-a" }, { $set: { status: "archived", archivedAt: instant, archivedById: buyer.id } });
    await expect(service.submit({ token: fresh, idempotencyKey: "submit-001", answers: [{ questionId: "site_safety", value: false }] }))
      .rejects.toMatchObject({ code: "VENDOR_INDUCTION_LINK_UNAVAILABLE" });
  });
  it("records failed delivery, safely retries with a new request and rejects concurrent duplicate submissions", async () => {
    await published();
    const failing = createVendorInductionService({ audit, activationForVendor, now: () => instant,
      mailer: { deliveryKind: "local_test", async sendRequest() { throw new Error("synthetic transport failure"); } } });
    const failed = await failing.request(buyer, "vendor-a", { expectedRequestVersion: null, idempotencyKey: "request-failed-001" });
    expect(failed.request?.status).toBe("failed");
    expect(messages).toHaveLength(0);
    const ready = await service.request(buyer, "vendor-a", { expectedRequestVersion: 1, idempotencyKey: "request-retry-001" });
    expect(ready.request?.status).toBe("sent");
    const input = { token: messages[0]!.rawToken, idempotencyKey: "submit-001",
      answers: [{ questionId: "site_safety", value: false }] };
    const outcomes = await Promise.allSettled([service.submit(input), service.submit({ ...input, idempotencyKey: "submit-002" })]);
    expect(outcomes.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(await VendorInductionSubmissionModel.countDocuments()).toBe(1);
    const detail = await service.read(buyer, "vendor-a");
    const reviews = await Promise.allSettled([
      service.review(buyer, "vendor-a", { submissionId: detail.submission!.id, decision: "approved", reason: null,
        expectedReviewVersion: null, idempotencyKey: "review-concurrent-001" }),
      service.review(superAdmin, "vendor-a", { submissionId: detail.submission!.id, decision: "changes_requested", reason: "Explain PPE",
        expectedReviewVersion: null, idempotencyKey: "review-concurrent-002" })
    ]);
    expect(reviews.filter(item => item.status === "fulfilled")).toHaveLength(1);
    expect(await VendorInductionReviewModel.countDocuments()).toBe(1);
  });
});
