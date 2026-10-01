import type { ChatActor } from "../../src/contracts/project-chat.js";
import type { ProjectStatusEstimateEvidence } from "../../src/repositories/project-status.js";
import { createMemoryRepository } from "../../src/repositories/memory.js";
import { createMemoryProjectChatRepository } from "../../src/repositories/project-chat-memory.js";
import { createProjectStatusService } from "../../src/services/project-status.service.js";
import { chatFixtureData, CHAT_NOW } from "./project-chat.js";
import { createProjectDesignWorkflow } from "../../src/domain/design-workflow.js";

export function statusFixture(configure?: (data: ReturnType<typeof chatFixtureData>, evidence: ProjectStatusEstimateEvidence) => void) {
  const data = chatFixtureData();
  data.seed.projects[0]!.designWorkflowStages = createProjectDesignWorkflow("a");
  const estimate = data.estimates[0]!;
  estimate.status = "sent_to_client";
  estimate.designPlanStatus = null;
  estimate.designPlanVersion = 0;
  const evidence: ProjectStatusEstimateEvidence = {
    projectId: "a", estimates: [{ id: estimate.id, leadId: estimate.leadId, projectId: "a", status: estimate.status, version: estimate.version, clientDecisionAt: null }],
    rounds: [{ id: "round-a", estimateId: estimate.id, leadId: estimate.leadId, projectId: "a", estimateVersion: estimate.version, sendGeneration: 1,
      status: "pending", decision: null, decisionSource: null, decidedById: null, decidedAt: null, createdAt: CHAT_NOW, proofValid: false }], financeSource: null
  };
  data.seed.projectStatusEstimateEvidence = [evidence];
  configure?.(data, evidence);
  const repository = createMemoryRepository(data.seed);
  const chatRepository = createMemoryProjectChatRepository(repository, { estimates: data.estimates, workflowTasks: data.workflowTasks });
  const clock = () => new Date("2026-09-16T22:00:00.000Z");
  const service = createProjectStatusService({ repository, chatRepository, clock });
  const actor = (id: string): ChatActor => ({ id, role: data.seed.users.find(row => row.id === id)!.role, sessionVersion: 1, expiresAt: Math.floor(clock().getTime() / 1000) + 3600 });
  return { ...data, evidence, repository, chatRepository, clock, service, actor };
}
