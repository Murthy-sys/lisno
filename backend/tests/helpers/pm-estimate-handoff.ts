import { UserModel } from "../../src/models/User.js";
import { ProjectModel } from "../../src/models/Project.js";
import { EstimateModel } from "../../src/models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../../src/models/EstimateClientReviewRound.js";
import { ProjectWorkflowTaskModel } from "../../src/models/ProjectWorkflowTask.js";
import { AiEstimatorKnowledgeBasketModel } from "../../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../../src/models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeUomModel } from "../../src/models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeVendorModel } from "../../src/models/AiEstimatorKnowledgeVendor.js";
import { AiEstimatorKnowledgePriceVersionModel } from "../../src/models/AiEstimatorKnowledgePriceVersion.js";
import { VendorKpiAssessmentModel } from "../../src/models/VendorKpiAssessment.js";
import type { PublicUser } from "../../src/services/auth.service.js";
import { vendorProfileFixture } from "../procurement-vendor-profile.fixture.js";
import { AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS, createKnowledgePriceScopeKey } from "../../src/domain/ai-estimator-knowledge.js";
import { createKnowledgeRevisionDigest } from "../../src/domain/ai-estimator-knowledge-completeness.js";

export const handoffAt = new Date("2026-10-29T10:00:00.000Z");
const actor = (id: string, role: PublicUser["role"]): PublicUser => ({ id, name: id, role, email: `${id}@example.test` });
export async function seedPMEstimateHandoffFixture(options: { temporaryMainLineIds?: readonly string[] } = {}) {
  const pm = actor("pm-handoff", "site_manager"), otherPM = actor("pm-handoff-other", "site_manager");
  const buyer = actor("buyer-handoff", "procurement"), admin = actor("admin-handoff", "admin");
  await UserModel.create([pm, otherPM, buyer, admin].map(user => ({ ...user, _id: user.id,
    emailNormalized: user.email, passwordHash: "fixture-only", active: true })));
  for (const suffix of ["a", "b"]) {
    await AiEstimatorKnowledgeBasketModel.collection.insertOne({ _id: `basket-${suffix}`, name: `Basket ${suffix}`,
      nameNormalized: `basket ${suffix}`, code: `B${suffix}`, codeNormalized: `b${suffix}`, status: "active", version: 1,
      displayOrder: 1, createdById: admin.id, updatedById: admin.id, dependencyEpoch: 0 } as never);
    await AiEstimatorKnowledgeSubBasketModel.collection.insertOne({ _id: `sub-${suffix}`, basketId: `basket-${suffix}`,
      name: `Sub ${suffix}`, nameNormalized: `sub ${suffix}`, status: "active", version: 1, displayOrder: 1,
      createdById: admin.id, updatedById: admin.id, dependencyEpoch: 0 } as never);
  }
  await AiEstimatorKnowledgeUomModel.collection.insertOne({ _id: "uom-handoff", code: "nos", codeNormalized: "nos",
    name: "Number", nameNormalized: "number", decimalScale: 0, status: "active", version: 1, dependencyEpoch: 0,
    createdById: admin.id, updatedById: admin.id } as never);
  const mainLineIds = ["main-line-1", "main-line-2", "main-line-3"] as const;
  for (const [index, id] of mainLineIds.entries()) {
    const basket = index === 2 ? "b" : "a";
    await AiEstimatorKnowledgeMainLineModel.collection.insertOne({ _id: id, basketId: `basket-${basket}`,
      subBasketId: `sub-${basket}`, itemType: options.temporaryMainLineIds?.includes(id) ? "temporary" : "main_line", name: `Current Main Line ${index + 1}`,
      nameNormalized: `current main line ${index + 1}`, status: "active", version: 1, displayOrder: index,
      activeRevisionId: `config-${id}`, draftRevisionId: null, dependencyEpoch: 0,
      createdById: admin.id, updatedById: admin.id, createdAt: handoffAt, updatedAt: handoffAt } as never);
    const sections = AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.map(sectionKey => ({
      _id: `${sectionKey}-${id}`, mainLineId: id, revisionId: `config-${id}`, sectionKey,
      applicability: sectionKey === "overview" || sectionKey === "advanced" ? "configured" as const : "not_applicable" as const,
      payload: sectionKey === "overview" ? { uomId: "uom-handoff" } : sectionKey === "advanced" ? {
        modeCalculations: { sub_vendor: { baseRatePaise: 9000, lowQuantityLimit: "1", impactBps: 0,
          minimumMarkupBps: 1000, startingMarkupBps: 2000 } }, subVendorMarginBps: 1000
      } : {}, version: 1, createdById: admin.id, updatedById: admin.id, createdAt: handoffAt, updatedAt: handoffAt
    }));
    await AiEstimatorKnowledgeRevisionModel.collection.insertOne({ _id: `config-${id}`, mainLineId: id,
      status: "active", version: 1, revisionNumber: 1, contentDigest: createKnowledgeRevisionDigest({ mainLineId: id, revisionNumber: 1, sections }),
      completeness: { percentage: 100, sections: [], blockers: [], warnings: [] }, activatedAt: handoffAt,
      activatedById: admin.id, createdById: admin.id, updatedById: admin.id, createdAt: handoffAt, updatedAt: handoffAt } as never);
    await AiEstimatorKnowledgeSectionModel.collection.insertMany(sections as never[]);
  }
  const projectId = "project-handoff", otherProjectId = "project-handoff-other";
  for (const [project, owner, multiplier] of [[projectId, pm, 1], [otherProjectId, otherPM, 3]] as const) {
    const suffix = project === projectId ? "" : "-other";
    const estimateId = `estimate-handoff${suffix}`, roundId = `round-handoff${suffix}`;
    const occurrence = (id: string, lineNumber: number, quantity: number, ratePaise: number, included = true) => {
      const basket = lineNumber === 3 ? "b" : "a";
      return { id, source: "configuration", itemType: options.temporaryMainLineIds?.includes(`main-line-${lineNumber}`) ? "temporary" : "main_line", catalogueId: `main-line-${lineNumber}`,
        roomId: `room-${id}`, roomName: `Room ${id}`, specification: null, unit: "nos", quantity, included,
        ratePaise: ratePaise * multiplier, rate: ratePaise * multiplier / 100,
        amountPaise: included ? ratePaise * quantity * multiplier : 0, amount: included ? ratePaise * quantity * multiplier / 100 : 0,
        mainBasketId: `basket-${basket}`, mainBasketName: `Approved Basket ${basket}`, subBasketId: `sub-${basket}`,
        subBasketName: `Approved Sub ${basket}`, mainLineId: `main-line-${lineNumber}`,
        mainLineName: `Approved Main Line ${lineNumber}`, revisionId: `config-main-line-${lineNumber}`,
        uomId: "uom-handoff", uomCode: "nos", uomName: "Number", uomDecimalScale: 0,
        sourceItemStatus: "active", sourceRevisionStatus: "active", sourceItemVersion: 1, sourceRevisionVersion: 1,
        classification: "standard", pricingMode: "sub_vendor", rateSource: "configuration" };
    };
    const lineItems = [occurrence("scope-1", 1, 2, 10000), occurrence("scope-2", 1, 3, 10000),
      occurrence("scope-3", 2, 1, 75000), occurrence("scope-4", 3, 1, 90000), occurrence("excluded", 2, 1, 10000, false)];
    const subtotalPaise = 215000 * multiplier, gstPaise = 38700 * multiplier;
    const snapshot = { clientName: "Synthetic client", projectName: project, location: "Fixture City", propertyType: "villa",
      lineItems, subtotal: subtotalPaise / 100, gst: gstPaise / 100, total: (subtotalPaise + gstPaise) / 100,
      subtotalPaise, gstPaise, totalPaise: subtotalPaise + gstPaise,
      selectedMainBasketIds: ["basket-a", "basket-b"],
      selectedMainBasketClassifications: [{ mainBasketId: "basket-a", classification: "standard" }, { mainBasketId: "basket-b", classification: "standard" }] };
    await ProjectModel.create({ _id: project, name: project, status: "active", programManagerId: owner.id,
      clientName: "Synthetic client", clientEmail: "client@example.test", clientEmailNormalized: "client@example.test",
      clientMobile: "9000000000", plannedStartAt: handoffAt, plannedEndAt: new Date("2027-01-01T00:00:00Z") });
    await EstimateModel.collection.insertOne({ _id: estimateId, leadId: `lead-${project}`, ownerId: admin.id,
      projectId: project, version: 2, status: "client_approved", propertyType: "villa", ...snapshot,
      reviews: [{ actorId: admin.id, action: "client_approved", occurredAt: handoffAt }], clientDecisionAt: handoffAt,
      designPlanStatus: "approved", designPlanVersion: 1, designPlanApprovedAt: handoffAt,
      designPlanApprovedById: admin.id, designPlanApprovalSource: "admin_proof" } as never);
    await EstimateClientReviewRoundModel.collection.insertOne({ _id: roundId, projectId: project, estimateId,
      estimateVersion: 1, sendGeneration: 1, dedupeKey: (suffix ? "b" : "a").repeat(64),
      status: "approved", decision: "approve", decisionSource: "admin_proof",
      decidedAt: handoffAt, decidedById: admin.id, estimateSnapshot: snapshot } as never);
    await ProjectWorkflowTaskModel.create({ _id: `procurement-${project}`, dedupeKey: `procurement-${project}`, projectId: project,
      estimateId, designPlanVersion: 1, kind: "procurement", title: "Prepare procurement", assigneeRole: "procurement",
      assigneeUserId: buyer.id, status: "open", progress: 0, version: 1, openedAt: handoffAt });
  }
  const vendorIds = ["vendor-handoff-1", "vendor-handoff-2"] as const;
  for (const [index, id] of vendorIds.entries()) {
    await AiEstimatorKnowledgeVendorModel.create({ _id: id, code: `VH${index}`, name: `Vendor ${index}`,
      status: "active", version: 1, displayOrder: index, createdById: buyer.id, updatedById: buyer.id,
      procurementProfile: { ...vendorProfileFixture(), email: `${id}@example.test`, mainBasketId: "basket-a",
        mainBasketIds: ["basket-a"], subBasketIds: ["sub-a"], subBasketId: "sub-a" } });
    await VendorKpiAssessmentModel.collection.insertMany(["vendor_self", "procurement"].map(source => ({
      _id: `${id}-${source}`, vendorId: id, source, vendorType: "execution", rubricVersion: 1,
      rubricGeneration: 0, revision: 1, averageScoreBps: 8600 })) as never[]);
  }
  await setPMFixtureVendorLinks("main-line-1", vendorIds);
  await setPMFixtureVendorLinks("main-line-2", [vendorIds[0]]);
  await setPMFixtureVendorLinks("main-line-3", [vendorIds[1]]);
  return { at: handoffAt, pm, otherPM, buyer, admin, projectId, otherProjectId, estimateId: "estimate-handoff",
    roundId: "round-handoff", mainLineIds, vendorIds };
}

