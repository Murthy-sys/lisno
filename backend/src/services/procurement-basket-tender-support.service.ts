import { createHash, randomUUID } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import { parseScaledDecimal } from "../domain/ai-estimator-knowledge-calculation.js";
import { plannedOrderQuantityMatchesUom } from "../domain/project-procurement.js";
import { procurementBasketLineBoqReady, type ProcurementBasketDetailDto } from "../domain/procurement-basket-projection.js";
import type { ProcurementBasketBoqLine, ProcurementBasketBoqLineInput } from "../domain/procurement-basket-tender.js";
import { ApiError } from "../middleware/errors.js";
import { ProcurementBasketBoqRevisionModel, ProcurementBasketEnquiryModel } from "../models/ProcurementBasketTender.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRequestModel } from "../models/ProjectPurchaseOrderRequest.js";
import { ProjectPurchaseOrderRequestRevisionModel } from "../models/ProjectPurchaseOrderRequestRevision.js";
import { ProjectPurchaseOrderRevisionModel } from "../models/ProjectPurchaseOrderRevision.js";
import type { PublicUser } from "./auth.service.js";
import { assertProcurementProjectAccess } from "./procurement.service.js";
import { preparedBaskets } from "./procurement-basket.service.js";
import { buildProjectPurchaseOrderPreparation } from "./project-purchase-order-preparation.service.js";

export type TenderRow = Record<string, any>;
export async function tenderTransaction<T>(operation: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.connection.startSession();
  try {
    // This flow passes each session explicitly and does not retain Mongoose documents.
    // The driver transaction avoids Mongoose's document reset on a duplicate-key race
    // (which can attempt to restore __v on strict versionKey:false tender models).
    return await session.withTransaction(operation, { readConcern: { level: "snapshot" }, readPreference: "primary" });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const mongo = error as { code?: unknown; hasErrorLabel?: (label: string) => boolean };
    if (mongo?.code === 11000 || mongo?.code === 112 || mongo?.hasErrorLabel?.("TransientTransactionError"))
      throw new ApiError(409, "PROCUREMENT_BASKET_CONCURRENT_CHANGE", "This enquiry or award changed at the same time. Reload and try again.");
    throw error;
  } finally {
    await session.endSession();
  }
}
export const tenderHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const tenderId = (prefix: string) => `${prefix}-${randomUUID()}`;
export const tenderIso = (value: unknown) => new Date(value as string | Date).toISOString();
export function tenderConflict(code: string, message: string): never { throw new ApiError(409, code, message); }
export function tenderNotFound(): never { throw new ApiError(404, "PROCUREMENT_BASKET_ENQUIRY_NOT_FOUND", "This basket enquiry is unavailable."); }
export function tenderLinkUnavailable(): never { throw new ApiError(410, "PROCUREMENT_BASKET_LINK_UNAVAILABLE", "This BOQ link is unavailable. Request a new link from Procurement."); }

export async function requireBasketBuyer(actor: PublicUser, projectId: string, session: ClientSession): Promise<void> {
  await assertProcurementProjectAccess(actor, projectId, session);
}

export async function currentBasket(projectId: string, basketId: string, session: ClientSession,
  expectedPreparationDigest?: string): Promise<ProcurementBasketDetailDto> {
  const basket = (await preparedBaskets(projectId, session)).find(row => row.id === basketId);
  if (!basket) throw new ApiError(404, "PROCUREMENT_BASKET_NOT_FOUND", "This approved main basket is unavailable.");
  if (expectedPreparationDigest && basket.preparationDigest !== expectedPreparationDigest)
    tenderConflict("PROCUREMENT_BASKET_SOURCE_CHANGED", "The approved estimate or purchase preparation changed. Refresh this basket.");
  return basket;
}

/** Compare only the approved scope shown to vendors. Internal mode and cost revisions do not alter a frozen BOQ. */
export function basketVendorScopeMatchesRevision(basket: ProcurementBasketDetailDto, revision: TenderRow): boolean {
  if (basket.projectId !== revision.projectId || basket.id !== revision.mainBasketId ||
    basket.estimateSource.estimateId !== revision.estimateSource?.estimateId ||
    basket.estimateSource.estimateVersion !== revision.estimateSource?.estimateVersion ||
    (basket.estimateSource.estimateReviewRoundId ?? null) !== (revision.estimateSource?.estimateReviewRoundId ?? null) ||
    (revision.basketName != null && basket.name !== revision.basketName)) return false;
  const included = basket.lines.filter(line => line.included && line.approvedAmountPaise !== null && line.approvedAmountPaise > 0);
  const frozen = revision.lines as ProcurementBasketBoqLine[];
  if (included.length !== frozen.length) return false;
  const currentByKey = new Map(included.map(line => [line.sourceLineItemKey, line]));
  return frozen.every(line => {
    const current = currentByKey.get(line.sourceLineItemKey);
    const uom = current?.mode?.uom;
    let approvedQuantityMilliUnits: number | null = null;
    if (current && uom) {
      try { approvedQuantityMilliUnits = Number(parseScaledDecimal(current.approvedQuantity, 3)); }
      catch { return false; }
    }
    return current !== undefined && uom != null &&
      current.mainLineName?.trim() === line.description &&
      approvedQuantityMilliUnits === line.quantityMilliUnits &&
      plannedOrderQuantityMatchesUom(line.quantityMilliUnits, uom.decimalScale) &&
      current.roomId === line.roomId && current.roomName === line.roomName &&
      current.subBasketId === line.subBasketId && current.subBasketName === line.subBasketName &&
      current.mainLineId === line.mainLineId && current.mainLineName === line.mainLineName &&
      current.approvedQuantity === line.approvedQuantity &&
      (line.approvedUnit == null || current.approvedUnit === line.approvedUnit) &&
      (line.approvedQuoteAmountPaise == null || current.approvedAmountPaise === line.approvedQuoteAmountPaise) &&
      uom.id === line.uomId && uom.code === line.uomCode && uom.decimalScale === line.uomDecimalScale;
  });
}

