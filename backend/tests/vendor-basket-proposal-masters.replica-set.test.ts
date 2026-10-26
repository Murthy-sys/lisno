import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { ProposalDetail, ProposalMasterResource, ProposalSectionValue } from "../src/contracts/vendor-basket-proposal.js";
import { UserModel } from "../src/models/User.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { VendorBasketProposalModel } from "../src/models/VendorBasketProposal.js";
import { VendorBasketProposalResourceModel } from "../src/models/VendorBasketProposalResource.js";
import { VendorBasketRequestModel } from "../src/models/VendorBasketRequest.js";
import { VendorBasketRequestNotificationModel } from "../src/models/VendorBasketRequestNotification.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeSurfaceModel } from "../src/models/AiEstimatorKnowledgeSurface.js";
import { AiEstimatorKnowledgeDisplayOrderSequenceModel } from "../src/models/AiEstimatorKnowledgeDisplayOrderSequence.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { AiEstimatorKnowledgePriceVersionModel } from "../src/models/AiEstimatorKnowledgePriceVersion.js";
import { VendorInductionReviewModel } from "../src/models/VendorInduction.js";
import { VendorKpiAssessmentModel } from "../src/models/VendorKpiAssessment.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService, type AuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createVendorBasketProposalService } from "../src/services/vendor-basket-proposal.service.js";
import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import { generatedKnowledgeMasterCode } from "../src/services/ai-estimator-knowledge-master-values.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import { vendorProfileFixture } from "./procurement-vendor-profile.fixture.js";

const ADMIN: PublicUser = { id: "master-admin", name: "Master Admin", email: "admin@master.invalid", role: "super_admin" };
const AUTHOR: PublicUser = { id: "master-author", name: "Master Author", email: "author@master.invalid", role: "procurement" };
const OTHER: PublicUser = { id: "master-other", name: "Master Other", email: "other@master.invalid", role: "procurement" };
const paging = { limit: 100, offset: 0 };
const stamps = { createdById: ADMIN.id, updatedById: ADMIN.id };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let sequence = 0;
const models = [UserModel, AuthorizationCoordinationModel, AuditEventModel, VendorBasketProposalModel, VendorBasketProposalResourceModel,
  VendorBasketRequestModel, VendorBasketRequestNotificationModel, AiEstimatorKnowledgeBasketModel, AiEstimatorKnowledgeSubBasketModel,
  AiEstimatorKnowledgeMainLineModel, AiEstimatorKnowledgeRevisionModel, AiEstimatorKnowledgeSectionModel, AiEstimatorKnowledgeUomModel,
  AiEstimatorKnowledgeSurfaceModel, AiEstimatorKnowledgeDisplayOrderSequenceModel, AiEstimatorKnowledgeVendorModel,
  AiEstimatorKnowledgePriceVersionModel, VendorInductionReviewModel, VendorKpiAssessmentModel];
