import { createProjectDesignWorkflow } from "../../src/domain/design-workflow.js";
import { emptyDesignWorkflowState, type KeyCollectionAppointment } from "../../src/domain/design-workflow-state.js";
import { newEstimationLifecycle } from "../../src/domain/estimation-lifecycle.js";
import { createMemoryRepository } from "../../src/repositories/memory.js";
import type { SeedData } from "../../src/repositories/types.js";
import { demoSeedData } from "../../src/seed/data.js";
import type { PublicUser } from "../../src/services/auth.service.js";
import { readDesignerHandoffSource } from "../../src/services/designer-handoff.service.js";

export const COLLECTION_START = Date.parse("2026-11-26T09:00:00.000Z");
export const HOUR = 3_600_000;
const confirmedAt = new Date(COLLECTION_START).toISOString();

export async function keyCollectionReminderFixture(options: Array<{ id: string; hours?: number; secondDesigner?: boolean }> = [
  { id: "collection-first", hours: 48 }, { id: "collection-second", hours: 80 }, { id: "collection-other", hours: 24, secondDesigner: true }
], configure?: (seed: SeedData) => void) {
  const seed = structuredClone(demoSeedData);
  const baseProject = seed.projects[0]!;
  const designerUser = seed.users.find(user => user.role === "designer")!;
  const secondDesignerUser = { ...designerUser, id: "second-collection-designer", name: "Second Designer",
    email: "second-designer@example.test", emailNormalized: "second-designer@example.test" };
  seed.users.push(secondDesignerUser);
  const publicUser = (user: typeof designerUser): PublicUser => ({ id: user.id, name: user.name, role: user.role, email: user.email });
  const designer = publicUser(designerUser), secondDesigner = publicUser(secondDesignerUser);
  const client = publicUser(seed.users.find(user => user.role === "client")!);
  const admin = publicUser(seed.users.find(user => user.role === "super_admin")!);
  seed.projects = [];
  seed.estimateSummaries = [];
  seed.projectStatusEstimateEvidence = [];
  seed.designerAssignmentEvidence = [];
  seed.designWorkflowStates = [];
  for (const option of options) {
    const responsible = option.secondDesigner ? secondDesigner : designer;
    const project = { ...structuredClone(baseProject), id: option.id, name: `Project ${option.id}`, status: "active" as const,
      clientId: client.id, primaryDesignerId: responsible.id, assignedDesignerIds: [responsible.id], initiatingDesignerId: null,
      estimationWorkflowVersion: 2 as const, designTeamVersion: 1, designWorkflowStages: createProjectDesignWorkflow(option.id) };
    const estimateId = `estimate-${option.id}`, leadId = `lead-${option.id}`, roundId = `round-${option.id}`;
    const estimation = { ...newEstimationLifecycle(), phase: "post" as const,
      preApproval: { reviewRoundId: roundId, estimateVersion: 3, approvedAt: confirmedAt } };
    seed.projects.push(project);
    seed.estimateSummaries.push({ id: estimateId, leadId, projectId: project.id, version: 4, status: "client_approved",
      subtotal: 100, gst: 18, total: 118, clientDecisionAt: confirmedAt, clientDecisionSource: "client_portal", approvedBaseline: null,
      clientReview: null, assignedAdminId: admin.id, createdAt: confirmedAt, updatedAt: confirmedAt, estimation, rooms: [] });
    seed.projectStatusEstimateEvidence.push({ projectId: project.id,
      estimates: [{ id: estimateId, leadId, projectId: project.id, version: 4, status: "client_approved", clientDecisionAt: confirmedAt, estimation }],
      rounds: [{ id: roundId, estimateId, leadId, projectId: project.id, estimateVersion: 3, sendGeneration: 1, status: "approved", decision: "approve",
        decisionSource: "client_portal", decidedById: client.id, decidedAt: confirmedAt, createdAt: confirmedAt, proofValid: false, phase: "pre" }], financeSource: null });
    seed.designerAssignmentEvidence.push({ projectId: project.id, pendingRequests: [],
      acceptedRequest: { id: `request-${project.id}`, designerId: responsible.id, acceptedAt: confirmedAt } });
  }
  const sourceRepository = createMemoryRepository(seed);
  for (const option of options) {
    const project = seed.projects.find(item => item.id === option.id)!;
    const source = await readDesignerHandoffSource(sourceRepository, project);
    if (!source.approval || !source.designer || !source.assignmentRevision) throw new Error("Synthetic appointment source is incomplete.");
    const hours = option.hours ?? 48;
    const deadlineAt = new Date(COLLECTION_START + hours * HOUR).toISOString();
    const appointment: KeyCollectionAppointment = { mode: hours === 48 ? "within_48_hours" : "chosen_datetime",
      confirmedById: client.id, confirmedAt, originalDeadlineAt: deadlineAt, deadlineAt, assignmentRevision: source.assignmentRevision,
      designerId: source.designer.id, assignmentRequestId: source.evidence.acceptedRequest!.id,
      estimateId: source.approval.estimateId, estimateVersion: source.approval.estimateVersion, approvalReviewRoundId: source.approval.reviewRoundId };
    const state = emptyDesignWorkflowState(project.id);
    state.version = 1; state.stages.key_collection = { appointment };
    state.history = [{ id: `scheduled-${project.id}`, idempotencyKey: `schedule-${project.id}`, requestHash: "a".repeat(64),
      action: "key_collection_schedule", stageId: project.designWorkflowStages!.find(stage => stage.type === "key_collection")!.id,
      actorId: client.id, actorName: client.name, actorRole: "client", onBehalfOfClient: false, at: confirmedAt, note: "", data: { ...appointment }, proof: null }];
    seed.designWorkflowStates!.push(state);
  }
  configure?.(seed);
  return { seed, repository: createMemoryRepository(seed), designer, secondDesigner, client, admin };
}
