import { createProjectDesignWorkflow } from "../../src/domain/design-workflow.js";
import { emptyDesignWorkflowState } from "../../src/domain/design-workflow-state.js";
import { createMemoryRepository } from "../../src/repositories/memory.js";
import type { SeedData } from "../../src/repositories/types.js";
import { demoSeedData } from "../../src/seed/data.js";
import { createAuditService } from "../../src/services/audit.service.js";
import type { PublicUser } from "../../src/services/auth.service.js";
import { createDesignWorkflowStateService, type WorkflowActionInput } from "../../src/services/design-workflow-state.service.js";
import { createProjectService } from "../../src/services/project.service.js";

export const CHOICE_NOW = new Date("2026-11-27T12:00:00.000Z");
export const KEYS_AT = "2026-11-26T10:00:00.000Z";
export function executionChoiceFixture(configure?: (seed: SeedData) => void) {
  const seed = structuredClone(demoSeedData), project = seed.projects[0]!;
  const users = Object.fromEntries(["client", "designer", "admin", "super_admin", "finance_head", "design_manager", "estimator_sales"].map(role => {
    const user = seed.users.find(row => row.role === role)!;
    return [role, { id: user.id, role: user.role, name: user.name, email: user.email } satisfies PublicUser];
  }));
  const client = seed.users.find(row => row.id === users.client!.id)!;
  const otherClient = { ...client, id: "execution-other-client", name: "Other Client", email: "other-choice@example.test", emailNormalized: "other-choice@example.test" };
  seed.users.push(otherClient);
  users.other = { id: otherClient.id, role: "client", name: otherClient.name, email: otherClient.email };
  project.clientId = users.client!.id; project.assignedDesignerIds = [users.designer!.id];
  project.primaryDesignerId = users.designer!.id; project.managerId = users.design_manager!.id;
  project.assignedEstimatorId = users.estimator_sales!.id;
  delete project.estimationWorkflowVersion;
  project.designWorkflowStages = createProjectDesignWorkflow(project.id);
  seed.projectAccessGrants.push({ id: "choice-admin-scope", projectId: project.id, userId: users.admin!.id, module: "projects", source: "admin_initiator", active: true,
    grantedById: users.admin!.id, grantedAt: KEYS_AT, revokedAt: null, revokedById: null, revocationReason: null, version: 1, createdAt: KEYS_AT, updatedAt: KEYS_AT, accessRequestId: null });
  const state = { ...emptyDesignWorkflowState(project.id), version: 3, initialPaymentAt: KEYS_AT };
  state.stages = { internal_kickoff: { completedAt: KEYS_AT }, client_kickoff: { completedAt: KEYS_AT },
    key_collection: { handedOverAt: KEYS_AT, receivedAt: KEYS_AT, completedAt: KEYS_AT } };
  seed.designWorkflowStates = [state];
  seed.projects[1]!.clientId = otherClient.id;
  seed.projects[1]!.designWorkflowStages = createProjectDesignWorkflow(seed.projects[1]!.id);
  configure?.(seed);
  const repository = createMemoryRepository(seed), audit = createAuditService(repository);
  const service = createDesignWorkflowStateService(repository, audit, () => CHOICE_NOW);
  const projects = createProjectService(repository, audit, () => CHOICE_NOW);
  const command: WorkflowActionInput = { action: "execution_path_select", expectedVersion: 3, note: "", idempotencyKey: "execution-choice-first-save",
    stageId: `${project.id}:design-stage:key_collection`, data: { optionId: "option_1", definitionVersion: 1, acknowledgedIrreversible: true } };
  return { seed, project, users, repository, audit, service, projects, command,
    state: () => repository.findDesignWorkflowState(project.id),
    view: async (actor = users.client!) => (await projects.designWorkflow(actor, project.id)).executionChoice };
}
