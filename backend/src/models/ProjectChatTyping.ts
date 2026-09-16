import { model, models, Schema } from "./mongoose.js";
import { ROLE_CODES } from "../domain/roles.js";

const typingSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true },
  userId: { type: String, required: true, immutable: true },
  sessionScope: { type: String, required: true, immutable: true },
  composerId: { type: String, required: true, immutable: true, maxlength: 100 },
  role: { type: String, required: true, enum: ROLE_CODES, immutable: true },
  sessionVersion: { type: Number, required: true, min: 1, immutable: true },
  sessionExpiresAt: { type: Number, required: true, immutable: true },
  sequence: { type: Number, required: true, min: 0, max: Number.MAX_SAFE_INTEGER },
  expiresAt: { type: String, default: null },
  updatedAt: { type: String, required: true },
  cleanupAt: { type: Date, required: true }
}, { versionKey: false });
typingSchema.index({ projectId: 1, userId: 1, sessionScope: 1, composerId: 1 }, { unique: true });
typingSchema.index({ projectId: 1, userId: 1, cleanupAt: 1 });
typingSchema.index({ projectId: 1, expiresAt: 1 });
typingSchema.index({ cleanupAt: 1 }, { expireAfterSeconds: 0 });

const rateSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true },
  userId: { type: String, required: true, immutable: true },
  windowStartedAt: { type: String, required: true },
  activeUpdates: { type: Number, required: true, min: 1 },
  cleanupAt: { type: Date, required: true }
}, { versionKey: false });
rateSchema.index({ projectId: 1, userId: 1 }, { unique: true });
rateSchema.index({ cleanupAt: 1 }, { expireAfterSeconds: 0 });

export const ProjectChatTypingModel = models.ProjectChatTyping ?? model("ProjectChatTyping", typingSchema);
export const ProjectChatTypingRateModel = models.ProjectChatTypingRate ?? model("ProjectChatTypingRate", rateSchema);
