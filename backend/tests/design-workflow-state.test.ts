import express from "express";
import request from "supertest";
import { errorHandler } from "../src/middleware/errors.js";
import { createDesignWorkflowStateRouter } from "../src/routes/design-workflow-state.js";
import { createEstimateClientReviewStorage } from "../src/services/estimate-client-review-storage.js";
import type { AuthService } from "../src/services/auth.service.js";
import { describe, expect, it, vi } from "vitest";
import { createProjectDesignWorkflow } from "../src/domain/design-workflow.js";
import { CALENDAR_DAY_MS as DAY, emptyDesignWorkflowState, workflowSubmissionBlockers } from "../src/domain/design-workflow-state.js";
import { sha256Hex } from "../src/domain/estimate-client-review.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createProjectService } from "../src/services/project.service.js";
import { createDesignWorkflowStateService, projectOperationalStage } from "../src/services/design-workflow-state.service.js";
import type { SeedData } from "../src/repositories/types.js";
import type { WorkflowActionInput } from "../src/services/design-workflow-state.service.js";

const BASE = Date.parse("2026-09-11T10:00:00.000Z");
const document = { storageReference: "opaque-test-file", originalFilename: "signed.pdf", mimeType: "application/pdf" as const, byteSize: 5, sha256: sha256Hex(Buffer.from("proof")) };
function setup(_withRooms = false, configure?: (seed: SeedData) => void) {
  const seed = structuredClone(demoSeedData);
  const project = seed.projects.find((project) => project.id === "project-aurora-villa")!;
  project.designWorkflowStages = createProjectDesignWorkflow(project.id);
  const users = Object.fromEntries(["designer", "client", "estimator_sales", "finance_head", "admin", "super_admin", "design_manager"].map((role) => {
    const user = seed.users.find((user) => user.role === role)!;
    return [role, { id: user.id, name: user.name, email: user.email, role: user.role } satisfies PublicUser];
  }));
  project.clientId = users.client!.id;
  project.assignedDesignerIds = [users.designer!.id];
  project.assignedEstimatorId = users.estimator_sales!.id;
  seed.projectAccessGrants.push({ id: "workflow-admin-scope", projectId: project.id, userId: users.admin!.id, module: "projects", source: "admin_initiator", active: true, grantedById: users.admin!.id, grantedAt: new Date(BASE).toISOString(), revokedAt: null, revokedById: null, revocationReason: null, version: 1, createdAt: new Date(BASE).toISOString(), updatedAt: new Date(BASE).toISOString(), accessRequestId: null });
  seed.estimateSummaries = (seed.estimateSummaries ?? []).filter((row) => row.projectId !== project.id);
  seed.estimateSummaries.push({ id: "workflow-approved-estimate", leadId: "workflow-lead", projectId: project.id, version: 4, status: "client_approved", subtotal: 1000, gst: 0, total: 1000, clientDecisionAt: new Date(BASE).toISOString(), clientDecisionSource: "client_portal", approvedBaseline: null, clientReview: null, assignedAdminId: users.admin!.id, createdAt: new Date(BASE).toISOString(), updatedAt: new Date(BASE).toISOString(), rooms: [{ id: "room-living", label: "Living room" }, { id: "room-bedroom", label: "Bedroom" }] });
  const baseClient = seed.users.find((user) => user.role === "client")!;
  const outsider = { ...baseClient, id: "workflow-outsider-client", email: "outsider@example.test", emailNormalized: "outsider@example.test" };
  seed.users.push(outsider);
  users.outsider = { id: outsider.id, name: outsider.name, email: outsider.email, role: outsider.role };
  configure?.(seed);
  const repository = createMemoryRepository(seed);
  let now = BASE;
  let sequence = 0;
  const service = createDesignWorkflowStateService(repository, createAuditService(repository), () => new Date(now));
  const state = () => repository.findDesignWorkflowState(project.id);
  const act = async (role: string, action: WorkflowActionInput["action"], data: Record<string, unknown> = {}, file: typeof document | null = null, note = "Recorded confirmation") => {
    const stageType = action.startsWith("internal") || action.startsWith("sales") ? "internal_kickoff" : action.startsWith("client_kickoff") ? "client_kickoff" : action.startsWith("keys") ? "key_collection" : action.startsWith("measurement") ? "site_measurement" : "existing_furniture_dimensions";
    return service.act(users[role]!, project.id, { expectedVersion: (await state())?.version ?? 0, idempotencyKey: `action-key-${++sequence}`, action, ...(action === "confirm_initial_payment" ? {} : { stageId: project.designWorkflowStages!.find((stage) => stage.type === stageType)!.id }), data, note }, file);
  };
  const finishInternal = () => act("designer", "internal_kickoff_complete", { designHandoverAcknowledged: true, meetingAt: new Date(now).toISOString() }, document);
  const openKeys = async () => { await finishInternal(); await act("designer", "client_kickoff_not_required"); };
  const openMeasurement = async () => { await openKeys(); await act("client", "keys_handed_over"); await act("designer", "keys_received"); };
  const openFurniture = async () => { await openMeasurement(); await act("designer", "measurement_assign", { designerId: users.designer!.id }); await act("designer", "measurement_complete", { mediaFolderUrl: "https://example.test/photos" }, document); };
  const legacyPause = async () => { const saved = (await state())!; saved.pauses.push({ startedAt: new Date(now).toISOString(), endedAt: null }); await repository.saveDesignWorkflowState(project.id, saved.version, saved); };
  return { seed, repository, project, users, service, state, act, finishInternal, openKeys, openMeasurement, openFurniture, legacyPause, advance: (days: number) => { now = BASE + days * DAY; }, now: () => new Date(now) };
}

