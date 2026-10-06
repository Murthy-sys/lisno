import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { confirmedCity } from "../src/domain/procurement-city.js";
import { legacyRelationshipAllows } from "../src/domain/project-access.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../src/models/AuthorizationCoordination.js";
import { ProcurementVendorCityModel } from "../src/models/ProcurementVendorCity.js";
import { ProjectAccessGrantModel } from "../src/models/ProjectAccessGrant.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { VendorKpiAssessmentModel } from "../src/models/VendorKpiAssessment.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { assertBasketVendorEligible, readBasketVendorCandidates } from "../src/services/procurement-basket-vendor-eligibility.service.js";
import { createProcurementProjectIdentityService } from "../src/services/procurement-project-identity.service.js";
import { resolveApprovalProject } from "../src/services/estimate-project-handoff.js";
import { vendorProfileFixture } from "./procurement-vendor-profile.fixture.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";
import mongoose from "mongoose";

const time = new Date("2026-10-05T10:00:00.000Z");
const admin: PublicUser = { id: "admin-a", name: "Admin", email: "admin-a@example.test", role: "admin" };
const otherAdmin: PublicUser = { id: "admin-b", name: "Other", email: "admin-b@example.test", role: "admin" };
const buyer: PublicUser = { id: "buyer", name: "Buyer", email: "buyer@example.test", role: "procurement" };
const manager: PublicUser = { id: "pm-a", name: "Program Manager", email: "pm-a@example.test", role: "program_manager" };
const other: PublicUser = { id: "designer", name: "Designer", email: "designer@example.test", role: "designer" };
const service = createProcurementProjectIdentityService({ audit: createAuditService(createMemoryRepository()), now: () => time });
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;

beforeAll(async () => {
  replica = await startMongoReplicaSet("procurement-city-identity");
  await Promise.all([UserModel, ProjectModel, ProjectAccessGrantModel, AiEstimatorKnowledgeVendorModel,
    ProcurementVendorCityModel, VendorKpiAssessmentModel, AuditEventModel].map((model) => model.syncIndexes()));
}, 120_000);
beforeEach(async () => {
  await replica.clear();
  await UserModel.create([admin, otherAdmin, buyer, manager, other].map((person) => ({ _id: person.id,
    name: person.name, email: person.email, emailNormalized: person.email, passwordHash: "fixture-only", role: person.role, active: true })));
  await ProjectModel.create({ _id: "project-a", name: "A", clientName: "Client", clientEmail: "client@example.test",
    clientEmailNormalized: "client@example.test", clientMobile: "123", clientAddress: "Address", status: "active",
    location: "An address with no reliable city", plannedStartAt: time, plannedEndAt: new Date("2027-01-01T00:00:00.000Z") });
  await ProjectModel.create({ _id: "project-b", name: "B", clientName: "Client", clientEmail: "client-b@example.test",
    clientEmailNormalized: "client-b@example.test", clientMobile: "456", clientAddress: "Address", status: "active",
    location: "Another address", plannedStartAt: time, plannedEndAt: new Date("2027-01-01T00:00:00.000Z") });
  await ProjectAccessGrantModel.create({ _id: "grant-a", projectId: "project-a", userId: admin.id, module: "projects",
    source: "admin_initiator", grantedById: admin.id, active: true, grantedAt: time });
});
afterAll(async () => { await replica?.stop(); });

async function vendor(id: string, name: string, basketId = "basket-a", email = `${id}@example.test`, rated = true) {
  await AiEstimatorKnowledgeVendorModel.create({ _id: id, code: id, codeNormalized: id, name, nameNormalized: name.toLowerCase(),
    displayOrder: 1, status: "active", version: 1, createdById: buyer.id, updatedById: buyer.id,
    procurementProfile: { ...vendorProfileFixture(), email, mainBasketId: basketId, subBasketId: "sub-a" } });
  if (rated) await VendorKpiAssessmentModel.create(["vendor_self", "procurement"].map((source) => ({
    _id: `${id}-${source}`, vendorId: id, source, vendorType: "execution", rubricVersion: 1, rubricGeneration: 0,
    scores: [{ key: "fixture", score: 88 }], averageScoreBps: source === "procurement" ? 8_600 : 8_800,
    revision: 1, submittedAt: time, idempotencyKey: `${id}-${source}`, payloadHash: "fixture"
  })));
}

