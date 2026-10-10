import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true },
  vendorId: { type: String, required: true, immutable: true },
  orderId: { type: String, required: true, immutable: true },
  revision: { type: Number, required: true, min: 1, immutable: true },
  approvedRevisionId: { type: String, required: true, immutable: true },
  actorId: { type: String, required: true, immutable: true },
  occurredAt: { type: Date, required: true, immutable: true },
  dispatchAuthorizedAt: { type: Date, default: null },
  dispatchAuthorization: { type: String, enum: ["issuance", "manual", null], default: null },
  requestedAction: { type: String, enum: ["send_invitation", "resend_invitation", "send_work_notification", null], default: null },
  requestedCommandId: { type: String, default: null },
  requestedById: { type: String, default: null },
  expectedInvitationId: { type: String, default: null },
  expectedInvitationVersion: { type: Number, default: null },
  state: { type: String, enum: ["queued", "sent", "failed", "delivery_unavailable", "intervention_required", "cancelled"], default: "queued" },
  access: { type: String, enum: ["unknown", "setup_pending", "active", "blocked"], default: "unknown" },
  version: { type: Number, default: 1, min: 1 },
  attempts: { type: Number, default: 0, min: 0 },
  nextAttemptAt: { type: Date, required: true },
  leaseToken: { type: String, default: null, select: false },
  leaseUntil: { type: Date, default: null },
  invitationId: { type: String, default: null },
  failureCode: { type: String, default: null, maxlength: 64 },
  sentAt: { type: Date, default: null },
  retryReceipts: { type: [{ key: { type: String, required: true }, digest: { type: String, required: true }, actorId: { type: String, required: true } }], default: [] }
}, { collection: "vendorAccessIntents", timestamps: true, versionKey: false, strict: "throw" });
schema.index({ orderId: 1, revision: 1, vendorId: 1 }, { unique: true });
schema.index({ state: 1, nextAttemptAt: 1, leaseUntil: 1, _id: 1 });
schema.index({ projectId: 1, occurredAt: -1, _id: 1 });
export const VendorAccessIntentModel = models.VendorAccessIntent ?? model("VendorAccessIntent", schema);
