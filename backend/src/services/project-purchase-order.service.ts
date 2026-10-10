import { notifyIssuedWorkCommitted } from "./issued-work-delivery.js";
import { createHash, randomUUID } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import type { ZodType } from "zod";
import {
  calculatePurchaseOrderLine, calculatePurchaseOrderTotals,
  purchaseOrderAmendSchema, purchaseOrderCancelSchema, purchaseOrderDecisionSchema,
  purchaseOrderDraftSchema, purchaseOrderQuerySchema, purchaseOrderSubmitSchema, purchaseOrderUpdateSchema,
  type ApprovedPurchaseOrderLine, type PurchaseOrderAmendInput, type PurchaseOrderDecisionInput,
  type PurchaseOrderDraftInput, type PurchaseOrderLineInput, type PurchaseOrderQuery,
  type PurchaseOrderSubmitInput, type PurchaseOrderUpdateInput
} from "../domain/project-purchase-order.js";
import { MAX_FINANCE_AMOUNT_PAISE } from "../domain/project-finance.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeVendorModel } from "../models/AiEstimatorKnowledgeVendor.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectProcurementItemModel } from "../models/ProjectProcurementItem.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRevisionModel } from "../models/ProjectPurchaseOrderRevision.js";
import { ProjectPurchaseOrderRequestModel } from "../models/ProjectPurchaseOrderRequest.js";
import { ProjectPurchaseOrderRequestRevisionModel } from "../models/ProjectPurchaseOrderRequestRevision.js";
import { ProjectWorkflowTaskModel } from "../models/ProjectWorkflowTask.js";
import { UserModel } from "../models/User.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { assertProcurementProjectAccess, procurementItemSourceSnapshot } from "./procurement.service.js";
import { vendorActivation } from "./vendor-readiness.service.js";
import { assertPurchaseOrderAllocations } from "./procurement-vendor-allocation.service.js";
import { assertNoIssuedBasketSourceOverlap } from "./project-purchase-order-tender-overlap.js";
import { assertCompletionReviewAllowsOrderChanges } from "./site-completion-fence.js";

type Row = Record<string, any>;
type Source = Awaited<ReturnType<typeof procurementItemSourceSnapshot>>;
type Scope = "procurement" | "super_admin";
type Page<T> = { items: T[]; total: number; limit: number; offset: number };
type PurchaseOrderLineTermsDto = { scopeType: PurchaseOrderLineInput["scopeType"] | null;
  targetDate: string | null; deliveryLocation: string | null };
type ApprovedPurchaseOrderLineDto = Omit<ApprovedPurchaseOrderLine, keyof PurchaseOrderLineTermsDto> & PurchaseOrderLineTermsDto;

export interface PurchaseOrderDto {
  id: string;
  orderNumber: string;
  projectId: string;
  projectRequestId: string | null;
  tenderAwardId: string | null;
  vendor: { id: string; code: string; name: string };
  status: string;
  version: number;
  revision: number;
  estimateSource: { estimateId: string; estimateVersion: number; estimateReviewRoundId: string | null };
  terms: string | null;
  draftLines: Array<Omit<PurchaseOrderLineInput, keyof PurchaseOrderLineTermsDto> & PurchaseOrderLineTermsDto &
    { id: string; procurementItemVersion: number; netPaise: number; gstPaise: number; totalPaise: number }>;
  draftTotals: { netPaise: number; gstPaise: number; totalPaise: number };
  submittedRevisionId: string | null;
  approvedRevisionId: string | null;
  approvedNetPaise: number | null;
  approvedGstPaise: number | null;
  approvedTotalPaise: number | null;
  decisions: Array<{ id: string; revisionId: string; revision: number; decision: string; actorId: string; reason: string | null; budgetOverrideReason: string | null; decidedAt: string }>;
  revisions: Array<{ id: string; revision: number; submittedAt: string; submittedById: string; terms: string | null; lines: ApprovedPurchaseOrderLineDto[]; totals: { netPaise: number; gstPaise: number; totalPaise: number } }>;
  createdAt: string;
  updatedAt: string;
}

export interface VendorPurchaseOrderDto {
  id: string;
  orderNumber: string;
  projectId: string;
  vendor: { id: string; code: string; name: string };
  revision: number;
  approvedAt: string;
  terms: string | null;
  lines: ApprovedPurchaseOrderLineDto[];
  totals: { netPaise: number; gstPaise: number; totalPaise: number };
}

export interface ProjectPurchaseOrderService {
  list(actor: PublicUser, projectId: string, query: PurchaseOrderQuery): Promise<Page<PurchaseOrderDto>>;
  get(actor: PublicUser, projectId: string, orderId: string): Promise<PurchaseOrderDto>;
  pending(actor: PublicUser, query: PurchaseOrderQuery): Promise<Page<PurchaseOrderDto>>;
  create(actor: PublicUser, projectId: string, input: PurchaseOrderDraftInput): Promise<PurchaseOrderDto>;
  update(actor: PublicUser, projectId: string, orderId: string, input: PurchaseOrderUpdateInput): Promise<PurchaseOrderDto>;
  submit(actor: PublicUser, projectId: string, orderId: string, input: PurchaseOrderSubmitInput): Promise<PurchaseOrderDto>;
  decide(actor: PublicUser, projectId: string, orderId: string, input: PurchaseOrderDecisionInput): Promise<PurchaseOrderDto>;
  amend(actor: PublicUser, projectId: string, orderId: string, input: PurchaseOrderAmendInput): Promise<PurchaseOrderDto>;
  cancel(actor: PublicUser, projectId: string, orderId: string, input: PurchaseOrderAmendInput): Promise<PurchaseOrderDto>;
  commitments(actor: PublicUser, projectId: string): Promise<{ approvedEstimatePaise: number; committedPaise: number; committedGstPaise: number; committedTotalPaise: number; remainingPaise: number }>;
  vendorRead(actor: PublicUser, orderId: string): Promise<VendorPurchaseOrderDto>;
}

