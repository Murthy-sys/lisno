import { estimatePricingMetadataIsValid } from "../domain/estimate-mode-pricing.js";
import {
  ESTIMATE_CLIENT_DECISIONS,
  ESTIMATE_CLIENT_DECISION_NOTE_MAX,
  ESTIMATE_CLIENT_DECISION_SOURCES,
  ESTIMATE_CLIENT_REVIEW_STATUSES,
  ESTIMATE_CLIENT_SHA256,
  ESTIMATE_DELIVERY_FAILURE_CODE,
  ESTIMATE_DELIVERY_STATUSES,
  configuredEstimateParentIsValid
} from "../domain/estimate-client-review.js";
import { emailSchema, normalizeEmail } from "../domain/email.js";
import type { Query } from "mongoose";
import { EstimateClientResponseProofModel } from "./EstimateClientResponseProof.js";
import { model, models, Schema } from "./mongoose.js";

const safeIntegerValidator = {
  validator: (value: unknown) => Number.isSafeInteger(value),
  message: "{PATH} must be a safe integer."
};

const optionalSafeIntegerValidator = {
  validator: (value: unknown) => value == null || Number.isSafeInteger(value),
  message: "{PATH} must be a safe integer when present."
};

function exactNonnegativePaise(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

const decisionStatePaths = [
  "status",
  "decision",
  "decisionSource",
  "decisionNote",
  "decidedById",
  "decidedAt"
] as const;

const estimateClientReviewLineItemSchema = new Schema(
  {
    // Older immutable snapshots predate stable line-item ids. Procurement
    // derives a deterministic, version-and-position-scoped identity for them.
    id: { type: String, default: null, immutable: true },
    source: { type: String, enum: ["legacy", "configuration"], default: undefined, immutable: true },
    itemType: { type: String, enum: ["main_line", "temporary"], default: undefined, immutable: true },
    classification: { type: String, enum: ["standard", "special"], default: undefined, immutable: true },
    pricingMode: { type: String, enum: ["pmc", "sub_vendor", "in_house"], default: undefined, immutable: true },
    rateSource: { type: String, enum: ["configuration", "manual"], default: undefined, immutable: true },
    catalogueId: { type: String, required: true, immutable: true },
    roomId: { type: String, default: undefined, immutable: true },
    roomName: { type: String, required: true, immutable: true },
    specification: { type: String, default: null, immutable: true },
    unit: { type: String, required: true, immutable: true },
    rate: { type: Number, default: null, immutable: true },
    ratePaise: { type: Number, default: undefined, immutable: true, validate: optionalSafeIntegerValidator },
    quantity: { type: Number, required: true, immutable: true },
    included: { type: Boolean, required: true, immutable: true },
    amount: { type: Number, default: null, immutable: true },
    amountPaise: { type: Number, default: undefined, immutable: true, validate: optionalSafeIntegerValidator },
    mainBasketId: { type: String, default: undefined, immutable: true },
    subBasketId: { type: String, default: undefined, immutable: true },
    mainLineId: { type: String, default: undefined, immutable: true },
    revisionId: { type: String, default: undefined, immutable: true },
    sourceItemStatus: { type: String, enum: ["draft", "active", "inactive"], default: undefined, immutable: true },
    sourceRevisionStatus: { type: String, enum: ["draft", "active", "superseded"], default: undefined, immutable: true },
    sourceItemVersion: { type: Number, default: undefined, immutable: true, min: 1, validate: optionalSafeIntegerValidator },
    sourceRevisionVersion: { type: Number, default: undefined, immutable: true, min: 1, validate: optionalSafeIntegerValidator },
    uomId: { type: String, default: undefined, immutable: true },
    uomCode: { type: String, default: undefined, immutable: true },
    uomDecimalScale: { type: Number, default: undefined, immutable: true, min: 0, validate: optionalSafeIntegerValidator },
    mainBasketName: { type: String, default: undefined, immutable: true },
    subBasketName: { type: String, default: undefined, immutable: true },
    mainLineName: { type: String, default: undefined, immutable: true },
    uomName: { type: String, default: undefined, immutable: true }
  },
  { _id: false, strict: "throw" }
);

estimateClientReviewLineItemSchema.pre("validate", function validateFrozenLine() {
  const configured = this.get("source") === "configuration";
  const required = configured
    ? ["roomId", "mainBasketId", "mainLineId", "revisionId", "uomId", "mainBasketName", "mainLineName", "uomName"]
    : ["specification"];
  for (const field of required) {
    const value = this.get(field);
    if (typeof value !== "string" || !value.trim()) this.invalidate(field, "Published estimate line snapshot is incomplete.");
  }
  if (configured && !configuredEstimateParentIsValid({
    itemType: this.get("itemType"),
    subBasketId: this.get("subBasketId"),
    subBasketName: this.get("subBasketName")
  })) this.invalidate("subBasketId", "Published configured estimate Sub Basket identity is inconsistent.");
  if (configured && !estimatePricingMetadataIsValid({
    classification: this.get("classification"), pricingMode: this.get("pricingMode"), rateSource: this.get("rateSource")
  })) this.invalidate("pricingMode", "Published configured estimate pricing metadata is inconsistent.");
  if (configured) {
    const provenance = ["sourceItemStatus", "sourceRevisionStatus", "sourceItemVersion", "sourceRevisionVersion"] as const;
    const presentCount = provenance.filter((field) => this.get(field) !== undefined).length;
    if (presentCount > 0 && (presentCount !== provenance.length || provenance.some((field) => this.get(field) === null))) {
      this.invalidate("sourceRevisionVersion", "Published configured estimate source provenance is incomplete.");
    }
  }
  if (configured && (this.get("catalogueId") !== this.get("mainLineId") || this.get("specification") !== null)) {
    this.invalidate("catalogueId", "Configured line identity or specification is inconsistent.");
  }
  for (const field of ["rate", "amount"] as const) {
    const value = this.get(field);
    if (value === null && configured && this.get("included") !== true) continue;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      this.invalidate(field, "Published estimate amount is invalid.");
    }
  }
  if (configured) {
    for (const field of ["ratePaise", "amountPaise"] as const) {
      const value = this.get(field);
      if (value === null && this.get("included") !== true) continue;
      if (!exactNonnegativePaise(value)) {
        this.invalidate(field, "Published configured estimate paise must be exact.");
      }
    }
    const ratePaise = this.get("ratePaise");
    const amountPaise = this.get("amountPaise");
    if (exactNonnegativePaise(ratePaise) && this.get("rate") !== ratePaise / 100 ||
      exactNonnegativePaise(amountPaise) && this.get("amount") !== amountPaise / 100) {
      this.invalidate("amountPaise", "Published configured line rupees and paise disagree.");
    }
  }
});

