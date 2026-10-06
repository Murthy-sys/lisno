import { MAX_FINANCE_AMOUNT_PAISE } from "../domain/project-finance.js";
import { model, models, Schema } from "./mongoose.js";

const positivePaise = { type: Number, required: true, min: 1, max: MAX_FINANCE_AMOUNT_PAISE, validate: Number.isSafeInteger };
const nonnegativePaise = { type: Number, required: true, min: 0, max: MAX_FINANCE_AMOUNT_PAISE, validate: Number.isSafeInteger };
const quantity = { type: Number, required: true, min: 1, max: 1_000_000_000, validate: Number.isSafeInteger };
const basisPoints = { type: Number, required: true, min: 0, max: 10_000, validate: Number.isSafeInteger };
const requiredId = { type: String, required: true, trim: true, minlength: 1, maxlength: 500 };
const sourceSchema = new Schema({ estimateId: requiredId,
  estimateVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  estimateReviewRoundId: { type: String, default: null } }, { _id: false, strict: "throw" });
const boqLineSchema = new Schema({
  id: requiredId, sourceLineItemKey: requiredId,
  roomId: { type: String, default: null }, roomName: requiredId,
  subBasketId: { type: String, default: null }, subBasketName: { type: String, default: null },
  mainLineId: { type: String, default: null }, mainLineName: { type: String, default: null },
  approvedQuantity: requiredId, approvedUnit: requiredId,
  approvedQuoteAmountPaise: { type: Number, default: null, min: 0, max: MAX_FINANCE_AMOUNT_PAISE,
    validate: (value: unknown) => value === null || Number.isSafeInteger(value) },
  description: { type: String, required: true, trim: true, minlength: 1, maxlength: 2_000 },
  quantityMilliUnits: quantity,
  uomId: requiredId, uomCode: requiredId,
  uomDecimalScale: { type: Number, required: true, min: 0, max: 3, validate: Number.isSafeInteger },
  scopeType: { type: String, enum: ["supply", "execution", "supply_and_execution"] },
  targetDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/u },
  deliveryLocation: { type: String, trim: true, minlength: 1, maxlength: 500 }
}, { _id: false, strict: "throw" });

const enquirySchema = new Schema({
  _id: requiredId, projectId: requiredId, mainBasketId: requiredId,
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  status: { type: String, required: true, enum: ["draft", "sent", "award_pending", "issued", "cancelled"] },
  estimateSource: { type: sourceSchema, required: true },
  preparationDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  draftLines: { type: [boqLineSchema], required: true, validate: (value: unknown[]) => value.length > 0 && value.length <= 100 },
  currentBoqRevisionId: { type: String, default: null },
  latestAwardId: { type: String, default: null },
  createdById: requiredId, updatedById: requiredId,
  createIdempotencyKey: requiredId, createRequestDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  lastMutationKey: { type: String, default: null },
  lastMutationDigest: { type: String, default: null }
}, { collection: "procurementBasketEnquiries", strict: "throw", versionKey: false, timestamps: true });
enquirySchema.index({ projectId: 1, mainBasketId: 1, status: 1, _id: 1 });
enquirySchema.index({ projectId: 1, mainBasketId: 1, createIdempotencyKey: 1 }, { unique: true });
enquirySchema.index({ projectId: 1, mainBasketId: 1 }, { unique: true,
  partialFilterExpression: { status: { $in: ["draft", "sent", "award_pending"] } } });
export const ProcurementBasketEnquiryModel = models.ProcurementBasketEnquiry ?? model("ProcurementBasketEnquiry", enquirySchema);

const revisionSchema = new Schema({
  _id: requiredId, enquiryId: requiredId, projectId: requiredId, mainBasketId: requiredId,
  revision: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  basketName: { type: String, default: null },
  estimateSource: { type: sourceSchema, required: true },
  preparationDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  digest: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  lines: { type: [boqLineSchema], required: true, validate: (value: unknown[]) => value.length > 0 && value.length <= 100, immutable: true },
  sentAt: { type: Date, required: true }, sentById: requiredId, dispatchKey: requiredId,
  dispatchRequestDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u }
}, { collection: "procurementBasketBoqRevisions", strict: "throw", versionKey: false, timestamps: false });
revisionSchema.index({ enquiryId: 1, revision: 1 }, { unique: true });
revisionSchema.index({ enquiryId: 1, dispatchKey: 1 }, { unique: true });
export const ProcurementBasketBoqRevisionModel = models.ProcurementBasketBoqRevision ?? model("ProcurementBasketBoqRevision", revisionSchema);

