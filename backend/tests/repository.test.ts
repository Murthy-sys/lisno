import { describe, expect, it } from "vitest";
import { calculateTaskRisk } from "../src/domain/risk.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { RepositoryConflictError } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";

describe("memory repository", () => {
  it("returns a deterministic manager-to-designer organization tree", async () => {
    const repository = createMemoryRepository(demoSeedData);

    const tree = await repository.getOrganizationTree();

    expect(tree.map((manager) => manager.name)).toEqual(["Aarav Mehta", "Meera Iyer"]);
    expect(tree[0]?.designers.map((designer) => designer.name)).toEqual([
      "Ananya Rao",
      "Kabir Shah"
    ]);
    expect(tree[1]?.designers.map((designer) => designer.name)).toEqual([
      "Ishita Sen",
      "Vikram Nair"
    ]);
  });

  it("isolates client projects while preserving staff visibility rules", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const client = await repository.findUserByEmail("client@aurora.example");
    const designer = await repository.findUserByEmail("ananya@lisno.example");
    const manager = await repository.findUserByEmail("aarav@lisno.example");
    const head = await repository.findUserByEmail("head@lisno.example");

    expect(client).not.toBeNull();
    expect(designer).not.toBeNull();
    expect(manager).not.toBeNull();
    expect(head).not.toBeNull();

    await expect(repository.listProjectsForUser(client!)).resolves.toMatchObject([
      { id: "project-aurora-studio", clientId: "user-client-aurora" },
      { id: "project-aurora-villa", clientId: "user-client-aurora" }
    ]);
    await expect(repository.listProjectsForUser(designer!)).resolves.toMatchObject([
      { id: "project-aurora-villa" },
      { id: "project-celeste-office" }
    ]);
    await expect(repository.listProjectsForUser(manager!)).resolves.toMatchObject([
      { id: "project-aurora-studio" },
      { id: "project-aurora-villa" },
      { id: "project-celeste-office" }
    ]);
    await expect(repository.listProjectsForUser(head!)).resolves.toHaveLength(3);
  });

  it("returns floors, stages, and tasks in explicit order", async () => {
    const repository = createMemoryRepository(demoSeedData);

    const hierarchy = await repository.getProjectHierarchy("project-aurora-villa");

    expect(hierarchy?.floors.map((floor) => floor.name)).toEqual([
      "Ground Floor",
      "First Floor"
    ]);
    expect(hierarchy?.floors[0]?.stages.map((stage) => stage.type)).toEqual([
      "internal_kickoff",
      "client_kickoff",
      "key_collection",
      "site_measurement",
      "concept_mood_board",
      "floor_plan",
      "client_revisions",
      "final_approval",
      "design_handoff"
    ]);
    expect(hierarchy?.floors[0]?.stages[5]?.tasks.map((task) => task.title)).toEqual([
      "Draft furniture layout",
      "Validate circulation clearances"
    ]);
  });

  it("clones seed input and returns safe copies from reads", async () => {
    const mutableSeed = structuredClone(demoSeedData);
    const repository = createMemoryRepository(mutableSeed);
    mutableSeed.users[0]!.name = "Mutated outside";

    const firstRead = await repository.findUserById("user-head");
    expect(firstRead?.name).toBe("Devika Menon");

    firstRead!.name = "Mutated read";
    const hierarchy = await repository.getProjectHierarchy("project-aurora-villa");
    hierarchy!.floors[0]!.stages[5]!.tasks.splice(0);

    await expect(repository.findUserById("user-head")).resolves.toMatchObject({
      name: "Devika Menon"
    });
    const reread = await repository.getProjectHierarchy("project-aurora-villa");
    expect(reread?.floors[0]?.stages[5]?.tasks.map((item) => item.title)).toEqual([
      "Draft furniture layout",
      "Validate circulation clearances"
    ]);
  });

  it("updates tasks only at the expected version", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const original = await repository.findTaskById("task-circulation");

    const updated = await repository.updateTask("task-circulation", original!.version, {
      status: "in_progress",
      progress: 35,
      latestUpdateAt: "2026-07-15T09:30:00.000Z"
    });

    expect(updated).toMatchObject({ status: "in_progress", progress: 35, version: 2 });
    await expect(
      repository.updateTask("task-circulation", original!.version, { progress: 40 })
    ).rejects.toBeInstanceOf(RepositoryConflictError);
  });

  it("appends task events without exposing mutable history", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const before = await repository.listTaskEvents("task-circulation");

    const appended = await repository.appendTaskEvent({
      id: "event-circulation-progress",
      taskId: "task-circulation",
      actorId: "user-designer-kabir",
      type: "progress_changed",
      occurredAt: "2026-07-15T09:30:00.000Z",
      from: { progress: 20 },
      to: { progress: 35 },
      note: "Clearance review underway"
    });

    expect(await repository.listTaskEvents("task-circulation")).toHaveLength(before.length + 1);
    appended.to.progress = 99;
    const reread = await repository.listTaskEvents("task-circulation");
    expect(reread.at(-1)?.to).toEqual({ progress: 35 });
  });

  it("retains evaluation corrections as chronological revisions", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const first = await repository.createEvaluation({
      id: "evaluation-ananya-july-1",
      subjectUserId: "user-designer-ananya",
      evaluatorUserId: "user-manager-aarav",
      evaluatorRole: "design_manager",
      periodStartAt: "2026-07-01T00:00:00.000Z",
      periodEndAt: "2026-07-31T23:59:59.999Z",
      score: 82,
      comments: "Strong delivery discipline",
      createdAt: "2026-08-01T09:00:00.000Z"
    });
    const correction = await repository.createEvaluation({
      id: "evaluation-ananya-july-2",
      subjectUserId: "user-designer-ananya",
      evaluatorUserId: "user-manager-aarav",
      evaluatorRole: "design_manager",
      periodStartAt: "2026-07-01T00:00:00.000Z",
      periodEndAt: "2026-07-31T23:59:59.999Z",
      score: 86,
      comments: "Corrected after final review",
      revisionOf: first.id,
      createdAt: "2026-08-02T09:00:00.000Z"
    });

    expect(await repository.listEvaluationsForSubject("user-designer-ananya")).toMatchObject([
      { id: first.id, revisionOf: null },
      { id: correction.id, revisionOf: first.id }
    ]);
  });

  it("creates append-only audit events in chronological order", async () => {
    const repository = createMemoryRepository(demoSeedData);

    const appended = await repository.appendAuditEvent({
      id: "audit-circulation-deadline",
      actorId: "user-manager-aarav",
      action: "task_deadline_revised",
      entityType: "task",
      entityId: "task-circulation",
      occurredAt: "2026-07-16T10:00:00.000Z",
      oldValues: { currentDeadlineAt: "2026-07-20T17:00:00.000Z" },
      newValues: { currentDeadlineAt: "2026-07-22T17:00:00.000Z" },
      reason: "Client requested a revised layout"
    });

    expect(appended.id).toBe("audit-circulation-deadline");
    const audit = await repository.listAuditEvents({ entityId: "task-circulation" });
    expect(audit.at(-1)).toMatchObject({
      action: "task_deadline_revised",
      reason: "Client requested a revised layout"
    });
  });

  it("seeds representative gray, green, yellow, and red task risks", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const tasks = await repository.listTasks({});
    const levels = tasks.map((task) =>
      calculateTaskRisk(task, new Date("2026-07-15T12:00:00.000Z")).level
    );

    expect(new Set(levels)).toEqual(new Set(["gray", "green", "yellow", "red"]));
  });
});