const selectedMainBasketClassificationSchema = new Schema({
  mainBasketId: { type: String, required: true, immutable: true },
  classification: { type: String, enum: ["standard", "special"], required: true, immutable: true }
}, { _id: false, strict: "throw" });

const estimateClientReviewSnapshotSchema = new Schema(
  {
    clientName: { type: String, required: true, immutable: true },
    projectName: { type: String, required: true, immutable: true },
    location: { type: String, immutable: true },
    propertyType: { type: String, required: true, immutable: true },
    lineItems: {
      type: [estimateClientReviewLineItemSchema],
      required: true,
      immutable: true
    },
    subtotal: { type: Number, required: true, immutable: true },
    gst: { type: Number, required: true, immutable: true },
    total: { type: Number, required: true, immutable: true },
    subtotalPaise: { type: Number, default: undefined, immutable: true, validate: safeIntegerValidator },
    gstPaise: { type: Number, default: undefined, immutable: true, validate: safeIntegerValidator },
    totalPaise: { type: Number, default: undefined, immutable: true, validate: safeIntegerValidator },
    selectedMainBasketIds: { type: [String], default: undefined, immutable: true },
    selectedMainBasketClassifications: {
      type: [selectedMainBasketClassificationSchema], default: undefined, immutable: true
    }
  },
  { _id: false, strict: "throw" }
);

