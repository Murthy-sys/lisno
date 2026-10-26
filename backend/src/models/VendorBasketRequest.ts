import { model, models, Schema } from "./mongoose.js";
import { PENDING_REQUEST_INDEXES, PENDING_REQUEST_FILTER } from "../services/vendor-basket-request-indexes.js";

function vendorContextRequired(this: { kind?: string }): boolean {
  return this.kind !== "configuration_proposal" && this.kind !== "configuration_sub_basket";
}

const vendorBasketRequestSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  targetKind: { type: String, enum: ["new_main_basket", "new_sub_basket"], default: "new_main_basket", immutable: true },
  targetParentBasketId: { type: String, default: null, immutable: true },
  targetParentName: { type: String, default: null, immutable: true },
  kind: { type: String, enum: ["configuration_proposal", "configuration_sub_basket"], immutable: true },
  description: { type: String, default: null, required: function(this: { kind?: string }) { return this.kind === "configuration_sub_basket"; }, minlength: 1, maxlength: 4000, immutable: true },
  requestMode: { type: String, enum: ["hierarchy_intake", "full_configuration"], immutable: true },
  proposalId: { type: String, immutable: true },
  proposalSchemaVersion: { type: Number, enum: [1], immutable: true },
  submittedDigest: { type: String, immutable: true },
  proposalCounts: { type: Schema.Types.Mixed, immutable: true },
  requesterId: { type: String, ref: "User", required: true, immutable: true },
  vendorId: { type: String, ref: "AiEstimatorKnowledgeVendor", default: null, immutable: true },
  vendorKey: { type: String, required: true, immutable: true },
  vendorName: { type: String, default: null, required: vendorContextRequired, minlength: 1, maxlength: 240, immutable: true },
  vendorNameNormalized: { type: String, default: null, required: vendorContextRequired, minlength: 1, maxlength: 240, immutable: true },
  proposedName: { type: String, required: true, minlength: 1, maxlength: 240, immutable: true },
  proposedNameNormalized: { type: String, required: true, minlength: 1, maxlength: 240, immutable: true },
  status: { type: String, enum: ["pending", "fulfilled", "rejected"], required: true },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  basketId: { type: String, ref: "AiEstimatorKnowledgeBasket", default: null },
  subBasketId: { type: String, ref: "AiEstimatorKnowledgeSubBasket", default: null },
  mainLineId: { type: String, ref: "AiEstimatorKnowledgeMainLine", default: null },
  reason: { type: String, default: null, maxlength: 1000 },
  idempotencyKey: { type: String, required: true, immutable: true },
  requestFingerprint: { type: String, required: true, immutable: true },
  decisionIdempotencyKey: { type: String, default: null },
  decisionFingerprint: { type: String, default: null },
  createdAt: { type: Date, required: true, immutable: true },
  decidedAt: { type: Date, default: null },
  decidedById: { type: String, ref: "User", default: null }
}, { collection: "vendorBasketRequests", strict: "throw", versionKey: false });

vendorBasketRequestSchema.index({ requesterId: 1, idempotencyKey: 1 }, { unique: true });
for (const definition of PENDING_REQUEST_INDEXES) {
  vendorBasketRequestSchema.index(definition.key, { name: definition.name, unique: true, partialFilterExpression: PENDING_REQUEST_FILTER });
}
vendorBasketRequestSchema.index({ status: 1, createdAt: -1, _id: 1 });
vendorBasketRequestSchema.index({ requesterId: 1, createdAt: -1, _id: 1 });

export const VendorBasketRequestModel = models.VendorBasketRequest ?? model("VendorBasketRequest", vendorBasketRequestSchema);
