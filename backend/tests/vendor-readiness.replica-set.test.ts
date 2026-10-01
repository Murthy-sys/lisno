import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { deriveVendorActivation } from "../src/domain/vendor-readiness.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { VendorKpiAssessmentModel } from "../src/models/VendorKpiAssessment.js";
import { VendorInductionReviewModel } from "../src/models/VendorInduction.js";
import { UserModel } from "../src/models/User.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createAiEstimatorKnowledgeReferenceService } from "../src/services/ai-estimator-knowledge-reference.service.js";
import { vendorActivation, vendorActivations } from "../src/services/vendor-readiness.service.js";
import { vendorProfileFixture } from "./procurement-vendor-profile.fixture.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const buyer = { id: "buyer", name: "Buyer", email: "buyer@example.invalid", role: "procurement" as const };
const verifiedProfile = () => ({ ...vendorProfileFixture(), currentAddressVerifiedPhysically: true,
  physicalAddressVerifiedAt: "2026-09-28T08:00:00.000Z", physicalAddressVerifiedById: buyer.id });
const gates = { inductionApproved: true, vendorSelfKpiComplete: true, procurementKpiComplete: true,
  profileComplete: true, physicalAddressVerified: true };
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
const reference = createAiEstimatorKnowledgeReferenceService({ audit: createAuditService(createMemoryRepository()) });

beforeAll(async () => {
  replica = await startMongoReplicaSet("vendor-readiness-tests");
  await Promise.all([AiEstimatorKnowledgeVendorModel, VendorKpiAssessmentModel, VendorInductionReviewModel, UserModel].map(model => model.syncIndexes()));
}, 120_000);
beforeEach(async () => {
  await replica.clear();
  await UserModel.create({ _id: buyer.id, name: buyer.name, email: buyer.email, emailNormalized: buyer.email,
    passwordHash: "fixture-only", role: buyer.role, active: true });
  await AiEstimatorKnowledgeVendorModel.create(["ready", "review", "inactive", "archived"].map((id, index) => ({
    _id: id, code: `V${index}`, name: `Vendor ${id}`, displayOrder: index,
    status: id === "inactive" ? "inactive" : id === "archived" ? "archived" : "active", version: 1,
    archivedAt: id === "archived" ? new Date("2026-09-28T08:00:00.000Z") : null,
    archivedById: id === "archived" ? buyer.id : null,
    procurementProfile: verifiedProfile(), createdById: buyer.id, updatedById: buyer.id
  })));
  await VendorKpiAssessmentModel.collection.insertMany(["ready", "review", "inactive", "archived"].flatMap(vendorId =>
    (vendorId === "review" ? ["vendor_self"] : ["vendor_self", "procurement"]).map(source => ({ _id: `${vendorId}-${source}`, vendorId, source,
      vendorType: "execution", rubricVersion: 1, rubricGeneration: 0, revision: 1, averageScoreBps: 0 }))));
  await VendorInductionReviewModel.collection.insertMany(["ready", "inactive", "archived"].map(vendorId => ({
    _id: `${vendorId}-approval`, vendorId, version: 1, vendorType: "execution", decision: "approved"
  })));
});
afterAll(async () => { await replica?.stop(); });

describe("vendor activation", () => {
  it("applies lifecycle precedence and requires both KPI gates while retaining other readiness details", () => {
    expect(deriveVendorActivation("active", gates).effectiveStatus).toBe("active");
    for (const key of ["vendorSelfKpiComplete", "procurementKpiComplete"] as const) {
      expect(deriveVendorActivation("active", { ...gates, [key]: false }).effectiveStatus).toBe("under_review");
    }
    for (const key of ["inductionApproved", "profileComplete", "physicalAddressVerified"] as const) {
      const activation = deriveVendorActivation("active", { ...gates, [key]: false });
      expect(activation.effectiveStatus).toBe("active");
      expect(activation.gates[key]).toBe(false);
    }
    expect(deriveVendorActivation("inactive", gates).effectiveStatus).toBe("inactive");
    expect(deriveVendorActivation("archived", { ...gates, profileComplete: false }).effectiveStatus).toBe("archived");
  });

  it("treats zero-score current KPI assessments as complete, invalidates stale generations, and keeps missing induction and profile details visible", async () => {
    const ready = (await AiEstimatorKnowledgeVendorModel.findById("ready").lean())!;
    expect(await vendorActivation(ready)).toMatchObject({ effectiveStatus: "active", gates: { inductionApproved: true,
      vendorSelfKpiComplete: true, procurementKpiComplete: true, profileComplete: true, physicalAddressVerified: true } });
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: "ready" }, { $set: { kpiRubricGeneration: 1 } });
    expect(await vendorActivation((await AiEstimatorKnowledgeVendorModel.findById("ready").lean())!))
      .toMatchObject({ effectiveStatus: "under_review", gates: { vendorSelfKpiComplete: false, procurementKpiComplete: false } });
    await AiEstimatorKnowledgeVendorModel.collection.updateOne({ _id: "ready" }, { $set: { kpiRubricGeneration: 0 },
      $unset: { "procurementProfile.physicalAddressVerifiedById": "", "procurementProfile.nameOfRepresentative": "" } });
    await VendorInductionReviewModel.deleteMany({ vendorId: "ready" });
    expect(await vendorActivation((await AiEstimatorKnowledgeVendorModel.findById("ready").lean())!))
      .toMatchObject({ effectiveStatus: "active", gates: { inductionApproved: false, vendorSelfKpiComplete: true,
        procurementKpiComplete: true, profileComplete: false, physicalAddressVerified: false } });
  });

  it("returns exclusive statuses and paginates after the effective filter", async () => {
    const rows = await AiEstimatorKnowledgeVendorModel.find().lean();
    const states = await vendorActivations(rows);
    expect(Object.fromEntries([...states].map(([id, value]) => [id, value.effectiveStatus]))).toEqual({
      ready: "active", review: "under_review", inactive: "inactive", archived: "archived"
    });
    const active = await reference.listMasters(buyer, "vendors", { effectiveStatus: "active", includeDirectoryOverview: true }, { limit: 1, offset: 0 });
    expect(active.items.map(item => item.id)).toEqual(["ready"]);
    expect(active.items[0]?.vendorActivation?.effectiveStatus).toBe("active");
    expect(active.total).toBe(1);
    expect(active.directoryOverview).toMatchObject({ totalVendors: 3, activeVendors: 1, underReviewVendors: 1,
      ratedVendors: 2, averageKpiScoreBps: 0 });
    const review = await reference.listMasters(buyer, "vendors", { effectiveStatus: "under_review" }, { limit: 1, offset: 0 });
    expect(review.items.map(item => item.id)).toEqual(["review"]);
    const archived = await reference.listMasters(buyer, "vendors", { effectiveStatus: "archived" }, { limit: 1, offset: 0 });
    expect(archived.items.map(item => item.id)).toEqual(["archived"]);
    const lifecycle = await reference.listMasters(buyer, "vendors", { status: "active" }, { limit: 10, offset: 0 });
    expect(lifecycle.items.map(item => item.id)).toEqual(["ready", "review"]);
  });
});
