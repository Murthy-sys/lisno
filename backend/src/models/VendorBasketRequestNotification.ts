import { model, models, Schema } from "./mongoose.js";

function vendorContextRequired(this: { proposalId?: string | null; requestKind?: string; getUpdate?: () => { $setOnInsert?: { proposalId?: string | null; requestKind?: string } } }): boolean {
  // Notifications are inserted through a validated, idempotent upsert. Query
  // validators read the insertion payload; document validators read the field.
  const inserted = this.getUpdate?.()?.$setOnInsert;
  return !(this.proposalId ?? inserted?.proposalId)
    && (this.requestKind ?? inserted?.requestKind) !== "configuration_sub_basket";
}

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  recipientId: { type: String, ref: "User", required: true, immutable: true },
  requestId: { type: String, ref: "VendorBasketRequest", required: true, immutable: true },
  proposalId: { type: String, default: null, immutable: true },
  requestKind: { type: String, enum: ["configuration_sub_basket"], immutable: true },
  targetKind: { type: String, enum: ["new_main_basket", "new_sub_basket"], required: true, immutable: true },
  targetParentBasketId: { type: String, default: null, immutable: true },
  targetParentName: { type: String, default: null, maxlength: 240, immutable: true },
  proposedName: { type: String, required: true, maxlength: 240, immutable: true },
  vendorName: { type: String, default: null, required: vendorContextRequired, minlength: 1, maxlength: 240, immutable: true },
  requesterId: { type: String, ref: "User", required: true, immutable: true },
  requesterName: { type: String, required: true, maxlength: 240, immutable: true },
  createdAt: { type: Date, required: true, immutable: true },
  readAt: { type: Date, default: null }
}, { collection: "vendorBasketRequestNotifications", strict: "throw", versionKey: false });

schema.index({ recipientId: 1, requestId: 1 }, { unique: true });
schema.index({ recipientId: 1, createdAt: -1, _id: -1 });

export const VendorBasketRequestNotificationModel = models.VendorBasketRequestNotification ??
  model("VendorBasketRequestNotification", schema);
