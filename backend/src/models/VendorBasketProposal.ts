import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  requesterId: { type: String, required: true, immutable: true },
  vendorId: { type: String, default: null, immutable: true },
  vendorName: { type: String, default: null, minlength: 1, maxlength: 240, immutable: true },
  targetKind: { type: String, enum: ["new_main_basket", "new_sub_basket"], default: "new_main_basket", immutable: true },
  targetParentBasketId: { type: String, default: null, immutable: true },
  targetParentName: { type: String, default: null, immutable: true },
  basketId: { type: String, required: true, immutable: true },
  schemaVersion: { type: Number, required: true, enum: [1], immutable: true },
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  creationKey: { type: String, required: true, immutable: true },
  creationFingerprint: { type: String, required: true, immutable: true },
  revisedFromId: { type: String, default: null, immutable: true },
  requestId: { type: String, default: null },
  working: { type: Schema.Types.Mixed, required: true },
  submitted: { type: Schema.Types.Mixed, default: null },
  review: { type: Schema.Types.Mixed, default: null },
  approved: { type: Schema.Types.Mixed, default: null },
  submissionKey: { type: String, default: null },
  submissionFingerprint: { type: String, default: null },
  submittedAt: { type: Date, default: null },
  decisionResult: { type: Schema.Types.Mixed, default: null },
  createdAt: { type: Date, required: true, immutable: true },
  updatedAt: { type: Date, required: true }
}, { collection: "vendorBasketProposals", strict: "throw", versionKey: false });
schema.index({ requesterId: 1, creationKey: 1 }, { unique: true });
schema.index({ requesterId: 1, updatedAt: -1, _id: 1 });
schema.index({ requestId: 1 }, { unique: true, partialFilterExpression: { requestId: { $type: "string" } } });
export const VendorBasketProposalModel = models.VendorBasketProposal ?? model("VendorBasketProposal", schema);
