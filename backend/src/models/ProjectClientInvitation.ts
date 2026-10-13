import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true },
  projectId: { type: String, required: true, immutable: true, unique: true },
  emailNormalized: { type: String, required: true, immutable: true },
  invitedById: { type: String, required: true, immutable: true },
  tokenIssuedById: { type: String, required: true },
  tokenIssuerVersion: { type: Number, required: true, min: 1 },
  tokenHash: { type: String, default: null, select: false, match: /^[a-f0-9]{64}$/ },
  tokenGeneration: { type: Number, required: true, min: 1 },
  issuedAt: { type: String, required: true },
  expiresAt: { type: String, required: true },
  status: { type: String, required: true, enum: ["pending", "accepted", "revoked"] },
  acceptedUserId: { type: String, default: null },
  acceptedAt: { type: String, default: null },
  revokedById: { type: String, default: null },
  revokedAt: { type: String, default: null },
  deliveryStatus: { type: String, required: true, enum: ["queued", "sent", "failed"] },
  deliveryFailureCode: { type: String, default: null, match: /^[A-Z0-9_]{1,64}$/ },
  deliveryAttemptedAt: { type: String, default: null },
  sentAt: { type: String, default: null },
  version: { type: Number, required: true, min: 1 },
  createdAt: { type: String, required: true },
  updatedAt: { type: String, required: true }
}, { strict: "throw", versionKey: false });
schema.index({ tokenHash: 1 }, { unique: true, partialFilterExpression: { tokenHash: { $type: "string" } } });
schema.index({ emailNormalized: 1, issuedAt: -1 });
export const ProjectClientInvitationModel = models.ProjectClientInvitation ?? model("ProjectClientInvitation", schema);

const receiptSchema = new Schema({
  _id: { type: String, required: true },
  actorId: { type: String, required: true },
  fingerprint: { type: String, required: true },
  projectId: { type: String, required: true }
}, { strict: "throw", versionKey: false });
export const ProjectInitiationReceiptModel = models.ProjectInitiationReceipt ?? model("ProjectInitiationReceipt", receiptSchema);
