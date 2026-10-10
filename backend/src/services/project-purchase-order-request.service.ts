import { notifyIssuedWorkCommitted } from "./issued-work-delivery.js";
import { createHash, randomUUID } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import type { ZodType } from "zod";
import {
  purchaseOrderRequestDecisionSchema, purchaseOrderRequestQuerySchema, purchaseOrderRequestQuoteSchema, purchaseOrderRequestSubmitSchema,
  type PurchaseOrderRequestDecisionInput, type PurchaseOrderRequestLine, type PurchaseOrderRequestModeSnapshot, type PurchaseOrderRequestQuery,
  type PurchaseOrderRequestQuoteInput, type PurchaseOrderRequestSectionTotal, type PurchaseOrderRequestSubmitInput,
  type PurchaseOrderRequestTotals, type PurchaseOrderRequestVendorTotal
} from "../domain/project-purchase-order-request.js";
import { calculatePurchaseOrderLine, calculatePurchaseOrderTotals, type ApprovedPurchaseOrderLine } from "../domain/project-purchase-order.js";
import { MAX_FINANCE_AMOUNT_PAISE } from "../domain/project-finance.js";
import type { PurchaseOrderModeResolution } from "../domain/project-purchase-order-mode.js";
import type { ProjectPurchaseOrderPreparationDto } from "../domain/project-purchase-order-preparation.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectProcurementItemModel } from "../models/ProjectProcurementItem.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRequestModel } from "../models/ProjectPurchaseOrderRequest.js";
import { ProjectPurchaseOrderRequestRevisionModel } from "../models/ProjectPurchaseOrderRequestRevision.js";
import { ProjectPurchaseOrderRevisionModel } from "../models/ProjectPurchaseOrderRevision.js";
import { UserModel } from "../models/User.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { assertPurchaseOrderAllocations } from "./procurement-vendor-allocation.service.js";
import { assertProcurementProjectAccess, procurementItemSourceSnapshot } from "./procurement.service.js";
import { buildProjectPurchaseOrderPreparation } from "./project-purchase-order-preparation.service.js";
import { cutOverProjectAuthority, type PurchaseOrderApprovalHook } from "./project-purchase-order.service.js";
import { assertNoIssuedBasketSourceOverlap } from "./project-purchase-order-tender-overlap.js";
import { vendorActivation } from "./vendor-readiness.service.js";
import { assertCompletionReviewAllowsOrderChanges } from "./site-completion-fence.js";

type Row = Record<string, any>;
type Page<T> = { items: T[]; total: number; limit: number; offset: number };
type Scope = "procurement" | "super_admin";

