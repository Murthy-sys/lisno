import { model, models, Schema } from "./mongoose.js";

const text = { type: String, default: null, maxlength: 2_000 };
const schedule = new Schema({ startDate: { type: String, required: true }, finishDate: { type: String, required: true }, revision: { type: Number, required: true }, confirmedAt: { type: Date, required: true }, confirmedById: { type: String, required: true } }, { _id: false, strict: "throw" });
const proposal = new Schema({ startDate: { type: String, required: true }, finishDate: { type: String, required: true }, reason: text }, { _id: false, strict: "throw" });
const hold = new Schema({ reason: { type: String, required: true }, startedAt: { type: Date, required: true }, reviewDate: { type: String, required: true }, grantedById: { type: String, required: true } }, { _id: false, strict: "throw" });
const exemption = new Schema({ reason: { type: String, required: true }, grantedById: { type: String, required: true }, executionRound: { type: Number, required: true } }, { _id: false, strict: "throw" });
const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  assignmentId: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true }, vendorId: { type: String, required: true, immutable: true },
  workflowVersion: { type: Number, required: true, enum: [1], immutable: true }, version: { type: Number, required: true, min: 1 }, executionRound: { type: Number, required: true, min: 1 },
  status: { type: String, required: true, enum: ["assigned", "awaiting_schedule", "not_started", "in_progress", "blocked", "awaiting_verification", "site_verified", "changes_requested"] },
  progress: { type: Number, required: true, min: 0, max: 100, validate: Number.isSafeInteger }, latestNote: { type: String, default: "", maxlength: 2_000 }, latestReportAt: { type: Date, default: null },
  acknowledgedAt: { type: Date, default: null }, accessAvailableAt: { type: Date, default: null }, proposedSchedule: { type: proposal, default: null }, schedule: { type: schedule, default: null },
  reportingStartsOn: { type: String, default: null }, hold: { type: hold, default: null }, evidenceExemption: { type: exemption, default: null },
  submissionId: { type: String, default: null }, verificationId: { type: String, default: null }, roundStartedAt: { type: Date, required: true },
  createdAt: { type: Date, required: true, immutable: true }, updatedAt: { type: Date, required: true }
}, { collection: "vendorExecutionStates", timestamps: false, versionKey: false, strict: "throw" });
schema.index({ assignmentId: 1 }, { unique: true });
schema.index({ projectId: 1, status: 1, _id: 1 });
schema.index({ vendorId: 1, status: 1, _id: 1 });
schema.index({ reportingStartsOn: 1, status: 1, _id: 1 });
export const VendorExecutionStateModel = models.VendorExecutionState ?? model("VendorExecutionState", schema);
