import { model, models, Schema } from "./mongoose.js";

const revision = new Schema({
  _id: { type: String, required: true }, projectId: { type: String, required: true, immutable: true }, version: { type: Number, required: true, immutable: true },
  timezone: { type: String, required: true, immutable: true }, reminderTime: { type: String, required: true, immutable: true }, deadlineTime: { type: String, required: true, immutable: true }, escalationTime: { type: String, required: true, immutable: true },
  effectiveDate: { type: String, required: true, immutable: true }, effectiveAt: { type: Date, required: true, immutable: true }, actorId: { type: String, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true }, requestDigest: { type: String, required: true, immutable: true }, reason: { type: String, required: true, immutable: true }, createdAt: { type: Date, required: true, immutable: true }
}, { collection: "executionReportingPolicies", versionKey: false, strict: "throw" });
revision.index({ projectId: 1, version: 1 }, { unique: true });
revision.index({ projectId: 1, actorId: 1, idempotencyKey: 1 }, { unique: true });
revision.index({ projectId: 1, effectiveAt: -1 });
const head = new Schema({ _id: { type: String, required: true }, version: { type: Number, required: true }, updatedAt: { type: Date, required: true } }, { collection: "executionReportingPolicyHeads", versionKey: false, strict: "throw" });
export const ExecutionReportingPolicyModel = models.ExecutionReportingPolicy ?? model("ExecutionReportingPolicy", revision);
export const ExecutionReportingPolicyHeadModel = models.ExecutionReportingPolicyHead ?? model("ExecutionReportingPolicyHead", head);
