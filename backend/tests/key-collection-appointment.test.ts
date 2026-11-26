import { describe, expect, it, vi } from "vitest";
import { createProjectDesignWorkflow } from "../src/domain/design-workflow.js";
import { CALENDAR_DAY_MS, emptyDesignWorkflowState } from "../src/domain/design-workflow-state.js";
import { newEstimationLifecycle, newQuotationLifecycle } from "../src/domain/estimation-lifecycle.js";
import { createMemoryRepository } from "../src/repositories/memory.js";
import type { SeedData } from "../src/repositories/types.js";
import { demoSeedData } from "../src/seed/data.js";
import { createAuditService } from "../src/services/audit.service.js";
import type { PublicUser } from "../src/services/auth.service.js";
import { createDesignWorkflowStateService, workflowActionSchema, type WorkflowActionInput } from "../src/services/design-workflow-state.service.js";
import { projectDesignerHandoff, readDesignerHandoffSource } from "../src/services/designer-handoff.service.js";
import { createProjectService } from "../src/services/project.service.js";
import { quotationSnapshotDigest } from "../src/services/quotation-digest.js";
import { spacePlanningFixture } from "./fixtures/space-planning.js";

const BASE = Date.parse("2026-11-25T10:00:00.000Z");
const ISO = new Date(BASE).toISOString();
const proof = { storageReference: "opaque-kickoff", originalFilename: "kickoff.pdf", mimeType: "application/pdf" as const, byteSize: 1, sha256: "a".repeat(64) };
function setup(configure?: (seed: SeedData) => void) {
  const seed = structuredClone(demoSeedData);
  const project = seed.projects[0]!;
  const actor = (role: PublicUser["role"]) => {
    const user = seed.users.find(row => row.role === role)!;
    return { id: user.id, name: user.name, role: user.role, email: user.email } satisfies PublicUser;
  };
  const client = actor("client"), designer = actor("designer"), admin = actor("super_admin");
  project.clientId = client.id;
  project.assignedDesignerIds = [designer.id];
  project.primaryDesignerId = designer.id;
  project.estimationWorkflowVersion = 2;
  project.designTeamVersion = 1;
  project.designWorkflowStages = createProjectDesignWorkflow(project.id);
  const estimation = { ...newEstimationLifecycle(), phase: "post" as const, preApproval: { reviewRoundId: "appointment-pre-round", estimateVersion: 3, approvedAt: ISO } };
  seed.estimateSummaries = [{ id: "appointment-estimate", leadId: "appointment-lead", projectId: project.id, version: 4, status: "client_approved", subtotal: 100, gst: 18, total: 118, clientDecisionAt: ISO,
    clientDecisionSource: "client_portal", approvedBaseline: null, clientReview: null, assignedAdminId: admin.id, createdAt: ISO, updatedAt: ISO, estimation, rooms: [] }];
  seed.projectStatusEstimateEvidence = [{ projectId: project.id, estimates: [{ id: "appointment-estimate", leadId: "appointment-lead", projectId: project.id, version: 4, status: "client_approved", clientDecisionAt: ISO, estimation }],
    rounds: [{ id: "appointment-pre-round", estimateId: "appointment-estimate", leadId: "appointment-lead", projectId: project.id, estimateVersion: 3, sendGeneration: 1,
      status: "approved", decision: "approve", decisionSource: "client_portal", decidedById: client.id, decidedAt: ISO, createdAt: ISO, proofValid: false, phase: "pre" }], financeSource: null }];
  seed.designerAssignmentEvidence = [{ projectId: project.id, pendingRequests: [], acceptedRequest: { id: "accepted-request", designerId: designer.id, acceptedAt: ISO } }];
  configure?.(seed);
  const repository = createMemoryRepository(seed);
  let now = BASE;
  const audit = createAuditService(repository);
  const service = createDesignWorkflowStateService(repository, audit, () => new Date(now));
  const stages = project.designWorkflowStages!;
  const state = () => repository.findDesignWorkflowState(project.id);
  const view = async (user = client) => projectDesignerHandoff(await readDesignerHandoffSource(repository, project), project, await state() ?? emptyDesignWorkflowState(project.id), user, new Date(now));
  const schedule = async (extra: Partial<WorkflowActionInput> = {}): Promise<WorkflowActionInput> => ({ action: "key_collection_schedule", stageId: stages.find(row => row.type === "key_collection")!.id,
    expectedVersion: (await state())?.version ?? 0, idempotencyKey: "schedule-first-appointment", note: "", data: { mode: "within_48_hours", expectedAssignmentRevision: (await view()).assignmentRevision }, ...extra });
  let sequence = 0;
  const act = async (user: PublicUser, action: WorkflowActionInput["action"], data: Record<string, unknown> = {}, evidence: typeof proof | null = null) => service.act(user, project.id, {
    action, expectedVersion: (await state())?.version ?? 0, idempotencyKey: `appointment-action-${++sequence}`, note: "", data,
    stageId: stages.find(row => row.type === (action === "internal_kickoff_complete" ? "internal_kickoff" : action === "client_kickoff_complete" ? "client_kickoff" : "key_collection"))!.id
  }, evidence);
  const kickoffs = async () => {
    await act(designer, "internal_kickoff_complete", { designHandoverAcknowledged: true, meetingAt: new Date(now).toISOString() }, proof);
    await act(client, "client_kickoff_complete", { reviewedDocumentEventId: (await state())!.history.find(row => row.action === "internal_kickoff_complete")!.id });
  };
  return { seed, project, client, designer, admin, repository, service, state, view, schedule, act, kickoffs, advance: (ms: number) => { now += ms; } };
}

