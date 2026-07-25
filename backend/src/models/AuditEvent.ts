import { model, models, Schema } from "mongoose";

const auditEventSchema = new Schema(
  {
    _id: { type: String, required: true },
    actorId: { type: String, ref: "User", required: true, immutable: true },
    action: { type: String, required: true, immutable: true },
    entityType: { type: String, required: true, immutable: true },
    entityId: { type: String, required: true, immutable: true },
    occurredAt: { type: Date, required: true, immutable: true },
    oldValues: { type: Schema.Types.Mixed, required: true, immutable: true },
    newValues: { type: Schema.Types.Mixed, required: true, immutable: true },
    reason: { type: String, default: null, immutable: true }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false
  }
);

auditEventSchema.index({ entityType: 1, entityId: 1, occurredAt: 1, _id: 1 });
auditEventSchema.index({ actorId: 1, occurredAt: 1 });

export const AuditEventModel =
  models.AuditEvent ?? model("AuditEvent", auditEventSchema);
