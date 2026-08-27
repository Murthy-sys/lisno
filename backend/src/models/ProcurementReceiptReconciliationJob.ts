import { model, models, Schema } from "./mongoose.js";

const procurementReceiptReconciliationJobSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
    projectId: { type: String, required: true, immutable: true },
    idempotencyKey: {
      type: String,
      required: true,
      immutable: true,
      maxlength: 128
    },
    contentSha256: {
      type: String,
      required: true,
      immutable: true,
      match: /^[a-f0-9]{64}$/u
    },
    sizeBytes: { type: Number, required: true, immutable: true, min: 1 },
    storageReference: {
      type: String,
      required: true,
      immutable: true,
      select: false
    },
    status: {
      type: String,
      enum: ["pending", "committed", "aborted", "dead_letter"],
      required: true
    },
    cleanupStatus: {
      type: String,
      enum: ["deleted", "scheduled"],
      default: null
    },
    attempts: { type: Number, required: true, min: 0 },
    lastErrorCode: { type: String, default: null, maxlength: 64 },
    lastAttemptAt: { type: Date, default: null },
    nextAttemptAt: { type: Date, required: true },
    leaseToken: {
      type: String,
      default: null,
      maxlength: 128,
      select: false
    },
    leaseExpiresAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    deadLetteredAt: { type: Date, default: null }
  },
  { timestamps: true, versionKey: false, strict: "throw" }
);

procurementReceiptReconciliationJobSchema.index(
  { projectId: 1, idempotencyKey: 1, contentSha256: 1, storageReference: 1 },
  { unique: true }
);
procurementReceiptReconciliationJobSchema.index({
  status: 1,
  nextAttemptAt: 1,
  leaseExpiresAt: 1,
  createdAt: 1,
  _id: 1
});

export const ProcurementReceiptReconciliationJobModel =
  models.ProcurementReceiptReconciliationJob ??
  model(
    "ProcurementReceiptReconciliationJob",
    procurementReceiptReconciliationJobSchema
  );