export async function currentBasketForVendorScope(projectId: string, basketId: string,
  revision: TenderRow, session: ClientSession): Promise<ProcurementBasketDetailDto> {
  const basket = await currentBasket(projectId, basketId, session);
  if (!basketVendorScopeMatchesRevision(basket, revision))
    tenderConflict("PROCUREMENT_BASKET_SOURCE_CHANGED", "The approved vendor-facing scope changed. Revise and resend this BOQ.");
  return basket;
}

export function buildBasketBoqLines(basket: ProcurementBasketDetailDto, input: readonly ProcurementBasketBoqLineInput[],
  previous: readonly ProcurementBasketBoqLine[] = []): ProcurementBasketBoqLine[] {
  if (!basket.boqReady)
    tenderConflict(basket.automaticSubVendor ? "PROCUREMENT_BASKET_SUB_VENDOR_COST_UNAVAILABLE" : "PROCUREMENT_BASKET_MODE_REQUIRED",
      basket.automaticSubVendor
        ? "The saved Sub-vendor Configuration cannot price every included line in this basket."
        : "Confirm a valid saved mode for every included line in this basket.");
  const includedKeys = new Set(basket.lines.filter(line => line.included).map(line => line.sourceLineItemKey));
  const requestedKeys = new Set(input.map(line => line.sourceLineItemKey));
  if (requestedKeys.size !== input.length || requestedKeys.size !== includedKeys.size ||
    [...includedKeys].some(key => !requestedKeys.has(key)))
    tenderConflict("PROCUREMENT_BASKET_LINE_SCOPE_INCOMPLETE", "The BOQ must include every approved line in this basket.");
  const requestedByKey = new Map(input.map(line => [line.sourceLineItemKey, line]));
  const previousIds = new Map(previous.map(line => [line.sourceLineItemKey, line.id]));
  return basket.lines.filter(line => line.included).map(source => {
    const candidate = requestedByKey.get(source.sourceLineItemKey);
    if (!candidate || source.approvedAmountPaise === null || source.approvedAmountPaise <= 0)
      tenderConflict("PROCUREMENT_BASKET_LINE_UNAVAILABLE", "Select an included line from this approved basket.");
    const mode = source.mode;
    if (!procurementBasketLineBoqReady(basket, source) || !mode?.uom)
      tenderConflict(basket.automaticSubVendor ? "PROCUREMENT_BASKET_SUB_VENDOR_COST_UNAVAILABLE" : "PROCUREMENT_BASKET_MODE_REQUIRED",
        basket.automaticSubVendor
          ? source.standardCost?.issues[0]?.message ?? "The saved Sub-vendor Configuration cannot price this approved line."
          : "Confirm a valid saved mode before preparing this BOQ line.");
    const description = source.mainLineName?.trim();
    if (!description || description.length > 2_000)
      tenderConflict("PROCUREMENT_BASKET_LINE_UNAVAILABLE", "An approved line has no valid description for the vendor BOQ.");
    let quantityMilliUnits: number;
    try { quantityMilliUnits = Number(parseScaledDecimal(source.approvedQuantity, 3)); }
    catch { tenderConflict("PROCUREMENT_BASKET_QUANTITY_PRECISION", "The approved quantity is invalid for this BOQ."); }
    if (!plannedOrderQuantityMatchesUom(quantityMilliUnits, mode.uom.decimalScale))
      throw new ApiError(400, "PROCUREMENT_BASKET_QUANTITY_PRECISION", "The BOQ quantity exceeds this UOM's precision.");
    if ((candidate.description !== undefined && candidate.description !== description) ||
      (candidate.quantityMilliUnits !== undefined && candidate.quantityMilliUnits !== quantityMilliUnits))
      tenderConflict("PROCUREMENT_BASKET_SOURCE_CHANGED", "The approved description or quantity changed. Refresh this basket.");
    return { sourceLineItemKey: source.sourceLineItemKey, description, quantityMilliUnits,
      id: previousIds.get(source.sourceLineItemKey) ?? tenderId("boq-line"),
      roomId: source.roomId, roomName: source.roomName,
      subBasketId: source.subBasketId, subBasketName: source.subBasketName,
      mainLineId: source.mainLineId, mainLineName: source.mainLineName,
      approvedQuantity: source.approvedQuantity, approvedUnit: source.approvedUnit,
      approvedQuoteAmountPaise: source.approvedAmountPaise,
      uomId: mode.uom.id, uomCode: mode.uom.code, uomDecimalScale: mode.uom.decimalScale };
  });
}

