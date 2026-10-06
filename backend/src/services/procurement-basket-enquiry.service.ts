import { randomBytes } from "node:crypto";
import type { ClientSession } from "mongoose";
import { procurementBasketDigest, calculateProcurementBasketBid,
  type ProcurementBasketEnquiryCreateInput, type ProcurementBasketEnquiryUpdateInput,
  type ProcurementBasketDispatchInput, type ProcurementBasketResendInvitationInput, type ProcurementBasketPublicSubmitInput,
  type ProcurementBasketCounterofferInput, type ProcurementBasketBoqLine,
  type ProcurementBasketVendorSelection, type ProcurementBasketInvitationBatchPreviewInput,
  type ProcurementBasketInvitationBatchSubmitInput } from "../domain/procurement-basket-tender.js";
import type { ProcurementBasketDetailDto } from "../domain/procurement-basket-projection.js";
import { procurementBasketLineBoqReady } from "../domain/procurement-basket-projection.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeBasketModel } from "../models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeUomModel } from "../models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { ProjectModel } from "../models/Project.js";
import { ProcurementBasketBidModel, ProcurementBasketBoqRevisionModel, ProcurementBasketCounterofferModel,
  ProcurementBasketEnquiryModel, ProcurementBasketInvitationModel, ProcurementBasketInvitationBatchModel,
  ProcurementBasketWhatsAppAccessModel } from "../models/ProcurementBasketTender.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { procurementItemSourceSnapshot } from "./procurement.service.js";
import type { ProcurementBasketBoqMailer } from "./procurement-basket-boq-mailer.js";
import { assertBasketVendorEligible, eligibleBasketVendors,
  type BasketVendorCandidate } from "./procurement-basket-vendor-eligibility.service.js";
import { storedProcurementVendorProfile } from "./procurement-vendor-profile.js";
import { assertBasketSourceUnreserved, basketVendorScopeMatchesRevision, buildBasketBoqLines,
  currentBasket, currentBasketForVendorScope, getBasketEnquiry, getCurrentBoq,
  requireBasketBuyer, tenderConflict, tenderHash, tenderId, tenderIso, tenderLinkUnavailable, tenderTransaction,
  type TenderRow } from "./procurement-basket-tender-support.service.js";

const LINK_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const WHATSAPP_LINK_LIFETIME_MS = 24 * 60 * 60 * 1000;
const STALE_DELIVERY_MS = 10 * 60 * 1000;

function whatsAppPhone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/[^0-9]/gu, "");
  if (/^[6-9][0-9]{9}$/u.test(digits)) return `91${digits}`;
  if (/^91[6-9][0-9]{9}$/u.test(digits)) return digits;
  return null;
}

async function preflightInvitationDelivery(mailer: ProcurementBasketBoqMailer): Promise<void> {
  if (mailer.deliveryKind === "disabled")
    throw new ApiError(503, "PROCUREMENT_BASKET_DELIVERY_DISABLED", "Vendor BOQ email delivery is unavailable.");
  if (mailer.deliveryKind === "external" && !mailer.preflight)
    throw new ApiError(503, "PROCUREMENT_BASKET_DELIVERY_UNAVAILABLE", "Vendor BOQ email delivery is unavailable.");
  try { await mailer.preflight?.(); }
  catch { throw new ApiError(503, "PROCUREMENT_BASKET_DELIVERY_UNAVAILABLE", "Vendor BOQ email delivery is unavailable."); }
}

export interface ProcurementBasketEnquiryDto {
  id: string; projectId: string; mainBasketId: string; version: number;
  status: "draft" | "sent" | "award_pending" | "issued" | "cancelled";
  estimateSource: { estimateId: string; estimateVersion: number; estimateReviewRoundId: string | null };
  preparationDigest: string;
  vendorScopeCurrent: boolean | null;
  boqRevisionId: string | null;
  boqRevision: number | null;
  boqDigest: string | null;
  lines: ProcurementBasketBoqLine[];
  invitations: Array<{ id: string; vendorId: string; vendorName: string; vendorCode: string; kind: string;
    status: string; expiresAt: string; sentAt: string | null; generation: number }>;
  bidCount: number;
  awardId: string | null;
}

export type ProcurementBasketInvitationBatchAction = "first_invitation" | "retry" | "updated_bid_request" | "already_invited";
export interface ProcurementBasketInvitationBatchPreviewDto {
  enquiryId: string; enquiryVersion: number; boqRevisionId: string; boqDigest: string;
  selectedCount: number; requiresReason: boolean;
  actions: Array<{ vendorId: string; vendorName: string; action: ProcurementBasketInvitationBatchAction;
    invitationStatus: string | null; priorBidId: string | null }>;
}
export interface ProcurementBasketInvitationBatchResultDto {
  enquiry: ProcurementBasketEnquiryDto; selectedCount: number;
  results: Array<{ vendorId: string; action: ProcurementBasketInvitationBatchAction;
    status: string; invitationId: string | null }>;
}

export interface ProcurementBasketPublicBoqDto {
  projectName: string; basketName: string; expiresAt: string;
  lines: Array<{ id: string; description: string; quantityMilliUnits: number; uomCode: string;
    approvedQuantity: string; approvedUnit: string | null; approvedQuoteAmountPaise: number | null;
    scopeType?: string; targetDate?: string; deliveryLocation?: string }>;
}

export interface ProcurementBasketBoqHistoryPageDto {
  enquiryId: string; currentBoqRevisionId: string | null;
  revisions: Array<{ id: string; revision: number; sentAt: string; boqDigest: string;
    lineCount: number; bidCount: number; counterofferCount: number }>;
  nextBeforeRevision: number | null;
}

export interface ProcurementBasketBoqHistoryDetailDto {
  enquiryId: string; canAward: false;
  boq: { id: string; revision: number; sentAt: string; digest: string; lines: ProcurementBasketBoqLine[] };
  bids: Array<{ bidId: string; vendorId: string; vendorName: string; revision: number; submittedAt: string;
    totals: { netPaise: number; gstPaise: number; totalPaise: number };
    lines: Array<{ boqLineId: string; description: string; quantityMilliUnits: number; uomCode: string;
      unitPricePaise: number; gstBasisPoints: number; netPaise: number; gstPaise: number; totalPaise: number }> }>;
  bidTotal: number;
  counteroffers: Array<{ id: string; vendorId: string; vendorName: string; priorBidId: string;
    reason: string; targetNetPaise: number | null; requestedById: string; requestedAt: string;
    invitationStatus: string; answeredBidId: string | null }>;
  counterofferTotal: number;
}

export interface ProcurementBasketEnquiryService {
  list(actor: PublicUser, projectId: string, basketId: string): Promise<ProcurementBasketEnquiryDto[]>;
  get(actor: PublicUser, projectId: string, basketId: string, enquiryId: string): Promise<ProcurementBasketEnquiryDto>;
  history(actor: PublicUser, projectId: string, basketId: string, enquiryId: string,
    input: { beforeRevision?: number; limit: number }): Promise<ProcurementBasketBoqHistoryPageDto>;
  historyDetail(actor: PublicUser, projectId: string, basketId: string, enquiryId: string, revisionId: string,
    input: { bidOffset: number; counterofferOffset: number; limit: number }): Promise<ProcurementBasketBoqHistoryDetailDto>;
  create(actor: PublicUser, projectId: string, basketId: string, input: ProcurementBasketEnquiryCreateInput): Promise<ProcurementBasketEnquiryDto>;
  update(actor: PublicUser, projectId: string, basketId: string, enquiryId: string, input: ProcurementBasketEnquiryUpdateInput): Promise<ProcurementBasketEnquiryDto>;
  dispatch(actor: PublicUser, projectId: string, basketId: string, enquiryId: string, input: ProcurementBasketDispatchInput): Promise<ProcurementBasketEnquiryDto>;
  previewInvitationBatch(actor: PublicUser, projectId: string, basketId: string, enquiryId: string,
    input: ProcurementBasketInvitationBatchPreviewInput): Promise<ProcurementBasketInvitationBatchPreviewDto>;
  submitInvitationBatch(actor: PublicUser, projectId: string, basketId: string, enquiryId: string,
    input: ProcurementBasketInvitationBatchSubmitInput): Promise<ProcurementBasketInvitationBatchResultDto>;
  resendInvitation(actor: PublicUser, projectId: string, basketId: string, enquiryId: string,
    input: ProcurementBasketResendInvitationInput): Promise<ProcurementBasketEnquiryDto>;
  whatsAppShareIntent(actor: PublicUser, projectId: string, basketId: string, enquiryId: string,
    vendorId: string): Promise<{ available: boolean; shareUrl: string | null; blocker: string | null;
      expiresAt: string | null }>;
  inspectVendorBoq(token: string): Promise<ProcurementBasketPublicBoqDto>;
  submitVendorBid(input: ProcurementBasketPublicSubmitInput): Promise<{ bidId: string; submittedAt: string; totals: { netPaise: number; gstPaise: number; totalPaise: number } }>;
  requestCounteroffer(actor: PublicUser, projectId: string, basketId: string, enquiryId: string, input: ProcurementBasketCounterofferInput): Promise<ProcurementBasketEnquiryDto>;
}

function presentBoqLines(lines: ProcurementBasketBoqLine[]): ProcurementBasketBoqLine[] {
  return lines.map(line => ({ ...line, approvedQuoteAmountPaise: line.approvedQuoteAmountPaise ?? null }));
}

async function selectedBasketVendors(selection: ProcurementBasketVendorSelection, projectId: string,
  basketId: string, session: ClientSession): Promise<BasketVendorCandidate[]> {
  if (selection.kind === "vendors") {
    const selected: BasketVendorCandidate[] = [];
    for (const vendorId of selection.vendorIds)
      selected.push(await assertBasketVendorEligible(vendorId, projectId, basketId, session));
    return selected;
  }
  const excluded = new Set(selection.excludedVendorIds ?? []);
  const selected = (await eligibleBasketVendors(projectId, basketId, session))
    .filter(candidate => !excluded.has(candidate.vendorId));
  if (!selected.length) tenderConflict("PROCUREMENT_BASKET_VENDOR_SELECTION_EMPTY", "No eligible vendors are selected for this main basket.");
  return selected;
}