export interface PurchaseOrderRequestDto {
  id: string;
  projectId: string;
  projectName: string;
  requestNumber: string;
  status: string;
  version: number;
  revision: number;
  submittedRevisionId: string;
  estimateSource: { estimateId: string; estimateVersion: number; estimateReviewRoundId: string | null };
  preparationDigest: string;
  approvedEstimatePaise: number;
  committedPaise: number;
  committedGstPaise: number;
  committedTotalPaise: number;
  remainingPaise: number;
  totals: PurchaseOrderRequestTotals;
  sectionTotals: PurchaseOrderRequestSectionTotal[];
  vendorTotals: PurchaseOrderRequestVendorTotal[];
  approvedOrderIds: string[];
  decisions: Array<{ id: string; revisionId: string; revision: number; decision: string; actorId: string; reason: string | null; budgetOverrideReason: string | null; decidedAt: string }>;
  revisions: Array<{ id: string; revision: number; submittedAt: string; submittedById: string; preparationDigest: string;
    approvedEstimatePaise: number; committedPaise: number; committedGstPaise: number; committedTotalPaise: number; remainingPaise: number;
    lines: PurchaseOrderRequestLine[]; modeSnapshotStatus: "captured" | "historical_unavailable"; modeSnapshots: PurchaseOrderRequestModeSnapshot[];
    sectionTotals: PurchaseOrderRequestSectionTotal[]; vendorTotals: PurchaseOrderRequestVendorTotal[]; totals: PurchaseOrderRequestTotals }>;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseOrderRequestQuoteDto {
  projectId: string;
  preparationDigest: string;
  estimateSource: PurchaseOrderRequestDto["estimateSource"];
  approvedEstimatePaise: number;
  committedPaise: number;
  committedGstPaise: number;
  committedTotalPaise: number;
  remainingPaise: number;
  lines: PurchaseOrderRequestLine[];
  modeSnapshots: PurchaseOrderRequestModeSnapshot[];
  sectionTotals: PurchaseOrderRequestSectionTotal[];
  vendorTotals: PurchaseOrderRequestVendorTotal[];
  totals: PurchaseOrderRequestTotals;
}

export interface ProjectPurchaseOrderRequestService {
  quote(actor: PublicUser, projectId: string, input: PurchaseOrderRequestQuoteInput): Promise<PurchaseOrderRequestQuoteDto>;
  list(actor: PublicUser, projectId: string, query: PurchaseOrderRequestQuery): Promise<Page<PurchaseOrderRequestDto>>;
  get(actor: PublicUser, projectId: string, requestId: string): Promise<PurchaseOrderRequestDto>;
  pending(actor: PublicUser, query: PurchaseOrderRequestQuery): Promise<Page<PurchaseOrderRequestDto>>;
  submit(actor: PublicUser, projectId: string, input: PurchaseOrderRequestSubmitInput): Promise<PurchaseOrderRequestDto>;
  decide(actor: PublicUser, requestId: string, input: PurchaseOrderRequestDecisionInput): Promise<PurchaseOrderRequestDto>;
}

export function createProjectPurchaseOrderRequestService(input: { audit: AuditService; onApproved: PurchaseOrderApprovalHook; onIssuedCommitted?: () => void | Promise<void>; now?: () => Date }): ProjectPurchaseOrderRequestService {
  if (typeof input.onApproved !== "function") throw new Error("Project purchase-order approval requires transactional vendor work creation.");
  const now = input.now ?? (() => new Date());

  async function tx<T>(actor: PublicUser, scope: Scope, projectId: string | null, work: (session: ClientSession) => Promise<T>): Promise<T> {
    return mongoose.connection.transaction(async session => {
      if (scope === "procurement") {
        if (!projectId) throw new Error("Project-scoped access requires a project ID.");
        await assertProcurementProjectAccess(actor, projectId, session);
      } else await requireSuperAdmin(actor, session);
      return work(session);
    }, { readConcern: { level: "snapshot" }, readPreference: "primary" });
  }

  async function detail(request: Row, session: ClientSession): Promise<PurchaseOrderRequestDto> {
    const revisions = await ProjectPurchaseOrderRequestRevisionModel.find({ requestId: request._id }).sort({ revision: 1 }).session(session).lean() as Row[];
    if (!revisions.length || !revisions.some(revision => String(revision._id) === request.submittedRevisionId)) {
      throw new ApiError(409, "PURCHASE_ORDER_REQUEST_REVISION_CONFLICT", "The submitted purchase-order request revision is missing.");
    }
    return requestDto(request, revisions);
  }

  return {
    quote(actor, projectId, value) {
      return tx(actor, "procurement", projectId, async session => {
        const fields = validate(purchaseOrderRequestQuoteSchema, value);
        return buildRequestQuote(projectId, fields, session, now());
      });
    },
    list(actor, projectId, value) {
      return tx(actor, actor.role === "super_admin" ? "super_admin" : "procurement", projectId, async session => {
        const { limit, offset } = validate(purchaseOrderRequestQuerySchema, value);
        const total = await ProjectPurchaseOrderRequestModel.countDocuments({ projectId }).session(session);
        const rows = await ProjectPurchaseOrderRequestModel.find({ projectId }).sort({ updatedAt: -1, _id: 1 }).skip(offset).limit(limit).session(session).lean() as Row[];
        return { items: await Promise.all(rows.map(row => detail(row, session))), total, limit, offset };
      });
    },
    get(actor, projectId, requestId) {
      return tx(actor, actor.role === "super_admin" ? "super_admin" : "procurement", projectId, async session => {
        const request = await ProjectPurchaseOrderRequestModel.findOne({ _id: requestId, projectId }).session(session).lean() as Row | null;
        if (!request) notFound();
        return detail(request, session);
      });
    },
    pending(actor, value) {
      return tx(actor, "super_admin", null, async session => {
        const { limit, offset } = validate(purchaseOrderRequestQuerySchema, value);
        const filter = { status: "pending_approval" };
        const total = await ProjectPurchaseOrderRequestModel.countDocuments(filter).session(session);
        const rows = await ProjectPurchaseOrderRequestModel.find(filter).sort({ updatedAt: 1, _id: 1 }).skip(offset).limit(limit).session(session).lean() as Row[];
        return { items: await Promise.all(rows.map(row => detail(row, session))), total, limit, offset };
      });
    },
    async submit(actor, projectId, value) {
      const fields = validate(purchaseOrderRequestSubmitSchema, value);
      const requestDigest = digest({ projectId, ...fields });
      const work = async (session: ClientSession): Promise<PurchaseOrderRequestDto> => {
        const oldRevision = await ProjectPurchaseOrderRequestRevisionModel.findOne({ projectId, idempotencyKey: fields.idempotencyKey }).session(session).lean() as Row | null;
        if (oldRevision) {
          if (oldRevision.requestDigest !== requestDigest) idempotencyConflict();
          const oldRequest = await ProjectPurchaseOrderRequestModel.findById(oldRevision.requestId).session(session).lean() as Row | null;
          if (!oldRequest) stateConflict();
          return detail(oldRequest, session);
        }
        await assertCompletionReviewAllowsOrderChanges(projectId, session);
        const existing = await ProjectPurchaseOrderRequestModel.findOne({ projectId, status: { $in: ["pending_approval", "changes_requested"] } }).session(session).lean() as Row | null;
        if (existing) {
          const receipt = (existing.receipts as Row[]).find(entry => entry.idempotencyKey === fields.idempotencyKey);
          if (receipt) {
            if (receipt.requestDigest !== requestDigest) idempotencyConflict();
            return detail(existing, session);
          }
          if (existing.status !== "changes_requested" || fields.expectedRequestVersion !== existing.version) stateConflict();
        } else if (fields.expectedRequestVersion !== undefined) stateConflict();

        const source = await procurementItemSourceSnapshot(projectId, session, true);
        if (existing && !sameRequestSource(existing, source)) throw new ApiError(409, "PURCHASE_ORDER_REQUEST_SOURCE_CHANGED",
          "The approved estimate changed after this request was returned. Start a new project request for the new estimate source.");
        const project = await ProjectModel.findOne({ _id: projectId, status: "active" }).select({ name: 1 }).session(session).lean();
        if (!project) throw new ApiError(409, "PURCHASE_ORDER_PROJECT_NOT_ACTIVE", "This project is no longer active.");
        // Effective price and tax references use submission time. Delivery target dates
        // do not represent the date the commercial order is placed.
        const referenceAsOf = now();
        const preparation = await buildProjectPurchaseOrderPreparation(projectId, session, { at: referenceAsOf }) as Row;
        if (preparation.digest !== fields.expectedPreparationDigest) throw new ApiError(409, "PURCHASE_ORDER_PREPARATION_CONFLICT", "Procurement items or the approved estimate changed. Refresh the order preparation.");
        if (!preparation.estimateSource || preparation.estimateSource.estimateId !== source.estimateId ||
          preparation.estimateSource.estimateVersion !== source.estimateVersion ||
          preparation.estimateSource.estimateReviewRoundId !== source.estimateReviewRoundId) sourceConflict();
        const all = (preparation.sections as Row[]).flatMap(section => (section.items as Row[]).map(item => ({ item, section })));
        const manual = await manualOrderItems(projectId, session);
        if (manual.open.size) throw new ApiError(409, "PURCHASE_ORDER_MANUAL_OVERLAP", "Resolve the draft or pending individual purchase orders before sending the project request.");
        const eligible = all.filter(({ item }) => !manual.approved.has(String(item.id)));
        const expectedIds = new Set(eligible.map(({ item }) => String(item.id)));
        if (expectedIds.size === 0 || fields.lines.length !== expectedIds.size || fields.lines.some(line => !expectedIds.has(line.procurementItemId))) {
          throw new ApiError(409, "PURCHASE_ORDER_REQUEST_ITEM_SET_CONFLICT", "Include each current un-ordered procurement item exactly once. Refresh the preparation.");
        }
        const submitted = new Map(fields.lines.map(line => [line.procurementItemId, line]));
        const vendorTerms = new Map(fields.vendorTerms.map(vendor => [vendor.vendorId, vendor.terms]));
        const vendorIds = new Set<string>();
        const lines: PurchaseOrderRequestLine[] = [];
        for (const { item, section } of eligible) {
          const selected = submitted.get(String(item.id))!;
          if (item.version !== selected.expectedVersion || (item.blockers as unknown[]).length > 0) {
            throw new ApiError(409, "PURCHASE_ORDER_REQUEST_ITEM_NOT_READY", "A procurement item is incomplete or changed. Refresh its quantity, vendor, and allocation.");
          }
          if (!item.vendor?.id || !item.plannedOrderQuantityMilliUnits || !Number.isSafeInteger(item.allocatedWorkPaise) || item.allocatedWorkPaise <= 0) {
            throw new ApiError(409, "PURCHASE_ORDER_REQUEST_ITEM_NOT_READY", "Every item needs an active vendor, planned quantity, and recorded allocation.");
          }
          const vendorId = String(item.vendor.id);
          vendorIds.add(vendorId);
          if (!vendorTerms.has(vendorId)) throw new ApiError(400, "VALIDATION_ERROR", "Enter terms for each vendor.", { vendorTerms: "A selected vendor has no terms." });
          const current = await ProjectProcurementItemModel.findOneAndUpdate({ _id: item.id, projectId, version: selected.expectedVersion, removedAt: null },
            { $inc: { commitmentEpoch: 1 } }, { session, returnDocument: "after", runValidators: true, timestamps: false }).lean() as Row | null;
          if (!current || current.vendorId !== vendorId || current.plannedOrderQuantityMilliUnits !== item.plannedOrderQuantityMilliUnits ||
            current.pricePaise !== item.pricePaise || current.allocatedWorkPaise !== item.allocatedWorkPaise ||
            current.estimateId !== source.estimateId || current.estimateVersion !== source.estimateVersion ||
            current.estimateReviewRoundId !== source.estimateReviewRoundId || current.sourceSectionId !== section.id ||
            current.sourceLineItemKey !== item.sourceLineItemKey) sourceConflict();
          const amounts = calculatePurchaseOrderLine({ quantityMilliUnits: Number(item.plannedOrderQuantityMilliUnits), unitPricePaise: Number(item.pricePaise), gstBasisPoints: selected.gstBasisPoints });
          if (amounts.totalPaise > Number(item.allocatedWorkPaise)) throw new ApiError(400, "PURCHASE_ORDER_ALLOCATION_INSUFFICIENT", "The tax-inclusive order amount exceeds this item's vendor allocation.", { [`lines.${lines.length}.gstBasisPoints`]: "Reduce the order or increase its recorded allocation." });
          lines.push({ id: `purchase-order-line-${randomUUID()}`, procurementItemId: String(item.id), procurementItemVersion: Number(item.version),
            estimateId: source.estimateId, estimateVersion: source.estimateVersion, estimateReviewRoundId: source.estimateReviewRoundId,
            sourceSectionId: String(section.id), sectionLabel: String(section.label), sourceLineItemKey: String(item.sourceLineItemKey),
            roomName: String(item.roomName), itemName: String(item.itemName), brand: String(item.brand),
            uomId: String(item.uom.id), uomCode: String(item.uom.code), uomName: String(item.uom.name),
            vendorId, vendorCode: String(item.vendor.code), vendorName: String(item.vendor.name), allocatedWorkPaise: Number(item.allocatedWorkPaise),
            quantityMilliUnits: Number(item.plannedOrderQuantityMilliUnits), unitPricePaise: Number(item.pricePaise),
            gstBasisPoints: selected.gstBasisPoints, scopeType: selected.scopeType, description: selected.description,
            targetDate: selected.targetDate, deliveryLocation: selected.deliveryLocation, ...amounts });
        }
        if (vendorTerms.size !== vendorIds.size || [...vendorTerms.keys()].some(id => !vendorIds.has(id))) throw new ApiError(400, "VALIDATION_ERROR", "Vendor terms must match the selected vendors exactly.", { vendorTerms: "Remove unmatched vendor terms." });
        for (const vendorId of [...vendorIds].sort()) await requireActiveVendor(vendorId, session);
        const totals = calculatePurchaseOrderTotals(lines);
        const modeSnapshots = buildModeSnapshots(preparation as ProjectPurchaseOrderPreparationDto, lines, fields.lines, referenceAsOf);
        const sectionTotals = groupSectionTotals(lines, preparation.sections as Row[]);
        const vendorTotals = groupVendorTotals(lines, vendorTerms);
        if (vendorTotals.some(vendor => lines.filter(line => line.vendorId === vendor.vendorId).length > 100)) throw new ApiError(400, "PURCHASE_ORDER_VENDOR_LINE_LIMIT", "A vendor order can contain at most 100 lines.");
        const timestamp = referenceAsOf;
        await cutOverProjectAuthority(projectId, actor.id, timestamp, input.audit, session);
        const requestId = existing ? String(existing._id) : `purchase-order-request-${randomUUID()}`;
        const revision = existing ? Number(existing.revision) + 1 : 1;
        const revisionId = `purchase-order-request-revision-${randomUUID()}`;
        await ProjectPurchaseOrderRequestRevisionModel.create([{ _id: revisionId, requestId, projectId, revision,
          estimateId: source.estimateId, estimateVersion: source.estimateVersion, estimateReviewRoundId: source.estimateReviewRoundId,
          preparationDigest: preparation.digest, approvedEstimatePaise: preparation.approvedEstimatePaise,
          committedPaise: preparation.committedPaise, committedGstPaise: preparation.committedGstPaise,
          committedTotalPaise: preparation.committedTotalPaise, lines, modeSnapshots, totals, sectionTotals, vendorTotals,
          submittedAt: timestamp, submittedById: actor.id, idempotencyKey: fields.idempotencyKey, requestDigest }], { session });
        const receipt = { idempotencyKey: fields.idempotencyKey, requestDigest, revisionId, recordedAt: timestamp };
        if (existing) {
          const result = await ProjectPurchaseOrderRequestModel.updateOne({ _id: requestId, projectId, version: fields.expectedRequestVersion, status: "changes_requested" }, {
            $set: { status: "pending_approval", version: Number(existing.version) + 1, revision, submittedRevisionId: revisionId,
              preparationDigest: preparation.digest, approvedEstimatePaise: preparation.approvedEstimatePaise,
              committedPaise: preparation.committedPaise, committedGstPaise: preparation.committedGstPaise,
              committedTotalPaise: preparation.committedTotalPaise, totals, sectionTotals, vendorTotals,
              updatedById: actor.id, updatedAt: timestamp },
            $push: { receipts: receipt }
          }, { session, runValidators: true, timestamps: false });
          if (result.matchedCount !== 1) stateConflict();
        } else {
          const requestNumber = `POR-${timestamp.toISOString().slice(0, 10).replace(/-/gu, "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
          await ProjectPurchaseOrderRequestModel.create([{ _id: requestId, projectId, projectName: String(project.name), requestNumber,
            status: "pending_approval", version: 1, revision,
            submittedRevisionId: revisionId, approvedOrderIds: [], estimateId: source.estimateId, estimateVersion: source.estimateVersion,
            estimateReviewRoundId: source.estimateReviewRoundId, preparationDigest: preparation.digest,
            approvedEstimatePaise: preparation.approvedEstimatePaise, committedPaise: preparation.committedPaise,
            committedGstPaise: preparation.committedGstPaise, committedTotalPaise: preparation.committedTotalPaise,
            totals, sectionTotals, vendorTotals, decisions: [], receipts: [receipt], createdById: actor.id, updatedById: actor.id,
            createdAt: timestamp, updatedAt: timestamp }], { session });
        }
        await appendAudit(input.audit, actor.id, "project_purchase_order_request_submitted", requestId, timestamp,
          { projectId, revisionId, revision, totalPaise: totals.totalPaise, vendorCount: vendorIds.size, itemCount: lines.length }, session);
        const stored = await ProjectPurchaseOrderRequestModel.findById(requestId).session(session).lean() as Row;
        return detail(stored, session);
      };
      try { return await tx(actor, "procurement", projectId, work); }
      catch (error) {
        if (!isDuplicate(error)) throw error;
        return tx(actor, "procurement", projectId, async session => {
          const revision = await ProjectPurchaseOrderRequestRevisionModel.findOne({ projectId, idempotencyKey: fields.idempotencyKey }).session(session).lean() as Row | null;
          if (revision) {
            if (revision.requestDigest !== requestDigest) idempotencyConflict();
            const existing = await ProjectPurchaseOrderRequestModel.findById(revision.requestId).session(session).lean() as Row | null;
            if (!existing) stateConflict();
            return detail(existing, session);
          }
          stateConflict();
        });
      }
    },
    async decide(actor, requestId, value) {
      const result = await tx(actor, "super_admin", null, async session => {
        const fields = validate(purchaseOrderRequestDecisionSchema, value);
        const request = await ProjectPurchaseOrderRequestModel.findById(requestId).session(session).lean() as Row | null;
        if (!request) notFound();
        const requestDigest = digest(fields);
        const prior = (request.decisions as Row[]).find(decision => decision.idempotencyKey === fields.idempotencyKey);
        if (prior) {
          if (prior.requestDigest !== requestDigest) idempotencyConflict();
          return detail(request, session);
        }
        await assertCompletionReviewAllowsOrderChanges(String(request.projectId), session);
        if (request.version !== fields.expectedVersion || request.status !== "pending_approval" || request.submittedRevisionId !== fields.submittedRevisionId) stateConflict();
        const revision = await ProjectPurchaseOrderRequestRevisionModel.findOne({ _id: fields.submittedRevisionId, requestId,
          projectId: request.projectId, revision: request.revision }).session(session).lean() as Row | null;
        if (!revision) stateConflict();
        const timestamp = now();
        const approvedOrderIds: string[] = [];
        if (fields.decision === "approve") {
          const recoveredSnapshots = (Array.isArray(revision.modeSnapshots) ? revision.modeSnapshots : [])
            .filter((snapshot: Row) => snapshot.mode?.decision?.integrityBasis);
          if (recoveredSnapshots.length && (!fields.reason || fields.reason.trim().length < 10)) {
            throw new ApiError(400, "PURCHASE_ORDER_RECOVERY_APPROVAL_REASON_REQUIRED",
              "Explain why the current saved Configuration values are acceptable before approving this request.",
              { reason: "Give a separate Super Admin reason of at least 10 characters." });
          }
          const source = await procurementItemSourceSnapshot(String(request.projectId), session, true);
          if (source.estimateId !== request.estimateId || source.estimateVersion !== request.estimateVersion ||
            source.estimateReviewRoundId !== request.estimateReviewRoundId) sourceConflict();
          const preparation = await buildProjectPurchaseOrderPreparation(String(request.projectId), session, {
            at: timestamp, digestVersion: Array.isArray(revision.modeSnapshots) ? "current" : "legacy"
          }) as Row;
          if (preparation.digest !== revision.preparationDigest) throw new ApiError(409, "PURCHASE_ORDER_PREPARATION_CONFLICT", "Procurement items changed after submission. Request changes before approval.");
          assertRecoveredSnapshotsCurrent(recoveredSnapshots, preparation as ProjectPurchaseOrderPreparationDto);
          const lines = revision.lines as PurchaseOrderRequestLine[];
          const manual = await manualOrderItems(String(request.projectId), session);
          if (manual.open.size || lines.some(line => manual.approved.has(line.procurementItemId))) throw new ApiError(409, "PURCHASE_ORDER_MANUAL_OVERLAP", "An individual purchase order now overlaps this project request.");
          const eligibleIds = (preparation.sections as Row[]).flatMap(section => (section.items as Row[]).map(item => String(item.id))).filter(id => !manual.approved.has(id));
          if (eligibleIds.length !== lines.length || new Set(eligibleIds).size !== lines.length || lines.some(line => !eligibleIds.includes(line.procurementItemId))) stateConflict();
          for (const line of lines) {
            const item = await ProjectProcurementItemModel.findOneAndUpdate({ _id: line.procurementItemId, projectId: request.projectId,
              version: line.procurementItemVersion, removedAt: null }, { $inc: { commitmentEpoch: 1 } },
            { session, returnDocument: "after", runValidators: true, timestamps: false }).lean() as Row | null;
            if (!item || item.vendorId !== line.vendorId || item.plannedOrderQuantityMilliUnits !== line.quantityMilliUnits ||
              item.pricePaise !== line.unitPricePaise || item.sourceSectionId !== line.sourceSectionId ||
              item.sourceLineItemKey !== line.sourceLineItemKey || item.allocatedWorkPaise !== line.allocatedWorkPaise) sourceConflict();
          }
          const fence = await ProjectModel.findOneAndUpdate({ _id: request.projectId, status: "active" },
            { $inc: { purchaseOrderApprovalEpoch: 1 } }, { session, returnDocument: "after", runValidators: true, timestamps: false }).lean();
          if (!fence) throw new ApiError(409, "PURCHASE_ORDER_PROJECT_NOT_ACTIVE", "A purchase-order request can be approved only for an active project.");
          await assertNoIssuedBasketSourceOverlap(String(request.projectId),
            lines.map(line => line.sourceLineItemKey), session);
          const approvedEstimatePaise = checkedPaise(source.lineItems.reduce((sum, line) => sum + BigInt(line.amountPaise), 0n));
          const existingOrders = await ProjectPurchaseOrderModel.find({ projectId: request.projectId, approvedRevisionId: { $ne: null }, cancelledAt: null })
            .select({ approvedNetPaise: 1 }).session(session).lean() as Row[];
          const commitments = existingOrders.reduce((sum, order) => sum + BigInt(order.approvedNetPaise), BigInt(revision.totals.netPaise));
          if (commitments > BigInt(approvedEstimatePaise) && !fields.budgetOverrideReason) throw new ApiError(400, "PURCHASE_ORDER_BUDGET_OVERRIDE_REQUIRED", "This approval exceeds the approved estimate. Enter a Super Admin override reason.", { budgetOverrideReason: "Required above the approved estimate." });
          await assertPurchaseOrderAllocations({ projectId: String(request.projectId), lines }, session);
          await cutOverProjectAuthority(String(request.projectId), actor.id, timestamp, input.audit, session);
          for (const vendor of revision.vendorTotals as PurchaseOrderRequestVendorTotal[]) {
            await requireActiveVendor(vendor.vendorId, session);
            const vendorLines = lines.filter(line => line.vendorId === vendor.vendorId);
            if (!vendorLines.length) stateConflict();
            const orderId = `purchase-order-${randomUUID()}`;
            const orderRevisionId = `purchase-order-revision-${randomUUID()}`;
            const orderNumber = `PO-${timestamp.toISOString().slice(0, 10).replace(/-/gu, "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
            const orderLines = vendorLines.map(({ vendorId, vendorCode, vendorName, allocatedWorkPaise, sectionLabel, ...line }) => line);
            const totals = calculatePurchaseOrderTotals(orderLines);
            if (JSON.stringify(totals) !== JSON.stringify(vendor.totals)) stateConflict();
            const generatedKey = digest({ requestId, revisionId: revision._id, vendorId: vendor.vendorId });
            const orderRevision = new ProjectPurchaseOrderRevisionModel({ _id: orderRevisionId, orderId, projectId: request.projectId,
              projectRequestId: requestId, projectRequestRevisionId: revision._id, vendorId: vendor.vendorId, orderNumber,
              revision: 1, estimateId: revision.estimateId, estimateVersion: revision.estimateVersion,
              estimateReviewRoundId: revision.estimateReviewRoundId, vendorCode: vendor.code, vendorName: vendor.name,
              terms: vendor.terms, lines: orderLines, ...totals, submittedAt: timestamp, submittedById: revision.submittedById,
              idempotencyKey: generatedKey, requestDigest: digest({ orderId, orderLines, totals }) });
            await orderRevision.validate();
            await ProjectPurchaseOrderRevisionModel.collection.insertOne(orderRevision.toObject(), { session });
            const vendorOrder = new ProjectPurchaseOrderModel({ _id: orderId, orderNumber, projectId: request.projectId,
              projectRequestId: requestId, projectRequestRevisionId: revision._id, vendorId: vendor.vendorId,
              vendorCode: vendor.code, vendorName: vendor.name, estimateId: revision.estimateId,
              estimateVersion: revision.estimateVersion, estimateReviewRoundId: revision.estimateReviewRoundId,
              status: "approved", version: 1, revision: 1, terms: vendor.terms,
              draftLines: orderLines.map(line => ({ id: line.id, procurementItemId: line.procurementItemId,
                procurementItemVersion: line.procurementItemVersion, quantityMilliUnits: line.quantityMilliUnits,
                unitPricePaise: line.unitPricePaise, gstBasisPoints: line.gstBasisPoints, scopeType: line.scopeType,
                description: line.description, targetDate: line.targetDate, deliveryLocation: line.deliveryLocation })),
              draftNetPaise: totals.netPaise, draftGstPaise: totals.gstPaise, draftTotalPaise: totals.totalPaise,
              submittedRevisionId: orderRevisionId, approvedRevisionId: orderRevisionId, approvedRevision: 1,
              approvedNetPaise: totals.netPaise, approvedGstPaise: totals.gstPaise, approvedTotalPaise: totals.totalPaise,
              approvedAt: timestamp, decisions: [{ id: `purchase-order-decision-${randomUUID()}`, revisionId: orderRevisionId,
                revision: 1, decision: "approve", actorId: actor.id, reason: fields.reason, budgetOverrideReason: fields.budgetOverrideReason,
                decidedAt: timestamp, idempotencyKey: generatedKey, requestDigest }], receipts: [],
              createIdempotencyKey: generatedKey, createRequestDigest: requestDigest,
              createdById: revision.submittedById, updatedById: actor.id, createdAt: timestamp, updatedAt: timestamp });
            await vendorOrder.validate();
            await ProjectPurchaseOrderModel.collection.insertOne(vendorOrder.toObject(), { session });
            await input.onApproved({ actorId: actor.id, approvedRevisionId: orderRevisionId, occurredAt: timestamp, orderId, projectId: String(request.projectId), vendorId: vendor.vendorId, revision: 1,
              lines: orderLines as ApprovedPurchaseOrderLine[] }, session);
            approvedOrderIds.push(orderId);
          }
        }
        const status = fields.decision === "approve" ? "approved" : fields.decision === "request_changes" ? "changes_requested" : "rejected";
        const result = await ProjectPurchaseOrderRequestModel.updateOne({ _id: requestId, status: "pending_approval",
          version: fields.expectedVersion, submittedRevisionId: fields.submittedRevisionId }, {
          $set: { status, approvedOrderIds, updatedById: actor.id, updatedAt: timestamp },
          $inc: { version: 1 },
          $push: { decisions: { id: `purchase-order-request-decision-${randomUUID()}`, revisionId: revision._id,
            revision: revision.revision, decision: fields.decision, actorId: actor.id, reason: fields.reason,
            budgetOverrideReason: fields.budgetOverrideReason, decidedAt: timestamp, idempotencyKey: fields.idempotencyKey, requestDigest } }
        }, { session, runValidators: true, timestamps: false });
        if (result.matchedCount !== 1) stateConflict();
        await appendAudit(input.audit, actor.id, "project_purchase_order_request_decided", requestId, timestamp,
          { projectId: request.projectId, revisionId: revision._id, decision: fields.decision, approvedOrderIds,
            totalPaise: revision.totals.totalPaise }, session, fields.reason ?? fields.budgetOverrideReason);
        const stored = await ProjectPurchaseOrderRequestModel.findById(requestId).session(session).lean() as Row;
        return detail(stored, session);
      });
      if (result.status === "approved") await notifyIssuedWorkCommitted(input.onIssuedCommitted);
      return result;
    }
  };
}

async function buildRequestQuote(projectId: string, fields: PurchaseOrderRequestQuoteInput, session: ClientSession,
  referenceAsOf: Date): Promise<PurchaseOrderRequestQuoteDto> {
  const source = await procurementItemSourceSnapshot(projectId, session);
  const project = await ProjectModel.findOne({ _id: projectId, status: "active" }).select({ _id: 1 }).session(session).lean();
  if (!project) throw new ApiError(409, "PURCHASE_ORDER_PROJECT_NOT_ACTIVE", "This project is no longer active.");
  const preparation = await buildProjectPurchaseOrderPreparation(projectId, session, { at: referenceAsOf }) as Row;
  if (preparation.digest !== fields.expectedPreparationDigest) throw new ApiError(409, "PURCHASE_ORDER_PREPARATION_CONFLICT", "Procurement items or the approved estimate changed. Refresh the order preparation.");
  if (!preparation.estimateSource || preparation.estimateSource.estimateId !== source.estimateId ||
      preparation.estimateSource.estimateVersion !== source.estimateVersion ||
      preparation.estimateSource.estimateReviewRoundId !== source.estimateReviewRoundId) sourceConflict();
  const active = await ProjectPurchaseOrderRequestModel.findOne({ projectId, status: { $in: ["pending_approval", "changes_requested"] } })
    .select({ status: 1, estimateId: 1, estimateVersion: 1, estimateReviewRoundId: 1 }).session(session).lean() as Row | null;
  if (active?.status === "pending_approval") stateConflict();
  if (active && !sameRequestSource(active, source)) throw new ApiError(409, "PURCHASE_ORDER_REQUEST_SOURCE_CHANGED",
    "The approved estimate changed after this request was returned. Start a new project request for the new estimate source.");
  const all = (preparation.sections as Row[]).flatMap(section => (section.items as Row[]).map(item => ({ item, section })));
  const manual = await manualOrderItems(projectId, session);
  if (manual.open.size) throw new ApiError(409, "PURCHASE_ORDER_MANUAL_OVERLAP", "Resolve draft or pending individual purchase orders before sending the project request.");
  const eligible = all.filter(({ item }) => !manual.approved.has(String(item.id)));
  const expectedIds = new Set(eligible.map(({ item }) => String(item.id)));
  if (!expectedIds.size || fields.lines.length !== expectedIds.size || fields.lines.some(line => !expectedIds.has(line.procurementItemId))) {
    throw new ApiError(409, "PURCHASE_ORDER_REQUEST_ITEM_SET_CONFLICT", "Include each current un-ordered procurement item exactly once. Refresh the preparation.");
  }
  const submitted = new Map(fields.lines.map(line => [line.procurementItemId, line]));
  const terms = new Map(fields.vendorTerms.map(vendor => [vendor.vendorId, vendor.terms]));
  const vendorIds = new Set<string>();
  const lines: PurchaseOrderRequestLine[] = [];
  for (const { item, section } of eligible) {
    const selected = submitted.get(String(item.id))!;
    if (item.version !== selected.expectedVersion || (item.blockers as unknown[]).length > 0 ||
        !item.vendor?.id || item.vendor.status !== "active" || !item.plannedOrderQuantityMilliUnits ||
        !Number.isSafeInteger(item.allocatedWorkPaise) || item.allocatedWorkPaise <= 0) {
      throw new ApiError(409, "PURCHASE_ORDER_REQUEST_ITEM_NOT_READY", "A procurement item is incomplete or changed. Refresh its quantity, vendor, and allocation.");
    }
    const vendorId = String(item.vendor.id);
    vendorIds.add(vendorId);
    if (!terms.has(vendorId)) throw new ApiError(400, "VALIDATION_ERROR", "Enter terms for each vendor.", { vendorTerms: "A selected vendor has no terms." });
    const amounts = calculatePurchaseOrderLine({ quantityMilliUnits: Number(item.plannedOrderQuantityMilliUnits),
      unitPricePaise: Number(item.pricePaise), gstBasisPoints: selected.gstBasisPoints });
    if (amounts.totalPaise > Number(item.allocatedWorkPaise)) throw new ApiError(400, "PURCHASE_ORDER_ALLOCATION_INSUFFICIENT",
      "The tax-inclusive order amount exceeds this item's vendor allocation.",
      { [`lines.${lines.length}.gstBasisPoints`]: "Reduce the order or increase its recorded allocation." });
    lines.push({ id: `purchase-order-quote-line-${randomUUID()}`, procurementItemId: String(item.id),
      procurementItemVersion: Number(item.version), estimateId: source.estimateId, estimateVersion: source.estimateVersion,
      estimateReviewRoundId: source.estimateReviewRoundId, sourceSectionId: String(section.id),
      sectionLabel: String(section.label), sourceLineItemKey: String(item.sourceLineItemKey), roomName: String(item.roomName),
      itemName: String(item.itemName), brand: String(item.brand), uomId: String(item.uom.id),
      uomCode: String(item.uom.code), uomName: String(item.uom.name), vendorId,
      vendorCode: String(item.vendor.code), vendorName: String(item.vendor.name), allocatedWorkPaise: Number(item.allocatedWorkPaise),
      quantityMilliUnits: Number(item.plannedOrderQuantityMilliUnits), unitPricePaise: Number(item.pricePaise),
      gstBasisPoints: selected.gstBasisPoints, scopeType: selected.scopeType, description: selected.description,
      targetDate: selected.targetDate, deliveryLocation: selected.deliveryLocation, ...amounts });
  }
  if (terms.size !== vendorIds.size || [...terms.keys()].some(id => !vendorIds.has(id))) throw new ApiError(400, "VALIDATION_ERROR",
    "Vendor terms must match the selected vendors exactly.", { vendorTerms: "Remove unmatched vendor terms." });
  const vendorTotals = groupVendorTotals(lines, terms);
  const modeSnapshots = buildModeSnapshots(preparation as ProjectPurchaseOrderPreparationDto, lines, fields.lines, referenceAsOf);
  if (vendorTotals.some(vendor => lines.filter(line => line.vendorId === vendor.vendorId).length > 100)) throw new ApiError(400,
    "PURCHASE_ORDER_VENDOR_LINE_LIMIT", "A vendor order can contain at most 100 lines.");
  return { projectId, preparationDigest: preparation.digest, estimateSource: { estimateId: source.estimateId,
    estimateVersion: source.estimateVersion, estimateReviewRoundId: source.estimateReviewRoundId },
    approvedEstimatePaise: preparation.approvedEstimatePaise, committedPaise: preparation.committedPaise,
    committedGstPaise: preparation.committedGstPaise, committedTotalPaise: preparation.committedTotalPaise,
    remainingPaise: preparation.remainingPaise, lines, modeSnapshots,
    sectionTotals: groupSectionTotals(lines, preparation.sections as Row[]), vendorTotals,
    totals: calculatePurchaseOrderTotals(lines) };
}

/**
 * Freeze one configured benchmark per approved source line. Commercial child
 * amounts remain the only vendor payable values, even when one line has several
 * children or the mode calculation represents an internal selling price.
 */
function buildModeSnapshots(preparation: ProjectPurchaseOrderPreparationDto,
  lines: readonly PurchaseOrderRequestLine[], selectedLines: PurchaseOrderRequestQuoteInput["lines"],
  referenceAsOf: Date): PurchaseOrderRequestModeSnapshot[] {
  const sourceLines = new Map(preparation.estimateLines.map(line => [line.key, line]));
  if (sourceLines.size !== preparation.estimateLines.length) sourceConflict();
  const selectedById = new Map(selectedLines.map((line, index) => [line.procurementItemId, { line, index }]));
  const bySource = new Map<string, PurchaseOrderRequestLine[]>();
  for (const line of lines) {
    const group = bySource.get(line.sourceLineItemKey) ?? [];
    group.push(line);
    bySource.set(line.sourceLineItemKey, group);
  }
  const snapshots: PurchaseOrderRequestModeSnapshot[] = [];
  for (const sourceLine of preparation.estimateLines) {
    const children = bySource.get(sourceLine.key);
    if (!children?.length) continue;
    if (!sourceLine.included || sourceLine.amountPaise === null || sourceLine.amountPaise <= 0 ||
      children.some(child => !sourceLine.itemIds.includes(child.procurementItemId))) sourceConflict();
    const mode = sourceLine.mode;
    if (!mode || (mode.state !== "ready" && mode.state !== "exception") || !mode.decision ||
      (mode.state === "ready" && (!mode.preview || !mode.decision.mode || !mode.revision || !mode.uom)) ||
      (mode.state === "exception" && !mode.decision.exceptionReason)) {
      throw new ApiError(409, "PURCHASE_ORDER_MODE_NOT_READY", "Confirm a saved mode or a documented historical exception for each included estimate line before ordering.");
    }
    if (mode.state === "ready") assertCurrentRecoveredMode(mode);
    const actualChildren = children.map(child => {
      const selected = selectedById.get(child.procurementItemId);
      if (!selected) sourceConflict();
      const reference = mode.priceReferences[child.procurementItemId];
      const matchesReference = reference?.state === "ready" && reference.unitPricePaise === child.unitPricePaise &&
        reference.gstBasisPoints === child.gstBasisPoints;
      const commercialExceptionReason = selected.line.commercialExceptionReason?.trim() || null;
      if (!matchesReference && !commercialExceptionReason) {
        throw new ApiError(400, "PURCHASE_ORDER_COMMERCIAL_EXCEPTION_REQUIRED",
          "Document the agreed vendor rate and tax when they cannot be verified against one saved price and tax version.",
          { [`lines.${selected.index}.commercialExceptionReason`]: "Give a reason for the agreed rate or GST." });
      }
      return { procurementItemId: child.procurementItemId, vendorId: child.vendorId,
        quantityMilliUnits: child.quantityMilliUnits, unitPricePaise: child.unitPricePaise,
        gstBasisPoints: child.gstBasisPoints, allocatedWorkPaise: child.allocatedWorkPaise,
        netPaise: child.netPaise, gstPaise: child.gstPaise, totalPaise: child.totalPaise,
        commercialExceptionReason };
    });
    const actualTotals = calculatePurchaseOrderTotals(children);
    const selectedPriceReferences = Object.fromEntries(children.flatMap(child => {
      const reference = mode.priceReferences[child.procurementItemId];
      return reference ? [[child.procurementItemId, reference] as const] : [];
    }));
    snapshots.push({ sourceLineItemKey: sourceLine.key, source: sourceLine.source,
      roomId: sourceLine.roomId, roomName: sourceLine.roomName,
      mainBasketId: sourceLine.mainBasketId, mainBasketName: sourceLine.mainBasketName,
      subBasketId: sourceLine.subBasketId, subBasketName: sourceLine.subBasketName,
      mainLineId: sourceLine.mainLineId, mainLineName: sourceLine.mainLineName,
      approvedQuantity: sourceLine.quantity, approvedUnit: sourceLine.unit,
      approvedAmountPaise: sourceLine.amountPaise, referenceAsOf: referenceAsOf.toISOString(),
      mode: { ...mode, priceReferences: selectedPriceReferences }, actualChildren, actualTotals,
      actualNetMinusConfiguredCostPaise: mode.preview ? actualTotals.netPaise - mode.preview.adjustedCostPaise : null });
  }
  if (snapshots.reduce((sum, snapshot) => sum + snapshot.actualChildren.length, 0) !== lines.length) sourceConflict();
  return snapshots;
}

function assertCurrentRecoveredMode(mode: PurchaseOrderModeResolution): void {
  const basis = mode.decision?.integrityBasis;
  const integrity = mode.integrity;
  if (!basis && !integrity) return;
  if (mode.state !== "ready" || !basis || basis.kind !== "observed_unverified" ||
      !integrity || integrity.status !== "mismatch" || !mode.preview || !mode.decision ||
      !mode.decision.mode || mode.preview.mode !== mode.decision.mode ||
      !mode.revision || !/^[a-f0-9]{64}$/u.test(basis.activatedDigest) ||
      !/^[a-f0-9]{64}$/u.test(basis.observedDigest) ||
      basis.activatedDigest !== integrity.activatedDigest ||
      basis.activatedDigest !== mode.revision.contentDigest ||
      basis.activatedDigest !== mode.decision.revisionDigest ||
      basis.observedDigest !== integrity.observedDigest ||
      typeof basis.reason !== "string" || basis.reason.trim().length < 10 ||
      typeof basis.actorId !== "string" || !basis.actorId ||
      typeof basis.acknowledgedAt !== "string" || !basis.acknowledgedAt) {
    throw new ApiError(409, "PURCHASE_ORDER_MODE_INTEGRITY_CONFLICT",
      "The acknowledged Configuration values changed. Review and save this mode again before ordering.");
  }
}

function assertRecoveredSnapshotsCurrent(snapshots: readonly Row[],
  preparation: ProjectPurchaseOrderPreparationDto): void {
  if (!snapshots.length) return;
  const currentByKey = new Map(preparation.estimateLines.map(line => [line.key, line.mode]));
  for (const snapshot of snapshots) {
    const frozen = snapshot.mode as PurchaseOrderModeResolution;
    assertCurrentRecoveredMode(frozen);
    const current = currentByKey.get(String(snapshot.sourceLineItemKey));
    if (!current || current.state !== "ready") {
      throw new ApiError(409, "PURCHASE_ORDER_PREPARATION_CONFLICT",
        "The acknowledged Configuration values changed after submission. Request changes before approval.");
    }
    assertCurrentRecoveredMode(current);
    const originalDecision = frozen.decision;
    const latestDecision = current.decision;
    const original = originalDecision?.integrityBasis;
    const latest = latestDecision?.integrityBasis;
    if (!originalDecision || !latestDecision || !original || !latest ||
        originalDecision.id !== latestDecision.id || originalDecision.version !== latestDecision.version ||
        originalDecision.mode !== latestDecision.mode ||
        original.activatedDigest !== latest.activatedDigest || original.observedDigest !== latest.observedDigest ||
        original.reason !== latest.reason || original.actorId !== latest.actorId ||
        original.acknowledgedAt !== latest.acknowledgedAt) {
      throw new ApiError(409, "PURCHASE_ORDER_PREPARATION_CONFLICT",
        "The acknowledged Configuration values changed after submission. Request changes before approval.");
    }
  }
}

function sameRequestSource(request: Row, source: { estimateId: string; estimateVersion: number; estimateReviewRoundId: string | null }): boolean {
  return request.estimateId === source.estimateId && request.estimateVersion === source.estimateVersion &&
    request.estimateReviewRoundId === source.estimateReviewRoundId;
}

function validate<T>(schema: ZodType<T, any, any>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", Object.fromEntries(result.error.issues.map(issue => [issue.path.join("."), issue.message])));
  return result.data;
}
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function checkedPaise(value: bigint): number {
  if (value < 0n || value > BigInt(MAX_FINANCE_AMOUNT_PAISE)) throw new ApiError(409, "PURCHASE_ORDER_COMMITMENT_CONFLICT", "Project purchase-order amounts exceed the supported range.");
  return Number(value);
}
function idempotencyConflict(): never { throw new ApiError(409, "PURCHASE_ORDER_REQUEST_IDEMPOTENCY_CONFLICT", "This request key was already used with different details."); }
function stateConflict(): never { throw new ApiError(409, "PURCHASE_ORDER_REQUEST_STATE_CONFLICT", "The project purchase-order request changed. Reload it before continuing."); }
function sourceConflict(): never { throw new ApiError(409, "PURCHASE_ORDER_REQUEST_SOURCE_CONFLICT", "An approved estimate or procurement item changed. Refresh the request."); }
function notFound(): never { throw new ApiError(404, "PURCHASE_ORDER_REQUEST_NOT_FOUND", "Purchase-order request not found."); }
function isDuplicate(error: unknown): boolean { return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000); }

