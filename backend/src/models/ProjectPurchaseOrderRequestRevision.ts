import { MAX_FINANCE_AMOUNT_PAISE } from "../domain/project-finance.js";
import { model, models, Schema } from "./mongoose.js";

const paise = { type: Number, required: true, min: 0, max: MAX_FINANCE_AMOUNT_PAISE, validate: Number.isSafeInteger, immutable: true };
const totalSchema = new Schema({ netPaise: paise, gstPaise: paise, totalPaise: paise }, { _id: false, strict: "throw" });
const sectionTotalSchema = new Schema({ sectionId: { type: String, required: true }, label: { type: String, required: true }, totals: { type: totalSchema, required: true } }, { _id: false, strict: "throw" });
const vendorTotalSchema = new Schema({ vendorId: { type: String, required: true }, code: { type: String, required: true }, name: { type: String, required: true }, terms: { type: String, required: true }, totals: { type: totalSchema, required: true } }, { _id: false, strict: "throw" });
const lineSchema = new Schema({
  id: { type: String, required: true, immutable: true },
  procurementItemId: { type: String, required: true, immutable: true },
  procurementItemVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  estimateId: { type: String, required: true, immutable: true },
  estimateVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  estimateReviewRoundId: { type: String, default: null, immutable: true },
  sourceSectionId: { type: String, required: true, immutable: true },
  sectionLabel: { type: String, required: true, immutable: true },
  sourceLineItemKey: { type: String, required: true, immutable: true },
  roomName: { type: String, required: true, immutable: true },
  itemName: { type: String, required: true, immutable: true },
  brand: { type: String, required: true, immutable: true },
  uomId: { type: String, required: true, immutable: true },
  uomCode: { type: String, required: true, immutable: true },
  uomName: { type: String, required: true, immutable: true },
  vendorId: { type: String, required: true, immutable: true },
  vendorCode: { type: String, required: true, immutable: true },
  vendorName: { type: String, required: true, immutable: true },
  allocatedWorkPaise: { ...paise, min: 1 },
  quantityMilliUnits: { type: Number, required: true, min: 1, max: 1_000_000_000, validate: Number.isSafeInteger, immutable: true },
  unitPricePaise: { ...paise, min: 1 },
  gstBasisPoints: { type: Number, required: true, min: 0, max: 10_000, validate: Number.isSafeInteger, immutable: true },
  scopeType: { type: String, required: true, enum: ["supply", "execution", "supply_and_execution"], immutable: true },
  description: { type: String, required: true, maxlength: 2_000, immutable: true },
  targetDate: { type: String, required: true, immutable: true },
  deliveryLocation: { type: String, required: true, maxlength: 500, immutable: true },
  netPaise: paise,
  gstPaise: paise,
  totalPaise: paise
}, { _id: false, strict: "throw" });
const actualChildSchema = new Schema({
  procurementItemId: { type: String, required: true, immutable: true },
  vendorId: { type: String, required: true, immutable: true },
  quantityMilliUnits: { type: Number, required: true, min: 1, max: 1_000_000_000, validate: Number.isSafeInteger, immutable: true },
  unitPricePaise: { ...paise, min: 1 },
  gstBasisPoints: { type: Number, required: true, min: 0, max: 10_000, validate: Number.isSafeInteger, immutable: true },
  allocatedWorkPaise: { ...paise, min: 1 },
  netPaise: paise,
  gstPaise: paise,
  totalPaise: paise,
  commercialExceptionReason: { type: String, default: null, maxlength: 2_000, immutable: true }
}, { _id: false, strict: "throw" });
const modeSnapshotSchema = new Schema({
  sourceLineItemKey: { type: String, required: true, immutable: true },
  source: { type: String, required: true, enum: ["configuration", "legacy"], immutable: true },
  roomId: { type: String, default: null, immutable: true },
  roomName: { type: String, required: true, immutable: true },
  mainBasketId: { type: String, default: null, immutable: true },
  mainBasketName: { type: String, default: null, immutable: true },
  subBasketId: { type: String, default: null, immutable: true },
  subBasketName: { type: String, default: null, immutable: true },
  mainLineId: { type: String, default: null, immutable: true },
  mainLineName: { type: String, default: null, immutable: true },
  approvedQuantity: { type: String, required: true, immutable: true },
  approvedUnit: { type: String, required: true, immutable: true },
  approvedAmountPaise: { ...paise, min: 1 },
  referenceAsOf: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}T/u, immutable: true },
  // The resolved evidence is produced only by Procurement's pinned Configuration reader.
  // Mixed retains each calculator's exact versioned settings and nested formula output.
  mode: { type: Schema.Types.Mixed, required: true, immutable: true },
  actualChildren: { type: [actualChildSchema], required: true,
    validate: (value: unknown[]) => value.length > 0 && value.length <= 500, immutable: true },
  actualTotals: { type: totalSchema, required: true, immutable: true },
  actualNetMinusConfiguredCostPaise: { type: Number, default: null, min: -MAX_FINANCE_AMOUNT_PAISE,
    max: MAX_FINANCE_AMOUNT_PAISE, validate: (value: unknown) => value === null || Number.isSafeInteger(value), immutable: true }
}, { _id: false, strict: "throw", minimize: false });
const schema = new Schema({
  _id: { type: String, required: true, immutable: true },
  requestId: { type: String, required: true, immutable: true },
  projectId: { type: String, required: true, immutable: true },
  revision: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  estimateId: { type: String, required: true, immutable: true },
  estimateVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger, immutable: true },
  estimateReviewRoundId: { type: String, default: null, immutable: true },
  preparationDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u, immutable: true },
  approvedEstimatePaise: paise,
  committedPaise: paise,
  committedGstPaise: paise,
  committedTotalPaise: paise,
  lines: { type: [lineSchema], required: true, validate: (value: unknown[]) => value.length > 0 && value.length <= 500, immutable: true },
  // Optional for pre-feature revisions. Do not infer historical mode values.
  modeSnapshots: { type: [modeSnapshotSchema], default: undefined, immutable: true },
  totals: { type: totalSchema, required: true, immutable: true },
  sectionTotals: { type: [sectionTotalSchema], required: true, immutable: true },
  vendorTotals: { type: [vendorTotalSchema], required: true, immutable: true },
  submittedAt: { type: Date, required: true, immutable: true },
  submittedById: { type: String, required: true, immutable: true },
  idempotencyKey: { type: String, required: true, immutable: true },
  requestDigest: { type: String, required: true, immutable: true }
}, { collection: "projectPurchaseOrderRequestRevisions", timestamps: false, versionKey: false, strict: "throw", minimize: false });

schema.index({ requestId: 1, revision: 1 }, { unique: true });
schema.index({ projectId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ projectId: 1, "lines.procurementItemId": 1 });
export const ProjectPurchaseOrderRequestRevisionModel = models.ProjectPurchaseOrderRequestRevision ?? model("ProjectPurchaseOrderRequestRevision", schema);
