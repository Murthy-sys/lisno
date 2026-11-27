import { model, models, Schema } from "./mongoose.js";
const schema = new Schema({
  _id: { type: String, required: true, immutable: true }, token: { type: String, default: null }, expiresAt: { type: Date, required: true },
  projectCursor: { type: String, default: null }, lastAttemptAt: { type: Date, default: null }, lastSuccessAt: { type: Date, default: null },
  lastSweepAt: { type: Date, default: null }, lastFailureAt: { type: Date, default: null }, failureCode: { type: String, default: null },
  cadenceSeconds: { type: Number, required: true, min: 1, default: 60 }, startedAt: { type: Date, default: null }, stoppedAt: { type: Date, default: null },
  processedCount: { type: Number, default: 0 }
}, { strict: "throw", versionKey: false });
export const ProcurementLifecycleSchedulerLeaseModel = models.ProcurementLifecycleSchedulerLease ?? model("ProcurementLifecycleSchedulerLease", schema);