interface PlannedInvitation {
  candidate: BasketVendorCandidate; action: ProcurementBasketInvitationBatchAction;
  latest: TenderRow | null; priorBid: TenderRow | null; invitationStatus: string | null;
}

async function planInvitationBatch(projectId: string, basketId: string, enquiry: TenderRow,
  input: ProcurementBasketInvitationBatchPreviewInput, session: ClientSession,
  at: Date): Promise<{ revision: TenderRow; basket: ProcurementBasketDetailDto; planned: PlannedInvitation[] }> {
  if (enquiry.status !== "sent" || enquiry.version !== input.expectedVersion)
    tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "This enquiry changed. Reload before inviting vendors.");
  const revision = await getCurrentBoq(enquiry, session);
  if (revision._id !== input.boqRevisionId || revision.digest !== input.boqDigest)
    tenderConflict("PROCUREMENT_BASKET_BOQ_SUPERSEDED", "The sent BOQ changed. Reload before inviting vendors.");
  const basket = await currentBasketForVendorScope(projectId, basketId, revision, session);
  await assertBasketSourceUnreserved(projectId,
    (revision.lines as ProcurementBasketBoqLine[]).map(line => line.sourceLineItemKey), session, String(enquiry._id));
  const candidates = await selectedBasketVendors(input.selection, projectId, basketId, session);
  const latestByVendor = new Map<string, TenderRow>();
  const activeByVendor = new Set<string>();
  const bidByVendor = new Map<string, TenderRow>();
  for (let offset = 0; offset < candidates.length; offset += 200) {
    const vendorIds = candidates.slice(offset, offset + 200).map(candidate => candidate.vendorId);
    const invitations = await ProcurementBasketInvitationModel.find({ enquiryId: enquiry._id,
      boqRevisionId: revision._id, vendorId: { $in: vendorIds } })
      .sort({ generation: -1 }).session(session).lean() as TenderRow[];
    for (const invitation of invitations) {
      const vendorId = String(invitation.vendorId);
      if (!latestByVendor.has(vendorId)) latestByVendor.set(vendorId, invitation);
      const live = new Date(invitation.expiresAt) > at;
      const stale = invitation.status === "pending" &&
        at.getTime() - new Date(invitation.requestedAt).getTime() >= STALE_DELIVERY_MS;
      if (live && (invitation.status === "sent" || invitation.status === "pending" && !stale))
        activeByVendor.add(vendorId);
    }
    const bids = await ProcurementBasketBidModel.find({ enquiryId: enquiry._id,
      boqRevisionId: revision._id, vendorId: { $in: vendorIds } })
      .sort({ revision: -1 }).session(session).lean() as TenderRow[];
    for (const bid of bids) if (!bidByVendor.has(String(bid.vendorId))) bidByVendor.set(String(bid.vendorId), bid);
  }
  const planned = candidates.map(candidate => {
    const latest = latestByVendor.get(candidate.vendorId) ?? null;
    const priorBid = bidByVendor.get(candidate.vendorId) ?? null;
    if (latest?.status === "consumed" && !priorBid)
      tenderConflict("PROCUREMENT_BASKET_INVITATION_INCONSISTENT", "A vendor response is incomplete. Reload before inviting vendors.");
    const action: ProcurementBasketInvitationBatchAction = activeByVendor.has(candidate.vendorId)
      ? "already_invited" : priorBid ? "updated_bid_request" : latest ? "retry" : "first_invitation";
    const invitationStatus = latest && ["sent", "pending"].includes(String(latest.status)) &&
      new Date(latest.expiresAt) <= at ? "expired" : latest?.status === "pending" &&
        at.getTime() - new Date(latest.requestedAt).getTime() >= STALE_DELIVERY_MS
        ? "stalled" : latest ? String(latest.status) : null;
    return { candidate, action, latest, priorBid, invitationStatus };
  });
  return { revision, basket, planned };
}

function assertSentBasketReady(basket: ProcurementBasketDetailDto): void {
  const unready = basket.lines.find(line => line.included &&
    !procurementBasketLineBoqReady(basket, line));
  if (!basket.boqReady || unready) {
    const lineName = unready?.mainLineName?.trim() || unready?.sourceLineItemKey || "An included line";
    tenderConflict(basket.automaticSubVendor ? "PROCUREMENT_BASKET_SUB_VENDOR_COST_UNAVAILABLE"
      : "PROCUREMENT_BASKET_MODE_REQUIRED",
    `${lineName} is not ready for vendor invitations. Complete its saved Configuration and start a new BOQ round if the approved scope changed.`);
  }
}

/** Configuration writers touch these rows, so a sent-batch read conflicts with concurrent changes. */
async function fenceBasketConfiguration(projectId: string, basketId: string,
  session: ClientSession): Promise<void> {
  const source = await procurementItemSourceSnapshot(projectId, session);
  const configuredLines = source.allLineItems.filter(line =>
    line.source === "configuration" && (line.mainBasketId ?? line.sectionId) === basketId);
  const basketIds = [...new Set(configuredLines.flatMap(line => line.mainBasketId ? [line.mainBasketId] : []))].sort();
  const subBasketIds = [...new Set(configuredLines.flatMap(line => line.subBasketId ? [line.subBasketId] : []))].sort();
  const uomIds = [...new Set(configuredLines.flatMap(line => line.uomId ? [line.uomId] : []))].sort();
  const mainLineIds = [...new Set(configuredLines.flatMap(line => line.mainLineId ? [line.mainLineId] : []))].sort();
  for (const id of basketIds) {
    const fenced = await AiEstimatorKnowledgeBasketModel.findOneAndUpdate({ _id: id },
      { $inc: { dependencyEpoch: 1 } },
      { session, returnDocument: "after", runValidators: true, timestamps: false }).lean();
    if (!fenced) tenderConflict("PROCUREMENT_BASKET_SOURCE_CHANGED",
      "This basket's Configuration is unavailable. Refresh it before sending.");
  }
  for (const id of subBasketIds) {
    const fenced = await AiEstimatorKnowledgeSubBasketModel.findOneAndUpdate({ _id: id },
      { $inc: { dependencyEpoch: 1 } },
      { session, returnDocument: "after", runValidators: true, timestamps: false }).lean();
    if (!fenced) tenderConflict("PROCUREMENT_BASKET_SOURCE_CHANGED",
      "A configured sub-basket is unavailable. Refresh this basket before sending.");
  }
  for (const id of uomIds) {
    const fenced = await AiEstimatorKnowledgeUomModel.findOneAndUpdate({ _id: id },
      { $inc: { dependencyEpoch: 1 } },
      { session, returnDocument: "after", runValidators: true, timestamps: false }).lean();
    if (!fenced) tenderConflict("PROCUREMENT_BASKET_SOURCE_CHANGED",
      "A configured unit is unavailable. Refresh this basket before sending.");
  }
  for (const mainLineId of mainLineIds) {
    const fenced = await AiEstimatorKnowledgeMainLineModel.findOneAndUpdate({ _id: mainLineId },
      { $inc: { dependencyEpoch: 1 } },
      { session, returnDocument: "after", runValidators: true, timestamps: false }).lean();
    if (!fenced) tenderConflict("PROCUREMENT_BASKET_SOURCE_CHANGED",
      "A configured line in this basket is unavailable. Refresh the basket before sending it.");
  }
}

