import { ProjectChatActionTypeModel, ProjectChatExclusionModel } from "../models/ProjectChatAction.js";
import { ChatNotificationModel } from "../models/ChatNotification.js";
import type { NotificationRecord } from "./notifications.js";
import mongoose, { type ClientSession, type Model } from "mongoose";
import { randomUUID } from "node:crypto";
import { ProjectModel } from "../models/Project.js";
import { UserModel } from "../models/User.js";
import { LeadModel } from "../models/Lead.js";
import { EstimateModel } from "../models/Estimate.js";
import { TaskModel } from "../models/Task.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { ProjectAccessGrantModel } from "../models/ProjectAccessGrant.js";
import { ProjectChatEventModel, ProjectChatIssueHistoryModel, ProjectChatMessageModel, ProjectChatOperationModel, ProjectChatParticipantAssignmentModel, ProjectChatReadStateModel, ProjectChatStateModel } from "../models/ProjectChat.js";
import { ProjectChatAttachmentModel } from "../models/ProjectChatAttachment.js";
import { ProjectChatTypingModel, ProjectChatTypingRateModel } from "../models/ProjectChatTyping.js";
import { createChatAttachmentOperations } from "./project-chat-attachment-operations.js";
import { createMongoRepository } from "./mongo.js";
import type { AppRepository, ProjectRecord, UserRecord } from "./types.js";
import type { ChatExclusion, ChatAttachmentRecord, ChatMessageScan, ChatSources, ChatStoredMessage, ChatTransaction, ChatTypingRecord, ChatTypingRateRecord, ProjectChatRepository } from "./project-chat.js";
import { ApiError } from "../middleware/errors.js";
export function createMongoProjectChatRepository(_repository?: AppRepository): ProjectChatRepository {
    const run = async <T>(write: boolean, operation: (tx: ChatTransaction) => Promise<T>): Promise<T> => {
        for (let attempt = 0; attempt < 4; attempt++) {
            const session = await mongoose.startSession();
            try {
                let result: T | undefined;
                await session.withTransaction(async () => {
                    const app = createMongoRepository(session);
                    // Acquire the same global fence as source writers before starting the authorization snapshot.
                    if (write)
                        await app.coordinateAuthorizationMutation();
                    result = await operation(mongoTransaction(app, session));
                }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });
                return result as T;
            }
            catch (error) {
                if ((error as {
                    code?: number;
                }).code !== 11000)
                    throw error;
                if (attempt === 3)
                    throw new ApiError(409, "CHAT_CONFLICT", "The conversation changed. Retry the action.");
            }
            finally {
                await session.endSession();
            }
        }
        throw new Error("Chat transaction retry exhausted.");
    };
    return { kind: "mongo", snapshot: operation => run(false, operation), mutate: operation => run(true, operation) };
}
function record<T>(row: any): T { if (!row)
    return row; const { _id, __v, ...fields } = row; return { ...fields, id: String(_id) } as T; }
