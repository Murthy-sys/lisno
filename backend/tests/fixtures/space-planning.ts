import { createProjectDesignWorkflow } from "../../src/domain/design-workflow.js";
import { emptyDesignWorkflowState } from "../../src/domain/design-workflow-state.js";
import type { WorkflowDesignPlanData } from "../../src/domain/workflow-space-planning.js";
import { demoSeedData } from "../../src/seed/data.js";
import type { PublicUser } from "../../src/services/auth.service.js";

export const SPACE_NOW = "2026-09-18T10:00:00.000Z";
export function spacePlanningFixture() {
  const seed = structuredClone(demoSeedData);
  const project = seed.projects[0]!;
  const users = Object.fromEntries(seed.users.map(user => [user.role, { id: user.id, role: user.role, name: user.name, email: user.email } satisfies PublicUser]));
  project.clientId = users.client!.id;
  project.assignedDesignerIds = [users.designer!.id];
  project.designWorkflowStages = createProjectDesignWorkflow(project.id);
  seed.estimateSummaries = [{ id: "space-estimate", leadId: "space-lead", projectId: project.id, status: "client_approved", version: 4, subtotal: 1000, gst: 0, total: 1000, approvedBaseline: null, clientReview: null, assignedAdminId: null, clientDecisionAt: SPACE_NOW, clientDecisionSource: "client_portal", createdAt: SPACE_NOW, updatedAt: SPACE_NOW, rooms: [], lineItems: [] }];
  const source: WorkflowDesignPlanData = {
    estimateId: "space-estimate", projectId: project.id, designPlanStatus: "approved", designPlanVersion: 2,
    approvedAt: SPACE_NOW, approvedById: users.client!.id, approvalSource: "client_portal", frozenAt: SPACE_NOW,
    rounds: [{ id: "space-round", estimateId: "space-estimate", projectId: project.id, designPlanVersion: 2, status: "approved", decision: "approve", decisionSource: "client_portal", decidedById: users.client!.id, decidedByRole: "client", decidedAt: SPACE_NOW, submittedRevisionIds: ["revision-a", "revision-b"] }],
    drawings: ["a", "b"].map(id => ({ id: `drawing-${id}`, revisions: [{ id: `revision-${id}`, revisionNumber: 2, reviewStatus: "approved", reviewerId: users.client!.id, reviewedAt: SPACE_NOW }] })), openFeedback: 0
  };
  const state = emptyDesignWorkflowState(project.id);
  state.initialPaymentAt = SPACE_NOW;
  state.stages = {
    internal_kickoff: { completedAt: SPACE_NOW }, client_kickoff: { completedAt: SPACE_NOW },
    key_collection: { completedAt: SPACE_NOW, handedOverAt: SPACE_NOW, receivedAt: SPACE_NOW },
    site_measurement: { completedAt: SPACE_NOW },
    existing_furniture_dimensions: { completedAt: SPACE_NOW, acceptedAt: SPACE_NOW, noExistingFurniture: true, rooms: [] }
  };
  seed.designWorkflowStates = [state]; seed.designPlanReviewSources = [source];
  return { seed, project, state, source, users, stageId: project.designWorkflowStages.find(stage => stage.type === "space_planning_tentative_look_feel")!.id };
}
