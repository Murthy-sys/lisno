import { describe, expect, it, vi } from "vitest";
import { workflowSpacePlanningSource } from "../src/domain/workflow-space-planning.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { createDesignWorkflowStateService, type WorkflowActionInput } from "../src/services/design-workflow-state.service.js";
import { createProjectService } from "../src/services/project.service.js";
import { createAuditService } from "../src/services/audit.service.js";
import { spacePlanningFixture, SPACE_NOW } from "./fixtures/space-planning.js";

function setup(change?: (fixture: ReturnType<typeof spacePlanningFixture>) => void) {
  const fixture = spacePlanningFixture(); change?.(fixture);
  const repository = createMemoryRepository(fixture.seed), audit = createAuditService(repository), clock = () => new Date(SPACE_NOW);
  const service = createDesignWorkflowStateService(repository, audit, clock);
  const projects = createProjectService(repository, audit, clock);
  const input: WorkflowActionInput = { action: "space_planning_complete", stageId: fixture.stageId, expectedVersion: 0, idempotencyKey: "space-confirm-1", note: "", data: { estimateId: "space-estimate", designPlanVersion: 2, reviewRoundId: "space-round" } };
  const view = async (role = "client") => (await projects.designWorkflow(fixture.users[role]!, fixture.project.id)).projectStages!.find(stage => stage.id === fixture.stageId)!;
  return { ...fixture, repository, audit, service, input, view, act: (role = "client", value = input) => service.act(fixture.users[role]!, fixture.project.id, value, null) };
}

describe("space planning source integrity", () => {
  it("requires the exact current revision set, while allowing prior approved revisions in a new round", () => {
    const { source } = spacePlanningFixture();
    source.drawings[0]!.revisions.push({ ...source.drawings[0]!.revisions[0]!, id: "old-revision", revisionNumber: 1, reviewStatus: "changes_requested" });
    expect(workflowSpacePlanningSource(source)).toMatchObject({ totalImages: 2, approvedImages: 2, readyForCompletion: true, reviewRoundId: "space-round" });
  });
  it.each(["empty", "missing-revision", "pending-image", "returned-image", "missing-reviewer", "missing-reviewed-at", "round-missing", "round-duplicate", "foreign-round", "future-round", "wrong-set", "duplicate-set", "not-approved", "missing-frozen", "wrong-actor", "wrong-time", "wrong-role", "feedback", "invalid-version", "duplicate-revision"])("fails closed for %s", cause => {
    const { source } = spacePlanningFixture(); const round = source.rounds[0]!; const revision = source.drawings[0]!.revisions[0]!;
    if (cause === "empty") source.drawings = [];
    if (cause === "missing-revision") source.drawings[0]!.revisions = [];
    if (cause === "pending-image") revision.reviewStatus = "submitted";
    if (cause === "returned-image") revision.reviewStatus = "changes_requested";
    if (cause === "missing-reviewer") revision.reviewerId = null;
    if (cause === "missing-reviewed-at") revision.reviewedAt = null;
    if (cause === "round-missing") source.rounds = [];
    if (cause === "round-duplicate") source.rounds.push({ ...round, id: "duplicate" });
    if (cause === "foreign-round") round.projectId = "another-project";
    if (cause === "future-round") source.rounds.push({ ...round, id: "future", designPlanVersion: 3 });
    if (cause === "wrong-set") round.submittedRevisionIds[0] = "old-revision";
    if (cause === "duplicate-set") round.submittedRevisionIds[1] = round.submittedRevisionIds[0]!;
    if (cause === "not-approved") round.status = "pending";
    if (cause === "missing-frozen") source.frozenAt = null;
    if (cause === "wrong-actor") source.approvedById = "someone-else";
    if (cause === "wrong-time") source.approvedAt = "2026-09-17T10:00:00.000Z";
    if (cause === "wrong-role") round.decidedByRole = "designer";
    if (cause === "feedback") source.openFeedback = 1;
    if (cause === "invalid-version") source.designPlanVersion = 0;
    if (cause === "duplicate-revision") source.drawings[0]!.revisions.push({ ...revision, id: "duplicate" });
    expect(workflowSpacePlanningSource(source)).toMatchObject({ readyForCompletion: false });
  });
  it("does not treat orphaned open feedback as a legacy floor-only plan", () => {
    const { source } = spacePlanningFixture();
    Object.assign(source, { designPlanStatus: null, designPlanVersion: 0, approvedAt: null, approvedById: null, approvalSource: null, frozenAt: null, rounds: [], drawings: [], openFeedback: 1 });
    expect(workflowSpacePlanningSource(source)).toMatchObject({ readyForCompletion: false });
  });
  it("accepts immutable representative Design approval evidence only with its matching proof", () => {
    const { source } = spacePlanningFixture(); const round = source.rounds[0]!;
    source.approvalSource = round.decisionSource = "admin_proof"; source.approvedById = round.decidedById = "admin"; round.decidedByRole = "admin";
    expect(workflowSpacePlanningSource(source)?.readyForCompletion).toBe(false);
    round.proof = { estimateId: source.estimateId, reviewRoundId: round.id, uploadedById: "admin", valid: true };
    expect(workflowSpacePlanningSource(source)?.readyForCompletion).toBe(true);
    round.proof.reviewRoundId = "another-round";
    expect(workflowSpacePlanningSource(source)?.readyForCompletion).toBe(false);
  });
});