export interface PurchaseOrderApproval {
  actorId: string;
  approvedRevisionId: string;
  occurredAt: Date;
  orderId: string;
  projectId: string;
  vendorId: string;
  revision: number;
  lines: readonly ApprovedPurchaseOrderLine[];
}
export type PurchaseOrderApprovalHook = (approval: PurchaseOrderApproval, session: ClientSession) => Promise<void>;

/** The approval hook is mandatory: an approved PO and vendor assignments commit together. */
export function createProjectPurchaseOrderService(input: { audit: AuditService; onApproved: PurchaseOrderApprovalHook; onIssuedCommitted?: () => void | Promise<void>; now?: () => Date }): ProjectPurchaseOrderService {
  if (typeof input.onApproved !== "function") throw new Error("Purchase-order approval requires transactional assignment creation.");
  const now = input.now ?? (() => new Date());

  async function tx<T>(actor: PublicUser, scope: Scope, projectId: string | null, work: (session: ClientSession) => Promise<T>): Promise<T> {
    return mongoose.connection.transaction(async (session) => {
      if (scope === "procurement") {
        if (!projectId) throw new Error("Procurement access requires a project ID.");
        await assertProcurementProjectAccess(actor, projectId, session);
      } else await requireSuperAdmin(actor, session);
      return work(session);
    }, { readConcern: { level: "snapshot" }, readPreference: "primary" });
  }

  async function detail(projectId: string, orderId: string, session: ClientSession): Promise<PurchaseOrderDto> {
    const order = await requireOrder(projectId, orderId, session);
    return orderDto(order, await ProjectPurchaseOrderRevisionModel.find({ orderId }).sort({ revision: 1 }).session(session).lean());
  }

  return {
    list(actor, projectId, query) {
      return tx(actor, actor.role === "super_admin" ? "super_admin" : "procurement", projectId, async (session) => {
        const { limit, offset } = validate(purchaseOrderQuerySchema, query);
        await procurementItemSourceSnapshot(projectId, session);
        const total = await ProjectPurchaseOrderModel.countDocuments({ projectId }).session(session);
        const orders = await ProjectPurchaseOrderModel.find({ projectId }).sort({ updatedAt: -1, _id: 1 }).skip(offset).limit(limit).session(session).lean();
        const items: PurchaseOrderDto[] = [];
        for (const order of orders) items.push(await detail(projectId, String(order._id), session));
        return { items, total, limit, offset };
      });
    },
    get(actor, projectId, orderId) {
      return tx(actor, actor.role === "super_admin" ? "super_admin" : "procurement", projectId, async (session) => {
        await procurementItemSourceSnapshot(projectId, session);
        return detail(projectId, orderId, session);
      });
    },
    pending(actor, query) {
      return tx(actor, "super_admin", null, async (session) => {
        const { limit, offset } = validate(purchaseOrderQuerySchema, query);
        const filter = { status: "pending_approval" };
        const total = await ProjectPurchaseOrderModel.countDocuments(filter).session(session);
        const orders = await ProjectPurchaseOrderModel.find(filter).sort({ updatedAt: 1, _id: 1 }).skip(offset).limit(limit).session(session).lean();
        const items: PurchaseOrderDto[] = [];
        for (const order of orders) items.push(await detail(String(order.projectId), String(order._id), session));
        return { items, total, limit, offset };
      });
    },
    async create(actor, projectId, value) {
      const fields = validate(purchaseOrderDraftSchema, value);
      const requestDigest = digest({ projectId, ...fields });
      try {
        return await tx(actor, "procurement", projectId, async (session) => {
          const existing = await ProjectPurchaseOrderModel.findOne({ projectId, createIdempotencyKey: fields.idempotencyKey }).session(session).lean();
          if (existing) {
            if (existing.createRequestDigest === requestDigest) return detail(projectId, String(existing._id), session);
            idempotencyConflict();
          }
          await assertCompletionReviewAllowsOrderChanges(projectId, session);
          const source = await procurementItemSourceSnapshot(projectId, session, true);
          await assertNoProjectRequestOverlap(projectId, fields.lines.map(line => line.procurementItemId), session);
          const vendor = await requireActiveVendor(fields.vendorId, session);
          const lines = await draftLines(projectId, fields.vendorId, fields.lines, source, session);
          const totals = calculatePurchaseOrderTotals(lines.map(line => calculatePurchaseOrderLine(line as PurchaseOrderLineInput)));
          const timestamp = now();
          await cutOverProjectAuthority(projectId, actor.id, timestamp, input.audit, session);
          const orderId = `purchase-order-${randomUUID()}`;
          const orderNumber = `PO-${timestamp.toISOString().slice(0, 10).replace(/-/gu, "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
          await ProjectPurchaseOrderModel.create([{ _id: orderId, orderNumber, projectId, vendorId: fields.vendorId,
            vendorCode: String(vendor.code), vendorName: String(vendor.name), estimateId: source.estimateId,
            estimateVersion: source.estimateVersion, estimateReviewRoundId: source.estimateReviewRoundId,
            status: "draft", version: 1, revision: 0, terms: fields.terms, draftLines: lines,
            draftNetPaise: totals.netPaise, draftGstPaise: totals.gstPaise, draftTotalPaise: totals.totalPaise,
            createIdempotencyKey: fields.idempotencyKey, createRequestDigest: requestDigest,
            createdById: actor.id, updatedById: actor.id, createdAt: timestamp, updatedAt: timestamp
          }], { session });
          await audit(input.audit, actor.id, "project_purchase_order_created", orderId, timestamp, { projectId, vendorId: fields.vendorId, version: 1, draftTotalPaise: totals.totalPaise }, session);
          return detail(projectId, orderId, session);
        });
      } catch (error) {
        if (!isDuplicate(error)) throw error;
        return tx(actor, "procurement", projectId, async (session) => {
          const existing = await ProjectPurchaseOrderModel.findOne({ projectId, createIdempotencyKey: fields.idempotencyKey }).session(session).lean();
          if (!existing) throw error;
          if (existing.createRequestDigest === requestDigest) return detail(projectId, String(existing._id), session);
          idempotencyConflict();
        });
      }
    },
    update(actor, projectId, orderId, value) {
      return tx(actor, "procurement", projectId, async (session) => {
        const fields = validate(purchaseOrderUpdateSchema, value);
        const order = await requireOrder(projectId, orderId, session);
        if (order.tenderAwardId) throw new ApiError(409, "PURCHASE_ORDER_TENDER_MANAGED", "This order is managed by its basket award.");
        const requestDigest = digest(fields);
        if (hasReceipt(order, "update", fields.idempotencyKey, requestDigest)) return detail(projectId, orderId, session);
        await assertCompletionReviewAllowsOrderChanges(projectId, session);
        assertVersion(order, fields.expectedVersion);
        if (!["draft", "changes_requested", "rejected"].includes(order.status)) stateConflict();
        const source = await procurementItemSourceSnapshot(projectId, session, true);
        await assertNoProjectRequestOverlap(projectId, order.draftLines.map((line: Row) => String(line.procurementItemId)), session);
        assertSource(order, source);
        await requireActiveVendor(order.vendorId, session);
        const lines = await draftLines(projectId, order.vendorId, fields.lines, source, session, order.draftLines);
        const totals = calculatePurchaseOrderTotals(lines.map(line => calculatePurchaseOrderLine(line as PurchaseOrderLineInput)));
        const timestamp = now();
        await ProjectPurchaseOrderModel.updateOne({ _id: orderId, projectId, version: fields.expectedVersion }, {
          $set: { status: "draft", terms: fields.terms, draftLines: lines, draftNetPaise: totals.netPaise,
            draftGstPaise: totals.gstPaise, draftTotalPaise: totals.totalPaise, updatedById: actor.id, updatedAt: timestamp },
          $inc: { version: 1 }, $push: { receipts: receipt("update", fields.idempotencyKey, requestDigest, fields.expectedVersion + 1, null, timestamp) }
        }, { session, runValidators: true, timestamps: false }).then(assertMatched);
        await audit(input.audit, actor.id, "project_purchase_order_updated", orderId, timestamp, { projectId, version: fields.expectedVersion + 1, draftTotalPaise: totals.totalPaise }, session);
        return detail(projectId, orderId, session);
      });
    },
    submit(actor, projectId, orderId, value) {
      return tx(actor, "procurement", projectId, async (session) => {
        const fields = validate(purchaseOrderSubmitSchema, value);
        const order = await requireOrder(projectId, orderId, session);
        if (order.tenderAwardId) throw new ApiError(409, "PURCHASE_ORDER_TENDER_MANAGED", "This order is managed by its basket award.");
        const requestDigest = digest(fields);
        if (hasReceipt(order, "submit", fields.idempotencyKey, requestDigest)) return detail(projectId, orderId, session);
        await assertCompletionReviewAllowsOrderChanges(projectId, session);
        assertVersion(order, fields.expectedVersion);
        if (order.status !== "draft") stateConflict();
        const source = await procurementItemSourceSnapshot(projectId, session, true);
        await assertNoProjectRequestOverlap(projectId, order.draftLines.map((line: Row) => String(line.procurementItemId)), session);
        assertSource(order, source);
        const vendor = await requireActiveVendor(order.vendorId, session);
        const lines = await submittedLines(order, source, session);
        const totals = calculatePurchaseOrderTotals(lines);
        const revision = order.revision + 1;
        const revisionId = `purchase-order-revision-${randomUUID()}`;
        const timestamp = now();
        await ProjectPurchaseOrderRevisionModel.create([{ _id: revisionId, orderId, projectId, vendorId: order.vendorId,
          orderNumber: order.orderNumber, revision, estimateId: order.estimateId, estimateVersion: order.estimateVersion,
          estimateReviewRoundId: order.estimateReviewRoundId, vendorCode: String(vendor.code), vendorName: String(vendor.name),
          terms: order.terms, lines, ...totals, submittedAt: timestamp, submittedById: actor.id,
          idempotencyKey: fields.idempotencyKey, requestDigest
        }], { session });
        await ProjectPurchaseOrderModel.updateOne({ _id: orderId, projectId, version: fields.expectedVersion, status: "draft" }, {
          $set: { status: "pending_approval", submittedRevisionId: revisionId, revision,
            vendorCode: String(vendor.code), vendorName: String(vendor.name), updatedById: actor.id, updatedAt: timestamp },
          $inc: { version: 1 }, $push: { receipts: receipt("submit", fields.idempotencyKey, requestDigest, fields.expectedVersion + 1, revisionId, timestamp) }
        }, { session, runValidators: true, timestamps: false }).then(assertMatched);
        await audit(input.audit, actor.id, "project_purchase_order_submitted", orderId, timestamp, { projectId, revision, revisionId, totalPaise: totals.totalPaise }, session);
        return detail(projectId, orderId, session);
      });
    },
    async decide(actor, projectId, orderId, value) {
      const result = await tx(actor, "super_admin", projectId, async (session) => {
        const fields = validate(purchaseOrderDecisionSchema, value);
        const order = await requireOrder(projectId, orderId, session);
        if (order.tenderAwardId) throw new ApiError(409, "PURCHASE_ORDER_TENDER_MANAGED", "A basket award cannot be approved through the individual purchase-order queue.");
        const requestDigest = digest(fields);
        const previous = order.decisions.find((entry: Row) => entry.idempotencyKey === fields.idempotencyKey);
        if (previous) {
          if (previous.requestDigest !== requestDigest) idempotencyConflict();
          return detail(projectId, orderId, session);
        }
        await assertCompletionReviewAllowsOrderChanges(projectId, session);
        assertVersion(order, fields.expectedVersion);
        if (order.status !== "pending_approval" || order.submittedRevisionId !== fields.submittedRevisionId) stateConflict();
        const revision = await requireRevision(order, fields.submittedRevisionId, session);
        let approvedTotals: { approvedRevisionId?: string; approvedRevision?: number; approvedNetPaise?: number; approvedGstPaise?: number; approvedTotalPaise?: number; approvedAt?: Date } = {};
        if (fields.decision === "approve") {
          const source = await procurementItemSourceSnapshot(projectId, session, true);
          await assertNoProjectRequestOverlap(projectId, revision.lines.map((line: Row) => String(line.procurementItemId)), session);
          assertSource(order, source);
          await requireActiveVendor(order.vendorId, session);
          assertRevisionSource(revision, source);
          // Every approval for this project writes the same document before reading
          // commitments. Concurrent snapshots cannot approve disjoint orders using
          // the same remaining budget, even when their vendors differ.
          const approvalFence = await ProjectModel.findOneAndUpdate({ _id: projectId, status: "active" },
            { $inc: { purchaseOrderApprovalEpoch: 1 } }, { session, returnDocument: "after", runValidators: true, timestamps: false }).lean();
          if (!approvalFence) throw new ApiError(409, "PURCHASE_ORDER_PROJECT_NOT_ACTIVE", "A purchase order can be approved only for an active project.");
          await assertNoIssuedBasketSourceOverlap(projectId,
            revision.lines.map((line: Row) => String(line.sourceLineItemKey)), session);
          const budgetPaise = procurementBudgetPaise(source);
          const others = await ProjectPurchaseOrderModel.find({ projectId, _id: { $ne: orderId }, approvedRevisionId: { $ne: null }, cancelledAt: null })
            .select({ approvedNetPaise: 1 }).session(session).lean();
          const commitments = others.reduce((sum, other) => sum + BigInt(storedApprovedPaise(other, "approvedNetPaise")), BigInt(revision.netPaise));
          if (commitments > BigInt(budgetPaise) && !fields.budgetOverrideReason) throw new ApiError(400, "PURCHASE_ORDER_BUDGET_OVERRIDE_REQUIRED", "This approval exceeds the approved estimate. Enter a Super Admin override reason.", { budgetOverrideReason: "Required above the approved estimate." });
          await assertPurchaseOrderAllocations({ projectId, lines: revision.lines as ApprovedPurchaseOrderLine[], excludeOrderIds: [orderId] }, session);
          await input.onApproved({ actorId: actor.id, approvedRevisionId: String(revision._id), occurredAt: now(), orderId, projectId, vendorId: order.vendorId, revision: revision.revision, lines: revision.lines as ApprovedPurchaseOrderLine[] }, session);
          approvedTotals = { approvedRevisionId: revision._id, approvedRevision: revision.revision, approvedNetPaise: revision.netPaise, approvedGstPaise: revision.gstPaise, approvedTotalPaise: revision.totalPaise, approvedAt: now() };
        }
        const timestamp = now();
        const decisionId = `purchase-order-decision-${randomUUID()}`;
        const status = fields.decision === "approve" ? "approved" : fields.decision === "request_changes" ? "changes_requested" : "rejected";
        await ProjectPurchaseOrderModel.updateOne({ _id: orderId, projectId, version: fields.expectedVersion, status: "pending_approval", submittedRevisionId: fields.submittedRevisionId }, {
          $set: { status, ...approvedTotals, updatedById: actor.id, updatedAt: timestamp },
          $inc: { version: 1 },
          $push: { decisions: { id: decisionId, revisionId: revision._id, revision: revision.revision, decision: fields.decision,
            actorId: actor.id, reason: fields.reason, budgetOverrideReason: fields.budgetOverrideReason,
            decidedAt: timestamp, idempotencyKey: fields.idempotencyKey, requestDigest } }
        }, { session, runValidators: true, timestamps: false }).then(assertMatched);
        await audit(input.audit, actor.id, "project_purchase_order_decided", orderId, timestamp, { projectId, revision: revision.revision, decision: fields.decision, approvedTotalPaise: approvedTotals.approvedTotalPaise ?? null }, session, fields.reason ?? fields.budgetOverrideReason);
        return detail(projectId, orderId, session);
      });
      if (result.status === "approved") await notifyIssuedWorkCommitted(input.onIssuedCommitted);
      return result;
    },
    amend(actor, projectId, orderId, value) {
      return tx(actor, "procurement", projectId, async (session) => {
        const fields = validate(purchaseOrderAmendSchema, value);
        const order = await requireOrder(projectId, orderId, session);
        if (order.tenderAwardId) throw new ApiError(409, "PURCHASE_ORDER_TENDER_MANAGED", "Change this work through its basket award.");
        if (order.projectRequestId) throw new ApiError(409, "PURCHASE_ORDER_REQUEST_AMENDMENT_BLOCKED", "This order belongs to an approved project request and cannot be amended as an individual order.");
        const requestDigest = digest(fields);
        if (hasReceipt(order, "amend", fields.idempotencyKey, requestDigest)) return detail(projectId, orderId, session);
        await assertCompletionReviewAllowsOrderChanges(projectId, session);
        assertVersion(order, fields.expectedVersion);
        if (order.status !== "approved" || !order.approvedRevisionId) stateConflict();
        await procurementItemSourceSnapshot(projectId, session, true).then(source => assertSource(order, source));
        const timestamp = now();
        await ProjectPurchaseOrderModel.updateOne({ _id: orderId, projectId, version: fields.expectedVersion, status: "approved" }, {
          $set: { status: "draft", amendmentOfRevision: order.approvedRevision, amendmentReason: fields.reason,
            updatedById: actor.id, updatedAt: timestamp },
          $inc: { version: 1 }, $push: { receipts: receipt("amend", fields.idempotencyKey, requestDigest, fields.expectedVersion + 1, order.approvedRevisionId, timestamp) }
        }, { session, runValidators: true, timestamps: false }).then(assertMatched);
        await audit(input.audit, actor.id, "project_purchase_order_amended", orderId, timestamp, { projectId, priorRevision: order.approvedRevision }, session, fields.reason);
        return detail(projectId, orderId, session);
      });
    },
    cancel(actor, projectId, orderId, value) {
      return tx(actor, "super_admin", projectId, async (session) => {
        const fields = validate(purchaseOrderCancelSchema, value);
        const order = await requireOrder(projectId, orderId, session);
        if (order.tenderAwardId) throw new ApiError(409, "PURCHASE_ORDER_TENDER_MANAGED", "A basket work order requires vendor-work reconciliation before cancellation.");
        const requestDigest = digest(fields);
        if (hasReceipt(order, "cancel", fields.idempotencyKey, requestDigest)) return detail(projectId, orderId, session);
        await assertCompletionReviewAllowsOrderChanges(projectId, session);
        assertVersion(order, fields.expectedVersion);
        // Approved work must be reversed through an explicit vendor-work reconciliation, never hidden by this header.
        if (order.approvedRevisionId) throw new ApiError(409, "PURCHASE_ORDER_APPROVED_CANCELLATION_BLOCKED", "Approved vendor work must be reconciled before cancelling this order.");
        if (order.status === "cancelled") stateConflict();
        const timestamp = now();
        await ProjectPurchaseOrderModel.updateOne({ _id: orderId, projectId, version: fields.expectedVersion, approvedRevisionId: null }, {
          $set: { status: "cancelled", cancelledAt: timestamp, cancelledById: actor.id, cancellationReason: fields.reason, updatedById: actor.id, updatedAt: timestamp },
          $inc: { version: 1 }, $push: { receipts: receipt("cancel", fields.idempotencyKey, requestDigest, fields.expectedVersion + 1, null, timestamp) }
        }, { session, runValidators: true, timestamps: false }).then(assertMatched);
        await audit(input.audit, actor.id, "project_purchase_order_cancelled", orderId, timestamp, { projectId }, session, fields.reason);
        return detail(projectId, orderId, session);
      });
    },
    commitments(actor, projectId) {
      return tx(actor, actor.role === "super_admin" ? "super_admin" : "procurement", projectId, async (session) => {
        const source = await procurementItemSourceSnapshot(projectId, session);
        const approvedEstimatePaise = procurementBudgetPaise(source);
        const orders = await ProjectPurchaseOrderModel.find({ projectId, approvedRevisionId: { $ne: null }, cancelledAt: null }).select({ approvedNetPaise: 1, approvedGstPaise: 1, approvedTotalPaise: 1 }).session(session).lean();
        for (const order of orders) {
          if (storedApprovedPaise(order, "approvedNetPaise") + storedApprovedPaise(order, "approvedGstPaise") !== storedApprovedPaise(order, "approvedTotalPaise")) throw new ApiError(409, "PURCHASE_ORDER_COMMITMENT_CONFLICT", "Approved order totals are inconsistent.");
        }
        const sum = (field: "approvedNetPaise" | "approvedGstPaise" | "approvedTotalPaise") => checkedProjectPaise(orders.reduce((amount, order) => amount + BigInt(storedApprovedPaise(order, field)), 0n));
        const committedPaise = sum("approvedNetPaise");
        const committedGstPaise = sum("approvedGstPaise");
        const committedTotalPaise = sum("approvedTotalPaise");
        return { approvedEstimatePaise, committedPaise, committedGstPaise, committedTotalPaise, remainingPaise: approvedEstimatePaise - committedPaise };
      });
    },
    vendorRead(actor, orderId) {
      return mongoose.connection.transaction(async (session) => {
        const user = await UserModel.findOne({ _id: actor.id, role: actor.role, active: true, vendorId: { $type: "string" } })
          .select({ role: 1, vendorId: 1 }).session(session).lean();
        if (!user || user.role !== "vendor" || !user.vendorId) throw new ApiError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order not found.");
        const vendor = await AiEstimatorKnowledgeVendorModel.findOne({ _id: user.vendorId, status: "active", archivedAt: null }).session(session).lean();
        if (!vendor || (await vendorActivation(vendor, session)).effectiveStatus !== "active") throw new ApiError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order not found.");
        const order = await ProjectPurchaseOrderModel.findOne({ _id: orderId, vendorId: user.vendorId,
          approvedRevisionId: { $ne: null }, cancelledAt: null }).session(session).lean();
        if (!order) throw new ApiError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order not found.");
        const revision = await ProjectPurchaseOrderRevisionModel.findOne({ _id: order.approvedRevisionId, orderId,
          projectId: order.projectId, vendorId: user.vendorId, revision: order.approvedRevision }).session(session).lean();
        if (!revision || !order.approvedAt) throw new ApiError(409, "PURCHASE_ORDER_APPROVAL_CONFLICT", "The approved purchase order is inconsistent.");
        return { id: orderId, orderNumber: String(order.orderNumber), projectId: String(order.projectId),
          vendor: { id: String(order.vendorId), code: String(revision.vendorCode), name: String(revision.vendorName) },
          revision: Number(revision.revision), approvedAt: new Date(order.approvedAt).toISOString(), terms: revision.terms ?? null,
          lines: (revision.lines as Row[]).map(line => ({ ...line,
            scopeType: line.scopeType ?? null, targetDate: line.targetDate ?? null,
            deliveryLocation: line.deliveryLocation ?? null })) as ApprovedPurchaseOrderLineDto[],
          totals: { netPaise: Number(revision.netPaise), gstPaise: Number(revision.gstPaise), totalPaise: Number(revision.totalPaise) } };
      }, { readConcern: { level: "snapshot" }, readPreference: "primary" });
    }
  };
}

function validate<T>(schema: ZodType<T, any, any>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", Object.fromEntries(result.error.issues.map(issue => [issue.path.join("."), issue.message])));
  return result.data;
}
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function receipt(kind: string, idempotencyKey: string, requestDigest: string, version: number, revisionId: string | null, recordedAt: Date) { return { kind, idempotencyKey, requestDigest, version, revisionId, recordedAt }; }
function hasReceipt(order: Row, kind: string, key: string, requestDigest: string): boolean {
  const found = order.receipts.find((entry: Row) => entry.kind === kind && entry.idempotencyKey === key);
  if (!found) return false;
  if (found.requestDigest !== requestDigest) idempotencyConflict();
  return true;
}
function idempotencyConflict(): never { throw new ApiError(409, "PURCHASE_ORDER_IDEMPOTENCY_CONFLICT", "This request key was already used with different order details."); }
function stateConflict(): never { throw new ApiError(409, "PURCHASE_ORDER_STATE_CONFLICT", "This purchase order changed state. Reload it before continuing."); }
function assertVersion(order: Row, version: number): void { if (order.version !== version) throw new ApiError(409, "PURCHASE_ORDER_VERSION_CONFLICT", "This purchase order changed. Reload it before continuing."); }
function assertMatched(result: { matchedCount: number }): void { if (result.matchedCount !== 1) stateConflict(); }
function isDuplicate(error: unknown): boolean { return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000); }
async function requireOrder(projectId: string, orderId: string, session: ClientSession): Promise<Row> {
  const order = await ProjectPurchaseOrderModel.findOne({ _id: orderId, projectId }).session(session).lean();
  if (!order) throw new ApiError(404, "PURCHASE_ORDER_NOT_FOUND", "Purchase order not found.");
  return order;
}
async function requireRevision(order: Row, revisionId: string, session: ClientSession): Promise<Row> {
  const revision = await ProjectPurchaseOrderRevisionModel.findOne({ _id: revisionId, orderId: order._id, projectId: order.projectId, vendorId: order.vendorId, revision: order.revision }).session(session).lean();
  if (!revision) stateConflict();
  return revision;
}
async function requireSuperAdmin(actor: PublicUser, session: ClientSession): Promise<void> {
  const user = await UserModel.findOne({ _id: actor.id, role: actor.role, active: true }).select({ role: 1 }).session(session).lean();
  if (!user) throw new ApiError(401, "INVALID_TOKEN", "Authentication token is invalid.");
  if (user.role !== "super_admin") throw new ApiError(403, "FORBIDDEN", "You cannot manage purchase-order approval.");
}
async function requireActiveVendor(vendorId: string, session: ClientSession): Promise<Row> {
  const vendor = await AiEstimatorKnowledgeVendorModel.findOneAndUpdate({ _id: vendorId, status: "active", archivedAt: null }, { $inc: { dependencyEpoch: 1 } }, { session, returnDocument: "after", runValidators: true, timestamps: false }).lean();
  if (!vendor || (await vendorActivation(vendor, session)).effectiveStatus !== "active") throw new ApiError(409, "PURCHASE_ORDER_VENDOR_NOT_READY", "Activate the vendor and complete both KPIs before assigning this purchase order.");
  return vendor;
}
async function assertNoProjectRequestOverlap(projectId: string, itemIds: readonly string[], session: ClientSession): Promise<void> {
  const active = await ProjectPurchaseOrderRequestModel.exists({ projectId, status: { $in: ["pending_approval", "changes_requested"] } }).session(session);
  if (active) throw new ApiError(409, "PURCHASE_ORDER_REQUEST_OVERLAP", "The project purchase-order request must be resolved before creating or approving an individual order.");
  const approvedRequests = await ProjectPurchaseOrderRequestModel.find({ projectId, status: "approved" }).select({ submittedRevisionId: 1 }).session(session).lean() as Row[];
  if (!approvedRequests.length) return;
  const revisions = await ProjectPurchaseOrderRequestRevisionModel.find({ _id: { $in: approvedRequests.map(request => request.submittedRevisionId) } }).select({ lines: 1 }).session(session).lean() as Row[];
  if (revisions.length !== approvedRequests.length) throw new ApiError(409, "PURCHASE_ORDER_REQUEST_OVERLAP", "An approved project purchase-order request revision is missing.");
  const ordered = new Set(revisions.flatMap(revision => (revision.lines as Row[]).map(line => String(line.procurementItemId))));
  if (itemIds.some(id => ordered.has(id))) throw new ApiError(409, "PURCHASE_ORDER_REQUEST_OVERLAP", "An item in this order was already approved through the project request.");
}
function assertSource(order: Row, source: Source): void {
  if (order.estimateId !== source.estimateId || order.estimateVersion !== source.estimateVersion || order.estimateReviewRoundId !== source.estimateReviewRoundId) throw new ApiError(409, "PURCHASE_ORDER_SOURCE_CONFLICT", "The approved estimate changed. Refresh this purchase order.");
}
function checkedProjectPaise(value: bigint): number {
  if (value < 0n || value > BigInt(MAX_FINANCE_AMOUNT_PAISE)) throw new ApiError(409, "PURCHASE_ORDER_COMMITMENT_CONFLICT", "Project commitments exceed the supported range.");
  return Number(value);
}
function storedApprovedPaise(order: Row, field: "approvedNetPaise" | "approvedGstPaise" | "approvedTotalPaise"): number {
  const amount = order[field];
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > MAX_FINANCE_AMOUNT_PAISE) throw new ApiError(409, "PURCHASE_ORDER_COMMITMENT_CONFLICT", "Approved order totals are inconsistent.");
  return amount;
}
function procurementBudgetPaise(source: Source): number {
  return checkedProjectPaise(source.lineItems.reduce((amount, line) => amount + BigInt(line.amountPaise), 0n));
}
export async function cutOverProjectAuthority(projectId: string, actorId: string, timestamp: Date, auditService: AuditService, session: ClientSession): Promise<void> {
  const project = await ProjectModel.findById(projectId).select({ status: 1, completionAuthority: 1, completionAuthorityVersion: 1 }).session(session).lean();
  if (!project || project.status !== "active") throw new ApiError(409, "PURCHASE_ORDER_PROJECT_NOT_ACTIVE", "A purchase order can be created only for an active project.");
  if (project.completionAuthority != null && !["legacy_staff", "vendor_client"].includes(project.completionAuthority)) throw new ApiError(409, "PURCHASE_ORDER_PROJECT_AUTHORITY_CONFLICT", "Project completion authority is inconsistent.");
  if (project.completionAuthority !== "vendor_client") {
    const authorityFilter = project.completionAuthority === "legacy_staff" ? { completionAuthority: "legacy_staff" } : { completionAuthority: { $exists: false } };
    const changed = await ProjectModel.updateOne({ _id: projectId, status: "active", ...authorityFilter },
      { $set: { completionAuthority: "vendor_client", completionAuthorityVersion: 1 } }, { session, runValidators: true });
    if (changed.matchedCount !== 1) throw new ApiError(409, "PURCHASE_ORDER_PROJECT_AUTHORITY_CONFLICT", "Project completion authority changed. Reload the project.");
  }
  const superseded = await ProjectWorkflowTaskModel.updateMany({ projectId, kind: "trade_execution", supersededAt: null },
    { $set: { supersededAt: timestamp, supersededReason: "vendor_client_cutover" } }, { session, runValidators: true });
  if (project.completionAuthority !== "vendor_client" || superseded.modifiedCount > 0) {
    await auditService.appendInMongoTransaction({ actorId, action: "project_completion_authority_changed", entityType: "project", entityId: projectId,
      occurredAt: timestamp.toISOString(), oldValues: { completionAuthority: project.completionAuthority ?? null, completionAuthorityVersion: project.completionAuthorityVersion ?? null },
      newValues: { completionAuthority: "vendor_client", completionAuthorityVersion: 1, source: "purchase_order_created",
        supersededTradeTaskCount: superseded.modifiedCount } }, session);
  }
}
async function draftLines(projectId: string, vendorId: string, inputLines: readonly PurchaseOrderLineInput[], source: Source, session: ClientSession, previous: readonly Row[] = []): Promise<Row[]> {
  const lineByKey = new Map(source.lineItems.map(line => [line.key, line]));
  const rows: Row[] = [];
  for (const line of inputLines) {
    // The write fence serializes draft insertion with a concurrent tombstone.
    const item = await ProjectProcurementItemModel.findOneAndUpdate({ _id: line.procurementItemId, projectId, vendorId, removedAt: null },
      { $inc: { commitmentEpoch: 1 } }, { session, returnDocument: "after", runValidators: true, timestamps: false }).lean();
    if (!item || item.estimateId !== source.estimateId || item.estimateVersion !== source.estimateVersion || item.estimateReviewRoundId !== source.estimateReviewRoundId || !lineByKey.has(String(item.sourceLineItemKey)) || lineByKey.get(String(item.sourceLineItemKey))?.sectionId !== item.sourceSectionId) throw new ApiError(409, "PURCHASE_ORDER_ITEM_SOURCE_CONFLICT", "A selected item is no longer available under this approved estimate.");
    calculatePurchaseOrderLine(line);
    rows.push({ ...line, id: previous.find(old => old.procurementItemId === line.procurementItemId)?.id ?? `purchase-order-line-${randomUUID()}`, procurementItemVersion: item.version });
  }
  return rows;
}
async function submittedLines(order: Row, source: Source, session: ClientSession): Promise<ApprovedPurchaseOrderLine[]> {
  const lineByKey = new Map(source.lineItems.map(line => [line.key, line]));
  const submitted: ApprovedPurchaseOrderLine[] = [];
  for (const draft of order.draftLines) {
    // This write conflicts with procurement-item tombstoning across concurrent snapshots.
    const item = await ProjectProcurementItemModel.findOneAndUpdate({ _id: draft.procurementItemId, projectId: order.projectId, vendorId: order.vendorId, removedAt: null },
      { $inc: { commitmentEpoch: 1 } }, { session, returnDocument: "after", runValidators: true, timestamps: false }).lean();
    if (!item || item.version !== draft.procurementItemVersion || item.estimateId !== source.estimateId || item.estimateVersion !== source.estimateVersion || item.estimateReviewRoundId !== source.estimateReviewRoundId || !lineByKey.has(String(item.sourceLineItemKey)) || lineByKey.get(String(item.sourceLineItemKey))?.sectionId !== item.sourceSectionId) throw new ApiError(409, "PURCHASE_ORDER_ITEM_SOURCE_CONFLICT", "An order item changed after drafting. Refresh the order before submitting.");
    const sourceLine = lineByKey.get(String(item.sourceLineItemKey))!;
    submitted.push({ ...draft, procurementItemId: String(item._id), estimateId: source.estimateId, estimateVersion: source.estimateVersion,
      estimateReviewRoundId: source.estimateReviewRoundId, sourceSectionId: String(item.sourceSectionId),
      sourceLineItemKey: String(item.sourceLineItemKey), roomName: sourceLine.roomName, itemName: String(item.itemName),
      brand: String(item.brand), uomId: String(item.uomId), uomCode: String(item.uomCode), uomName: String(item.uomName),
      ...calculatePurchaseOrderLine(draft as PurchaseOrderLineInput) });
  }
  return submitted;
}
function assertRevisionSource(revision: Row, source: Source): void {
  const lines = new Map(source.lineItems.map(line => [line.key, line]));
  for (const line of revision.lines) if (line.estimateId !== source.estimateId || line.estimateVersion !== source.estimateVersion || line.estimateReviewRoundId !== source.estimateReviewRoundId || lines.get(String(line.sourceLineItemKey))?.sectionId !== line.sourceSectionId) throw new ApiError(409, "PURCHASE_ORDER_SOURCE_CONFLICT", "A submitted line no longer matches the approved estimate.");
}
async function audit(service: AuditService, actorId: string, action: Parameters<AuditService["appendInMongoTransaction"]>[0]["action"], entityId: string, at: Date, values: Record<string, unknown>, session: ClientSession, reason?: string | null): Promise<void> {
  await service.appendInMongoTransaction({ actorId, action, entityType: "project_purchase_order", entityId,
    occurredAt: at.toISOString(), newValues: values as Record<string, never>, reason: reason ?? null }, session);
}
function orderDto(order: Row, revisions: readonly Row[]): PurchaseOrderDto {
  return { id: String(order._id), orderNumber: String(order.orderNumber), projectId: String(order.projectId),
    projectRequestId: order.projectRequestId == null ? null : String(order.projectRequestId),
    tenderAwardId: order.tenderAwardId == null ? null : String(order.tenderAwardId),
    vendor: { id: String(order.vendorId), code: String(order.vendorCode), name: String(order.vendorName) },
    status: String(order.status), version: Number(order.version), revision: Number(order.revision),
    estimateSource: { estimateId: String(order.estimateId), estimateVersion: Number(order.estimateVersion), estimateReviewRoundId: order.estimateReviewRoundId ?? null },
    terms: order.terms ?? null,
    draftLines: order.draftLines.map((line: Row) => ({ id: line.id, procurementItemId: line.procurementItemId,
      procurementItemVersion: line.procurementItemVersion, quantityMilliUnits: line.quantityMilliUnits,
      unitPricePaise: line.unitPricePaise, gstBasisPoints: line.gstBasisPoints,
      scopeType: line.scopeType ?? null, description: line.description,
      targetDate: line.targetDate ?? null, deliveryLocation: line.deliveryLocation ?? null,
      ...calculatePurchaseOrderLine(line as PurchaseOrderLineInput) })),
    draftTotals: { netPaise: Number(order.draftNetPaise), gstPaise: Number(order.draftGstPaise), totalPaise: Number(order.draftTotalPaise) },
    submittedRevisionId: order.submittedRevisionId ?? null, approvedRevisionId: order.approvedRevisionId ?? null,
    approvedNetPaise: order.approvedNetPaise ?? null, approvedGstPaise: order.approvedGstPaise ?? null,
    approvedTotalPaise: order.approvedTotalPaise ?? null,
    decisions: order.decisions.map((decision: Row) => ({ id: decision.id, revisionId: decision.revisionId,
      revision: decision.revision, decision: decision.decision, actorId: decision.actorId, reason: decision.reason ?? null,
      budgetOverrideReason: decision.budgetOverrideReason ?? null, decidedAt: new Date(decision.decidedAt).toISOString() })),
    revisions: revisions.map(revision => ({ id: String(revision._id), revision: Number(revision.revision),
      submittedAt: new Date(revision.submittedAt).toISOString(), submittedById: String(revision.submittedById),
      terms: revision.terms ?? null, lines: (revision.lines as Row[]).map(line => ({ ...line,
        scopeType: line.scopeType ?? null, targetDate: line.targetDate ?? null,
        deliveryLocation: line.deliveryLocation ?? null })) as ApprovedPurchaseOrderLineDto[],
      totals: { netPaise: Number(revision.netPaise), gstPaise: Number(revision.gstPaise), totalPaise: Number(revision.totalPaise) } })),
    createdAt: new Date(order.createdAt).toISOString(), updatedAt: new Date(order.updatedAt).toISOString() };
}
