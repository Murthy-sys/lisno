import express from "express";
import request from "supertest";
import { errorHandler } from "../src/middleware/errors.js";
import { createDesignWorkflowStateRouter } from "../src/routes/design-workflow-state.js";
import { createWorkflowEvidenceStorage } from "../src/services/workflow-evidence-storage.js";
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
const media = { id: "site-photo", storageReference: "opaque-site-photo", originalFilename: "site.png", mimeType: "image/png", byteSize: 12, sha256: sha256Hex(Buffer.from("site-photo")), kind: "image" as const };
const document = { storageReference: "opaque-test-file", originalFilename: "signed.pdf", mimeType: "application/pdf" as const, byteSize: 5, sha256: sha256Hex(Buffer.from("proof")) };
const furnitureItem = { estimateItemId: "room-living-item", length: 2100, width: 900, height: 850, uomId: "uom-mm" };
const dimensionsData = (...roomIds: string[]) => ({ rooms: roomIds.map((roomId) => ({ roomId, items: [{ ...furnitureItem, estimateItemId: `${roomId}-item` }] })) });
const savedFurnitureItem = (roomId: string) => ({ ...furnitureItem, id: `${roomId}-item`, estimateItemId: `${roomId}-item`, name: "CUSTOM — Existing item", unit: "mm", uomName: "Millimetre" });
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
  seed.estimateSummaries.at(-1)!.lineItems = ["room-living", "room-bedroom"].map((id, index) => ({ id: `${id}-item`, catalogueId: "CUSTOM", roomName: index === 0 ? "Living room" : "Bedroom", specification: "Existing item", unit: "nos", quantity: index + 1, included: true }));
  const baseClient = seed.users.find((user) => user.role === "client")!;
  const outsider = { ...baseClient, id: "workflow-outsider-client", email: "outsider@example.test", emailNormalized: "outsider@example.test" };
  seed.users.push(outsider);
  users.outsider = { id: outsider.id, name: outsider.name, email: outsider.email, role: outsider.role };
  seed.knowledgeUoms = [{ id: "uom-mm", code: "mm", name: "Millimetre", decimalScale: 0, status: "active", displayOrder: 0, dependencyEpoch: 0, version: 1, createdById: users.super_admin!.id, updatedById: users.super_admin!.id, createdAt: new Date(BASE).toISOString(), updatedAt: new Date(BASE).toISOString() }];
  configure?.(seed);
  const repository = createMemoryRepository(seed);
  let now = BASE;
  let sequence = 0;
  const service = createDesignWorkflowStateService(repository, createAuditService(repository), () => new Date(now));
  const state = () => repository.findDesignWorkflowState(project.id);
  const act = async (role: string, action: WorkflowActionInput["action"], data: Record<string, unknown> = {}, file: typeof document | null = null, note = "Recorded confirmation") => {
    const stageType = action.startsWith("internal") || action.startsWith("sales") ? "internal_kickoff" : action.startsWith("client_kickoff") ? "client_kickoff" : action.startsWith("keys") ? "key_collection" : action.startsWith("measurement") ? "site_measurement" : "existing_furniture_dimensions";
    return service.act(users[role]!, project.id, { expectedVersion: (await state())?.version ?? 0, idempotencyKey: `action-key-${++sequence}`, action, ...(action === "confirm_initial_payment" ? {} : { stageId: project.designWorkflowStages!.find((stage) => stage.type === stageType)!.id }), data, note }, file, action === "measurement_complete" ? [media] : []);
  };
  const finishInternal = () => act("designer", "internal_kickoff_complete", { designHandoverAcknowledged: true, meetingAt: new Date(now).toISOString() }, document);
  const openKeys = async () => { await finishInternal(); await act("designer", "client_kickoff_not_required"); };
  const openMeasurement = async () => { await openKeys(); await act("client", "keys_handed_over"); await act("designer", "keys_received"); };
  const openFurniture = async () => { await openMeasurement(); await act("designer", "measurement_assign", { designerId: users.designer!.id }); await act("designer", "measurement_complete", {}, null); };
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
  it("assigns measurement only within the project team and requires the assigned Designer’s media and makes sketch optional", async () => {
    const { act, users, advance, state, openMeasurement } = setup();
    await act("finance_head", "confirm_initial_payment"); await openMeasurement();
    await expect(act("designer", "measurement_assign", { designerId: users.estimator_sales!.id })).rejects.toMatchObject({ status: 400 });
    await act("designer", "measurement_assign", { designerId: users.designer!.id });
    advance(3);
    await expect(act("designer", "measurement_complete", { mediaFolderUrl: "http://example.test/photos" }, document)).rejects.toMatchObject({ code: "INVALID_WORKFLOW_ACTION" });
    await act("designer", "measurement_complete", {}, null);
    expect((await state())!.stages.site_measurement!.completedAt).toBeTruthy();
  });
  it.each([
    { name: "no existing furniture", data: { rooms: [], notApplicable: true }, notApplicable: true },
    { name: "no required rooms", data: { rooms: [{ id: "room-living", required: false }, { id: "room-bedroom", required: false }] }, notApplicable: false }
  ])("projects $name as saved until Client acceptance completes the stage", async ({ data, notApplicable }) => {
    const { act, advance, state, openFurniture, repository, users, project, now } = setup();
    const view = () => createProjectService(repository, createAuditService(repository), now).designWorkflow(users.designer!, project.id);
    await act("finance_head", "confirm_initial_payment"); advance(2);
    await openFurniture();
    await act("designer", "furniture_scope", data);
    expect((await state())!.stages.existing_furniture_dimensions!.completedAt).toBeUndefined();
    const saved = (await view()).projectStages![4]!;
    expect(saved).toMatchObject({ status: "in_progress", operational: {
      status: "in_progress", furniture: { phase: "awaiting_client_acceptance", notApplicable, requiredRoomCount: 0, readyRoomCount: 0, pendingRoomCount: 0 },
      availableActions: [{ id: "furniture_scope", label: "Edit furniture requirements", actor: "designer", requiresProof: false }]
    } });
    expect(workflowSubmissionBlockers((await state())!)).toContain("Declare existing-furniture applicability and obtain Client acceptance.");
    expect((await view()).projectStages![4]).toEqual(saved);
    await act("client", "furniture_accept");
    expect((await state())!.stages.existing_furniture_dimensions!.completedAt).toBeTruthy();
    expect((await view()).projectStages![4]).toMatchObject({ status: "completed", progress: 100, operational: {
      availableActions: [], furniture: { phase: "completed", notApplicable, requiredRoomCount: 0, readyRoomCount: 0, pendingRoomCount: 0 }
    } });
    expect(workflowSubmissionBlockers((await state())!)).toEqual([]);
    await expect(act("designer", "furniture_scope", data)).rejects.toMatchObject({ status: 409 });
  });
  it("projects saved requirements, Client acceptance and asymmetric room readiness without changing completion gates", async () => {
    const { act, advance, state, openFurniture, repository, users, project, now } = setup(true, (seed) => {
      seed.estimateSummaries!.find((estimate) => estimate.id === "workflow-approved-estimate")!.rooms!.push({ id: "room-study", label: "Study" });
    });
    const view = (role = "designer") => createProjectService(repository, createAuditService(repository), now).designWorkflow(users[role]!, project.id);
    const furnitureView = async (role = "designer") => (await view(role)).projectStages![4]!.operational!;
    await act("finance_head", "confirm_initial_payment"); await openFurniture();
    expect(await furnitureView()).toMatchObject({ furniture: { phase: "requirements_pending", notApplicable: false, requiredRoomCount: 0, readyRoomCount: 0, pendingRoomCount: 0 }, availableActions: [{ id: "furniture_scope", label: "Declare existing-furniture requirements" }] });
    const rooms = [{ id: "room-living", required: true }, { id: "room-bedroom", required: true }, { id: "room-study", required: false }];
    await act("designer", "furniture_scope", { rooms });
    expect(await furnitureView()).toMatchObject({ status: "in_progress", furniture: { phase: "awaiting_client_acceptance", notApplicable: false, requiredRoomCount: 2, readyRoomCount: 0, pendingRoomCount: 2 }, availableActions: [{ id: "furniture_scope", label: "Edit furniture requirements" }] });
    expect((await furnitureView("client")).availableActions).toEqual([{ id: "furniture_accept", label: "Accept furniture requirements", actor: "client", requiresProof: false }, { id: "furniture_scope_return", label: "Send back requirements", actor: "client", requiresProof: false }]);
    expect((await furnitureView("super_admin")).availableActions.every((action) => action.requiresProof && action.actor === "client")).toBe(true);
    expect((await furnitureView("estimator_sales")).availableActions).toEqual([]);
    await expect(act("client", "furniture_scope", { rooms })).rejects.toMatchObject({ status: 403 });
    await expect(act("designer", "furniture_accept")).rejects.toMatchObject({ status: 403 });
    await act("designer", "furniture_scope", { rooms });
    const savedState = await state();
    const savedProjection = await furnitureView();
    expect(await furnitureView()).toEqual(savedProjection);
    expect(await state()).toEqual(savedState);
    expect((await view()).projectStages!.filter((stage) => stage.type !== "existing_furniture_dimensions").every((stage) => !Object.hasOwn(stage.operational!, "furniture"))).toBe(true);

    await act("client", "furniture_accept");
    expect(await furnitureView()).toMatchObject({ status: "in_progress", availableActions: [{ id: "furniture_upload", actor: "designer" }], furniture: { phase: "awaiting_dimensions", requiredRoomCount: 2, readyRoomCount: 0, pendingRoomCount: 2 } });
    expect((await furnitureView("client")).availableActions.map((action) => action.id)).toEqual(["furniture_upload"]);
    await expect(act("designer", "furniture_scope", { rooms })).rejects.toMatchObject({ status: 409 });
    advance(1); await act("client", "furniture_upload", dimensionsData("room-living"), document);
    expect(await furnitureView()).toMatchObject({ furniture: { phase: "awaiting_dimension_approval", readyRoomCount: 0, pendingRoomCount: 2 } });
    const livingSubmission = (await state())!.stages.existing_furniture_dimensions!.rooms![0]!.dimensions!.submissionEventId;
    await act("client", "furniture_dimensions_approve", { submissions: [{ roomId: "room-living", submissionEventId: livingSubmission }] });
    expect(await furnitureView()).toMatchObject({ status: "in_progress", furniture: { phase: "awaiting_dimensions", requiredRoomCount: 2, readyRoomCount: 1, pendingRoomCount: 1 } });
    expect(workflowSubmissionBlockers((await state())!, ["room-living", "room-study"])).toEqual([]);
    expect(workflowSubmissionBlockers((await state())!, ["room-bedroom"])).toContain("Client approval of existing-furniture dimensions is still required for the selected rooms.");
    expect((await state())!.stages.existing_furniture_dimensions!.completedAt).toBeUndefined();

    advance(2); await expect(act("client", "furniture_proceed", { roomIds: ["room-bedroom"] })).rejects.toMatchObject({ status: 409 });
    await act("designer", "furniture_upload", dimensionsData("room-bedroom"), document);
    const bedroomSubmission = (await state())!.stages.existing_furniture_dimensions!.rooms![1]!.dimensions!.submissionEventId;
    await act("client", "furniture_dimensions_approve", { submissions: [{ roomId: "room-bedroom", submissionEventId: bedroomSubmission }] });
    const completedAt = (await state())!.stages.existing_furniture_dimensions!.completedAt;
    const completed = await furnitureView();
    expect(completed).toMatchObject({ status: "completed", availableActions: [], timing: { endsAt: completedAt }, furniture: { phase: "completed", requiredRoomCount: 2, readyRoomCount: 2, pendingRoomCount: 0 } });
    expect(await furnitureView()).toEqual(completed);
    expect(workflowSubmissionBlockers((await state())!)).toEqual([]);
    expect((await furnitureView("client")).availableActions).toEqual([]);
    advance(3); await expect(act("client", "furniture_upload", dimensionsData("room-bedroom"), document)).rejects.toMatchObject({ status: 409 });
    expect(await furnitureView()).toMatchObject({ status: "completed", timing: { endsAt: completedAt }, furniture: completed.furniture });
  });
  it("keeps furniture phase separate from prerequisite and pause status and prevents editing completed legacy scope", async () => {
    const { act, state, openFurniture, project, users, now } = setup();
    await act("finance_head", "confirm_initial_payment"); await openFurniture();
    await act("designer", "furniture_scope", { rooms: [], notApplicable: true });
    const saved = (await state())!;
    const projectFurniture = (value: typeof saved) => projectOperationalStage(project.designWorkflowStages![4]!, value, { designer: true, client: false, sales: false, finance: false, representative: false, manager: false }, now(), users.designer!.id);
    const missingPrerequisite = structuredClone(saved);
    delete missingPrerequisite.stages.site_measurement!.completedAt;
    expect(projectFurniture(missingPrerequisite)).toMatchObject({ status: "not_started", availableActions: [], furniture: { phase: "awaiting_client_acceptance" }, blockingReasons: ["Complete On Site Actual Measurement before starting this stage."] });
    const paused = structuredClone(saved);
    paused.pauses.push({ startedAt: now().toISOString(), endedAt: null });
    expect(projectFurniture(paused)).toMatchObject({ status: "blocked", timing: { state: "paused" }, furniture: { phase: "awaiting_client_acceptance" }, blockingReasons: ["Site access is unavailable. All workflow clocks are paused."] });
    const legacyCompleted = structuredClone(saved);
    legacyCompleted.stages.existing_furniture_dimensions!.completedAt = now().toISOString();
    expect(projectFurniture(legacyCompleted)).toMatchObject({ status: "completed", availableActions: [], furniture: { phase: "completed" } });
  });
  it("curates Client furniture-review evidence from the committed measurement and latest requirements only", async () => {
    const { act, state, openMeasurement, repository, service, project, users, now } = setup();
    await act("finance_head", "confirm_initial_payment"); await openMeasurement();
    await act("designer", "measurement_assign", { designerId: users.designer!.id });
    const sketch = { ...document, originalFilename: "as-built-sketch.pdf" };
    const oldRequirements = { ...document, originalFilename: "superseded-requirements.pdf" };
    const requirements = { ...document, originalFilename: "current-requirements.pdf" };
    await act("designer", "measurement_complete", {}, sketch);
    await act("designer", "furniture_scope", { rooms: [], notApplicable: true }, oldRequirements);
    await act("designer", "furniture_scope", { rooms: [], notApplicable: true }, requirements);
    const before = (await state())!;
    const measurement = before.history.find((event) => event.action === "measurement_complete")!;
    const declaration = before.history.at(-1)!;
    const projects = createProjectService(repository, createAuditService(repository), now);
    for (const role of ["client", "designer", "estimator_sales", "super_admin"]) {
      const view = await projects.designWorkflow(users[role]!, project.id);
      expect(view.projectStages![4]!.operational!.furniture).toMatchObject({ phase: "awaiting_client_acceptance", evidence: [
        { eventId: measurement.id, filename: sketch.originalFilename, mimeType: sketch.mimeType, byteSize: sketch.byteSize, source: "site_measurement" },
        { eventId: measurement.id, mediaId: media.id, filename: media.originalFilename, mimeType: media.mimeType, byteSize: media.byteSize, source: "site_measurement" },
        { eventId: declaration.id, filename: requirements.originalFilename, mimeType: requirements.mimeType, byteSize: requirements.byteSize, source: "furniture_requirements" }
      ] });
      expect(JSON.stringify(view.projectStages![4]!.operational!.furniture)).not.toMatch(/superseded-requirements|signed\.pdf|storageReference|sha256|opaque-/);
      expect(view.projectStages!.filter((stage) => stage.type !== "existing_furniture_dimensions").every((stage) => !stage.operational!.furniture)).toBe(true);
    }
    await expect(service.proof(users.client!, project.id, measurement.id)).resolves.toEqual(sketch);
    await expect(service.media(users.client!, project.id, measurement.id, media.id)).resolves.toEqual(media);
    await expect(service.proof(users.client!, project.id, declaration.id)).resolves.toEqual(requirements);
    for (const role of ["outsider", "finance_head"]) {
      await expect(projects.designWorkflow(users[role]!, project.id)).rejects.toMatchObject({ status: 404 });
      await expect(service.proof(users[role]!, project.id, declaration.id)).rejects.toMatchObject({ status: 404 });
      await expect(service.media(users[role]!, project.id, measurement.id, media.id)).rejects.toMatchObject({ status: 404 });
    }
    await expect(projects.designWorkflow(users.client!, "foreign-project")).rejects.toMatchObject({ status: 404 });
    expect(await state()).toEqual(before);
  });
  it("does not reuse a superseded declaration proof when the latest furniture requirements have no file", async () => {
    const { act, state, openFurniture, repository, project, users, now } = setup();
    await act("finance_head", "confirm_initial_payment"); await openFurniture();
    await act("designer", "furniture_scope", { rooms: [], notApplicable: true }, document);
    await act("designer", "furniture_scope", { rooms: [], notApplicable: true });
    const measurement = (await state())!.history.find((event) => event.action === "measurement_complete")!;
    const view = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.client!, project.id);
    expect(view.projectStages![4]!.operational!.furniture!.evidence).toEqual([
      { eventId: measurement.id, mediaId: media.id, filename: media.originalFilename, mimeType: media.mimeType, byteSize: media.byteSize, source: "site_measurement" }
    ]);
  });
  it.each(["stage", "timestamp", "duplicate", "actor", "on-behalf", "uncommitted", "missing-event"])("withholds furniture-review measurement evidence with %s lineage", async (condition) => {
    const { act, state, openFurniture, repository, project, users, now } = setup();
    await act("finance_head", "confirm_initial_payment"); await openFurniture();
    await act("designer", "furniture_scope", { rooms: [], notApplicable: true });
    const saved = (await state())!;
    const event = saved.history.find((event) => event.action === "measurement_complete")!;
    event.proof = document;
    if (condition === "stage") event.stageId = project.designWorkflowStages![0]!.id;
    if (condition === "timestamp") event.at = new Date(BASE - 1).toISOString();
    if (condition === "duplicate") saved.history.push({ ...event, id: "duplicate-measurement", idempotencyKey: "duplicate-measurement" });
    if (condition === "actor") event.actorRole = "client";
    if (condition === "on-behalf") event.onBehalfOfClient = true;
    if (condition === "uncommitted") delete saved.stages.site_measurement!.completedAt;
    if (condition === "missing-event") saved.history = saved.history.filter((entry) => entry.id !== event.id);
    await repository.saveDesignWorkflowState(project.id, saved.version, saved);
    const view = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.client!, project.id);
    expect(view.projectStages![4]!.operational!.furniture!.evidence).toEqual([]);
  });
  it("omits furniture-review evidence without proof access or matching project context and keeps legacy empty evidence safe", async () => {
    const { act, state, openFurniture, project, users, now } = setup();
    await act("finance_head", "confirm_initial_payment"); await openFurniture();
    await act("designer", "furniture_scope", { rooms: [], notApplicable: true }, document);
    const saved = (await state())!;
    const stage = project.designWorkflowStages![4]!;
    const context = { paymentStatus: "received" as const, projectId: project.id, measurementStageId: project.designWorkflowStages![3]!.id };
    const noReader = { designer: false, client: false, sales: false, finance: false, representative: false, manager: false };
    for (const capabilities of [noReader, { ...noReader, finance: true }, { ...noReader, representative: true }]) {
      expect(projectOperationalStage(stage, saved, capabilities, now(), users.finance_head!.id, undefined, context).furniture).not.toHaveProperty("evidence");
    }
    const client = { ...noReader, client: true };
    expect(projectOperationalStage(stage, saved, client, now(), users.client!.id).furniture).not.toHaveProperty("evidence");
    expect(projectOperationalStage(stage, { ...saved, projectId: "foreign-project" }, client, now(), users.client!.id, undefined, context).furniture).not.toHaveProperty("evidence");
    expect(projectOperationalStage({ ...stage, id: "foreign-furniture-stage" }, saved, client, now(), users.client!.id, undefined, { ...context, measurementStageId: undefined }).furniture!.evidence).toEqual([]);
    const legacy = structuredClone(saved);
    legacy.history = [];
    legacy.stages.site_measurement!.mediaFolderUrl = "https://legacy.example.test/folder";
    expect(projectOperationalStage(stage, legacy, client, now(), users.client!.id, undefined, context).furniture).toMatchObject({ phase: "awaiting_client_acceptance", evidence: [] });
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
  it("pins canonical rooms, requires Client acceptance and keeps dimensions revisions pending until approved", async () => {
    const { act, advance, state, openFurniture } = setup(true);
    await act("finance_head", "confirm_initial_payment"); advance(2);
    await openFurniture();
    await expect(act("designer", "furniture_scope", { rooms: [{ id: "foreign-room", required: true }] })).rejects.toMatchObject({ code: "INVALID_FURNITURE_ROOMS" });
    await act("designer", "furniture_scope", { rooms: [{ id: "room-living", required: true }, { id: "room-bedroom", required: true }] });
    await expect(act("client", "furniture_upload", { roomIds: ["room-living"] }, document)).rejects.toMatchObject({ status: 409 });
    await act("client", "furniture_accept");
    await act("client", "furniture_upload", dimensionsData("room-living"), document);
    expect((await state())!.stages.existing_furniture_dimensions!.completedAt).toBeUndefined();
    expect(workflowSubmissionBlockers((await state())!, ["room-living"])).toContain("Client approval of existing-furniture dimensions is still required for the selected rooms.");
    const living = (await state())!.stages.existing_furniture_dimensions!.rooms![0]!.dimensions!;
    await act("client", "furniture_dimensions_approve", { submissions: [{ roomId: "room-living", submissionEventId: living.submissionEventId }] });
    expect(workflowSubmissionBlockers((await state())!, ["room-living"])).toEqual([]);
    await expect(act("client", "furniture_proceed", { roomIds: ["room-bedroom"] })).rejects.toMatchObject({ status: 409 });
    await act("designer", "furniture_upload", dimensionsData("room-bedroom"), document);
    const bedroom = (await state())!.stages.existing_furniture_dimensions!.rooms![1]!.dimensions!;
    await act("client", "furniture_dimensions_approve", { submissions: [{ roomId: "room-bedroom", submissionEventId: bedroom.submissionEventId }] });
    const furniture = (await state())!.stages.existing_furniture_dimensions!;
    expect(furniture).toMatchObject({ scopeEstimateId: "workflow-approved-estimate", scopeEstimateVersion: 3, completedAt: expect.any(String) });
    expect(furniture.rooms).toMatchObject([{ id: "room-living", dimensions: { status: "approved" } }, { id: "room-bedroom", dimensions: { status: "approved" } }]);
    const completedAt = furniture.completedAt;
    expect(workflowSubmissionBlockers((await state())!, ["room-living"])).toEqual([]);
    advance(3); await expect(act("client", "furniture_upload", dimensionsData("room-bedroom"), document)).rejects.toMatchObject({ status: 409 });
    expect((await state())!.stages.existing_furniture_dimensions).toMatchObject({ completedAt });
  });
  it("requires a Client return reason and Designer resubmission before scope acceptance", async () => {
    const { act, state, openFurniture, repository, project, users, now } = setup();
    await act("finance_head", "confirm_initial_payment"); await openFurniture();
    const scope = { rooms: [{ id: "room-living", required: true }, { id: "room-bedroom", required: false }] };
    await act("designer", "furniture_scope", scope);
    const before = await state();
    await expect(act("client", "furniture_scope_return", {}, null, "")).rejects.toMatchObject({ code: "WORKFLOW_NOTE_REQUIRED" });
    await expect(act("designer", "furniture_scope_return")).rejects.toMatchObject({ status: 403 });
    await expect(act("admin", "furniture_scope_return")).rejects.toMatchObject({ code: "WORKFLOW_PROOF_REQUIRED" });
    expect(await state()).toEqual(before);
    await act("client", "furniture_scope_return", {}, null, "The bedroom also has existing furniture.");
    const view = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.client!, project.id);
    expect(view.projectStages![4]!.operational).toMatchObject({ availableActions: [], furniture: { phase: "requirements_changes_requested", scopeReturn: { reason: "The bedroom also has existing furniture.", at: now().toISOString() } }, rooms: [{ id: "room-living", required: true }, { id: "room-bedroom", required: false }] });
    await expect(act("client", "furniture_accept")).rejects.toMatchObject({ status: 409 });
    await act("designer", "furniture_scope", { rooms: scope.rooms.map(room => ({ ...room, required: true })) });
    expect((await state())!.stages.existing_furniture_dimensions).not.toHaveProperty("scopeReturn");
    await act("client", "furniture_accept");
    expect((await state())!.history.some(event => event.action === "furniture_scope_return" && event.note === "The bedroom also has existing furniture.")).toBe(true);
  });
  it("returns selected dimension revisions, resubmits with new lineage and approves only current immutable rows", async () => {
    const { act, state, openFurniture, repository, project, users, now } = setup();
    await act("finance_head", "confirm_initial_payment"); await openFurniture();
    await act("designer", "furniture_scope", { rooms: [{ id: "room-living", required: true }, { id: "room-bedroom", required: true }] });
    await act("client", "furniture_accept");
    await act("designer", "furniture_upload", dimensionsData("room-living", "room-bedroom"), document);
    const original = (await state())!.history.at(-1)!;
    const review = (roomId: string, submissionEventId = original.id) => ({ submissions: [{ roomId, submissionEventId }] });
    expect((await state())!.stages.existing_furniture_dimensions!.rooms!.map(room => room.dimensions)).toEqual(["room-living", "room-bedroom"].map(roomId => ({ submissionEventId: original.id, revision: 1, status: "pending", items: [savedFurnitureItem(roomId)], submittedAt: now().toISOString() })));
    const view = () => createProjectService(repository, createAuditService(repository), now).designWorkflow(users.client!, project.id);
    expect((await view()).projectStages![4]!.operational!.furniture).toMatchObject({ phase: "awaiting_dimension_approval", readyRoomCount: 0 });
    expect((await view()).projectStages![4]!.operational!.furniture!.evidence!.filter(file => file.source === "furniture_dimensions")).toHaveLength(1);
    await expect(act("client", "furniture_upload", dimensionsData("room-living"), document)).rejects.toMatchObject({ status: 409 });
    await expect(act("designer", "furniture_dimensions_approve", review("room-living"))).rejects.toMatchObject({ status: 403 });
    await expect(act("client", "furniture_dimensions_return", review("room-living"), null, "")).rejects.toMatchObject({ code: "WORKFLOW_NOTE_REQUIRED" });
    await act("client", "furniture_dimensions_return", review("room-living"), null, "Measure the sofa width again.");
    expect((await view()).projectStages![4]!.operational!.furniture!.phase).toBe("dimension_changes_requested");
    expect((await state())!.stages.existing_furniture_dimensions!.rooms![0]!.dimensions).toMatchObject({ status: "changes_requested", returnReason: "Measure the sofa width again.", items: [savedFurnitureItem("room-living")] });
    await act("client", "furniture_dimensions_approve", review("room-bedroom"));
    await expect(act("designer", "furniture_upload", dimensionsData("room-bedroom"), document)).rejects.toMatchObject({ status: 409 });
    const corrected = dimensionsData("room-living"); corrected.rooms[0]!.items[0]!.width = 950;
    await act("client", "furniture_upload", corrected, { ...document, originalFilename: "corrected.pdf" });
    const latest = (await state())!.history.at(-1)!;
    expect(latest.id).not.toBe(original.id);
    expect((await state())!.stages.existing_furniture_dimensions!.rooms![0]!.dimensions).toMatchObject({ submissionEventId: latest.id, revision: 2, status: "pending", items: [{ width: 950 }] });
    expect((await state())!.history.find(event => event.id === original.id)).toEqual(original);
    await expect(act("client", "furniture_dimensions_approve", review("room-living"))).rejects.toMatchObject({ status: 409 });
    await act("client", "furniture_dimensions_approve", review("room-living", latest.id));
    const completed = await state();
    expect((await view()).projectStages![4]!.operational!.furniture).toMatchObject({ phase: "completed", readyRoomCount: 2, pendingRoomCount: 0 });
    await expect(act("client", "furniture_dimensions_return", review("room-bedroom"))).rejects.toMatchObject({ status: 409 });
    expect(await state()).toEqual(completed);
  });
  it.each([
    { roomIds: ["room-living"] },
    { rooms: [] },
    { rooms: [{ roomId: "foreign-room", items: [furnitureItem] }] },
    { rooms: [{ roomId: "room-bedroom", items: [furnitureItem] }] },
    dimensionsData("room-living", "room-living"),
    { rooms: [{ roomId: "room-living", items: [] }] },
    { rooms: [{ roomId: "room-living", items: [furnitureItem, furnitureItem] }] },
    ...[{ length: 0 }, { width: -1 }, { height: Infinity }, { length: NaN }, { unit: "pixels" }, { name: " " }, { id: "" }, { width: "20" }].map(change => ({ rooms: [{ roomId: "room-living", items: [{ ...furnitureItem, ...change }] }] }))
  ])("rejects malformed dimensions without workflow or audit writes: %j", async data => {
    const { act, state, openFurniture, repository } = setup();
    await act("finance_head", "confirm_initial_payment"); await openFurniture();
    await act("designer", "furniture_scope", { rooms: [{ id: "room-living", required: true }, { id: "room-bedroom", required: false }] }); await act("client", "furniture_accept");
    const before = await state(); const audit = await repository.listAuditEvents({});
    await expect(act("designer", "furniture_upload", data, document)).rejects.toMatchObject({ status: 400 });
    expect(await state()).toEqual(before); expect(await repository.listAuditEvents({})).toEqual(audit);
  });
  it("preserves upload idempotency, version conflicts, representative proof and pinned source checks", async () => {
    const { act, state, openFurniture, service, repository, project, users } = setup();
    await act("finance_head", "confirm_initial_payment"); await openFurniture();
    await act("designer", "furniture_scope", { rooms: [{ id: "room-living", required: true }, { id: "room-bedroom", required: true }] }); await act("client", "furniture_accept");
    const input: WorkflowActionInput = { action: "furniture_upload", expectedVersion: (await state())!.version, idempotencyKey: "dimensions-stable-key", stageId: project.designWorkflowStages![4]!.id, data: dimensionsData("room-living"), note: "Measured sofa" };
    await expect(service.act(users.designer!, project.id, input, null)).rejects.toMatchObject({ code: "WORKFLOW_PROOF_REQUIRED" });
    for (const role of ["estimator_sales", "finance_head", "outsider"]) await expect(service.act(users[role]!, project.id, input, document)).rejects.toMatchObject({ status: role === "outsider" ? 404 : 403 });
    await service.act(users.designer!, project.id, input, document);
    const saved = (await state())!;
    await expect(service.act(users.designer!, project.id, input, document)).resolves.toMatchObject({ replayed: true, version: saved.version });
    expect(await state()).toEqual(saved);
    await expect(service.act(users.designer!, project.id, { ...input, idempotencyKey: "dimensions-stale-key", data: dimensionsData("room-bedroom") }, document)).rejects.toMatchObject({ code: "WORKFLOW_VERSION_CONFLICT" });
    await expect(service.act(users.designer!, project.id, { ...input, data: dimensionsData("room-bedroom") }, document)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    const review = { submissions: [{ roomId: "room-living", submissionEventId: saved.history.at(-1)!.id }] };
    await expect(act("admin", "furniture_dimensions_approve", review)).rejects.toMatchObject({ code: "WORKFLOW_PROOF_REQUIRED" });
    await act("admin", "furniture_dimensions_approve", review, document);
    expect((await state())!.history.at(-1)).toMatchObject({ actorId: users.admin!.id, actorRole: "admin", onBehalfOfClient: true, proof: document });
    const stale = (await state())!; stale.stages.existing_furniture_dimensions!.scopeEstimateVersion = 999;
    const before = await repository.saveDesignWorkflowState(project.id, stale.version, stale);
    await expect(act("designer", "furniture_upload", dimensionsData("room-bedroom"), document)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect(await state()).toEqual(before);
  });
  it.each(["snapshot", "stage", "missing-proof", "duplicate", "actor", "timestamp"])("rejects review and curated evidence for a mismatched dimension %s", async condition => {
    const { act, state, openFurniture, repository, project, users, now } = setup();
    await act("finance_head", "confirm_initial_payment"); await openFurniture();
    await act("designer", "furniture_scope", { rooms: [{ id: "room-living", required: true }, { id: "room-bedroom", required: false }] }); await act("client", "furniture_accept");
    await act("designer", "furniture_upload", dimensionsData("room-living"), document);
    const saved = (await state())!; const event = saved.history.at(-1)!;
    if (condition === "snapshot") saved.stages.existing_furniture_dimensions!.rooms![0]!.dimensions!.items[0]!.width = 999;
    if (condition === "stage") event.stageId = "foreign-stage";
    if (condition === "missing-proof") event.proof = null;
    if (condition === "duplicate") saved.history.push({ ...event, idempotencyKey: "duplicate-upload-event" });
    if (condition === "actor") event.actorRole = "estimator_sales";
    if (condition === "timestamp") event.at = new Date(BASE - 1).toISOString();
    const before = await repository.saveDesignWorkflowState(project.id, saved.version, saved);
    const view = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.client!, project.id);
    expect(view.projectStages![4]!.operational!.furniture!.evidence!.some(file => file.source === "furniture_dimensions")).toBe(false);
    await expect(act("client", "furniture_dimensions_approve", { submissions: [{ roomId: "room-living", submissionEventId: event.id }] })).rejects.toMatchObject({ status: 409 });
    expect(await state()).toEqual(before);
    const noReader = { designer: false, client: false, manager: false, sales: false, representative: false, finance: true };
    const privateProjection = projectOperationalStage(project.designWorkflowStages![4]!, before, noReader, now(), users.finance_head!.id, undefined, { paymentStatus: "received", projectId: project.id });
    expect(privateProjection.rooms![0]).not.toHaveProperty("dimensions"); expect(privateProjection.furniture).not.toHaveProperty("evidence");
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
    advance(41); await act("designer", "measurement_complete", {}, null);
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
    const storage = createWorkflowEvidenceStorage({ save: async ({ data }) => { const reference = `proof-${++saves}`; saved.set(reference, data); return { reference }; }, saveGenerated: async () => { throw new Error("not used"); }, read: async (reference) => saved.get(reference)!, delete: async (reference) => { saved.delete(reference); }, open: async () => { throw new Error("not used"); } });
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
  it("compensates rejected dimension files, deduplicates retry proofs and serves current evidence privately", async () => {
    const { app, act, state, openFurniture, project, users, saved, repository } = await httpSetup(false);
    await openFurniture(); await act("designer", "furniture_scope", { rooms: [{ id: "room-living", required: true }, { id: "room-bedroom", required: false }] }); await act("client", "furniture_accept");
    const before = (await state())!; const audit = await repository.listAuditEvents({});
    const send = (data: Record<string, unknown>, key: string) => request(app).post(`/projects/${project.id}/design-workflow/actions`).set("Authorization", `Bearer ${users.designer!.id}`).field("expectedVersion", String(before.version)).field("action", "furniture_upload").field("stageId", project.designWorkflowStages![4]!.id).field("idempotencyKey", key).field("data", JSON.stringify(data)).attach("file", jpg, { filename: "sofa-dimensions.jpg", contentType: "image/jpeg" });
    await send({ roomIds: ["room-living"] }, "invalid-dimension-file").expect(400);
    expect(saved.size).toBe(0); expect(await state()).toEqual(before); expect(await repository.listAuditEvents({})).toEqual(audit);
    const unavailable = dimensionsData("room-living"); unavailable.rooms[0]!.items[0]!.uomId = "missing-uom";
    const failed = await send(unavailable, "unavailable-uom-file").expect(400);
    expect(failed.body.error.code).toBe("FURNITURE_UOM_UNAVAILABLE");
    expect(saved.size).toBe(0); expect(await state()).toEqual(before); expect(await repository.listAuditEvents({})).toEqual(audit);
    await send(dimensionsData("room-living"), "http-dimensions-stable").expect(200);
    await send(dimensionsData("room-living"), "http-dimensions-stable").expect(200);
    expect(saved.size).toBe(1);
    const current = (await state())!; const submission = current.history.at(-1)!;
    expect(current.stages.existing_furniture_dimensions!.rooms![0]!.dimensions).toMatchObject({ submissionEventId: submission.id, status: "pending" });
    const download = await request(app).get(`/projects/${project.id}/design-workflow/history/${submission.id}/proof`).set("Authorization", `Bearer ${users.client!.id}`).expect(200);
    expect(download.headers).toMatchObject({ "content-type": "image/jpeg", "cache-control": "private, no-store" });
    await request(app).post(`/projects/${project.id}/design-workflow/actions`).set("Authorization", `Bearer ${users.client!.id}`).send({ action: "furniture_dimensions_approve", expectedVersion: current.version, stageId: project.designWorkflowStages![4]!.id, idempotencyKey: "http-dimensions-approved", data: { submissions: [{ roomId: "room-living", submissionEventId: submission.id }] } }).expect(200);
    expect((await state())!.stages.existing_furniture_dimensions!.completedAt).toBeTruthy();
  });

  it("cleans rejected combined-scope files and retains only the committed proof through retry and Client review", async () => {
    const f = await httpSetup(false); await f.openFurniture();
    const before = (await f.state())!; const stageId = f.project.designWorkflowStages![4]!.id;
    const payload = { rooms: [{ id: "room-living", required: true }, { id: "room-bedroom", required: false }], dimensions: dimensionsData("room-living").rooms };
    const send = (data: Record<string, unknown>, key: string) => request(f.app).post(`/projects/${f.project.id}/design-workflow/actions`).set("Authorization", `Bearer ${f.users.designer!.id}`).field("expectedVersion", String(before.version)).field("action", "furniture_scope").field("stageId", stageId).field("idempotencyKey", key).field("data", JSON.stringify(data)).attach("file", jpg, { filename: "furniture.jpg", contentType: "image/jpeg" });
    await send({ ...payload, dimensions: [] }, "combined-invalid-file").expect(400);
    expect(f.saved.size).toBe(0); expect(await f.state()).toEqual(before);
    await send(payload, "combined-valid-file").expect(200);
    await send(payload, "combined-valid-file").expect(200);
    expect(f.saved.size).toBe(1);
    const pending = (await f.state())!; const token = pending.stages.existing_furniture_dimensions!.requirementsSubmissionEventId!;
    const path = `/projects/${f.project.id}/design-workflow/history/${token}/proof`;
    const file = await request(f.app).get(path).set("Authorization", `Bearer ${f.users.client!.id}`).expect(200);
    expect(file.body).toEqual(jpg); expect(file.headers["cache-control"]).toBe("private, no-store");
    await request(f.app).get(path).set("Authorization", `Bearer ${f.users.outsider!.id}`).expect(404);
    await request(f.app).post(`/projects/${f.project.id}/design-workflow/actions`).set("Authorization", `Bearer ${f.users.client!.id}`).send({ action: "furniture_accept", expectedVersion: pending.version, stageId, idempotencyKey: "combined-client-accept", data: { submissionEventId: token } }).expect(200);
    expect((await f.state())!.stages.existing_furniture_dimensions!.completedAt).toBeTruthy();
  });

});

describe("estimate-linked furniture dimensions", () => {
  const scope = { rooms: [{ id: "room-living", required: true }, { id: "room-bedroom", required: true }] };
  async function ready(configure?: (seed: SeedData) => void) {
    const fixture = setup(true, configure);
    await fixture.act("finance_head", "confirm_initial_payment");
    await fixture.openFurniture();
    await fixture.act("designer", "furniture_scope", scope);
    await fixture.act("client", "furniture_accept");
    return fixture;
  }
  it.each(["unmapped", "ambiguous"])("keeps payment confirmation independent of %s furniture item mapping", async scenario => {
    const fixture = setup(true, seed => {
      const estimate = seed.estimateSummaries!.find(row => row.id === "workflow-approved-estimate")!;
      if (scenario === "unmapped") estimate.lineItems![0]!.roomName = "Unmapped room";
      else estimate.rooms!.push({ id: "another-living-room", label: "Living room" });
    });
    expect(await fixture.repository.findDesignWorkflowRoomContext(fixture.project.id)).toMatchObject({ estimateId: "workflow-approved-estimate", estimateVersion: 3 });
    await expect(fixture.repository.findDesignWorkflowRoomContext(fixture.project.id, true)).rejects.toThrow();
    await fixture.act("finance_head", "confirm_initial_payment"); await fixture.openFurniture();
    const view = await createProjectService(fixture.repository, createAuditService(fixture.repository), fixture.now).designWorkflow(fixture.users.designer!, fixture.project.id);
    expect(view.initialPayment).toMatchObject({ status: "received" });
    expect(view.furnitureRooms).toEqual([]); expect(view.furnitureScopeIssue).toContain("Reconcile the project approved source");
    const before = await fixture.state(); const audits = await fixture.repository.listAuditEvents({});
    await expect(fixture.act("designer", "furniture_scope", scope)).rejects.toMatchObject({ status: 409 });
    expect(await fixture.state()).toEqual(before); expect(await fixture.repository.listAuditEvents({})).toEqual(audits);
  });
  it("projects only sanitized approved selected items to the linked Client and uses their canonical names", async () => {
    const { act, state, repository, project, users, now } = await ready();
    const view = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.client!, project.id);
    expect(view.furnitureRooms).toEqual([
      { id: "room-living", name: "Living room", estimateItems: [{ id: "room-living-item", name: "CUSTOM — Existing item", catalogueId: "CUSTOM", specification: "Existing item", quantity: 1, uom: "nos", measurementType: "dimensions" }] },
      { id: "room-bedroom", name: "Bedroom", estimateItems: [{ id: "room-bedroom-item", name: "CUSTOM — Existing item", catalogueId: "CUSTOM", specification: "Existing item", quantity: 2, uom: "nos", measurementType: "dimensions" }] }
    ]);
    await expect(createProjectService(repository, createAuditService(repository), now).designWorkflow(users.finance_head!, project.id)).rejects.toMatchObject({ status: 404 });
    await expect(createProjectService(repository, createAuditService(repository), now).designWorkflow(users.outsider!, project.id)).rejects.toMatchObject({ status: 404 });
    await act("designer", "furniture_upload", dimensionsData("room-living"), document);
    const saved = (await state())!;
    expect(saved.stages.existing_furniture_dimensions!.rooms![0]!.dimensions!.items).toEqual([savedFurnitureItem("room-living")]);
    expect(saved.history.at(-1)!.data).toEqual({ rooms: [{ roomId: "room-living", items: [savedFurnitureItem("room-living")] }] });
  });
  it.each(["missing", "foreign", "cross-room", "excluded", "duplicate", "label", "unlinked"])("rejects %s item sets with no workflow or audit writes", async (scenario) => {
    const { act, state, repository } = await ready(seed => {
      const estimate = seed.estimateSummaries!.find(row => row.id === "workflow-approved-estimate")!;
      estimate.lineItems!.push({ ...estimate.lineItems![0]!, id: "second-living-item", quantity: 3 });
      estimate.lineItems!.push({ ...estimate.lineItems![0]!, id: "excluded-item", included: false });
    });
    const items: Array<Record<string, unknown>> = [{ ...furnitureItem }, { ...furnitureItem, estimateItemId: "second-living-item" }];
    if (scenario === "missing") items.pop();
    if (scenario === "foreign") items[1]!.estimateItemId = "another-project-item";
    if (scenario === "cross-room") items[1]!.estimateItemId = "room-bedroom-item";
    if (scenario === "excluded") items[1]!.estimateItemId = "excluded-item";
    if (scenario === "duplicate") items[1]!.estimateItemId = items[0]!.estimateItemId;
    if (scenario === "label") items[0]!.name = "Client supplied label";
    if (scenario === "unlinked") { delete items[0]!.estimateItemId; items[0]!.id = "room-living-item"; items[0]!.name = "Existing item"; }
    const before = await state(); const audits = await repository.listAuditEvents({});
    await expect(act("designer", "furniture_upload", { rooms: [{ roomId: "room-living", items }] }, document)).rejects.toMatchObject({ status: 400 });
    expect(await state()).toEqual(before); expect(await repository.listAuditEvents({})).toEqual(audits);
  });
  it("accepts the complete selected item set in any order and preserves long approved keys", async () => {
    const longId = "a".repeat(500);
    const { act, state } = await ready(seed => {
      const estimate = seed.estimateSummaries!.find(row => row.id === "workflow-approved-estimate")!;
      estimate.lineItems!.push({ ...estimate.lineItems![0]!, id: longId, quantity: 3 });
    });
    await act("designer", "furniture_upload", { rooms: [{ roomId: "room-living", items: [{ ...furnitureItem, estimateItemId: longId }, furnitureItem] }] }, document);
    const event = (await state())!.history.at(-1)!;
    await act("client", "furniture_dimensions_approve", { submissions: [{ roomId: "room-living", submissionEventId: event.id }] });
    expect((await state())!.stages.existing_furniture_dimensions!.rooms![0]!.dimensions).toMatchObject({ status: "approved", items: [{ id: longId, estimateItemId: longId }, { id: "room-living-item" }] });
  });
  it("keeps empty estimate rooms optional and no-furniture completion valid but rejects collecting invented items", async () => {
    const fixture = setup(true, seed => { seed.estimateSummaries!.find(row => row.id === "workflow-approved-estimate")!.lineItems = []; });
    await fixture.act("finance_head", "confirm_initial_payment"); await fixture.openFurniture();
    const before = await fixture.state();
    await expect(fixture.act("designer", "furniture_scope", scope)).rejects.toMatchObject({ code: "INVALID_FURNITURE_ROOMS" });
    expect(await fixture.state()).toEqual(before);
    await fixture.act("designer", "furniture_scope", { rooms: [], notApplicable: true }); await fixture.act("client", "furniture_accept");
    expect((await fixture.state())!.stages.existing_furniture_dimensions!.completedAt).toBeTruthy();
  });
  it("keeps send-back available for an old unaccepted required scope with no selected items", async () => {
    const fixture = setup(true, seed => { seed.estimateSummaries!.find(row => row.id === "workflow-approved-estimate")!.lineItems = []; });
    await fixture.act("finance_head", "confirm_initial_payment"); await fixture.openFurniture();
    await fixture.act("designer", "furniture_scope", { rooms: scope.rooms.map(room => ({ ...room, required: false })) });
    const saved = (await fixture.state())!;
    saved.stages.existing_furniture_dimensions!.rooms![0]!.required = true;
    await fixture.repository.saveDesignWorkflowState(fixture.project.id, saved.version, saved);
    const before = await fixture.state();
    await expect(fixture.act("client", "furniture_accept")).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED", message: expect.stringContaining("Send the furniture requirements back") });
    expect(await fixture.state()).toEqual(before);
    await fixture.act("client", "furniture_scope_return", {}, null, "This room has no selected estimate items.");
    await fixture.act("designer", "furniture_scope", { rooms: scope.rooms.map(room => ({ ...room, required: false })) });
    await fixture.act("client", "furniture_accept");
    expect((await fixture.state())!.stages.existing_furniture_dimensions!.completedAt).toBeTruthy();
  });
  it("requires returning legacy pending rows before linked resubmission, preserving their evidence and already-approved history", async () => {
    const { act, state, repository, project, users, now } = await ready();
    await act("designer", "furniture_upload", dimensionsData("room-living", "room-bedroom"), document);
    const saved = (await state())!;
    const event = saved.history.at(-1)!;
    for (const room of saved.stages.existing_furniture_dimensions!.rooms!) delete room.dimensions!.items[0]!.estimateItemId;
    for (const room of (event.data as { rooms: Array<{ items: Array<{ estimateItemId?: string }> }> }).rooms) delete room.items[0]!.estimateItemId;
    const approvedRoom = saved.stages.existing_furniture_dimensions!.rooms![1]!;
    approvedRoom.dimensions!.status = "approved"; approvedRoom.dimensions!.reviewedAt = now().toISOString();
    await repository.saveDesignWorkflowState(project.id, saved.version, saved);
    const before = await state(); const audits = await repository.listAuditEvents({});
    const review = { submissions: [{ roomId: "room-living", submissionEventId: event.id }] };
    await expect(act("client", "furniture_dimensions_approve", review)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED", message: expect.stringContaining("predate estimate item links") });
    expect(await state()).toEqual(before); expect(await repository.listAuditEvents({})).toEqual(audits);
    const view = await createProjectService(repository, createAuditService(repository), now).designWorkflow(users.client!, project.id);
    expect(view.projectStages![4]!.operational!.furniture).toMatchObject({ readyRoomCount: 1, evidence: expect.arrayContaining([expect.objectContaining({ eventId: event.id, source: "furniture_dimensions" })]) });
    await act("client", "furniture_dimensions_return", review, null, "Please measure the selected estimate items.");
    await act("designer", "furniture_upload", dimensionsData("room-living"), document);
    const next = (await state())!.history.at(-1)!;
    await act("client", "furniture_dimensions_approve", { submissions: [{ roomId: "room-living", submissionEventId: next.id }] });
    const complete = (await state())!;
    expect(complete.stages.existing_furniture_dimensions!.completedAt).toBeTruthy();
    expect(complete.stages.existing_furniture_dimensions!.rooms![1]).toEqual(approvedRoom);
    expect(complete.history.find(row => row.id === event.id)).toEqual(event);
  });
  it.each(["name", "item"])("rechecks %s binding against the approved source even if the current snapshot and history agree", async scenario => {
    const { act, state, repository, project } = await ready();
    await act("designer", "furniture_upload", dimensionsData("room-living"), document);
    const saved = (await state())!; const event = saved.history.at(-1)!;
    const item = saved.stages.existing_furniture_dimensions!.rooms![0]!.dimensions!.items[0]!;
    if (scenario === "name") item.name = "Forged canonical name";
    else { item.id = "room-bedroom-item"; item.estimateItemId = item.id; }
    (event.data as { rooms: Array<{ items: unknown[] }> }).rooms[0]!.items = [structuredClone(item)];
    await repository.saveDesignWorkflowState(project.id, saved.version, saved);
    const before = await state(); const audits = await repository.listAuditEvents({});
    await expect(act("client", "furniture_dimensions_approve", { submissions: [{ roomId: "room-living", submissionEventId: event.id }] })).rejects.toMatchObject({ status: scenario === "name" ? 409 : 400 });
    expect(await state()).toEqual(before); expect(await repository.listAuditEvents({})).toEqual(audits);
    await act("client", "furniture_dimensions_return", { submissions: [{ roomId: "room-living", submissionEventId: event.id }] }, null, "Resubmit approved items.");
  });
});

describe("configured furniture UOMs", () => {
  async function ready(configure?: (seed: SeedData) => void) {
    const fixture = setup(true, configure);
    await fixture.act("finance_head", "confirm_initial_payment"); await fixture.openFurniture();
    await fixture.act("designer", "furniture_scope", { rooms: [{ id: "room-living", required: true }, { id: "room-bedroom", required: false }] });
    await fixture.act("client", "furniture_accept");
    return fixture;
  }
  it.each(["designer", "client", "admin", "super_admin"])("lets the eligible %s add and reuse normalized global units with their actual identity", async role => {
    const f = await ready(seed => {
      const source = seed.projects.find(row => row.id === "project-aurora-villa")!;
      seed.projects.push({ ...source, id: "other-uom-project", designWorkflowStages: createProjectDesignWorkflow("other-uom-project") });
    });
    const before = await f.state(); const audits = await f.repository.listAuditEvents({});
    const created = await f.service.createFurnitureUom(f.users[role]!, f.project.id, { code: "  ＣＭ ", name: " Centi\n metre " });
    expect(created).toMatchObject({ reused: false, uom: { id: expect.any(String), code: "CM", name: "Centi metre", decimalScale: 3 } });
    expect(await f.service.createFurnitureUom(f.users[role]!, f.project.id, { code: "cm", name: "CENTI metre", decimalScale: 0 })).toEqual({ ...created, reused: true });
    expect(await f.service.listFurnitureUoms(f.users.client!, "other-uom-project")).toContainEqual(created.uom);
    expect(await f.state()).toEqual(before);
    const after = await f.repository.listAuditEvents({});
    expect(after).toHaveLength(audits.length + 1);
    expect(after.find(row => row.entityId === created.uom.id)).toMatchObject({ actorId: f.users[role]!.id, action: "ai_estimator_knowledge_master_created", newValues: { source: "furniture_dimensions", projectId: f.project.id } });
  });
  it.each(["finance_head", "estimator_sales", "design_manager", "outsider"])("denies %s unit access and creation without writes", async role => {
    const f = await ready(); const before = await f.repository.listActiveWorkflowUoms(); const audits = await f.repository.listAuditEvents({});
    await expect(f.service.listFurnitureUoms(f.users[role]!, f.project.id)).rejects.toMatchObject({ status: 404 });
    await expect(f.service.createFurnitureUom(f.users[role]!, f.project.id, { code: "CM", name: "Centimetre" })).rejects.toMatchObject({ status: 404 });
    expect(await f.repository.listActiveWorkflowUoms()).toEqual(before); expect(await f.repository.listAuditEvents({})).toEqual(audits);
  });
  it("rejects creation before a required room can receive dimensions and when every room is pending review", async () => {
    const f = setup(); const audits = await f.repository.listAuditEvents({});
    await expect(f.service.createFurnitureUom(f.users.designer!, f.project.id, { code: "CM", name: "Centimetre" })).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect(await f.state()).toBeNull(); expect(await f.repository.listAuditEvents({})).toEqual(audits);
    const pending = await ready(); await pending.act("designer", "furniture_upload", dimensionsData("room-living"), document);
    await expect(pending.service.createFurnitureUom(pending.users.client!, pending.project.id, { code: "CM", name: "Centimetre" })).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
  });
  it.each([{ code: "mm", name: "Different name" }, { code: "different", name: "Millimetre" }])("rejects partial catalog identity conflicts %j", async value => {
    const f = await ready(); const audits = await f.repository.listAuditEvents({});
    await expect(f.service.createFurnitureUom(f.users.client!, f.project.id, value)).rejects.toMatchObject({ code: "FURNITURE_UOM_IDENTITY_CONFLICT" });
    expect(await f.repository.listAuditEvents({})).toEqual(audits);
  });
  it("does not reactivate inactive matches and omits inactive and archived options", async () => {
    const f = await ready(seed => {
      seed.knowledgeUoms!.push({ ...seed.knowledgeUoms![0]!, id: "uom-cm", code: "cm", name: "Centimetre", status: "inactive", displayOrder: 1 });
      seed.knowledgeUoms!.push({ ...seed.knowledgeUoms![0]!, id: "uom-m", code: "m", name: "Metre", status: "archived", displayOrder: 2 });
    });
    expect(await f.service.listFurnitureUoms(f.users.client!, f.project.id)).toEqual([{ id: "uom-mm", code: "mm", name: "Millimetre", decimalScale: 0 }]);
    await expect(f.service.createFurnitureUom(f.users.client!, f.project.id, { code: "CM", name: "Centimetre" })).rejects.toMatchObject({ code: "FURNITURE_UOM_INACTIVE" });
    const created = await f.service.createFurnitureUom(f.users.client!, f.project.id, { code: "m", name: "Metre", decimalScale: 2 });
    expect(created.reused).toBe(false); expect(created.uom.id).not.toBe("uom-m");
  });
  it.each([
    { code: "", name: "Valid" }, { code: "X", name: " " }, { code: "x".repeat(65), name: "Valid" },
    { code: "X", name: "x".repeat(241) }, { code: "X", name: "Valid", decimalScale: 4 },
    { code: "X", name: "Valid", decimalScale: -1 }, { code: "X", name: "Valid", decimalScale: 1.5 },
    { code: "X", name: "Valid", status: "active" }, { code: "X", name: "Valid", projectId: "other-project" }
  ])("rejects invalid or extra UOM fields %j", async value => {
    const f = await ready(); const options = await f.repository.listActiveWorkflowUoms(); const audits = await f.repository.listAuditEvents({});
    await expect(f.service.createFurnitureUom(f.users.client!, f.project.id, value)).rejects.toMatchObject({ code: "INVALID_FURNITURE_UOM" });
    expect(await f.repository.listActiveWorkflowUoms()).toEqual(options); expect(await f.repository.listAuditEvents({})).toEqual(audits);
  });
  it("rolls back global creation and order allocation when its audit fails", async () => {
    const f = await ready(); const before = await f.repository.listActiveWorkflowUoms();
    const failing = createDesignWorkflowStateService(f.repository, { ...createAuditService(f.repository), append: async () => { throw new Error("UOM audit failed"); } }, f.now);
    await expect(failing.createFurnitureUom(f.users.client!, f.project.id, { code: "CM", name: "Centimetre" })).rejects.toThrow("UOM audit failed");
    expect(await f.repository.listActiveWorkflowUoms()).toEqual(before);
  });
  it("deduplicates concurrent creation and snapshots exact measurement precision independently of quantity decimalScale", async () => {
    const f = await ready();
    const results = await Promise.all([f.service.createFurnitureUom(f.users.client!, f.project.id, { code: "M", name: "Metre", decimalScale: 0 }), f.service.createFurnitureUom(f.users.designer!, f.project.id, { code: "m", name: "METRE", decimalScale: 3 })]);
    expect(results.map(row => row.reused).sort()).toEqual([false, true]); expect(results[0]!.uom.id).toBe(results[1]!.uom.id);
    const input = dimensionsData("room-living"); input.rooms[0]!.items[0]!.uomId = results[0]!.uom.id; input.rooms[0]!.items[0]!.length = 1.23456789;
    await f.act("designer", "furniture_upload", input, document);
    expect((await f.state())!.stages.existing_furniture_dimensions!.rooms![0]!.dimensions!.items[0]).toMatchObject({ length: 1.23456789, uomId: results[0]!.uom.id, unit: results[0]!.uom.code, uomName: results[0]!.uom.name });
  });
  it.each(["missing", "inactive", "archived"])("rejects a %s selected UOM without workflow or audit writes", async status => {
    const f = await ready(seed => { if (status !== "missing") seed.knowledgeUoms!.push({ ...seed.knowledgeUoms![0]!, id: "unavailable-uom", status: status as "inactive" | "archived" }); });
    const input = dimensionsData("room-living"); input.rooms[0]!.items[0]!.uomId = "unavailable-uom";
    const before = await f.state(); const audits = await f.repository.listAuditEvents({});
    await expect(f.act("designer", "furniture_upload", input, document)).rejects.toMatchObject({ code: "FURNITURE_UOM_UNAVAILABLE" });
    expect(await f.state()).toEqual(before); expect(await f.repository.listAuditEvents({})).toEqual(audits);
  });
  it("reviews legacy string-unit snapshots without silently assigning a catalog ID", async () => {
    const f = await ready(); await f.act("designer", "furniture_upload", dimensionsData("room-living"), document);
    const saved = (await f.state())!; const event = saved.history.at(-1)!;
    const item = saved.stages.existing_furniture_dimensions!.rooms![0]!.dimensions!.items[0]!;
    delete item.uomId; delete item.uomName;
    (event.data as { rooms: Array<{ items: unknown[] }> }).rooms[0]!.items = [structuredClone(item)];
    await f.repository.saveDesignWorkflowState(f.project.id, saved.version, saved);
    await f.act("client", "furniture_dimensions_approve", { submissions: [{ roomId: "room-living", submissionEventId: event.id }] });
    const complete = (await f.state())!;
    expect(complete.stages.existing_furniture_dimensions!.rooms![0]!.dimensions!.items[0]).toEqual(item);
    expect(complete.history.find(row => row.id === event.id)).toEqual(event);
  });
  it("serves scoped UOM endpoints with private responses, exact duplicate reuse and no Configuration privilege", async () => {
    const f = await ready();
    const app = express(); app.use(express.json());
    app.use(createDesignWorkflowStateRouter({ authenticate: async (token: string) => Object.values(f.users).find(user => user.id === token)! } as unknown as AuthService, f.service, {} as ReturnType<typeof createWorkflowEvidenceStorage>, 1024 * 1024));
    app.use(errorHandler);
    const path = `/projects/${f.project.id}/design-workflow/furniture-uoms`;
    const auth = (role: string) => `Bearer ${f.users[role]!.id}`;
    const options = await request(app).get(path).set("Authorization", auth("client")).expect(200);
    expect(options.body.data).toEqual([{ id: "uom-mm", code: "mm", name: "Millimetre", decimalScale: 0 }]);
    expect(options.headers["cache-control"]).toBe("private, no-store");
    const created = await request(app).post(path).set("Authorization", auth("client")).send({ code: "CM", name: "Centimetre" }).expect(201);
    expect(created.body.data).toMatchObject({ reused: false, uom: { code: "CM", name: "Centimetre", decimalScale: 3 } });
    const reused = await request(app).post(path).set("Authorization", auth("designer")).send({ code: "cm", name: "centimetre", decimalScale: 0 }).expect(200);
    expect(reused.body.data).toEqual({ ...created.body.data, reused: true });
    await request(app).get(path).expect(401);
    await request(app).post(path).set("Authorization", auth("outsider")).send({ code: "X", name: "Denied" }).expect(404);
    await request(app).post(path).set("Authorization", auth("finance_head")).send({ code: "X", name: "Denied" }).expect(404);
    await request(app).post(path).set("Authorization", auth("client")).send({ code: "X", name: "Denied", status: "inactive" }).expect(400);
    await request(app).get("/projects/missing-project/design-workflow/furniture-uoms").set("Authorization", auth("client")).expect(404);
    expect((await f.repository.listActiveWorkflowUoms())).toHaveLength(2);
  });

});

describe("furniture dimensions submitted with requirements", () => {
  const rooms = [{ id: "room-living", required: true }, { id: "room-bedroom", required: true }];
  const data = () => ({ rooms: structuredClone(rooms), dimensions: dimensionsData("room-living", "room-bedroom").rooms });
  async function ready() {
    const f = setup(); await f.act("finance_head", "confirm_initial_payment"); await f.openFurniture(); return f;
  }
  const current = async (f: Awaited<ReturnType<typeof ready>>) => (await f.state())!.stages.existing_furniture_dimensions!;
  it("submits canonical pending dimensions and one protected document, then explicitly approves the whole bundle", async () => {
    const f = await ready(); await f.act("designer", "furniture_scope", data(), document);
    const pending = await current(f); const token = pending.requirementsSubmissionEventId!;
    expect(pending).not.toHaveProperty("acceptedAt"); expect(pending).not.toHaveProperty("completedAt");
    expect(pending.rooms!.map(room => room.dimensions)).toEqual(["room-living", "room-bedroom"].map(roomId => expect.objectContaining({ submissionEventId: token, revision: 1, status: "pending", items: [savedFurnitureItem(roomId)] })));
    const projects = createProjectService(f.repository, createAuditService(f.repository), f.now);
    const view = await projects.designWorkflow(f.users.client!, f.project.id);
    const projected = view.projectStages!.find(stage => stage.type === "existing_furniture_dimensions")!.operational!;
    expect(projected.furniture).toMatchObject({ requirementsSubmissionEventId: token, phase: "awaiting_client_acceptance", readyRoomCount: 0, pendingRoomCount: 2 });
    expect(projected.availableActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "furniture_accept", label: "Approve requirements and dimensions" }),
      expect.objectContaining({ id: "furniture_scope_return", label: "Send back requirements and dimensions" })
    ]));
    expect(projected.furniture!.evidence!.filter(file => file.eventId === token)).toHaveLength(1);
    expect(projected.rooms!.map(room => room.dimensions!.items)).toEqual(pending.rooms!.map(room => room.dimensions!.items));
    expect(await f.service.proof(f.users.client!, f.project.id, token)).toEqual(document);
    await expect(f.service.proof(f.users.outsider!, f.project.id, token)).rejects.toMatchObject({ status: 404 });
    await expect(f.act("designer", "furniture_accept", { submissionEventId: token })).rejects.toMatchObject({ status: 403 });
    await f.act("client", "furniture_accept", { submissionEventId: token });
    const complete = await current(f);
    expect(complete).toMatchObject({ acceptedAt: f.now().toISOString(), completedAt: f.now().toISOString() });
    expect(complete.rooms!.every(room => room.dimensions!.status === "approved")).toBe(true);
    expect(workflowSubmissionBlockers((await f.state())!)).toEqual([]);
    await expect(f.act("designer", "furniture_scope", data(), document)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
  });
  it("returns all measurements, retains history, and requires a fresh token for corrected and pending edits", async () => {
    const f = await ready();
    await f.act("designer", "furniture_scope", data(), document);
    const first = (await f.state())!.history.at(-1)!;
    await expect(f.act("client", "furniture_scope_return", { submissionEventId: first.id }, null, "")).rejects.toMatchObject({ code: "WORKFLOW_NOTE_REQUIRED" });
    await f.act("client", "furniture_scope_return", { submissionEventId: first.id }, null, "Correct the widths");
    expect((await current(f)).rooms!.every(room => room.dimensions!.status === "changes_requested" && room.dimensions!.returnReason === "Correct the widths")).toBe(true);
    expect(await current(f)).toMatchObject({ scopeReturn: { reason: "Correct the widths" } });
    const corrected = data(); corrected.dimensions[0]!.items[0]!.width = 930;
    await f.act("designer", "furniture_scope", corrected, { ...document, storageReference: "corrected-document" });
    expect(await current(f)).not.toHaveProperty("scopeReturn");
    const second = (await current(f)).requirementsSubmissionEventId!;
    expect(second).not.toBe(first.id); expect((await current(f)).rooms![0]!.dimensions!.revision).toBe(2);
    await expect(f.act("client", "furniture_accept", { submissionEventId: first.id })).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    await f.act("designer", "furniture_scope", corrected, document);
    const third = (await current(f)).requirementsSubmissionEventId!;
    expect((await current(f)).rooms![0]!.dimensions!.revision).toBe(3);
    await expect(f.act("client", "furniture_scope_return", { submissionEventId: second })).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    await f.act("client", "furniture_accept", { submissionEventId: third });
    expect((await f.state())!.history.find(event => event.id === first.id)).toEqual(first);
  });
  it.each([{}, { submissionEventId: "foreign-submission" }, { submissionEventId: "", extra: true }])("rejects missing or wrong bundle review tokens %j without writes", async review => {
    const f = await ready(); await f.act("designer", "furniture_scope", data(), document);
    const before = await f.state(); const audits = await f.repository.listAuditEvents({});
    for (const action of ["furniture_accept", "furniture_scope_return"] as const) await expect(f.act("client", action, review)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect(await f.state()).toEqual(before); expect(await f.repository.listAuditEvents({})).toEqual(audits);
  });
  it.each(["missing room", "duplicate room", "optional room", "foreign item", "missing item", "duplicate item", "zero dimension", "inactive uom", "no proof"])("rejects invalid combined %s atomically", async issue => {
    const f = await ready(); const submitted = data(); let proof: typeof document | null = document;
    if (issue === "missing room") submitted.dimensions.pop();
    if (issue === "duplicate room") submitted.dimensions[1]!.roomId = "room-living";
    if (issue === "optional room") submitted.rooms[1]!.required = false;
    if (issue === "foreign item") submitted.dimensions[0]!.items[0]!.estimateItemId = "room-bedroom-item";
    if (issue === "missing item") submitted.dimensions[0]!.items = [];
    if (issue === "duplicate item") submitted.dimensions[0]!.items.push(submitted.dimensions[0]!.items[0]!);
    if (issue === "zero dimension") submitted.dimensions[0]!.items[0]!.length = 0;
    if (issue === "inactive uom") submitted.dimensions[1]!.items[0]!.uomId = "missing-uom";
    if (issue === "no proof") proof = null;
    const before = await f.state(); const audits = await f.repository.listAuditEvents({});
    await expect(f.act("designer", "furniture_scope", submitted, proof)).rejects.toMatchObject({ status: 400 });
    expect(await f.state()).toEqual(before); expect(await f.repository.listAuditEvents({})).toEqual(audits);
  });
  it("prevents scope-only downgrade but allows an explicit no-furniture replacement and later a fresh measured revision", async () => {
    const f = await ready(); await f.act("designer", "furniture_scope", data(), document);
    const first = (await f.state())!.history.at(-1)!;
    await expect(f.act("designer", "furniture_scope", { rooms })).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    await f.act("designer", "furniture_scope", { rooms: [], notApplicable: true });
    expect(await current(f)).toMatchObject({ noExistingFurniture: true, rooms: [] });
    expect(await current(f)).not.toHaveProperty("requirementsSubmissionEventId"); expect(await current(f)).not.toHaveProperty("completedAt");
    await f.act("designer", "furniture_scope", data(), document);
    expect((await current(f)).rooms![0]!.dimensions!.revision).toBe(2);
    expect((await f.state())!.history.find(event => event.id === first.id)).toEqual(first);
  });
  it("upgrades returned legacy scope directly to measured requirements and retains legacy no-furniture confirmation", async () => {
    const f = await ready(); await f.act("designer", "furniture_scope", { rooms });
    const legacyView = await createProjectService(f.repository, createAuditService(f.repository), f.now).designWorkflow(f.users.client!, f.project.id);
    expect(legacyView.projectStages!.find(stage => stage.type === "existing_furniture_dimensions")!.operational!.availableActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "furniture_accept", label: "Accept furniture requirements" }),
      expect.objectContaining({ id: "furniture_scope_return", label: "Send back requirements" })
    ]));
    await f.act("client", "furniture_scope_return", {}, null, "Unable to see dimensions");
    await f.act("designer", "furniture_scope", data(), document);
    await f.act("client", "furniture_accept", { submissionEventId: (await current(f)).requirementsSubmissionEventId });
    expect((await current(f)).completedAt).toBeTruthy();
    const empty = await ready(); await empty.act("designer", "furniture_scope", { rooms: [], notApplicable: true }); await empty.act("client", "furniture_accept"); expect((await current(empty)).completedAt).toBeTruthy();
  });
  it.each(["pointer", "event", "proof", "items", "scope", "actor", "stage", "duplicate event", "missing dimensions key", "source pin"])("fails closed for a corrupted combined %s instead of falling back to legacy acceptance", async issue => {
    const f = await ready(); await f.act("designer", "furniture_scope", data(), document);
    const saved = (await f.state())!; const stage = saved.stages.existing_furniture_dimensions!; const token = stage.requirementsSubmissionEventId!; const event = saved.history.at(-1)!;
    if (issue === "pointer") delete stage.requirementsSubmissionEventId;
    if (issue === "event") saved.history.pop();
    if (issue === "proof") event.proof = null;
    if (issue === "items") stage.rooms![0]!.dimensions!.items[0]!.width += 1;
    if (issue === "scope") stage.rooms![0]!.required = false;
    if (issue === "actor") event.actorRole = "client";
    if (issue === "stage") event.stageId = "foreign-stage";
    if (issue === "duplicate event") saved.history.push(structuredClone(event));
    if (issue === "missing dimensions key") delete event.data!.dimensions;
    if (issue === "source pin") stage.scopeEstimateVersion = 999;
    await f.repository.saveDesignWorkflowState(f.project.id, saved.version, saved);
    const before = await f.state();
    if (issue !== "source pin") {
      const view = await createProjectService(f.repository, createAuditService(f.repository), f.now).designWorkflow(f.users.client!, f.project.id);
      expect(view.projectStages!.find(stage => stage.type === "existing_furniture_dimensions")!.operational!.availableActions).not.toContainEqual(expect.objectContaining({ label: "Approve requirements and dimensions" }));
    }
    await expect(f.act("client", "furniture_accept", { submissionEventId: token })).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    await expect(f.act("client", "furniture_accept")).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect(await f.state()).toEqual(before);
  });
  it("allows inline UOM creation by the eligible scope Designer before acceptance, but not the Client", async () => {
    const f = await ready();
    await expect(f.service.createFurnitureUom(f.users.client!, f.project.id, { code: "cm", name: "Centimetre" })).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    const created = await f.service.createFurnitureUom(f.users.designer!, f.project.id, { code: "cm", name: "Centimetre" });
    const submitted = data(); submitted.dimensions[0]!.items[0]!.uomId = created.uom.id; submitted.dimensions[0]!.items[0]!.length = 1.234567;
    await f.act("designer", "furniture_scope", submitted, document);
    expect((await current(f)).rooms![0]!.dimensions!.items[0]).toMatchObject({ uomId: created.uom.id, unit: "cm", uomName: "Centimetre", length: 1.234567 });
  });
  it("requires representation proof and records the actual Client representative on combined approval", async () => {
    const f = await ready(); await f.act("designer", "furniture_scope", data(), document); const token = (await current(f)).requirementsSubmissionEventId!;
    await expect(f.act("admin", "furniture_accept", { submissionEventId: token })).rejects.toMatchObject({ code: "WORKFLOW_PROOF_REQUIRED" });
    await f.act("admin", "furniture_accept", { submissionEventId: token }, document);
    expect((await f.state())!.history.at(-1)).toMatchObject({ actorId: f.users.admin!.id, onBehalfOfClient: true, data: { submissionEventId: token } });
    expect((await current(f)).completedAt).toBeTruthy();
  });
});