const invitationSchema = new Schema({
  _id: requiredId, enquiryId: requiredId, boqRevisionId: requiredId, projectId: requiredId, mainBasketId: requiredId,
  vendorId: requiredId, generation: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  kind: { type: String, required: true, enum: ["initial", "resend", "counteroffer"] },
  tokenHash: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  recipientEmailHash: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  status: { type: String, required: true, enum: ["pending", "sent", "failed", "expired", "consumed", "superseded", "revoked"] },
  requestedAt: { type: Date, required: true }, sentAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true }, consumedAt: { type: Date, default: null },
  requestedById: requiredId, dispatchKey: requiredId,
  requestDigest: { type: String, default: null, match: /^[a-f0-9]{64}$/u },
  submissionKey: { type: String, default: null }, submissionDigest: { type: String, default: null },
  submissionTokenHash: { type: String, default: null, match: /^[a-f0-9]{64}$/u },
  receiptBidId: { type: String, default: null }
}, { collection: "procurementBasketInvitations", strict: "throw", versionKey: false, timestamps: false });
invitationSchema.index({ tokenHash: 1 }, { unique: true });
invitationSchema.index({ enquiryId: 1, boqRevisionId: 1, vendorId: 1, generation: 1 }, { unique: true });
invitationSchema.index({ enquiryId: 1, boqRevisionId: 1, vendorId: 1, status: 1 });
invitationSchema.index({ enquiryId: 1, boqRevisionId: 1, vendorId: 1 }, { unique: true,
  partialFilterExpression: { status: "sent" } });
export const ProcurementBasketInvitationModel = models.ProcurementBasketInvitation ?? model("ProcurementBasketInvitation", invitationSchema);

const invitationBatchItemSchema = new Schema({
  vendorId: requiredId,
  action: { type: String, required: true, enum: ["first_invitation", "retry", "updated_bid_request", "already_invited"] },
  invitationId: { type: String, default: null }
}, { _id: false, strict: "throw" });
const invitationBatchSchema = new Schema({
  _id: requiredId, enquiryId: requiredId, boqRevisionId: requiredId, projectId: requiredId,
  mainBasketId: requiredId, idempotencyKey: requiredId,
  requestDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  resultVersion: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  items: { type: [invitationBatchItemSchema], required: true,
    validate: (value: unknown[]) => value.length > 0 },
  requestedById: requiredId, requestedAt: { type: Date, required: true }
}, { collection: "procurementBasketInvitationBatches", strict: "throw", versionKey: false, timestamps: false });
invitationBatchSchema.index({ enquiryId: 1, idempotencyKey: 1 }, { unique: true });
export const ProcurementBasketInvitationBatchModel = models.ProcurementBasketInvitationBatch ?? model("ProcurementBasketInvitationBatch", invitationBatchSchema);

const whatsAppAccessSchema = new Schema({
  _id: requiredId, invitationId: requiredId, enquiryId: requiredId, boqRevisionId: requiredId,
  projectId: requiredId, mainBasketId: requiredId, vendorId: requiredId,
  tokenHash: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  recipientPhoneHash: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  status: { type: String, required: true, enum: ["active", "consumed"] },
  requestedById: requiredId, requestedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true }, consumedAt: { type: Date, default: null }
}, { collection: "procurementBasketWhatsAppAccess", strict: "throw", versionKey: false, timestamps: false });
whatsAppAccessSchema.index({ tokenHash: 1 }, { unique: true });
whatsAppAccessSchema.index({ invitationId: 1, requestedAt: -1 });
export const ProcurementBasketWhatsAppAccessModel = models.ProcurementBasketWhatsAppAccess ?? model("ProcurementBasketWhatsAppAccess", whatsAppAccessSchema);