describe("operational design workflow", () => {
  it("lets Super Admin confirm only an approved project and snapshots its approved version", async () => {
    const { act, service, state, users, project, repository, now } = setup();
    const projects = createProjectService(repository, createAuditService(repository), now);
    expect((await projects.designWorkflow(users.super_admin!, project.id)).initialPayment).toMatchObject({ status: "awaiting_payment", canConfirm: true, confirmedAt: null });
    expect(await service.queue(users.super_admin!)).toContainEqual(expect.objectContaining({ projectId: project.id, status: "awaiting_payment", canConfirm: true }));
    await act("super_admin", "confirm_initial_payment");
    expect(await state()).toMatchObject({ initialPaymentEstimateId: "workflow-approved-estimate", initialPaymentEstimateVersion: 3, history: [{ actorRole: "super_admin", data: { estimateId: "workflow-approved-estimate", estimateVersion: 3, confirmedAt: new Date(BASE).toISOString() } }] });
    expect((await projects.designWorkflow(users.super_admin!, project.id)).initialPayment).toMatchObject({ status: "received", canConfirm: false, confirmedAt: new Date(BASE).toISOString() });
    expect(await service.queue(users.super_admin!)).not.toContainEqual(expect.objectContaining({ projectId: project.id }));
  });

  it.each(["missing", "draft", "sent", "foreign", "conflicting"])("keeps queue, projection and mutation closed for %s estimate approval", async (source) => {
    const { act, service, state, users, project, repository, now } = setup(false, (seed) => {
      const estimate = seed.estimateSummaries!.find((row) => row.id === "workflow-approved-estimate")!;
      if (source === "missing") seed.estimateSummaries = [];
      else if (source === "foreign") estimate.projectId = "another-project";
      else if (source === "conflicting") seed.estimateSummaries!.push({ ...estimate, id: "other-approved-estimate" });
      else estimate.status = source;
    });
    const view = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.super_admin!, project.id);
    expect(view.initialPayment).toMatchObject({ status: "awaiting_estimate_approval", canConfirm: false, confirmedAt: null });
    expect(view.projectStages![0]!.operational!.timing.state).toBe("waiting");
    const designerView = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.designer!, project.id);
    expect(designerView.projectStages![0]!.operational!.availableActions).toContainEqual(expect.objectContaining({ id: "internal_kickoff_complete", disabledReason: "Awaiting estimate approval before initial-payment confirmation." }));
    await expect(act("designer", "internal_kickoff_complete", { designHandoverAcknowledged: true, meetingAt: now().toISOString() }, document)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect(await service.queue(users.super_admin!)).not.toContainEqual(expect.objectContaining({ projectId: project.id }));
    await expect(act("super_admin", "confirm_initial_payment")).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect(await state()).toBeNull();
  });

  it.each(["designer", "client", "admin", "estimator_sales", "design_manager"])("rejects %s payment confirmation and queue access", async (role) => {
    const { act, service, users, state } = setup();
    await expect(act(role, "confirm_initial_payment")).rejects.toMatchObject({ status: 403 });
    await expect(service.queue(users[role]!)).rejects.toMatchObject({ status: 404 });
    expect(await state()).toBeNull();
  });

  it("does not look up the approval source for an unrelated reader or revise a historical receipt", async () => {
    const { act, repository, users, project, now } = setup();
    const projects = createProjectService(repository, createAuditService(repository), now);
    const source = vi.spyOn(repository, "findDesignWorkflowRoomContext");
    await expect(projects.designWorkflow(users.outsider!, project.id)).rejects.toMatchObject({ status: 404 });
    expect(source).not.toHaveBeenCalled();
    await act("super_admin", "confirm_initial_payment");
    source.mockResolvedValue(null);
    expect((await projects.designWorkflow(users.super_admin!, project.id)).initialPayment).toMatchObject({ status: "received", canConfirm: false });
  });

  it.each([{}, { designHandoverAcknowledged: false }, { designHandoverAcknowledged: "true" }])("requires explicit Designer receipt acknowledgement: %j", async (data) => {
    const { act, advance, state } = setup();
    await act("super_admin", "confirm_initial_payment"); advance(2);
    const before = await state();
    await expect(act("designer", "internal_kickoff_complete", { meetingAt: new Date(BASE).toISOString(), ...data }, document)).rejects.toMatchObject({ code: "KICKOFF_HANDOVER_REQUIRED" });
    expect(await state()).toEqual(before);
  });

  it.each([
    { handedOverToManager: true, handoverManagerId: "user-manager-aarav" },
    { handoverManagerId: "user-manager-meera" },
    { handoverAcknowledgedById: "another-designer" },
    { handoverAcknowledgedByName: "Another Designer" },
    { handoverAcknowledgedAt: new Date(BASE).toISOString() },
    { designerId: "another-designer" },
    { recipientId: "another-designer" }
  ])("rejects legacy handover and client-supplied recipient fields: %j", async (fields) => {
    const { act, state, now } = setup();
    await act("super_admin", "confirm_initial_payment");
    const before = await state();
    await expect(act("designer", "internal_kickoff_complete", { designHandoverAcknowledged: true, meetingAt: now().toISOString(), ...fields }, document)).rejects.toMatchObject({ code: "INVALID_WORKFLOW_ACTION" });
    expect(await state()).toEqual(before);
  });

  it("requires a meeting and records the authenticated Designer's acknowledgement, history and audit", async () => {
    const { act, advance, state, repository, users, project, now, service } = setup();
    await act("super_admin", "confirm_initial_payment"); advance(2);
    const data = { designHandoverAcknowledged: true, meetingAt: now().toISOString() };
    await expect(act("designer", "internal_kickoff_complete", { designHandoverAcknowledged: true }, document)).rejects.toMatchObject({ code: "INVALID_WORKFLOW_DATE" });
    await expect(act("design_manager", "internal_kickoff_complete", data, document)).rejects.toMatchObject({ status: 403 });
    const designer = (await repository.findUserById(users.designer!.id))!;
    await service.act({ ...users.designer!, name: "Stale caller name" }, project.id, { action: "internal_kickoff_complete", expectedVersion: 1, idempotencyKey: "designer-receipt-identity", stageId: project.designWorkflowStages![0]!.id, data, note: "Receipt acknowledged" }, document);
    const receipt = { handoverAcknowledgedAt: now().toISOString(), handoverAcknowledgedById: designer.id, handoverAcknowledgedByName: designer.name, meetingAt: data.meetingAt, completedAt: now().toISOString() };
    const saved = (await state())!;
    expect(saved.stages.internal_kickoff).toEqual({ ...receipt, timingBasis: "sequential" });
    expect(saved.history.at(-1)).toMatchObject({ actorId: designer.id, actorName: designer.name, actorRole: "designer", data: { ...receipt, designHandoverAcknowledged: true }, proof: document });
    expect(await repository.listAuditEvents({})).toContainEqual(expect.objectContaining({ actorId: designer.id, newValues: expect.objectContaining({ action: "internal_kickoff_complete", ...receipt, designHandoverAcknowledged: true }) }));
    advance(8);
    const stage = (await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.designer!, project.id)).projectStages![0]!;
    expect(stage.operational!.timing).toMatchObject({ state: "completed", endsAt: new Date(BASE + 2 * DAY).toISOString(), remainingMs: DAY });
    expect(stage.operational!.facts).toContainEqual({ label: "Design handover acknowledged by", value: designer.name });
    expect(stage.operational!.facts).toContainEqual({ label: "Design handover acknowledged at", value: receipt.handoverAcknowledgedAt });
    expect(stage.operational!.facts).not.toContainEqual(expect.objectContaining({ label: expect.stringContaining("manager") }));
    expect(stage.operational!.availableActions).not.toContainEqual(expect.objectContaining({ id: "internal_kickoff_complete" }));
  });

  it.each(["missing", "inactive", "wrong-role", "ambiguous-team", "unassigned"])("allows Designer acknowledgement when manager is %s", async (condition) => {
    const { act, advance, state, repository, users, project, now } = setup(false, (seed) => {
      const project = seed.projects.find((row) => row.id === "project-aurora-villa")!;
      const manager = seed.users.find((row) => row.id === project.managerId)!;
      if (condition === "missing") project.managerId = "missing-manager";
      if (condition === "inactive") manager.active = false;
      if (condition === "wrong-role") project.managerId = project.assignedEstimatorId;
      if (condition === "ambiguous-team") {
        project.managerId = null;
        project.assignedDesignerIds.push(seed.users.find((row) => row.role === "designer" && row.managerId !== manager.id)!.id);
      }
      if (condition === "unassigned") {
        project.managerId = null;
        for (const user of seed.users) if (user.role === "designer") user.managerId = null;
      }
    });
    await act("super_admin", "confirm_initial_payment"); advance(2);
    const view = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.designer!, project.id);
    expect(view).not.toHaveProperty("kickoffManager");
    expect(view.projectStages![0]!.operational!.availableActions).toContainEqual({ id: "internal_kickoff_complete", label: "Complete Internal Kick off and save", actor: "designer", requiresProof: true });
    expect(view.projectStages![0]!.operational!.blockingReasons).toEqual([]);
    await act("designer", "internal_kickoff_complete", { designHandoverAcknowledged: true, meetingAt: now().toISOString() }, document);
    expect((await state())!.stages.internal_kickoff).toMatchObject({ handoverAcknowledgedById: users.designer!.id, completedAt: now().toISOString() });
  });

  it("preserves completed legacy manager handover history without fabricating a Designer receipt", async () => {
    const { act, repository, project, users, now, state } = setup();
    await act("super_admin", "confirm_initial_payment");
    const legacy = (await state())!;
    const legacyData = { handedOverToManager: true, handoverManagerId: "previous-manager", handoverManagerName: "Previous Manager", managerHandedOverAt: now().toISOString(), meetingAt: now().toISOString() };
    legacy.stages.internal_kickoff = { managerHandedOverAt: now().toISOString(), handoverManagerId: "previous-manager", handoverManagerName: "Previous Manager", meetingAt: now().toISOString(), completedAt: now().toISOString() };
    legacy.history.push({ id: "legacy-kickoff", idempotencyKey: "legacy-kickoff-key", requestHash: "legacy-hash", action: "internal_kickoff_complete", stageId: project.designWorkflowStages![0]!.id, actorId: users.designer!.id, actorName: users.designer!.name, actorRole: "designer", onBehalfOfClient: false, at: now().toISOString(), note: "Historical handover", data: legacyData, proof: document });
    const before = await repository.saveDesignWorkflowState(project.id, legacy.version, legacy);
    const view = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.designer!, project.id);
    const stage = view.projectStages![0]!.operational!;
    expect(stage.status).toBe("completed");
    expect(stage.facts).toContainEqual({ label: "Previous manager handover", value: "Previous Manager" });
    expect(stage.facts).not.toContainEqual(expect.objectContaining({ label: expect.stringContaining("Design handover acknowledged") }));
    expect(stage.availableActions).not.toContainEqual(expect.objectContaining({ id: "internal_kickoff_complete" }));
    expect(stage.submittedDocument).toEqual({ eventId: "legacy-kickoff", filename: document.originalFilename, mimeType: document.mimeType, uploadedAt: now().toISOString() });
    const clientView = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.client!, project.id);
    expect(clientView.projectStages![1]!.operational!.submittedDocument).toEqual({ eventId: "legacy-kickoff", filename: document.originalFilename, mimeType: document.mimeType, uploadedAt: now().toISOString() });
    expect(await state()).toEqual(before);
  });

  it("opens kickoff immediately and counts its three-calendar-day allowance from payment", async () => {
    const { project, users, act, state, advance, now } = setup();
    const capabilities = { designer: true, client: false, sales: false, finance: false, representative: false, manager: false };
    const kickoff = project.designWorkflowStages![0]!;
    const projectTiming = async () => projectOperationalStage(kickoff, (await state()) ?? emptyDesignWorkflowState(project.id), capabilities, now(), users.designer!.id).timing;
    expect(await projectTiming()).toMatchObject({ state: "waiting", slaAllowanceMs: 3 * DAY, remainingMs: null, startsAt: null, targetAt: null });
    await act("finance_head", "confirm_initial_payment");
    expect(await projectTiming()).toMatchObject({ state: "running", slaAllowanceMs: 3 * DAY, remainingMs: 3 * DAY, startsAt: new Date(BASE).toISOString(), targetAt: new Date(BASE + 3 * DAY).toISOString(), designerElapsedMs: 0 });
    // Friday's payment starts a continuous countdown through Saturday and Sunday.
    advance(1);
    expect(await projectTiming()).toMatchObject({ state: "running", remainingMs: 2 * DAY, designerElapsedMs: DAY });
    advance(2);
    expect(await projectTiming()).toMatchObject({ state: "running", remainingMs: DAY, targetAt: new Date(BASE + 3 * DAY).toISOString(), designerElapsedMs: 2 * DAY });
  });

  it("requires Finance confirmation and records the real server timestamp once", async () => {
    const { act, state, service, users, project } = setup();
    await expect(act("admin", "confirm_initial_payment")).rejects.toMatchObject({ status: 403 });
    expect(await state()).toBeNull();
    await act("finance_head", "confirm_initial_payment");
    expect(await state()).toMatchObject({ version: 1, initialPaymentAt: new Date(BASE).toISOString(), history: [{ action: "confirm_initial_payment", actorRole: "finance_head" }] });
    expect(await service.queue(users.finance_head!)).not.toContainEqual(expect.objectContaining({ projectId: project.id }));
    await expect(act("finance_head", "confirm_initial_payment")).rejects.toMatchObject({ status: 409 });
  });
  it("rejects dates supplied to fabricate payment history", async () => {
    const { act, state } = setup();
    await expect(act("finance_head", "confirm_initial_payment", { confirmedAt: "2026-01-01T00:00:00.000Z" })).rejects.toMatchObject({ status: 400 });
    expect(await state()).toBeNull();
  });
  it("serializes concurrent initial confirmations and rejects stale versions", async () => {
    const { service, users, project, state } = setup();
    const input = { action: "confirm_initial_payment" as const, expectedVersion: 0, data: {}, note: "Receipt recorded", idempotencyKey: "one-initial-payment" };
    const results = await Promise.allSettled([service.act(users.finance_head!, project.id, input, null), service.act(users.finance_head!, project.id, { ...input, idempotencyKey: "other-initial-payment" }, null)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await state())!.history).toHaveLength(1);
    expect((await service.act(users.finance_head!, project.id, input, null)).replayed).toBe(true);
    await expect(service.act(users.finance_head!, project.id, { ...input, note: "Different receipt" }, null)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });
  it("shows the payment prerequisite, then lets the Designer complete and save kickoff in the first hour", async () => {
    const { act, state, advance, repository, users, project, now } = setup();
    const projects = createProjectService(repository, createAuditService(repository), now);
    const kickoffView = async () => (await projects.designWorkflow(users.designer!, project.id)).projectStages![0]!;
    const action = (view: Awaited<ReturnType<typeof kickoffView>>) => view.operational!.availableActions.find((item) => item.id === "internal_kickoff_complete");
    expect(action(await kickoffView())).toMatchObject({ actor: "designer", requiresProof: true, disabledReason: "Awaiting Super Admin confirmation of Initial payment received." });
    await expect(act("designer", "internal_kickoff_complete", { designHandoverAcknowledged: true, meetingAt: now().toISOString() }, document)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect(await state()).toBeNull();
    await act("super_admin", "confirm_initial_payment");
    const active = await kickoffView();
    expect(action(active)).toEqual({ id: "internal_kickoff_complete", label: "Complete Internal Kick off and save", actor: "designer", requiresProof: true });
    expect(active.operational).toMatchObject({ status: "in_progress", timing: { state: "running", remainingMs: 3 * DAY, startsAt: now().toISOString() } });
    expect(active.instructions!.start).toContain("Immediately after initial-payment confirmation");
    await expect(act("designer", "internal_kickoff_complete")).rejects.toMatchObject({ code: "WORKFLOW_PROOF_REQUIRED" });
    advance(1 / 24);
    await act("designer", "internal_kickoff_complete", { designHandoverAcknowledged: true, meetingAt: now().toISOString() }, document);
    const saved = await state();
    expect(saved!.stages.internal_kickoff).toMatchObject({ completedAt: now().toISOString(), handoverAcknowledgedAt: now().toISOString(), handoverAcknowledgedById: users.designer!.id });
    expect(saved!.history.at(-1)).toMatchObject({ action: "internal_kickoff_complete", actorId: users.designer!.id, proof: document });
    advance(1);
    const completed = await kickoffView();
    expect(action(completed)).toBeUndefined();
    expect(completed.operational!.timing).toMatchObject({ state: "completed", remainingMs: 3 * DAY - DAY / 24, designerElapsedMs: DAY / 24 });
    await expect(act("designer", "internal_kickoff_complete", { designHandoverAcknowledged: true, meetingAt: new Date(BASE).toISOString() }, document)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect(await state()).toEqual(saved);
  });

  it.each(["client", "admin", "estimator_sales", "design_manager", "super_admin"])("does not expose or authorize Designer kickoff completion to %s", async (role) => {
    const { act, state, repository, users, project, now } = setup();
    await act("super_admin", "confirm_initial_payment");
    const view = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users[role]!, project.id);
    expect(view.projectStages![0]!.operational!.availableActions).not.toContainEqual(expect.objectContaining({ id: "internal_kickoff_complete" }));
    const before = await state();
    await expect(act(role, "internal_kickoff_complete", { designHandoverAcknowledged: true, meetingAt: now().toISOString() }, document)).rejects.toMatchObject({ status: 403 });
    expect(await state()).toEqual(before);
  });

  it("keeps kickoff unavailable to an active but unassigned Designer", async () => {
    const { act, state, repository, users, project, now, service, seed } = setup();
    await act("super_admin", "confirm_initial_payment");
    const unrelated = seed.users.find((user) => user.role === "designer" && user.id !== users.designer!.id && user.id !== project.initiatingDesignerId)!;
    const actor: PublicUser = { id: unrelated.id, name: unrelated.name, email: unrelated.email, role: unrelated.role };
    const before = await state();
    await expect(createProjectService(repository, createAuditService(repository), now).designWorkflow(actor, project.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.act(actor, project.id, { action: "internal_kickoff_complete", expectedVersion: before!.version, stageId: project.designWorkflowStages![0]!.id, idempotencyKey: "unassigned-designer-kickoff", data: { designHandoverAcknowledged: true, meetingAt: now().toISOString() }, note: "Signed" }, document)).rejects.toMatchObject({ status: 404 });
    expect(await state()).toEqual(before);
  });

  it("allows the Designer to save kickoff during a legacy site-access pause without resuming any clocks", async () => {
    const { act, state, repository, users, project, now, advance, legacyPause } = setup();
    await act("super_admin", "confirm_initial_payment"); advance(1 / 24);
    await legacyPause(); advance(2 / 24);
    const view = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.designer!, project.id);
    const kickoff = view.projectStages![0]!.operational!;
    expect(kickoff.timing.state).toBe("paused");
    expect(kickoff.blockingReasons).toContain("Site access is unavailable. All workflow clocks are paused.");
    expect(kickoff.availableActions.find((action) => action.id === "internal_kickoff_complete")).not.toHaveProperty("disabledReason");
    await act("designer", "internal_kickoff_complete", { designHandoverAcknowledged: true, meetingAt: now().toISOString() }, document);
    expect((await state())!.pauses).toEqual([{ startedAt: new Date(BASE + DAY / 24).toISOString(), endedAt: null }]);
    expect((await state())!.stages.internal_kickoff!.completedAt).toBe(now().toISOString());
  });
  it("lets assigned Sales accept its calendar while rejecting unassigned Sales scope", async () => {
    const { act, service, project, users } = setup();
    await act("finance_head", "confirm_initial_payment");
    await act("estimator_sales", "sales_calendar_accept");
    await expect(service.preflight({ ...users.estimator_sales!, id: "missing-sales" }, project.id)).rejects.toMatchObject({ status: 401 });
  });
  it("gives the Client a completion task and four-day timer immediately after Internal completion", async () => {
    const { act, state, repository, project, users, now, finishInternal, advance } = setup();
    const projects = createProjectService(repository, createAuditService(repository), now);
    const view = () => projects.designWorkflow(users.client!, project.id);
    await expect(act("client", "client_kickoff_complete")).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    await act("super_admin", "confirm_initial_payment");
    const waiting = await view();
    expect(waiting.projectStages![1]!.operational).toMatchObject({ availableActions: [], timing: { state: "waiting", remainingMs: null } });
    expect(waiting.notices).not.toContainEqual(expect.objectContaining({ id: `${project.id}:kickoff-pending` }));
    await expect(act("client", "client_kickoff_complete")).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    advance(6); await finishInternal();
    const active = await view();
    expect(active.projectStages![1]!.operational).toMatchObject({ status: "in_progress", availableActions: [{ id: "client_kickoff_complete", label: "Complete Client Kick off", actor: "client", requiresProof: false }], timing: { state: "running", startsAt: now().toISOString(), remainingMs: 4 * DAY } });
    expect(active.notices).toContainEqual(expect.objectContaining({ id: `${project.id}:kickoff-pending`, stageId: project.designWorkflowStages![1]!.id }));
    expect((await state())!.stages.client_kickoff?.requestedAt).toBeUndefined();
    await expect(act("client", "client_kickoff_schedule", { scheduledAt: new Date(BASE + 9 * DAY).toISOString() })).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    advance(7); await act("client", "client_kickoff_complete", { reviewedDocumentEventId: active.projectStages![1]!.operational!.submittedDocument!.eventId });
    const closed = await view();
    expect(closed.projectStages![1]!.operational).toMatchObject({ status: "completed", availableActions: [], timing: { state: "completed", remainingMs: 3 * DAY, endsAt: now().toISOString() } });
    expect(closed.projectStages![2]!.operational!.availableActions).toContainEqual(expect.objectContaining({ id: "keys_handed_over", actor: "client" }));
    expect(closed.notices).not.toContainEqual(expect.objectContaining({ id: `${project.id}:kickoff-pending` }));
    expect(closed.notices).toContainEqual(expect.objectContaining({ id: `${project.id}:kickoff-complete` }));
    expect((await state())!.history.at(-1)).toMatchObject({ action: "client_kickoff_complete", actorId: users.client!.id, actorRole: "client", onBehalfOfClient: false, proof: null });
    advance(12);
    expect((await view()).projectStages![1]!.operational!.timing.remainingMs).toBe(3 * DAY);
  });

  it.each(["admin", "super_admin"])("requires evidence and records %s completion on behalf of Client", async (role) => {
    const { act, state, repository, project, users, now, finishInternal } = setup();
    await act("super_admin", "confirm_initial_payment"); await finishInternal();
    const view = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users[role]!, project.id);
    expect(view.projectStages![1]!.operational!.availableActions).toContainEqual({ id: "client_kickoff_complete", label: "Complete Client Kick off", actor: "client", requiresProof: true });
    const before = await state();
    await expect(act(role, "client_kickoff_complete")).rejects.toMatchObject({ code: "WORKFLOW_PROOF_REQUIRED" });
    expect(await state()).toEqual(before);
    await act(role, "client_kickoff_complete", { reviewedDocumentEventId: view.projectStages![1]!.operational!.submittedDocument!.eventId }, document);
    expect((await state())!.history.at(-1)).toMatchObject({ actorId: users[role]!.id, actorRole: role, action: "client_kickoff_complete", onBehalfOfClient: true, proof: document });
    expect(await repository.listAuditEvents({})).toContainEqual(expect.objectContaining({ actorId: users[role]!.id, newValues: expect.objectContaining({ action: "client_kickoff_complete", onBehalfOfClient: true, proofAvailable: true }) }));
  });

  it("keeps Designer coordination but rejects fresh Designer and unrelated Client completion", async () => {
    const { act, state, repository, project, users, now, finishInternal } = setup();
    await act("super_admin", "confirm_initial_payment"); await finishInternal();
    const designerView = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.designer!, project.id);
    expect(designerView.projectStages![1]!.operational!.availableActions.map((action) => action.id)).toEqual(["client_kickoff_request", "client_kickoff_not_required"]);
    const before = await state();
    await expect(act("designer", "client_kickoff_complete")).rejects.toMatchObject({ status: 403 });
    await expect(act("outsider", "client_kickoff_complete")).rejects.toMatchObject({ status: 404 });
    expect(await state()).toEqual(before);
    await expect(act("designer", "client_kickoff_not_required", {}, null, "")).rejects.toMatchObject({ code: "WORKFLOW_NOTE_REQUIRED" });
    await act("designer", "client_kickoff_not_required", {}, null, "Client already briefed during the initial visit");
    expect((await state())!.stages.client_kickoff).toMatchObject({ notRequired: true, completedAt: now().toISOString() });
  });

  it("keeps Client completion atomic, versioned and idempotent", async () => {
    const { act, state, repository, project, users, now, finishInternal, service } = setup();
    await act("super_admin", "confirm_initial_payment"); await finishInternal();
    const before = (await state())!;
    const input: WorkflowActionInput = { action: "client_kickoff_complete", stageId: project.designWorkflowStages![1]!.id, expectedVersion: before.version, idempotencyKey: "client-kickoff-complete", data: { reviewedDocumentEventId: before.history.find((event) => event.action === "internal_kickoff_complete")!.id }, note: "Kick off completed" };
    const failing = createDesignWorkflowStateService(repository, { ...createAuditService(repository), append: async () => { throw new Error("Audit unavailable"); } }, now);
    await expect(failing.act(users.client!, project.id, input, null)).rejects.toThrow("Audit unavailable");
    expect(await state()).toEqual(before);
    await expect(service.act(users.client!, project.id, { ...input, expectedVersion: 1 }, null)).rejects.toMatchObject({ code: "WORKFLOW_VERSION_CONFLICT" });
    await expect(service.act(users.client!, project.id, input, null)).resolves.toEqual({ version: 3, replayed: false });
    const completed = await state();
    await expect(service.act(users.client!, project.id, input, null)).resolves.toEqual({ version: 3, replayed: true });
    await expect(service.act(users.client!, project.id, { ...input, note: "Changed" }, null)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await state()).toEqual(completed);
  });

  it.each(["designer", "client"] as const)("preserves old %s completion history and its original same-key replay", async (role) => {
    const { act, state, repository, project, users, now, finishInternal, service } = setup();
    await act("super_admin", "confirm_initial_payment"); await finishInternal();
    const legacy = (await state())!;
    const input: WorkflowActionInput = { action: "client_kickoff_complete", stageId: project.designWorkflowStages![1]!.id, expectedVersion: legacy.version, idempotencyKey: "legacy-client-kickoff", data: {}, note: "Historical Designer completion" };
    legacy.stages.client_kickoff = { completedAt: now().toISOString(), timingBasis: "sequential" };
    legacy.history.push({ id: "legacy-client-completion", idempotencyKey: input.idempotencyKey, requestHash: sha256Hex(Buffer.from(JSON.stringify({ action: input.action, stageId: input.stageId, data: input.data, note: input.note }))), action: input.action, stageId: input.stageId!, actorId: users[role]!.id, actorName: users[role]!.name, actorRole: role, onBehalfOfClient: false, at: now().toISOString(), note: input.note, data: { timingBasis: "sequential" }, proof: null });
    const before = await repository.saveDesignWorkflowState(project.id, legacy.version, legacy);
    await expect(service.act(users[role]!, project.id, input, null)).resolves.toEqual({ version: before.version, replayed: true });
    const view = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.client!, project.id);
    expect(view.projectStages![1]!.operational).toMatchObject({ status: "completed", availableActions: [] });
    expect(await state()).toEqual(before);
  });

  it.each(["designer", "estimator_sales", "design_manager", "client", "admin", "super_admin"])("shows the saved Internal attachment to an authorized %s in Internal Kick off", async (role) => {
    const { act, state, repository, project, users, now, finishInternal, service, advance } = setup();
    await act("super_admin", "confirm_initial_payment"); await finishInternal();
    const before = (await state())!;
    const event = before.history.find((item) => item.action === "internal_kickoff_complete")!;
    advance(8);
    const view = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users[role]!, project.id);
    expect(view.projectStages![0]!.operational).toMatchObject({ status: "completed", submittedDocument: { eventId: event.id, filename: document.originalFilename, mimeType: document.mimeType, uploadedAt: event.at } });
    expect(Object.keys(view.projectStages![0]!.operational!.submittedDocument!).sort()).toEqual(["eventId", "filename", "mimeType", "uploadedAt"]);
    if (["designer", "estimator_sales", "design_manager"].includes(role)) expect(view.projectStages![1]!.operational).not.toHaveProperty("submittedDocument");
    for (const stage of view.projectStages!.slice(2)) expect(stage.operational).not.toHaveProperty("submittedDocument");
    await expect(service.proof(users[role]!, project.id, event.id)).resolves.toEqual(document);
    expect(JSON.stringify(view)).not.toContain(document.storageReference);
    expect(JSON.stringify(view)).not.toContain(document.sha256);
    expect(await state()).toEqual(before);
  });

  it("withholds Internal attachment metadata without proof-reader capability or the matching stage", async () => {
    const { act, state, project, users, now, finishInternal } = setup();
    await act("super_admin", "confirm_initial_payment"); await finishInternal();
    const saved = (await state())!;
    const stage = project.designWorkflowStages![0]!;
    const context = { paymentStatus: "received" as const, projectId: project.id, internalKickoffStageId: stage.id };
    const noProofReader = { designer: false, client: false, sales: false, finance: false, representative: false, manager: false };
    for (const capabilities of [noProofReader, { ...noProofReader, finance: true }, { ...noProofReader, representative: true }]) {
      expect(projectOperationalStage(stage, saved, capabilities, now(), users.finance_head!.id, undefined, context)).not.toHaveProperty("submittedDocument");
    }
    const designer = { ...noProofReader, designer: true };
    expect(projectOperationalStage({ ...stage, id: "another-internal-stage" }, saved, designer, now(), users.designer!.id, undefined, context)).not.toHaveProperty("submittedDocument");
    expect(projectOperationalStage(stage, saved, designer, now(), users.designer!.id)).not.toHaveProperty("submittedDocument");
    expect(projectOperationalStage(stage, { ...saved, projectId: "foreign-project" }, designer, now(), users.designer!.id, undefined, context)).not.toHaveProperty("submittedDocument");
  });

  it("exposes the committed Internal document to the linked Client without exposing internal notes or storage", async () => {
    const { act, state, repository, project, users, now, finishInternal, service } = setup();
    await act("super_admin", "confirm_initial_payment"); await finishInternal();
    const before = (await state())!;
    const event = before.history.find((item) => item.action === "internal_kickoff_complete")!;
    const view = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.client!, project.id);
    expect(view.projectStages![0]!.operational!.submittedDocument).toEqual({ eventId: event.id, filename: document.originalFilename, mimeType: document.mimeType, uploadedAt: event.at });
    expect(view.projectStages![1]!.operational!.submittedDocument).toEqual({ eventId: event.id, filename: document.originalFilename, mimeType: document.mimeType, uploadedAt: event.at });
    expect(view.projectStages![0]!.operational!.history[0]).toMatchObject({ id: event.id, note: "", proofAvailable: true });
    expect(JSON.stringify(view)).not.toContain(document.storageReference);
    expect(JSON.stringify(view)).not.toContain(document.sha256);
    await expect(service.proof(users.client!, project.id, event.id)).resolves.toEqual(document);
    await expect(service.proof(users.outsider!, project.id, event.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.proof(users.client!, "another-project", event.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.proof(users.client!, project.id, "another-project-event")).rejects.toMatchObject({ status: 404 });
    expect(await state()).toEqual(before);
    await act("client", "client_kickoff_complete", { reviewedDocumentEventId: event.id });
    expect((await state())!.history.at(-1)).toMatchObject({ data: { reviewedDocumentEventId: event.id, completedAt: now().toISOString() } });
    expect(await repository.listAuditEvents({})).toContainEqual(expect.objectContaining({ newValues: expect.objectContaining({ action: "client_kickoff_complete", reviewedDocumentEventId: event.id }) }));
  });

  it.each([{}, { reviewedDocumentEventId: "" }, { reviewedDocumentEventId: "another-document" }, { reviewedDocumentEventId: true }])("requires confirmation of the actual submitted document: %j", async (data) => {
    const { act, state, finishInternal, repository } = setup();
    await act("super_admin", "confirm_initial_payment"); await finishInternal();
    const before = await state();
    const audit = await repository.listAuditEvents({});
    await expect(act("client", "client_kickoff_complete", data)).rejects.toMatchObject({ code: "KICKOFF_DOCUMENT_REVIEW_REQUIRED" });
    expect(await state()).toEqual(before);
    expect(await repository.listAuditEvents({})).toEqual(audit);
  });

  it.each(["stage", "timestamp", "proof", "duplicate", "actor"])("does not expose or accept an Internal document with a mismatched %s", async (condition) => {
    const { act, state, repository, project, users, now, finishInternal, service } = setup();
    await act("super_admin", "confirm_initial_payment"); await finishInternal();
    const malformed = (await state())!;
    const event = malformed.history.find((item) => item.action === "internal_kickoff_complete")!;
    if (condition === "stage") event.stageId = "another-internal-stage";
    if (condition === "timestamp") event.at = new Date(BASE + 1).toISOString();
    if (condition === "proof") event.proof = null;
    if (condition === "duplicate") malformed.history.push({ ...event, id: "duplicate-proof-event", idempotencyKey: "duplicate-proof-key" });
    if (condition === "actor") event.actorRole = "client";
    const before = await repository.saveDesignWorkflowState(project.id, malformed.version, malformed);
    const view = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.client!, project.id);
    expect(view.projectStages![0]!.operational).not.toHaveProperty("submittedDocument");
    expect(view.projectStages![1]!.operational).not.toHaveProperty("submittedDocument");
    const designerView = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.designer!, project.id);
    expect(designerView.projectStages![0]!.operational).not.toHaveProperty("submittedDocument");
    expect(view.projectStages![1]!.operational!.availableActions).toContainEqual(expect.objectContaining({ id: "client_kickoff_complete", disabledReason: expect.stringContaining("document is unavailable") }));
    await expect(service.proof(users.client!, project.id, event.id)).rejects.toMatchObject({ status: 404 });
    await expect(act("client", "client_kickoff_complete", { reviewedDocumentEventId: event.id })).rejects.toMatchObject({ code: "KICKOFF_DOCUMENT_UNAVAILABLE" });
    expect(await state()).toEqual(before);
  });

  it("rejects foreign state and a legacy completion without a committed proof while preserving saved history", async () => {
    const { act, state, repository, project, users, now, finishInternal, service } = setup();
    await act("super_admin", "confirm_initial_payment"); await finishInternal();
    const saved = (await state())!;
    const event = saved.history.find((item) => item.action === "internal_kickoff_complete")!;
    const foreign = { ...saved, projectId: "foreign-project" };
    const context = { paymentStatus: "received" as const, projectId: project.id, internalKickoffStageId: project.designWorkflowStages![0]!.id };
    expect(projectOperationalStage(project.designWorkflowStages![1]!, foreign, { client: true, designer: false, sales: false, finance: false, representative: false, manager: false }, now(), users.client!.id, undefined, context)).not.toHaveProperty("submittedDocument");
    const read = vi.spyOn(repository, "findDesignWorkflowState").mockResolvedValue(foreign);
    await expect(service.proof(users.client!, project.id, event.id)).rejects.toMatchObject({ status: 404 });
    read.mockRestore();
    saved.history = saved.history.filter((item) => item.id !== event.id);
    const before = await repository.saveDesignWorkflowState(project.id, saved.version, saved);
    const view = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.client!, project.id);
    expect(view.projectStages![1]!.operational!.availableActions).toContainEqual(expect.objectContaining({ id: "client_kickoff_complete", disabledReason: expect.stringContaining("document is unavailable") }));
    await expect(act("client", "client_kickoff_complete", { reviewedDocumentEventId: event.id })).rejects.toMatchObject({ code: "KICKOFF_DOCUMENT_UNAVAILABLE" });
    expect(await state()).toEqual(before);
  });

  it("starts Client kickoff after Internal completion and transfers clock responsibility after four stage days", async () => {
    const { act, advance, state, project, users, now, finishInternal } = setup();
    await act("finance_head", "confirm_initial_payment");
    advance(3); await finishInternal();
    await act("designer", "client_kickoff_request", { preferredAt: new Date(BASE + 4 * DAY).toISOString() });
    await act("client", "client_kickoff_schedule", { scheduledAt: new Date(BASE + 9 * DAY).toISOString() });
    advance(8);
    const dto = projectOperationalStage(project.designWorkflowStages![1]!, (await state())!, { designer: true, client: false, sales: false, finance: false, representative: false, manager: false }, now(), users.designer!.id);
    expect(dto.timing).toMatchObject({ clockOwner: "Client", designerElapsedMs: 4 * DAY, clientElapsedMs: DAY, band: "Yellow" });
    await act("client", "client_kickoff_complete", { reviewedDocumentEventId: (await state())!.history.find((event) => event.action === "internal_kickoff_complete")!.id });
  });
  it("requires two different-role key confirmations after both kickoffs", async () => {
    const { act, advance, state, openKeys } = setup();
    await act("finance_head", "confirm_initial_payment"); advance(2); await openKeys();
    await act("client", "keys_handed_over");
    expect((await state())!.stages.key_collection!.completedAt).toBeUndefined();
    await expect(act("client", "keys_received")).rejects.toMatchObject({ status: 403 });
    await act("designer", "keys_received");
    expect((await state())!.stages.key_collection!.completedAt).toBeTruthy();
  });
  it("requires proof for Sales Manager Client actions and keeps the actual actor in history", async () => {
    const { act, advance, state, openKeys } = setup();
    await act("finance_head", "confirm_initial_payment"); advance(2); await openKeys();
    await expect(act("admin", "keys_handed_over")).rejects.toMatchObject({ code: "WORKFLOW_PROOF_REQUIRED" });
    await act("admin", "keys_handed_over", {}, document);
    expect((await state())!.history.at(-1)).toMatchObject({ actorRole: "admin", onBehalfOfClient: true, proof: document });
  });
  it("pauses the active Measurement clock and preserves its original SLA target", async () => {
    const { act, advance, state, project, users, now, openMeasurement } = setup();
    await act("finance_head", "confirm_initial_payment"); advance(2); await openMeasurement();
    await act("client", "measurement_access_block"); advance(4);
    let dto = projectOperationalStage(project.designWorkflowStages![3]!, (await state())!, { designer: true, client: false, sales: false, finance: false, representative: false, manager: false }, now(), users.designer!.id);
    expect(dto.timing).toMatchObject({ state: "paused", remainingMs: 6 * DAY, originalTargetAt: new Date(BASE + 8 * DAY).toISOString(), targetAt: new Date(BASE + 10 * DAY).toISOString() });
    await act("client", "measurement_access_restore"); advance(5);
    dto = projectOperationalStage(project.designWorkflowStages![3]!, (await state())!, { designer: true, client: false, sales: false, finance: false, representative: false, manager: false }, now(), users.designer!.id);
    expect(dto.timing).toMatchObject({ remainingMs: 5 * DAY, band: "On track" });
  });
  it("assigns measurement only within the project team and requires the assigned Designer's sketch and HTTPS folder", async () => {
    const { act, users, advance, state, openMeasurement } = setup();
    await act("finance_head", "confirm_initial_payment"); await openMeasurement();
    await expect(act("designer", "measurement_assign", { designerId: users.estimator_sales!.id })).rejects.toMatchObject({ status: 400 });
    await act("designer", "measurement_assign", { designerId: users.designer!.id });
    advance(3);
    await expect(act("designer", "measurement_complete", { mediaFolderUrl: "http://example.test/photos" }, document)).rejects.toMatchObject({ code: "INVALID_MEDIA_FOLDER" });
    await act("designer", "measurement_complete", { mediaFolderUrl: "https://example.test/photos" }, document);
    expect((await state())!.stages.site_measurement!.completedAt).toBeTruthy();
  });
  it("supports an explicit no-existing-furniture declaration only after Client acceptance", async () => {
    const { act, advance, state, openFurniture } = setup();
    await act("finance_head", "confirm_initial_payment"); advance(2);
    await openFurniture();
    await act("designer", "furniture_scope", { rooms: [], notApplicable: true });
    expect((await state())!.stages.existing_furniture_dimensions!.completedAt).toBeUndefined();
    await act("client", "furniture_accept");
    expect((await state())!.stages.existing_furniture_dimensions!.completedAt).toBeTruthy();
    await expect(act("designer", "furniture_scope", { rooms: [], notApplicable: true })).rejects.toMatchObject({ status: 409 });
  });
  it("keeps proof references internal and exposes workflow actions to assigned Sales only", async () => {
    const { act, repository, users, project, advance } = setup();
    await act("finance_head", "confirm_initial_payment"); advance(2);
    await act("designer", "internal_kickoff_complete", { designHandoverAcknowledged: true, meetingAt: new Date(BASE).toISOString() }, document);
    const projects = createProjectService(repository, createAuditService(repository), () => new Date(BASE + 2 * DAY));
    const clientView = await projects.designWorkflow(users.client!, project.id);
    expect(JSON.stringify(clientView)).not.toContain(document.storageReference);
    expect(clientView.projectStages![0]!.operational!.history[0]!).toMatchObject({ proofAvailable: true, note: "" });
    expect((await projects.designWorkflow(users.estimator_sales!, project.id)).projectStages![0]!.operational!.availableActions).toContainEqual(expect.objectContaining({ id: "sales_calendar_accept" }));
  });
  it("rejects valid unrelated clients from state and proof access without writes", async () => {
    const { act, service, users, project, state } = setup();
    await act("finance_head", "confirm_initial_payment");
    const before = await state();
    await expect(service.preflight(users.outsider!, project.id)).rejects.toMatchObject({ status: 404 });
    await expect(service.proof(users.outsider!, project.id, before!.history[0]!.id)).rejects.toMatchObject({ status: 404 });
    expect(await state()).toEqual(before);
  });
  it("pins canonical rooms, requires Client acceptance, records dimensions and permits explicit selected-room proceeding", async () => {
    const { act, advance, state, openFurniture } = setup(true);
    await act("finance_head", "confirm_initial_payment"); advance(2);
    await openFurniture();
    await expect(act("designer", "furniture_scope", { rooms: [{ id: "foreign-room", required: true }] })).rejects.toMatchObject({ code: "INVALID_FURNITURE_ROOMS" });
    await act("designer", "furniture_scope", { rooms: [{ id: "room-living", required: true }, { id: "room-bedroom", required: true }] });
    await expect(act("client", "furniture_upload", { roomIds: ["room-living"] }, document)).rejects.toMatchObject({ status: 409 });
    await act("client", "furniture_accept");
    await act("client", "furniture_upload", { roomIds: ["room-living"] }, document);
    expect((await state())!.stages.existing_furniture_dimensions!.completedAt).toBeUndefined();
    expect(workflowSubmissionBlockers((await state())!, ["room-living"])).toEqual([]);
    expect(workflowSubmissionBlockers((await state())!, ["room-bedroom"])).toContain("Existing-furniture dimensions are still required for the selected rooms.");
    await expect(act("client", "furniture_proceed", { roomIds: ["room-living"] }, null, "Already ready")).rejects.toMatchObject({ code: "INVALID_FURNITURE_ROOMS" });
    await act("client", "furniture_proceed", { roomIds: ["room-bedroom"] }, null, "Proceed with the selected room; missing dimensions affect its layout.");
    const furniture = (await state())!.stages.existing_furniture_dimensions!;
    expect(furniture).toMatchObject({ scopeEstimateId: "workflow-approved-estimate", scopeEstimateVersion: 3, completedAt: expect.any(String) });
    expect(furniture.rooms).toMatchObject([{ id: "room-living", uploadedAt: expect.any(String), proceed: false }, { id: "room-bedroom", uploadedAt: null, proceed: true }]);
    const completedAt = furniture.completedAt;
    expect(workflowSubmissionBlockers((await state())!, ["room-living"])).toEqual([]);
    advance(3); await act("client", "furniture_upload", { roomIds: ["room-bedroom"] }, document);
    expect((await state())!.stages.existing_furniture_dimensions).toMatchObject({ completedAt, rooms: [{ id: "room-living" }, { id: "room-bedroom", uploadedAt: expect.any(String), proceed: true }] });
  });
  it("does not charge pre-request delay to the Client after a late kickoff request", async () => {
    const { act, advance, state, project, users, now, finishInternal } = setup();
    await act("finance_head", "confirm_initial_payment"); await finishInternal(); advance(8);
    await act("designer", "client_kickoff_request", { preferredAt: new Date(BASE + 9 * DAY).toISOString() });
    await act("client", "client_kickoff_schedule", { scheduledAt: new Date(BASE + 9 * DAY).toISOString() }); advance(8.5);
    const dto = projectOperationalStage(project.designWorkflowStages![1]!, (await state())!, { designer: true, client: false, sales: false, finance: false, representative: false, manager: false }, now(), users.designer!.id);
    expect(dto.timing).toMatchObject({ designerElapsedMs: 8 * DAY, clientElapsedMs: 0.5 * DAY });
  });
  it("keeps a Client date inside the pause-adjusted allowance in the Designer bucket", async () => {
    const { act, advance, state, project, users, now, finishInternal, legacyPause } = setup();
    await act("finance_head", "confirm_initial_payment"); await finishInternal(); advance(3);
    await act("designer", "client_kickoff_request", { preferredAt: new Date(BASE + 5 * DAY).toISOString() });
    await act("client", "client_kickoff_schedule", { scheduledAt: new Date(BASE + 5 * DAY).toISOString() });
    await legacyPause(); advance(6);
    await act("client", "measurement_access_restore"); advance(7.5);
    const dto = projectOperationalStage(project.designWorkflowStages![1]!, (await state())!, { designer: true, client: false, sales: false, finance: false, representative: false, manager: false }, now(), users.designer!.id);
    expect(dto.timing).toMatchObject({ clockOwner: "Designer", clientElapsedMs: 0 });
  });

  it("activates one stage at a time with a fresh allowance after delayed predecessors and both key confirmations", async () => {
    const { act, state, repository, users, project, now, advance, finishInternal } = setup();
    const projects = createProjectService(repository, createAuditService(repository), now);
    const view = () => projects.designWorkflow(users.designer!, project.id);
    const runningTypes = async () => (await view()).projectStages!.filter((stage) => stage.operational!.timing.state === "running").map((stage) => stage.type);
    await act("super_admin", "confirm_initial_payment"); advance(20);
    expect(await runningTypes()).toEqual(["internal_kickoff"]);
    const waiting = (await view()).projectStages!.filter((stage) => ["client_kickoff", "site_measurement"].includes(stage.type));
    for (const stage of waiting) expect(stage.operational).toMatchObject({ status: "not_started", availableActions: [], timing: { state: "waiting", startsAt: null, targetAt: null, originalTargetAt: null, remainingMs: null, band: null, clockOwner: null } });
    expect((await projects.designWorkflow(users.client!, project.id)).notices).not.toContainEqual(expect.objectContaining({ id: `${project.id}:key-handover` }));
    for (const [role, action] of [["designer", "client_kickoff_not_required"], ["client", "keys_handed_over"], ["designer", "keys_received"], ["designer", "measurement_assign"], ["client", "measurement_access_block"], ["designer", "furniture_scope"]] as const) await expect(act(role, action)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    await finishInternal();
    expect(await runningTypes()).toEqual(["client_kickoff"]);
    expect((await view()).projectStages![1]!.operational!.timing).toMatchObject({ startsAt: now().toISOString(), originalTargetAt: new Date(BASE + 24 * DAY).toISOString(), remainingMs: 4 * DAY });
    await act("estimator_sales", "sales_calendar_accept");
    advance(25); await act("designer", "client_kickoff_not_required");
    expect(await runningTypes()).toEqual([]);
    expect((await projects.designWorkflow(users.client!, project.id)).notices).toContainEqual(expect.objectContaining({ id: `${project.id}:key-handover` }));
    await act("designer", "keys_received");
    expect((await view()).projectStages![3]!.operational!.timing.remainingMs).toBeNull();
    await expect(act("designer", "measurement_assign", { designerId: users.designer!.id })).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    advance(40); await act("client", "keys_handed_over");
    expect(await runningTypes()).toEqual(["site_measurement"]);
    expect((await view()).projectStages![3]!.operational!.timing).toMatchObject({ startsAt: now().toISOString(), remainingMs: 6 * DAY, originalTargetAt: new Date(BASE + 46 * DAY).toISOString() });
    await act("designer", "measurement_assign", { designerId: users.designer!.id });
    advance(41); await act("designer", "measurement_complete", { mediaFolderUrl: "https://example.test/photos" }, document);
    expect(await runningTypes()).toEqual([]);
    expect((await view()).projectStages![4]!.operational).toMatchObject({ status: "in_progress", timing: { state: "not_applicable", startsAt: now().toISOString(), remainingMs: null } });
    expect((await view()).projectStages![3]!.operational!.timing).toMatchObject({ state: "completed", startsAt: new Date(BASE + 40 * DAY).toISOString(), originalTargetAt: new Date(BASE + 46 * DAY).toISOString(), remainingMs: 5 * DAY, designerElapsedMs: DAY });
    expect((await state())!.stages.site_measurement).toMatchObject({ timingBasis: "sequential", completedAt: now().toISOString() });
    expect((await state())!.history.at(-1)!.data).toMatchObject({ timingBasis: "sequential" });
  });

  it("clips pause time to the new stage start and anchors manager reminders to that stage", async () => {
    const { act, state, repository, users, project, now, advance, finishInternal, legacyPause } = setup();
    await act("super_admin", "confirm_initial_payment"); advance(1); await legacyPause();
    advance(3); await act("client", "measurement_access_restore");
    advance(4); await legacyPause(); advance(5); await finishInternal();
    const dto = async () => projectOperationalStage(project.designWorkflowStages![1]!, (await state())!, { designer: true, client: false, sales: false, finance: false, representative: false, manager: true }, now(), users.designer!.id);
    advance(7);
    expect((await dto()).timing).toMatchObject({ state: "paused", startsAt: new Date(BASE + 5 * DAY).toISOString(), originalTargetAt: new Date(BASE + 9 * DAY).toISOString(), targetAt: new Date(BASE + 11 * DAY).toISOString(), remainingMs: 4 * DAY, designerElapsedMs: 0 });
    expect((await dto()).reminders).toEqual([]);
    // Restore remains reachable while Measurement is still a future stage.
    const clientView = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.client!, project.id);
    expect(clientView.projectStages![3]!.operational!.availableActions).toContainEqual(expect.objectContaining({ id: "measurement_access_restore" }));
    await act("client", "measurement_access_restore"); advance(9);
    expect((await dto()).timing).toMatchObject({ remainingMs: 2 * DAY, designerElapsedMs: 2 * DAY, targetAt: new Date(BASE + 11 * DAY).toISOString() });
    expect((await dto()).reminders).toEqual([]);
    advance(10);
    expect((await dto()).reminders).toContainEqual(expect.objectContaining({ dueAt: now().toISOString(), label: "Stage approaches Yellow in one day" }));
    advance(11.25);
    expect((await dto()).reminders).toContainEqual(expect.objectContaining({ dueAt: now().toISOString(), label: "Stage SLA needs attention" }));
  });

  it.each([2, 8])("preserves legacy completed timing and history with Internal completion on day %s", (internalDay) => {
    const { project, users } = setup();
    const saved = emptyDesignWorkflowState(project.id);
    saved.initialPaymentAt = new Date(BASE).toISOString();
    saved.stages.internal_kickoff = { completedAt: new Date(BASE + internalDay * DAY).toISOString() };
    saved.stages.client_kickoff = { completedAt: new Date(BASE + 5 * DAY).toISOString(), requestedAt: new Date(BASE + 3 * DAY).toISOString(), scheduledAt: new Date(BASE + 6 * DAY).toISOString() };
    const before = structuredClone(saved);
    const dto = projectOperationalStage(project.designWorkflowStages![1]!, saved, { designer: true, client: false, sales: false, finance: false, representative: false, manager: false }, new Date(BASE + 20 * DAY), users.designer!.id);
    expect(dto).toMatchObject({ status: "completed", availableActions: [], timing: { state: "completed", startsAt: new Date(BASE + 3 * DAY).toISOString(), originalTargetAt: new Date(BASE + 4 * DAY).toISOString(), targetAt: new Date(BASE + 4 * DAY).toISOString(), endsAt: new Date(BASE + 5 * DAY).toISOString(), designerElapsedMs: DAY, clientElapsedMs: DAY } });
    expect(saved).toEqual(before);
  });

  it("does not invent a clock for key collection, furniture or the unspecified sixth stage", () => {
    const { project, users } = setup();
    for (const stage of [project.designWorkflowStages![2]!, project.designWorkflowStages![4]!, project.designWorkflowStages![5]!]) {
      const dto = projectOperationalStage(stage, emptyDesignWorkflowState(project.id), { designer: true, client: false, sales: false, finance: false, representative: false, manager: false }, new Date(BASE), users.designer!.id);
      expect(dto.timing.targetAt).toBeNull();
      expect(dto.timing.remainingMs).toBeNull();
      expect(dto.timing.slaAllowanceMs).toBeNull();
    }
  });
});