beforeAll(async () => { replica = await startMongoReplicaSet("proposal-private-masters"); await Promise.all(models.map((model) => model.syncIndexes())); }, 120_000);
beforeEach(async () => {
  await replica.clear(); sequence = 0;
  for (const actor of [ADMIN, AUTHOR, OTHER]) await UserModel.create({ _id: actor.id, name: actor.name, email: actor.email,
    emailNormalized: actor.email, passwordHash: "fixture-only", role: actor.role, active: true });
});
afterAll(async () => { await replica?.stop(); });
function fixture(audit: Pick<AuditService, "appendInMongoTransaction"> = createAuditService(createMemoryRepository())) {
  return { audit, service: createVendorBasketProposalService({ audit }) };
}
type Service = ReturnType<typeof createVendorBasketProposalService>;
function command(detail: ProposalDetail) { return { expectedVersion: detail.version, ...(detail.requestVersion ? { expectedRequestVersion: detail.requestVersion } : {}) }; }
async function setup(service: Service, actor = AUTHOR, subTarget = false) {
  const serial = ++sequence;
  if (subTarget && !await AiEstimatorKnowledgeBasketModel.exists({ _id: "existing-parent" })) await AiEstimatorKnowledgeBasketModel.create({ _id: "existing-parent", name: "Parent", status: "active", displayOrder: 0, version: 1, ...stamps });
  let detail = await service.create(actor, { name: `Proposed ${serial}`, vendorName: `Vendor ${serial}`, idempotencyKey: `draft-key-${serial}`,
    ...(subTarget ? { target: { kind: "new_sub_basket" as const, basketId: "existing-parent" } } : {}) });
  let subId: string;
  if (subTarget) subId = (await service.hierarchy(actor, "procurement", detail.id, paging)).items[0]!.resourceId;
  else { const sub = await service.addSubBasket(actor, "procurement", detail.id, { ...command(detail), name: "Preparation" }); detail = sub.detail; subId = sub.resource!.resourceId; }
  const line = await service.addMainLine(actor, "procurement", detail.id, subId, { ...command(detail), name: "Wall preparation" }); detail = line.detail;
  const unit = await service.addMaster(actor, "procurement", detail.id, "uoms", { ...command(detail), name: "Proposed unit", decimalScale: 2 }); detail = unit.detail;
  const surface = await service.addMaster(actor, "procurement", detail.id, "surfaces", { ...command(detail), name: "Proposed surface" }); detail = surface.detail;
  const uomId = unit.resource!.resourceId; const surfaceId = surface.resource!.resourceId; const lineId = line.resource!.resourceId;
  detail = (await service.saveSection(actor, "procurement", detail.id, lineId, "overview", { ...command(detail), applicability: "configured", payload: { uomId, surfaceIds: [surfaceId] } })).detail;
  return { detail, lineId, subId, uomId, surfaceId };
}
async function section(service: Service, detail: ProposalDetail, lineId: string, key: ProposalSectionValue["sectionKey"], payload: Record<string, unknown>) {
  return (await service.saveSection(AUTHOR, "procurement", detail.id, lineId, key, { ...command(detail), applicability: "configured", payload })).detail;
}
function productivity(uomId: string, value = "1.25", active = true) { return { id: "productivity-one", value, uomId, crewSize: 1, skillType: null, minimumDuration: null, maximumDuration: null, durationUnit: "days", active }; }
async function savedSection(service: Service, detail: ProposalDetail, lineId: string, key: ProposalSectionValue["sectionKey"]) {
  const line = (await service.hierarchy(AUTHOR, "procurement", detail.id, paging)).items.find((entry) => entry.resourceId === lineId)!;
  return (await service.resource(AUTHOR, "procurement", detail.id, line.sections[key]!)).payload as ProposalSectionValue;
}
async function vendor() {
  const now = new Date();
  await AiEstimatorKnowledgeVendorModel.create({ _id: "private-vendor", name: "Price Vendor", code: "PRICE", displayOrder: 1, status: "active", version: 1, ...stamps });
  await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: "private-vendor" }, { $set: { procurementProfile: { ...vendorProfileFixture(), mainBasketId: "source-basket", subBasketId: "source-sub", currentAddressVerifiedPhysically: true, physicalAddressVerifiedAt: now.toISOString(), physicalAddressVerifiedById: ADMIN.id } } });
  await VendorInductionReviewModel.collection.insertOne({ _id: "private-review", vendorId: "private-vendor", version: 1, vendorType: "execution", decision: "approved", idempotencyKey: "private-review" });
  await VendorKpiAssessmentModel.collection.insertMany(["vendor_self", "procurement"].map((source) => ({ _id: `private-kpi-${source}`, vendorId: "private-vendor", source, vendorType: "execution", rubricVersion: 1, rubricGeneration: 0, revision: 1, averageScoreBps: 0 })));
}