const bidLineSchema = new Schema({ boqLineId: requiredId, unitPricePaise: positivePaise, gstBasisPoints: basisPoints,
  netPaise: positivePaise, gstPaise: nonnegativePaise, totalPaise: positivePaise }, { _id: false, strict: "throw" });
const totalSchema = new Schema({ netPaise: positivePaise, gstPaise: nonnegativePaise, totalPaise: positivePaise }, { _id: false, strict: "throw" });
const bidSchema = new Schema({
  _id: requiredId, enquiryId: requiredId, boqRevisionId: requiredId, invitationId: requiredId,
  projectId: requiredId, mainBasketId: requiredId, vendorId: requiredId,
  revision: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  lines: { type: [bidLineSchema], required: true, validate: (value: unknown[]) => value.length > 0 && value.length <= 100, immutable: true },
  totals: { type: totalSchema, required: true, immutable: true },
  bidDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  submittedAt: { type: Date, required: true }, submissionKey: requiredId
}, { collection: "procurementBasketBids", strict: "throw", versionKey: false, timestamps: false });
bidSchema.index({ enquiryId: 1, boqRevisionId: 1, vendorId: 1, revision: 1 }, { unique: true });
bidSchema.index({ invitationId: 1 }, { unique: true });
bidSchema.index({ enquiryId: 1, boqRevisionId: 1, submittedAt: -1, revision: -1, _id: -1 });
export const ProcurementBasketBidModel = models.ProcurementBasketBid ?? model("ProcurementBasketBid", bidSchema);

const counterofferSchema = new Schema({ _id: requiredId, enquiryId: requiredId, boqRevisionId: requiredId,
  projectId: requiredId, vendorId: requiredId, priorBidId: requiredId, invitationId: requiredId,
  reason: { type: String, required: true, trim: true, minlength: 10, maxlength: 2_000 },
  targetNetPaise: { type: Number, default: null, min: 1, max: MAX_FINANCE_AMOUNT_PAISE, validate: (value: unknown) => value === null || Number.isSafeInteger(value) },
  requestedById: requiredId, requestedAt: { type: Date, required: true }, idempotencyKey: requiredId
}, { collection: "procurementBasketCounteroffers", strict: "throw", versionKey: false, timestamps: false });
counterofferSchema.index({ enquiryId: 1, vendorId: 1, idempotencyKey: 1 }, { unique: true });
counterofferSchema.index({ enquiryId: 1, boqRevisionId: 1, requestedAt: -1, _id: -1 });
export const ProcurementBasketCounterofferModel = models.ProcurementBasketCounteroffer ?? model("ProcurementBasketCounteroffer", counterofferSchema);

const awardSchema = new Schema({
  _id: requiredId, enquiryId: requiredId, boqRevisionId: requiredId, projectId: requiredId, mainBasketId: requiredId,
  vendorId: requiredId, bidId: requiredId,
  version: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  status: { type: String, required: true, enum: ["draft", "pending_approvals", "ready_to_issue", "issued", "rejected"] },
  requiresRevision: { type: Boolean, required: true, default: false },
  currentProposalRevisionId: requiredId, issuedPurchaseOrderId: { type: String, default: null },
  issueIdempotencyKey: { type: String, default: null }, issueRequestDigest: { type: String, default: null },
  autoIssueOnApproval: { type: Boolean, required: true, default: false },
  submittedById: { type: String, default: null },
  issueBlocker: { type: new Schema({ code: requiredId, message: requiredId }, { _id: false, strict: "throw" }), default: null },
  createdById: requiredId, updatedById: requiredId,
  createIdempotencyKey: requiredId, createRequestDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  lastMutationKey: { type: String, default: null }, lastMutationDigest: { type: String, default: null },
  lastRequestDigest: { type: String, default: null },
  submitIdempotencyKey: { type: String, default: null }, submitRequestDigest: { type: String, default: null }
}, { collection: "procurementBasketAwards", strict: "throw", versionKey: false, timestamps: true });
awardSchema.index({ enquiryId: 1 }, { unique: true });
awardSchema.index({ projectId: 1, status: 1 });
awardSchema.index({ issuedPurchaseOrderId: 1 }, { unique: true, partialFilterExpression: { issuedPurchaseOrderId: { $type: "string" } } });
export const ProcurementBasketAwardModel = models.ProcurementBasketAward ?? model("ProcurementBasketAward", awardSchema);

