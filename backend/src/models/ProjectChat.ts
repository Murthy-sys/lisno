import { model, models, Schema } from "./mongoose.js";
import { ROLE_CODES } from "../domain/roles.js";
const person = new Schema({ id: { type: String, required: true }, name: { type: String, required: true, maxlength: 300 }, role: { type: String, enum: ROLE_CODES, required: true } }, { _id: false });
const mention = new Schema({ userId: { type: String, required: true }, start: { type: Number, required: true, min: 0 }, end: { type: Number, required: true, min: 1 } }, { _id: false });
const attachmentKinds = ["image", "video", "audio", "document", "archive"];
const attachment = new Schema({
    id: {type: String, required: true}, kind: {type: String, enum: attachmentKinds, required: true}, filename: {type: String, required: true, maxlength: 180},
    mimeType: {type: String, required: true}, byteSize: {type: Number, required: true, min: 1},
    preview: {type: new Schema({mimeType: {type: String, required: true}, byteSize: {type: Number, required: true, min: 1}, width: {type: Number, required: true, min: 1}, height: {type: Number, required: true, min: 1}}, {_id: false}), default: null}
}, {_id: false});
const attachmentSummary = new Schema({count: {type: Number, required: true, min: 1}, kind: {type: String, enum: attachmentKinds, required: true}, filename: {type: String, required: true, maxlength: 180}}, {_id: false});
const actionMetadata = new Schema({ typeId: { type: String, required: true, immutable: true }, typeName: { type: String, required: true, maxlength: 60, immutable: true }, originalDueDate: { type: String, required: true, immutable: true }, dueDate: { type: String, required: true } }, { _id: false });
const messageSchema = new Schema({
    _id: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true },
    author: { type: person, required: true, immutable: true }, body: { type: String, default: "", maxlength: 4000, immutable: true, validate: {validator: function(this: {attachments?: unknown[]}, value: string) { return Boolean(value?.trim().length || this.attachments?.length); }, message: "A message requires text or attachments."} },
    attachments: {type: [attachment], default: [], immutable: true},
    mentions: { type: [mention], default: [], immutable: true }, createdAt: { type: String, required: true, immutable: true },
    sequence: { type: Number, required: true, immutable: true, min: 1 }, clientMessageId: { type: String, required: true, immutable: true },
    replyTo: { type: new Schema({ id: { type: String, required: true }, author: { type: person, required: true }, body: { type: String, default: "", maxlength: 4000 }, attachmentSummary: {type: attachmentSummary} }, { _id: false }), default: null, immutable: true },
    priority: { type: String, enum: ["normal", "important", "critical"], required: true }, issueStatus: { type: String, enum: ["open", "resolved", null], default: null },
    raisedBy: { type: person, default: null }, responsible: { type: new Schema({ id: { type: String, required: true }, name: { type: String, required: true }, role: { type: String, enum: ROLE_CODES, required: true }, available: { type: Boolean, default: true } }, { _id: false }), default: null },
    action: { type: actionMetadata, default: null },
    version: { type: Number, required: true, min: 1 }
}, { versionKey: false });
messageSchema.index({ projectId: 1, "author.id": 1, clientMessageId: 1 }, { unique: true });
messageSchema.index({ projectId: 1, sequence: 1 }, { unique: true });
messageSchema.index({ projectId: 1, priority: 1, issueStatus: 1, sequence: -1 });
messageSchema.index({ projectId: 1, "mentions.userId": 1, sequence: -1 });
messageSchema.index({ projectId: 1, "author.id": 1, createdAt: -1 });
const eventSchema = new Schema({
    _id: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true }, sequence: { type: Number, required: true, immutable: true, min: 1 },
    type: { type: String, enum: ["message.created", "issue.changed", "participants.changed", "read.changed"], required: true, immutable: true },
    recordId: { type: String, required: true, immutable: true }, version: { type: Number, required: true, min: 1, immutable: true }, occurredAt: { type: String, required: true, immutable: true },
    actorId: { type: String, required: true, immutable: true }, privateUserId: { type: String, default: null, immutable: true }
}, { versionKey: false });
eventSchema.index({ projectId: 1, sequence: 1 }, { unique: true });
const stateSchema = new Schema({ _id: { type: String, required: true }, sequence: { type: Number, required: true, default: 0, min: 0 }, latestMessageSequence: { type: Number, required: true, default: 0, min: 0 }, lastMessageAt: { type: String, default: null } }, { versionKey: false });
const readSchema = new Schema({ _id: { type: String, required: true }, projectId: { type: String, required: true }, userId: { type: String, required: true }, sequence: { type: Number, required: true, min: 0 }, version: { type: Number, required: true, min: 1 }, updatedAt: { type: String, required: true } }, { versionKey: false });
readSchema.index({ projectId: 1, userId: 1 }, { unique: true });
const selectionSchema = new Schema({
    _id: { type: String, required: true }, projectId: { type: String, required: true, immutable: true }, userId: { type: String, required: true, immutable: true }, selectedRole: { type: String, enum: ROLE_CODES, required: true, immutable: true },
    active: { type: Boolean, required: true }, version: { type: Number, required: true, min: 1 }, selectedBy: { type: person, required: true, immutable: true }, selectedAt: { type: String, required: true, immutable: true }, reason: { type: String, required: true, maxlength: 1000, immutable: true },
    tradeReference: { type: new Schema({ estimateId: { type: String, required: true }, designPlanVersion: { type: Number, required: true, min: 1 }, role: { type: String, enum: ROLE_CODES, required: true } }, { _id: false }), default: null, immutable: true },
    revokedBy: { type: person, default: null }, revokedAt: { type: String, default: null }, revocationReason: { type: String, default: null, maxlength: 1000 }
}, { versionKey: false });
selectionSchema.index({ projectId: 1, userId: 1 }, { unique: true, partialFilterExpression: { active: true } });
selectionSchema.index({ userId: 1, active: 1, projectId: 1 });
const operationSchema = new Schema({ _id: { type: String, required: true }, projectId: { type: String, required: true }, actorId: { type: String, required: true }, key: { type: String, required: true }, kind: { type: String, required: true }, fingerprint: { type: String, required: true }, recordId: { type: String, required: true } }, { versionKey: false });
operationSchema.index({ projectId: 1, actorId: 1, kind: 1, key: 1 }, { unique: true });
const historySchema = new Schema({ _id: { type: String, required: true }, projectId: { type: String, required: true }, messageId: { type: String, required: true }, version: { type: Number, required: true }, entry: { type: Schema.Types.Mixed, required: true } }, { versionKey: false });
historySchema.index({ projectId: 1, messageId: 1, version: -1 }, { unique: true });
export const ProjectChatMessageModel = models.ProjectChatMessage ?? model("ProjectChatMessage", messageSchema);
export const ProjectChatEventModel = models.ProjectChatEvent ?? model("ProjectChatEvent", eventSchema);
export const ProjectChatStateModel = models.ProjectChatState ?? model("ProjectChatState", stateSchema);
export const ProjectChatReadStateModel = models.ProjectChatReadState ?? model("ProjectChatReadState", readSchema);
export const ProjectChatParticipantAssignmentModel = models.ProjectChatParticipantAssignment ?? model("ProjectChatParticipantAssignment", selectionSchema);
export const ProjectChatOperationModel = models.ProjectChatOperation ?? model("ProjectChatOperation", operationSchema);
export const ProjectChatIssueHistoryModel = models.ProjectChatIssueHistory ?? model("ProjectChatIssueHistory", historySchema);