/** Synthetic saved budget references; no approved estimate values are changed. */
export async function setPMFixtureVendorLinks(mainLineId: string, vendorIds: readonly string[], revisionId = `config-${mainLineId}`) {
  const refs = vendorIds.map((vendorId, index) => ({ operation: "reference" as const,
    priceEntryId: `${revisionId}-entry-${index}-${vendorId}`, priceVersionId: `${revisionId}-price-${index}-${vendorId}` }));
  for (const [index, ref] of refs.entries()) {
    await AiEstimatorKnowledgePriceVersionModel.updateOne({ _id: ref.priceVersionId }, { $setOnInsert: {
      _id: ref.priceVersionId, mainLineId, revisionId, priceEntryId: ref.priceEntryId,
      scopeKey: createKnowledgePriceScopeKey({ vendorId: vendorIds[index]!, uomId: "uom-handoff", specificationId: null, modeId: null }),
      versionNumber: 1, vendorId: vendorIds[index], uomId: "uom-handoff",
      taxRuleId: "tax-handoff", taxVersionId: "tax-version-handoff", currency: "INR", treatment: "exclusive",
      inputAmountPaise: 10000, baseAmountPaise: 10000, taxAmountPaise: 1800, totalAmountPaise: 11800,
      effectiveFrom: handoffAt, effectiveTo: null, status: "active", version: 1,
      createdById: "admin-handoff", updatedById: "admin-handoff"
    } }, { upsert: true });
  }
  await AiEstimatorKnowledgeSectionModel.collection.updateOne({ mainLineId, revisionId, sectionKey: "pricing" }, {
    $set: { payload: { priceEntries: refs }, applicability: "configured" }
  });
  const revision = await AiEstimatorKnowledgeRevisionModel.findById(revisionId).lean();
  if (revision) {
    const sections = await AiEstimatorKnowledgeSectionModel.find({ revisionId }).lean();
    await AiEstimatorKnowledgeRevisionModel.collection.updateOne({ _id: revisionId }, { $set: {
      contentDigest: createKnowledgeRevisionDigest({ mainLineId, revisionNumber: Number(revision.revisionNumber), sections })
    } });
  }
  return refs;
}
