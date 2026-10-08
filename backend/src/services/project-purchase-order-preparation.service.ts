import { createHash } from "node:crypto";
import { resolveProcurementEstimateMode } from "../domain/procurement-basket-mode-groups.js";
import mongoose, { type ClientSession } from "mongoose";
import { plannedOrderQuantityMatchesUom, storedProcurementSource, type ProcurementReferenceStatus } from "../domain/project-procurement.js";
import { approvedEstimateAmountPaiseIsActionable } from "../domain/workflow-estimate-items.js";
import { calculatePurchaseOrderLine } from "../domain/project-purchase-order.js";
import type {
  ProjectPurchaseOrderPreparationDto, PurchaseOrderPreparationBlocker,
  PurchaseOrderPreparationEstimateLine, PurchaseOrderPreparationItem, PurchaseOrderPreparationSection
} from "../domain/project-purchase-order-preparation.js";
import type { PurchaseOrderModeResolution, PurchaseOrderModeStandardSuggestion } from "../domain/project-purchase-order-mode.js";
import { MAX_FINANCE_AMOUNT_PAISE } from "../domain/project-finance.js";
import { projectWorkflowSectionLabel } from "../domain/project-workflow.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeBasketModel } from "../models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeUomModel } from "../models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { ProjectProcurementItemModel } from "../models/ProjectProcurementItem.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../models/ProjectPurchaseOrderRevision.js";
import { ProcurementBasketBaseRateModel } from "../models/ProcurementBasketBaseRate.js";
import { DEFAULT_PROCUREMENT_BASKET_PROJECT_RATE, type ProcurementBasketProjectRate } from "../domain/procurement-basket-base-rate.js";
import type { PublicUser } from "./auth.service.js";
import { assertProcurementProjectAccess, procurementItemSourceSnapshot,
  type ApprovedProcurementSourceLine } from "./procurement.service.js";
import { resolvePurchaseOrderModes } from "./project-purchase-order-mode.service.js";
import { vendorActivations } from "./vendor-readiness.service.js";

type Row = Record<string, any>;

export interface ProjectPurchaseOrderPreparationService {
  get(actor: PublicUser, projectId: string): Promise<ProjectPurchaseOrderPreparationDto>;
}

/** The HTTP boundary authorizes Procurement; request submission can call the builder in its own authorized transaction. */
export function createProjectPurchaseOrderPreparationService(): ProjectPurchaseOrderPreparationService {
  return {
    get(actor, projectId) {
      return mongoose.connection.transaction(async (session) => {
        await assertProcurementProjectAccess(actor, projectId, session);
        return buildProjectPurchaseOrderPreparation(projectId, session);
      }, { readConcern: { level: "snapshot" }, readPreference: "primary" });
    }
  };
}