estimateClientReviewSnapshotSchema.pre("validate", function validateFrozenTotals() {
  if (typeof this.get("location") !== "string") {
    this.invalidate("location", "Published snapshot location must be a string.");
  }
  const classifications = this.get("selectedMainBasketClassifications") as
    Array<{ mainBasketId: string }> | undefined;
  if (classifications !== undefined) {
    const selectedIds = this.get("selectedMainBasketIds") as string[] | undefined;
    const classifiedIds = classifications.map((entry) => entry.mainBasketId);
    if (!selectedIds || classifiedIds.length !== selectedIds.length ||
      new Set(classifiedIds).size !== classifiedIds.length ||
      classifiedIds.some((id) => !selectedIds.includes(id))) {
      this.invalidate("selectedMainBasketClassifications", "Published basket classifications must match selected Main Baskets.");
    }
  }
  const lines = this.get("lineItems") as Array<{ source?: string }> | undefined;
  if (!lines?.some((line) => line.source === "configuration")) return;
  const subtotalPaise = this.get("subtotalPaise");
  const gstPaise = this.get("gstPaise");
  const totalPaise = this.get("totalPaise");
  if (!exactNonnegativePaise(subtotalPaise) || !exactNonnegativePaise(gstPaise) || !exactNonnegativePaise(totalPaise) ||
    subtotalPaise + gstPaise !== totalPaise ||
    this.get("subtotal") !== subtotalPaise / 100 ||
    this.get("gst") !== gstPaise / 100 ||
    this.get("total") !== totalPaise / 100) {
    this.invalidate("totalPaise", "Published configured estimate totals must reconcile in paise.");
  }
});

const estimateClientReviewRoundSchema = new Schema(
  {
    _id: { type: String, required: true, immutable: true },
    estimateId: { type: String, ref: "Estimate", required: true, immutable: true },
    leadId: { type: String, ref: "Lead", required: true, immutable: true },
    projectId: { type: String, ref: "Project", default: null, immutable: true },
    estimateVersion: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      validate: safeIntegerValidator
    },
    sendGeneration: {
      type: Number,
      required: true,
      immutable: true,
      min: 1,
      validate: safeIntegerValidator
    },
    dedupeKey: {
      type: String,
      required: true,
      immutable: true,
      match: ESTIMATE_CLIENT_SHA256
    },
    recipientEmail: { type: String, required: true, immutable: true },
    recipientEmailNormalized: { type: String, required: true, immutable: true },
    estimateSnapshot: {
      type: estimateClientReviewSnapshotSchema,
      required: true,
      immutable: true
    },
    pdfFilename: { type: String, required: true, immutable: true },
    pdfMimeType: {
      type: String,
      enum: ["application/pdf"],
      required: true,
      immutable: true
    },
    pdfByteSize: { type: Number, required: true, immutable: true, min: 1 },
    pdfSha256: {
      type: String,
      required: true,
      immutable: true,
      match: ESTIMATE_CLIENT_SHA256
    },
    pdfStorageReference: {
      type: String,
      required: true,
      immutable: true,
      select: false
    },
    deliveryStatus: {
      type: String,
      enum: ESTIMATE_DELIVERY_STATUSES,
      required: true
    },
    deliveryAttemptGeneration: {
      type: Number,
      required: true,
      min: 1,
      validate: safeIntegerValidator
    },
    deliveryAttemptCount: {
      type: Number,
      required: true,
      min: 0,
      validate: safeIntegerValidator
    },
    deliveryAttemptedAt: { type: Date, default: null },
    deliveryLeaseExpiresAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    deliveryFailureCode: {
      type: String,
      default: null,
      maxlength: 64,
      match: ESTIMATE_DELIVERY_FAILURE_CODE
    },
    assignedAdminId: { type: String, ref: "User", required: true },
    status: {
      type: String,
      enum: ESTIMATE_CLIENT_REVIEW_STATUSES,
      required: true
    },
    decision: { type: String, enum: ESTIMATE_CLIENT_DECISIONS, default: null },
    decisionSource: {
      type: String,
      enum: ESTIMATE_CLIENT_DECISION_SOURCES,
      default: null
    },
    decisionNote: {
      type: String,
      default: null,
      maxlength: ESTIMATE_CLIENT_DECISION_NOTE_MAX
    },
    decidedById: { type: String, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
    version: {
      type: Number,
      required: true,
      min: 1,
      validate: safeIntegerValidator
    }
  },
  { timestamps: true, versionKey: false }
);

