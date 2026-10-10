import { model, models, Schema } from "./mongoose.js";

const obligation = new Schema({
  _id: { type: String, required: true }, assignmentId: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true }, vendorId: { type: String, required: true, immutable: true },
  localDate: { type: String, required: true, immutable: true }, timezone: { type: String, required: true, immutable: true }, policyVersion: { type: Number, required: true, immutable: true }, executionRound: { type: Number, required: true, immutable: true },
  reminderAt: { type: Date, required: true, immutable: true }, dueAt: { type: Date, required: true, immutable: true }, escalationAt: { type: Date, required: true, immutable: true }, dayStartsAt: { type: Date, required: true, immutable: true }, dayEndsAt: { type: Date, required: true, immutable: true },
  outcome: { type: String, required: true, enum: ["pending", "on_time", "missing", "exempt"] }, exemption: { type: String, default: null }, reportedAt: { type: Date, default: null }, finalizedAt: { type: Date, default: null }, createdAt: { type: Date, required: true }
}, { collection: "executionDailyObligations", versionKey: false, strict: "throw" });
obligation.index({ assignmentId: 1, localDate: 1 }, { unique: true });
obligation.index({ projectId: 1, localDate: 1, outcome: 1 });
obligation.index({ outcome: 1, dueAt: 1 });
const cursor = new Schema({ _id: { type: String, required: true }, nextDate: { type: String, default: null }, eligible: { type: Boolean, required: true }, resumesOn: { type: String, default: null }, suspendedAt: { type: Date, default: null }, lastObservedAt: { type: Date, required: true }, revision: { type: Number, required: true } }, { collection: "executionReportingCursors", versionKey: false, strict: "throw" });
export const ExecutionDailyObligationModel = models.ExecutionDailyObligation ?? model("ExecutionDailyObligation", obligation);
export const ExecutionReportingCursorModel = models.ExecutionReportingCursor ?? model("ExecutionReportingCursor", cursor);
