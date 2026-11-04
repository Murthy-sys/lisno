import type { SeedData } from "../../src/repositories/types.js";
import { demoSeedData } from "../../src/seed/data.js";

export const responsibilityUserId = "responsibility-target";
export function responsibilitySeed(): SeedData {
  const seed = structuredClone(demoSeedData);
  const target = responsibilityUserId;
  seed.users = [
    { ...seed.users[0]!, id: target, name: "Assigned person", email: "target@fixtures.example", emailNormalized: "target@fixtures.example", role: "designer", managerId: null },
    { ...seed.users[0]!, id: "inactive-report", name: "Inactive report", email: "report@fixtures.example", emailNormalized: "report@fixtures.example", role: "designer", active: false, managerId: target }
  ];
  seed.projects = [
    { ...seed.projects[0]!, id: "project-alpha", name: "Alpha home", status: "active", initiatingDesignerId: target, assignedDesignerIds: [target], managerId: target, programManagerId: target, clientId: target },
    { ...seed.projects[0]!, id: "project-completed", name: "Completed studio", status: "completed", initiatingDesignerId: target, assignedDesignerIds: [target], managerId: target, programManagerId: target, clientId: target }
  ];
  seed.leads = [
    { ...seed.leads[0]!, id: "lead-alpha", ownerId: target, projectId: "project-alpha", projectNumber: "Lisno000001", projectName: "Alpha home", stage: "estimate_in_progress" },
    { ...seed.leads[0]!, id: "lead-unlinked", ownerId: target, projectId: null, projectNumber: null, projectName: "Unlinked loft", stage: "site_visit" },
    { ...seed.leads[0]!, id: "lead-won", ownerId: target, projectId: "project-completed", projectNumber: "Lisno000002", stage: "won" },
    { ...seed.leads[0]!, id: "lead-other-owner", ownerId: "someone-else", projectId: null, projectNumber: null, stage: "new_lead" }
  ];
  seed.estimateResponsibilities = [
    { id: "estimate-alpha", ownerId: target, status: "draft", leadId: "lead-alpha", projectId: "project-alpha" },
    { id: "estimate-conflicting", ownerId: target, status: "draft", leadId: "lead-alpha", projectId: "project-completed" },
    { id: "estimate-orphan", ownerId: target, status: "ready_for_client", leadId: "missing-lead" },
    { id: "estimate-completed", ownerId: target, status: "client_approved", leadId: "lead-alpha" }
  ];
  seed.estimateSummaries = [];
  seed.stages = [{ ...seed.stages[0]!, id: "stage-alpha", projectId: "project-alpha", name: "Layout review" }];
  seed.tasks = [
    { ...seed.tasks[0]!, id: "task-alpha", projectId: "project-alpha", stageId: "stage-alpha", title: "Review kitchen layout", ownerId: target, status: "in_progress", completedAt: null },
    { ...seed.tasks[0]!, id: "task-completed", projectId: "project-alpha", stageId: "stage-alpha", ownerId: target, status: "completed", completedAt: "2026-11-01T00:00:00.000Z" }
  ];
  seed.projectAccessGrants = [{ id: "grant-alpha", projectId: "project-alpha", userId: target, module: "projects", source: "admin_initiator", accessRequestId: null,
    grantedById: "super-fixture", active: true, grantedAt: "2026-11-01T00:00:00.000Z", revokedAt: null, revokedById: null, revocationReason: null, version: 1,
    createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-01T00:00:00.000Z" }];
  seed.projectWorkflowAssignments = [
    { id: "workflow-alpha", projectId: "project-alpha", estimateId: "estimate-alpha", kind: "design_plan_upload", title: "Upload reviewed plan", assigneeRole: "designer", assigneeUserId: target, status: "open", supersededAt: null },
    { id: "workflow-superseded", projectId: "project-alpha", estimateId: "estimate-alpha", kind: "design_plan_upload", assigneeRole: "designer", assigneeUserId: target, status: "open", supersededAt: "2026-11-01T00:00:00.000Z" },
    { id: "workflow-completed", projectId: "project-alpha", estimateId: "estimate-alpha", kind: "design_plan_upload", assigneeRole: "designer", assigneeUserId: target, status: "completed", supersededAt: null }
  ];
  seed.auditEvents = [];
  return seed;
}

export const responsibilityCounts = {
  ownedActiveLeads: 2, ownedActiveEstimates: 3, initiatedActiveProjects: 1,
  assignedActiveProjects: 1, managedActiveProjects: 1, ownedActiveTasks: 1,
  directReports: 1, linkedClientProjects: 2, adminInitiatorGrants: 1,
  assignedExecutionProjects: 1, assignedWorkflowTasks: 1
};