export function createProcurementBasketEnquiryService({ audit, mailer,
  vendorBoqPublicUrl = "http://localhost:5173/vendor-boq", now = () => new Date() }: {
  audit: AuditService; mailer: ProcurementBasketBoqMailer; vendorBoqPublicUrl?: string; now?: () => Date
}): ProcurementBasketEnquiryService {
  const get = (actor: PublicUser, projectId: string, basketId: string, enquiryId: string) => tenderTransaction(async session => {
    await requireBasketBuyer(actor, projectId, session);
    return enquiryDto(await getBasketEnquiry(projectId, basketId, enquiryId, session), session, now());
  });
  return {
    list(actor, projectId, basketId) {
      return tenderTransaction(async session => {
        await requireBasketBuyer(actor, projectId, session);
        const basket = await currentBasket(projectId, basketId, session);
        const rows = await ProcurementBasketEnquiryModel.find({ projectId, mainBasketId: basketId }).sort({ createdAt: -1, _id: 1 })
          .limit(100).session(session).lean() as TenderRow[];
        const result: ProcurementBasketEnquiryDto[] = [];
        for (const row of rows) result.push(await enquiryDto(row, session, now(), basket));
        return result;
      });
    },
    get,
    history(actor, projectId, basketId, enquiryId, input) {
      return tenderTransaction(async session => {
        await requireBasketBuyer(actor, projectId, session);
        if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 20 ||
          (input.beforeRevision !== undefined && (!Number.isSafeInteger(input.beforeRevision) || input.beforeRevision < 1)))
          throw new ApiError(400, "VALIDATION_ERROR", "Invalid BOQ history pagination.");
        const enquiry = await getBasketEnquiry(projectId, basketId, enquiryId, session);
        const current = enquiry.currentBoqRevisionId ? await getCurrentBoq(enquiry, session) : null;
        const upperBound = Math.min(input.beforeRevision ?? Number.MAX_SAFE_INTEGER,
          current ? Number(current.revision) : Number.MAX_SAFE_INTEGER);
        const rows = await ProcurementBasketBoqRevisionModel.find({ enquiryId, projectId, mainBasketId: basketId,
          revision: { $lt: upperBound } }).sort({ revision: -1 }).limit(input.limit + 1)
          .session(session).lean() as TenderRow[];
        const shown = rows.slice(0, input.limit);
        const ids = shown.map(row => String(row._id));
        const bidCounts = ids.length ? await ProcurementBasketBidModel.aggregate([
          { $match: { enquiryId, boqRevisionId: { $in: ids } } },
          { $group: { _id: "$boqRevisionId", count: { $sum: 1 } } }
        ]).session(session) as Array<{ _id: string; count: number }> : [];
        const counterofferCounts = ids.length ? await ProcurementBasketCounterofferModel.aggregate([
          { $match: { enquiryId, boqRevisionId: { $in: ids } } },
          { $group: { _id: "$boqRevisionId", count: { $sum: 1 } } }
        ]).session(session) as Array<{ _id: string; count: number }> : [];
        const bidsByRevision = new Map(bidCounts.map(row => [row._id, row.count]));
        const counteroffersByRevision = new Map(counterofferCounts.map(row => [row._id, row.count]));
        return { enquiryId, currentBoqRevisionId: current ? String(current._id) : null,
          revisions: shown.map(row => ({ id: String(row._id), revision: Number(row.revision),
            sentAt: tenderIso(row.sentAt), boqDigest: String(row.digest),
            lineCount: (row.lines as ProcurementBasketBoqLine[]).length,
            bidCount: bidsByRevision.get(String(row._id)) ?? 0,
            counterofferCount: counteroffersByRevision.get(String(row._id)) ?? 0 })),
          nextBeforeRevision: rows.length > input.limit ? Number(shown.at(-1)!.revision) : null };
      });
    },
    historyDetail(actor, projectId, basketId, enquiryId, revisionId, input) {
      return tenderTransaction(async session => {
        await requireBasketBuyer(actor, projectId, session);
        if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 50 ||
          !Number.isSafeInteger(input.bidOffset) || input.bidOffset < 0 || input.bidOffset > 1_000_000 ||
          !Number.isSafeInteger(input.counterofferOffset) || input.counterofferOffset < 0 || input.counterofferOffset > 1_000_000)
          throw new ApiError(400, "VALIDATION_ERROR", "Invalid BOQ history pagination.");
        const enquiry = await getBasketEnquiry(projectId, basketId, enquiryId, session);
        if (enquiry.currentBoqRevisionId === revisionId)
          throw new ApiError(404, "PROCUREMENT_BASKET_HISTORY_NOT_FOUND", "This historical BOQ revision is unavailable.");
        const revision = await ProcurementBasketBoqRevisionModel.findOne({ _id: revisionId, enquiryId,
          projectId, mainBasketId: basketId }).session(session).lean() as TenderRow | null;
        if (!revision)
          throw new ApiError(404, "PROCUREMENT_BASKET_HISTORY_NOT_FOUND", "This historical BOQ revision is unavailable.");
        const filter = { enquiryId, boqRevisionId: revisionId };
        const bidTotal = await ProcurementBasketBidModel.countDocuments(filter).session(session);
        const bids = await ProcurementBasketBidModel.find(filter).sort({ submittedAt: -1, revision: -1, _id: -1 })
          .skip(input.bidOffset).limit(input.limit).session(session).lean() as TenderRow[];
        const counterofferTotal = await ProcurementBasketCounterofferModel.countDocuments(filter).session(session);
        const counteroffers = await ProcurementBasketCounterofferModel.find(filter).sort({ requestedAt: -1, _id: -1 })
          .skip(input.counterofferOffset).limit(input.limit).session(session).lean() as TenderRow[];
        const vendorIds = [...new Set([...bids, ...counteroffers].map(row => String(row.vendorId)))];
        const vendors = vendorIds.length ? await AiEstimatorKnowledgeVendorModel.find({ _id: { $in: vendorIds } })
          .select({ name: 1 }).session(session).lean() as TenderRow[] : [];
        const vendorNames = new Map(vendors.map(row => [String(row._id), String(row.name)]));
        const invitationIds = counteroffers.map(row => String(row.invitationId));
        const invitations = invitationIds.length ? await ProcurementBasketInvitationModel.find({
          _id: { $in: invitationIds }, enquiryId, boqRevisionId: revisionId })
          .select({ status: 1, expiresAt: 1, receiptBidId: 1 }).session(session).lean() as TenderRow[] : [];
        const invitationById = new Map(invitations.map(row => [String(row._id), row]));
        const boqLines = presentBoqLines(revision.lines as ProcurementBasketBoqLine[]);
        const boqLineById = new Map(boqLines.map(line => [line.id, line]));
        return { enquiryId, canAward: false as const,
          boq: { id: revisionId, revision: Number(revision.revision), sentAt: tenderIso(revision.sentAt),
            digest: String(revision.digest), lines: boqLines },
          bids: bids.map(bid => ({ bidId: String(bid._id), vendorId: String(bid.vendorId),
            vendorName: vendorNames.get(String(bid.vendorId)) ?? "Unavailable vendor",
            revision: Number(bid.revision), submittedAt: tenderIso(bid.submittedAt),
            totals: bid.totals as { netPaise: number; gstPaise: number; totalPaise: number },
            lines: (bid.lines as TenderRow[]).map(line => {
              const boqLine = boqLineById.get(String(line.boqLineId));
              return { boqLineId: String(line.boqLineId), description: boqLine?.description ?? "BOQ line unavailable",
                quantityMilliUnits: boqLine?.quantityMilliUnits ?? 0, uomCode: boqLine?.uomCode ?? "",
                unitPricePaise: Number(line.unitPricePaise), gstBasisPoints: Number(line.gstBasisPoints),
                netPaise: Number(line.netPaise), gstPaise: Number(line.gstPaise), totalPaise: Number(line.totalPaise) };
            }) })), bidTotal,
          counteroffers: counteroffers.map(counteroffer => {
            const invitation = invitationById.get(String(counteroffer.invitationId));
            return { id: String(counteroffer._id), vendorId: String(counteroffer.vendorId),
              vendorName: vendorNames.get(String(counteroffer.vendorId)) ?? "Unavailable vendor",
              priorBidId: String(counteroffer.priorBidId), reason: String(counteroffer.reason),
              targetNetPaise: counteroffer.targetNetPaise == null ? null : Number(counteroffer.targetNetPaise),
              requestedById: String(counteroffer.requestedById), requestedAt: tenderIso(counteroffer.requestedAt),
              invitationStatus: invitation && ["sent", "pending"].includes(String(invitation.status)) &&
                new Date(invitation.expiresAt) <= now() ? "expired" : String(invitation?.status ?? "unavailable"),
              answeredBidId: invitation?.receiptBidId ? String(invitation.receiptBidId) : null };
          }), counterofferTotal };
      });
    },
    async create(actor, projectId, basketId, input) {
      const id = await tenderTransaction(async session => {
        await requireBasketBuyer(actor, projectId, session);
        const existing = await ProcurementBasketEnquiryModel.findOne({ projectId, mainBasketId: basketId,
          createIdempotencyKey: input.idempotencyKey }).session(session).lean() as TenderRow | null;
        const requestDigest = procurementBasketDigest({ input: input.lines, expectedPreparationDigest: input.expectedPreparationDigest });
        if (existing) {
          if (existing.createRequestDigest !== requestDigest) tenderConflict("PROCUREMENT_BASKET_IDEMPOTENCY_CONFLICT", "This request key was used for a different enquiry.");
          return String(existing._id);
        }
        const active = await ProcurementBasketEnquiryModel.findOne({ projectId, mainBasketId: basketId,
          status: { $in: ["draft", "sent", "award_pending"] } }).select({ _id: 1 }).session(session).lean();
        if (active) throw new ApiError(409, "PROCUREMENT_BASKET_ACTIVE_ENQUIRY_EXISTS",
          "Continue the existing enquiry for this basket.", { enquiryId: String(active._id) });
        const basket = await currentBasket(projectId, basketId, session, input.expectedPreparationDigest);
        const lines = buildBasketBoqLines(basket, input.lines);
        const enquiryId = tenderId("basket-enquiry");
        await ProcurementBasketEnquiryModel.create([{ _id: enquiryId, projectId, mainBasketId: basketId, version: 1,
          status: "draft", estimateSource: basket.estimateSource, preparationDigest: basket.preparationDigest,
          draftLines: lines, currentBoqRevisionId: null, latestAwardId: null,
          createdById: actor.id, updatedById: actor.id, createIdempotencyKey: input.idempotencyKey,
          createRequestDigest: requestDigest,
          lastMutationKey: input.idempotencyKey, lastMutationDigest: requestDigest }], { session });
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "procurement_basket_enquiry_created",
          entityType: "procurement_basket_enquiry", entityId: enquiryId, occurredAt: now().toISOString(),
          newValues: { projectId, basketId, lineCount: lines.length } }, session);
        return enquiryId;
      });
      return get(actor, projectId, basketId, id);
    },
    async update(actor, projectId, basketId, enquiryId, input) {
      await tenderTransaction(async session => {
        await requireBasketBuyer(actor, projectId, session);
        const enquiry = await getBasketEnquiry(projectId, basketId, enquiryId, session);
        const requestDigest = procurementBasketDigest({ input: input.lines, expectedPreparationDigest: input.expectedPreparationDigest });
        if (enquiry.lastMutationKey === input.idempotencyKey) {
          if (enquiry.lastMutationDigest !== requestDigest) tenderConflict("PROCUREMENT_BASKET_IDEMPOTENCY_CONFLICT", "This request key was reused with different details.");
          return;
        }
        if (!["draft", "sent"].includes(enquiry.status) || enquiry.version !== input.expectedVersion)
          tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "This enquiry changed. Reload before editing it.");
        const basket = await currentBasket(projectId, basketId, session, input.expectedPreparationDigest);
        const lines = buildBasketBoqLines(basket, input.lines, enquiry.draftLines as ProcurementBasketBoqLine[]);
        if (enquiry.currentBoqRevisionId) {
          await ProcurementBasketInvitationModel.updateMany({ enquiryId, status: { $in: ["pending", "sent"] } },
            { $set: { status: "superseded" } }, { session });
        }
        const changed = await ProcurementBasketEnquiryModel.updateOne({ _id: enquiryId, version: input.expectedVersion,
          status: { $in: ["draft", "sent"] } }, { $set: { draftLines: lines, estimateSource: basket.estimateSource,
            preparationDigest: basket.preparationDigest, currentBoqRevisionId: null, status: "draft", updatedById: actor.id,
            lastMutationKey: input.idempotencyKey, lastMutationDigest: requestDigest }, $inc: { version: 1 } }, { session });
        if (changed.modifiedCount !== 1) tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "This enquiry changed. Reload before editing it.");
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "procurement_basket_enquiry_updated",
          entityType: "procurement_basket_enquiry", entityId: enquiryId, occurredAt: now().toISOString(),
          newValues: { projectId, basketId, lineCount: lines.length, supersededBoqRevisionId: enquiry.currentBoqRevisionId ?? null } }, session);
      });
      return get(actor, projectId, basketId, enquiryId);
    },
    async dispatch(actor, projectId, basketId, enquiryId, input) {
      const prepared = await tenderTransaction(async session => {
        await requireBasketBuyer(actor, projectId, session);
        const enquiry = await getBasketEnquiry(projectId, basketId, enquiryId, session);
        const requestDigest = procurementBasketDigest(input);
        const replay = await ProcurementBasketBoqRevisionModel.findOne({ enquiryId, dispatchKey: input.idempotencyKey }).session(session).lean() as TenderRow | null;
        if (replay) {
          if (replay.dispatchRequestDigest !== requestDigest || enquiry.currentBoqRevisionId !== replay._id)
            tenderConflict("PROCUREMENT_BASKET_IDEMPOTENCY_CONFLICT", "This dispatch key was already used for another BOQ.");
          return [] as Delivery[];
        }
        await preflightInvitationDelivery(mailer);
        if (enquiry.status !== "draft" || enquiry.version !== input.expectedVersion)
          tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "This enquiry changed. Reload before sending it.");
        if (enquiry.currentBoqRevisionId)
          tenderConflict("PROCUREMENT_BASKET_BOQ_REVISION_EXISTS", "Resend a failed invitation or revise this BOQ before dispatching again.");
        // Serialize reservations for disjoint enquiries against the same project.
        const projectFence = await ProjectModel.findOneAndUpdate({ _id: projectId, status: "active" },
          { $inc: { purchaseOrderApprovalEpoch: 1 } }, { session, returnDocument: "after", runValidators: true,
            timestamps: false }).lean();
        if (!projectFence) tenderConflict("PROCUREMENT_BASKET_PROJECT_INACTIVE", "This project is not active.");
        await fenceBasketConfiguration(projectId, basketId, session);
        const basket = await currentBasket(projectId, basketId, session, input.expectedPreparationDigest);
        if (basket.preparationDigest !== enquiry.preparationDigest)
          tenderConflict("PROCUREMENT_BASKET_SOURCE_CHANGED", "The source changed after this BOQ draft was saved. Review it again.");
        const lines = buildBasketBoqLines(basket, enquiry.draftLines as ProcurementBasketBoqLine[], enquiry.draftLines as ProcurementBasketBoqLine[]);
        await assertBasketSourceUnreserved(projectId, lines.map(line => line.sourceLineItemKey), session, enquiryId);
        const candidates = [];
        for (const candidate of await selectedBasketVendors(input.selection ?? { kind: "vendors", vendorIds: input.vendorIds ?? [] },
          projectId, basketId, session)) {
          if (!candidate.contactEmail) tenderConflict("PROCUREMENT_BASKET_VENDOR_CONTACT_MISSING", "A selected vendor has no valid email contact.");
          candidates.push({ ...candidate, contactEmail: candidate.contactEmail });
        }
        const project = await ProjectModel.findById(projectId).select({ name: 1 }).session(session).lean();
        if (!project) tenderConflict("PROCUREMENT_BASKET_PROJECT_CHANGED", "The project is unavailable.");
        const previous = await ProcurementBasketBoqRevisionModel.findOne({ enquiryId }).sort({ revision: -1 }).select({ revision: 1 }).session(session).lean() as TenderRow | null;
        const revision = Number(previous?.revision ?? 0) + 1;
        const boqRevisionId = tenderId("basket-boq");
        const boqDigest = procurementBasketDigest({ projectId, basketId, enquiryId, revision,
          estimateSource: basket.estimateSource, preparationDigest: basket.preparationDigest, lines });
        const timestamp = now();
        await ProcurementBasketBoqRevisionModel.create([{ _id: boqRevisionId, enquiryId, projectId, mainBasketId: basketId,
          revision, basketName: basket.name, estimateSource: basket.estimateSource, preparationDigest: basket.preparationDigest,
          digest: boqDigest, lines, sentAt: timestamp, sentById: actor.id, dispatchKey: input.idempotencyKey,
          dispatchRequestDigest: requestDigest }], { session });
        const deliveries: Delivery[] = [];
        for (const candidate of candidates) {
          const rawToken = randomBytes(32).toString("base64url");
          const invitationId = tenderId("basket-invite");
          const expiresAt = new Date(timestamp.getTime() + LINK_LIFETIME_MS);
          await ProcurementBasketInvitationModel.create([{ _id: invitationId, enquiryId, boqRevisionId,
            projectId, mainBasketId: basketId, vendorId: candidate.vendorId, generation: 1, kind: "initial",
            tokenHash: tenderHash(rawToken), recipientEmailHash: tenderHash(candidate.contactEmail.toLowerCase()),
            status: "pending", requestedAt: timestamp, sentAt: null, expiresAt, consumedAt: null,
            requestedById: actor.id, dispatchKey: input.idempotencyKey, submissionKey: null,
            submissionDigest: null, receiptBidId: null }], { session });
          deliveries.push({ invitationId, vendorId: candidate.vendorId, recipient: { name: candidate.name,
            email: candidate.contactEmail }, rawToken, expiresAt: expiresAt.toISOString(),
            projectName: String(project.name), basketName: basket.name, counterofferReason: null,
            targetNetPaise: null });
        }
        const changed = await ProcurementBasketEnquiryModel.updateOne({ _id: enquiryId, version: input.expectedVersion,
          status: "draft", currentBoqRevisionId: null }, { $set: { currentBoqRevisionId: boqRevisionId,
            lastMutationKey: input.idempotencyKey, lastMutationDigest: boqDigest, updatedById: actor.id },
          $inc: { version: 1 } }, { session });
        if (changed.modifiedCount !== 1) tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "This enquiry changed before dispatch.");
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "procurement_basket_boq_dispatch_requested",
          entityType: "procurement_basket_enquiry", entityId: enquiryId, occurredAt: timestamp.toISOString(),
          newValues: { projectId, basketId, boqRevisionId, revision, vendorCount: deliveries.length } }, session);
        return deliveries;
      });
      if (prepared.length && mailer.deliveryKind === "disabled")
        throw new ApiError(503, "PROCUREMENT_BASKET_DELIVERY_DISABLED", "Vendor BOQ email delivery is unavailable.");
      if (mailer.deliveryKind !== "disabled")
        for (const delivery of prepared) await deliver(delivery, actor.id, audit, mailer, now);
      return get(actor, projectId, basketId, enquiryId);
    },
    async previewInvitationBatch(actor, projectId, basketId, enquiryId, input) {
      return tenderTransaction(async session => {
        await requireBasketBuyer(actor, projectId, session);
        const enquiry = await getBasketEnquiry(projectId, basketId, enquiryId, session);
        const { revision, planned } = await planInvitationBatch(projectId, basketId, enquiry, input, session, now());
        return { enquiryId, enquiryVersion: Number(enquiry.version), boqRevisionId: String(revision._id),
          boqDigest: String(revision.digest), selectedCount: planned.length,
          requiresReason: planned.some(item => item.action === "updated_bid_request"),
          actions: planned.map(item => ({ vendorId: item.candidate.vendorId,
            vendorName: item.candidate.name, action: item.action,
            invitationStatus: item.invitationStatus,
            priorBidId: item.priorBid ? String(item.priorBid._id) : null })) };
      });
    },
    async submitInvitationBatch(actor, projectId, basketId, enquiryId, input) {
      const requestDigest = procurementBasketDigest(input);
      const prepared = await tenderTransaction(async session => {
        await requireBasketBuyer(actor, projectId, session);
        const enquiry = await getBasketEnquiry(projectId, basketId, enquiryId, session);
        const replay = await ProcurementBasketInvitationBatchModel.findOne({ enquiryId,
          idempotencyKey: input.idempotencyKey }).session(session).lean() as TenderRow | null;
        if (replay) {
          if (replay.requestDigest !== requestDigest || replay.boqRevisionId !== enquiry.currentBoqRevisionId)
            tenderConflict("PROCUREMENT_BASKET_IDEMPOTENCY_CONFLICT", "This invitation batch key was used for different details.");
          return { items: replay.items as TenderRow[], deliveries: [] as Delivery[] };
        }
        const timestamp = now();
        const { revision, basket, planned } = await planInvitationBatch(projectId, basketId, enquiry, input, session, timestamp);
        if (planned.some(item => item.action === "updated_bid_request") &&
          (!input.counterofferReason || input.counterofferReason.trim().length < 10))
          throw new ApiError(400, "PROCUREMENT_BASKET_COUNTEROFFER_REASON_REQUIRED",
            "Give a reason of at least 10 characters when requesting an updated bid.");
        const actionable = planned.filter(item => item.action !== "already_invited");
        if (actionable.length) {
          assertSentBasketReady(basket);
          await preflightInvitationDelivery(mailer);
          const projectFence = await ProjectModel.findOneAndUpdate({ _id: projectId, status: "active" },
            { $inc: { purchaseOrderApprovalEpoch: 1 } }, { session, returnDocument: "after", runValidators: true,
              timestamps: false }).lean();
          if (!projectFence) tenderConflict("PROCUREMENT_BASKET_PROJECT_INACTIVE", "This project is not active.");
          await fenceBasketConfiguration(projectId, basketId, session);
          assertSentBasketReady(await currentBasketForVendorScope(projectId, basketId, revision, session));
          await assertBasketSourceUnreserved(projectId,
            (revision.lines as ProcurementBasketBoqLine[]).map(line => line.sourceLineItemKey), session, enquiryId);
          for (const item of actionable) {
            const fenced = await AiEstimatorKnowledgeVendorModel.findOneAndUpdate({ _id: item.candidate.vendorId },
              { $inc: { dependencyEpoch: 1 } },
              { session, returnDocument: "after", runValidators: true, timestamps: false }).lean();
            if (!fenced) tenderConflict("PROCUREMENT_VENDOR_NOT_ELIGIBLE", "A selected vendor is unavailable.");
            const current = await assertBasketVendorEligible(item.candidate.vendorId, projectId, basketId, session);
            if (!current.contactEmail || current.contactEmail.toLowerCase() !== item.candidate.contactEmail?.toLowerCase())
              tenderConflict("PROCUREMENT_BASKET_VENDOR_CONTACT_CHANGED", "A selected vendor's email changed. Reload before sending.");
          }
        }
        const project = actionable.length ? await ProjectModel.findById(projectId).select({ name: 1 }).session(session).lean() : null;
        if (actionable.length && !project)
          tenderConflict("PROCUREMENT_BASKET_PROJECT_CHANGED", "The project is unavailable.");
        const deliveries: Delivery[] = [];
        const items: Array<{ vendorId: string; action: ProcurementBasketInvitationBatchAction; invitationId: string | null }> = [];
        for (const item of planned) {
          const vendorId = item.candidate.vendorId;
          if (item.action === "already_invited") {
            items.push({ vendorId, action: item.action, invitationId: null });
            continue;
          }
          if (!item.candidate.contactEmail)
            tenderConflict("PROCUREMENT_BASKET_VENDOR_CONTACT_MISSING", "A selected vendor has no valid email contact.");
          await ProcurementBasketInvitationModel.updateMany({ enquiryId, boqRevisionId: revision._id,
            vendorId, status: "sent", expiresAt: { $lte: timestamp } },
          { $set: { status: "expired" } }, { session });
          await ProcurementBasketInvitationModel.updateMany({ enquiryId, boqRevisionId: revision._id,
            vendorId, status: "pending", $or: [{ expiresAt: { $lte: timestamp } },
              { requestedAt: { $lte: new Date(timestamp.getTime() - STALE_DELIVERY_MS) } }] },
          { $set: { status: "failed" } }, { session });
          const rawToken = randomBytes(32).toString("base64url");
          const invitationId = tenderId("basket-invite");
          const expiresAt = new Date(timestamp.getTime() + LINK_LIFETIME_MS);
          const kind = item.action === "first_invitation" ? "initial"
            : item.action === "retry" ? "resend" : "counteroffer";
          await ProcurementBasketInvitationModel.create([{ _id: invitationId, enquiryId,
            boqRevisionId: revision._id, projectId, mainBasketId: basketId, vendorId,
            generation: Number(item.latest?.generation ?? 0) + 1, kind,
            tokenHash: tenderHash(rawToken), recipientEmailHash: tenderHash(item.candidate.contactEmail.toLowerCase()),
            status: "pending", requestedAt: timestamp, sentAt: null, expiresAt, consumedAt: null,
            requestedById: actor.id, dispatchKey: input.idempotencyKey, submissionKey: null,
            submissionDigest: null, receiptBidId: null }], { session });
          if (item.action === "updated_bid_request" && item.priorBid) {
            const counterofferId = tenderId("basket-counteroffer");
            await ProcurementBasketCounterofferModel.create([{ _id: counterofferId, enquiryId,
              boqRevisionId: revision._id, projectId, vendorId, priorBidId: item.priorBid._id,
              invitationId, reason: input.counterofferReason, targetNetPaise: null,
              requestedById: actor.id, requestedAt: timestamp, idempotencyKey: input.idempotencyKey }], { session });
            await audit.appendInMongoTransaction({ actorId: actor.id, action: "procurement_basket_counteroffer_requested",
              entityType: "procurement_basket_counteroffer", entityId: counterofferId,
              occurredAt: timestamp.toISOString(), newValues: { enquiryId, vendorId,
                priorBidId: String(item.priorBid._id), targetNetPaise: null,
                replacedInvitationId: item.latest?._id ?? null },
              reason: input.counterofferReason }, session);
          }
          items.push({ vendorId, action: item.action, invitationId });
          deliveries.push({ invitationId, vendorId, recipient: { name: item.candidate.name,
            email: item.candidate.contactEmail }, rawToken, expiresAt: expiresAt.toISOString(),
            projectName: String(project?.name), basketName: basket.name,
            counterofferReason: item.action === "updated_bid_request" ? input.counterofferReason ?? null : null,
            targetNetPaise: null });
        }
        const changed = await ProcurementBasketEnquiryModel.updateOne({ _id: enquiryId,
          version: input.expectedVersion, status: "sent", currentBoqRevisionId: revision._id },
        { $inc: { version: 1 }, $set: { updatedById: actor.id } }, { session });
        if (changed.modifiedCount !== 1)
          tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "This enquiry changed before vendors were invited.");
        await ProcurementBasketInvitationBatchModel.create([{ _id: tenderId("basket-invite-batch"),
          enquiryId, boqRevisionId: revision._id, projectId, mainBasketId: basketId,
          idempotencyKey: input.idempotencyKey, requestDigest,
          resultVersion: Number(enquiry.version) + 1, items,
          requestedById: actor.id, requestedAt: timestamp }], { session });
        if (actionable.length)
          await audit.appendInMongoTransaction({ actorId: actor.id,
            action: "procurement_basket_invitation_batch_requested",
            entityType: "procurement_basket_enquiry", entityId: enquiryId,
            occurredAt: timestamp.toISOString(), newValues: { projectId, basketId,
              boqRevisionId: String(revision._id), selectedCount: items.length,
              actionableCount: actionable.length } }, session);
        return { items, deliveries };
      });
      if (mailer.deliveryKind !== "disabled") {
        for (let offset = 0; offset < prepared.deliveries.length; offset += 5)
          await Promise.allSettled(prepared.deliveries.slice(offset, offset + 5)
            .map(delivery => deliver(delivery, actor.id, audit, mailer, now)));
      }
      const invitationIds = prepared.items.flatMap(item => item.invitationId ? [item.invitationId] : []);
      const invitations = invitationIds.length ? await ProcurementBasketInvitationModel.find({ _id: { $in: invitationIds },
        enquiryId }).select({ _id: 1, status: 1 }).lean() as TenderRow[] : [];
      const invitationById = new Map(invitations.map(invitation => [String(invitation._id), invitation]));
      return { enquiry: await get(actor, projectId, basketId, enquiryId),
        selectedCount: prepared.items.length,
        results: prepared.items.map(item => ({ vendorId: String(item.vendorId), action: item.action,
          status: item.invitationId ? String(invitationById.get(String(item.invitationId))?.status ?? "pending")
            : "already_invited", invitationId: item.invitationId ? String(item.invitationId) : null })) };
    },
    async resendInvitation(actor, projectId, basketId, enquiryId, input) {
      const delivery = await tenderTransaction(async session => {
        await requireBasketBuyer(actor, projectId, session);
        const enquiry = await getBasketEnquiry(projectId, basketId, enquiryId, session);
        const revision = await getCurrentBoq(enquiry, session);
        const requestDigest = procurementBasketDigest(input);
        const replay = await ProcurementBasketInvitationModel.findOne({ enquiryId, boqRevisionId: revision._id,
          vendorId: input.vendorId, dispatchKey: input.idempotencyKey }).session(session).lean() as TenderRow | null;
        if (replay) {
          if (replay.kind !== "resend" || replay.requestDigest !== requestDigest)
            tenderConflict("PROCUREMENT_BASKET_IDEMPOTENCY_CONFLICT", "This resend key was used for different details.");
          return null;
        }
        await preflightInvitationDelivery(mailer);
        if (!["draft", "sent"].includes(enquiry.status) || enquiry.version !== input.expectedVersion)
          tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "This enquiry changed. Reload before resending the invitation.");
        const basket = await currentBasketForVendorScope(projectId, basketId, revision, session);
        assertSentBasketReady(basket);
        await assertBasketSourceUnreserved(projectId,
          (revision.lines as ProcurementBasketBoqLine[]).map(line => line.sourceLineItemKey), session, enquiryId);
        const candidate = await assertBasketVendorEligible(input.vendorId, projectId, basketId, session);
        if (!candidate.contactEmail)
          tenderConflict("PROCUREMENT_BASKET_VENDOR_CONTACT_MISSING", "This vendor has no valid email contact.");
        const previous = await ProcurementBasketInvitationModel.findOne({ enquiryId, boqRevisionId: revision._id,
          vendorId: input.vendorId }).sort({ generation: -1 }).session(session).lean() as TenderRow | null;
        if (!previous || !["initial", "resend"].includes(previous.kind))
          tenderConflict("PROCUREMENT_BASKET_INVITATION_MISSING", "This vendor has no initial invitation to resend.");
        const timestamp = now();
        const elapsed = new Date(previous.expiresAt) <= timestamp;
        const stalePending = previous.status === "pending" &&
          timestamp.getTime() - new Date(previous.requestedAt).getTime() >= STALE_DELIVERY_MS;
        if (previous.status !== "failed" && previous.status !== "expired" &&
          !(["sent", "pending"].includes(previous.status) && elapsed) && !stalePending)
          tenderConflict("PROCUREMENT_BASKET_INVITATION_ACTIVE", "This vendor has an active invitation or has already bid.");
        if (await ProcurementBasketBidModel.exists({ enquiryId, boqRevisionId: revision._id,
          vendorId: input.vendorId }).session(session))
          tenderConflict("PROCUREMENT_BASKET_BID_EXISTS", "Request a counteroffer for a vendor who has already bid.");
        if (previous.status !== "failed" && previous.status !== "expired") {
          const expired = await ProcurementBasketInvitationModel.updateOne({ _id: previous._id,
            status: previous.status, ...(stalePending && !elapsed
              ? { requestedAt: { $lte: new Date(timestamp.getTime() - STALE_DELIVERY_MS) } }
              : { expiresAt: { $lte: timestamp } }) },
          { $set: { status: elapsed ? "expired" : "failed" } }, { session });
          if (expired.modifiedCount !== 1)
            tenderConflict("PROCUREMENT_BASKET_INVITATION_ACTIVE", "This invitation changed. Reload before resending.");
        }
        const project = await ProjectModel.findById(projectId).select({ name: 1 }).session(session).lean();
        if (!project) tenderConflict("PROCUREMENT_BASKET_PROJECT_CHANGED", "The project is unavailable.");
        const invitationId = tenderId("basket-invite");
        const rawToken = randomBytes(32).toString("base64url");
        const expiresAt = new Date(timestamp.getTime() + LINK_LIFETIME_MS);
        await ProcurementBasketInvitationModel.create([{ _id: invitationId, enquiryId, boqRevisionId: revision._id,
          projectId, mainBasketId: basketId, vendorId: input.vendorId,
          generation: Number(previous.generation) + 1, kind: "resend",
          tokenHash: tenderHash(rawToken), recipientEmailHash: tenderHash(candidate.contactEmail.toLowerCase()),
          status: "pending", requestedAt: timestamp, sentAt: null, expiresAt, consumedAt: null,
          requestedById: actor.id, dispatchKey: input.idempotencyKey, requestDigest,
          submissionKey: null, submissionDigest: null, receiptBidId: null }], { session });
        const changed = await ProcurementBasketEnquiryModel.updateOne({ _id: enquiryId, version: input.expectedVersion,
          status: { $in: ["draft", "sent"] }, currentBoqRevisionId: revision._id },
          { $inc: { version: 1 }, $set: { updatedById: actor.id } }, { session });
        if (changed.modifiedCount !== 1)
          tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "This enquiry changed before the invitation was resent.");
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "procurement_basket_invitation_resend_requested",
          entityType: "procurement_basket_invitation", entityId: invitationId,
          occurredAt: timestamp.toISOString(),
          newValues: { enquiryId, boqRevisionId: String(revision._id), vendorId: input.vendorId,
            generation: Number(previous.generation) + 1 } }, session);
        return { invitationId, vendorId: input.vendorId, recipient: { name: candidate.name,
          email: candidate.contactEmail }, rawToken, expiresAt: expiresAt.toISOString(),
          projectName: String(project.name), basketName: basket.name,
          counterofferReason: null, targetNetPaise: null } as Delivery;
      });
      if (delivery) {
        if (mailer.deliveryKind === "disabled")
          throw new ApiError(503, "PROCUREMENT_BASKET_DELIVERY_DISABLED", "Vendor BOQ email delivery is unavailable.");
        await deliver(delivery, actor.id, audit, mailer, now);
      }
      return get(actor, projectId, basketId, enquiryId);
    },
    whatsAppShareIntent(actor, projectId, basketId, enquiryId, vendorId) {
      return tenderTransaction(async session => {
        await requireBasketBuyer(actor, projectId, session);
        const enquiry = await getBasketEnquiry(projectId, basketId, enquiryId, session);
        if (enquiry.status !== "sent")
          tenderConflict("PROCUREMENT_BASKET_BOQ_NOT_SENT", "Send the BOQ email before preparing WhatsApp sharing.");
        const revision = await getCurrentBoq(enquiry, session);
        const basket = await currentBasketForVendorScope(projectId, basketId, revision, session);
        const timestamp = now();
        const invitation = await ProcurementBasketInvitationModel.findOne({ enquiryId, boqRevisionId: revision._id,
          vendorId }).sort({ generation: -1 }).session(session).lean() as TenderRow | null;
        if (!invitation || invitation.status !== "sent" || new Date(invitation.expiresAt) <= timestamp)
          tenderConflict("PROCUREMENT_BASKET_INVITATION_UNAVAILABLE", "This vendor needs a delivered email invitation before WhatsApp sharing.");
        const candidate = await assertBasketVendorEligible(vendorId, projectId, basketId, session);
        if (!candidate.contactEmail || tenderHash(candidate.contactEmail.toLowerCase()) !== invitation.recipientEmailHash)
          tenderConflict("PROCUREMENT_BASKET_VENDOR_CONTACT_CHANGED", "This vendor's email contact changed. Resend the invitation.");
        const vendor = await AiEstimatorKnowledgeVendorModel.findById(vendorId)
          .select({ procurementProfile: 1 }).session(session).lean() as TenderRow | null;
        const phone = whatsAppPhone(storedProcurementVendorProfile(vendor?.procurementProfile)?.phoneNumber ?? null);
        if (!phone) return { available: false, shareUrl: null,
          blocker: "This vendor has no usable WhatsApp phone number.", expiresAt: null };
        let publicUrl: URL;
        try {
          publicUrl = new URL(vendorBoqPublicUrl);
          if (!(["https:", "http:"].includes(publicUrl.protocol) && (publicUrl.protocol !== "http:" ||
            ["localhost", "127.0.0.1"].includes(publicUrl.hostname)))) throw new Error("Unsafe public URL");
        } catch {
          throw new ApiError(503, "VENDOR_BOQ_URL_UNAVAILABLE", "The vendor BOQ URL is not configured for safe sharing.");
        }
        const rawToken = randomBytes(32).toString("base64url");
        const expiresAt = new Date(Math.min(new Date(invitation.expiresAt).getTime(),
          timestamp.getTime() + WHATSAPP_LINK_LIFETIME_MS));
        await ProcurementBasketWhatsAppAccessModel.create([{ _id: tenderId("basket-whatsapp"),
          invitationId: invitation._id, enquiryId, boqRevisionId: revision._id,
          projectId, mainBasketId: basketId, vendorId, tokenHash: tenderHash(rawToken),
          recipientPhoneHash: tenderHash(phone), status: "active",
          requestedById: actor.id, requestedAt: timestamp, expiresAt, consumedAt: null }], { session });
        publicUrl.hash = `token=${encodeURIComponent(rawToken)}`;
        const message = `Please quote the ${basket.name} BOQ in Lisno: ${publicUrl.toString()}`;
        const shareUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "procurement_basket_invitation_whatsapp_share_intent",
          entityType: "procurement_basket_invitation", entityId: String(invitation._id), occurredAt: timestamp.toISOString(),
          newValues: { projectId, enquiryId, boqRevisionId: String(revision._id), vendorId,
            channel: "whatsapp", delivery: "not_sent" } }, session);
        return { available: true, shareUrl, blocker: null, expiresAt: expiresAt.toISOString() };
      });
    },
    inspectVendorBoq(token) {
      return tenderTransaction(async session => {
        const { invitation, enquiry, revision } = await liveVendorLink(token, session, now());
        const project = await ProjectModel.findById(String(enquiry.projectId)).select({ name: 1 }).session(session).lean();
        if (!project) tenderLinkUnavailable();
        const basket = await currentBasket(String(enquiry.projectId), String(enquiry.mainBasketId), session);
        return { projectName: String(project.name), basketName: String(revision.basketName ?? basket.name), expiresAt: tenderIso(invitation.expiresAt),
          lines: (revision.lines as ProcurementBasketBoqLine[]).map(line => ({ id: line.id, description: line.description,
            quantityMilliUnits: line.quantityMilliUnits, uomCode: line.uomCode,
            approvedQuantity: line.approvedQuantity, approvedUnit: line.approvedUnit ?? null,
            approvedQuoteAmountPaise: line.approvedQuoteAmountPaise ?? null,
            ...(line.scopeType ? { scopeType: line.scopeType } : {}),
            ...(line.targetDate ? { targetDate: line.targetDate } : {}),
            ...(line.deliveryLocation ? { deliveryLocation: line.deliveryLocation } : {}) })) };
      });
    },
    submitVendorBid(input) {
      return tenderTransaction(async session => {
        const tokenHash = tenderHash(input.token);
        const access = await resolveVendorAccessToken(tokenHash, session);
        if (!access) tenderLinkUnavailable();
        const { invitation, whatsAppAccess } = access;
        const submissionDigest = procurementBasketDigest(input.lines);
        if (invitation.status === "consumed" && invitation.submissionKey === input.idempotencyKey &&
          invitation.submissionDigest === submissionDigest && invitation.receiptBidId &&
          (invitation.submissionTokenHash == null || invitation.submissionTokenHash === tokenHash) &&
          (!whatsAppAccess || whatsAppAccess.status === "consumed")) {
          const currentEnquiry = await ProcurementBasketEnquiryModel.findById(invitation.enquiryId)
            .select({ currentBoqRevisionId: 1, status: 1 }).session(session).lean() as TenderRow | null;
          if (!currentEnquiry || currentEnquiry.currentBoqRevisionId !== invitation.boqRevisionId ||
            currentEnquiry.status !== "sent") tenderLinkUnavailable();
          const replay = await ProcurementBasketBidModel.findById(invitation.receiptBidId).session(session).lean() as TenderRow | null;
          if (!replay) tenderLinkUnavailable();
          return { bidId: String(replay._id), submittedAt: tenderIso(replay.submittedAt), totals: replay.totals as { netPaise: number; gstPaise: number; totalPaise: number } };
        }
        const live = await liveVendorLink(input.token, session, now());
        let calculated: ReturnType<typeof calculateProcurementBasketBid>;
        try { calculated = calculateProcurementBasketBid(live.revision.lines as ProcurementBasketBoqLine[], input.lines); }
        catch { throw new ApiError(400, "PROCUREMENT_BASKET_BID_INVALID", "Quote every BOQ line with a valid positive unit rate and GST rate."); }
        const { lines, totals } = calculated;
        const prior = await ProcurementBasketBidModel.findOne({ enquiryId: live.enquiry._id,
          boqRevisionId: live.revision._id, vendorId: invitation.vendorId }).sort({ revision: -1 })
          .select({ revision: 1 }).session(session).lean() as TenderRow | null;
        const bidId = tenderId("basket-bid");
        const timestamp = now();
        const bidDigest = procurementBasketDigest({ boqDigest: live.revision.digest, vendorId: invitation.vendorId, lines, totals });
        const consumed = await ProcurementBasketInvitationModel.updateOne({ _id: invitation._id, status: "sent",
          expiresAt: { $gt: timestamp } }, { $set: { status: "consumed", consumedAt: timestamp,
          submissionKey: input.idempotencyKey, submissionDigest, submissionTokenHash: tokenHash,
          receiptBidId: bidId } }, { session });
        if (consumed.modifiedCount !== 1) tenderLinkUnavailable();
        if (whatsAppAccess) {
          const consumedShare = await ProcurementBasketWhatsAppAccessModel.updateOne({ _id: whatsAppAccess._id,
            status: "active", expiresAt: { $gt: timestamp } }, { $set: { status: "consumed", consumedAt: timestamp } }, { session });
          if (consumedShare.modifiedCount !== 1) tenderLinkUnavailable();
        }
        await ProcurementBasketBidModel.create([{ _id: bidId, enquiryId: live.enquiry._id, boqRevisionId: live.revision._id,
          invitationId: invitation._id, projectId: live.enquiry.projectId, mainBasketId: live.enquiry.mainBasketId,
          vendorId: invitation.vendorId, revision: Number(prior?.revision ?? 0) + 1,
          lines, totals, bidDigest, submittedAt: timestamp, submissionKey: input.idempotencyKey }], { session });
        await audit.appendInMongoTransaction({ actorId: `vendor:${String(invitation.vendorId)}`,
          action: "procurement_basket_bid_submitted", entityType: "procurement_basket_bid", entityId: bidId,
          occurredAt: timestamp.toISOString(), newValues: { enquiryId: String(live.enquiry._id), boqRevisionId: String(live.revision._id),
            vendorId: String(invitation.vendorId), netPaise: totals.netPaise, gstPaise: totals.gstPaise } }, session);
        return { bidId, submittedAt: timestamp.toISOString(), totals };
      });
    },
    async requestCounteroffer(actor, projectId, basketId, enquiryId, input) {
      const delivery = await tenderTransaction(async session => {
        await requireBasketBuyer(actor, projectId, session);
        const enquiry = await getBasketEnquiry(projectId, basketId, enquiryId, session);
        const existing = await ProcurementBasketCounterofferModel.findOne({ enquiryId, vendorId: input.vendorId,
          idempotencyKey: input.idempotencyKey }).session(session).lean() as TenderRow | null;
        if (existing) {
          if (existing.reason !== input.reason || (existing.targetNetPaise ?? null) !== (input.targetNetPaise ?? null))
            tenderConflict("PROCUREMENT_BASKET_IDEMPOTENCY_CONFLICT", "This counteroffer request key was reused with different details.");
          if (existing.boqRevisionId !== enquiry.currentBoqRevisionId)
            tenderConflict("PROCUREMENT_BASKET_BOQ_SUPERSEDED", "This counteroffer was for an older BOQ revision.");
          return null;
        }
        await preflightInvitationDelivery(mailer);
        if (enquiry.status !== "sent" || enquiry.version !== input.expectedVersion)
          tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "This enquiry changed. Reload before requesting a counteroffer.");
        const revision = await getCurrentBoq(enquiry, session);
        assertSentBasketReady(await currentBasketForVendorScope(projectId, basketId, revision, session));
        await assertBasketSourceUnreserved(projectId,
          (revision.lines as ProcurementBasketBoqLine[]).map(line => line.sourceLineItemKey), session, enquiryId);
        const candidate = await assertBasketVendorEligible(input.vendorId, projectId, basketId, session);
        if (!candidate.contactEmail) tenderConflict("PROCUREMENT_BASKET_VENDOR_CONTACT_MISSING", "This vendor has no valid email contact.");
        const prior = await ProcurementBasketBidModel.findOne({ enquiryId, boqRevisionId: revision._id,
          vendorId: input.vendorId }).sort({ revision: -1 }).session(session).lean() as TenderRow | null;
        if (!prior) tenderConflict("PROCUREMENT_BASKET_BID_REQUIRED", "A counteroffer requires an existing vendor bid.");
        const previousInvite = await ProcurementBasketInvitationModel.findOne({ enquiryId, boqRevisionId: revision._id,
          vendorId: input.vendorId }).sort({ generation: -1 }).session(session).lean() as TenderRow | null;
        const timestamp = now();
        const activeLink = await ProcurementBasketInvitationModel.exists({ enquiryId,
          boqRevisionId: revision._id, vendorId: input.vendorId,
          status: "sent", expiresAt: { $gt: timestamp } }).session(session);
        if (activeLink)
          tenderConflict("PROCUREMENT_BASKET_INVITATION_ACTIVE", "This vendor already has an active counteroffer link.");
        const previousExpired = previousInvite && new Date(previousInvite.expiresAt) <= timestamp;
        const stalePending = previousInvite?.status === "pending" &&
          timestamp.getTime() - new Date(previousInvite.requestedAt).getTime() >= STALE_DELIVERY_MS;
        if (previousInvite?.status === "pending" && !previousExpired && !stalePending)
          tenderConflict("PROCUREMENT_BASKET_INVITATION_ACTIVE", "This vendor already has an unconfirmed counteroffer delivery.");
        if (previousInvite && ["pending", "sent"].includes(previousInvite.status) && (previousExpired || stalePending)) {
          const replaced = await ProcurementBasketInvitationModel.updateOne({ _id: previousInvite._id,
            status: previousInvite.status,
            ...(previousExpired ? { expiresAt: { $lte: timestamp } }
              : { requestedAt: { $lte: new Date(timestamp.getTime() - STALE_DELIVERY_MS) } }) },
          { $set: { status: previousExpired ? "expired" : "failed" } }, { session });
          if (replaced.modifiedCount !== 1)
            tenderConflict("PROCUREMENT_BASKET_INVITATION_ACTIVE", "The previous invitation changed. Reload before requesting a counteroffer.");
        }
        const rawToken = randomBytes(32).toString("base64url");
        const expiresAt = new Date(timestamp.getTime() + LINK_LIFETIME_MS);
        const invitationId = tenderId("basket-invite");
        const counterofferId = tenderId("basket-counteroffer");
        await ProcurementBasketInvitationModel.create([{ _id: invitationId, enquiryId, boqRevisionId: revision._id,
          projectId, mainBasketId: basketId, vendorId: input.vendorId,
          generation: Number(previousInvite?.generation ?? 0) + 1, kind: "counteroffer",
          tokenHash: tenderHash(rawToken), recipientEmailHash: tenderHash(candidate.contactEmail.toLowerCase()),
          status: "pending", requestedAt: timestamp, sentAt: null, expiresAt, consumedAt: null,
          requestedById: actor.id, dispatchKey: input.idempotencyKey, submissionKey: null,
          submissionDigest: null, receiptBidId: null }], { session });
        await ProcurementBasketCounterofferModel.create([{ _id: counterofferId, enquiryId, boqRevisionId: revision._id,
          projectId, vendorId: input.vendorId, priorBidId: prior._id, invitationId,
          reason: input.reason, targetNetPaise: input.targetNetPaise ?? null,
          requestedById: actor.id, requestedAt: timestamp, idempotencyKey: input.idempotencyKey }], { session });
        const changed = await ProcurementBasketEnquiryModel.updateOne({ _id: enquiryId, version: input.expectedVersion,
          status: "sent" }, { $inc: { version: 1 }, $set: { updatedById: actor.id } }, { session });
        if (changed.modifiedCount !== 1) tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "This enquiry changed before the counteroffer request.");
        const project = await ProjectModel.findById(projectId).select({ name: 1 }).session(session).lean();
        if (!project) tenderConflict("PROCUREMENT_BASKET_PROJECT_CHANGED", "The project is unavailable.");
        await audit.appendInMongoTransaction({ actorId: actor.id, action: "procurement_basket_counteroffer_requested",
          entityType: "procurement_basket_counteroffer", entityId: counterofferId, occurredAt: timestamp.toISOString(),
          newValues: { enquiryId, vendorId: input.vendorId, priorBidId: String(prior._id), targetNetPaise: input.targetNetPaise ?? null,
            replacedInvitationId: previousInvite?._id ?? null,
            replacedInvitationStatus: previousInvite && (previousExpired || stalePending)
              ? previousExpired ? "expired" : "failed" : null },
          reason: input.reason }, session);
        return { invitationId, vendorId: input.vendorId, recipient: { name: candidate.name, email: candidate.contactEmail },
          rawToken, expiresAt: expiresAt.toISOString(), projectName: String(project.name),
          basketName: (await currentBasket(projectId, basketId, session)).name, counterofferReason: input.reason,
          targetNetPaise: input.targetNetPaise ?? null } as Delivery;
      });
      if (delivery) {
        if (mailer.deliveryKind === "disabled")
          throw new ApiError(503, "PROCUREMENT_BASKET_DELIVERY_DISABLED", "Vendor BOQ email delivery is unavailable.");
        await deliver(delivery, actor.id, audit, mailer, now);
      }
      return get(actor, projectId, basketId, enquiryId);
    }
  };
}

