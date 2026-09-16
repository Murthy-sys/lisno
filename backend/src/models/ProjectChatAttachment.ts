import { model, models, Schema } from "./mongoose.js";
const transfer = new Schema({token: {type: String, required: true}, expiresAt: {type: String, required: true}, kind: {type: String, enum: ["upload", "replay"], required: true}}, {_id: false});
const cleanup = new Schema({token: {type: String, required: true}, workerId: {type: String, required: true}, expiresAt: {type: String, required: true}, attempts: {type: Number, min: 1, required: true}, lastErrorCode: {type: String, default: null}}, {_id: false});
const schema = new Schema({
  _id: {type: String, required: true, immutable: true}, projectId: {type: String, required: true, immutable: true}, uploaderId: {type: String, required: true, immutable: true},
  clientUploadId: {type: String, required: true, immutable: true}, declaredBytes: {type: Number, required: true, immutable: true, min: 1}, reservedBytes: {type: Number, required: true, min: 1},
  generation: {type: Number, required: true, min: 1}, version: {type: Number, required: true, min: 1},
  status: {type: String, required: true, enum: ["uploading", "ready", "attached", "cleanup_pending", "deleted"]},
  originalReference: {type: String, required: true}, previewReference: {type: String, required: true},
  metadata: {type: Schema.Types.Mixed, default: null}, sha256: {type: String, default: null}, requestFilename: {type: String, default: null}, requestMimeType: {type: String, default: null},
  transfer: {type: transfer, default: null}, expiresAt: {type: String, default: null}, messageId: {type: String, default: null}, messagePosition: {type: Number, default: null, min: 0},
  cleanupAfter: {type: String, default: null}, cleanup: {type: cleanup, default: null}, createdAt: {type: String, required: true, immutable: true}, updatedAt: {type: String, required: true}
}, {versionKey: false});
schema.index({projectId: 1, uploaderId: 1, clientUploadId: 1}, {unique: true});
schema.index({projectId: 1, uploaderId: 1, status: 1});
schema.index({projectId: 1, uploaderId: 1, "transfer.expiresAt": 1});
schema.index({status: 1, cleanupAfter: 1, _id: 1});
schema.index({projectId: 1, messageId: 1});
export const ProjectChatAttachmentModel = models.ProjectChatAttachment ?? model("ProjectChatAttachment", schema);
