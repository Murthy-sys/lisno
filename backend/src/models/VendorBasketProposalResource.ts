import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  proposalId: { type: String, required: true, immutable: true },
  resourceId: { type: String, required: true, immutable: true },
  kind: { type: String, required: true, enum: ["basket", "sub_basket", "main_line", "section", "quality", "uom", "surface"], immutable: true },
  parentId: { type: String, default: null, immutable: true },
  resourceVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  payload: { type: Schema.Types.Mixed, required: true, immutable: true },
  digest: { type: String, required: true, immutable: true },
  bytes: { type: Number, required: true, immutable: true },
  savedById: { type: String, required: true, immutable: true },
  savedAt: { type: Date, required: true, immutable: true }
}, { collection: "vendorBasketProposalResources", strict: "throw", versionKey: false, minimize: false });
schema.index({ proposalId: 1, resourceId: 1, resourceVersion: 1 }, { unique: true });
schema.index({ proposalId: 1, kind: 1, parentId: 1 });
export const VendorBasketProposalResourceModel = models.VendorBasketProposalResource ?? model("VendorBasketProposalResource", schema);