describe("proposal-scoped UOMs and surfaces", { timeout: 45_000 }, () => {
  it("validates required dimensions against private UOM names before those masters are published", async () => {
    const { service } = fixture(); let { detail, lineId, uomId } = await setup(service);
    await expect(section(service, detail, lineId, "overview", { uomId, dimensionsMandatory: true })).rejects.toMatchObject({ code: "PROPOSAL_CONFIGURATION_INVALID" });
    detail = (await service.saveMaster(AUTHOR, "procurement", detail.id, "uoms", uomId, { ...command(detail), name: "Square foot", decimalScale: 2 })).detail;
    detail = await section(service, detail, lineId, "overview", { uomId, dimensionsMandatory: true });
    expect((await savedSection(service, detail, lineId, "overview")).payload).toMatchObject({ uomId, dimensionsMandatory: true });
    await expect(service.saveMaster(AUTHOR, "procurement", detail.id, "uoms", uomId, { ...command(detail), name: "Each", decimalScale: 2 }))
      .rejects.toMatchObject({ code: "PROPOSAL_CONFIGURATION_INVALID" });
    expect((await service.masters(AUTHOR, "procurement", detail.id, "uoms", paging)).items[0]!.payload.name).toBe("Square foot");
    expect(await AiEstimatorKnowledgeUomModel.countDocuments()).toBe(0);
  });
  it("keeps both kinds private, rejects foreign readers/references and protects referenced removal", async () => {
    const { service } = fixture(); const own = await setup(service); const foreign = await setup(service, OTHER);
    expect((await service.masters(AUTHOR, "procurement", own.detail.id, "uoms", paging)).items[0]).toMatchObject({ resourceId: own.uomId, payload: { decimalScale: 2 } });
    await expect(service.masters(OTHER, "procurement", own.detail.id, "uoms", paging)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.addMaster(OTHER, "procurement", own.detail.id, "uoms", { ...command(own.detail), name: "Intruder", decimalScale: 0 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(section(service, own.detail, own.lineId, "overview", { uomId: foreign.uomId })).rejects.toMatchObject({ code: "PROPOSAL_CONFIGURATION_INVALID" });
    await expect(section(service, own.detail, own.lineId, "overview", { uomId: own.uomId, surfaceIds: [foreign.surfaceId] })).rejects.toMatchObject({ code: "PROPOSAL_CONFIGURATION_INVALID" });
    await expect(section(service, own.detail, own.lineId, "overview", { uomId: own.surfaceId })).rejects.toMatchObject({ code: "PROPOSAL_CONFIGURATION_INVALID" });
    await expect(service.removeMaster(AUTHOR, "procurement", own.detail.id, "surfaces", own.surfaceId, command(own.detail))).rejects.toMatchObject({ code: "PROPOSAL_RESOURCE_REFERENCED", fields: expect.any(Object) });
    expect((await service.references(AUTHOR, "procurement", { ...paging, kind: "uoms" })).items).toEqual([]);
    expect((await service.references(AUTHOR, "procurement", { ...paging, kind: "surfaces" })).items).toEqual([]);
    expect(await AiEstimatorKnowledgeUomModel.countDocuments()).toBe(0); expect(await AiEstimatorKnowledgeSurfaceModel.countDocuments()).toBe(0);
    expect(await VendorBasketRequestNotificationModel.countDocuments()).toBe(0);
    const renamed = await service.saveMaster(AUTHOR, "procurement", own.detail.id, "surfaces", own.surfaceId, { ...command(own.detail), name: "Renamed surface", description: "Private" });
    const detached = await section(service, renamed.detail, own.lineId, "overview", { uomId: own.uomId, surfaceIds: [] });
    expect((await service.removeMaster(AUTHOR, "procurement", own.detail.id, "surfaces", own.surfaceId, command(detached))).resource).toBeNull();
  });

  it("normalizes identities, preserves shared inactive uniqueness and permits archived names", async () => {
    const { service, audit } = fixture(); const own = await setup(service);
    await expect(service.addMaster(AUTHOR, "procurement", own.detail.id, "uoms", { ...command(own.detail), name: "  Proposed   unit  ", decimalScale: 0 })).rejects.toMatchObject({ code: "DUPLICATE_IDENTITY" });
    await AiEstimatorKnowledgeSurfaceModel.create({ _id: "inactive-surface", name: "Inactive surface", code: "INACTIVE", status: "inactive", displayOrder: 1, ...stamps });
    await expect(service.addMaster(AUTHOR, "procurement", own.detail.id, "surfaces", { ...command(own.detail), name: "INACTIVE SURFACE" })).rejects.toMatchObject({ code: "DUPLICATE_IDENTITY" });
    await AiEstimatorKnowledgeSurfaceModel.updateOne({ _id: "inactive-surface" }, { $set: { status: "archived", archivedAt: new Date(), archivedById: ADMIN.id } });
    const added = await service.addMaster(AUTHOR, "procurement", own.detail.id, "surfaces", { ...command(own.detail), name: "  Inactive   surface " });
    expect(added.resource?.payload).toMatchObject({ name: "Inactive surface", code: generatedKnowledgeMasterCode("surfaces", added.resource!.resourceId) });
    await expect(service.addMaster(AUTHOR, "procurement", own.detail.id, "uoms", { ...command(added.detail), name: "Wrong scale", decimalScale: 4 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(service.addMaster(AUTHOR, "procurement", own.detail.id, "surfaces", { ...command(added.detail), name: "Wrong field", decimalScale: 0 })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const shared = createAiEstimatorKnowledgeReferenceService({ audit });
    const uom = await shared.createMaster(ADMIN, "uoms", { name: "Shared unit", decimalScale: 3 });
    const surface = await shared.createMaster(ADMIN, "surfaces", { name: "Shared surface" });
    expect(uom.code).toBe(generatedKnowledgeMasterCode("uoms", uom.id)); expect(surface.code).toBe(generatedKnowledgeMasterCode("surfaces", surface.id));
    await expect(shared.createMaster(AUTHOR, "uoms", { name: "Unauthorized", decimalScale: 0 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("uses aggregate CAS to create at most one private value per submitted command", async () => {
    const { service } = fixture(); const own = await setup(service);
    const input = { ...command(own.detail), name: "Concurrent unit", decimalScale: 1 };
    const results = await Promise.allSettled([service.addMaster(AUTHOR, "procurement", own.detail.id, "uoms", input), service.addMaster(AUTHOR, "procurement", own.detail.id, "uoms", input)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "VERSION_CONFLICT" } });
    expect((await service.masters(AUTHOR, "procurement", own.detail.id, "uoms", paging)).items).toHaveLength(2);
  });

  it("enforces local precision in slabs and productivity and rejects incompatible master edits", async () => {
    const { service } = fixture(); let { detail, lineId, uomId } = await setup(service);
    await expect(section(service, detail, lineId, "execution", { productivity: [productivity(uomId, "1.001")] })).rejects.toMatchObject({ code: "PROPOSAL_CONFIGURATION_INVALID" });
    detail = await section(service, detail, lineId, "execution", { productivity: [productivity(uomId)] });
    detail = await section(service, detail, lineId, "pricing", { specifications: [{ id: "spec-one", name: "Specification" }] });
    await expect(section(service, detail, lineId, "quantity-margin", { slabRates: [{ id: "slab-one", specificationId: "spec-one", uomId, quantity: "1.001", unitRatePaise: 101 }] })).rejects.toMatchObject({ code: "PROPOSAL_CONFIGURATION_INVALID" });
    detail = await section(service, detail, lineId, "quantity-margin", { gapBehavior: "reject", quantitySlabs: [{ id: "quantity-one", minimumQuantity: "0", maximumQuantity: "1.25", adjustmentBps: 0 }], slabRates: [{ id: "slab-one", specificationId: "spec-one", uomId, quantity: "1.25", unitRatePaise: 101 }] });
    await expect(service.saveMaster(AUTHOR, "procurement", detail.id, "uoms", uomId, { ...command(detail), name: "Proposed unit", decimalScale: 0 })).rejects.toMatchObject({ code: "PROPOSAL_CONFIGURATION_INVALID" });
    expect((await service.masters(AUTHOR, "procurement", detail.id, "uoms", paging)).items[0]!.payload.decimalScale).toBe(2);
    expect((await service.readiness(AUTHOR, "procurement", detail.id)).ready).toBe(true);
  });

  it.each([false, true])("publishes reviewed masters atomically with basket target sub=%s and replays once", async (subTarget) => {
    const { service } = fixture(); const own = await setup(service, AUTHOR, subTarget);
    const originalUom = (await service.masters(AUTHOR, "procurement", own.detail.id, "uoms", paging)).items[0]!;
    const submitted = await service.submit(AUTHOR, own.detail.id, { ...command(own.detail), idempotencyKey: "submit-masters" });
    const review = await service.saveMaster(ADMIN, "admin", submitted.id, "uoms", own.uomId, { ...command(submitted), name: "Reviewed unit", decimalScale: 2 });
    expect((await service.masters(ADMIN, "admin", submitted.id, "uoms", { ...paging, snapshot: "submitted" })).items[0]).toEqual(expect.objectContaining({ payload: originalUom.payload, digest: originalUom.digest }));
    expect((await service.changes(ADMIN, submitted.id, paging)).items).toContainEqual(expect.objectContaining({ kind: "uom", fields: ["name"] }));
    expect(await AiEstimatorKnowledgeUomModel.countDocuments()).toBe(0);
    const input = { ...command(review.detail), expectedRequestVersion: review.detail.requestVersion!, decision: "approve" as const, idempotencyKey: "approve-masters" };
    const result = await service.decide(ADMIN, submitted.id, input);
    expect(result.published?.masters).toEqual(expect.arrayContaining([{ kind: "uoms", resourceId: own.uomId, masterId: own.uomId }, { kind: "surfaces", resourceId: own.surfaceId, masterId: own.surfaceId }]));
    expect(await service.decide(ADMIN, submitted.id, input)).toEqual(result);
    expect(await AiEstimatorKnowledgeUomModel.countDocuments()).toBe(1); expect(await AiEstimatorKnowledgeSurfaceModel.countDocuments()).toBe(1);
    expect(await AiEstimatorKnowledgeUomModel.findById(own.uomId).lean()).toMatchObject({ name: "Reviewed unit", status: "active", decimalScale: 2, ...stamps });
    const publishedLine = await AiEstimatorKnowledgeMainLineModel.findById(own.lineId).lean();
    expect(publishedLine).toMatchObject({ status: "active", activeRevisionId: result.published!.mainLines[0]!.revisionId });
    expect(await AiEstimatorKnowledgeSectionModel.findOne({ mainLineId: own.lineId, revisionId: publishedLine!.activeRevisionId, sectionKey: "overview" }).lean())
      .toMatchObject({ payload: { uomId: own.uomId, surfaceIds: [own.surfaceId] } });
    expect(await VendorBasketRequestNotificationModel.countDocuments()).toBe(1);
    expect((await service.masters(AUTHOR, "procurement", submitted.id, "uoms", { ...paging, snapshot: "approved" })).items[0]!.payload.name).toBe("Reviewed unit");
  });

  it("rolls back master, hierarchy and decision writes when activation audit fails", async () => {
    const { service, audit } = fixture(); const own = await setup(service);
    const submitted = await service.submit(AUTHOR, own.detail.id, { ...command(own.detail), idempotencyKey: "submit-rollback" });
    const broken = fixture({ appendInMongoTransaction: async (event, session) => {
      if (event.action === "ai_estimator_knowledge_revision_activated") throw new Error("master rollback fixture");
      return audit.appendInMongoTransaction(event, session);
    } }).service;
    await expect(broken.decide(ADMIN, submitted.id, { ...command(submitted), expectedRequestVersion: submitted.requestVersion!, decision: "approve", idempotencyKey: "approve-rollback" })).rejects.toThrow("master rollback fixture");
    for (const model of [AiEstimatorKnowledgeUomModel, AiEstimatorKnowledgeSurfaceModel, AiEstimatorKnowledgeBasketModel, AiEstimatorKnowledgeMainLineModel]) expect(await model.countDocuments()).toBe(0);
    expect((await service.get(ADMIN, "admin", submitted.id)).status).toBe("pending");
    expect(await AuditEventModel.countDocuments({ action: "ai_estimator_knowledge_master_created" })).toBe(0);
  });

  it("revalidates live collisions and arbitrates concurrent approvals without merging identities", async () => {
    const { service } = fixture(); const first = await setup(service); const second = await setup(service, OTHER);
    const one = await service.submit(AUTHOR, first.detail.id, { ...command(first.detail), idempotencyKey: "submit-first" });
    const two = await service.submit(OTHER, second.detail.id, { ...command(second.detail), idempotencyKey: "submit-second" });
    const results = await Promise.allSettled([one, two].map((detail) => service.decide(ADMIN, detail.id, { ...command(detail), expectedRequestVersion: detail.requestVersion!, decision: "approve", idempotencyKey: `approve-${detail.id}` })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "DUPLICATE_IDENTITY" } });
    expect(await AiEstimatorKnowledgeUomModel.countDocuments()).toBe(1); expect(await AiEstimatorKnowledgeSurfaceModel.countDocuments()).toBe(1);
    expect(await AiEstimatorKnowledgeBasketModel.countDocuments()).toBe(1);
  });

  it("remaps every local reference in revised copies, including retained inactive productivity and prices", async () => {
    const { service } = fixture(); let { detail, lineId, uomId, surfaceId } = await setup(service);
    await vendor();
    detail = await section(service, detail, lineId, "scope", { surfaceIds: [surfaceId] });
    detail = await section(service, detail, lineId, "execution", { productivity: [productivity(uomId, "1.25", false)] });
    detail = await section(service, detail, lineId, "pricing", { specifications: [{ id: "spec-one", name: "Specification" }], priceEntries: [{ operation: "set_budget", vendorId: "private-vendor", uomId, inputAmountPaise: 11800, effectiveFrom: "2026-10-12T00:00:00.000Z", effectiveTo: null }] });
    detail = await section(service, detail, lineId, "quantity-margin", { slabRates: [{ id: "slab-one", specificationId: "spec-one", uomId, quantity: "1.25", unitRatePaise: 101 }] });
    detail = await service.submit(AUTHOR, detail.id, { ...command(detail), idempotencyKey: "submit-revise" });
    await service.decide(ADMIN, detail.id, { ...command(detail), expectedRequestVersion: detail.requestVersion!, decision: "reject", reason: "Review again", idempotencyKey: "reject-revise" });
    detail = await service.get(AUTHOR, "procurement", detail.id);
    const revised = await service.revise(AUTHOR, detail.id, { ...command(detail), idempotencyKey: "revise-masters" });
    const newUnit = (await service.masters(AUTHOR, "procurement", revised.id, "uoms", paging)).items[0]!;
    const newSurface = (await service.masters(AUTHOR, "procurement", revised.id, "surfaces", paging)).items[0]!;
    expect(newUnit.resourceId).not.toBe(uomId); expect(newSurface.resourceId).not.toBe(surfaceId);
    expect(newUnit.payload.code).toBe(generatedKnowledgeMasterCode("uoms", newUnit.resourceId));
    const newLine = (await service.hierarchy(AUTHOR, "procurement", revised.id, paging)).items.find((entry) => entry.kind === "main_line")!;
    for (const key of ["overview", "scope", "execution", "pricing", "quantity-margin"] as const) {
      const payload = (await savedSection(service, revised, newLine.resourceId, key)).payload;
      expect(JSON.stringify(payload)).not.toContain(uomId); expect(JSON.stringify(payload)).not.toContain(surfaceId);
      expect(JSON.stringify(payload)).toContain(key === "scope" ? newSurface.resourceId : newUnit.resourceId);
    }
    await expect(service.removeMaster(AUTHOR, "procurement", revised.id, "uoms", newUnit.resourceId, command(revised))).rejects.toMatchObject({ code: "PROPOSAL_RESOURCE_REFERENCED" });
    expect((await service.readiness(AUTHOR, "procurement", revised.id)).ready).toBe(true);
    expect(await AiEstimatorKnowledgeUomModel.countDocuments()).toBe(0); expect(await AiEstimatorKnowledgeSurfaceModel.countDocuments()).toBe(0);
  });
});