async function requireSuperAdmin(actor: PublicUser, session: ClientSession): Promise<void> {
  const user = await UserModel.findOne({ _id: actor.id, role: actor.role, active: true }).select({ role: 1 }).session(session).lean();
  if (!user) throw new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.");
  if (user.role !== "super_admin") throw new ApiError(403, "FORBIDDEN", "You cannot review project purchase-order requests.");
}
async function requireActiveVendor(vendorId: string, session: ClientSession): Promise<Row> {
  const vendor = await AiEstimatorKnowledgeVendorModel.findOneAndUpdate({ _id: vendorId, status: "active", archivedAt: null },
    { $inc: { dependencyEpoch: 1 } }, { session, returnDocument: "after", runValidators: true, timestamps: false }).lean() as Row | null;
  if (!vendor || (await vendorActivation(vendor, session)).effectiveStatus !== "active") throw new ApiError(409, "PURCHASE_ORDER_VENDOR_NOT_READY", "Activate each vendor and complete both KPIs before ordering.");
  return vendor;
}
async function manualOrderItems(projectId: string, session: ClientSession): Promise<{ approved: Set<string>; open: Set<string> }> {
  const orders = await ProjectPurchaseOrderModel.find({ projectId }).select({ _id: 1, status: 1, draftLines: 1,
    approvedRevisionId: 1, cancelledAt: 1 }).session(session).lean() as Row[];
  const open = new Set<string>();
  const approved = new Set<string>();
  for (const order of orders) {
    if (order.projectRequestId || order.status === "cancelled") continue;
    if (["draft", "pending_approval", "changes_requested", "rejected"].includes(order.status)) for (const line of order.draftLines as Row[]) open.add(String(line.procurementItemId));
  }
  const approvedOrders = orders.filter(order => order.approvedRevisionId && !order.cancelledAt);
  const revisions = await ProjectPurchaseOrderRevisionModel.find({ _id: { $in: approvedOrders.map(order => order.approvedRevisionId) } }).select({ lines: 1 }).session(session).lean() as Row[];
  if (revisions.length !== approvedOrders.length) throw new ApiError(409, "PURCHASE_ORDER_MANUAL_OVERLAP", "An existing approved order revision is missing.");
  for (const revision of revisions) for (const line of revision.lines as Row[]) approved.add(String(line.procurementItemId));
  return { approved, open };
}
function groupSectionTotals(lines: readonly PurchaseOrderRequestLine[], sections: readonly Row[]): PurchaseOrderRequestSectionTotal[] {
  const groups = new Map<string, PurchaseOrderRequestLine[]>();
  for (const line of lines) groups.set(line.sourceSectionId, [...(groups.get(line.sourceSectionId) ?? []), line]);
  return sections.map(section => ({ sectionId: String(section.id), label: String(section.label),
    totals: calculatePurchaseOrderTotals(groups.get(String(section.id)) ?? []) }));
}
function groupVendorTotals(lines: readonly PurchaseOrderRequestLine[], terms: ReadonlyMap<string, string>): PurchaseOrderRequestVendorTotal[] {
  const groups = new Map<string, PurchaseOrderRequestLine[]>();
  for (const line of lines) groups.set(line.vendorId, [...(groups.get(line.vendorId) ?? []), line]);
  return [...groups.entries()].map(([vendorId, group]) => ({ vendorId, code: group[0]!.vendorCode, name: group[0]!.vendorName,
    terms: terms.get(vendorId)!, totals: calculatePurchaseOrderTotals(group) }));
}
function requestDto(request: Row, revisions: Row[]): PurchaseOrderRequestDto {
  return { id: String(request._id), projectId: String(request.projectId), projectName: String(request.projectName),
    requestNumber: String(request.requestNumber), status: String(request.status),
    version: Number(request.version), revision: Number(request.revision), submittedRevisionId: String(request.submittedRevisionId),
    estimateSource: { estimateId: String(request.estimateId), estimateVersion: Number(request.estimateVersion),
      estimateReviewRoundId: request.estimateReviewRoundId ?? null }, preparationDigest: String(request.preparationDigest),
    approvedEstimatePaise: Number(request.approvedEstimatePaise), committedPaise: Number(request.committedPaise),
    committedGstPaise: Number(request.committedGstPaise), committedTotalPaise: Number(request.committedTotalPaise),
    remainingPaise: Number(request.approvedEstimatePaise) - Number(request.committedPaise),
    totals: request.totals as PurchaseOrderRequestTotals, sectionTotals: request.sectionTotals as PurchaseOrderRequestSectionTotal[],
    vendorTotals: request.vendorTotals as PurchaseOrderRequestVendorTotal[], approvedOrderIds: request.approvedOrderIds.map(String),
    decisions: (request.decisions as Row[]).map(decision => ({ id: String(decision.id), revisionId: String(decision.revisionId),
      revision: Number(decision.revision), decision: String(decision.decision), actorId: String(decision.actorId),
      reason: decision.reason ?? null, budgetOverrideReason: decision.budgetOverrideReason ?? null,
      decidedAt: new Date(decision.decidedAt).toISOString() })),
    revisions: revisions.map(revision => ({ id: String(revision._id), revision: Number(revision.revision),
      submittedAt: new Date(revision.submittedAt).toISOString(), submittedById: String(revision.submittedById),
      preparationDigest: String(revision.preparationDigest), lines: revision.lines as PurchaseOrderRequestLine[],
      modeSnapshotStatus: Array.isArray(revision.modeSnapshots) ? "captured" as const : "historical_unavailable" as const,
      modeSnapshots: Array.isArray(revision.modeSnapshots) ? revision.modeSnapshots as PurchaseOrderRequestModeSnapshot[] : [],
      approvedEstimatePaise: Number(revision.approvedEstimatePaise), committedPaise: Number(revision.committedPaise),
      committedGstPaise: Number(revision.committedGstPaise), committedTotalPaise: Number(revision.committedTotalPaise),
      remainingPaise: Number(revision.approvedEstimatePaise) - Number(revision.committedPaise),
      sectionTotals: revision.sectionTotals as PurchaseOrderRequestSectionTotal[], vendorTotals: revision.vendorTotals as PurchaseOrderRequestVendorTotal[],
      totals: revision.totals as PurchaseOrderRequestTotals })),
    createdAt: new Date(request.createdAt).toISOString(), updatedAt: new Date(request.updatedAt).toISOString() };
}
async function appendAudit(audit: AuditService, actorId: string, action: "project_purchase_order_request_submitted" | "project_purchase_order_request_decided",
  entityId: string, at: Date, values: Record<string, unknown>, session: ClientSession, reason?: string | null): Promise<void> {
  await audit.appendInMongoTransaction({ actorId, action, entityType: "project_purchase_order", entityId,
    occurredAt: at.toISOString(), newValues: values, reason: reason ?? null }, session);
}