interface Delivery { invitationId: string; vendorId: string; recipient: { name: string; email: string };
  rawToken: string; expiresAt: string; projectName: string; basketName: string;
  counterofferReason: string | null; targetNetPaise: number | null }

async function deliver(delivery: Delivery, actorId: string, audit: AuditService,
  mailer: Exclude<ProcurementBasketBoqMailer, { deliveryKind: "disabled" }>, now: () => Date): Promise<void> {
  let delivered = false;
  try { await mailer.sendRequest(delivery); delivered = true; } catch { /* Failed generations have no usable token. */ }
  await tenderTransaction(async session => {
    const invitation = await ProcurementBasketInvitationModel.findById(delivery.invitationId).session(session).lean() as TenderRow | null;
    if (!invitation || invitation.status !== "pending") return;
    const enquiry = await ProcurementBasketEnquiryModel.findById(invitation.enquiryId).session(session).lean() as TenderRow | null;
    let stillEligible = false;
    if (delivered && enquiry && enquiry.currentBoqRevisionId === invitation.boqRevisionId &&
      (enquiry.status === "sent" || enquiry.status === "draft" && ["initial", "resend"].includes(invitation.kind))) {
      try { const current = await assertBasketVendorEligible(delivery.vendorId, String(invitation.projectId),
        String(invitation.mainBasketId), session);
        stillEligible = !!current.contactEmail && tenderHash(current.contactEmail.toLowerCase()) === invitation.recipientEmailHash;
      } catch { stillEligible = false; }
    }
    const safe = delivered && stillEligible && new Date(invitation.expiresAt) > now();
    const status = safe ? "sent" : "failed";
    const changed = await ProcurementBasketInvitationModel.updateOne({ _id: invitation._id, status: "pending" },
      { $set: { status, sentAt: safe ? now() : null } }, { session });
    if (changed.modifiedCount !== 1) return;
    if (safe && enquiry?.status === "draft") {
      const activated = await ProcurementBasketEnquiryModel.updateOne({ _id: enquiry._id, status: "draft",
        currentBoqRevisionId: invitation.boqRevisionId, version: enquiry.version },
      { $set: { status: "sent" }, $inc: { version: 1 } }, { session });
      if (activated.modifiedCount !== 1)
        tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "The BOQ changed while its invitation was being delivered.");
      await audit.appendInMongoTransaction({ actorId, action: "procurement_basket_boq_sent",
        entityType: "procurement_basket_enquiry", entityId: String(enquiry._id), occurredAt: now().toISOString(),
        newValues: { projectId: String(enquiry.projectId), basketId: String(enquiry.mainBasketId),
          boqRevisionId: String(invitation.boqRevisionId) } }, session);
    }
    await audit.appendInMongoTransaction({ actorId, action: safe ? "procurement_basket_invitation_sent" : "procurement_basket_invitation_failed",
      entityType: "procurement_basket_invitation", entityId: String(invitation._id), occurredAt: now().toISOString(),
      newValues: { enquiryId: String(invitation.enquiryId), vendorId: String(invitation.vendorId), status } }, session);
  });
}

