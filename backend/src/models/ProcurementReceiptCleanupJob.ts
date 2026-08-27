import { model, models, Schema } from "./mongoose.js";

const procurementReceiptCleanupJobSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
    storageReference: {
      type: String,
      required: true,
      immutable: true,
      select: false
    },
    status: {
      type: String,
      enum: ["pending", "completed", "dead_letter"],
      required: true
    },
    attempts: { type: Number, required: true, min: 1 },
    lastErrorCode: { type: String, required: true, maxlength: 64 },
    lastAttemptAt: { type: Date, required: true },
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

procurementReceiptCleanupJobSchema.index(
  { storageReference: 1 },
  { unique: true }
);
procurementReceiptCleanupJobSchema.index({
  status: 1,
  nextAttemptAt: 1,
  leaseExpiresAt: 1,
  createdAt: 1,
  _id: 1
});

export const ProcurementReceiptCleanupJobModel =
  models.ProcurementReceiptCleanupJob ??
  model("ProcurementReceiptCleanupJob", procurementReceiptCleanupJobSchema);