/** Canonical source, readiness, and amount view. Call only inside an already authorized snapshot transaction. */
export async function buildProjectPurchaseOrderPreparation(projectId: string, session: ClientSession,
  options: { at?: Date; digestVersion?: "current" | "legacy" } = {}): Promise<ProjectPurchaseOrderPreparationDto> {
  if (!session.inTransaction()) throw new Error("Purchase order preparation requires an active transaction.");
  const source = await procurementItemSourceSnapshot(projectId, session);
  const project = await ProjectModel.findById(projectId).select({ plannedEndAt: 1, location: 1 }).session(session).lean();
  if (!project) throw new ApiError(404, "PROJECT_NOT_FOUND", "Project not found.");
  const plannedEndAt = project.plannedEndAt instanceof Date ? project.plannedEndAt : new Date(project.plannedEndAt);
  const orderDefaults = { targetDate: Number.isNaN(plannedEndAt.getTime()) ? null : plannedEndAt.toISOString().slice(0, 10),
    deliveryLocation: String(project.location ?? "").trim() || null };
  const estimateSource = { estimateId: source.estimateId, estimateVersion: source.estimateVersion,
    estimateReviewRoundId: source.estimateReviewRoundId };
  const sourceLines = new Map(source.allLineItems.map((line) => [line.key, line]));
  const configuredLines = options.digestVersion === "legacy" ? [] : source.allLineItems.filter(
    (line) => line.source === "configuration");
  const basketIds = [...new Set(configuredLines.flatMap((line) => line.mainBasketId ? [line.mainBasketId] : []))];
  const subBasketIds = [...new Set(configuredLines.flatMap((line) => line.subBasketId ? [line.subBasketId] : []))];
  const basketRows = basketIds.length ? await AiEstimatorKnowledgeBasketModel.find({ _id: { $in: basketIds } })
    .select({ _id: 1, name: 1 }).session(session).lean() : [];
  const subBasketRows = subBasketIds.length ? await AiEstimatorKnowledgeSubBasketModel.find({ _id: { $in: subBasketIds } })
    .select({ _id: 1, basketId: 1, name: 1 }).session(session).lean() : [];
  const currentBasketNames = new Map(basketRows.map((row) => [String(row._id), String(row.name)]));
  const currentSubBasketNames = new Map(subBasketRows.map((row) => [String(row._id),
    { basketId: String(row.basketId), name: String(row.name) }]));
  const itemIdsByLine = new Map<string, string[]>();
  const sectionsById = new Map<string, PurchaseOrderPreparationSection>();
  for (const line of source.lineItems) {
    const label = line.source === "configuration" && line.mainBasketId
      ? currentBasketNames.get(line.mainBasketId) ?? line.sectionLabel
      : projectWorkflowSectionLabel(line.sectionId);
    const section = sectionsById.get(line.sectionId) ?? {
      id: line.sectionId, label, roomName: label, estimatedPaise: 0, netPaise: 0, items: []
    };
    section.estimatedPaise = sumPaise([section.estimatedPaise, line.amountPaise]);
    sectionsById.set(line.sectionId, section);
  }
  const approvedEstimatePaise = sumPaise(source.lineItems.map((line) => line.amountPaise));

  const rows = await ProjectProcurementItemModel.find({ projectId, removedAt: null }).sort({ _id: 1 }).session(session).lean();
  const projectRateRows = options.digestVersion === "legacy" ? [] : await ProcurementBasketBaseRateModel.find({
    projectId, estimateId: source.estimateId, estimateVersion: source.estimateVersion,
    estimateReviewRoundId: source.estimateReviewRoundId
  }).select({ mainBasketId: 1, sourceLineItemKey: 1, overridePaise: 1, version: 1 }).session(session).lean();
  const projectRates = new Map<string, ProcurementBasketProjectRate>();
  for (const row of projectRateRows) {
    const sourceLine = sourceLines.get(String(row.sourceLineItemKey));
    if (!sourceLine || sourceLine.mainBasketId !== row.mainBasketId ||
      source.mainBasketClassifications[row.mainBasketId] !== "standard") continue;
    projectRates.set(String(row.sourceLineItemKey), { version: Number(row.version),
      overridePaise: row.overridePaise == null ? null : Number(row.overridePaise) });
  }
  const standardSuggestions = new Map<string, PurchaseOrderModeStandardSuggestion>();
  const currentMainLineNames = new Map<string, string>();
  // Historical pending requests were submitted before mode decisions existed.
  // Rebuild their original digest without reading newer Configuration state.
  const modeResolutions = options.digestVersion === "legacy" ? new Map<string, PurchaseOrderModeResolution>()
    : await resolvePurchaseOrderModes(projectId, source, session, {
      at: options.at,
      standardSuggestionSink: standardSuggestions,
      currentMainLineNameSink: currentMainLineNames,
      projectRates,
      children: rows.map((row) => ({ id: String(row._id), sourceLineItemKey: row.sourceLineItemKey ?? null,
        vendorId: row.vendorId == null ? null : String(row.vendorId), uomId: String(row.uomId) }))
    });
  const actionableRows = rows.flatMap((row) => {
    let itemSource: ReturnType<typeof storedProcurementSource>;
    try { itemSource = storedProcurementSource(row); } catch { sourceConflict(); }
    const line = itemSource ? sourceLines.get(itemSource.sourceLineItemKey) : undefined;
    if (itemSource && (itemSource.estimateId !== source.estimateId || itemSource.estimateVersion !== source.estimateVersion ||
      itemSource.estimateReviewRoundId !== source.estimateReviewRoundId || !line || line.sectionId !== itemSource.sourceSectionId)) sourceConflict();
    if (line) itemIdsByLine.set(line.key, [...(itemIdsByLine.get(line.key) ?? []), String(row._id)]);
    return line && (!line.included || line.amountPaise === null || !approvedEstimateAmountPaiseIsActionable(line.amountPaise))
      ? [] : [{ row, itemSource, line }];
  });
  const estimateLines = source.allLineItems.map((line) => preparationEstimateLine(line,
    itemIdsByLine.get(line.key) ?? [], modeResolutions.get(line.key) ?? null,
    source.mainBasketClassifications[line.mainBasketId ?? ""] ?? "standard",
    Object.hasOwn(source.mainBasketClassifications, line.mainBasketId ?? ""), standardSuggestions.get(line.key) ?? null,
    projectRates.get(line.key) ?? DEFAULT_PROCUREMENT_BASKET_PROJECT_RATE,
    line.mainLineId ? currentMainLineNames.get(line.mainLineId) ?? null : null,
    line.source === "configuration" && line.mainBasketId ? currentBasketNames.get(line.mainBasketId) ?? null : null,
    line.source === "configuration" && line.subBasketId && line.mainBasketId &&
      currentSubBasketNames.get(line.subBasketId)?.basketId === line.mainBasketId
      ? currentSubBasketNames.get(line.subBasketId)?.name ?? null : null));
  const currentLabelsByKey = new Map(estimateLines.map((line) => [line.key, {
    mainBasketName: line.mainBasketName, subBasketName: line.subBasketName, mainLineName: line.mainLineName
  }]));
  const uomRows = await AiEstimatorKnowledgeUomModel.find({ _id: { $in: [...new Set(actionableRows.map(({ row }) => row.uomId))] } })
    .select({ _id: 1, status: 1, decimalScale: 1 }).session(session).lean();
  const uoms = new Map(uomRows.map((row) => [String(row._id), row]));
  const vendorRows = await AiEstimatorKnowledgeVendorModel.find({ _id: { $in: [...new Set(actionableRows.flatMap(({ row }) => row.vendorId ? [row.vendorId] : []))] } })
    .select({ _id: 1, status: 1, procurementProfile: 1, msmeCertificate: 1, kpiRubricGeneration: 1 }).session(session).lean();
  const vendors = new Map(vendorRows.map((row) => [String(row._id), row]));
  const activations = await vendorActivations(vendorRows, session);

  const orders = await ProjectPurchaseOrderModel.find({ projectId, status: { $ne: "cancelled" } })
    .select({ _id: 1, status: 1, draftLines: 1, approvedRevisionId: 1, approvedNetPaise: 1,
      approvedGstPaise: 1, approvedTotalPaise: 1, cancelledAt: 1 }).session(session).lean();
  const overlaps = new Map<string, { orderId: string; code: "ALREADY_ORDERED" | "MANUAL_ORDER_PENDING" }>();
  for (const order of orders) for (const line of order.draftLines ?? []) overlaps.set(String(line.procurementItemId),
    { orderId: String(order._id), code: "MANUAL_ORDER_PENDING" });
  const approvedOrders = orders.filter((order) => order.approvedRevisionId != null && order.cancelledAt == null);
  const revisions = await ProjectPurchaseOrderRevisionModel.find({ projectId,
    _id: { $in: approvedOrders.map((order) => order.approvedRevisionId) } }).select({ _id: 1, orderId: 1, lines: 1 }).session(session).lean();
  const revisionsById = new Map(revisions.map((revision) => [String(revision._id), revision]));
  for (const order of approvedOrders) {
    const revision = revisionsById.get(String(order.approvedRevisionId));
    if (!revision || String(revision.orderId) !== String(order._id)) commitmentConflict();
    for (const line of revision.lines ?? []) {
      const id = String(line.procurementItemId);
      if (overlaps.get(id)?.orderId !== String(order._id) && overlaps.get(id)?.code === "MANUAL_ORDER_PENDING") continue;
      overlaps.set(id, { orderId: String(order._id), code: "ALREADY_ORDERED" });
    }
  }
  const committedPaise = sumPaise(approvedOrders.map((order) => storedApprovedPaise(order, "approvedNetPaise")));
  const committedGstPaise = sumPaise(approvedOrders.map((order) => storedApprovedPaise(order, "approvedGstPaise")));
  const committedTotalPaise = sumPaise(approvedOrders.map((order) => {
    const net = storedApprovedPaise(order, "approvedNetPaise");
    const gst = storedApprovedPaise(order, "approvedGstPaise");
    const total = storedApprovedPaise(order, "approvedTotalPaise");
    if (sumPaise([net, gst]) !== total) commitmentConflict();
    return total;
  }));

  const blockers: PurchaseOrderPreparationBlocker[] = [];
  const digestItems: Record<string, unknown>[] = [];
  let readyItemCount = 0;
  for (const { row, itemSource, line } of actionableRows) {
    const id = String(row._id);
    const uom = uoms.get(String(row.uomId));
    const storedScale = row.uomDecimalScale ?? uom?.decimalScale ?? null;
    const decimalScale = Number.isSafeInteger(storedScale) && storedScale >= 0 && storedScale <= 3
      ? Number(storedScale) : null;
    const uomStatus = (uom?.status ?? "unavailable") as ProcurementReferenceStatus;
    const vendorId = row.vendorId == null ? null : String(row.vendorId);
    const vendor = vendorId ? vendors.get(vendorId) : undefined;
    const vendorStatus = vendorId ? (activations.get(vendorId)?.effectiveStatus ?? "unavailable") as ProcurementReferenceStatus : null;
    const quantity = row.plannedOrderQuantityMilliUnits == null ? null : Number(row.plannedOrderQuantityMilliUnits);
    const pricePaise = Number(row.pricePaise);
    if (!Number.isSafeInteger(pricePaise) || pricePaise <= 0 || pricePaise > MAX_FINANCE_AMOUNT_PAISE) sourceConflict();
    const allocation = row.allocatedWorkPaise == null ? null : Number(row.allocatedWorkPaise);
    const itemBlockers: PurchaseOrderPreparationBlocker[] = [];
    const block = (code: string, message: string) => itemBlockers.push({ code, message, itemId: id });
    if (!itemSource) block("SOURCE_MISSING", "Link this item to the approved estimate before ordering.");
    if (uomStatus !== "active" || decimalScale === null) block("UOM_UNAVAILABLE", "Choose an active UOM for this item.");
    if (quantity === null) block("QUANTITY_MISSING", "Enter the planned order quantity.");
    else if (decimalScale !== null && !plannedOrderQuantityMatchesUom(quantity, decimalScale)) block("QUANTITY_PRECISION", "The quantity exceeds this UOM's allowed precision.");
    if (!vendorId) block("VENDOR_MISSING", "Assign an active vendor to this item.");
    else if (vendorStatus !== "active") block("VENDOR_INACTIVE", "This vendor is not active for ordering.");
    if (allocation === null || !Number.isSafeInteger(allocation) || allocation <= 0 || allocation > MAX_FINANCE_AMOUNT_PAISE) block("ALLOCATION_MISSING", "Record a valid vendor allocation for this item.");
    const overlap = overlaps.get(id);
    if (overlap?.code === "ALREADY_ORDERED") block("ALREADY_ORDERED", "This item is already in an approved individual purchase order.");
    if (overlap?.code === "MANUAL_ORDER_PENDING") block("MANUAL_ORDER_PENDING", "This item is in an editable individual purchase order. Resolve it before sending the project request.");
    let plannedLineNetPaise: number | null = null;
    if (quantity !== null && decimalScale !== null && plannedOrderQuantityMatchesUom(quantity, decimalScale)) {
      try { plannedLineNetPaise = calculatePurchaseOrderLine({ quantityMilliUnits: quantity, unitPricePaise: pricePaise, gstBasisPoints: 0 }).netPaise; }
      catch { block("AMOUNT_UNSUPPORTED", "This quantity and unit price exceed the supported order amount."); }
    }
    if (plannedLineNetPaise !== null && allocation !== null && plannedLineNetPaise > allocation) {
      block("ALLOCATION_INSUFFICIENT", "The planned amount before GST exceeds this item's recorded vendor allocation.");
    }
    if (options.digestVersion !== "legacy" && line && overlap?.code !== "ALREADY_ORDERED") {
      const mode = modeResolutions.get(line.key);
      if (line.source === "configuration" && mode?.revision?.status === "draft") {
        block("MODE_REVISION_NOT_ACTIVE", "Activate the current saved Configuration before sending vendor work for this line.");
      } else if (!mode || (mode.state !== "ready" && mode.state !== "exception")) {
        const issue = mode?.issues[0];
        block(mode?.state === "selection_required" ? "MODE_SELECTION_REQUIRED" : "MODE_UNAVAILABLE",
          issue?.message ?? (mode?.state === "selection_required"
            ? "Select and confirm a saved Configuration mode for this estimate line."
            : "The approved Configuration mode is unavailable. Record a reasoned manual exception for a historical line."));
      }
    }
    const item: PurchaseOrderPreparationItem = {
      id, version: Number(row.version), sourceSectionId: itemSource?.sourceSectionId ?? null,
      sourceLineItemKey: itemSource?.sourceLineItemKey ?? null, roomName: line?.roomName ?? null,
      itemName: String(row.itemName), brand: String(row.brand),
      uom: { id: String(row.uomId), code: String(row.uomCode), name: String(row.uomName), decimalScale, status: uomStatus },
      vendor: vendorId ? { id: vendorId, code: String(row.vendorCode ?? vendor?.code ?? ""),
        name: String(row.vendorName ?? vendor?.name ?? ""), status: vendorStatus!,
        vendorType: vendor?.procurementProfile?.vendorType === "execution" || vendor?.procurementProfile?.vendorType === "supplier"
          ? vendor.procurementProfile.vendorType : null } : null,
      plannedOrderQuantityMilliUnits: quantity, pricePaise, allocatedWorkPaise: allocation,
      plannedLineNetPaise, blockers: itemBlockers
    };
    const sectionId = itemSource?.sourceSectionId ?? "UNASSIGNED";
    let section = sectionsById.get(sectionId);
    if (!section) {
      section = { id: sectionId, label: "Unassigned items", roomName: "Unassigned items", estimatedPaise: 0, netPaise: 0, items: [] };
      sectionsById.set(sectionId, section);
    }
    section.items.push(item);
    if (itemBlockers.length === 0) readyItemCount += 1;
    blockers.push(...itemBlockers);
    digestItems.push({ id, version: item.version, source: itemSource, itemName: item.itemName, brand: item.brand,
      uom: item.uom, vendor: item.vendor, quantity, pricePaise, allocation,
    overlapOrderId: overlap?.orderId ?? null, overlapCode: overlap?.code ?? null });
  }
  const sections = [...sectionsById.values()].sort((left, right) => left.id.localeCompare(right.id));
  for (const section of sections) {
    section.items.sort((left, right) => left.id.localeCompare(right.id));
    section.netPaise = section.items.some((item) => item.plannedLineNetPaise === null)
      ? null : sumPaise(section.items.map((item) => item.plannedLineNetPaise!));
  }
  if (actionableRows.length === 0) blockers.push({ code: "NO_ITEMS", message: "Add procurement items before sending a purchase order request." });
  const netPaise = sections.some((section) => section.netPaise === null) ? null : sumPaise(sections.map((section) => section.netPaise!));
  const digestSourceLines = options.digestVersion === "legacy"
    ? [...source.lineItems].sort((left, right) => left.key.localeCompare(right.key))
      .map(({ key, sectionId, roomName, amountPaise }) => ({ key, sectionId, roomName, amountPaise }))
    : [...source.allLineItems].sort((left, right) => left.key.localeCompare(right.key))
      .map((line) => {
        const itemIds = itemIdsByLine.get(line.key) ?? [];
        const eligibleIds = itemIds.filter((id) => overlaps.get(id)?.code !== "ALREADY_ORDERED");
        const currentLabels = currentLabelsByKey.get(line.key);
        const labelsChanged = line.source === "configuration" && currentLabels && (
          currentLabels.mainBasketName !== (line.mainBasketName ?? line.sectionLabel) ||
          currentLabels.subBasketName !== (line.subBasketName ?? null) ||
          currentLabels.mainLineName !== (line.mainLineName ?? line.specification));
        // Preserve the pre-display source shape and key order for pending request digests.
        const { approvedClassification: _classification, approvedPricingMode: _pricingMode,
          approvedModeIssues: _displayIssues, ...commercialLine } = line;
        return { line: commercialLine, ...(labelsChanged ? { currentLabels } : {}),
          mode: eligibleIds.length ? digestMode(modeResolutions.get(line.key) ?? null, new Set(eligibleIds)) : null,
          itemIds: [...itemIds].sort() };
      });
  const digest = createHash("sha256").update(JSON.stringify({ projectId, estimateSource, orderDefaults,
    sourceLines: digestSourceLines,
    items: digestItems, manualOrders: orders.map((order) => ({ id: String(order._id), status: String(order.status),
      approvedRevisionId: order.approvedRevisionId ?? null, draftItemIds: (order.draftLines ?? []).map((line: Row) => String(line.procurementItemId)).sort() }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    commitments: { committedPaise, committedGstPaise, committedTotalPaise }
  })).digest("hex");
  return { projectId, orderDefaults, estimateSource, approvedEstimatePaise, committedPaise, committedGstPaise,
    committedTotalPaise, remainingPaise: approvedEstimatePaise - committedPaise, estimateLines, sections,
    netPaise, itemCount: actionableRows.length, readyItemCount, blockers, digest };
}

function preparationEstimateLine(line: ApprovedProcurementSourceLine, itemIds: string[],
  mode: PurchaseOrderModeResolution | null, mainBasketClassification: "standard" | "special",
  mainBasketClassificationExplicit: boolean,
  standardSuggestion: PurchaseOrderModeStandardSuggestion | null,
  projectRate: ProcurementBasketProjectRate,
  currentMainLineName: string | null,
  currentBasketName: string | null,
  currentSubBasketName: string | null): PurchaseOrderPreparationEstimateLine {
  return {
    key: line.key, included: line.included, source: line.source === "configuration" ? "configuration" : "legacy",
    estimateMode: resolveProcurementEstimateMode(line, line.source === "configuration" &&
      mainBasketClassificationExplicit && mainBasketClassification === "standard"),
    ...(line.itemType ? { itemType: line.itemType } : {}),
    mainBasketClassification, mainBasketClassificationExplicit,
    roomId: line.roomId ?? null, roomName: line.roomName,
    mainBasketId: line.mainBasketId ?? line.sectionId,
    mainBasketName: currentBasketName ?? line.mainBasketName ?? line.sectionLabel,
    subBasketId: line.subBasketId ?? null, subBasketName: currentSubBasketName ?? line.subBasketName ?? null,
    mainLineId: line.mainLineId ?? null, mainLineName: currentMainLineName ?? line.mainLineName ?? line.specification,
    quantity: String(line.quantity), unit: line.unit, amountPaise: line.amountPaise,
    itemIds: [...itemIds], mode,
    projectRate,
    ...(standardSuggestion ? { standardSuggestion } : {})
  };
}

function digestMode(mode: PurchaseOrderModeResolution | null, eligibleIds: ReadonlySet<string>): Record<string, unknown> | null {
  if (!mode) return null;
  return {
    state: mode.state, options: mode.options, issues: mode.issues,
    decision: mode.decision,
    ...(mode.integrity ? { integrity: { status: mode.integrity.status,
      activatedDigest: mode.integrity.activatedDigest, observedDigest: mode.integrity.observedDigest } } : {}),
    // A published revision can move from active to superseded when another
    // revision is activated. Its verified content digest remains the same.
    revision: mode.revision ? { id: mode.revision.id, contentDigest: mode.revision.contentDigest,
      ...(mode.revision.status === "draft" ? { status: mode.revision.status, version: mode.revision.version } : {}) } : null,
    uom: mode.uom, preview: mode.preview,
    priceReferences: Object.fromEntries(Object.entries(mode.priceReferences)
      .filter(([id]) => eligibleIds.has(id)).sort(([left], [right]) => left.localeCompare(right)))
  };
}

function sumPaise(values: readonly number[]): number {
  const total = values.reduce((sum, value) => {
    if (!Number.isSafeInteger(value) || value < 0) commitmentConflict();
    return sum + BigInt(value);
  }, 0n);
  if (total > BigInt(MAX_FINANCE_AMOUNT_PAISE)) commitmentConflict();
  return Number(total);
}
function storedApprovedPaise(row: Row, field: "approvedNetPaise" | "approvedGstPaise" | "approvedTotalPaise"): number {
  const value = row[field];
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_FINANCE_AMOUNT_PAISE) commitmentConflict();
  return value;
}
function commitmentConflict(): never {
  throw new ApiError(409, "PURCHASE_ORDER_COMMITMENT_CONFLICT", "Approved order totals are inconsistent.");
}
function sourceConflict(): never {
  throw new ApiError(409, "PROCUREMENT_ITEM_SOURCE_CONFLICT", "A procurement item does not match the current approved estimate. Refresh and correct it before ordering.");
}