async function liveVendorLink(token: string, session: ClientSession, at: Date): Promise<{
  invitation: TenderRow; enquiry: TenderRow; revision: TenderRow
}> {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) tenderLinkUnavailable();
  const access = await resolveVendorAccessToken(tenderHash(token), session);
  if (!access || access.whatsAppAccess && (access.whatsAppAccess.status !== "active" ||
    new Date(access.whatsAppAccess.expiresAt) <= at)) tenderLinkUnavailable();
  const { invitation } = access;
  if (!invitation || invitation.status !== "sent" || new Date(invitation.expiresAt) <= at) tenderLinkUnavailable();
  const enquiry = await ProcurementBasketEnquiryModel.findById(invitation.enquiryId).session(session).lean() as TenderRow | null;
  if (!enquiry || enquiry.status !== "sent" || enquiry.currentBoqRevisionId !== invitation.boqRevisionId) tenderLinkUnavailable();
  const revision = await ProcurementBasketBoqRevisionModel.findById(invitation.boqRevisionId).session(session).lean() as TenderRow | null;
  if (!revision || revision.enquiryId !== enquiry._id) tenderLinkUnavailable();
  const project = await ProjectModel.findById(enquiry.projectId).select({ status: 1 }).session(session).lean() as TenderRow | null;
  if (!project || project.status !== "active") tenderLinkUnavailable();
  try {
    await currentBasketForVendorScope(String(enquiry.projectId), String(enquiry.mainBasketId), revision, session);
    await assertBasketVendorEligible(String(invitation.vendorId), String(enquiry.projectId),
      String(enquiry.mainBasketId), session);
  } catch { tenderLinkUnavailable(); }
  const latest = await ProcurementBasketInvitationModel.findOne({ enquiryId: invitation.enquiryId,
    boqRevisionId: invitation.boqRevisionId, vendorId: invitation.vendorId }).sort({ generation: -1 }).session(session).lean() as TenderRow | null;
  if (!latest || latest._id !== invitation._id) tenderLinkUnavailable();
  const vendor = await AiEstimatorKnowledgeVendorModel.findById(invitation.vendorId)
    .select({ status: 1, procurementProfile: 1 }).session(session).lean() as TenderRow | null;
  if (!vendor || vendor.status !== "active" || tenderHash(String(vendor.procurementProfile?.email ?? "").trim().toLowerCase()) !== invitation.recipientEmailHash)
    tenderLinkUnavailable();
  if (access.whatsAppAccess) {
    const currentPhone = whatsAppPhone(storedProcurementVendorProfile(vendor.procurementProfile)?.phoneNumber ?? null);
    if (!currentPhone || tenderHash(currentPhone) !== access.whatsAppAccess.recipientPhoneHash) tenderLinkUnavailable();
  }
  return { invitation, enquiry, revision };
}