estimateClientReviewRoundSchema.pre("validate", function normalizeRecipient() {
  const parsed = emailSchema.safeParse(this.get("recipientEmail"));
  if (!parsed.success) {
    this.invalidate("recipientEmail", "Review recipient email is invalid.");
    return;
  }
  this.set("recipientEmail", parsed.data);
  this.set("recipientEmailNormalized", normalizeEmail(parsed.data));
});

estimateClientReviewRoundSchema.pre("validate", function validateDecisionState() {
  const error = decisionStateError({
    status: this.get("status"),
    decision: this.get("decision"),
    decisionSource: this.get("decisionSource"),
    decisionNote: this.get("decisionNote"),
    decidedById: this.get("decidedById"),
    decidedAt: this.get("decidedAt")
  });
  if (error) this.invalidate("status", error);
});

estimateClientReviewRoundSchema.pre(
  ["updateOne", "updateMany", "findOneAndUpdate"],
  validateDecisionStateUpdate
);

estimateClientReviewRoundSchema.index({ dedupeKey: 1 }, { unique: true });
estimateClientReviewRoundSchema.index(
  { estimateId: 1, sendGeneration: 1 },
  { unique: true }
);
estimateClientReviewRoundSchema.index({
  assignedAdminId: 1,
  status: 1,
  createdAt: -1,
  _id: 1
});
estimateClientReviewRoundSchema.index({ estimateId: 1, createdAt: -1, _id: 1 });
estimateClientReviewRoundSchema.index({ projectId: 1, deliveryStatus: 1 });

function isDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function decisionStateError(input: Record<string, unknown>) {
  const {
    status,
    decision,
    decisionSource,
    decisionNote,
    decidedById,
    decidedAt
  } = input;
  if (status === "pending") {
    return [decision, decisionSource, decisionNote, decidedById, decidedAt].some(
      (value) => value !== null
    )
      ? "Pending review rounds cannot contain decision metadata."
      : null;
  }

  const expectedDecision = status === "approved" ? "approve" : "request_changes";
  if (
    !["approved", "changes_requested"].includes(String(status)) ||
    decision !== expectedDecision ||
    !["client_portal", "admin_proof"].includes(String(decisionSource)) ||
    typeof decisionNote !== "string" ||
    typeof decidedById !== "string" ||
    decidedById.length === 0 ||
    !isDate(decidedAt) ||
    (decision === "request_changes" &&
      decisionSource === "admin_proof" &&
      decisionNote.trim().length === 0)
  ) {
    return "Terminal review rounds require complete, status-consistent decision metadata.";
  }
  return null;
}

function validateDecisionStateUpdate(this: Query<unknown, unknown>) {
  const update = this.getUpdate();
  if (!updateTouchesDecisionState(update)) return;
  if (!update || Array.isArray(update)) {
    throw new Error("Decision state updates must set the complete decision tuple.");
  }

  const updateObject = update as Record<string, unknown>;
  const set = {
    ...Object.fromEntries(
      Object.entries(updateObject).filter(([key]) => !key.startsWith("$"))
    ),
    ...asRecord(updateObject.$set)
  };
  const nonSetMutation = Object.entries(updateObject).some(
    ([operator, value]) =>
      operator.startsWith("$") &&
      operator !== "$set" &&
      updateTouchesDecisionState(value)
  );
  if (
    nonSetMutation ||
    !decisionStatePaths.every((path) => Object.hasOwn(set, path))
  ) {
    throw new Error("Decision state updates must set the complete decision tuple.");
  }

  const error = decisionStateError(set);
  if (error) throw new Error(error);
}

function updateTouchesDecisionState(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(updateTouchesDecisionState);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([path, nested]) =>
      decisionStatePaths.includes(path.split(".")[0] as (typeof decisionStatePaths)[number]) ||
      updateTouchesDecisionState(nested)
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export const EstimateClientReviewRoundModel =
  models.EstimateClientReviewRound ??
  model("EstimateClientReviewRound", estimateClientReviewRoundSchema);

export async function prepareEstimateClientReviewIndexes(): Promise<void> {
  await EstimateClientReviewRoundModel.createIndexes();
  await EstimateClientResponseProofModel.createIndexes();
}
