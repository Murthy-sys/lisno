import { MAX_FINANCE_AMOUNT_PAISE } from "../domain/project-finance.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_MASTER_STATUSES,
  AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT,
  AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT,
  normalizeKnowledgeIdentity
} from "../domain/ai-estimator-knowledge.js";
import { model, models, Schema } from "./mongoose.js";

const requiredText = { type: String, required: true, minlength: 1, maxlength: AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT };
const requiredLongText = { ...requiredText, maxlength: AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT };
const money = { type: Number, min: 0, max: MAX_FINANCE_AMOUNT_PAISE, validate: Number.isSafeInteger };
const procurementProfileSchema = new Schema({
  vendorType: { type: String, enum: ["execution", "supplier"], required: true },
  executionType: {
    type: [{ type: String, enum: ["labor", "material_labour"] }],
    default: null,
    set: (value: unknown) => Array.isArray(value) ? [...value].sort() : value,
    validate: (value: unknown) => value === null || (Array.isArray(value) && value.length >= 1 && value.length <= 2 && new Set(value).size === value.length && value.every(selection => selection === "labor" || selection === "material_labour"))
  },
  supplier: { type: Boolean, default: null },
  nameOfRepresentative: requiredText, position: requiredText,
  gstRegistered: { type: Boolean, required: true }, msmeRegistered: { type: Boolean, required: true },
  turnoverSelfDeclaredPaise: { ...money, required: true }, turnoverVerifiedPaise: { ...money, default: null, validate: (value: unknown) => value === null || Number.isSafeInteger(value) },
  reference: requiredText, workProfile: requiredLongText,
  email: { ...requiredText, maxlength: 320 }, phoneNumber: { ...requiredText, maxlength: 64 },
  address: requiredLongText, aadhar: { type: String, required: true, match: /^\d{12}$/u },
  pan: { type: String, required: true, match: /^[A-Z]{5}\d{4}[A-Z]$/u },
  currentAddress: requiredLongText, currentAddressVerifiedPhysically: { type: Boolean, required: true },
  mainBasketId: { ...requiredText, maxlength: 128 }, subBasketId: { ...requiredText, maxlength: 128 },
  physicalAddressVerifiedAt: { type: String, default: null }, physicalAddressVerifiedById: { type: String, default: null }
}, { _id: false, strict: "throw" });
procurementProfileSchema.pre("validate", function validateClassification() {
  if (this.vendorType === "execution" && (!this.executionType?.length || this.supplier !== null)) this.invalidate("executionType", "Execution requires at least one execution type and no supplier answer.");
  if (this.vendorType === "supplier" && (typeof this.supplier !== "boolean" || this.executionType !== null)) this.invalidate("supplier", "Supplier requires an explicit answer and no execution type.");
  if (this.currentAddressVerifiedPhysically !== (typeof this.physicalAddressVerifiedAt === "string" && typeof this.physicalAddressVerifiedById === "string")) this.invalidate("currentAddressVerifiedPhysically", "Verification metadata is inconsistent.");
});
const procurementPhotoSchema = new Schema({
  id: { type: String, required: true }, storageReference: { type: String, required: true },
  originalFilename: { type: String, required: true, maxlength: 255 },
  mimeType: { type: String, required: true, enum: ["image/jpeg", "image/png", "image/webp"] },
  byteSize: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  sha256: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  uploadedAt: { type: String, required: true }, uploadedById: { type: String, required: true }
}, { _id: false, strict: "throw" });

const vendorSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
    code: { type: String, required: true, minlength: 1, maxlength: 64 },
    codeNormalized: { type: String, required: true, maxlength: 64 },
    name: { type: String, required: true, minlength: 1, maxlength: AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT },
    nameNormalized: { type: String, required: true, maxlength: AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT },
    description: { type: String, default: null, maxlength: AI_ESTIMATOR_KNOWLEDGE_MAX_TEXT },
    displayOrder: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    status: { type: String, enum: AI_ESTIMATOR_KNOWLEDGE_MASTER_STATUSES, required: true, default: "active" },
    version: { type: Number, required: true, default: 1, min: 1, validate: Number.isSafeInteger },
    dependencyEpoch: {
      type: Number,
      default: 0,
      min: 0,
      max: Number.MAX_SAFE_INTEGER,
      validate: Number.isSafeInteger
    },
    createdById: { type: String, ref: "User", required: true, immutable: true },
    updatedById: { type: String, ref: "User", required: true },
    archivedAt: { type: Date, default: null },
    archivedById: { type: String, ref: "User", default: null },
    procurementProfile: { type: procurementProfileSchema, default: undefined },
    geoTaggedPicture: { type: procurementPhotoSchema, default: null }
  },
  { collection: "aiEstimatorKnowledgeVendors", timestamps: true, versionKey: false, strict: "throw" }
);

vendorSchema.pre("validate", function normalizeMaster() {
  for (const path of ["code", "name"] as const) {
    const value = this.get(path);
    if (typeof value === "string") {
      const display = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
      this.set(path, display);
      this.set(`${path}Normalized`, normalizeKnowledgeIdentity(display));
    }
  }
  const archived = this.get("status") === "archived";
  if (archived !== (this.get("archivedAt") instanceof Date) || archived !== (typeof this.get("archivedById") === "string")) this.invalidate("status", "Master archive metadata is inconsistent.");
});

const nonArchived = { status: { $in: ["active", "inactive"] } };
vendorSchema.index({ codeNormalized: 1 }, { unique: true, partialFilterExpression: nonArchived });
vendorSchema.index({ nameNormalized: 1 }, { unique: true, partialFilterExpression: nonArchived });
vendorSchema.index({ status: 1, displayOrder: 1, _id: 1 });
vendorSchema.index({ "procurementProfile.mainBasketId": 1 });
vendorSchema.index({ "procurementProfile.subBasketId": 1 });

export const AiEstimatorKnowledgeVendorModel =
  models.AiEstimatorKnowledgeVendor ?? model("AiEstimatorKnowledgeVendor", vendorSchema);