describe("actual point counts with furniture measurements", () => {
  const roomScope = { rooms: [{ id: "room-living", required: true }, { id: "room-bedroom", required: false }] };
  const countItem = () => ({ estimateItemId: "room-living-points", measurementType: "count" as const, quantity: 3, uomId: "uom-points" });
  const submittedRooms = () => [{ roomId: "room-living", items: [{ ...furnitureItem }, countItem()] }];
  async function ready(accepted = false) {
    const f = setup(false, seed => {
      seed.estimateSummaries!.find(row => row.id === "workflow-approved-estimate")!.lineItems!.push({ id: "room-living-points", catalogueId: "CUSTOM", roomName: "Living room", specification: "Light fan switch points", unit: "PTS.", quantity: 1, included: true });
      seed.knowledgeUoms!.push({ ...seed.knowledgeUoms![0]!, id: "uom-points", code: "pts", name: "Points", decimalScale: 3, displayOrder: 1 });
    });
    await f.act("finance_head", "confirm_initial_payment"); await f.openFurniture();
    if (accepted) { await f.act("designer", "furniture_scope", roomScope); await f.act("client", "furniture_accept"); }
    return f;
  }
  async function submit(f: Awaited<ReturnType<typeof ready>>, accepted: boolean, items: unknown[] = submittedRooms()[0]!.items) {
    const rows = [{ roomId: "room-living", items }];
    return f.act("designer", accepted ? "furniture_upload" : "furniture_scope", accepted ? { rooms: rows } : { ...roomScope, dimensions: rows }, document);
  }
  async function review(f: Awaited<ReturnType<typeof ready>>, accepted: boolean, approve: boolean) {
    const state = (await f.state())!; const stage = state.stages.existing_furniture_dimensions!; const token = stage.rooms![0]!.dimensions!.submissionEventId;
    return f.act("client", accepted ? approve ? "furniture_dimensions_approve" : "furniture_dimensions_return" : approve ? "furniture_accept" : "furniture_scope_return", accepted ? { submissions: [{ roomId: "room-living", submissionEventId: token }] } : { submissionEventId: token }, null, "Correct the number of points");
  }
  it.each([false, true])("submits mixed point counts and dimensions, retains returned values and approves a new exact revision (accepted=%s)", async accepted => {
    const f = await ready(accepted); const beforeEstimate = await f.repository.findDesignWorkflowRoomContext(f.project.id, true);
    await submit(f, accepted);
    const first = (await f.state())!; const firstEvent = first.history.at(-1)!;
    expect(first.stages.existing_furniture_dimensions!.rooms![0]!.dimensions!.items[1]).toEqual({ ...countItem(), id: "room-living-points", name: "CUSTOM — Light fan switch points", unit: "pts", uomName: "Points" });
    const view = await createProjectService(f.repository, createAuditService(f.repository), f.now).designWorkflow(f.users.client!, f.project.id);
    expect(view.furnitureRooms![0]!.estimateItems.map(item => item.measurementType)).toEqual(["dimensions", "count"]);
    expect(view.projectStages!.find(stage => stage.type === "existing_furniture_dimensions")!.operational!.rooms![0]!.dimensions!.items[1]).toMatchObject({ measurementType: "count", quantity: 3 });
    await review(f, accepted, false);
    expect((await f.state())!.stages.existing_furniture_dimensions!.rooms![0]!.dimensions).toMatchObject({ status: "changes_requested", items: [{ length: 2100 }, { measurementType: "count", quantity: 3 }] });
    await submit(f, accepted, [{ ...furnitureItem, measurementType: "dimensions" }, { ...countItem(), quantity: 5 }]);
    await review(f, accepted, true);
    const complete = (await f.state())!;
    expect(complete.stages.existing_furniture_dimensions).toMatchObject({ completedAt: f.now().toISOString(), rooms: [{ dimensions: { revision: 2, status: "approved", items: [{ length: 2100 }, { quantity: 5 }] } }, {}] });
    expect(complete.history.find(event => event.id === firstEvent.id)).toEqual(firstEvent);
    expect(await f.repository.findDesignWorkflowRoomContext(f.project.id, true)).toEqual(beforeEstimate);
  });
  describe.each([false, true])("count input validation (accepted=%s)", accepted => {
    it.each([0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, -Infinity, NaN, "3", null])("rejects invalid count %j without workflow or audit writes", async quantity => {
      const f = await ready(accepted); const before = await f.state(); const audits = await f.repository.listAuditEvents({});
      await expect(submit(f, accepted, [furnitureItem, { ...countItem(), quantity }])).rejects.toMatchObject({ status: 400 });
      expect(await f.state()).toEqual(before); expect(await f.repository.listAuditEvents({})).toEqual(audits);
    });
    it.each(["dimension for points", "count for furniture", "count with length", "dimensions with quantity", "unknown discriminator", "missing count discriminator"])("rejects %s without writes", async issue => {
      const f = await ready(accepted); const items: Array<Record<string, unknown>> = [{ ...furnitureItem }, countItem()];
      if (issue === "dimension for points") items[1] = { ...furnitureItem, estimateItemId: "room-living-points", uomId: "uom-points" };
      if (issue === "count for furniture") items[0] = { ...countItem(), estimateItemId: "room-living-item" };
      if (issue === "count with length") items[1]!.length = 1;
      if (issue === "dimensions with quantity") items[0]!.quantity = 1;
      if (issue === "unknown discriminator") items[1]!.measurementType = "quantity";
      if (issue === "missing count discriminator") delete items[1]!.measurementType;
      const before = await f.state();
      await expect(submit(f, accepted, items)).rejects.toMatchObject({ status: 400 }); expect(await f.state()).toEqual(before);
    });
  });
  it.each([false, true])("requires correction of legacy pending point dimensions while allowing a send-back (accepted=%s)", async accepted => {
    const f = await ready(accepted); await submit(f, accepted);
    const saved = (await f.state())!; const stage = saved.stages.existing_furniture_dimensions!; const event = saved.history.at(-1)!;
    const legacyItem = { id: "room-living-points", estimateItemId: "room-living-points", name: "CUSTOM — Light fan switch points", length: 1, width: 1, height: 1, unit: "pts", uomId: "uom-points", uomName: "Points" };
    stage.rooms![0]!.dimensions!.items[1] = legacyItem;
    const entries = (accepted ? event.data!.rooms : event.data!.dimensions) as Array<{ items: unknown[] }>;
    entries[0]!.items[1] = structuredClone(legacyItem);
    await f.repository.saveDesignWorkflowState(f.project.id, saved.version, saved);
    const before = await f.state();
    await expect(review(f, accepted, true)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED", message: expect.stringContaining("actual number of points") });
    expect(await f.state()).toEqual(before);
    await review(f, accepted, false);
    expect((await f.state())!.stages.existing_furniture_dimensions!.rooms![0]!.dimensions).toMatchObject({ status: "changes_requested", items: [{}, legacyItem] });
    await submit(f, accepted); await review(f, accepted, true);
    expect((await f.state())!.history.find(row => row.id === event.id)).toEqual(event);
  });
  it("keeps already approved legacy point dimensions unchanged and never derives count from them", async () => {
    const f = await ready(); await submit(f, false); await review(f, false, true);
    const saved = (await f.state())!; const stage = saved.stages.existing_furniture_dimensions!; const event = saved.history.find(row => row.action === "furniture_scope")!;
    const legacyItem = { id: "room-living-points", estimateItemId: "room-living-points", name: "CUSTOM — Light fan switch points", length: 7, width: 1, height: 1, unit: "pts" };
    stage.rooms![0]!.dimensions!.items[1] = legacyItem;
    (event.data!.dimensions as Array<{ items: unknown[] }>)[0]!.items[1] = structuredClone(legacyItem);
    await f.repository.saveDesignWorkflowState(f.project.id, saved.version, saved);
    const before = await f.state(); const view = await createProjectService(f.repository, createAuditService(f.repository), f.now).designWorkflow(f.users.client!, f.project.id);
    const operational = view.projectStages!.find(row => row.type === "existing_furniture_dimensions")!.operational!;
    expect(operational.rooms![0]!.dimensions!.items[1]).toEqual(legacyItem); expect(operational.status).toBe("completed");
    await expect(submit(f, false)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect(await f.state()).toEqual(before);
  });
  it("does not infer measurement mode or restrict count from the chosen configured UOM", async () => {
    const f = await ready(); await submit(f, false, [furnitureItem, { ...countItem(), uomId: "uom-mm", quantity: Number.MAX_SAFE_INTEGER }]);
    await review(f, false, true);
    expect((await f.state())!.stages.existing_furniture_dimensions!.rooms![0]!.dimensions!.items[1]).toMatchObject({ measurementType: "count", quantity: Number.MAX_SAFE_INTEGER, unit: "mm", uomName: "Millimetre" });
  });
});

describe("all selected items including zero estimate quantities", () => {
  const rooms = [{ id: "room-living", required: true }, { id: "room-bedroom", required: true }, { id: "room-kitchen", required: true }];
  const dimensions = () => [
    { roomId: "room-living", items: [{ ...furnitureItem }, { ...furnitureItem, estimateItemId: "living-zero" }] },
    { roomId: "room-bedroom", items: [{ ...furnitureItem, estimateItemId: "bedroom-zero" }] },
    { roomId: "room-kitchen", items: [{ estimateItemId: "kitchen-zero-points", measurementType: "count", quantity: 7, uomId: "uom-mm" }] }
  ];
  async function ready(accepted = false) {
    const f = setup(false, seed => {
      const estimate = seed.estimateSummaries!.find(row => row.id === "workflow-approved-estimate")!;
      estimate.rooms = [{ id: "room-living", label: "Living & Dining" }, { id: "room-bedroom", label: "Master Bedroom" }, { id: "room-kitchen", label: "Kitchen" }];
      const base = { catalogueId: "CUSTOM", specification: "Existing item", unit: "nos", included: true };
      const approved = [
        { ...base, id: "room-living-item", roomName: "Living & Dining", quantity: 2 },
        { ...base, id: "living-zero", roomName: "Living & Dining", quantity: 0 },
        { ...base, id: "bedroom-zero", roomName: "Master Bedroom", quantity: 0 },
        { ...base, id: "kitchen-zero-points", roomName: "Kitchen", quantity: 0, unit: "pts" },
        { ...base, id: "excluded-bedroom", roomName: "Master Bedroom", quantity: 4, included: false }
      ];
      estimate.lineItems = approved.map(item => ({ ...item, id: `mutable-${item.id}`, included: false, quantity: 999 }));
      seed.estimateReviewRounds = [{ id: "all-rooms-approved", estimateId: estimate.id, projectId: estimate.projectId!, estimateVersion: 3, status: "approved", decision: "approve", decisionSource: "client_portal", decidedById: "client-fixture", decidedAt: new Date(BASE).toISOString(), lineItems: approved }];
    });
    await f.act("finance_head", "confirm_initial_payment"); await f.openFurniture();
    if (accepted) { await f.act("designer", "furniture_scope", { rooms }); await f.act("client", "furniture_accept"); }
    return f;
  }
  async function submit(f: Awaited<ReturnType<typeof ready>>, accepted = false, entries: unknown[] = dimensions()) {
    return f.act("designer", accepted ? "furniture_upload" : "furniture_scope", accepted ? { rooms: entries } : { rooms, dimensions: entries }, document);
  }
  async function oldPending(f: Awaited<ReturnType<typeof ready>>, approved = false) {
    const historicalScope = { rooms: rooms.map(room => ({ ...room, required: room.id === "room-living" })), dimensions: dimensions().slice(0, 1) };
    await f.act("designer", "furniture_scope", historicalScope, document);
    if (approved) await f.act("client", "furniture_accept", { submissionEventId: (await f.state())!.stages.existing_furniture_dimensions!.requirementsSubmissionEventId });
    const saved = (await f.state())!; const stage = saved.stages.existing_furniture_dimensions!;
    const event = saved.history.find(row => row.id === stage.requirementsSubmissionEventId)!;
    stage.rooms![0]!.dimensions!.items.pop();
    (event.data!.dimensions as Array<{ items: unknown[] }>)[0]!.items.pop();
    await f.repository.saveDesignWorkflowState(f.project.id, saved.version, saved);
    return { event, token: event.id };
  }
  it.each([false, true])("submits and approves positive actual measurements for every included item from the immutable source (legacy scope=%s)", async accepted => {
    const f = await ready(accepted); const source = await f.repository.findDesignWorkflowRoomContext(f.project.id, true);
    expect(source!.rooms.map(room => room.estimateItems.map(item => item.quantity))).toEqual([[2, 0], [0], [0]]);
    await submit(f, accepted);
    const pending = (await f.state())!; const stage = pending.stages.existing_furniture_dimensions!;
    if (accepted) await f.act("client", "furniture_dimensions_approve", { submissions: stage.rooms!.map(room => ({ roomId: room.id, submissionEventId: room.dimensions!.submissionEventId })) });
    else await f.act("client", "furniture_accept", { submissionEventId: stage.requirementsSubmissionEventId });
    const complete = (await f.state())!;
    expect(complete.stages.existing_furniture_dimensions!.completedAt).toBeTruthy();
    expect(complete.stages.existing_furniture_dimensions!.rooms!.map(room => room.dimensions!.items.map(item => item.id))).toEqual([["room-living-item", "living-zero"], ["bedroom-zero"], ["kitchen-zero-points"]]);
    expect(complete.stages.existing_furniture_dimensions!.rooms![2]!.dimensions!.items[0]).toMatchObject({ measurementType: "count", quantity: 7 });
    expect(await f.repository.findDesignWorkflowRoomContext(f.project.id, true)).toEqual(source);
  });
  describe.each([false, true])("complete actual entry (legacy scope=%s)", accepted => {
    it.each(["missing selected zero", "zero dimensions", "zero count", "excluded item"])("rejects %s with no workflow or audit writes", async issue => {
      const f = await ready(accepted); const entries = dimensions();
      if (issue === "missing selected zero") entries[0]!.items.pop();
      if (issue === "zero dimensions") (entries[1]!.items[0] as typeof furnitureItem).length = 0;
      if (issue === "zero count") (entries[2]!.items[0] as { quantity: number }).quantity = 0;
      if (issue === "excluded item") entries[1]!.items[0]!.estimateItemId = "excluded-bedroom";
      const before = await f.state(); const audits = await f.repository.listAuditEvents({});
      await expect(submit(f, accepted, entries)).rejects.toMatchObject({ status: 400 });
      expect(await f.state()).toEqual(before); expect(await f.repository.listAuditEvents({})).toEqual(audits);
    });
  });
  it("rejects approval of a historical incomplete bundle, permits exact send-back, and retains it through complete resubmission", async () => {
    const f = await ready(); const { event, token } = await oldPending(f);
    const before = await f.state(); const audits = await f.repository.listAuditEvents({});
    await expect(f.act("client", "furniture_accept", { submissionEventId: token })).rejects.toMatchObject({ code: "INVALID_FURNITURE_DIMENSIONS" });
    expect(await f.state()).toEqual(before); expect(await f.repository.listAuditEvents({})).toEqual(audits);
    await f.act("client", "furniture_scope_return", { submissionEventId: token }, null, "Add the selected zero-quantity item measurements");
    expect((await f.state())!.stages.existing_furniture_dimensions!.rooms![0]!.dimensions!.status).toBe("changes_requested");
    await submit(f);
    const revised = (await f.state())!.stages.existing_furniture_dimensions!;
    expect(revised.rooms![0]!.dimensions!.revision).toBe(2);
    await expect(f.act("client", "furniture_accept", { submissionEventId: token })).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    await f.act("client", "furniture_accept", { submissionEventId: revised.requirementsSubmissionEventId });
    expect((await f.state())!.history.find(row => row.id === event.id)).toEqual(event);
    expect((await f.state())!.stages.existing_furniture_dimensions!.completedAt).toBeTruthy();
  });
  it.each(["duplicate item", "other room item", "changed name", "changed room name", "wrong token"])("still rejects %s on a historical incomplete send-back", async issue => {
    const f = await ready(); const { token } = await oldPending(f); const saved = (await f.state())!;
    const room = saved.stages.existing_furniture_dimensions!.rooms![0]!; const items = room.dimensions!.items;
    if (issue === "duplicate item") items.push(structuredClone(items[0]!));
    if (issue === "other room item") items[0]!.estimateItemId = items[0]!.id = "bedroom-zero";
    if (issue === "changed name") items[0]!.name = "Another item";
    if (issue === "changed room name") room.name = "Master Bedroom";
    const event = saved.history.find(row => row.id === token)!;
    (event.data!.dimensions as Array<{ items: unknown[] }>)[0]!.items = structuredClone(items);
    await f.repository.saveDesignWorkflowState(f.project.id, saved.version, saved);
    const before = await f.state(); const audits = await f.repository.listAuditEvents({});
    await expect(f.act("client", "furniture_scope_return", { submissionEventId: issue === "wrong token" ? "another-submission" : token }, null, "Correct it")).rejects.toMatchObject({ status: expect.any(Number) });
    expect(await f.state()).toEqual(before); expect(await f.repository.listAuditEvents({})).toEqual(audits);
  });
  it("does not rewrite or reopen historical approved bundles missing formerly hidden zero-quantity lines", async () => {
    const f = await ready(); await oldPending(f, true); const before = await f.state();
    const view = await createProjectService(f.repository, createAuditService(f.repository), f.now).designWorkflow(f.users.client!, f.project.id);
    expect(view.projectStages!.find(stage => stage.type === "existing_furniture_dimensions")!.operational!.status).toBe("completed");
    expect(view.furnitureRooms![0]!.estimateItems).toHaveLength(2);
    await expect(submit(f)).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    expect(await f.state()).toEqual(before);
  });
});