describe("workflow HTTP evidence", () => {
  async function httpSetup(openKeyStage = true) {
    const setupValue = setup();
    const { service, users } = setupValue;
    const saved = new Map<string, Buffer>();
    let saves = 0;
    const storage = createEstimateClientReviewStorage({ save: async ({ data }) => { const reference = `proof-${++saves}`; saved.set(reference, data); return { reference }; }, saveGenerated: async () => { throw new Error("not used"); }, read: async (reference) => saved.get(reference)!, delete: async (reference) => { saved.delete(reference); }, open: async () => { throw new Error("not used"); } });
    const app = express(); app.use(express.json());
    app.use(createDesignWorkflowStateRouter({ authenticate: async (token: string) => Object.values(users).find((user) => user.id === token)! } as unknown as AuthService, service, storage, 1024 * 1024));
    app.use(errorHandler);
    await setupValue.act("finance_head", "confirm_initial_payment"); setupValue.advance(2);
    if (openKeyStage) await setupValue.openKeys();
    return { ...setupValue, app, saved, saves: () => saves };
  }
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  it("serves the exact submitted kickoff image privately to its Client and rejects changed bytes", async () => {
    const { app, users, project, saved, state, now, repository } = await httpSetup(false);
    await request(app).post(`/projects/${project.id}/design-workflow/actions`).set("Authorization", `Bearer ${users.designer!.id}`)
      .field("expectedVersion", "1").field("action", "internal_kickoff_complete").field("stageId", project.designWorkflowStages![0]!.id)
      .field("idempotencyKey", "http-internal-document").field("data", JSON.stringify({ designHandoverAcknowledged: true, meetingAt: now().toISOString() }))
      .field("note", "Private internal meeting note").attach("file", jpg, { filename: "kickoff-checklist.jpg", contentType: "image/jpeg" }).expect(200);
    const view = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.client!, project.id);
    const submitted = view.projectStages![1]!.operational!.submittedDocument!;
    expect(submitted).toMatchObject({ filename: "kickoff-checklist.jpg", mimeType: "image/jpeg" });
    expect(JSON.stringify(view)).not.toContain("Private internal meeting note");
    const path = `/projects/${project.id}/design-workflow/history/${submitted.eventId}/proof`;
    const downloaded = await request(app).get(path).set("Authorization", `Bearer ${users.client!.id}`).expect(200);
    expect(downloaded.body).toEqual(jpg);
    expect(downloaded.headers).toMatchObject({ "content-type": "image/jpeg", "cache-control": "private, no-store", "x-content-type-options": "nosniff" });
    expect(downloaded.headers["content-disposition"]).toContain("kickoff-checklist.jpg");
    await request(app).get(path).expect(401);
    await request(app).get(path).set("Authorization", `Bearer ${users.outsider!.id}`).expect(404);
    const before = (await state())!;
    const proof = before.history.find((event) => event.id === submitted.eventId)!.proof!;
    saved.set(proof.storageReference, Buffer.alloc(jpg.length, 0));
    const changedHash = await request(app).get(path).set("Authorization", `Bearer ${users.client!.id}`).expect(409);
    expect(changedHash.body.error.code).toBe("WORKFLOW_PROOF_CHANGED");
    saved.set(proof.storageReference, jpg.subarray(0, 3));
    const changedLength = await request(app).get(path).set("Authorization", `Bearer ${users.client!.id}`).expect(409);
    expect(changedLength.body.error.code).toBe("WORKFLOW_PROOF_CHANGED");
    expect(await state()).toEqual(before);
  });
  it("keeps one evidence file for identical retries, downloads it privately and blocks unrelated readers", async () => {
    const { app, users, project, saved, state } = await httpSetup();
    const path = `/projects/${project.id}/design-workflow/actions`;
    const send = () => request(app).post(path).set("Authorization", `Bearer ${users.admin!.id}`).field("expectedVersion", "3").field("action", "keys_handed_over").field("stageId", project.designWorkflowStages![2]!.id).field("idempotencyKey", "http-key-handover").field("data", "{}").field("note", "Client confirmation received").attach("file", jpg, { filename: "proof.jpg", contentType: "image/jpeg" });
    await send().expect(200); await send().expect(200);
    expect(saved.size).toBe(1);
    expect((await state())!.history.filter((event) => event.action === "keys_handed_over")).toHaveLength(1);
    const event = (await state())!.history.at(-1)!;
    const download = await request(app).get(`/projects/${project.id}/design-workflow/history/${event.id}/proof`).set("Authorization", `Bearer ${users.client!.id}`).expect(200);
    expect(download.headers["cache-control"]).toBe("private, no-store");
    await request(app).get(`/projects/${project.id}/design-workflow/history/${event.id}/proof`).set("Authorization", `Bearer ${users.outsider!.id}`).expect(404);
  });
  it("cleans a stored file on stale-version rejection and rejects foreign uploads before storage", async () => {
    const { app, users, project, saved, saves } = await httpSetup();
    const send = (user: PublicUser) => request(app).post(`/projects/${project.id}/design-workflow/actions`).set("Authorization", `Bearer ${user.id}`).field("expectedVersion", "0").field("action", "keys_handed_over").field("stageId", project.designWorkflowStages![2]!.id).field("idempotencyKey", "http-stale-handover").field("data", "{}").attach("file", jpg, { filename: "proof.jpg", contentType: "image/jpeg" });
    await send(users.outsider!).expect(404); expect(saves()).toBe(0);
    await send(users.admin!).expect(409); expect(saved.size).toBe(0); expect(saves()).toBe(1);
  });
});
