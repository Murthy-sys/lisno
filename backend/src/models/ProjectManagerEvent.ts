import { model, models, Schema } from "./mongoose.js";
const schema = new Schema({
  _id: { type: String, required: true }, projectId: { type: String, required: true, index: true },
  entityId: { type: String, required: true }, family: { type: String, required: true },
  actorId: { type: String, required: true }, actorName: { type: String, required: true },
  idempotencyKey: { type: String, required: true }, digest: { type: String, required: true },
  action: { type: String, required: true }, reason: { type: String, default: null },
  version: { type: Number, required: true }, occurredAt: { type: Date, required: true },
  result: { type: Schema.Types.Mixed, required: true },
  recipientIds: { type: [String], default: [] }, readBy: { type: [String], default: [] }
}, { versionKey: false });
schema.index({ projectId: 1, actorId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ projectId: 1, entityId: 1, occurredAt: -1 });
schema.index({ recipientIds: 1, occurredAt: -1 });
export const ProjectManagerEventModel = models.ProjectManagerEvent ?? model("ProjectManagerEvent", schema);
