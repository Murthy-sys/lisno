import { MAX_FINANCE_AMOUNT_PAISE } from "../domain/project-finance.js";
import { model, models, Schema } from "./mongoose.js";

const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true, ref: "Project" },
  itemName: { type: String, required: true, maxlength: 200 },
  itemNameNormalized: { type: String, required: true, maxlength: 400 },
  brand: { type: String, required: true, maxlength: 200 },
  brandNormalized: { type: String, required: true, maxlength: 400 },
  uomId: { type: String, required: true },
  uomCode: { type: String, required: true },
  uomName: { type: String, required: true },
  uomSearch: { type: String, required: true },
  vendorId: { type: String, default: null },
  vendorCode: { type: String, default: null },
  vendorName: { type: String, default: null },
  vendorSearch: { type: String, default: null },
  pricePaise: { type: Number, required: true, min: 1, max: MAX_FINANCE_AMOUNT_PAISE, validate: Number.isSafeInteger },
  version: { type: Number, required: true, min: 1, max: Number.MAX_SAFE_INTEGER, validate: Number.isSafeInteger },
  createdById: { type: String, required: true, immutable: true, ref: "User" },
  updatedById: { type: String, required: true, ref: "User" }
}, { collection: "projectProcurementItems", timestamps: true, versionKey: false, strict: "throw" });

schema.index({ projectId: 1, itemNameNormalized: 1, brandNormalized: 1, uomId: 1, vendorId: 1 }, { unique: true });
schema.index({ projectId: 1, itemNameNormalized: 1, brandNormalized: 1, _id: 1 });

export const ProjectProcurementItemModel = models.ProjectProcurementItem ?? model("ProjectProcurementItem", schema);