describe("Procurement city and Program Manager authority", () => {
  it("reads project identity with the PATCH scope rules and leaves project and audit state unchanged", async () => {
    expect(await service.readProject(admin, "project-a")).toEqual({
      projectId: "project-a", city: null, programManagerId: null, version: 1
    });
    await expect(service.readProject(otherAdmin, "project-a")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await expect(service.readProject(admin, "project-b")).rejects.toMatchObject({ status: 404, code: "NOT_FOUND" });
    await expect(service.readProject(buyer, "project-a")).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
    expect(await AuditEventModel.countDocuments({})).toBe(0);
    expect(await AuthorizationCoordinationModel.countDocuments({})).toBe(0);
    expect(await ProjectModel.findById("project-a").lean()).toMatchObject({
      cityName: null, programManagerId: null, procurementIdentityVersion: 1
    });

    await service.updateProject(admin, "project-a", { expectedVersion: 1, cityName: "Pune", programManagerId: manager.id });
    const auditCount = await AuditEventModel.countDocuments({});
    expect(await service.readProject(admin, "project-a")).toEqual({
      projectId: "project-a", city: { name: "Pune", key: "pune" }, programManagerId: manager.id, version: 2
    });
    expect(await AuditEventModel.countDocuments({})).toBe(auditCount);
  });

  it("carries an Estimator-confirmed Lead city into an estimate-created project without reading its address", async () => {
    const projectId = await mongoose.connection.transaction((session) => resolveApprovalProject({
      estimate: { projectId: null, ownerId: buyer.id },
      lead: { projectId: null, ownerId: buyer.id, projectName: "Estimator house", clientName: "Client",
        clientEmail: "new-client@example.test", clientMobile: "9000000000", location: "Long address without a city key",
        cityName: "Pune", cityKey: "pune" },
      clientId: null, occurredAt: time, session
    }));
    expect(await ProjectModel.findById(projectId).lean()).toMatchObject({
      location: "Long address without a city key", cityName: "Pune", cityKey: "pune", programManagerId: null
    });
  });

  it("keeps address text unknown until an in-scope Admin confirms project city and an active Program Manager", async () => {
    expect(confirmedCity("  PuNe   ")).toEqual({ name: "PuNe", key: "pune" });
    expect(await ProjectModel.findById("project-a").lean()).toMatchObject({ cityName: null, programManagerId: null });
    await expect(service.updateProject(otherAdmin, "project-a", { expectedVersion: 1, cityName: "Pune" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.updateProject(admin, "project-a", { expectedVersion: 1, programManagerId: other.id })).rejects.toMatchObject({ code: "INVALID_PROGRAM_MANAGER" });
    const saved = await service.updateProject(admin, "project-a", { expectedVersion: 1, cityName: "  Pune  ", programManagerId: manager.id });
    expect(saved).toEqual({ projectId: "project-a", city: { name: "Pune", key: "pune" }, programManagerId: manager.id, version: 2 });
    await expect(service.updateProject(admin, "project-a", { expectedVersion: 1, cityName: "Mumbai" })).rejects.toMatchObject({ code: "PROCUREMENT_IDENTITY_VERSION_CONFLICT" });
    expect(await AuditEventModel.countDocuments({ entityId: "project-a", action: "project_program_manager_assigned" })).toBe(1);
    expect(await AuditEventModel.countDocuments({ entityId: "project-a", action: "project_city_confirmed" })).toBe(1);
    const accessRecord = { clientId: null, initiatingDesignerId: null, assignedDesignerIds: [], managerId: null, programManagerId: manager.id };
    expect(legacyRelationshipAllows(manager, accessRecord, "projects")).toBe(true);
    expect(legacyRelationshipAllows(manager, accessRecord, "procurement")).toBe(false);
    expect(legacyRelationshipAllows({ ...manager, id: "pm-other" }, accessRecord, "projects")).toBe(false);
  });

  it("filters confirmed city without changing vendor Configuration, while unknown city remains eligible", async () => {
    await service.updateProject(admin, "project-a", { expectedVersion: 1, cityName: "Pune" });
    await vendor("vendor-local", "Local Vendor");
    await vendor("vendor-outside", "Outside Vendor");
    await vendor("vendor-unknown", "Unknown Vendor");
    await vendor("vendor-unrated", "Unrated Vendor", "basket-a", "unrated@example.test", false);
    await vendor("vendor-other-basket", "Other Basket", "basket-b");
    const before = await AiEstimatorKnowledgeVendorModel.findById("vendor-local").lean();
    await service.updateVendorCity(buyer, "vendor-local", { expectedVersion: 0, cityName: "pune" });
    await service.updateVendorCity(buyer, "vendor-outside", { expectedVersion: 0, cityName: "Mumbai" });
    await expect(service.updateVendorCity(buyer, "vendor-local", { expectedVersion: 0, cityName: "Delhi" })).rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_CITY_VERSION_CONFLICT" });
    const after = await AiEstimatorKnowledgeVendorModel.findById("vendor-local").lean();
    expect(after?.procurementProfile).toEqual(before?.procurementProfile);
    const same = await readBasketVendorCandidates("project-a", "basket-a", undefined, { city: "same_city" });
    expect(same.items.map((item) => item.vendorId)).toEqual(["vendor-local"]);
    expect(same.items[0]).toMatchObject({ cityMatch: "same_city", eligible: true, kpiScoreBps: 8_600 });
    const outside = await readBasketVendorCandidates("project-a", "basket-a", undefined, { city: "outside_city" });
    expect(outside.items.map((item) => item.vendorId)).toEqual(["vendor-outside"]);
    const unknown = await readBasketVendorCandidates("project-a", "basket-a", undefined, { city: "unknown" });
    expect(unknown.items.map((item) => item.vendorId)).toEqual(["vendor-unknown"]);
    expect(unknown).toMatchObject({ total: 1, matchingVendorCount: 2,
      blockedReasonCounts: { vendor_under_review: 1, kpi_unrated: 1 } });
    expect(unknown.items.find((item) => item.vendorId === "vendor-unknown")).toMatchObject({ cityMatch: "unknown", eligible: true });
    await mongoose.connection.transaction(async (session) => {
      expect((await assertBasketVendorEligible("vendor-unknown", "project-a", "basket-a", session)).eligible).toBe(true);
      await expect(assertBasketVendorEligible("vendor-other-basket", "project-a", "basket-a", session)).rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_BASKET_MISMATCH" });
      await expect(assertBasketVendorEligible("vendor-unrated", "project-a", "basket-a", session)).rejects.toMatchObject({ code: "PROCUREMENT_VENDOR_NOT_ELIGIBLE" });
    });
  });
});
