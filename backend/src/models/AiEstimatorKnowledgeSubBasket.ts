import { AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT, normalizeKnowledgeIdentity } from "../domain/ai-estimator-knowledge.js";
import { validStoredDefaults, validMarginChange } from "../domain/ai-estimator-knowledge-margin-matrix.js";
import type { MarginDefault } from "../contracts/ai-estimator-knowledge-sub-basket-margins.js";
import { model, models, Schema } from "./mongoose.js";

const nested = { _id: false, strict: "throw" as const };
const marginPair = new Schema({
  key: { type: String, required: true, enum: ["margin", "labor", "material"] },
  minimumBps: { type: Number, required: true, validate: Number.isSafeInteger },
  maximumBps: { type: Number, required: true, validate: Number.isSafeInteger }
}, nested);
const marginDefault = new Schema({
  tier: { type: String, required: true, enum: ["signature", "premium", "functional"] },
  mode: { type: String, required: true, enum: ["pmc", "sub_vendor", "in_house"] },
  component: new Schema({ basketId: { type: String, required: true }, subBasketId: { type: String, default: null } }, nested),
  componentName: String,
  provenance: { type: String, required: true, enum: ["existing", "approved", "unset"] },
  ranges: { type: [marginPair], required: true }
}, nested);
const marginBaseline = new Schema({
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  defaults: { type: [marginDefault], required: true, validate: validStoredDefaults },
  sharedInHouseDefaults: { type: [marginDefault], default: undefined,
    validate: (rows: MarginDefault[]) => rows.every(row => row.mode === "in_house" && row.provenance === "approved" && validMarginChange(row, "sub_basket"))
      && new Set(rows.map(row => row.tier)).size === rows.length },
  updatedById: { type: String, required: true },
  updatedAt: { type: Date, required: true },
  operationId: String
}, nested);

const subBasketSchema = new Schema({
  _id: { type: String, required: true, immutable: true },
  basketId: { type: String, ref: "AiEstimatorKnowledgeBasket", required: true, immutable: true },
  name: { type: String, required: true, maxlength: AI_ESTIMATOR_KNOWLEDGE_MAX_SHORT_TEXT },
  marginBaseline: { type: marginBaseline, default: undefined },
  nameNormalized: { type: String, required: true },
  description: { type: String, default: null, maxlength: 4000 },
  displayOrder: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
  version: { type: Number, required: true, default: 1, min: 1, validate: Number.isSafeInteger },
  dependencyEpoch: { type: Number, default: 0, min: 0, max: Number.MAX_SAFE_INTEGER,
    validate: Number.isSafeInteger },
  createdById: { type: String, ref: "User", required: true, immutable: true },
  updatedById: { type: String, ref: "User", required: true }
}, { collection: "aiEstimatorKnowledgeSubBaskets", timestamps: true, versionKey: false, strict: "throw" });

subBasketSchema.pre("validate", function normalizeIdentity() {
  const name = this.get("name");
  if (typeof name === "string") {
    const trimmed = name.normalize("NFKC").trim().replace(/\s+/gu, " ");
    this.set("name", trimmed);
    this.set("nameNormalized", normalizeKnowledgeIdentity(trimmed));
  }
});
subBasketSchema.index({ basketId: 1, nameNormalized: 1 }, { unique: true });
subBasketSchema.index({ basketId: 1, displayOrder: 1, _id: 1 });

export const AiEstimatorKnowledgeSubBasketModel = models.AiEstimatorKnowledgeSubBasket ??
  model("AiEstimatorKnowledgeSubBasket", subBasketSchema);
