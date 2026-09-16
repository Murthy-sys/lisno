import type { ChatActor, ChatSendInput } from "../../src/contracts/project-chat.js";
import type { Role } from "../../src/domain/roles.js";
import { projectWorkflowBlueprints } from "../../src/domain/project-workflow.js";
import { createMemoryRepository } from "../../src/repositories/memory.js";
import { createMemoryProjectChatRepository } from "../../src/repositories/project-chat-memory.js";
import type { ChatEstimateSource, ChatSources, ChatWorkflowSource } from "../../src/repositories/project-chat.js";
import type { LeadRecord, ProjectRecord, SeedData, UserRecord } from "../../src/repositories/types.js";
import { createAuditService } from "../../src/services/audit.service.js";
import { createProjectChatService } from "../../src/services/project-chat.service.js";
export const CHAT_NOW = "2026-09-16T10:00:00.000Z";
export function chatUser(id: string, role: Role, name = id): UserRecord { return { id, name, role, email: `${id}@chat.test`, emailNormalized: `${id}@chat.test`, passwordHash: "unused", mobile: null, address: null, active: true, accountKind: "standard", version: 1, sessionVersion: 1, managerId: null, authorizedClientIds: [], createdAt: CHAT_NOW, updatedAt: CHAT_NOW }; }
export function chatProject(id: string, clientId: string): ProjectRecord { return { id, name: `Project ${id}`, clientId, clientName: clientId, clientEmail: `${clientId}@chat.test`, clientEmailNormalized: `${clientId}@chat.test`, clientMobile: "0000000000", clientAddress: "Synthetic test address", initiatingDesignerId: "designer-a", assignedDesignerIds: ["designer-a"], assignedEstimatorId: "sales-a", managerId: "manager-a", status: "active", location: "Test", plannedStartAt: CHAT_NOW, plannedEndAt: "2026-12-31T00:00:00.000Z", actualStartAt: null, actualEndAt: null, createdAt: CHAT_NOW, updatedAt: CHAT_NOW }; }
export function chatLead(id: string, projectId: string, ownerId = "sales-a"): LeadRecord { return { id, projectId, ownerId, clientName: "Client", clientEmail: "client@chat.test", clientMobile: "0000000000", projectName: projectId, location: "Test", propertyType: "villa", budgetMin: null, budgetMax: null, source: "test", stage: "won", nextAction: "test", nextActionAt: CHAT_NOW, builder: null, areaSqft: null, targetHandoverAt: null, notes: null, latestActivityAt: null, createdAt: CHAT_NOW, updatedAt: CHAT_NOW }; }
export function chatFixtureData() {
    const users = [chatUser("super", "super_admin"), chatUser("admin-a", "admin"), chatUser("admin-b", "admin"), chatUser("client-a", "client", "Client A"), chatUser("client-b", "client", "Client B"), chatUser("designer-a", "designer", "Designer A"), chatUser("old-designer", "designer"), chatUser("manager-a", "design_manager"), chatUser("old-manager", "design_manager"), chatUser("sales-a", "estimator_sales"), chatUser("site-a", "site_manager"), chatUser("electric-a", "worker_electrician", "Electric A"), chatUser("electric-b", "worker_electrician", "Electric A"), chatUser("plumber", "worker_plumber"), chatUser("procurement", "procurement"), chatUser("head", "design_head")];
    const projects = [chatProject("a", "client-a"), { ...chatProject("b", "client-b"), initiatingDesignerId: null, assignedDesignerIds: [], assignedEstimatorId: null, managerId: null }];
    const leads = [chatLead("lead-a", "a")];
    const estimates: ChatEstimateSource[] = [{ id: "estimate-a", projectId: "a", leadId: "lead-a", ownerId: "sales-a", status: "client_approved", version: 4, approvalRequired: true, assignedManagerId: "old-manager", assignedDesignerId: "old-designer", designPlanStatus: "approved", designPlanVersion: 2, designPlanDesignerId: "designer-a", lineItems: [{ id: "line-electric", catalogueId: "EL01", included: true, roomName: "Hall", specification: "Electrical", unit: "unit", quantity: 1, amount: 100 }, { id: "line-plumber", catalogueId: "CV02", included: false, roomName: "Bath", specification: "Plumbing", unit: "unit", quantity: 1, amount: 100 }] }];
    const blueprint = projectWorkflowBlueprints({ estimateId: "estimate-a", estimateVersion: 3, lineItems: estimates[0]!.lineItems }).find((row) => row.kind === "trade_execution")!;
    const workflowTasks: ChatWorkflowSource[] = [{ id: "trade-electric", projectId: "a", estimateId: "estimate-a", designPlanVersion: 2, kind: "trade_execution", assigneeRole: blueprint.assigneeRole, assigneeUserId: "electric-a", sourceSectionId: blueprint.sourceSectionId, sourceLineItemKey: blueprint.sourceLineItemKey }];
    const grant = { id: "grant-admin-a", projectId: "a", userId: "admin-a", module: "projects" as const, source: "admin_initiator" as const, accessRequestId: null, grantedById: "super", active: true, grantedAt: CHAT_NOW, revokedAt: null, revokedById: null, revocationReason: null, version: 1, createdAt: CHAT_NOW, updatedAt: CHAT_NOW };
    const seed: SeedData = { users, projects, leads, projectAccessGrants: [grant], userInvitations: [], estimateResponsibilities: [], leadActivities: [], floors: [], stages: [], tasks: [], taskEvents: [], designVersions: [], extractionJobs: [], sourcePages: [], designSections: [], designSectionRevisions: [], evaluations: [], auditEvents: [], accessRequests: [] };
    return { seed, estimates, workflowTasks };
}
export function createChatFixture() {
    const { seed, estimates, workflowTasks } = chatFixtureData();
    const repository = createMemoryRepository(seed);
    const audit = createAuditService(repository);
    const chatRepository = createMemoryProjectChatRepository(repository, { estimates, workflowTasks });
    let time = new Date(CHAT_NOW).getTime();
    const clock = () => new Date(time);
    const service = createProjectChatService({ repository, audit, chatRepository, clock });
    const actor = (id: string): ChatActor => { const user = seed.users.find((row) => row.id === id)!; return { id, role: user.role, sessionVersion: 1, expiresAt: Math.floor(time / 1000) + 3600 }; };
    return { seed, estimates, workflowTasks, repository, chatRepository, audit, service, clock, actor, advance: (ms: number) => { time += ms; } };
}
export function chatSend(body = "Hello", overrides: Partial<ChatSendInput> = {}): ChatSendInput { return { body, mentions: [], priority: "normal", clientMessageId: `message-${Math.random().toString(36).slice(2)}`, ...overrides }; }
export function membershipSources(): ChatSources { const { seed, estimates, workflowTasks } = chatFixtureData(); return { project: seed.projects[0]!, users: seed.users, leads: seed.leads, grants: seed.projectAccessGrants, estimates, workflowTasks, designTasks: [] }; }
