import express from "express";
import { VendorBasketRequestNotificationModel } from "../src/models/VendorBasketRequestNotification.js";
import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import { basketQualityDigest } from "../src/services/ai-estimator-knowledge-basket-quality.js";
import { PENDING_REQUEST_INDEXES, PENDING_REQUEST_FILTER } from "../src/services/vendor-basket-request-indexes.js";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProposalCreateInput, ProposalDetail, ProposalIntakeContent, ProposalSectionValue } from "../src/contracts/vendor-basket-proposal.js";
import { errorHandler } from "../src/middleware/errors.js";
import { VendorBasketProposalModel } from "../src/models/VendorBasketProposal.js";
import { VendorBasketProposalResourceModel } from "../src/models/VendorBasketProposalResource.js";
import { VendorBasketRequestModel } from "../src/models/VendorBasketRequest.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgePriceVersionModel } from "../src/models/AiEstimatorKnowledgePriceVersion.js";
import { AiEstimatorKnowledgeBasketQualityRevisionModel } from "../src/models/AiEstimatorKnowledgeBasketQualityRevision.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeModeModel } from "../src/models/AiEstimatorKnowledgeMode.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { VendorInductionReviewModel } from "../src/models/VendorInduction.js";
import { VendorKpiAssessmentModel } from "../src/models/VendorKpiAssessment.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { AiEstimatorKnowledgeDisplayOrderSequenceModel } from "../src/models/AiEstimatorKnowledgeDisplayOrderSequence.js";
import { UserModel } from "../src/models/User.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createVendorBasketProposalRouter } from "../src/routes/vendor-basket-proposals.js";
import { createVendorBasketProposalService } from "../src/services/vendor-basket-proposal.service.js";
import { createVendorBasketRequestService } from "../src/services/vendor-basket-request.service.js";
import { createAuditService, type AuditService } from "../src/services/audit.service.js";
import type { AuthService, PublicUser } from "../src/services/auth.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { vendorProfileFixture } from "./procurement-vendor-profile.fixture.js";
import { createKnowledgeContentDigest } from "../src/domain/ai-estimator-knowledge.js";

const ADMIN: PublicUser = { id: "proposal-admin", name: "Admin Fixture", email: "admin@proposal.invalid", role: "super_admin" };
const AUTHOR: PublicUser = { id: "proposal-author", name: "Author Fixture", email: "author@proposal.invalid", role: "procurement" };
const OTHER: PublicUser = { id: "proposal-other", name: "Other Fixture", email: "other@proposal.invalid", role: "procurement" };
const input = { vendorName: "Fixture Vendor", name: "Proposed Painting", idempotencyKey: "create-proposal-one" };
const UOM = "proposal-uom";
const paging = { limit: 100, offset: 0 };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("vendor-basket-proposal");
  await Promise.all([VendorBasketProposalModel, VendorBasketProposalResourceModel, VendorBasketRequestModel,
    AiEstimatorKnowledgeBasketModel, AiEstimatorKnowledgeSubBasketModel, AiEstimatorKnowledgeMainLineModel,
    AiEstimatorKnowledgeRevisionModel, AiEstimatorKnowledgeSectionModel, AiEstimatorKnowledgePriceVersionModel,
    AiEstimatorKnowledgeBasketQualityRevisionModel, AiEstimatorKnowledgeUomModel, AiEstimatorKnowledgeDisplayOrderSequenceModel,
    AuditEventModel, AuthorizationCoordinationModel, UserModel, AiEstimatorKnowledgeVendorModel,
    VendorInductionReviewModel, VendorKpiAssessmentModel, VendorBasketRequestNotificationModel].map((model) => model.syncIndexes()));
}, 120_000);
beforeEach(async () => {
  await replica.clear();
  for (const actor of [ADMIN, AUTHOR, OTHER]) await UserModel.create({ _id: actor.id, name: actor.name, email: actor.email,
    emailNormalized: actor.email, passwordHash: "fixture-only", role: actor.role, active: true });
  await AiEstimatorKnowledgeUomModel.create({ _id: UOM, name: "Square metre", code: "SQM", decimalScale: 2, displayOrder: 0,
    status: "active", version: 1, createdById: ADMIN.id, updatedById: ADMIN.id });
});