function document<T extends {
    id: string;
}>(value: T) { const { id, ...fields } = value; return { _id: id, ...fields }; }
function mongoTransaction(app: AppRepository, session: ClientSession): ChatTransaction {
    const find = async <T>(model: Model<any>, query: Record<string, unknown>): Promise<T[]> => (await model.find(query).session(session).lean()).map((row) => record<T>(row));
    const typingRecord = <T>(row: any): T => row ? record<T>({ ...row, cleanupAt: new Date(row.cleanupAt).toISOString() }) : row;
    return {
        app, session,
        async insertNotification(row) { await ChatNotificationModel.create([document(row)], {session}); },
        async notification(id, recipientId) { return record(await ChatNotificationModel.findOne({_id: id, recipientId}).session(session).lean()); },
        async notificationProjectIds(recipientId) { return ChatNotificationModel.distinct("projectId", {recipientId}).session(session).exec(); },
        async notificationPage(recipientId, projectIds, limit, offset) {
            const filter = {recipientId, projectId: {$in: projectIds}};
            const total = await ChatNotificationModel.countDocuments(filter).session(session);
            const unreadCount = await ChatNotificationModel.countDocuments({...filter, readAt: null}).session(session);
            const items = (await ChatNotificationModel.find(filter).sort({createdAt: -1, _id: -1}).skip(offset).limit(limit).session(session).lean()).map(row => record<NotificationRecord>(row));
            return {items, total, unreadCount};
        },
        async readNotification(id, recipientId, now) { await ChatNotificationModel.updateOne({_id: id, recipientId, readAt: null}, {$set: {readAt: now}}, {session}); },
        async claimNotificationEmail(now, leaseExpiresAt, token) {
            return record(await ChatNotificationModel.findOneAndUpdate({$or: [{"email.status": "pending", "email.nextAttemptAt": {$lte: now}}, {"email.status": "leased", "email.leaseExpiresAt": {$lte: now}}]}, {$set: {"email.status": "leased", "email.leaseToken": token, "email.leaseExpiresAt": leaseExpiresAt}, $inc: {"email.attempts": 1}}, {sort: {createdAt: 1, _id: 1}, returnDocument: "after", session}).lean());
        },
        async settleNotificationEmail(id, token, now, email) {
            const result = await ChatNotificationModel.updateOne({_id: id, "email.status": "leased", "email.leaseToken": token, "email.leaseExpiresAt": {$gt: now}}, {$set: {email}}, {session, runValidators: true});
            return result.matchedCount === 1;
        },
        async typingByComposer(projectId, userId, sessionScope, composerId) { return typingRecord<ChatTypingRecord>(await ProjectChatTypingModel.findOne({ projectId, userId, sessionScope, composerId }).session(session).lean()); },
        async typingByUser(projectId, userId, now, limit) { return (await ProjectChatTypingModel.find({ projectId, userId, cleanupAt: { $gt: new Date(now) } }).sort({ _id: 1 }).limit(limit).session(session).lean()).map(row => typingRecord<ChatTypingRecord>(row)); },
        async activeTyping(projectId, now, limit) { return (await ProjectChatTypingModel.find({ projectId, expiresAt: { $gt: now } }).sort({ userId: 1, _id: 1 }).limit(limit).session(session).lean()).map(row => typingRecord<ChatTypingRecord>(row)); },
        async saveTyping(row) {
            const { _id, projectId, userId, sessionScope, composerId, role, sessionVersion, sessionExpiresAt, ...mutable } = document(row);
            await ProjectChatTypingModel.updateOne({ _id }, { $set: mutable, $setOnInsert: { projectId, userId, sessionScope, composerId, role, sessionVersion, sessionExpiresAt } }, { upsert: true, session, runValidators: true });
        },
        async typingRate(projectId, userId) { return typingRecord<ChatTypingRateRecord>(await ProjectChatTypingRateModel.findOne({ projectId, userId }).session(session).lean()); },
        async saveTypingRate(row) {
            const { _id, projectId, userId, ...mutable } = document(row);
            await ProjectChatTypingRateModel.updateOne({ _id }, { $set: mutable, $setOnInsert: { projectId, userId } }, { upsert: true, session, runValidators: true });
        },
        ...createChatAttachmentOperations({
            async get(projectId, id) { return record(await ProjectChatAttachmentModel.findOne({_id: id, projectId}).session(session).lean()); },
            async byKey(projectId, uploaderId, key) { return record(await ProjectChatAttachmentModel.findOne({projectId, uploaderId, clientUploadId: key}).session(session).lean()); },
            async many(projectId, ids) { return ids.length ? find<ChatAttachmentRecord>(ProjectChatAttachmentModel, {projectId, _id: {$in: ids}}) : []; },
            async active(projectId, uploaderId, now) { return find<ChatAttachmentRecord>(ProjectChatAttachmentModel, {projectId, uploaderId, $or: [{status: {$in: ["uploading", "ready", "cleanup_pending"]}}, {"transfer.expiresAt": {$gt: now}}]}); },
            async due(now, limit) { return (await ProjectChatAttachmentModel.find({status: {$in: ["uploading", "ready", "cleanup_pending"]}, cleanupAfter: {$lte: now}, $or: [{cleanup: null}, {"cleanup.expiresAt": {$lte: now}}]}).sort({cleanupAfter: 1, _id: 1}).limit(limit).session(session).lean()).map(row => record<ChatAttachmentRecord>(row)); },
            async save(row, expectedVersion) {
                if (expectedVersion === null) { await ProjectChatAttachmentModel.create([document(row)], {session}); return; }
                const {_id, projectId, uploaderId, clientUploadId, declaredBytes, createdAt, ...mutable} = document(row);
                const result = await ProjectChatAttachmentModel.updateOne({_id, projectId, version: expectedVersion}, {$set: mutable}, {session, runValidators: true});
                if (result.matchedCount !== 1) throw new ApiError(409, "CHAT_ATTACHMENT_CONFLICT", "The attachment changed. Retry the action.");
            }
        }),
        async sources(projectId) {
            const project = await ProjectModel.findById(projectId).session(session).lean();
            if (!project)
                return null;
            const leads = await find<ChatSources["leads"][number]>(LeadModel, { projectId });
            const estimates = await find<ChatSources["estimates"][number]>(EstimateModel, { $or: [{ projectId }, { leadId: { $in: leads.map((lead) => lead.id) } }] });
            const missingLeadIds = estimates.map((estimate) => estimate.leadId).filter((id) => !leads.some((lead) => lead.id === id));
            if (missingLeadIds.length)
                leads.push(...await find<ChatSources["leads"][number]>(LeadModel, { _id: { $in: missingLeadIds } }));
            const workflowTasks = await find<ChatSources["workflowTasks"][number]>(ProjectWorkflowTaskModel, { projectId });
            const designTasks = await find<ChatSources["designTasks"][number]>(TaskModel, { projectId });
            const grants = await find<ChatSources["grants"][number]>(ProjectAccessGrantModel, { projectId, active: true });
            const exclusions = await find<ChatExclusion>(ProjectChatExclusionModel, { projectId });
            const selections = await ProjectChatParticipantAssignmentModel.find({ projectId, active: true }).select({ userId: 1 }).session(session).lean();
            const ids = new Set([project.clientId, project.initiatingDesignerId, project.assignedEstimatorId, project.managerId, ...project.assignedDesignerIds, ...leads.map((lead) => lead.ownerId), ...estimates.flatMap((estimate) => [estimate.ownerId, estimate.assignedDesignerId, estimate.assignedManagerId, estimate.designPlanDesignerId]), ...workflowTasks.map((task) => task.assigneeUserId), ...designTasks.map((task) => task.ownerId), ...grants.map((grant) => grant.userId), ...selections.map((selection) => selection.userId), ...exclusions.map(row => row.userId)].filter(Boolean));
            const users = await find<UserRecord>(UserModel, { _id: { $in: [...ids] }, active: true });
            const superAdmins = (await UserModel.find({ role: "super_admin", active: true }).limit(2).session(session).lean()).map((row) => record<UserRecord>(row));
            for (const user of superAdmins)
                if (!users.some((candidate) => candidate.id === user.id))
                    users.push(user);
            return { project: record<ProjectRecord>(project), users, leads, estimates, workflowTasks, designTasks, grants, exclusions };
        },
        async projectPage(input) {
            const [page] = await ProjectModel.aggregate([
                {$project: {_id: 1, name: 1}},
                {$lookup: {from: ProjectChatStateModel.collection.name, localField: "_id", foreignField: "_id", as: "chatState"}},
                {$set: {lastMessageAt: {$ifNull: [{$arrayElemAt: ["$chatState.lastMessageAt", 0]}, null]}}},
                {$facet: {
                    items: [
                        {$sort: {lastMessageAt: -1, name: 1, _id: 1}},
                        {$skip: input.offset}, {$limit: input.limit},
                        {$project: {_id: 0, id: "$_id", name: 1, lastMessageAt: 1}}
                    ],
                    count: [{$count: "total"}]
                }}
            ]).collation({locale: "en"}).session(session).exec();
            return {items: page?.items ?? [], total: page?.count?.[0]?.total ?? 0};
        },
        async candidateProjectIds(user) {
            if (user.role === "super_admin")
                return (await ProjectModel.find({}).select({ _id: 1 }).session(session).lean()).map((row) => String(row._id));
            const ids = new Set<string>();
            const projectRows = await ProjectModel.find({ $or: [{ clientId: user.id }, { initiatingDesignerId: user.id }, { assignedDesignerIds: user.id }, { managerId: user.id }, { assignedEstimatorId: user.id }] }).select({ _id: 1 }).session(session).lean();
            for (const row of projectRows)
                ids.add(String(row._id));
            for (const [model, query] of [[ProjectAccessGrantModel, { userId: user.id, active: true }], [ProjectChatParticipantAssignmentModel, { userId: user.id, active: true }], [ProjectWorkflowTaskModel, { assigneeUserId: user.id }], [TaskModel, { ownerId: user.id }], [LeadModel, { ownerId: user.id }]] as const) {
                const rows = await model.find(query).select({ projectId: 1 }).session(session).lean();
                for (const row of rows)
                    if (row.projectId)
                        ids.add(String(row.projectId));
            }
            const estimates = await EstimateModel.find({ $or: [{ ownerId: user.id }, { assignedDesignerId: user.id }, { assignedManagerId: user.id }, { designPlanDesignerId: user.id }] }).select({ projectId: 1, leadId: 1 }).session(session).lean();
            for (const row of estimates)
                if (row.projectId)
                    ids.add(String(row.projectId));
            const legacyLeadIds = estimates.filter((row) => !row.projectId).map((row) => row.leadId);
            if (legacyLeadIds.length)
                for (const row of await LeadModel.find({ _id: { $in: legacyLeadIds }, projectId: { $ne: null } }).select({ projectId: 1 }).session(session).lean())
                    ids.add(String(row.projectId));
            return [...ids];
        },
        async directory(input) {
            const escaped = input.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const roleMatches = input.roles.filter((role) => role.replaceAll("_", " ").includes(input.search.toLocaleLowerCase()));
            const query = { active: true, role: { $in: input.roles }, _id: { $nin: input.excludeIds }, ...(input.search ? { $or: [{ name: { $regex: escaped, $options: "i" } }, { role: { $in: roleMatches } }] } : {}) };
            return (await UserModel.find(query).sort({ name: 1, _id: 1 }).limit(input.limit).session(session).lean()).map((row) => record<UserRecord>(row));
        },
        async actionTypes() { return find(ProjectChatActionTypeModel, {}); },
        async saveActionType(row) { await ProjectChatActionTypeModel.create([document(row)], { session }); },
        async saveExclusion(row) {
            if (row.version === 1) { await ProjectChatExclusionModel.create([document(row)], { session }); return; }
            const result = await ProjectChatExclusionModel.updateOne({ _id: row.id, projectId: row.projectId, userId: row.userId, version: row.version - 1 }, { $set: { person: row.person, active: row.active, version: row.version }, $push: { history: row.history[row.history.length - 1] } }, { session, runValidators: true });
            if (result.matchedCount !== 1) throw new ApiError(409, "CHAT_CONFLICT", "The participant changed.");
        },
        async selections(projectId) { return find(ProjectChatParticipantAssignmentModel, { projectId, active: true }); },
        async findSelection(projectId, id) { return record(await ProjectChatParticipantAssignmentModel.findOne({ _id: id, projectId }).session(session).lean()); },
        async saveSelection(value) {
            if (value.version === 1) {
                await ProjectChatParticipantAssignmentModel.create([document(value)], { session });
                return;
            }
            const result = await ProjectChatParticipantAssignmentModel.updateOne(
                { _id: value.id, projectId: value.projectId, version: value.version - 1 },
                { $set: { active: value.active, version: value.version, revokedBy: value.revokedBy, revokedAt: value.revokedAt, revocationReason: value.revocationReason } },
                { session, runValidators: true }
            );
            if (result.matchedCount !== 1) throw new ApiError(409, "CHAT_CONFLICT", "The participant selection changed.");
        },
        async state(projectId) { const row = await ProjectChatStateModel.findById(projectId).session(session).lean(); return row ? { sequence: Number(row.sequence), latestMessageSequence: Number(row.latestMessageSequence), lastMessageAt: row.lastMessageAt as string | null } : { sequence: 0, latestMessageSequence: 0, lastMessageAt: null }; },
        async allocate(projectId, messageAt) {
            const row = await ProjectChatStateModel.findOneAndUpdate({ _id: projectId }, { $inc: { sequence: 1 }, $setOnInsert: { latestMessageSequence: 0, lastMessageAt: null } }, { upsert: true, returnDocument: "after", session, runValidators: true }).lean();
            const sequence = Number(row!.sequence);
            if (!Number.isSafeInteger(sequence))
                throw new Error("Chat sequence exhausted.");
            if (messageAt)
                await ProjectChatStateModel.updateOne({ _id: projectId }, { $set: { latestMessageSequence: sequence, lastMessageAt: messageAt } }, { session });
            return sequence;
        },
        async message(projectId, id) { return record(await ProjectChatMessageModel.findOne({ _id: id, projectId }).session(session).lean()); },
        async messages(scan) { if (scan.limit <= 0)
            return []; return (await ProjectChatMessageModel.find(messageFilter(scan)).sort({ sequence: scan.ascending ? 1 : -1 }).limit(scan.limit).session(session).lean()).map((row) => record<ChatStoredMessage>(row)); },
        async saveMessage(value) {
            if (value.version === 1) {
                await ProjectChatMessageModel.create([document(value)], { session });
                return;
            }
            const result = await ProjectChatMessageModel.updateOne(
                { _id: value.id, projectId: value.projectId, version: value.version - 1 },
                { $set: { priority: value.priority, issueStatus: value.issueStatus, raisedBy: value.raisedBy, responsible: value.responsible, version: value.version, ...(value.action ? { "action.dueDate": value.action.dueDate } : {}) } },
                { session, runValidators: true }
            );
            if (result.matchedCount !== 1) throw new ApiError(409, "CHAT_CONFLICT", "The message changed.");
        },
        async history(projectId, messageId) { return (await ProjectChatIssueHistoryModel.find({ projectId, messageId }).sort({ version: -1 }).limit(50).session(session).lean()).reverse().map((row) => row.entry); },
        async appendHistory(value) { await ProjectChatIssueHistoryModel.create([document(value)], { session }); },
        async counts(projectId, userId, sequence) {
            const count = (query: Record<string, unknown>) => ProjectChatMessageModel.countDocuments({ projectId, ...query }).session(session).exec();
            const openCritical = await count({ priority: "critical", issueStatus: "open" });
            const openImportant = await count({ priority: "important", issueStatus: "open" });
            const unreadFilter = { sequence: { $gt: sequence }, "author.id": { $ne: userId } };
            return { openCritical, openImportant, unread: await count(unreadFilter), unreadMentions: await count({ ...unreadFilter, "mentions.userId": userId }) };
        },
        async recentSendCount(projectId, userId, since) { return ProjectChatMessageModel.countDocuments({ projectId, "author.id": userId, createdAt: { $gte: since } }).session(session).exec(); },
        async readState(projectId, userId) { return record(await ProjectChatReadStateModel.findOne({ projectId, userId }).session(session).lean()); },
        async saveReadState(value) { await ProjectChatReadStateModel.updateOne({ projectId: value.projectId, userId: value.userId }, { $set: value, $setOnInsert: { _id: `chat-read-${randomUUID()}` } }, { upsert: true, session, runValidators: true }); },
        async operation(projectId, actorId, kind, key) { return record(await ProjectChatOperationModel.findOne({ projectId, actorId, kind, key }).session(session).lean()); },
        async saveOperation(value) { await ProjectChatOperationModel.create([document(value)], { session }); },
        async appendEvent(value) { await ProjectChatEventModel.create([document(value)], { session }); },
        async events(projectId, after, atMost, limit) { return (await ProjectChatEventModel.find({ projectId, sequence: { $gt: after, $lte: atMost } }).sort({ sequence: 1 }).limit(limit).session(session).lean()).map((row) => record(row)); }
    };
}
function messageFilter(scan: ChatMessageScan): Record<string, unknown> {
    const query: Record<string, unknown> = { projectId: scan.projectId };
    if (scan.before !== undefined || scan.after !== undefined || scan.atMost !== undefined)
        query.sequence = { ...(scan.before === undefined ? {} : { $lt: scan.before }), ...(scan.after === undefined ? {} : { $gt: scan.after }), ...(scan.atMost === undefined ? {} : { $lte: scan.atMost }) };
    if (scan.filter === "mentions")
        query["mentions.userId"] = scan.userId;
    if (scan.filter === "important" || scan.filter === "critical") {
        query.priority = scan.filter;
        query.issueStatus = "open";
    }
    if (scan.filter === "resolved")
        query.issueStatus = "resolved";
    return query;
}