const milestoneSchema = new Schema({ id: requiredId, name: requiredId, basisPoints, amountPaise: nonnegativePaise,
  reviewerSlots: { type: [{ type: String, enum: ["program_manager", "designer", "procurement", "finance_head"] }],
    default: undefined } }, { _id: false, strict: "throw" });
const awardLineTermsSchema = new Schema({ boqLineId: requiredId,
  scopeType: { type: String, enum: ["supply", "execution", "supply_and_execution"] },
  targetDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/u },
  deliveryLocation: { type: String, trim: true, minlength: 1, maxlength: 500 }
}, { _id: false, strict: "throw" });
const proposalSchema = new Schema({
  _id: requiredId, awardId: requiredId, enquiryId: requiredId, projectId: requiredId,
  revision: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  boqRevisionId: requiredId, boqDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  bidId: requiredId, bidDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  vendorId: requiredId, vendorName: requiredId, officialKpiScoreBps: basisPoints,
  officialKpiAssessmentId: requiredId,
  officialKpiAssessmentRevision: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
  recommendedBidId: { type: String, default: null },
  comparisonDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  nonRecommendedReason: { type: String, default: null, maxlength: 2_000 },
  totals: { type: totalSchema, required: true },
  approvedEstimatePaise: nonnegativePaise, committedNetPaise: nonnegativePaise,
  terms: { type: String, default: null, trim: true, minlength: 1, maxlength: 4_000 },
  lineTerms: { type: [awardLineTermsSchema], default: undefined,
    validate: (value: unknown[] | undefined) => value === undefined || value.length <= 100 },
  advanceBasisPoints: basisPoints,
  milestones: { type: [milestoneSchema], required: true, validate: (value: unknown[]) => value.length === 5 },
  requiredSlots: { type: [{ type: String, enum: ["program_manager", "designer", "procurement", "finance_head", "budget_override"] }], required: true },
  budgetOverrideRequired: { type: Boolean, required: true },
  programManagerId: { type: String, default: null }, designerId: { type: String, default: null },
  proposalDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  withdrawnFromProposalRevisionId: { type: String, default: null },
  withdrawalReason: { type: String, default: null, maxlength: 2_000 },
  withdrawalIdempotencyKey: { type: String, default: null },
  withdrawalRequestDigest: { type: String, default: null, match: /^[a-f0-9]{64}$/u },
  createdAt: { type: Date, required: true }, createdById: requiredId
}, { collection: "procurementBasketAwardRevisions", strict: "throw", versionKey: false, timestamps: false });
proposalSchema.index({ awardId: 1, revision: 1 }, { unique: true });
proposalSchema.index({ awardId: 1, withdrawalIdempotencyKey: 1 }, { unique: true,
  partialFilterExpression: { withdrawalIdempotencyKey: { $type: "string" } } });
export const ProcurementBasketAwardRevisionModel = models.ProcurementBasketAwardRevision ?? model("ProcurementBasketAwardRevision", proposalSchema);

const approvalSchema = new Schema({ _id: requiredId, awardId: requiredId, proposalRevisionId: requiredId,
  projectId: requiredId, slot: { type: String, required: true, enum: ["program_manager", "designer", "procurement", "finance_head", "budget_override"] },
  actorId: requiredId, decision: { type: String, required: true, enum: ["approve", "reject"] },
  reason: { type: String, default: null, maxlength: 2_000 }, proposalDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/u },
  decidedAt: { type: Date, required: true }, idempotencyKey: requiredId
}, { collection: "procurementBasketAwardApprovals", strict: "throw", versionKey: false, timestamps: false });
approvalSchema.index({ awardId: 1, proposalRevisionId: 1, slot: 1 }, { unique: true });
approvalSchema.index({ awardId: 1, proposalRevisionId: 1, actorId: 1 }, { unique: true });
export const ProcurementBasketAwardApprovalModel = models.ProcurementBasketAwardApproval ?? model("ProcurementBasketAwardApproval", approvalSchema);
