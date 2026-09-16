import { UserModel } from "../../src/models/User.js";
import { ProjectModel } from "../../src/models/Project.js";
import { LeadModel } from "../../src/models/Lead.js";
import { EstimateModel } from "../../src/models/Estimate.js";
import { ProjectWorkflowTaskModel } from "../../src/models/ProjectWorkflowTask.js";
import { ProjectAccessGrantModel } from "../../src/models/ProjectAccessGrant.js";
import { AuditEventModel } from "../../src/models/AuditEvent.js";
import { AuthorizationCoordinationModel } from "../../src/models/AuthorizationCoordination.js";
import { ProjectChatAttachmentModel } from "../../src/models/ProjectChatAttachment.js";
import { ProjectChatMessageModel, ProjectChatEventModel, ProjectChatStateModel, ProjectChatReadStateModel, ProjectChatParticipantAssignmentModel, ProjectChatOperationModel, ProjectChatIssueHistoryModel } from "../../src/models/ProjectChat.js";
import { createMongoRepository } from "../../src/repositories/mongo.js";
import { createMongoProjectChatRepository } from "../../src/repositories/project-chat-mongo.js";
import { createAuditService } from "../../src/services/audit.service.js";
import { createProjectChatService } from "../../src/services/project-chat.service.js";
import { chatFixtureData, CHAT_NOW } from "./project-chat.js";
import type { ChatActor } from "../../src/contracts/project-chat.js";
export const chatModels = [UserModel, ProjectModel, LeadModel, EstimateModel, ProjectWorkflowTaskModel, ProjectAccessGrantModel, AuditEventModel, AuthorizationCoordinationModel, ProjectChatMessageModel, ProjectChatEventModel, ProjectChatStateModel, ProjectChatReadStateModel, ProjectChatParticipantAssignmentModel, ProjectChatOperationModel, ProjectChatIssueHistoryModel, ProjectChatAttachmentModel];
export async function insertChatMongoFixture() {
    const { seed, estimates, workflowTasks } = chatFixtureData();
    const doc = ({ id, ...fields }: {
        id: string;
    }) => ({ _id: id, ...fields });
    await UserModel.insertMany(seed.users.map(doc));
    await ProjectModel.insertMany(seed.projects.map(doc));
    await LeadModel.insertMany(seed.leads.map(doc));
    await ProjectAccessGrantModel.insertMany(seed.projectAccessGrants.map(doc));
    await EstimateModel.insertMany(estimates.map((row) => ({ ...doc(row), propertyType: "villa", lineItems: row.lineItems.map((line) => ({ ...line, rate: 100 })) })));
    await ProjectWorkflowTaskModel.insertMany(workflowTasks.map((row) => ({ ...doc(row), dedupeKey: row.id, title: "Test trade", status: "completed", progress: 100, version: 1, openedAt: new Date(CHAT_NOW), completedAt: new Date(CHAT_NOW) })));
    const repository = createMongoRepository();
    const audit = createAuditService(repository);
    const chatRepository = createMongoProjectChatRepository(repository);
    const clock = () => new Date(CHAT_NOW);
    const service = createProjectChatService({ repository, audit, chatRepository, clock });
    const actor = (id: string): ChatActor => ({ id, role: seed.users.find((row) => row.id === id)!.role, sessionVersion: 1, expiresAt: Math.floor(clock().getTime() / 1000) + 3600 });
    return { seed, repository, audit, chatRepository, clock, service, actor };
}
