import { model, models, Schema } from "./mongoose.js";
const schema = new Schema({
  _id: { type: String, required: true, immutable: true }, recipientId: { type: String, required: true, immutable: true },
  recipientRole: { type: String, enum: ["procurement", "super_admin"], required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true }, entityId: { type: String, required: true, immutable: true },
  conditionKey: { type: String, required: true, immutable: true }, kind: { type: String, required: true, immutable: true },
  tab: { type: String, enum: ["vendors", "payments", "progress", "handover", "signoff"], required: true, immutable: true },
  localDate: { type: String, required: true, immutable: true }, timezone: { type: String, required: true, immutable: true },
  title: { type: String, required: true, immutable: true }, message: { type: String, required: true, immutable: true },
  snapshot: { type: Schema.Types.Mixed, required: true, immutable: true },
  createdAt: { type: Date, required: true, immutable: true }, createdById: { type: String, required: true, immutable: true },
  readAt: { type: Date, default: null }, resolvedAt: { type: Date, default: null },
  lastEvaluatedAt: { type: Date, required: true }
}, { strict: "throw", versionKey: false });
schema.index({ recipientId: 1, projectId: 1, conditionKey: 1, kind: 1, localDate: 1 }, { unique: true });
schema.index({ recipientId: 1, readAt: 1, createdAt: -1, _id: -1 });
schema.index({ projectId: 1, resolvedAt: 1 });
export const ProcurementLifecycleNotificationModel = models.ProcurementLifecycleNotification ?? model("ProcurementLifecycleNotification", schema);
