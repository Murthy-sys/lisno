import { model, models, Schema } from "./mongoose.js";
const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  vendorId: { type: String, required: true, immutable: true },
  actorId: { type: String, required: true, immutable: true },
  actorVersion: { type: Number, required: true, immutable: true },
  contactName: { type: String, required: true, immutable: true },
  contactMobile: { type: String, required: true, immutable: true },
  emailNormalized: { type: String, required: true, immutable: true },
  expectedVendorVersion: { type: Number, required: true, immutable: true },
  expectedInvitationId: { type: String, default: null, immutable: true },
  expectedInvitationVersion: { type: Number, default: null, immutable: true },
  action: { type: String, enum: ["send_invitation", "resend_invitation"], required: true, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true },
  digest: { type: String, required: true, immutable: true },
  state: { type: String, enum: ["queued", "sent", "failed", "intervention_required"], default: "queued" },
  version: { type: Number, default: 1 },
  attempts: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, required: true },
  leaseToken: { type: String, default: null, select: false },
  leaseUntil: { type: Date, default: null },
  invitationId: { type: String, default: null },
  failureCode: { type: String, default: null, maxlength: 64 },
  sentAt: { type: Date, default: null }
}, { collection: "procurementVendorInvitationIntents", timestamps: true, versionKey: false, strict: "throw" });
schema.index({ vendorId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ state: 1, nextAttemptAt: 1, leaseUntil: 1, _id: 1 });
schema.index({ vendorId: 1, createdAt: -1, _id: 1 });
export const ProcurementVendorInvitationIntentModel = models.ProcurementVendorInvitationIntent ?? model("ProcurementVendorInvitationIntent", schema);