describe("Client key collection appointments", () => {
  it.each([1, 4])("schedules a canonical legacy approval at version %s without inventing a review round", async version => {
    const f = setup(seed => {
      delete seed.projects[0]!.estimationWorkflowVersion;
      const estimate = seed.estimateSummaries![0]!;
      delete estimate.estimation; estimate.version = version; estimate.clientDecisionAt = null;
      const evidence = seed.projectStatusEstimateEvidence![0]!;
      delete evidence.estimates[0]!.estimation; evidence.estimates[0]!.version = version; evidence.estimates[0]!.clientDecisionAt = null; evidence.rounds = [];
    });
    expect(await f.view()).toMatchObject({ initialEstimateApproved: true, canSchedule: true });
    await f.service.act(f.client, f.project.id, await f.schedule(), null);
    expect((await f.state())!.stages.key_collection!.appointment).toMatchObject({ estimateVersion: Math.max(1, version - 1), approvalReviewRoundId: null });
    expect((await readDesignerHandoffSource(f.repository, f.project)).approval).toMatchObject({ reviewRoundId: null, approvedAt: null });
  });

  it("preserves execution availability for an approved legacy design without commercial review rounds", async () => {
    const f = spacePlanningFixture();
    const repository = createMemoryRepository(f.seed);
    const view = await createProjectService(repository, createAuditService(repository), () => new Date(BASE)).designWorkflow(f.users.client!, f.project.id);
    expect(view.designerHandoff).toMatchObject({ initialEstimateApproved: true, executionAvailable: true, state: "completed" });
    expect((await readDesignerHandoffSource(repository, f.project)).approval?.reviewRoundId).toBeNull();
  });

  it("does not use the no-round legacy fallback when a recorded approval or baseline is inconsistent", async () => {
    for (const corruption of ["foreign-client", "dangling-baseline"] as const) {
      const f = setup(seed => {
        delete seed.projects[0]!.estimationWorkflowVersion; delete seed.estimateSummaries![0]!.estimation;
        const evidence = seed.projectStatusEstimateEvidence![0]!; delete evidence.estimates[0]!.estimation;
        if (corruption === "foreign-client") evidence.rounds[0]!.decidedById = "another-client";
        else { evidence.rounds = []; evidence.financeSource = { estimateId: "appointment-estimate", estimateVersion: 3, reviewRoundId: "missing-round" }; }
      });
      expect(await f.view()).toMatchObject({ state: "source_issue", canSchedule: false });
    }
  });
  it("confirms 48 calendar hours before kickoffs, preserves one original deadline, and replays safely", async () => {
    const f = setup();
    expect(await f.view()).toMatchObject({ initialEstimateApproved: true, state: "awaiting_client_schedule", canSchedule: true });
    const input = await f.schedule();
    await f.service.act(f.client, f.project.id, input, null);
    expect((await f.state())!.stages.key_collection!.appointment).toMatchObject({ confirmedById: f.client.id, confirmedAt: ISO, originalDeadlineAt: new Date(BASE + 2 * CALENDAR_DAY_MS).toISOString(), assignmentRequestId: "accepted-request" });
    expect(await f.view()).toMatchObject({ state: "scheduled", canSchedule: false, appointment: { remainingMs: 2 * CALENDAR_DAY_MS, overdue: false } });
    await expect(f.service.act(f.client, f.project.id, input, null)).resolves.toMatchObject({ replayed: true });
    await expect(f.service.act(f.client, f.project.id, await f.schedule({ idempotencyKey: "replacement-appointment" }), null)).rejects.toMatchObject({ code: "KEY_COLLECTION_ALREADY_SCHEDULED" });
    expect((await f.state())!.history).toHaveLength(1);
    await expect(f.act(f.designer, "keys_received")).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
  });

  it("accepts a chosen explicit offset instant and rejects past, equal, offset-less or extra fields", async () => {
    const f = setup();
    const revision = (await f.view()).assignmentRevision;
    for (const scheduledAt of [ISO, "2020-01-01T00:00:00Z"]) await expect(f.service.act(f.client, f.project.id,
      await f.schedule({ data: { mode: "chosen_datetime", scheduledAt, expectedAssignmentRevision: revision } }), null)).rejects.toMatchObject({ code: "INVALID_WORKFLOW_DATE" });
    expect(workflowActionSchema.safeParse(await f.schedule({ data: { mode: "chosen_datetime", scheduledAt: "2026-11-28T10:00:00", expectedAssignmentRevision: revision } })).success).toBe(false);
    expect(workflowActionSchema.safeParse(await f.schedule({ data: { mode: "within_48_hours", scheduledAt: ISO, expectedAssignmentRevision: revision } })).success).toBe(false);
    await f.service.act(f.client, f.project.id, await f.schedule({ data: { mode: "chosen_datetime", scheduledAt: "2026-11-29T16:00:00+05:30", expectedAssignmentRevision: revision } }), null);
    expect((await f.view()).appointment?.deadlineAt).toBe("2026-11-29T10:30:00.000Z");
  });

  it("rejects representatives, Designers, unrelated Clients, stale revisions and CAS versions", async () => {
    const f = setup(); const input = await f.schedule();
    for (const user of [f.admin, f.designer]) await expect(f.service.act(user, f.project.id, input, null)).rejects.toMatchObject({ status: 403 });
    await expect(f.service.act({ ...f.client, id: "different-client" }, f.project.id, input, null)).rejects.toMatchObject({ status: 401 });
    await expect(f.service.act(f.client, f.project.id, { ...input, data: { mode: "within_48_hours", expectedAssignmentRevision: "old-assignment" } }, null)).rejects.toMatchObject({ code: "ASSIGNMENT_VERSION_CONFLICT" });
    await expect(f.service.act(f.client, f.project.id, { ...input, expectedVersion: 99 }, null)).rejects.toMatchObject({ code: "WORKFLOW_VERSION_CONFLICT" });
    expect(await f.state()).toBeNull();
  });

  it("requires scheduling for accepted requests, both kickoffs, and both confirmations for completion", async () => {
    const f = setup();
    await f.kickoffs();
    await expect(f.act(f.designer, "keys_received")).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
    await f.service.act(f.client, f.project.id, await f.schedule(), null);
    await f.act(f.designer, "keys_received");
    f.advance(4 * CALENDAR_DAY_MS);
    expect(await f.view()).toMatchObject({ state: "received", appointment: { receivedAt: ISO, remainingMs: 0, overdue: false, completedAt: null } });
    await f.act(f.client, "keys_handed_over");
    expect(await f.view()).toMatchObject({ state: "completed", appointment: { completedAt: new Date(BASE + 4 * CALENDAR_DAY_MS).toISOString() } });
  });

  it("does not pause or move the calendar deadline when workflow access is paused", async () => {
    const f = setup(); await f.service.act(f.client, f.project.id, await f.schedule(), null);
    const state = (await f.state())!; state.pauses.push({ startedAt: ISO, endedAt: null });
    await f.repository.saveDesignWorkflowState(f.project.id, state.version, state);
    f.advance(3 * CALENDAR_DAY_MS);
    expect((await f.view()).appointment).toMatchObject({ originalDeadlineAt: new Date(BASE + 2 * CALENDAR_DAY_MS).toISOString(), deadlineAt: new Date(BASE + 2 * CALENDAR_DAY_MS).toISOString(), overdue: true, remainingMs: 0 });
  });

  it("preserves legacy key history without fabricating a schedule or acceptance", async () => {
    const f = setup(seed => { seed.designerAssignmentEvidence = []; });
    await f.kickoffs(); await f.act(f.client, "keys_handed_over"); await f.act(f.designer, "keys_received");
    expect(await f.view()).toMatchObject({ state: "completed", appointment: null, canSchedule: false });
    expect((await f.state())!.history.some(event => event.action === "key_collection_schedule")).toBe(false);
  });

  it("shows no pending candidate identity and rejects missing or foreign initial approval evidence", async () => {
    const f = setup(seed => {
      const project = seed.projects[0]!; project.primaryDesignerId = null; project.assignedDesignerIds = [];
      seed.designerAssignmentEvidence = [{ projectId: project.id, pendingRequests: [
        { id: "pending", designerId: "private-candidate", version: 1, createdAt: ISO },
        { id: "pending-other", designerId: "other-private-candidate", version: 1, createdAt: ISO }
      ], acceptedRequest: null }];
    });
    const view = await f.view(); expect(view).toMatchObject({ state: "awaiting_designer", designer: null, canSchedule: false });
    expect(JSON.stringify(view)).not.toContain("private-candidate");
    const broken = setup(seed => { seed.projectStatusEstimateEvidence![0]!.rounds[0]!.decidedById = "other-client"; });
    expect(await broken.view()).toMatchObject({ state: "source_issue", canSchedule: false });
  });

  it("uses initial approval while a v3 revised quotation is still pending", async () => {
    const f = setup(seed => {
      seed.projects[0]!.estimationWorkflowVersion = 3;
      seed.estimateSummaries![0]!.estimation = { ...newQuotationLifecycle(), phase: "post", preApproval: { reviewRoundId: "appointment-pre-round", estimateVersion: 3, approvedAt: ISO } };
      seed.estimateReviewRounds = [{ id: "appointment-pre-round", estimateId: "appointment-estimate", projectId: seed.projects[0]!.id, estimateVersion: 3, status: "approved", decision: "approve", decisionSource: "client_portal", decidedById: seed.projects[0]!.clientId!, decidedAt: ISO, lineItems: [], phase: "pre" }];
      const snapshot = { lineItems: [], subtotal: 100, gst: 18, total: 118 };
      const sourceDigest = quotationSnapshotDigest(snapshot);
      Object.assign(seed.projectStatusEstimateEvidence![0]!.rounds[0]!, { workflowVersion: 3, estimateSnapshot: snapshot, sourceDigest,
        submittedById: "sales", pricedRevision: 1, salesApproval: { actorId: "sales", estimateVersion: 3, pricedRevision: 1, sourceDigest, approvedAt: ISO } });
    });
    expect(await f.view()).toMatchObject({ canSchedule: true, executionAvailable: false });
    await f.service.act(f.client, f.project.id, await f.schedule(), null);
    expect((await f.view()).blockers).toContain("Approve the current Designer-revised quotation before collecting keys.");
    await expect(f.act(f.designer, "keys_received")).rejects.toMatchObject({ code: "DESIGN_WORKFLOW_BLOCKED" });
  });

  it("projects stage version before kickoff and retains deadline after a new Designer takes ownership", async () => {
    const f = setup(); await f.service.act(f.client, f.project.id, await f.schedule(), null);
    const page = await createProjectService(f.repository, createAuditService(f.repository), () => new Date(BASE)).designWorkflow(f.client, f.project.id);
    expect(page.projectStages!.find(stage => stage.type === "key_collection")!.operational!.version).toBe(1);
    const source = await readDesignerHandoffSource(f.repository, f.project);
    source.designer = { id: "replacement-designer", name: "New Designer" };
    source.assignmentRevision = "replacement-assignment";
    const view = projectDesignerHandoff(source, f.project, (await f.state())!, f.client, new Date(BASE));
    expect(view).toMatchObject({ designer: { id: "replacement-designer" }, appointment: { deadlineAt: new Date(BASE + 2 * CALENDAR_DAY_MS).toISOString() }, canSchedule: false });
  });

  it("rolls scheduling back if its audit cannot be committed", async () => {
    const f = setup();
    const audit = createAuditService(f.repository); vi.spyOn(audit, "append").mockRejectedValue(new Error("audit unavailable"));
    const service = createDesignWorkflowStateService(f.repository, audit, () => new Date(BASE));
    await expect(service.act(f.client, f.project.id, await f.schedule(), null)).rejects.toThrow("audit unavailable");
    expect(await f.state()).toBeNull();
  });
});
