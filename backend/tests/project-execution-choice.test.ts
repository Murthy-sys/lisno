import { describe, expect, it, vi } from "vitest";
import { projectExecutionChoice } from "../src/domain/project-execution-choice.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { RepositoryConflictError } from "../src/repositories/types.js";
import { createDesignWorkflowStateService, workflowActionSchema } from "../src/services/design-workflow-state.service.js";
import { executionChoiceFixture, CHOICE_NOW, KEYS_AT } from "./fixtures/execution-choice.js";

describe("Permanent project execution choice", () => {
  it.each(["option_1", "option_2"])("saves %s once with server identity, sequence and immutable audit, without changing workflow business state", async optionId => {
    const f = executionChoiceFixture();
    const before = (await f.state())!, projectBefore = await f.repository.findProjectById(f.project.id);
    const auditsBefore = await f.repository.listAuditEvents({});
    expect(await f.view()).toMatchObject({ status: "available", canSelect: true, selection: null, version: 3 });
    expect(await f.state()).toEqual(before);
    const input = { ...f.command, data: { ...f.command.data, optionId } };
    await expect(f.service.act(f.users.client!, f.project.id, input, null)).resolves.toEqual({ version: 4, replayed: false });
    const saved = (await f.state())!, choice = saved.executionChoice!;
    expect(choice).toMatchObject({ optionId, definitionVersion: 1, selectedById: f.users.client!.id, selectedAt: CHOICE_NOW.toISOString(), keyCollectionStageId: input.stageId,
      phaseIds: optionId === "option_1" ? ["layout_2d", "layout_3d", "selections", "renders", "production"] : ["layout_3d", "renders", "selections", "production"] });
    expect(saved.history).toHaveLength(1);
    expect(saved.history[0]).toMatchObject({ id: choice.historyEventId, actorId: f.users.client!.id, actorRole: "client", onBehalfOfClient: false, data: { ...choice, acknowledgedIrreversible: true } });
    expect(saved.stages).toEqual(before.stages); expect(saved.pauses).toEqual(before.pauses); expect(saved.initialPaymentAt).toBe(before.initialPaymentAt);
    expect(await f.repository.findProjectById(f.project.id)).toEqual(projectBefore);
    expect(await f.repository.listAuditEvents({})).toHaveLength(auditsBefore.length + 1);
    const view = await f.view();
    expect(view).toMatchObject({ status: "locked", canSelect: false, selection: { optionId, selectedAt: choice.selectedAt } });
    expect(view.selection).not.toHaveProperty("selectedById");
    expect(await f.view(f.users.designer!)).toEqual(view);
    await expect(f.service.act(f.users.client!, f.project.id, input, null)).resolves.toEqual({ version: 4, replayed: true });
    expect(await f.state()).toEqual(saved);
    expect(await f.repository.listAuditEvents({})).toHaveLength(auditsBefore.length + 1);
    for (const replacement of [optionId, optionId === "option_1" ? "option_2" : "option_1"]) {
      await expect(f.service.act(f.users.client!, f.project.id, { ...input, expectedVersion: 4, idempotencyKey: `replace-${replacement}`, data: { ...input.data, optionId: replacement } }, null)).rejects.toMatchObject({ code: "EXECUTION_PATH_ALREADY_SELECTED" });
    }
  });

  it.each([{}, { handedOverAt: KEYS_AT }, { receivedAt: KEYS_AT }, { handedOverAt: KEYS_AT, receivedAt: KEYS_AT }])("requires complete keys: %j", async keys => {
    const f = executionChoiceFixture(seed => { seed.designWorkflowStates![0]!.stages.key_collection = keys; });
    const before = await f.state(), auditBefore = await f.repository.listAuditEvents({});
    expect(await f.view()).toMatchObject({ status: "waiting_for_keys", canSelect: false });
    await expect(f.service.act(f.users.client!, f.project.id, f.command, null)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect(await f.state()).toEqual(before); expect(await f.repository.listAuditEvents({})).toEqual(auditBefore);
  });

  it.each(["invalid-date", "future-date", "missing-confirmation", "premature-completion", "duplicate-stage"])("fails closed for %s", async corruption => {
    const f = executionChoiceFixture(seed => {
      const keys = seed.designWorkflowStates![0]!.stages.key_collection!;
      if (corruption === "invalid-date") keys.receivedAt = "bad-date";
      if (corruption === "future-date") keys.receivedAt = "2030-01-01T00:00:00.000Z";
      if (corruption === "missing-confirmation") delete keys.handedOverAt;
      if (corruption === "premature-completion") keys.completedAt = "2026-11-25T00:00:00.000Z";
      if (corruption === "duplicate-stage") seed.projects[0]!.designWorkflowStages!.push({ ...seed.projects[0]!.designWorkflowStages![2]!, id: "duplicate-keys" });
    });
    expect(await f.view()).toMatchObject({ status: "unavailable", canSelect: false });
    await expect(f.service.act(f.users.client!, f.project.id, f.command, null)).rejects.toMatchObject({ status: expect.any(Number) });
    expect((await f.state())!.executionChoice).toBeUndefined();
  });

  it("does not manufacture a choice or workflow for a legacy project", async () => {
    const f = executionChoiceFixture(seed => { delete seed.projects[0]!.designWorkflowStages; seed.designWorkflowStates = []; });
    expect(await f.view()).toMatchObject({ status: "unavailable", canSelect: false, selection: null });
    expect(await f.state()).toBeNull();
  });

  it.each(["designer", "admin", "super_admin", "finance_head", "design_manager", "estimator_sales", "other"])("denies %s without writes, including idempotent replay", async role => {
    const f = executionChoiceFixture();
    const before = await f.state();
    await expect(f.service.act(f.users[role]!, f.project.id, f.command, null)).rejects.toMatchObject({ status: role === "other" ? 404 : 403 });
    expect(await f.state()).toEqual(before);
    await f.service.act(f.users.client!, f.project.id, f.command, null);
    const saved = await f.state();
    await expect(f.service.act(f.users[role]!, f.project.id, f.command, null)).rejects.toMatchObject({ status: role === "other" ? 404 : 403 });
    expect(await f.state()).toEqual(saved);
  });

  it("denies inactive or deleted Clients and foreign project/stage identity", async () => {
    for (const kind of ["inactive", "deleted"] as const) {
      const f = executionChoiceFixture(seed => { const client = seed.users.find(user => user.role === "client")!; if (kind === "inactive") client.active = false; else client.deletedAt = KEYS_AT; });
      await expect(f.service.act(f.users.client!, f.project.id, f.command, null)).rejects.toMatchObject({ status: kind === "inactive" ? 401 : 404 });
    }
    const f = executionChoiceFixture();
    await expect(f.service.act(f.users.client!, f.seed.projects[1]!.id, f.command, null)).rejects.toMatchObject({ status: 404 });
    await expect(f.service.act(f.users.client!, f.project.id, { ...f.command, stageId: "another-project:keys" }, null)).rejects.toMatchObject({ status: 404 });
  });

  it("strictly validates the command and evidence", async () => {
    const f = executionChoiceFixture();
    for (const data of [{}, { ...f.command.data, optionId: "option_3" }, { ...f.command.data, definitionVersion: 2 }, { ...f.command.data, acknowledgedIrreversible: false }, { ...f.command.data, selectedById: "forged" }, { ...f.command.data, phaseIds: ["production"] }]) {
      expect(workflowActionSchema.safeParse({ ...f.command, data }).success).toBe(false);
      await expect(f.service.act(f.users.client!, f.project.id, { ...f.command, data }, null)).rejects.toMatchObject({ status: 400 });
    }
    await expect(f.service.act(f.users.client!, f.project.id, f.command, { storageReference: "opaque-proof", originalFilename: "proof.pdf", mimeType: "application/pdf", byteSize: 1, sha256: "a".repeat(64) })).rejects.toMatchObject({ code: "INVALID_WORKFLOW_EVIDENCE" });
  });

  it("rejects stale versions and reused command keys with changed payload", async () => {
    const f = executionChoiceFixture();
    await expect(f.service.act(f.users.client!, f.project.id, { ...f.command, expectedVersion: 2 }, null)).rejects.toMatchObject({ code: "WORKFLOW_VERSION_CONFLICT" });
    await f.service.act(f.users.client!, f.project.id, f.command, null);
    await expect(f.service.act(f.users.client!, f.project.id, { ...f.command, data: { ...f.command.data, optionId: "option_2" } }, null)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("serializes concurrent different decisions and rolls back an audit failure", async () => {
    const f = executionChoiceFixture();
    const before = await f.state(), auditBefore = await f.repository.listAuditEvents({});
    vi.spyOn(f.audit, "append").mockRejectedValueOnce(new Error("synthetic audit failure"));
    await expect(f.service.act(f.users.client!, f.project.id, f.command, null)).rejects.toThrow("synthetic audit failure");
    expect(await f.state()).toEqual(before); expect(await f.repository.listAuditEvents({})).toEqual(auditBefore);
    const results = await Promise.allSettled([f.service.act(f.users.client!, f.project.id, f.command, null), f.service.act(f.users.client!, f.project.id, { ...f.command, idempotencyKey: "competing-choice", data: { ...f.command.data, optionId: "option_2" } }, null)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((await f.state())!.history).toHaveLength(1);
  });

  it("preserves a choice during unrelated writes and replays without another version increment", async () => {
    const f = executionChoiceFixture();
    await f.service.act(f.users.client!, f.project.id, f.command, null);
    const saved = (await f.state())!;
    await f.service.act(f.users.client!, f.project.id, { action: "measurement_access_block", expectedVersion: saved.version, idempotencyKey: "site-access-block-later", stageId: `${f.project.id}:design-stage:site_measurement`, data: {}, note: "Site closed temporarily" }, null);
    const later = (await f.state())!;
    expect(later.executionChoice).toEqual(saved.executionChoice); expect(later.history[0]).toEqual(saved.history[0]);
    await expect(f.service.act(f.users.client!, f.project.id, f.command, null)).resolves.toEqual({ replayed: true, version: 5 });
    expect(await f.state()).toEqual(later);
  });

  it.each(["delete", "null", "replace", "erase-event", "alter-event", "duplicate-event"])("repository rejects %s of a saved decision", async corruption => {
    const f = executionChoiceFixture(); await f.service.act(f.users.client!, f.project.id, f.command, null);
    const saved = (await f.state())!, changed = structuredClone(saved);
    if (corruption === "delete") delete changed.executionChoice;
    if (corruption === "null") (changed as unknown as Record<string, unknown>).executionChoice = null;
    if (corruption === "replace") changed.executionChoice = { ...changed.executionChoice!, selectedById: "another-client" };
    if (corruption === "erase-event") changed.history = [];
    if (corruption === "alter-event") changed.history[0]!.note = "tampered";
    if (corruption === "duplicate-event") changed.history.push(structuredClone(changed.history[0]!));
    await expect(f.repository.saveDesignWorkflowState(f.project.id, saved.version, changed)).rejects.toBeInstanceOf(RepositoryConflictError);
    expect(await f.state()).toEqual(saved);
  });

  it("keeps corrupt saved evidence unavailable rather than allowing another decision", async () => {
    const f = executionChoiceFixture(); await f.service.act(f.users.client!, f.project.id, f.command, null);
    const saved = (await f.state())!; saved.history = [];
    const seed = { ...f.seed, designWorkflowStates: [saved] }, repository = createMemoryRepository(seed);
    const service = createDesignWorkflowStateService(repository, f.audit, () => CHOICE_NOW);
    expect(projectExecutionChoice(f.project, saved, f.users.client!, CHOICE_NOW)).toMatchObject({ status: "unavailable", canSelect: false });
    await expect(service.act(f.users.client!, f.project.id, { ...f.command, expectedVersion: 4, idempotencyKey: "corrupt-replacement" }, null)).rejects.toMatchObject({ code: "EXECUTION_CHOICE_UNAVAILABLE" });
  });

  it("does not hydrate quotations, create design tasks, or auto-complete furniture for workflow version 3", async () => {
    const f = executionChoiceFixture(seed => {
      seed.projects[0]!.estimationWorkflowVersion = 3;
      const state = seed.designWorkflowStates![0]!; state.estimationWorkflowVersion = 3;
      state.stages.site_measurement = { completedAt: KEYS_AT };
      state.stages.existing_furniture_dimensions = { acceptedAt: KEYS_AT, noExistingFurniture: true, rooms: [] };
      seed.estimateSummaries = []; seed.projectWorkflowAssignments = [];
    });
    const before = (await f.state())!;
    await f.service.act(f.users.client!, f.project.id, f.command, null);
    const saved = (await f.state())!;
    expect(saved.stages).toEqual(before.stages);
    expect(saved.designStartedAt).toBeUndefined(); expect(saved.quotationLocked).toBeUndefined();
    await expect(f.service.act(f.users.client!, f.project.id, f.command, null)).resolves.toMatchObject({ replayed: true });
    expect(projectExecutionChoice(f.project, saved, f.users.client!, CHOICE_NOW).status).toBe("locked");
  });
});