describe("Client space-planning acknowledgement", () => {
  it("exposes final approval only to the Client, persists source and audit, then completes and replays once", async () => {
    const { view, act, repository, project, input } = setup();
    expect(await view()).toMatchObject({ status: "in_progress", operational: { availableActions: [{ id: "space_planning_complete", requiresProof: false }], spacePlanning: { readyForCompletion: true, approvedImages: 2, completedAt: null } } });
    expect(await act()).toEqual({ version: 1, replayed: false });
    expect(await act()).toEqual({ version: 1, replayed: true });
    expect(await view()).toMatchObject({ status: "completed", progress: 100, operational: { availableActions: [], spacePlanning: { completedAt: SPACE_NOW, readyForCompletion: false } } });
    const state = await repository.findDesignWorkflowState(project.id);
    expect(state?.history).toHaveLength(1);
    expect(state?.stages.space_planning_tentative_look_feel).toEqual({ completedAt: SPACE_NOW, spacePlanningApproval: input.data });
    expect(state?.history[0]).toMatchObject({ actorRole: "client", onBehalfOfClient: false, data: { ...input.data, completedAt: SPACE_NOW } });
  });
  it.each(["designer", "super_admin", "design_head", "finance_head"])("does not expose or permit %s acknowledgement", async role => {
    const { view, act } = setup();
    if (role !== "finance_head") expect((await view(role)).operational?.availableActions).toEqual([]);
    await expect(act(role)).rejects.toMatchObject({ status: 403 });
  });
  it("does not allow representative replay of a Client key", async () => { const test = setup(); await test.act(); await expect(test.act("super_admin")).rejects.toMatchObject({ status: 403 }); });
  it.each(["estimateId", "reviewRoundId", "designPlanVersion"])("rejects stale %s without writes", async field => {
    const { act, input, repository, project } = setup();
    await expect(act("client", { ...input, data: { ...input.data, [field]: field === "designPlanVersion" ? 1 : "another" } })).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect((await repository.findDesignWorkflowState(project.id))?.history).toEqual([]);
  });
  it.each(["prerequisite", "pause", "pending", "feedback", "foreign", "ambiguous", "missing", "no-round"])("does not offer or accept confirmation for %s", async cause => {
    const test = setup(({ state, source, seed }) => {
      if (cause === "prerequisite") delete state.stages.existing_furniture_dimensions!.completedAt;
      if (cause === "pause") state.pauses.push({ startedAt: SPACE_NOW, endedAt: null });
      if (cause === "pending") source.drawings[1]!.revisions[0]!.reviewStatus = "submitted";
      if (cause === "feedback") source.openFeedback = 1;
      if (cause === "foreign") source.projectId = "other";
      if (cause === "ambiguous") seed.estimateSummaries!.push({ ...seed.estimateSummaries![0]!, id: "other-estimate" });
      if (cause === "missing") seed.estimateSummaries = [];
      if (cause === "no-round") source.rounds = [];
    });
    expect((await test.view()).operational?.availableActions).toEqual([]);
    await expect(test.act()).rejects.toMatchObject({ status: 409 });
  });
  it("checks workflow version and idempotency payload, with one concurrent completion", async () => {
    const { act, input, repository, project } = setup();
    await expect(act("client", { ...input, expectedVersion: 1 })).rejects.toMatchObject({ code: "WORKFLOW_VERSION_CONFLICT" });
    const results = await Promise.all([act(), act()]);
    expect(results.map(result => result.replayed).sort()).toEqual([false, true]);
    await expect(act("client", { ...input, note: "different" })).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect((await repository.findDesignWorkflowState(project.id))?.history).toHaveLength(1);
  });
  it("rolls back completion if audit persistence fails", async () => {
    const { service, users, project, input, audit, repository } = setup();
    vi.spyOn(audit, "append").mockRejectedValueOnce(new Error("audit failed"));
    await expect(service.act(users.client!, project.id, input, null)).rejects.toThrow("audit failed");
    expect((await repository.findDesignWorkflowState(project.id))?.version).toBe(0);
  });
  it("isolates the canonical estimate from another same-project historical Design source", async () => {
    const { view, act } = setup(({ seed, source }) => { seed.designPlanReviewSources!.push({ ...structuredClone(source), estimateId: "other-estimate" }); });
    expect((await view()).operational?.spacePlanning?.readyForCompletion).toBe(true);
    expect(await act()).toMatchObject({ replayed: false });
  });
  it("does not fall back to legacy tasks when a Design plan lost its approved estimate source", async () => {
    const { view, act } = setup(({ seed }) => {
      seed.designPlanReviewSources = [];
      seed.estimateSummaries![0]!.status = "draft";
      seed.estimateSummaries![0]!.designPlanStatus = "approved";
    });
    expect(await view()).toMatchObject({ status: "blocked", operational: { availableActions: [] } });
    await expect(act()).rejects.toMatchObject({ status: 409 });
  });
  it("keeps legacy floor-only projections and does not offer a new acknowledgement", async () => {
    const { view } = setup(({ seed }) => { seed.designPlanReviewSources = []; });
    const result = await view();
    expect(result.operational?.spacePlanning).toBeUndefined(); expect(result.operational?.availableActions).toEqual([]);
    expect(result.operational?.timing.startsAt).toBeNull();
  });
  it("ignores completed floor tasks for review-backed stage completion", async () => {
    const { view } = setup(({ seed, project, stageId }) => {
      const task = seed.tasks.find(row => row.projectId === project.id)!;
      const stage = seed.stages.find(row => row.id === task.stageId)!;
      stage.workflowStageId = stageId; stage.type = "space_planning_tentative_look_feel";
      for (const task of seed.tasks.filter(task => task.stageId === stage.id)) { task.status = "completed"; task.progress = 100; task.completedAt = SPACE_NOW; }
    });
    const result = await view();
    expect(result.tasks.length).toBeGreaterThan(0);
    expect(result.tasks.every(task => task.status === "completed")).toBe(true);
    expect(result).toMatchObject({ status: "in_progress", progress: null, operational: { spacePlanning: { completedAt: null } } });
  });
  it("preserves completed legacy floor-task stages when there is no review source", async () => {
    const { view } = setup(({ seed, project, stageId }) => {
      seed.designPlanReviewSources = [];
      const task = seed.tasks.find(row => row.projectId === project.id)!;
      const stage = seed.stages.find(row => row.id === task.stageId)!;
      stage.workflowStageId = stageId; stage.type = "space_planning_tentative_look_feel";
      for (const task of seed.tasks.filter(task => task.stageId === stage.id)) { task.status = "completed"; task.progress = 100; task.completedAt = SPACE_NOW; }
    });
    const result = await view();
    expect(result.tasks.length).toBeGreaterThan(0);
    expect(result).toMatchObject({ status: "completed", progress: 100, operational: { availableActions: [] } });
  });
  it.each([{}, { estimateId: "space-estimate", designPlanVersion: 2, reviewRoundId: null }, { estimateId: "space-estimate", designPlanVersion: 2, reviewRoundId: "space-round", approved: true }])("rejects malformed or augmented confirmation data", async data => {
    const { act, input } = setup();
    await expect(act("client", { ...input, data })).rejects.toMatchObject({ code: "INVALID_SPACE_PLANNING_CONFIRMATION" });
  });
  it("cannot manufacture completion by writing a bare completion timestamp", async () => {
    const { view } = setup(({ state }) => { state.stages.space_planning_tentative_look_feel = { completedAt: SPACE_NOW }; });
    expect(await view()).toMatchObject({ status: "blocked", operational: { spacePlanning: { completedAt: null } } });
  });
});
