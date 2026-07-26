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

  it("does not treat a manager-linked non-designer as a direct report", async () => {
    const seed = structuredClone(demoSeedData);
    const client = seed.users.find((user) => user.id === "user-client-celeste")!;
    client.managerId = "user-manager-aarav";
    seed.projects.push({
      ...structuredClone(seed.projects[0]!),
      id: "project-non-designer-assignment",
      name: "Non-designer assignment",
      managerId: "user-manager-meera",
      assignedDesignerIds: [client.id]
    });
    const repository = createMemoryRepository(seed);
    const manager = await repository.findUserById("user-manager-aarav");

    const visibleProjectIds = (await repository.listProjectsForUser(manager!)).map(
      (project) => project.id
    );

    expect(visibleProjectIds).not.toContain("project-non-designer-assignment");
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

  it("rolls back every in-memory write when a transaction operation fails", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const original = await repository.findTaskById("task-circulation");

    await expect(
      repository.runInTransaction(async (transaction) => {
        await transaction.updateTask("task-circulation", original!.version, {
          progress: 45
        });
        await transaction.appendTaskEvent({
          taskId: "task-circulation",
          actorId: "user-designer-kabir",
          type: "progress_changed",
          occurredAt: "2026-07-16T09:30:00.000Z",
          from: { progress: 20 },
          to: { progress: 45 },
          note: null
        });
        throw new Error("simulated audit failure");
      })
    ).rejects.toThrow("simulated audit failure");

    await expect(repository.findTaskById("task-circulation")).resolves.toEqual(
      original
    );
    await expect(repository.listTaskEvents("task-circulation")).resolves.toEqual(
      []
    );
  });

  it("serializes overlapping memory transactions so rollback cannot erase another commit", async () => {
    const repository = createMemoryRepository(demoSeedData);
    let releaseFailure!: () => void;
    let failureStarted!: () => void;
    const failureGate = new Promise<void>((resolve) => {
      releaseFailure = resolve;
    });
    const started = new Promise<void>((resolve) => {
      failureStarted = resolve;
    });

    const failing = repository.runInTransaction(async () => {
      failureStarted();
      await failureGate;
      throw new Error("late transaction failure");
    });
    await started;
    const successful = repository.runInTransaction((transaction) =>
      transaction.updateTask("task-circulation", 1, { progress: 45 })
    );
    releaseFailure();

    await expect(failing).rejects.toThrow("late transaction failure");
    await expect(successful).resolves.toMatchObject({ progress: 45, version: 2 });
    await expect(repository.findTaskById("task-circulation")).resolves.toMatchObject({
      progress: 45,
      version: 2
    });
  });

  it("rejects nested memory transactions explicitly", async () => {
    const repository = createMemoryRepository(demoSeedData);

    await expect(
      repository.runInTransaction((transaction) =>
        transaction.runInTransaction(async () => "nested")
      )
    ).rejects.toThrow("Nested memory transactions are not supported.");
  });

  it("isolates a concurrent direct write from a failing memory transaction", async () => {
    const repository = createMemoryRepository(demoSeedData);
    let releaseFailure!: () => void;
    let failureStarted!: () => void;
    const failureGate = new Promise<void>((resolve) => {
      releaseFailure = resolve;
    });
    const started = new Promise<void>((resolve) => {
      failureStarted = resolve;
    });
    const failing = repository.runInTransaction(async () => {
      failureStarted();
      await failureGate;
      throw new Error("transaction failed");
    });
    await started;
    const directWrite = repository.updateTask("task-circulation", 1, {
      progress: 45
    });
    releaseFailure();

    await expect(failing).rejects.toThrow("transaction failed");
    await expect(directWrite).resolves.toMatchObject({ progress: 45, version: 2 });
    await expect(repository.findTaskById("task-circulation")).resolves.toMatchObject({
      progress: 45,
      version: 2
    });
  });

  it("does not expose uncommitted memory transaction state to ordinary reads", async () => {
    const repository = createMemoryRepository(demoSeedData);
    let releaseTransaction!: () => void;
    let mutationComplete!: () => void;
    const transactionGate = new Promise<void>((resolve) => {
      releaseTransaction = resolve;
    });
    const mutated = new Promise<void>((resolve) => {
      mutationComplete = resolve;
    });
    const transaction = repository.runInTransaction(async (unit) => {
      await unit.updateTask("task-circulation", 1, { progress: 45 });
      mutationComplete();
      await transactionGate;
      throw new Error("rollback after observation window");
    });
    await mutated;
    const read = repository.findTaskById("task-circulation");
    await expect(read).resolves.toMatchObject({ progress: 20, version: 1 });
    releaseTransaction();

    await expect(transaction).rejects.toThrow("rollback after observation window");
  });

  it("keeps backdated task event time separate from repository mutation time", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const original = await repository.findTaskById("task-circulation");

    const updated = await repository.updateTask("task-circulation", original!.version, {
      progress: 25,
      latestUpdateAt: "2026-06-20T09:30:00.000Z"
    });

    expect(updated.latestUpdateAt).toBe("2026-06-20T09:30:00.000Z");
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(
      new Date(original!.updatedAt).getTime()
    );
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

  it("accepts successive design versions for the same design target", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const versionOne = demoSeedData.designVersions[0]!;

    const versionTwo = await repository.createDesignVersion({
      ...structuredClone(versionOne),
      id: "version-aurora-plan-2",
      versionNumber: 2,
      originalFilename: "aurora-ground-plan-v2.pdf",
      storedFileReference: "seed/aurora-ground-plan-v2.pdf",
      uploadedAt: "2026-07-16T10:00:00.000Z",
      createdAt: "2026-07-16T10:00:00.000Z",
      updatedAt: "2026-07-16T10:00:00.000Z"
    });

    expect(versionTwo.versionNumber).toBe(2);
    await expect(
      repository.listDesignVersions("project-aurora-villa")
    ).resolves.toMatchObject([
      { id: "version-aurora-plan-1", versionNumber: 1 },
      { id: "version-aurora-plan-2", versionNumber: 2 }
    ]);
  });

  it("rejects a duplicate design-version target and version number", async () => {
    const repository = createMemoryRepository(demoSeedData);
    const versionOne = demoSeedData.designVersions[0]!;

    await expect(
      repository.createDesignVersion({
        ...structuredClone(versionOne),
        id: "version-aurora-plan-duplicate",
        originalFilename: "duplicate-name.pdf",
        storedFileReference: "seed/duplicate-name.pdf"
      })
    ).rejects.toBeInstanceOf(RepositoryConflictError);
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
