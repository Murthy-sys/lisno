import { model, models, Schema } from "./mongoose.js";

const item = new Schema({ assignmentId: { type: String, required: true }, reasons: { type: [String], required: true } }, { _id: false, strict: "throw" });
const schema = new Schema({
  _id: { type: String, required: true }, recipientId: { type: String, required: true, immutable: true }, projectId: { type: String, required: true, immutable: true }, vendorId: { type: String, default: null, immutable: true }, localDate: { type: String, required: true, immutable: true }, timezone: { type: String, required: true, immutable: true }, kind: { type: String, required: true, enum: ["daily_reminder", "daily_escalation", "access_blocked", "verification_pending"], immutable: true },
  items: { type: [item], required: true }, overflowCount: { type: Number, default: 0 }, createdAt: { type: Date, required: true }, updatedAt: { type: Date, required: true }, readAt: { type: Date, default: null },
  deliveryStatus: { type: String, required: true, enum: ["pending", "sending", "sent", "failed", "unavailable", "suppressed"] }, attempts: { type: Number, default: 0 }, nextAttemptAt: { type: Date, required: true }, leaseToken: { type: String, default: null }, leaseExpiresAt: { type: Date, default: null }, failureCode: { type: String, default: null }, sentAt: { type: Date, default: null }, expiresAt: { type: Date, required: true }
}, { collection: "executionNotifications", versionKey: false, strict: "throw" });
schema.index({ recipientId: 1, projectId: 1, localDate: 1, kind: 1 }, { unique: true });
schema.index({ recipientId: 1, createdAt: -1, _id: -1 });
schema.index({ deliveryStatus: 1, nextAttemptAt: 1, leaseExpiresAt: 1 });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const lease = new Schema({ _id: { type: String, required: true }, token: { type: String, default: null }, expiresAt: { type: Date, required: true }, lastSuccessAt: { type: Date, default: null }, lastAttemptAt: { type: Date, default: null }, failureCode: { type: String, default: null }, assignmentCursor: { type: String, default: null } }, { collection: "executionSchedulerLeases", versionKey: false, strict: "throw" });
export const ExecutionNotificationModel = models.ExecutionNotification ?? model("ExecutionNotification", schema);
export const ExecutionSchedulerLeaseModel = models.ExecutionSchedulerLease ?? model("ExecutionSchedulerLease", lease);
const membership = new Schema({ _id: { type: String, required: true }, notificationId: { type: String, required: true }, assignmentId: { type: String, required: true }, expiresAt: { type: Date, required: true } }, { collection: "executionNotificationAssignments", versionKey: false, strict: "throw" });
membership.index({ notificationId: 1, assignmentId: 1 }, { unique: true });
membership.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const ExecutionNotificationAssignmentModel = models.ExecutionNotificationAssignment ?? model("ExecutionNotificationAssignment", membership);
