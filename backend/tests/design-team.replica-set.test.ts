import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { newQuotationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { ProjectModel } from "../src/models/Project.js";
import { EstimateModel } from "../src/models/Estimate.js";
import { UserModel } from "../src/models/User.js";
import { AuditEventModel } from "../src/models/AuditEvent.js";
import { createDesignTeamService } from "../src/services/design-team.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const at = new Date("2026-10-30T10:00:00Z");
const actor = (id: string, role: "designer" | "super_admin" | "client" = "designer") => ({ id, name: `Synthetic ${id}`, email: `${id}@example.test`, role });
const primary = actor("primary");
const service = createDesignTeamService(createAuditService(createMongoRepository()));
let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
beforeAll(async () => { replica = await startMongoReplicaSet("design-team"); await UserModel.init(); }, 120_000);
afterAll(async () => { await replica?.stop(); });
beforeEach(async () => {
  await replica.clear();
  await UserModel.create([primary, actor("one"), actor("two"), actor("three"), actor("four"), actor("unrelated"), actor("super", "super_admin"), actor("client", "client")]
    .map(user => ({ _id: user.id, ...user, emailNormalized: user.email, active: true, passwordHash: "synthetic-unused", accountKind: "standard" })));
  await ProjectModel.create({ _id: "team-project", name: "Synthetic team", clientName: "Synthetic Client", clientEmail: "client@example.test",
    clientEmailNormalized: "client@example.test", clientMobile: "0000000000", status: "planning", plannedStartAt: at, plannedEndAt: at,
    estimationWorkflowVersion: 3, primaryDesignerId: primary.id, secondaryDesignerIds: [], assignedDesignerIds: [primary.id], designTeamVersion: 0 });
  await EstimateModel.create({ _id: "team-estimate", leadId: "team-lead", projectId: "team-project", ownerId: "sales", propertyType: "2BHK",
    rooms: [], scopes: [], lineItems: [], subtotal: 0, gst: 0, total: 0, status: "client_approved", version: 2,
    designPlanDesignerId: primary.id, estimation: { ...newQuotationLifecycle(), phase: "post", preApproval: {
      reviewRoundId: "approved-pre", estimateVersion: 1, approvedAt: at.toISOString() } } });
});

describe("current primary and secondary Designers", () => {
  it("keeps three distinct assistants and the compatibility membership in one versioned write", async () => {
    const result = await service.update(primary, "team-project", { expectedVersion: 0, designerIds: ["three", "one", "two"] });
    expect(result).toMatchObject({ version: 1, primary: { id: "primary" }, canManage: true, requiresReason: false });
    expect(result.secondaries.map((user: { id: string }) => user.id)).toEqual(["one", "three", "two"]);
    expect(await ProjectModel.findById("team-project").lean()).toMatchObject({ assignedDesignerIds: ["primary", "one", "three", "two"], designTeamVersion: 1 });
    expect(await AuditEventModel.countDocuments({ action: "design_team_updated" })).toBe(1);
  });
  it("rejects a fourth, duplicate, primary, inactive or deleted assistant without changing membership", async () => {
    for (const ids of [["one", "two", "three", "four"], ["one", "one"], ["primary"]])
      await expect(service.update(primary, "team-project", { expectedVersion: 0, designerIds: ids })).rejects.toThrow();
    await UserModel.updateOne({ _id: "one" }, { $set: { active: false } });
    await UserModel.updateOne({ _id: "two" }, { $set: { deletedAt: at } });
    for (const id of ["one", "two"]) await expect(service.update(primary, "team-project", { expectedVersion: 0, designerIds: [id] })).rejects.toMatchObject({ code: "DESIGNER_NOT_ASSIGNABLE" });
    expect((await service.detail(primary, "team-project")).candidates.map(user => user.id)).not.toEqual(expect.arrayContaining(["one", "two"]));
    expect(await ProjectModel.findById("team-project").lean()).toMatchObject({ secondaryDesignerIds: [], designTeamVersion: 0 });
  });
  it("allows secondary reads, denies management, and removes access immediately", async () => {
    await service.update(primary, "team-project", { expectedVersion: 0, designerIds: ["one"] });
    expect(await service.detail(actor("one"), "team-project")).toMatchObject({ canManage: false, candidates: [] });
    await expect(service.update(actor("one"), "team-project", { expectedVersion: 1, designerIds: ["two"] })).rejects.toMatchObject({ status: 404 });
    await service.update(primary, "team-project", { expectedVersion: 1, designerIds: [] });
    await expect(service.detail(actor("one"), "team-project")).rejects.toMatchObject({ status: 404 });
    for (const user of [actor("unrelated"), actor("client", "client")])
      await expect(service.detail(user, "team-project")).rejects.toMatchObject({ status: 404 });
  });
  it("serializes concurrent selection and requires an administrative override reason", async () => {
    await expect(service.update(actor("super", "super_admin"), "team-project", { expectedVersion: 0, designerIds: ["one"] }))
      .rejects.toMatchObject({ code: "DESIGN_TEAM_REASON_REQUIRED" });
    const results = await Promise.allSettled([["one"], ["two"]].map(designerIds => service.update(primary, "team-project", { expectedVersion: 0, designerIds })));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect(await AuditEventModel.countDocuments({ action: "design_team_updated" })).toBe(1);
  });
});
