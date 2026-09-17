import { model, models, Schema } from "./mongoose.js";
const schema = new Schema({
  _id: {type: String, required: true, immutable: true},
  recipientId: {type: String, required: true, immutable: true},
  projectId: {type: String, required: true, immutable: true},
  messageId: {type: String, required: true, immutable: true},
  type: {type: String, enum: ["chat.mention", "chat.mention.oversight"], required: true, immutable: true},
  projectName: {type: String, required: true, immutable: true},
  actor: {type: new Schema({id: {type: String, required: true}, name: {type: String, required: true}}, {_id: false}), required: true, immutable: true},
  excerpt: {type: String, required: true, maxlength: 240, immutable: true},
  createdAt: {type: String, required: true, immutable: true},
  readAt: {type: String, default: null},
  email: {type: new Schema({
    status: {type: String, enum: ["pending", "leased", "sent", "failed", "disabled", "suppressed"], required: true},
    attempts: {type: Number, required: true, min: 0}, nextAttemptAt: {type: String, default: null},
    leaseToken: {type: String, default: null}, leaseExpiresAt: {type: String, default: null},
    deliveredAt: {type: String, default: null}, failureCode: {type: String, default: null}
  }, {_id: false}), required: true}
}, {versionKey: false});
schema.index({recipientId: 1, messageId: 1}, {unique: true});
schema.index({recipientId: 1, projectId: 1, createdAt: -1, _id: -1});
schema.index({recipientId: 1, readAt: 1, projectId: 1});
schema.index({"email.status": 1, "email.nextAttemptAt": 1, "email.leaseExpiresAt": 1});
export const ChatNotificationModel = models.ChatNotification ?? model("ChatNotification", schema);
