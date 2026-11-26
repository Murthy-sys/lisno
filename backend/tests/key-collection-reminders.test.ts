import { describe, expect, it, vi } from "vitest";
import { projectDesignerHandoff, readDesignerHandoffSource } from "../src/services/designer-handoff.service.js";
import { createKeyCollectionRemindersService } from "../src/services/key-collection-reminders.service.js";
import { COLLECTION_START, HOUR, keyCollectionReminderFixture } from "./fixtures/key-collection-reminders.js";

describe("Designer key collection reminder feed", () => {
  it("returns only the current Designer's urgent appointments and all-scope next red time", async () => {
    const f = await keyCollectionReminderFixture();
    const service = createKeyCollectionRemindersService(f.repository, () => new Date(COLLECTION_START + 37 * HOUR));
    const urgent = await service.list(f.designer, {});
    expect(urgent).toMatchObject({ serverNow: "2026-11-27T22:00:00.000Z", urgentCount: 1, nextRedAt: "2026-11-28T21:00:00.000Z",
      pagination: { limit: 20, offset: 0, total: 1, hasMore: false } });
    expect(urgent.items.map(item => item.projectId)).toEqual(["collection-first"]);
    expect(urgent.items[0]!.appointment.timing).toMatchObject({ zone: "red" });
    expect(urgent.items[0]!.blockers).toContain("Complete Internal Kick off before collecting keys.");
    expect(JSON.stringify(urgent)).not.toMatch(/email|clientMobile|assignmentRevision|estimateVersion/);
    const pending = await service.list(f.designer, { status: "pending", limit: 1, offset: 1 });
    expect(pending.items.map(item => item.projectId)).toEqual(["collection-second"]);
    expect(pending.pagination).toMatchObject({ total: 2, hasMore: false });
    expect(pending.urgentCount).toBe(1);
    const other = await service.list(f.secondDesigner, {});
    expect(other.items.map(item => item.projectId)).toEqual(["collection-other"]);
  });

  it("updates urgency exactly at the red boundary without changing saved deadline", async () => {
    const f = await keyCollectionReminderFixture([{ id: "boundary" }]);
    let now = COLLECTION_START + 36 * HOUR - 1;
    const service = createKeyCollectionRemindersService(f.repository, () => new Date(now));
    expect(await service.list(f.designer, {})).toMatchObject({ urgentCount: 0, nextRedAt: new Date(now + 1).toISOString(), items: [] });
    now++;
    const page = await service.list(f.designer, {});
    expect(page).toMatchObject({ urgentCount: 1, nextRedAt: null });
    expect(page.items[0]!.appointment).toMatchObject({ deadlineAt: new Date(COLLECTION_START + 48 * HOUR).toISOString(),
      timing: { zone: "red" }, remainingMs: 12 * HOUR });
    now += 13 * HOUR;
    expect((await service.list(f.designer, {})).items[0]!.appointment).toMatchObject({ overdue: true, remainingMs: 0, timing: { zone: "red" } });
  });

  it("filters invalid sources and ended collections before pagination and counts", async () => {
    const ids = ["closed", "received", "completed", "unscheduled", "history", "approval", "timing", "unassigned", "valid"];
    const f = await keyCollectionReminderFixture(ids.map(id => ({ id })), seed => {
      const state = (id: string) => seed.designWorkflowStates!.find(item => item.projectId === id)!;
      seed.projects.find(item => item.id === "closed")!.status = "completed";
      state("received").stages.key_collection!.receivedAt = new Date(COLLECTION_START + HOUR).toISOString();
      state("completed").stages.key_collection!.completedAt = new Date(COLLECTION_START + HOUR).toISOString();
      delete state("unscheduled").stages.key_collection!.appointment;
      state("history").history[0]!.data!.designerId = "forged-designer";
      seed.projectStatusEstimateEvidence!.find(item => item.projectId === "approval")!.rounds[0]!.decidedById = "foreign-client";
      state("timing").stages.key_collection!.appointment!.confirmedAt = "invalid";
      seed.projects.find(item => item.id === "unassigned")!.primaryDesignerId = null;
      seed.projects.find(item => item.id === "unassigned")!.assignedDesignerIds = [];
    });
    const page = await createKeyCollectionRemindersService(f.repository, () => new Date(COLLECTION_START + 37 * HOUR)).list(f.designer, { limit: 1 });
    expect(page.items.map(item => item.projectId)).toEqual(["valid"]);
    expect(page).toMatchObject({ urgentCount: 1, pagination: { total: 1, hasMore: false } });
    const endedState = (await f.repository.findDesignWorkflowState("received"))!;
    const endedProject = (await f.repository.findProjectById("received"))!;
    const endedView = projectDesignerHandoff(await readDesignerHandoffSource(f.repository, endedProject), endedProject, endedState, f.designer,
      new Date(COLLECTION_START + 37 * HOUR));
    expect(endedView.appointment?.timing).toBeNull();
  });

  it("moves the reminder to a valid replacement Designer without rewriting original appointment lineage", async () => {
    let originalRevision = "";
    const f = await keyCollectionReminderFixture([{ id: "reassigned" }], seed => {
      originalRevision = seed.designWorkflowStates![0]!.stages.key_collection!.appointment!.assignmentRevision;
      const replacement = seed.users.find(user => user.id === "second-collection-designer")!;
      Object.assign(seed.projects[0]!, { primaryDesignerId: replacement.id, assignedDesignerIds: [replacement.id], designTeamVersion: 2 });
      seed.designerAssignmentEvidence![0]!.acceptedRequest = { id: "replacement-request", designerId: replacement.id,
        acceptedAt: new Date(COLLECTION_START + HOUR).toISOString() };
    });
    const service = createKeyCollectionRemindersService(f.repository, () => new Date(COLLECTION_START + 37 * HOUR));
    expect(await service.list(f.designer, {})).toMatchObject({ urgentCount: 0, items: [] });
    expect((await service.list(f.secondDesigner, {})).items).toHaveLength(1);
    expect((await f.repository.findDesignWorkflowState("reassigned"))!.stages.key_collection!.appointment).toMatchObject({
      assignmentRevision: originalRevision, designerId: f.designer.id, deadlineAt: new Date(COLLECTION_START + 48 * HOUR).toISOString() });
  });

  it("uses every bounded candidate page before computing personal totals", async () => {
    const f = await keyCollectionReminderFixture(Array.from({ length: 103 }, (_, i) => ({ id: `project-${String(i).padStart(3, "0")}` })));
    const original = f.repository.runInTransaction.bind(f.repository);
    const pages: number[] = [];
    vi.spyOn(f.repository, "runInTransaction").mockImplementation(operation => original(tx => {
      const page = tx.pageProjectsForUserRead.bind(tx);
      vi.spyOn(tx, "pageProjectsForUserRead").mockImplementation((actor, pagination) => { pages.push(pagination.offset); return page(actor, pagination); });
      return operation(tx);
    }));
    const response = await createKeyCollectionRemindersService(f.repository, () => new Date(COLLECTION_START + 37 * HOUR))
      .list(f.designer, { limit: 2, offset: 101 });
    expect(pages).toEqual([0, 100]);
    expect(response).toMatchObject({ urgentCount: 103, pagination: { total: 103, offset: 101, limit: 2, hasMore: false } });
    expect(response.items.map(item => item.projectId)).toEqual(["project-101", "project-102"]);
  });

  it("rejects non-Designers, invalid identity, disabled/deleted accounts and forged filters", async () => {
    const f = await keyCollectionReminderFixture();
    const service = createKeyCollectionRemindersService(f.repository);
    for (const actor of [f.admin, f.client]) await expect(service.list(actor, {})).rejects.toMatchObject({ status: 403 });
    await expect(service.list({ ...f.designer, id: "unknown" }, {})).rejects.toMatchObject({ status: 401 });
    await expect(service.list(f.designer, { designerId: f.secondDesigner.id })).rejects.toMatchObject({ status: 400 });
    await expect(service.list(f.designer, { limit: 101 })).rejects.toMatchObject({ status: 400 });
    for (const deleted of [false, true]) {
      const invalid = await keyCollectionReminderFixture([], seed => {
        const user = seed.users.find(item => item.id === f.designer.id)!;
        if (deleted) user.deletedAt = new Date(COLLECTION_START).toISOString(); else user.active = false;
      });
      await expect(createKeyCollectionRemindersService(invalid.repository).list(invalid.designer, {})).rejects.toMatchObject({ status: 401 });
    }
  });
});