async function resolveVendorAccessToken(tokenHash: string, session: ClientSession): Promise<{
  invitation: TenderRow; whatsAppAccess: TenderRow | null
} | null> {
  const emailInvitation = await ProcurementBasketInvitationModel.findOne({ tokenHash }).session(session).lean() as TenderRow | null;
  if (emailInvitation) return { invitation: emailInvitation, whatsAppAccess: null };
  const whatsAppAccess = await ProcurementBasketWhatsAppAccessModel.findOne({ tokenHash }).session(session).lean() as TenderRow | null;
  if (!whatsAppAccess) return null;
  const invitation = await ProcurementBasketInvitationModel.findById(whatsAppAccess.invitationId).session(session).lean() as TenderRow | null;
  if (!invitation || String(invitation.enquiryId) !== String(whatsAppAccess.enquiryId) ||
    String(invitation.boqRevisionId) !== String(whatsAppAccess.boqRevisionId) ||
    String(invitation.projectId) !== String(whatsAppAccess.projectId) ||
    String(invitation.mainBasketId) !== String(whatsAppAccess.mainBasketId) ||
    String(invitation.vendorId) !== String(whatsAppAccess.vendorId)) return null;
  return { invitation, whatsAppAccess };
}

async function enquiryDto(row: TenderRow, session: ClientSession, at: Date,
  currentBasketSnapshot?: ProcurementBasketDetailDto): Promise<ProcurementBasketEnquiryDto> {
  const revision = row.currentBoqRevisionId
    ? await ProcurementBasketBoqRevisionModel.findById(row.currentBoqRevisionId).session(session).lean() as TenderRow | null : null;
  let vendorScopeCurrent: boolean | null = null;
  if (revision) {
    try {
      const basket = currentBasketSnapshot ?? await currentBasket(String(row.projectId), String(row.mainBasketId), session);
      vendorScopeCurrent = basketVendorScopeMatchesRevision(basket, revision);
    } catch (error) {
      if (!(error instanceof ApiError) || ![404, 409].includes(error.status)) throw error;
      vendorScopeCurrent = false;
    }
  }
  const invitations = revision ? await ProcurementBasketInvitationModel.find({ enquiryId: row._id,
    boqRevisionId: revision._id }).sort({ vendorId: 1, generation: -1 }).session(session).lean() as TenderRow[] : [];
  const vendors = invitations.length ? await AiEstimatorKnowledgeVendorModel.find({ _id: { $in: invitations.map(invitation => invitation.vendorId) } })
    .select({ name: 1, code: 1 }).session(session).lean() as TenderRow[] : [];
  const vendorsById = new Map(vendors.map(vendor => [String(vendor._id), vendor]));
  const bids = revision ? await ProcurementBasketBidModel.countDocuments({ enquiryId: row._id, boqRevisionId: revision._id }).session(session) : 0;
  return { id: String(row._id), projectId: String(row.projectId), mainBasketId: String(row.mainBasketId),
    version: Number(row.version), status: row.status, estimateSource: row.estimateSource,
    preparationDigest: String(row.preparationDigest), vendorScopeCurrent,
    boqRevisionId: revision ? String(revision._id) : null,
    boqRevision: revision ? Number(revision.revision) : null, boqDigest: revision ? String(revision.digest) : null,
    lines: presentBoqLines((revision?.lines ?? row.draftLines) as ProcurementBasketBoqLine[]),
    invitations: invitations.map(invitation => ({ id: String(invitation._id), vendorId: String(invitation.vendorId),
      vendorName: String(vendorsById.get(String(invitation.vendorId))?.name ?? "Unavailable vendor"),
      vendorCode: String(vendorsById.get(String(invitation.vendorId))?.code ?? ""),
      kind: String(invitation.kind),
      status: ["sent", "pending"].includes(String(invitation.status)) && new Date(invitation.expiresAt) <= at
        ? "expired" : invitation.status === "pending" &&
          at.getTime() - new Date(invitation.requestedAt).getTime() >= STALE_DELIVERY_MS
          ? "stalled" : String(invitation.status),
      expiresAt: tenderIso(invitation.expiresAt), sentAt: invitation.sentAt ? tenderIso(invitation.sentAt) : null,
      generation: Number(invitation.generation) })), bidCount: bids, awardId: row.latestAwardId ? String(row.latestAwardId) : null };
}