describe("vendor-independent basket proposals", { timeout: 45_000 }, () => {
  it("keeps proposal Design rules admin-only, including direct resource reads", async () => {
    const { service } = fixture(); const draft = await prepare(service, "new_main_basket");
    const requesterHierarchy = await service.hierarchy(AUTHOR, "procurement", draft.id, paging);
    const line = requesterHierarchy.items.find((row) => row.kind === "main_line")!;
    expect(line.sections).not.toHaveProperty("design");
    await expect(service.saveSection(AUTHOR, "procurement", draft.id, line.resourceId, "design", {
      expectedVersion: draft.version, applicability: "configured", payload: { answers: { stockCheck: true } }
    })).rejects.toMatchObject({ status: 403 });
    const submitted = await service.submit(AUTHOR, draft.id, { expectedVersion: draft.version, idempotencyKey: "design-submit" });
    const saved = await service.saveSection(ADMIN, "admin", draft.id, line.resourceId, "design", {
      expectedVersion: submitted.version, expectedRequestVersion: submitted.requestVersion!, applicability: "configured",
      payload: { answers: { stockCheck: true }, details: { tradeCoordination: "PRIVATE DESIGN NOTES" } }
    });
    expect((await service.resource(ADMIN, "admin", draft.id, saved.resource!.resourceId)).payload).toMatchObject({ payload: { answers: { stockCheck: true } } });
    await expect(service.resource(AUTHOR, "procurement", draft.id, saved.resource!.resourceId)).rejects.toMatchObject({ status: 404 });
    expect(JSON.stringify(await service.hierarchy(AUTHOR, "procurement", draft.id, paging))).not.toContain("PRIVATE DESIGN NOTES");
  });
  async function prepare(service: ReturnType<typeof createVendorBasketProposalService>, kind: "new_main_basket" | "new_sub_basket", actor = AUTHOR, key = "vendorless-draft") {
    const target = kind === "new_sub_basket" ? { kind, basketId: "vendorless-parent" } : { kind };
    let detail = await service.create(actor, { name: "Vendorless finishes", target, idempotencyKey: key });
    if (kind === "new_main_basket") {
      const sub = await service.addSubBasket(actor, "procurement", detail.id, { expectedVersion: detail.version, name: "Preparation" });
      const line = await service.addMainLine(actor, "procurement", detail.id, sub.resource!.resourceId, { expectedVersion: sub.detail.version, name: "Wall preparation" });
      detail = (await service.saveSection(actor, "procurement", detail.id, line.resource!.resourceId, "overview", {
        expectedVersion: line.detail.version, applicability: "configured", payload: { uomId: UOM, modeIds: [], surfaceIds: [] }
      })).detail;
    }
    return detail;
  }
  beforeEach(async () => {
    await AiEstimatorKnowledgeBasketModel.create({ _id: "vendorless-parent", name: "Existing vendorless parent", status: "active", displayOrder: 0, version: 1, createdById: ADMIN.id, updatedById: ADMIN.id });
  });
  it.each(["new_main_basket", "new_sub_basket"] as const)("submits and approves %s without a vendor, with one notification and immutable replay", async (kind) => {
    const { service, legacy } = fixture(); const draft = await prepare(service, kind);
    expect(draft).toMatchObject({ vendorName: null, vendorId: null });
    const command = { expectedVersion: draft.version, idempotencyKey: "vendorless-submit" };
    const [submitted, replay] = await Promise.all([service.submit(AUTHOR, draft.id, command), service.submit(AUTHOR, draft.id, command)]);
    expect(replay.requestId).toBe(submitted.requestId);
    expect((await legacy.listMine(AUTHOR, paging)).items).toEqual([expect.objectContaining({ vendorName: null, vendorId: null, target: expect.objectContaining({ kind }) })]);
    expect(await VendorBasketRequestModel.findById(submitted.requestId).lean()).toMatchObject({ vendorName: null, vendorNameNormalized: null, vendorKey: "scope:configuration" });
    expect(await VendorBasketRequestNotificationModel.find({ requestId: submitted.requestId }).lean()).toEqual([expect.objectContaining({ vendorName: null, recipientId: ADMIN.id })]);
    const decision = { decision: "approve" as const, expectedVersion: submitted.version, expectedRequestVersion: submitted.requestVersion!, idempotencyKey: "vendorless-approve" };
    const result = await service.decide(ADMIN, draft.id, decision);
    expect(result).toMatchObject({ status: "fulfilled" });
    expect(await service.decide(ADMIN, draft.id, decision)).toEqual(result);
    expect((await service.get(AUTHOR, "procurement", draft.id)).vendorName).toBeNull();
    expect(await VendorBasketRequestNotificationModel.countDocuments()).toBe(1);
    expect(await AiEstimatorKnowledgeVendorModel.countDocuments()).toBe(0);
  });
  it("rolls back failed notification creation, then supports reject, revise and resubmit without a vendor", async () => {
    const { service } = fixture(); const draft = await prepare(service, "new_sub_basket");
    const command = { expectedVersion: draft.version, idempotencyKey: "vendorless-submit-rollback" };
    const failure = vi.spyOn(VendorBasketRequestNotificationModel, "updateOne").mockImplementationOnce(() => { throw new Error("vendorless notification failed"); });
    await expect(service.submit(AUTHOR, draft.id, command)).rejects.toThrow("vendorless notification failed"); failure.mockRestore();
    expect(await VendorBasketRequestModel.countDocuments()).toBe(0);
    expect((await service.get(AUTHOR, "procurement", draft.id)).status).toBe("draft");
    const submitted = await service.submit(AUTHOR, draft.id, command);
    await service.decide(ADMIN, draft.id, { decision: "reject", reason: "Refine the configuration", expectedVersion: submitted.version, expectedRequestVersion: submitted.requestVersion!, idempotencyKey: "vendorless-reject" });
    const rejected = await service.get(AUTHOR, "procurement", draft.id);
    const revise = { expectedVersion: rejected.version, expectedRequestVersion: rejected.requestVersion!, idempotencyKey: "vendorless-revise" };
    const revised = await service.revise(AUTHOR, draft.id, revise);
    expect(revised).toMatchObject({ vendorName: null, vendorId: null, status: "draft" });
    expect((await service.revise(AUTHOR, draft.id, revise)).id).toBe(revised.id);
    await service.submit(AUTHOR, revised.id, { expectedVersion: revised.version, idempotencyKey: "vendorless-resubmit" });
    expect(await VendorBasketRequestNotificationModel.countDocuments()).toBe(2);
    expect(await VendorBasketRequestModel.countDocuments({ status: "rejected" })).toBe(1);
  });
  it.each(["new_main_basket", "new_sub_basket"] as const)("serializes cross-user vendorless duplicates for %s", async (kind) => {
    const { service } = fixture();
    const first = await prepare(service, kind, AUTHOR, "duplicate-one");
    const second = await prepare(service, kind, OTHER, "duplicate-two");
    const outcomes = await Promise.allSettled([
      service.submit(AUTHOR, first.id, { expectedVersion: first.version, idempotencyKey: "submit-duplicate-one" }),
      service.submit(OTHER, second.id, { expectedVersion: second.version, idempotencyKey: "submit-duplicate-two" })
    ]);
    expect(outcomes.filter((row) => row.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((row) => row.status === "rejected")).toEqual([expect.objectContaining({ reason: expect.objectContaining({ code: "REQUEST_PENDING" }) })]);
    expect(await VendorBasketRequestModel.countDocuments()).toBe(1);
    expect(await VendorBasketRequestNotificationModel.countDocuments()).toBe(1);
  });
  it("keeps identical vendorless names independent across different parents", async () => {
    const { service } = fixture(); const first = await prepare(service, "new_sub_basket");
    await AiEstimatorKnowledgeBasketModel.create({ _id: "vendorless-other-parent", name: "Other vendorless parent", status: "active", displayOrder: 1, version: 1, createdById: ADMIN.id, updatedById: ADMIN.id });
    const second = await service.create(OTHER, { name: first.name, vendorName: null, target: { kind: "new_sub_basket", basketId: "vendorless-other-parent" }, idempotencyKey: "different-parent-draft" });
    for (const [actor, draft] of [[AUTHOR, first], [OTHER, second]] as const) await service.submit(actor, draft.id, { expectedVersion: draft.version, idempotencyKey: `submit-${actor.id}` });
    expect(await VendorBasketRequestModel.countDocuments()).toBe(2);
  });
  it("resolves saved vendor context and replays without depending on a later rename; preserves old named fingerprints", async () => {
    const { service } = fixture(); const vendorId = "context-vendor";
    await AiEstimatorKnowledgeVendorModel.create({ _id: vendorId, name: "Original saved vendor", code: "CONTEXT", status: "active", displayOrder: 0, version: 1, createdById: ADMIN.id, updatedById: ADMIN.id });
    const command = { name: "Resolved context", vendorId, idempotencyKey: "saved-vendor-context" };
    const created = await service.create(AUTHOR, command);
    expect(created.vendorName).toBe("Original saved vendor");
    const legacyCommand = { vendorId, vendorName: "Original saved vendor", name: "Legacy named context", idempotencyKey: "legacy-named-context" };
    const legacyCreated = await service.create(AUTHOR, legacyCommand);
    expect(await VendorBasketProposalModel.findById(legacyCreated.id).lean()).toMatchObject({ creationFingerprint: createKnowledgeContentDigest({ vendorId, vendorName: legacyCommand.vendorName, name: legacyCommand.name }) });
    await AiEstimatorKnowledgeVendorModel.updateOne({ _id: vendorId }, { $set: { name: "Renamed saved vendor", nameNormalized: "renamed saved vendor" } });
    expect(await service.create(AUTHOR, command)).toEqual(created);
    expect(await service.create(AUTHOR, legacyCommand)).toEqual(legacyCreated);
    await expect(service.create(AUTHOR, { ...legacyCommand, idempotencyKey: "stale-vendor-name" })).rejects.toMatchObject({ code: "VENDOR_CHANGED" });
    await expect(service.create(AUTHOR, { ...command, vendorId: "missing-vendor", idempotencyKey: "missing-vendor-context" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("accepts omitted or null vendor context via HTTP and rejects empty names", async () => {
    const { service } = fixture(); const actors: Record<string, PublicUser> = { author: AUTHOR };
    const app = express(); app.use(express.json()); app.use("/api/v1", createVendorBasketProposalRouter({ authenticate: async (token: string) => actors[token] } as AuthService, service)); app.use(errorHandler);
    const base = "/api/v1/procurement/vendor-basket-proposals";
    const command = { name: "HTTP vendorless", idempotencyKey: "http-vendorless-create" };
    const created = await request(app).post(base).set("Authorization", "Bearer author").send(command).expect(201);
    const replay = await request(app).post(base).set("Authorization", "Bearer author").send({ ...command, vendorName: null }).expect(201);
    expect(replay.body.data.id).toBe(created.body.data.id); expect(replay.body.data.vendorName).toBeNull();
    await request(app).post(base).set("Authorization", "Bearer author").send({ ...command, vendorName: "" }).expect(400);
  });
});
afterAll(async () => { await replica?.stop(); });
afterEach(() => vi.restoreAllMocks());

describe("hierarchy intake requests", { timeout: 45_000 }, () => {
  const content = (): ProposalIntakeContent => ({ basket: { name: "Requested finishes", description: "Interior finishes for the vendor" },
    subBasket: { name: "Wall preparation", description: "Prepare walls before applying finishes" },
    mainLines: [{ name: "Wall sanding" }, { name: "Wall primer" }] });
  const create = (key = "intake-create-main"): ProposalCreateInput => ({ name: "Requested finishes", requestMode: "hierarchy_intake", intake: content(), idempotencyKey: key });
  const approve = (detail: ProposalDetail) => ({ decision: "approve" as const, expectedVersion: detail.version,
    expectedRequestVersion: detail.requestVersion!, idempotencyKey: `approve-${detail.id}` });
  const submit = (service: ReturnType<typeof createVendorBasketProposalService>, detail: ProposalDetail) => service.submit(AUTHOR, detail.id,
    { expectedVersion: detail.version, idempotencyKey: `submit-${detail.id}` });
  async function parent(id = "intake-existing-parent", name = "Existing finishes") {
    await AiEstimatorKnowledgeBasketModel.create({ _id: id, name, description: "Preserve this parent", status: "active", displayOrder: 5,
      version: 1, createdById: ADMIN.id, updatedById: ADMIN.id });
    return { kind: "new_sub_basket" as const, basketId: id };
  }

  it("publishes descriptions and unpriced draft Main Lines exactly once after a frozen review edit", async () => {
    const { service, legacy } = fixture(); const draft = await service.create(AUTHOR, create());
    expect(draft).toMatchObject({ requestMode: "hierarchy_intake", counts: { subBaskets: 1, mainLines: 2 }, capabilities: { editQuality: false, manageSubBaskets: false } });
    expect(draft.intake!.mainLines.every((line) => Boolean(line.resourceId))).toBe(true);
    expect(await service.create(AUTHOR, create())).toEqual(draft);
    expect((await service.readiness(AUTHOR, "procurement", draft.id)).ready).toBe(true);
    const pending = await submit(service, draft);
    const reviewed = await service.saveIntake(ADMIN, "admin", draft.id, { expectedVersion: pending.version, expectedRequestVersion: pending.requestVersion!,
      intake: { ...pending.intake!, basket: { ...pending.intake!.basket!, description: "Reviewed finishes" },
        subBasket: { ...pending.intake!.subBasket, description: "Reviewed preparation" }, mainLines: [pending.intake!.mainLines[0]!, { name: "Reviewed primer" }] } });
    expect((await service.get(AUTHOR, "procurement", draft.id)).intake).toEqual(pending.intake);
    expect((await service.get(ADMIN, "admin", draft.id, { snapshot: "submitted" })).head).toEqual(pending.submittedHead);
    expect((await legacy.listMine(AUTHOR, paging)).items[0]).toMatchObject({ requestMode: "hierarchy_intake" });
    const decisions = await Promise.all([service.decide(ADMIN, draft.id, approve(reviewed)), service.decide(ADMIN, draft.id, approve(reviewed))]);
    expect(decisions[0]).toEqual(decisions[1]);
    expect(decisions[0]!.published).toMatchObject({ prices: [], sections: [], qualityRevisionId: null });
    expect(await AiEstimatorKnowledgeBasketModel.findById(draft.basketId).lean()).toMatchObject({ description: "Reviewed finishes", status: "active" });
    const sub = await AiEstimatorKnowledgeSubBasketModel.findOne({ basketId: draft.basketId }).lean();
    expect(sub).toMatchObject({ description: "Reviewed preparation" });
    const references = createAiEstimatorKnowledgeReferenceService({ audit: fixture().audit });
    expect((await references.listSubBaskets(ADMIN, draft.basketId, {}, paging)).items[0]).toMatchObject({ description: "Reviewed preparation" });
    const lines = await AiEstimatorKnowledgeMainLineModel.find({ basketId: draft.basketId }).lean();
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.name).sort()).toEqual(["Reviewed primer", "Wall sanding"]);
    for (const line of lines) expect(line).toMatchObject({ status: "draft", activeRevisionId: null, draftRevisionId: expect.any(String) });
    expect(await AiEstimatorKnowledgeRevisionModel.countDocuments({ status: "active" })).toBe(0);
    expect(await AiEstimatorKnowledgePriceVersionModel.countDocuments()).toBe(0);
    const sections = await AiEstimatorKnowledgeSectionModel.find().lean();
    expect(sections).toHaveLength(18);
    for (const section of sections) {
      expect(section.applicability).toBe("not_configured");
      expect(section.payload ?? {}).toEqual({});
    }
    expect(await VendorBasketRequestNotificationModel.countDocuments()).toBe(1);
    expect((await service.get(AUTHOR, "procurement", draft.id, { snapshot: "approved" })).intake).toEqual(reviewed.intake);
  });

  it("keeps existing parent and sibling metadata and quality intact across unequal parent approvals", async () => {
    const { service } = fixture();
    for (const [index, name] of ["Existing finishes", "Different electrical"].entries()) {
      const target = await parent(`intake-parent-${index}`, name);
      const qualityId = `intake-existing-quality-${index}`;
      await AiEstimatorKnowledgeBasketQualityRevisionModel.create({ _id: qualityId, basketId: target.basketId, revisionNumber: 1,
        contentDigest: basketQualityDigest(target.basketId, []), parameters: [], createdById: ADMIN.id, createdAt: new Date() });
      await AiEstimatorKnowledgeBasketModel.updateOne({ _id: target.basketId }, { $set: { qualityRevisionId: qualityId } });
      const qualityBefore = await AiEstimatorKnowledgeBasketQualityRevisionModel.findById(qualityId).lean();
      await AiEstimatorKnowledgeSubBasketModel.create({ _id: `sibling-${index}`, basketId: target.basketId, name: `Existing child ${index}`, description: `Keep child ${index}`,
        displayOrder: 0, version: 1, createdById: ADMIN.id, updatedById: ADMIN.id });
      const before = await AiEstimatorKnowledgeBasketModel.findById(target.basketId).lean();
      const { basket: _basket, ...intake } = content();
      const draft = await service.create(AUTHOR, { ...create(`intake-sub-${index}`), name: intake.subBasket.name, target, intake });
      expect(draft.intake).not.toHaveProperty("basket");
      expect(draft.basket.payload.name).toBe(name);
      await expect(service.saveIntake(AUTHOR, "procurement", draft.id, { expectedVersion: draft.version, intake: content() })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      const pending = await submit(service, draft);
      expect((await service.decide(ADMIN, draft.id, approve(pending))).published!.qualityRevisionId).toBe(qualityId);
      expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.findById(qualityId).lean()).toEqual(qualityBefore);
      const after = await AiEstimatorKnowledgeBasketModel.findById(target.basketId).lean();
      expect(after).toMatchObject({ name: before!.name, description: before!.description, status: before!.status, version: before!.version, qualityRevisionId: before!.qualityRevisionId });
      expect(await AiEstimatorKnowledgeSubBasketModel.findById(`sibling-${index}`).lean()).toMatchObject({ description: `Keep child ${index}`, version: 1 });
      expect(await AiEstimatorKnowledgeSubBasketModel.findOne({ basketId: target.basketId, name: intake.subBasket.name }).lean()).toMatchObject({ description: intake.subBasket.description });
      expect(await AiEstimatorKnowledgeMainLineModel.countDocuments({ basketId: target.basketId, status: "draft" })).toBe(2);
    }
  });

  it("saves incomplete drafts atomically, preserves IDs on rename, removes omitted lines and gates submission", async () => {
    const { service } = fixture(); const input = create(); input.intake = { ...content(), basket: { name: input.name, description: "" }, subBasket: { name: "Preparation", description: null }, mainLines: [] };
    let draft = await service.create(AUTHOR, input);
    expect((await service.readiness(AUTHOR, "procurement", draft.id)).findings.map((finding) => finding.code)).toContain("DESCRIPTION_REQUIRED");
    await expect(submit(service, draft)).rejects.toMatchObject({ code: "PROPOSAL_NOT_READY" });
    draft = await service.saveIntake(AUTHOR, "procurement", draft.id, { expectedVersion: draft.version, intake: content() });
    const existingId = draft.intake!.mainLines[0]!.resourceId;
    const before = draft;
    draft = await service.saveIntake(AUTHOR, "procurement", draft.id, { expectedVersion: draft.version, intake: { ...draft.intake!, mainLines: [{ resourceId: existingId, name: "Renamed sanding" }] } });
    expect(draft.intake!.mainLines).toEqual([{ resourceId: existingId, name: "Renamed sanding" }]);
    await expect(service.saveIntake(AUTHOR, "procurement", draft.id, { expectedVersion: before.version, intake: before.intake! })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(service.saveIntake(AUTHOR, "procurement", draft.id, { expectedVersion: draft.version, intake: { ...draft.intake!, mainLines: [{ resourceId: "foreign-line", name: "Foreign" }] } })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await service.get(AUTHOR, "procurement", draft.id)).head).toEqual(draft.head);
    expect(await VendorBasketRequestModel.countDocuments()).toBe(0);
  });

  it("keeps intake mode through send back and linked revision without copying review-only corrections", async () => {
    const { service } = fixture(); const draft = await service.create(AUTHOR, create()); const pending = await submit(service, draft);
    const reviewed = await service.saveIntake(ADMIN, "admin", draft.id, { expectedVersion: pending.version, expectedRequestVersion: pending.requestVersion!, intake: { ...pending.intake!, subBasket: { name: "Reviewer alternative", description: "Review copy" } } });
    await expect(service.decide(ADMIN, draft.id, { ...approve(reviewed), decision: "reject" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await service.decide(ADMIN, draft.id, { ...approve(reviewed), decision: "reject", reason: "Clarify required finishes" });
    const rejected = await service.get(AUTHOR, "procurement", draft.id);
    const command = { expectedVersion: rejected.version, expectedRequestVersion: rejected.requestVersion!, idempotencyKey: "revise-intake" };
    const revised = await service.revise(AUTHOR, draft.id, command);
    expect(revised).toMatchObject({ requestMode: "hierarchy_intake", revisedFromId: draft.id, status: "draft", intake: { subBasket: content().subBasket } });
    expect(revised.intake!.mainLines[0]!.resourceId).not.toBe(draft.intake!.mainLines[0]!.resourceId);
    expect(await service.revise(AUTHOR, draft.id, command)).toEqual(revised);
    await submit(service, revised);
    expect(await VendorBasketRequestModel.countDocuments({ requestMode: "hierarchy_intake", status: "rejected" })).toBe(1);
    expect(await VendorBasketRequestModel.countDocuments({ requestMode: "hierarchy_intake", status: "pending" })).toBe(1);
  });

  it("rejects Configuration content through every old writer and rejects cross-mode atomic saves", async () => {
    const { service } = fixture(); const draft = await service.create(AUTHOR, create()); const version = { expectedVersion: draft.version };
    const hierarchy = await service.hierarchy(AUTHOR, "procurement", draft.id, paging);
    const sub = hierarchy.items.find((node) => node.kind === "sub_basket")!.resourceId; const line = draft.intake!.mainLines[0]!.resourceId!;
    const writes = [
      () => service.saveBasket(AUTHOR, "procurement", draft.id, { ...version, name: "Injected" }),
      () => service.addSubBasket(AUTHOR, "procurement", draft.id, { ...version, name: "Injected" }),
      () => service.saveSubBasket(AUTHOR, "procurement", draft.id, sub, { ...version, name: "Injected" }),
      () => service.removeSubBasket(AUTHOR, "procurement", draft.id, sub, version),
      () => service.addMainLine(AUTHOR, "procurement", draft.id, sub, { ...version, name: "Injected" }),
      () => service.saveMainLine(AUTHOR, "procurement", draft.id, line, { ...version, name: "Injected" }),
      () => service.removeMainLine(AUTHOR, "procurement", draft.id, line, version),
      () => service.saveSection(AUTHOR, "procurement", draft.id, line, "pricing", { ...version, applicability: "configured", payload: { priceEntries: [] } }),
      () => service.saveQuality(AUTHOR, "procurement", draft.id, { ...version, parameters: [] }),
      () => service.addMaster(AUTHOR, "procurement", draft.id, "uoms", { ...version, name: "Injected", decimalScale: 0 }),
      () => service.saveMaster(AUTHOR, "procurement", draft.id, "uoms", "master", { ...version, name: "Injected", decimalScale: 0 }),
      () => service.removeMaster(AUTHOR, "procurement", draft.id, "uoms", "master", version)
    ];
    for (const write of writes) await expect(write()).rejects.toMatchObject({ code: "PROPOSAL_MODE_MISMATCH" });
    expect((await service.get(AUTHOR, "procurement", draft.id)).head).toEqual(draft.head);
    const old = await service.create(AUTHOR, { name: "Full proposal", idempotencyKey: "create-full-proposal" });
    await expect(service.saveIntake(AUTHOR, "procurement", old.id, { expectedVersion: old.version, intake: content() })).rejects.toMatchObject({ code: "PROPOSAL_MODE_MISMATCH" });
  });

  it("enforces current identity, private ownership and pending immutability for atomic intake updates", async () => {
    const { service } = fixture(); const draft = await service.create(AUTHOR, create()); const save = { expectedVersion: draft.version, intake: draft.intake! };
    await expect(service.get(OTHER, "procurement", draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.saveIntake(OTHER, "procurement", draft.id, save)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await UserModel.updateOne({ _id: AUTHOR.id }, { $set: { active: false } });
    await expect(service.saveIntake(AUTHOR, "procurement", draft.id, save)).rejects.toMatchObject({ status: 401 });
    await UserModel.updateOne({ _id: AUTHOR.id }, { $set: { active: true } });
    const pending = await submit(service, draft);
    await expect(service.saveIntake(AUTHOR, "procurement", draft.id, { ...save, expectedVersion: pending.version })).rejects.toMatchObject({ code: "PROPOSAL_SUBMITTED" });
    await expect(service.saveIntake(ADMIN, "admin", draft.id, { ...save, expectedVersion: pending.version, expectedRequestVersion: 99 })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await UserModel.updateOne({ _id: ADMIN.id }, { $set: { active: false } });
    await expect(service.decide(ADMIN, draft.id, approve(pending))).rejects.toMatchObject({ status: 401 });
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments()).toBe(0);
  });

  it("keeps publication atomic when its final audit fails and allows a safe retry", async () => {
    const { service, audit } = fixture(); const draft = await service.create(AUTHOR, create()); const pending = await submit(service, draft);
    const failing = fixture({ appendInMongoTransaction: async (event, session) => {
      if (event.action === "vendor_basket_proposal_decided") throw new Error("intake publication fixture failure");
      return audit.appendInMongoTransaction(event, session);
    } }).service;
    await expect(failing.decide(ADMIN, draft.id, approve(pending))).rejects.toThrow("intake publication fixture failure");
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeSubBasketModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeRevisionModel.countDocuments()).toBe(0);
    expect(await AiEstimatorKnowledgeSectionModel.countDocuments()).toBe(0);
    expect((await service.get(ADMIN, "admin", draft.id)).head).toMatchObject({ digest: pending.head.digest, version: pending.head.version });
    expect((await service.decide(ADMIN, draft.id, approve(pending))).status).toBe("fulfilled");
  });

  it("rejects inactive parents and duplicate names without changing a pending request", async () => {
    const { service } = fixture(); const target = await parent(); const { basket: _basket, ...intake } = content();
    const draft = await service.create(AUTHOR, { ...create(), name: intake.subBasket.name, target, intake }); const pending = await submit(service, draft);
    await AiEstimatorKnowledgeBasketModel.updateOne({ _id: target.basketId }, { $set: { status: "inactive" } });
    await expect(service.decide(ADMIN, draft.id, approve(pending))).rejects.toMatchObject({ code: "PROPOSAL_NOT_READY" });
    await expect(service.create(AUTHOR, { ...create("inactive-create"), name: intake.subBasket.name, target, intake })).rejects.toMatchObject({ code: "PARENT_BASKET_UNAVAILABLE" });
    await AiEstimatorKnowledgeBasketModel.updateOne({ _id: target.basketId }, { $set: { status: "active" } });
    await AiEstimatorKnowledgeSubBasketModel.create({ _id: "collision-child", basketId: target.basketId, name: intake.subBasket.name, displayOrder: 0, version: 1, createdById: ADMIN.id, updatedById: ADMIN.id });
    await expect(service.decide(ADMIN, draft.id, approve(pending))).rejects.toMatchObject({ code: "DUPLICATE_IDENTITY" });
    expect((await service.get(ADMIN, "admin", draft.id)).status).toBe("pending");
    expect(await AiEstimatorKnowledgeMainLineModel.countDocuments()).toBe(0);
  });

  it("strictly validates intake payloads and mode at the HTTP boundary", async () => {
    const { service } = fixture(); const actors: Record<string, PublicUser> = { author: AUTHOR, admin: ADMIN, other: OTHER };
    const app = express(); app.use(express.json()); app.use("/api/v1", createVendorBasketProposalRouter({ authenticate: async (token: string) => actors[token] } as AuthService, service)); app.use(errorHandler);
    const base = "/api/v1/procurement/vendor-basket-proposals";
    for (const invalid of [
      { ...create(), intake: undefined }, { ...create(), requestMode: undefined }, { ...create(), requestMode: "full_configuration" },
      { ...create(), name: "Different top name" }, { ...create(), intake: { ...content(), subBasket: { name: "No description" } } },
      { ...create(), intake: { ...content(), mainLines: [{ name: "Line", rate: 100 }] } },
      { ...create(), intake: { ...content(), mainLines: [{ name: "Line", resourceId: "injected-id" }] } },
      { ...create(), intake: { ...content(), mainLines: [{ name: " ".repeat(2) }] } },
      { ...create(), intake: { ...content(), basket: { ...content().basket, description: "x".repeat(4001) } } }
    ]) await request(app).post(base).set("Authorization", "Bearer author").send(invalid).expect(400);
    const response = await request(app).post(base).set("Authorization", "Bearer author").send(create()).expect(201);
    const draft = response.body.data as ProposalDetail; const path = `${base}/${draft.id}/intake`;
    const saved = await request(app).put(path).set("Authorization", "Bearer author").send({ expectedVersion: draft.version, intake: draft.intake }).expect(200);
    expect(saved.body.data).toMatchObject({ id: draft.id, version: 2, requestMode: "hierarchy_intake" });
    expect(saved.headers["cache-control"]).toBe("private, no-store");
    await request(app).put(path).set("Authorization", "Bearer other").send({ expectedVersion: 2, intake: draft.intake }).expect(404);
    await request(app).put(path).set("Authorization", "Bearer admin").send({ expectedVersion: 2, intake: draft.intake }).expect(403);
    await request(app).put(path).set("Authorization", "Bearer author").send({ expectedVersion: 2, requestMode: "full_configuration", intake: draft.intake }).expect(400);
    await request(app).put(path).set("Authorization", "Bearer author").send({ expectedVersion: 2, intake: { ...draft.intake, quality: [] } }).expect(400);
    const pending = await service.submit(AUTHOR, draft.id, { expectedVersion: 2, idempotencyKey: "http-intake-submit" });
    const reviewPath = `/api/v1/admin/ai-estimator-knowledge/basket-proposals/${draft.id}/intake`;
    await request(app).put(reviewPath).set("Authorization", "Bearer admin").send({ expectedVersion: pending.version, expectedRequestVersion: pending.requestVersion, intake: pending.intake }).expect(200);
    await request(app).put(reviewPath).set("Authorization", "Bearer author").send({ expectedVersion: pending.version, expectedRequestVersion: pending.requestVersion, intake: pending.intake }).expect(403);
  });
});

function fixture(audit: Pick<AuditService, "appendInMongoTransaction"> = createAuditService(createMemoryRepository())) {
  return { service: createVendorBasketProposalService({ audit }), legacy: createVendorBasketRequestService({ audit }), audit };
}
async function ready(service: ReturnType<typeof createVendorBasketProposalService>, name = input.name) {
  let detail = await service.create(AUTHOR, { ...input, name, idempotencyKey: `create-${name.replace(/\W/gu, "_")}` });
  const sub = await service.addSubBasket(AUTHOR, "procurement", detail.id, { expectedVersion: detail.version, name: "Preparation" }); detail = sub.detail;
  const line = await service.addMainLine(AUTHOR, "procurement", detail.id, sub.resource!.resourceId, { expectedVersion: detail.version, name: "Wall preparation" }); detail = line.detail;
  detail = (await service.saveSection(AUTHOR, "procurement", detail.id, line.resource!.resourceId, "overview", {
    expectedVersion: detail.version, applicability: "configured", payload: { uomId: UOM, modeIds: [], surfaceIds: [] }
  })).detail;
  return { detail, subId: sub.resource!.resourceId, lineId: line.resource!.resourceId };
}
async function pending(service: ReturnType<typeof createVendorBasketProposalService>) {
  const prepared = await ready(service);
  return { ...prepared, detail: await service.submit(AUTHOR, prepared.detail.id, { expectedVersion: prepared.detail.version, idempotencyKey: "submit-key-one" }) };
}
async function expectLiveEmpty() {
  for (const model of [AiEstimatorKnowledgeBasketModel, AiEstimatorKnowledgeSubBasketModel, AiEstimatorKnowledgeMainLineModel,
    AiEstimatorKnowledgeRevisionModel, AiEstimatorKnowledgeSectionModel, AiEstimatorKnowledgePriceVersionModel, AiEstimatorKnowledgeBasketQualityRevisionModel]) {
    expect(await model.countDocuments()).toBe(0);
  }
}

describe("isolated full basket proposals", { timeout: 45_000 }, () => {
  it("persists own incomplete drafts without Configuration or queue writes; creation replays and role changes are guarded", async () => {
    const { service } = fixture(); const created = await service.create(AUTHOR, input);
    expect(created).toMatchObject({ name: input.name, version: 1, status: "draft", requestId: null, capabilities: { edit: true, submit: true } });
    expect(await service.create(AUTHOR, input)).toEqual(created);
    await expect(service.create(AUTHOR, { ...input, name: "Changed" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(service.get(OTHER, "procurement", created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.get(ADMIN, "admin", created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.create(ADMIN, input)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await service.listMine(OTHER, paging)).items).toEqual([]);
    expect(await VendorBasketRequestModel.countDocuments()).toBe(0); await expectLiveEmpty();
    expect((await service.readiness(AUTHOR, "procurement", created.id)).ready).toBe(false);
    await expect(service.submit(AUTHOR, created.id, { expectedVersion: 1, idempotencyKey: "submit-incomplete" })).rejects.toMatchObject({ code: "PROPOSAL_NOT_READY" });
    await UserModel.updateOne({ _id: AUTHOR.id }, { $set: { active: false } });
    await expect(service.create(AUTHOR, input)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await UserModel.updateOne({ _id: AUTHOR.id }, { $set: { active: true, role: "admin" } });
    await expect(service.create(AUTHOR, input)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("saves an isolated hierarchy with eight section handles, stable editor revisions and aggregate CAS", async () => {
    const { service } = fixture(); const { detail, subId, lineId } = await ready(service);
    const hierarchy = await service.hierarchy(AUTHOR, "procurement", detail.id, paging);
    const line = hierarchy.items.find((row) => row.resourceId === lineId)!;
    expect(Object.keys(line.sections)).toHaveLength(8);
    expect(line.editorItem).toMatchObject({ mainLineId: lineId, subBasketId: subId, uomId: UOM, status: "draft", blockers: [] });
    const next = await service.saveMainLine(AUTHOR, "procurement", detail.id, lineId, { expectedVersion: detail.version, name: "Updated wall preparation" });
    expect(next.detail.head.id).toBe(detail.head.id);
    expect((await service.hierarchy(AUTHOR, "procurement", detail.id, paging)).items.find((row) => row.resourceId === lineId)?.editorItem?.draftRevisionId).toBe(line.editorItem!.draftRevisionId);
    await expect(service.saveBasket(AUTHOR, "procurement", detail.id, { expectedVersion: detail.version, name: "Stale" })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
    await expect(service.removeSubBasket(AUTHOR, "procurement", detail.id, subId, { expectedVersion: next.detail.version })).rejects.toMatchObject({ code: "SUB_BASKET_NOT_EMPTY" });
    await expectLiveEmpty();
  });

  it("freezes one submission, keeps author snapshot immutable and permits only versioned Super Admin review", async () => {
    const { service, legacy } = fixture(); const prepared = await ready(service);
    const command = { expectedVersion: prepared.detail.version, idempotencyKey: "submit-key-same" };
    const results = await Promise.all([service.submit(AUTHOR, prepared.detail.id, command), service.submit(AUTHOR, prepared.detail.id, command)]);
    expect(results[0]!.requestId).toBe(results[1]!.requestId);
    const submitted = results[0]!;
    expect(await VendorBasketRequestModel.countDocuments()).toBe(1);
    expect(await VendorBasketRequestNotificationModel.countDocuments({ requestId: results[0]!.requestId, recipientId: ADMIN.id })).toBe(1);
    const queue = await legacy.listForAdmin(ADMIN, "pending", { limit: 1, offset: 0 });
    expect(queue.pagination.total).toBe(1);
    expect(queue.items[0]).toMatchObject({ kind: "configuration_proposal", proposalId: submitted.id, proposalCounts: { subBaskets: 1, mainLines: 1 } });
    await expect(legacy.decide(ADMIN, submitted.requestId!, { decision: "fulfill", expectedVersion: 1, idempotencyKey: "legacy-bypass-key" })).rejects.toMatchObject({ code: "PROPOSAL_REVIEW_REQUIRED" });
    await expect(service.saveBasket(AUTHOR, "procurement", submitted.id, { expectedVersion: submitted.version, name: "Author changed" })).rejects.toMatchObject({ code: "PROPOSAL_SUBMITTED" });
    const review = await service.get(ADMIN, "admin", submitted.id);
    const saved = await service.saveBasket(ADMIN, "admin", submitted.id, { expectedVersion: review.version, expectedRequestVersion: review.requestVersion!, name: "Reviewed Painting" });
    expect(saved.detail.requestVersion).toBe(2);
    expect((await service.get(AUTHOR, "procurement", submitted.id)).name).toBe(input.name);
    expect((await service.get(ADMIN, "admin", submitted.id, { snapshot: "submitted" })).name).toBe(input.name);
    expect((await service.get(ADMIN, "admin", submitted.id)).name).toBe("Reviewed Painting");
    expect((await service.changes(ADMIN, submitted.id, paging)).items).toHaveLength(1);
    expect((await service.get(AUTHOR, "procurement", submitted.id)).submittedHead?.digest).toBe(submitted.submittedHead?.digest);
    await expectLiveEmpty();
  });

  it("publishes and activates every node atomically; exact decision replay returns the persisted result", async () => {
    const { service } = fixture(); const { detail, lineId, subId } = await pending(service);
    const command = { decision: "approve" as const, expectedVersion: detail.version, expectedRequestVersion: detail.requestVersion!, idempotencyKey: "approve-key-one" };
    const result = await service.decide(ADMIN, detail.id, command);
    expect(result).toMatchObject({ status: "fulfilled", published: { basketId: detail.basketId, subBasketIds: [subId], mainLines: [{ mainLineId: lineId, revisionId: expect.any(String) }] } });
    expect(await service.decide(ADMIN, detail.id, command)).toEqual(result);
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments()).toBe(1);
    expect(await AiEstimatorKnowledgeMainLineModel.findById(lineId).lean()).toMatchObject({ status: "active", draftRevisionId: null, activeRevisionId: result.published!.mainLines[0]!.revisionId });
    expect(await AiEstimatorKnowledgeSectionModel.countDocuments()).toBe(9);
    expect((await service.get(AUTHOR, "procurement", detail.id)).publishedBasketId).toBe(detail.basketId);
    const related = await service.references(AUTHOR, "procurement", { ...paging, kind: "main-lines", ids: [lineId] });
    expect(related.items[0]).toMatchObject({ mainLineId: lineId, subBasketId: subId, basketId: detail.basketId, uomId: UOM,
      status: "active", allowedActions: [], draftRevision: null, activeRevision: { id: result.published!.mainLines[0]!.revisionId } });
    expect(related.items[0]).not.toHaveProperty("vendorIds");
    await expect(service.decide(ADMIN, detail.id, { ...command, decision: "reject", reason: "Changed" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await UserModel.updateOne({ _id: ADMIN.id }, { $set: { active: false } });
    await expect(service.decide(ADMIN, detail.id, command)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("rolls back all publication writes when the decision audit fails, leaving pending saved review intact", async () => {
    const { service, audit } = fixture(); const { detail } = await pending(service);
    const failing = fixture({ appendInMongoTransaction: async (event, session) => {
      if (event.action === "vendor_basket_proposal_decided") throw new Error("decision audit fixture failure");
      return audit.appendInMongoTransaction(event, session);
    } }).service;
    await expect(failing.decide(ADMIN, detail.id, { decision: "approve", expectedVersion: detail.version,
      expectedRequestVersion: detail.requestVersion!, idempotencyKey: "approve-failure-key" })).rejects.toThrow("decision audit fixture failure");
    await expectLiveEmpty();
    expect((await service.get(ADMIN, "admin", detail.id)).status).toBe("pending");
    expect(await AuditEventModel.countDocuments({ action: "ai_estimator_knowledge_main_line_activated" })).toBe(0);
  });

  it("rejects with history, revises to newly allocated IDs and keeps pending counts and own status filters correct", async () => {
    const { service } = fixture(); const { detail, lineId } = await pending(service);
    const rejected = await service.decide(ADMIN, detail.id, { decision: "reject", reason: "Use the agreed specification", expectedVersion: detail.version,
      expectedRequestVersion: detail.requestVersion!, idempotencyKey: "reject-key-one" });
    const command = { expectedVersion: rejected.version, expectedRequestVersion: rejected.requestVersion, idempotencyKey: "revise-key-one" };
    const revised = await service.revise(AUTHOR, detail.id, command);
    expect(await service.revise(AUTHOR, detail.id, command)).toEqual(revised);
    expect(revised).toMatchObject({ revisedFromId: detail.id, status: "draft", version: 1, requestId: null });
    expect(revised.basketId).not.toBe(detail.basketId);
    expect((await service.hierarchy(AUTHOR, "procurement", revised.id, paging)).items.some((row) => row.resourceId === lineId)).toBe(false);
    expect((await service.listMine(AUTHOR, { ...paging, status: "draft" })).items.map((row) => row.id)).toEqual([revised.id]);
    expect((await service.listMine(AUTHOR, { ...paging, status: "rejected" })).items.map((row) => row.id)).toEqual([detail.id]);
    expect(await VendorBasketRequestModel.countDocuments({ status: "pending" })).toBe(0);
    await expectLiveEmpty();
  });

  it("enforces source ownership for resources and detects damaged manifests", async () => {
    const { service } = fixture(); const first = await ready(service); const second = await ready(service, "Other proposal");
    await expect(service.resource(AUTHOR, "procurement", first.detail.id, second.lineId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.saveMainLine(AUTHOR, "procurement", first.detail.id, second.lineId, { expectedVersion: first.detail.version, name: "Forged" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await VendorBasketProposalModel.updateOne({ _id: first.detail.id }, { $set: { "working.digest": "corrupt" } });
    await expect(service.get(AUTHOR, "procurement", first.detail.id)).rejects.toMatchObject({ code: "PROPOSAL_NOT_RESOLVABLE" });
  });

  it("blocks deletion for actual saved references while ignoring matching free text and options", async () => {
    const { service } = fixture(); const prepared = await ready(service);
    let detail = prepared.detail;
    const peer = await service.addMainLine(AUTHOR, "procurement", detail.id, prepared.subId, {
      expectedVersion: detail.version, name: "Referenced preparation"
    });
    detail = peer.detail;
    const peerId = peer.resource!.resourceId;
    detail = (await service.saveBasket(AUTHOR, "procurement", detail.id, {
      expectedVersion: detail.version, name: detail.name, description: peerId
    })).detail;
    const modeConfigurations = [{ id: peerId, modeKind: "pmc", fields: [{ id: "fixture-field", type: "dropdown", label: peerId, options: [peerId] }] }];
    detail = (await service.saveSection(AUTHOR, "procurement", detail.id, prepared.lineId, "advanced", {
      expectedVersion: detail.version, applicability: "configured", payload: {
        dependencies: [{ id: "peer-dependency", targetBasketId: detail.basketId, targetMainLineId: peerId, reason: peerId, active: true }],
        modeConfigurations
      }
    })).detail;
    await expect(service.removeMainLine(AUTHOR, "procurement", detail.id, peerId, { expectedVersion: detail.version }))
      .rejects.toMatchObject({ code: "PROPOSAL_RESOURCE_REFERENCED" });
    expect((await service.get(AUTHOR, "procurement", detail.id)).version).toBe(detail.version);
    detail = (await service.saveSection(AUTHOR, "procurement", detail.id, prepared.lineId, "advanced", {
      expectedVersion: detail.version, applicability: "configured", payload: { dependencies: [], modeConfigurations }
    })).detail;
    detail = (await service.removeMainLine(AUTHOR, "procurement", detail.id, peerId, { expectedVersion: detail.version })).detail;
    expect(detail.basket.payload.description).toBe(peerId);
    const hierarchy = await service.hierarchy(AUTHOR, "procurement", detail.id, paging);
    expect(hierarchy.items.some((row) => row.resourceId === peerId)).toBe(false);
    const source = hierarchy.items.find((row) => row.resourceId === prepared.lineId)!;
    const advanced = await service.resource(AUTHOR, "procurement", detail.id, source.sections.advanced!);
    expect((advanced.payload as ProposalSectionValue).payload.modeConfigurations).toEqual(modeConfigurations);
    await expectLiveEmpty();
  });

  it("remaps rejected-copy relationships without rewriting text, options or section-local row identities", async () => {
    const { service } = fixture(); const prepared = await ready(service);
    let detail = prepared.detail;
    const oldBasketId = detail.basketId;
    detail = (await service.saveBasket(AUTHOR, "procurement", detail.id, {
      expectedVersion: detail.version, name: detail.name, description: oldBasketId
    })).detail;
    const peerSub = await service.addSubBasket(AUTHOR, "procurement", detail.id, { expectedVersion: detail.version, name: "Finishing" });
    detail = peerSub.detail;
    const peer = await service.addMainLine(AUTHOR, "procurement", detail.id, peerSub.resource!.resourceId, {
      expectedVersion: detail.version, name: oldBasketId
    });
    detail = peer.detail;
    const peerId = peer.resource!.resourceId;
    detail = (await service.saveSection(AUTHOR, "procurement", detail.id, peerId, "overview", {
      expectedVersion: detail.version, applicability: "configured", payload: { uomId: UOM, modeIds: [], surfaceIds: [] }
    })).detail;
    detail = (await service.saveSection(AUTHOR, "procurement", detail.id, prepared.lineId, "advanced", {
      expectedVersion: detail.version, applicability: "configured", payload: {
        dependencies: [{ id: oldBasketId, targetBasketId: oldBasketId, targetMainLineId: peerId, reason: peerId, active: true }],
        modeConfigurations: [{ id: "pmc-mode", modeKind: "pmc", fields: [{ id: "fixture-field", type: "dropdown", label: oldBasketId, options: [peerId] }] }]
      }
    })).detail;
    detail = (await service.saveSection(AUTHOR, "procurement", detail.id, prepared.lineId, "recommendations", {
      expectedVersion: detail.version, applicability: "configured", payload: {
        budgetAlterations: [{ id: "related-finish", trigger: "added", action: "add", requirement: "must", targetKind: "main_line", targetType: "catalog",
          targetBasketId: oldBasketId, targetSubBasketId: peerSub.resource!.resourceId, targetMainLineId: peerId, reason: oldBasketId, active: true }]
      }
    })).detail;
    detail = (await service.saveSection(AUTHOR, "procurement", detail.id, prepared.lineId, "scope", {
      expectedVersion: detail.version, applicability: "configured", payload: {
        exclusions: [{ id: "related-exclusion", targetBasketId: oldBasketId, targetMainLineId: peerId, reason: oldBasketId, active: false }]
      }
    })).detail;
    detail = await service.submit(AUTHOR, detail.id, { expectedVersion: detail.version, idempotencyKey: "copy-reference-submit" });
    const rejected = await service.decide(ADMIN, detail.id, { decision: "reject", reason: "Revise fixture", expectedVersion: detail.version,
      expectedRequestVersion: detail.requestVersion!, idempotencyKey: "copy-reference-reject" });
    const revised = await service.revise(AUTHOR, detail.id, { expectedVersion: rejected.version, expectedRequestVersion: rejected.requestVersion, idempotencyKey: "copy-reference-revise" });
    const hierarchy = await service.hierarchy(AUTHOR, "procurement", revised.id, paging);
    const copiedPeer = hierarchy.items.find((row) => row.kind === "main_line" && row.payload.name === oldBasketId)!;
    const copiedLine = hierarchy.items.find((row) => row.kind === "main_line" && row.payload.name === "Wall preparation")!;
    expect(revised.basket.payload.description).toBe(oldBasketId);
    expect(copiedPeer.resourceId).not.toBe(peerId);
    expect(copiedPeer.parentId).not.toBe(peerSub.resource!.resourceId);
    const advanced = await service.resource(AUTHOR, "procurement", revised.id, copiedLine.sections.advanced!);
    expect((advanced.payload as ProposalSectionValue).payload).toMatchObject({
      dependencies: [{ id: oldBasketId, targetBasketId: revised.basketId, targetMainLineId: copiedPeer.resourceId, reason: peerId }],
      modeConfigurations: [{ fields: [{ label: oldBasketId, options: [peerId] }] }]
    });
    const recommendations = await service.resource(AUTHOR, "procurement", revised.id, copiedLine.sections.recommendations!);
    expect((recommendations.payload as ProposalSectionValue).payload).toMatchObject({ budgetAlterations: [{
      targetBasketId: revised.basketId, targetSubBasketId: copiedPeer.parentId, targetMainLineId: copiedPeer.resourceId, reason: oldBasketId
    }] });
    const scope = await service.resource(AUTHOR, "procurement", revised.id, copiedLine.sections.scope!);
    expect((scope.payload as ProposalSectionValue).payload).toMatchObject({ exclusions: [{
      targetBasketId: revised.basketId, targetMainLineId: copiedPeer.resourceId, reason: oldBasketId, active: false
    }] });
    expect((await service.readiness(AUTHOR, "procurement", revised.id)).ready).toBe(true);
    await expectLiveEmpty();
  });

  it("enforces authenticated route schemas, private caching and narrow reference reads", async () => {
    const { service } = fixture();
    const actors: Record<string, PublicUser> = { admin: ADMIN, author: AUTHOR, other: OTHER };
    const auth = { authenticate: async (token: string) => actors[token] } as AuthService;
    const app = express(); app.use(express.json({ limit: "300kb" })); app.use("/api/v1", createVendorBasketProposalRouter(auth, service)); app.use(errorHandler);
    const created = await request(app).post("/api/v1/procurement/vendor-basket-proposals").set("Authorization", "Bearer author").send(input).expect(201);
    expect(created.headers["cache-control"]).toBe("private, no-store");
    const detail = created.body.data as ProposalDetail;
    await request(app).get(`/api/v1/admin/ai-estimator-knowledge/basket-proposals/${detail.id}`).set("Authorization", "Bearer admin").expect(404);
    await request(app).post("/api/v1/procurement/vendor-basket-proposals").set("Authorization", "Bearer admin").send(input).expect(403);
    await request(app).patch(`/api/v1/procurement/vendor-basket-proposals/${detail.id}/basket`).set("Authorization", "Bearer author").send({ expectedVersion: 1, name: "Changed", requesterId: OTHER.id }).expect(400);
    const references = await request(app).get("/api/v1/procurement/vendor-basket-proposals/references?kind=uoms").set("Authorization", "Bearer author").expect(200);
    expect(references.body.data.items[0]).toMatchObject({ id: UOM, decimalScale: 2 });
    await request(app).get("/api/v1/procurement/vendor-basket-proposals/references?kind=vendors").set("Authorization", "Bearer author").expect(400);
    const otherResource = (await service.hierarchy(AUTHOR, "procurement", detail.id, paging)).items;
    expect(otherResource).toEqual([]);
  });

  it("serializes review-save versus approve and approve versus reject without losing reviewed versions", async () => {
    const { service } = fixture(); const { detail } = await pending(service);
    const outcomes = await Promise.allSettled([
      service.saveBasket(ADMIN, "admin", detail.id, { name: "Saved review wins", expectedVersion: detail.version, expectedRequestVersion: detail.requestVersion! }),
      service.decide(ADMIN, detail.id, { decision: "approve", expectedVersion: detail.version, expectedRequestVersion: detail.requestVersion!, idempotencyKey: "racing-approve-one" })
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    const current = await service.get(ADMIN, "admin", detail.id);
    if (current.status === "pending") {
      expect(current.name).toBe("Saved review wins"); await expectLiveEmpty();
      const decisions = await Promise.allSettled([
        service.decide(ADMIN, detail.id, { decision: "approve", expectedVersion: current.version, expectedRequestVersion: current.requestVersion!, idempotencyKey: "racing-approve-two" }),
        service.decide(ADMIN, detail.id, { decision: "reject", reason: "Needs changes", expectedVersion: current.version, expectedRequestVersion: current.requestVersion!, idempotencyKey: "racing-reject-one" })
      ]);
      expect(decisions.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
      expect(decisions.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    } else {
      expect((await AiEstimatorKnowledgeBasketModel.findById(detail.basketId).lean())?.name).toBe(input.name);
    }
    expect(await VendorBasketRequestModel.countDocuments({ status: "pending" })).toBe(0);
    expect(await AuditEventModel.countDocuments({ action: "vendor_basket_proposal_decided" })).toBe(1);
  });

  it("preserves price paise and owned IDs across reference saves, value edits, review and rejected-copy remapping", async () => {
    const { service } = fixture(); const prepared = await ready(service); let current = prepared.detail;
    const vendorId = "proposal-budget-vendor";
    await AiEstimatorKnowledgeVendorModel.create({ _id: vendorId, name: "Budget vendor fixture", code: "BUDGET-FIXTURE", displayOrder: 0,
      status: "active", version: 1, createdById: ADMIN.id, updatedById: ADMIN.id });
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: vendorId }, { $set: { procurementProfile: {
      ...vendorProfileFixture(), currentAddressVerifiedPhysically: true, physicalAddressVerifiedAt: "2026-10-11T00:00:00.000Z", physicalAddressVerifiedById: ADMIN.id
    } } });
    await VendorInductionReviewModel.collection.insertOne({ _id: "proposal-review", vendorId, version: 1, vendorType: "execution", decision: "approved", idempotencyKey: "proposal-vendor-review" });
    await VendorKpiAssessmentModel.collection.insertMany(["vendor_self", "procurement"].map((source) => ({ _id: `proposal-${source}`, vendorId,
      source, vendorType: "execution", rubricVersion: 1, rubricGeneration: 0, revision: 1, averageScoreBps: 0 })));
    const budget = { operation: "set_budget", vendorId, uomId: UOM, inputAmountPaise: 11801,
      effectiveFrom: "2026-10-11T00:00:00.000Z", effectiveTo: null };
    const first = await service.saveSection(AUTHOR, "procurement", current.id, prepared.lineId, "pricing", { expectedVersion: current.version,
      applicability: "configured", payload: { priceEntries: [budget] } }); current = first.detail;
    const reference = (first.resource!.editorPayload!.priceEntries as Array<Record<string, any>>)[0]!;
    expect(reference.priceVersion.inputAmountPaise).toBe(11801);
    expect(reference.priceVersion).toMatchObject({ baseAmountPaise: 11801, taxAmountPaise: 2124, totalAmountPaise: 13925, treatment: "exclusive" });
    const canonical = (first.resource!.payload as ProposalSectionValue).payload.priceEntries as Array<Record<string, unknown>>;
    expect(canonical[0]).toMatchObject({ operation: "append", priceEntryId: reference.priceEntryId, inputAmountPaise: 11801 });
    const kept = await service.saveSection(AUTHOR, "procurement", current.id, prepared.lineId, "pricing", { expectedVersion: current.version,
      applicability: "configured", payload: { priceEntries: [{ operation: "reference", priceEntryId: reference.priceEntryId, priceVersionId: reference.priceVersionId }] } }); current = kept.detail;
    expect((kept.resource!.payload as ProposalSectionValue).payload.priceEntries).toEqual(canonical);
    const edited = await service.saveSection(AUTHOR, "procurement", current.id, prepared.lineId, "pricing", { expectedVersion: current.version,
      applicability: "configured", payload: { priceEntries: [{ ...budget, sourcePriceVersionId: reference.priceVersionId, inputAmountPaise: 24781 }] } }); current = edited.detail;
    expect(((edited.resource!.editorPayload!.priceEntries as Array<Record<string, any>>)[0]!).priceVersion).toMatchObject({ id: reference.priceVersionId, inputAmountPaise: 24781, baseAmountPaise: 24781, taxAmountPaise: 4461, totalAmountPaise: 29242 });
    await expect(service.saveSection(AUTHOR, "procurement", current.id, prepared.lineId, "pricing", { expectedVersion: current.version,
      applicability: "configured", payload: { priceEntries: [{ ...budget, sourcePriceVersionId: "foreign-live-price" }] } })).rejects.toMatchObject({ code: "KNOWLEDGE_REFERENCE_INVALID" });
    expect(await AiEstimatorKnowledgePriceVersionModel.countDocuments()).toBe(0);
    current = await service.submit(AUTHOR, current.id, { expectedVersion: current.version, idempotencyKey: "price-submit-key" });
    const rejected = await service.decide(ADMIN, current.id, { decision: "reject", reason: "Rework", expectedVersion: current.version, expectedRequestVersion: current.requestVersion!, idempotencyKey: "price-reject-key" });
    const revised = await service.revise(AUTHOR, current.id, { expectedVersion: rejected.version, expectedRequestVersion: rejected.requestVersion, idempotencyKey: "price-revise-key" });
    const hierarchy = await service.hierarchy(AUTHOR, "procurement", revised.id, paging);
    const line = hierarchy.items.find((node) => node.kind === "main_line")!;
    const revisedPricing = await service.resource(AUTHOR, "procurement", revised.id, line.sections.pricing!);
    const revisedReference = (revisedPricing.editorPayload!.priceEntries as Array<Record<string, any>>)[0]!;
    expect(revisedReference.priceEntryId).not.toBe(reference.priceEntryId);
    expect(revisedReference.priceVersion.inputAmountPaise).toBe(24781);
    const original = await service.resource(AUTHOR, "procurement", current.id, edited.resource!.resourceId, { snapshot: "submitted" });
    expect((original.editorPayload!.priceEntries as Array<Record<string, any>>)[0]!.priceEntryId).toBe(reference.priceEntryId);
  });

  it("allows 50 Sub-Baskets and rejects the 51st without an orphan resource or version bump", async () => {
    const { service } = fixture(); let current = await service.create(AUTHOR, input);
    for (let index = 0; index < 50; index++) current = (await service.addSubBasket(AUTHOR, "procurement", current.id,
      { expectedVersion: current.version, name: `Sub Basket ${index}` })).detail;
    const count = await VendorBasketProposalResourceModel.countDocuments();
    await expect(service.addSubBasket(AUTHOR, "procurement", current.id, { expectedVersion: current.version, name: "Above limit" })).rejects.toMatchObject({ code: "PROPOSAL_LIMIT_EXCEEDED" });
    expect((await service.get(AUTHOR, "procurement", current.id)).version).toBe(current.version);
    expect(await VendorBasketProposalResourceModel.countDocuments()).toBe(count);
    expect((await service.hierarchy(AUTHOR, "procurement", current.id, { limit: 20, offset: 40 })).pagination).toEqual({ total: 50, limit: 20, offset: 40, hasMore: false });
    await expectLiveEmpty();
  });

  it("blocks invalid saved references and revalidates activation after a previously valid reference changes", async () => {
    const { service } = fixture(); const { detail, lineId } = await ready(service);
    const count = await VendorBasketProposalResourceModel.countDocuments();
    await expect(service.saveSection(AUTHOR, "procurement", detail.id, lineId, "overview", { expectedVersion: detail.version,
      applicability: "configured", payload: { uomId: "foreign-missing-uom", modeIds: [], surfaceIds: [] } })).rejects.toMatchObject({ code: "PROPOSAL_CONFIGURATION_INVALID" });
    expect(await VendorBasketProposalResourceModel.countDocuments()).toBe(count);
    const submitted = await service.submit(AUTHOR, detail.id, { expectedVersion: detail.version, idempotencyKey: "changed-reference-submit" });
    await AiEstimatorKnowledgeUomModel.updateOne({ _id: UOM }, { $set: { status: "inactive" } });
    await expect(service.decide(ADMIN, submitted.id, { decision: "approve", expectedVersion: submitted.version,
      expectedRequestVersion: submitted.requestVersion!, idempotencyKey: "changed-reference-approve" })).rejects.toMatchObject({ code: "PROPOSAL_NOT_READY" });
    expect((await service.get(ADMIN, "admin", submitted.id)).status).toBe("pending");
    await expectLiveEmpty();
  });

  it("repairs unrelated stale references one section at a time and permits quality saves without weakening readiness", async () => {
    const { service } = fixture(); const prepared = await ready(service); let current = prepared.detail;
    const second = await service.addMainLine(AUTHOR, "procurement", current.id, prepared.subId, { expectedVersion: current.version, name: "Second affected line" }); current = second.detail;
    current = (await service.saveSection(AUTHOR, "procurement", current.id, second.resource!.resourceId, "overview", {
      expectedVersion: current.version, applicability: "configured", payload: { uomId: UOM }
    })).detail;
    await AiEstimatorKnowledgeModeModel.create({ _id: "repair-mode", name: "Repair mode", code: "REPAIR", displayOrder: 0,
      status: "active", version: 1, createdById: ADMIN.id, updatedById: ADMIN.id });
    current = (await service.saveSection(AUTHOR, "procurement", current.id, prepared.lineId, "scope", {
      expectedVersion: current.version, applicability: "configured", payload: { modeIds: ["repair-mode"] }
    })).detail;
    await AiEstimatorKnowledgeUomModel.updateOne({ _id: UOM }, { $set: { status: "inactive" } });
    await AiEstimatorKnowledgeModeModel.updateOne({ _id: "repair-mode" }, { $set: { status: "inactive" } });
    await AiEstimatorKnowledgeUomModel.create({ _id: "replacement-uom", name: "Replacement unit", code: "REPLACEMENT", decimalScale: 2, displayOrder: 1,
      status: "active", version: 1, createdById: ADMIN.id, updatedById: ADMIN.id });
    current = (await service.saveQuality(AUTHOR, "procurement", current.id, { expectedVersion: current.version, parameters: [] })).detail;
    expect((await service.readiness(AUTHOR, "procurement", current.id)).ready).toBe(false);
    for (const lineId of [prepared.lineId, second.resource!.resourceId]) {
      current = (await service.saveSection(AUTHOR, "procurement", current.id, lineId, "overview", {
        expectedVersion: current.version, applicability: "configured", payload: { uomId: "replacement-uom" }
      })).detail;
      expect((await service.readiness(AUTHOR, "procurement", current.id)).ready).toBe(false);
    }
    await expect(service.submit(AUTHOR, current.id, { expectedVersion: current.version, idempotencyKey: "repair-incomplete-submit" })).rejects.toMatchObject({ code: "PROPOSAL_NOT_READY" });
    current = (await service.saveSection(AUTHOR, "procurement", current.id, prepared.lineId, "scope", {
      expectedVersion: current.version, applicability: "not_configured", payload: {}
    })).detail;
    expect((await service.readiness(AUTHOR, "procurement", current.id)).ready).toBe(true);
    expect((await service.submit(AUTHOR, current.id, { expectedVersion: current.version, idempotencyKey: "repair-complete-submit" })).status).toBe("pending");
    await expectLiveEmpty();
  });

  it("retains cross-section slab specification constraints during targeted pricing saves", async () => {
    const { service } = fixture(); const prepared = await ready(service); let current = prepared.detail;
    current = (await service.saveSection(AUTHOR, "procurement", current.id, prepared.lineId, "pricing", {
      expectedVersion: current.version, applicability: "configured", payload: { specifications: [{ id: "retained-spec", name: "Retained specification" }] }
    })).detail;
    current = (await service.saveSection(AUTHOR, "procurement", current.id, prepared.lineId, "quantity-margin", {
      expectedVersion: current.version, applicability: "configured", payload: { slabRates: [{ id: "retained-slab", specificationId: "retained-spec", uomId: UOM, quantity: "2", unitRatePaise: 175 }] }
    })).detail;
    await expect(service.saveSection(AUTHOR, "procurement", current.id, prepared.lineId, "pricing", {
      expectedVersion: current.version, applicability: "not_configured", payload: { specifications: [] }
    })).rejects.toMatchObject({ code: "PROPOSAL_CONFIGURATION_INVALID", fields: expect.objectContaining({ [prepared.lineId + ".payload.specifications"]: expect.stringContaining("slab rate") }) });
    expect((await service.get(AUTHOR, "procurement", current.id)).version).toBe(current.version);
  });
});

describe("existing-parent Sub-Basket proposals", { timeout: 45_000 }, () => {
  async function parents() {
    for (const [index, name] of ["Existing Painting", "Existing Plumbing"].entries()) {
      await AiEstimatorKnowledgeBasketModel.create({ _id: `parent-${index}`, name, description: `Preserve ${name}`, displayOrder: index + 19,
        status: "active", version: index + 4, createdById: ADMIN.id, updatedById: ADMIN.id });
      await AiEstimatorKnowledgeSubBasketModel.create({ _id: `sibling-${index}`, basketId: `parent-${index}`, name: `Existing child ${index}`,
        nameNormalized: `existing child ${index}`, displayOrder: index + 9, version: 2, createdById: ADMIN.id, updatedById: ADMIN.id });
    }
  }
  async function subDraft(service: ReturnType<typeof createVendorBasketProposalService>, parent = "parent-0", name = "New finishes", actor = AUTHOR) {
    return service.create(actor, { ...input, name, idempotencyKey: `sub-${parent}-${actor.id}-${name.replace(/\W/gu, "_")}`, target: { kind: "new_sub_basket", basketId: parent } });
  }
  function command(detail: ProposalDetail, key = "approve-sub-proposal") {
    return { decision: "approve" as const, expectedVersion: detail.version, expectedRequestVersion: detail.requestVersion!, idempotencyKey: key };
  }
  it.each(["legacy_main", "sub"] as const)("audits immutable target context across creation, submission and rejection: %s", async (kind) => {
    await parents(); const { service } = fixture();
    const draft = kind === "sub" ? await subDraft(service) : (await ready(service, "Audited main proposal")).detail;
    if (kind === "legacy_main") {
      // Historical schema-version-1 documents have no target fields.
      await VendorBasketProposalModel.collection.updateOne({ _id: draft.id }, { $unset: { targetKind: "", targetParentBasketId: "", targetParentName: "" } });
    }
    const submitted = await service.submit(AUTHOR, draft.id, { expectedVersion: draft.version, idempotencyKey: `audit-target-${kind}` });
    await service.decide(ADMIN, draft.id, { ...command(submitted), decision: "reject", reason: "Review fixture" });
    const events = await AuditEventModel.find({ entityId: draft.id, action: { $in: [
      "vendor_basket_proposal_created", "vendor_basket_proposal_submitted", "vendor_basket_proposal_decided"
    ] } }).lean();
    expect(events).toHaveLength(3);
    for (const event of events) expect(event.newValues).toMatchObject({
      targetKind: kind === "sub" ? "new_sub_basket" : "new_main_basket",
      targetParentBasketId: kind === "sub" ? "parent-0" : null
    });
    expect(events.find((event) => event.action === "vendor_basket_proposal_decided")?.newValues).toMatchObject({ status: "rejected" });
  });
  it("fails closed until explicit index transition without blocking old Main Basket requests", async () => {
    await parents(); const { service } = fixture(); const definition = PENDING_REQUEST_INDEXES[0];
    await VendorBasketRequestModel.collection.createIndex(definition.oldKey, { name: definition.oldName, unique: true, partialFilterExpression: PENDING_REQUEST_FILTER });
    try {
      await expect(subDraft(service)).rejects.toMatchObject({ code: "PROPOSAL_TARGET_SETUP_UNAVAILABLE" });
      expect((await service.create(AUTHOR, input)).target).toEqual({ kind: "new_main_basket" });
    } finally { await VendorBasketRequestModel.collection.dropIndex(definition.oldName); }
  });
  it("retains current inherited quality revision without including it in submitted content or changing it on approval", async () => {
    await parents(); const { service } = fixture();
    const parameters: Record<string, unknown>[] = [];
    await AiEstimatorKnowledgeBasketQualityRevisionModel.create({ _id: "inherited-quality", basketId: "parent-0", revisionNumber: 1,
      contentDigest: basketQualityDigest("parent-0", parameters), parameters, createdById: ADMIN.id, createdAt: new Date() });
    await AiEstimatorKnowledgeBasketModel.updateOne({ _id: "parent-0" }, { $set: { qualityRevisionId: "inherited-quality" } });
    const quality = await AiEstimatorKnowledgeBasketQualityRevisionModel.findById("inherited-quality").lean();
    const draft = await subDraft(service);
    expect(draft.qualityResourceId).toBeNull();
    const submitted = await service.submit(AUTHOR, draft.id, { expectedVersion: draft.version, idempotencyKey: "submit-quality-sub" });
    expect(await service.inheritedQuality(ADMIN, "admin", draft.id)).toMatchObject({ revisionId: "inherited-quality", revisionNumber: 1 });
    const result = await service.decide(ADMIN, draft.id, command(submitted));
    expect(result.published!.qualityRevisionId).toBe("inherited-quality");
    expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.findById("inherited-quality").lean()).toEqual(quality);
    expect(await AiEstimatorKnowledgeBasketQualityRevisionModel.countDocuments()).toBe(1);
    expect((await service.get(AUTHOR, "procurement", draft.id, { snapshot: "submitted" })).head.digest).toBe(submitted.head.digest);
  });
  it("creates one child with immutable parent context and allows an empty Sub-Basket through approval without changing prior business data", async () => {
    await parents(); const { service, legacy } = fixture();
    const prior = await AiEstimatorKnowledgeBasketModel.findById("parent-0").lean();
    const siblings = await AiEstimatorKnowledgeSubBasketModel.find().sort({ _id: 1 }).lean();
    const draft = await subDraft(service);
    expect(draft).toMatchObject({ name: "New finishes", basketId: "parent-0", targetParentName: "Existing Painting", counts: { subBaskets: 1, mainLines: 0 },
      capabilities: { edit: true, editParent: false, editQuality: false, manageSubBaskets: false } });
    expect((await service.listMine(AUTHOR, paging)).items[0]).toMatchObject({ name: "New finishes", target: { kind: "new_sub_basket", basketId: "parent-0" } });
    expect((await service.readiness(AUTHOR, "procurement", draft.id)).ready).toBe(true);
    const submitted = await service.submit(AUTHOR, draft.id, { expectedVersion: draft.version, idempotencyKey: "submit-sub-empty" });
    expect(await legacy.getForAdmin(ADMIN, submitted.requestId!)).toMatchObject({ proposedName: "New finishes", targetParentName: "Existing Painting", basketId: null });
    const result = await service.decide(ADMIN, draft.id, command(submitted));
    const child = (await service.hierarchy(AUTHOR, "procurement", draft.id, paging)).items[0]!;
    expect(result.published).toMatchObject({ basketId: "parent-0", subBasketIds: [child.resourceId], mainLines: [] });
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments()).toBe(2);
    const after = await AiEstimatorKnowledgeBasketModel.findById("parent-0").lean();
    expect({ ...after, dependencyEpoch: prior!.dependencyEpoch }).toEqual(prior);
    expect(await AiEstimatorKnowledgeSubBasketModel.find({ _id: { $in: siblings.map((row) => row._id) } }).sort({ _id: 1 }).lean()).toEqual(siblings);
    expect(await AiEstimatorKnowledgeSubBasketModel.findById(child.resourceId).lean()).toMatchObject({ basketId: "parent-0", name: "New finishes", displayOrder: 10 });
    expect(await legacy.getForAdmin(ADMIN, submitted.requestId!)).toMatchObject({ basketId: "parent-0", subBasketId: child.resourceId });
  });
  it("denies parent/quality/cardinality tampering for both author and reviewer and keeps inherited quality scoped", async () => {
    await parents(); const { service } = fixture(); let draft = await subDraft(service);
    const child = (await service.hierarchy(AUTHOR, "procurement", draft.id, paging)).items[0]!;
    const version = { expectedVersion: draft.version };
    await expect(service.saveBasket(AUTHOR, "procurement", draft.id, { ...version, name: "Overwrite parent" })).rejects.toMatchObject({ code: "PROPOSAL_PARENT_READ_ONLY" });
    await expect(service.addSubBasket(AUTHOR, "procurement", draft.id, { ...version, name: "Extra" })).rejects.toMatchObject({ code: "PROPOSAL_PARENT_READ_ONLY" });
    await expect(service.removeSubBasket(AUTHOR, "procurement", draft.id, child.resourceId, version)).rejects.toMatchObject({ code: "PROPOSAL_PARENT_READ_ONLY" });
    await expect(service.saveQuality(AUTHOR, "procurement", draft.id, { ...version, parameters: [] })).rejects.toMatchObject({ code: "PROPOSAL_PARENT_READ_ONLY" });
    expect(await service.inheritedQuality(AUTHOR, "procurement", draft.id)).toMatchObject({ basketId: "parent-0", basketName: "Existing Painting", parameters: [], revisionId: null });
    await expect(service.inheritedQuality(OTHER, "procurement", draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const line = await service.addMainLine(AUTHOR, "procurement", draft.id, child.resourceId, { ...version, name: "New line" }); draft = line.detail;
    await expect(service.saveSection(AUTHOR, "procurement", draft.id, line.resource!.resourceId, "quality", { expectedVersion: draft.version, applicability: "configured", payload: { parameters: [] } })).rejects.toMatchObject({ code: "PROPOSAL_PARENT_READ_ONLY" });
    draft = (await service.removeMainLine(AUTHOR, "procurement", draft.id, line.resource!.resourceId, { expectedVersion: draft.version })).detail;
    draft = await service.submit(AUTHOR, draft.id, { expectedVersion: draft.version, idempotencyKey: "submit-readonly-sub" });
    await expect(service.saveBasket(ADMIN, "admin", draft.id, { expectedVersion: draft.version, expectedRequestVersion: draft.requestVersion!, name: "Reviewer overwrite" })).rejects.toMatchObject({ code: "PROPOSAL_PARENT_READ_ONLY" });
    await expect(service.saveQuality(ADMIN, "admin", draft.id, { expectedVersion: draft.version, expectedRequestVersion: draft.requestVersion!, parameters: [] })).rejects.toMatchObject({ code: "PROPOSAL_PARENT_READ_ONLY" });
  });
  it("preserves hidden metadata values, activates included Main Lines and allocates order after existing children", async () => {
    await parents(); const { service } = fixture(); let draft = await subDraft(service);
    const sub = (await service.hierarchy(AUTHOR, "procurement", draft.id, paging)).items[0]!;
    const line = await service.addMainLine(AUTHOR, "procurement", draft.id, sub.resourceId, { expectedVersion: draft.version, name: "Coat", description: "Keep description", displayOrder: 87 });
    const updated = await service.saveMainLine(AUTHOR, "procurement", draft.id, line.resource!.resourceId, { expectedVersion: line.detail.version, name: "Finish coat" });
    expect(updated.resource!.payload).toMatchObject({ description: "Keep description", displayOrder: 87 });
    draft = (await service.saveSection(AUTHOR, "procurement", draft.id, line.resource!.resourceId, "overview", { expectedVersion: updated.detail.version, applicability: "configured", payload: { uomId: UOM } })).detail;
    draft = await service.submit(AUTHOR, draft.id, { expectedVersion: draft.version, idempotencyKey: "submit-line-sub" });
    const result = await service.decide(ADMIN, draft.id, command(draft));
    expect(result.published!.mainLines).toHaveLength(1);
    expect(await AiEstimatorKnowledgeMainLineModel.findById(line.resource!.resourceId).lean()).toMatchObject({ basketId: "parent-0", subBasketId: sub.resourceId, name: "Finish coat", description: "Keep description", displayOrder: 0, status: "active" });
  });
  it("isolates duplicate pending names by parent and keeps duplicate root Main Basket behavior", async () => {
    await parents(); const { service } = fixture();
    const first = await subDraft(service); const second = await subDraft(service, "parent-1");
    const duplicate = await subDraft(service, "parent-0", "New finishes", OTHER);
    await Promise.all([first, second].map((draft) => service.submit(AUTHOR, draft.id, { expectedVersion: draft.version, idempotencyKey: `submit-${draft.id}` })));
    await expect(service.submit(OTHER, duplicate.id, { expectedVersion: duplicate.version, idempotencyKey: "submit-duplicate" })).rejects.toMatchObject({ code: "REQUEST_PENDING" });
    expect(await VendorBasketRequestModel.countDocuments({ status: "pending" })).toBe(2);
  });
  it("revises proposed IDs while retaining the live parent and captured parent context", async () => {
    await parents(); const { service } = fixture(); const draft = await subDraft(service);
    const sub = (await service.hierarchy(AUTHOR, "procurement", draft.id, paging)).items[0]!;
    const submitted = await service.submit(AUTHOR, draft.id, { expectedVersion: draft.version, idempotencyKey: "submit-revision-sub" });
    const rejected = await service.decide(ADMIN, draft.id, { ...command(submitted), decision: "reject", reason: "Refine" });
    await AiEstimatorKnowledgeBasketModel.updateOne({ _id: "parent-0" }, { $set: { name: "Current parent name", nameNormalized: "current parent name" } });
    const revised = await service.revise(AUTHOR, draft.id, { expectedVersion: rejected.version, expectedRequestVersion: rejected.requestVersion, idempotencyKey: "revise-sub-target" });
    expect(revised).toMatchObject({ basketId: "parent-0", targetParentName: "Existing Painting", name: "New finishes" });
    expect(revised.basket.payload.name).toBe("Existing Painting");
    const newSub = (await service.hierarchy(AUTHOR, "procurement", revised.id, paging)).items[0]!;
    expect(newSub.parentId).toBe("parent-0"); expect(newSub.resourceId).not.toBe(sub.resourceId);
    expect((await service.inheritedQuality(AUTHOR, "procurement", revised.id)).basketName).toBe("Current parent name");
  });
  it("rejects unavailable parents and competing child names without partial publication", async () => {
    await parents(); const { service } = fixture(); let draft = await subDraft(service);
    draft = await service.submit(AUTHOR, draft.id, { expectedVersion: draft.version, idempotencyKey: "submit-conflict-sub" });
    await AiEstimatorKnowledgeSubBasketModel.create({ _id: "competing-child", basketId: "parent-0", name: "New finishes", nameNormalized: "new finishes", displayOrder: 10, version: 1, createdById: ADMIN.id, updatedById: ADMIN.id });
    await expect(service.decide(ADMIN, draft.id, command(draft))).rejects.toMatchObject({ code: "DUPLICATE_IDENTITY" });
    expect((await service.get(ADMIN, "admin", draft.id)).status).toBe("pending");
    await AiEstimatorKnowledgeBasketModel.updateOne({ _id: "parent-0" }, { $set: { status: "inactive" } });
    await expect(subDraft(service, "parent-0", "Other child")).rejects.toMatchObject({ code: "PARENT_BASKET_UNAVAILABLE" });
    expect((await service.readiness(ADMIN, "admin", draft.id)).findings).toContainEqual(expect.objectContaining({ code: "PARENT_BASKET_UNAVAILABLE" }));
  });
  it("rolls back submitted resources, audit and queue when notification persistence fails, then replays exactly once", async () => {
    await parents(); const { service } = fixture(); const draft = await subDraft(service);
    const failed = vi.spyOn(VendorBasketRequestNotificationModel, "updateOne").mockImplementationOnce(() => { throw new Error("notification write fixture failure"); });
    const submit = { expectedVersion: draft.version, idempotencyKey: "notification-atomic-submit" };
    await expect(service.submit(AUTHOR, draft.id, submit)).rejects.toThrow("notification write fixture failure"); failed.mockRestore();
    expect(await VendorBasketRequestModel.countDocuments()).toBe(0);
    expect(await VendorBasketRequestNotificationModel.countDocuments()).toBe(0);
    expect(await AuditEventModel.countDocuments({ action: "vendor_basket_proposal_submitted" })).toBe(0);
    expect((await service.get(AUTHOR, "procurement", draft.id)).status).toBe("draft");
    const submitted = await service.submit(AUTHOR, draft.id, submit); await service.submit(AUTHOR, draft.id, submit);
    expect(await VendorBasketRequestNotificationModel.countDocuments({ requestId: submitted.requestId })).toBe(1);
    const rejected = await service.decide(ADMIN, draft.id, { ...command(submitted), decision: "reject", reason: "Adjust" });
    const revised = await service.revise(AUTHOR, draft.id, { expectedVersion: rejected.version, expectedRequestVersion: rejected.requestVersion, idempotencyKey: "notification-revision" });
    await service.submit(AUTHOR, revised.id, { expectedVersion: revised.version, idempotencyKey: "notification-resubmit" });
    expect(await VendorBasketRequestNotificationModel.countDocuments()).toBe(2);
  });
  it("coordinates concurrent approval and same-name Configuration creation without reusing a competing child", async () => {
    await parents(); const { service, audit } = fixture(); const draft = await subDraft(service);
    const submitted = await service.submit(AUTHOR, draft.id, { expectedVersion: draft.version, idempotencyKey: "submit-race-child" });
    const reference = createAiEstimatorKnowledgeReferenceService({ audit });
    const outcomes = await Promise.allSettled([
      service.decide(ADMIN, draft.id, command(submitted)),
      reference.createSubBasket(ADMIN, "parent-0", { name: "New finishes" })
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(await AiEstimatorKnowledgeSubBasketModel.countDocuments({ basketId: "parent-0", nameNormalized: "new finishes" })).toBe(1);
    const proposal = await service.get(ADMIN, "admin", draft.id);
    expect(proposal.status).toBe(outcomes[0]!.status === "fulfilled" ? "fulfilled" : "pending");
  });
  it.each(["approve-first", "deactivate-first"])("serializes approval with parent deactivation: %s", async (order) => {
    await parents(); const { service, audit } = fixture(); const draft = await subDraft(service);
    const submitted = await service.submit(AUTHOR, draft.id, { expectedVersion: draft.version, idempotencyKey: "submit-race-parent" });
    let enter!: () => void; let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; }); const released = new Promise<void>((resolve) => { release = resolve; });
    let paused = false;
    const gatedAudit: Pick<AuditService, "appendInMongoTransaction"> = { appendInMongoTransaction: async (event, session) => {
      const gate = order === "approve-first" ? "ai_estimator_knowledge_sub_basket_created" : "ai_estimator_knowledge_basket_updated";
      if (!paused && event.action === gate) { paused = true; enter(); await released; }
      return audit.appendInMongoTransaction(event, session);
    } };
    const reference = createAiEstimatorKnowledgeReferenceService({ audit });
    const gateReference = createAiEstimatorKnowledgeReferenceService({ audit: gatedAudit });
    const gateService = fixture(gatedAudit).service;
    const deactivate = (target = reference) => target.updateBasket(ADMIN, "parent-0", { expectedVersion: 4, status: "inactive" });
    const first = order === "approve-first" ? gateService.decide(ADMIN, draft.id, command(submitted)) : deactivate(gateReference);
    await entered;
    const second = order === "approve-first" ? deactivate() : service.decide(ADMIN, draft.id, command(submitted));
    await new Promise<void>((resolve) => setImmediate(resolve)); release();
    const outcomes = await Promise.allSettled([first, second]);
    expect(outcomes[0]!.status).toBe("fulfilled");
    const after = await service.get(ADMIN, "admin", draft.id);
    expect(after.status).toBe(order === "approve-first" ? "fulfilled" : "pending");
    expect(await AiEstimatorKnowledgeSubBasketModel.countDocuments({ basketId: "parent-0", nameNormalized: "new finishes" })).toBe(order === "approve-first" ? 1 : 0);
  });

  it("rolls back the new child and parent dependency counter together when approval audit fails", async () => {
    await parents(); const { service, audit } = fixture(); const draft = await subDraft(service);
    const submitted = await service.submit(AUTHOR, draft.id, { expectedVersion: draft.version, idempotencyKey: "submit-rollback-sub" });
    const parent = await AiEstimatorKnowledgeBasketModel.findById("parent-0").lean();
    const failing = fixture({ appendInMongoTransaction: async (event, session) => {
      if (event.action === "vendor_basket_proposal_decided") throw new Error("sub decision fixture failure");
      return audit.appendInMongoTransaction(event, session);
    } }).service;
    await expect(failing.decide(ADMIN, draft.id, command(submitted))).rejects.toThrow("sub decision fixture failure");
    expect(await AiEstimatorKnowledgeBasketModel.findById("parent-0").lean()).toEqual(parent);
    expect(await AiEstimatorKnowledgeSubBasketModel.countDocuments({ basketId: "parent-0" })).toBe(1);
    expect((await service.get(ADMIN, "admin", draft.id)).status).toBe("pending");
  });
  it("keeps the request pending when a concurrent parent deletion commits before approval", async () => {
    await parents(); const { service, audit } = fixture(); const draft = await subDraft(service);
    const submitted = await service.submit(AUTHOR, draft.id, { expectedVersion: draft.version, idempotencyKey: "submit-delete-sub" });
    let enter!: () => void; let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; }); const released = new Promise<void>((resolve) => { release = resolve; });
    const reference = createAiEstimatorKnowledgeReferenceService({ audit: { appendInMongoTransaction: async (event, session) => {
      if (event.action === "ai_estimator_knowledge_basket_permanently_deleted") { enter(); await released; }
      return audit.appendInMongoTransaction(event, session);
    } } });
    const deleting = reference.permanentlyDeleteBasket(ADMIN, "parent-0", { expectedVersion: 4, confirmationName: "Existing Painting", reason: "Synthetic removal" });
    await entered;
    const approving = service.decide(ADMIN, draft.id, command(submitted)).catch((error: unknown) => error);
    await new Promise<void>((resolve) => setImmediate(resolve)); release();
    await deleting;
    expect(await approving).toMatchObject({ code: "PROPOSAL_NOT_READY" });
    expect((await service.get(ADMIN, "admin", draft.id)).status).toBe("pending");
    expect(await AiEstimatorKnowledgeSubBasketModel.countDocuments({ basketId: "parent-0" })).toBe(0);
    expect(await AiEstimatorKnowledgeBasketModel.exists({ _id: "parent-0" })).toBeNull();
  });
  it("validates target and read-only inherited quality at the HTTP boundary", async () => {
    await parents(); const { service } = fixture();
    const actors: Record<string, PublicUser> = { admin: ADMIN, author: AUTHOR, other: OTHER };
    const app = express(); app.use(express.json()); app.use("/api/v1", createVendorBasketProposalRouter({ authenticate: async (token: string) => actors[token] } as AuthService, service)); app.use(errorHandler);
    const base = "/api/v1/procurement/vendor-basket-proposals";
    await request(app).post(base).set("Authorization", "Bearer author").send({ ...input, target: { kind: "new_main_basket", basketId: "parent-0" } }).expect(400);
    const created = await request(app).post(base).set("Authorization", "Bearer author").send({ ...input, target: { kind: "new_sub_basket", basketId: "parent-0" } }).expect(201);
    const path = `${base}/${created.body.data.id}/inherited-quality`;
    const quality = await request(app).get(path).set("Authorization", "Bearer author").expect(200);
    expect(quality.headers["cache-control"]).toBe("private, no-store"); expect(quality.body.data.basketId).toBe("parent-0");
    await request(app).get(path).set("Authorization", "Bearer other").expect(404);
    await request(app).get(`${path}?basketId=parent-1`).set("Authorization", "Bearer author").expect(400);
    await request(app).put(`${base}/${created.body.data.id}/quality`).set("Authorization", "Bearer author").send({ expectedVersion: 1, parameters: [] }).expect(409);
  });

});
