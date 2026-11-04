import { describe, expect, it, vi } from "vitest";
import { statusFixture } from "./helpers/project-status.js";
import { chatLead, chatUser, CHAT_NOW } from "./helpers/project-chat.js";
import { createProjectStatusService } from "../src/services/project-status.service.js";
import { ApiError } from "../src/middleware/errors.js";

const query = { limit: 20, offset: 0, destinationRole: "procurement" as const };

function assignedFixture(configure?: Parameters<typeof statusFixture>[0]) {
  return statusFixture((data, evidence) => {
    data.seed.projects[1]!.assignedDesignerIds = ["designer-a"];
    data.seed.leads[0] = { ...data.seed.leads[0]!, projectNumber: "Lisno000012" };
    data.seed.leads.push({ ...chatLead("lead-b", "b"), projectNumber: "Lisno000103" });
    configure?.(data, evidence);
  });
}

describe("administrative responsibility stage projection", () => {
  it("joins distinct projects by ID and uses their canonical current stages without returning private source data", async () => {
    const f = assignedFixture();
    const mutate = vi.spyOn(f.chatRepository, "mutate");
    const before = { users: await f.repository.listUsers(), leads: (await f.repository.pageAllLeads({}, { limit: 100, offset: 0 })).items };
    const result = await f.service.readUserResponsibilities(f.actor("super"), "designer-a", query);
    expect(result).toMatchObject({ user: { id: "designer-a", role: "designer", version: 1 }, destinationRole: "procurement",
      readAt: f.clock().toISOString(), blockingCount: 3, pagination: { total: 3, hasMore: false } });
    for (const id of ["a", "b"]) {
      const current = await f.service.get(f.actor("super"), id);
      const rows = result.items.filter(row => row.projectId === id);
      expect(rows.length).toBe(id === "a" ? 2 : 1);
      for (const row of rows) expect(row).toMatchObject({ contextState: "available", blocksRoleChange: true,
        project: { id, name: `Project ${id}`, projectNumber: id === "a" ? "Lisno000012" : "Lisno000103",
          currentStage: current.currentStage, stageState: "available" } });
    }
    expect(result.items.find(row => row.projectId === "a")!.project!.currentStage!.key).toBe("estimate_approval");
    expect(result.items.find(row => row.projectId === "b")!.project!.currentStage!.key).toBe("estimate_preparation");
    expect(JSON.stringify(result)).not.toMatch(/@chat|clientEmail|clientMobile|pendingActions|people|subtotal|lineItems|passwordHash|storageReference/);
    expect(mutate).not.toHaveBeenCalled();
    expect(await f.repository.listUsers()).toEqual(before.users);
    expect((await f.repository.pageAllLeads({}, { limit: 100, offset: 0 })).items).toEqual(before.leads);
    expect(await f.repository.findDesignWorkflowState("a")).toBeNull();
    expect((await f.repository.pageAuditEvents({}, { limit: 100, offset: 0 })).items).toEqual([]);
  });

  it("hydrates only the requested page and deduplicates repeated project responsibilities", async () => {
    const f = assignedFixture();
    const executionEvidence = vi.fn(async (_projectId: string) => ({ hasApprovedOrder: false, people: [], procurementOwnerIds: [], pendingVendorUserIds: [], vendorMemberIds: [] }));
    const service = createProjectStatusService({ ...f, executionEvidence });
    const first = await service.readUserResponsibilities(f.actor("super"), "designer-a", { ...query, limit: 1 });
    expect(first).toMatchObject({ blockingCount: 3, pagination: { total: 3, hasMore: true } });
    expect(executionEvidence).toHaveBeenCalledTimes(1);
    expect(executionEvidence.mock.calls[0]?.[0]).toBe(first.items[0]!.projectId);
    executionEvidence.mockClear();
    await service.readUserResponsibilities(f.actor("super"), "designer-a", query);
    expect(executionEvidence).toHaveBeenCalledTimes(2);
    expect(executionEvidence.mock.calls.map(call => call[0]).sort()).toEqual(["a", "b"]);
    executionEvidence.mockClear();
    const beyond = await service.readUserResponsibilities(f.actor("super"), "designer-a", { ...query, offset: 99 });
    expect(beyond).toMatchObject({ items: [], blockingCount: 3, pagination: { total: 3, hasMore: false } });
    expect(executionEvidence).not.toHaveBeenCalled();
  });

  it("limits administration to the current Super Admin and checks identity before target existence", async () => {
    const f = assignedFixture();
    for (const user of f.seed.users.filter(user => user.role !== "super_admin")) {
      await expect(f.service.readUserResponsibilities(f.actor(user.id), "designer-a", query)).rejects.toMatchObject({ status: 403 });
      await expect(f.service.readUserResponsibilities(f.actor(user.id), "absent", query)).rejects.toMatchObject({ status: 403 });
    }
    for (const actor of [
      { ...f.actor("super"), sessionVersion: 2 },
      { ...f.actor("super"), expiresAt: 1 },
      { ...f.actor("super"), role: "admin" as const }
    ]) await expect(f.service.readUserResponsibilities(actor, "designer-a", query)).rejects.toMatchObject({ status: 401 });
    await expect(f.service.readUserResponsibilities(f.actor("super"), "absent", query)).rejects.toMatchObject({ status: 404 });
    await f.repository.updateUser("super", 1, { active: false, updatedAt: CHAT_NOW });
    await expect(f.service.readUserResponsibilities(f.actor("super"), "designer-a", query)).rejects.toMatchObject({ status: 401 });
  });

  it("rejects deleted actors and targets even if historical records retain an active flag", async () => {
    const deletedActor = assignedFixture(data => { data.seed.users.find(user => user.id === "super")!.deletedAt = CHAT_NOW; });
    await expect(deletedActor.service.readUserResponsibilities(deletedActor.actor("super"), "designer-a", query)).rejects.toMatchObject({ status: 401 });
    const deletedTarget = assignedFixture(data => { data.seed.users.find(user => user.id === "designer-a")!.deletedAt = CHAT_NOW; });
    await expect(deletedTarget.service.readUserResponsibilities(deletedTarget.actor("super"), "designer-a", query)).rejects.toMatchObject({ status: 404 });
  });

  it("keeps missing projects, unlinked leads and direct reports visible without invented context", async () => {
    const f = assignedFixture(data => {
      data.seed.projectAccessGrants.push({ ...data.seed.projectAccessGrants[0]!, id: "orphan-grant", userId: "designer-a", projectId: "missing-project" });
      data.seed.leads.push({ ...chatLead("unlinked-lead", "unused", "designer-a"), projectId: null, stage: "contacted" });
      data.seed.users.push({ ...chatUser("report", "designer", "Direct report"), managerId: "designer-a", active: false });
    });
    const result = await f.service.readUserResponsibilities(f.actor("super"), "designer-a", query);
    expect(result.pagination.total).toBe(6);
    expect(result.items.find(row => row.sourceId === "orphan-grant")).toMatchObject({ projectId: "missing-project", project: null, contextState: "unavailable" });
    expect(result.items.find(row => row.sourceId === "unlinked-lead")).toMatchObject({ projectId: null, project: null, contextState: "unlinked", workStage: { key: "contacted" } });
    expect(result.items.find(row => row.sourceId === "report")).toMatchObject({ projectId: null, project: null, contextState: "not_applicable", relatedUser: { id: "report", name: "Direct report" } });
  });

  it("preserves a valid Project ID while inconsistent workflow evidence makes the stage unavailable", async () => {
    const f = assignedFixture((_data, evidence) => { evidence.rounds = []; });
    const result = await f.service.readUserResponsibilities(f.actor("super"), "designer-a", query);
    expect(result.items.find(row => row.projectId === "a")!.project).toMatchObject({ projectNumber: "Lisno000012", currentStage: null, stageState: "unavailable" });
    expect(result.items.find(row => row.projectId === "b")!.project!.stageState).toBe("available");
    const noNumber = statusFixture();
    const missingNumber = await noNumber.service.readUserResponsibilities(noNumber.actor("super"), "designer-a", query);
    expect(missingNumber.items[0]!.project).toMatchObject({ projectNumber: null, currentStage: { key: "estimate_approval" }, stageState: "available" });
  });

  it("retains responsibility context for invalid numbering and does not swallow authorization or storage failures", async () => {
    const invalidNumber = assignedFixture(data => { data.seed.leads[0] = { ...data.seed.leads[0]!, projectNumber: "invalid" }; });
    const result = await invalidNumber.service.readUserResponsibilities(invalidNumber.actor("super"), "designer-a", query);
    expect(result.items.find(row => row.projectId === "a")!.project).toMatchObject({ id: "a", projectNumber: null, currentStage: null, stageState: "unavailable" });
    const f = assignedFixture();
    for (const error of [new ApiError(401, "INVALID_TOKEN", "Invalid token"), new Error("Storage unavailable")]) {
      const service = createProjectStatusService({ ...f, executionEvidence: async () => { throw error; } });
      await expect(service.readUserResponsibilities(f.actor("super"), "designer-a", query)).rejects.toBe(error);
    }
  });

  it("bounds internal reads and observes fresh target assignments without mutations", async () => {
    const f = assignedFixture();
    await expect(f.service.readUserResponsibilities(f.actor("super"), "designer-a", { ...query, limit: 101 })).rejects.toMatchObject({ status: 400 });
    await expect(f.service.readUserResponsibilities(f.actor("super"), "designer-a", { ...query, offset: -1 })).rejects.toMatchObject({ status: 400 });
    const sameRole = await f.service.readUserResponsibilities(f.actor("super"), "designer-a", { ...query, destinationRole: "designer" });
    expect(sameRole.blockingCount).toBe(0);
    const otherUser = await f.service.readUserResponsibilities(f.actor("super"), "client-b", query);
    expect(otherUser.items.map(row => row.projectId)).toEqual(["b"]);
  });
});