export async function getBasketEnquiry(projectId: string, basketId: string, enquiryId: string,
  session: ClientSession): Promise<TenderRow> {
  const row = await ProcurementBasketEnquiryModel.findOne({ _id: enquiryId, projectId, mainBasketId: basketId }).session(session).lean() as TenderRow | null;
  if (!row) tenderNotFound();
  return row!;
}

export async function getCurrentBoq(enquiry: TenderRow, session: ClientSession): Promise<TenderRow> {
  if (!enquiry.currentBoqRevisionId) tenderConflict("PROCUREMENT_BASKET_BOQ_NOT_SENT", "Send the BOQ before reviewing vendor bids.");
  const row = await ProcurementBasketBoqRevisionModel.findOne({ _id: enquiry.currentBoqRevisionId, enquiryId: enquiry._id,
    projectId: enquiry.projectId, mainBasketId: enquiry.mainBasketId }).session(session).lean() as TenderRow | null;
  if (!row) tenderConflict("PROCUREMENT_BASKET_BOQ_MISSING", "The sent BOQ revision is unavailable.");
  return row!;
}

/** Active legacy orders/requests and another enquiry with dispatched invitations reserve their actual source lines. */
export async function assertBasketSourceUnreserved(projectId: string, sourceKeys: readonly string[], session: ClientSession,
  excludeEnquiryId?: string): Promise<void> {
  const wanted = new Set(sourceKeys);
  const orders = await ProjectPurchaseOrderModel.find({ projectId, status: { $ne: "cancelled" } })
    .select({ _id: 1, draftLines: 1, approvedRevisionId: 1 }).session(session).lean() as TenderRow[];
  const approvedRevisions = await ProjectPurchaseOrderRevisionModel.find({ projectId,
    _id: { $in: orders.flatMap(order => order.approvedRevisionId ? [order.approvedRevisionId] : []) } })
    .select({ lines: 1 }).session(session).lean() as TenderRow[];
  if (approvedRevisions.some(revision => (revision.lines ?? []).some((line: TenderRow) => wanted.has(String(line.sourceLineItemKey)))))
    tenderConflict("PROCUREMENT_BASKET_SOURCE_RESERVED", "A selected source line already has an approved purchase order.");
  const draftItemIds = new Set(orders.flatMap(order => (order.draftLines ?? []).map((line: TenderRow) => String(line.procurementItemId))));
  if (draftItemIds.size) {
    // Preparation exposes child IDs; the public basket projection intentionally does not.
    const preparation = await buildProjectPurchaseOrderPreparation(projectId, session);
    if (preparation.estimateLines.some(line => wanted.has(line.key) && line.itemIds.some(id => draftItemIds.has(id))))
      tenderConflict("PROCUREMENT_BASKET_SOURCE_RESERVED", "A selected source line is in an existing purchase order.");
  }
  const requests = await ProjectPurchaseOrderRequestModel.find({ projectId, status: { $in: ["pending_approval", "changes_requested"] } })
    .select({ submittedRevisionId: 1 }).session(session).lean() as TenderRow[];
  if (requests.length) {
    const revisions = await ProjectPurchaseOrderRequestRevisionModel.find({ projectId,
      _id: { $in: requests.map(request => request.submittedRevisionId) } }).select({ lines: 1 }).session(session).lean() as TenderRow[];
    if (revisions.length !== requests.length) tenderConflict("PROCUREMENT_BASKET_SOURCE_RESERVED", "An existing project purchase request is inconsistent.");
    if (revisions.some(revision => (revision.lines ?? []).some((line: TenderRow) => wanted.has(String(line.sourceLineItemKey)))))
      tenderConflict("PROCUREMENT_BASKET_SOURCE_RESERVED", "A selected source line is in a pending purchase request.");
  }
  const enquiries = await ProcurementBasketEnquiryModel.find({ projectId,
    _id: { $ne: excludeEnquiryId ?? "" }, status: { $in: ["draft", "sent", "award_pending", "issued"] },
    currentBoqRevisionId: { $ne: null } })
    .select({ currentBoqRevisionId: 1 }).session(session).lean() as TenderRow[];
  const boqRevisions = await ProcurementBasketBoqRevisionModel.find({ projectId,
    _id: { $in: enquiries.map(enquiry => enquiry.currentBoqRevisionId) } }).select({ lines: 1 }).session(session).lean() as TenderRow[];
  if (boqRevisions.length !== enquiries.length) tenderConflict("PROCUREMENT_BASKET_SOURCE_RESERVED", "An active basket enquiry is inconsistent.");
  if (boqRevisions.some(revision => (revision.lines ?? []).some((line: TenderRow) => wanted.has(String(line.sourceLineItemKey)))))
    tenderConflict("PROCUREMENT_BASKET_SOURCE_RESERVED", "A selected source line is already in an active enquiry.");
}
