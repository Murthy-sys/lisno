import { z } from "zod";
import { procurementBasketDigest } from "../domain/procurement-basket-tender.js";
import { ProcurementBasketAwardModel, ProcurementBasketSourceReconciliationModel } from "../models/ProcurementBasketTender.js";
import { ProjectPurchaseOrderModeDecisionModel } from "../models/ProjectPurchaseOrderModeDecision.js";
import { ProcurementBasketBaseRateModel } from "../models/ProcurementBasketBaseRate.js";
import { ProjectProcurementItemModel } from "../models/ProjectProcurementItem.js";
import { ProjectPurchaseOrderModel } from "../models/ProjectPurchaseOrder.js";
import { ProjectPurchaseOrderRequestModel } from "../models/ProjectPurchaseOrderRequest.js";
import { ProjectPurchaseOrderRequestRevisionModel } from "../models/ProjectPurchaseOrderRequestRevision.js";
import { ProcurementBasketEnquiryModel } from "../models/ProcurementBasketTender.js";
import { ProjectModel } from "../models/Project.js";
import { ApiError } from "../middleware/errors.js";
import type { PublicUser } from "./auth.service.js";
import type { AuditService } from "./audit.service.js";
import { procurementItemSourceSnapshot, procurementPreparationProjectFilter } from "./procurement.service.js";
import { basketVendorScopeMatchesRevision, currentBasket, getBasketEnquiry, getCurrentBoq,
  requireBasketBuyer, tenderConflict, tenderId, tenderTransaction, type TenderRow } from "./procurement-basket-tender-support.service.js";

export const procurementBasketReconciliationSchema = z.object({
  expectedVersion: z.number().int().positive().safe(),
  expectedSourceSnapshotId: z.string().trim().min(1).max(500),
  reason: z.string().trim().min(3).max(2000),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u)
}).strict();
export type ProcurementBasketReconciliationInput = z.infer<typeof procurementBasketReconciliationSchema>;

export async function reconcileProcurementBasketSource(actor: PublicUser, projectId: string, basketId: string,
  enquiryId: string, raw: ProcurementBasketReconciliationInput, audit: AuditService, now: () => Date): Promise<void> {
  const parsed = procurementBasketReconciliationSchema.safeParse(raw);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.");
  const input = parsed.data;
  const requestDigest = procurementBasketDigest({ projectId, basketId, enquiryId, ...input });
  await tenderTransaction(async session => {
    await requireBasketBuyer(actor, projectId, session);
    const receipt = await ProcurementBasketSourceReconciliationModel.findOne({ enquiryId, idempotencyKey: input.idempotencyKey })
      .session(session).lean() as TenderRow | null;
    if (receipt) {
      if (receipt.requestDigest !== requestDigest) tenderConflict("IDEMPOTENCY_CONFLICT", "This reconciliation key was used for a different request.");
      return;
    }
    const enquiry = await getBasketEnquiry(projectId, basketId, enquiryId, session);
    if (enquiry.version !== input.expectedVersion || !["sent", "award_pending"].includes(enquiry.status))
      tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "This enquiry changed. Reload before reconciling.");
    const project = await ProjectModel.findOneAndUpdate({ _id: projectId, ...procurementPreparationProjectFilter() },
      { $inc: { purchaseOrderApprovalEpoch: 1 } }, { session, returnDocument: "after", timestamps: false }).lean();
    if (!project) tenderConflict("PROCUREMENT_BASKET_PROJECT_INACTIVE", "This project is no longer available for procurement preparation.");
    const source = await procurementItemSourceSnapshot(projectId, session, true);
    if (source.preparationSource?.kind !== "approved_final" || source.preparationSource.sourceSnapshotId !== input.expectedSourceSnapshotId)
      tenderConflict("PROCUREMENT_BASKET_FINAL_SOURCE_REQUIRED", "Select the current client-approved final estimate source.");
    const boq = await getCurrentBoq(enquiry, session);
    const oldSource = boq.estimateSource;
    if (oldSource.estimateId === source.estimateId && oldSource.estimateVersion === source.estimateVersion &&
      oldSource.estimateReviewRoundId === source.estimateReviewRoundId)
      tenderConflict("PROCUREMENT_BASKET_ALREADY_CURRENT", "This BOQ already uses the final estimate source.");
    if (oldSource.estimateId !== source.estimateId)
      tenderConflict("PROCUREMENT_BASKET_SOURCE_CHANGED", "The prepared basket belongs to a different estimate.");
    const previous = await ProcurementBasketSourceReconciliationModel.findOne({ enquiryId, boqRevisionId: boq._id,
      "preparationSource.sourceSnapshotId": source.preparationSource.sourceSnapshotId }).session(session).lean();
    if (previous) tenderConflict("PROCUREMENT_BASKET_ALREADY_RECONCILED", "This BOQ has already been reconciled to the final estimate.");
    const keys = (boq.lines as TenderRow[]).map(line => String(line.sourceLineItemKey));
    const sourceFields = { estimateId: source.estimateId, estimateVersion: source.estimateVersion,
      estimateReviewRoundId: source.estimateReviewRoundId };
    const oldFilter = { projectId, ...oldSource, sourceLineItemKey: { $in: keys } };
    const timestamp = now();
    // Carry explicit project decisions into new rows; the former source remains immutable history.
    if (oldSource.estimateVersion !== source.estimateVersion || oldSource.estimateReviewRoundId !== source.estimateReviewRoundId) {
      for (const Model of [ProjectPurchaseOrderModeDecisionModel, ProcurementBasketBaseRateModel]) {
        const rows = await Model.find(oldFilter).session(session).lean() as TenderRow[];
        for (const row of rows) {
          const key = { projectId, ...sourceFields, sourceLineItemKey: row.sourceLineItemKey,
            ...(row.mainBasketId ? { mainBasketId: row.mainBasketId } : {}) };
          if (await Model.exists(key).session(session)) continue;
          const { _id: _oldId, createdAt: _created, updatedAt: _updated, ...fields } = row;
          await Model.create([{ ...fields, ...sourceFields, _id: tenderId("reconciled-preparation"), version: 1,
            createdById: actor.id, updatedById: actor.id, createdAt: timestamp, updatedAt: timestamp }], { session });
        }
      }
    }
    const basket = await currentBasket(projectId, basketId, session);
    if (!basketVendorScopeMatchesRevision(basket, boq, false)) {
      const frozen = new Map((boq.lines as TenderRow[]).map(line => [String(line.sourceLineItemKey), line]));
      const current = new Map(basket.lines.filter(line => line.included).map(line => [line.sourceLineItemKey, line]));
      throw new ApiError(409, "PROCUREMENT_BASKET_SCOPE_RECONCILIATION_REQUIRED",
        "The vendor-facing scope changed. Review the differences, then revise and resend this BOQ.", {
          addedLineKeys: [...current.keys()].filter(key => !frozen.has(key)).join(", "),
          removedLineKeys: [...frozen.keys()].filter(key => !current.has(key)).join(", "),
          changedLineKeys: [...current.keys()].filter(key => frozen.has(key) &&
            !basketVendorScopeMatchesRevision({ ...basket, lines: [current.get(key)!] }, { ...boq, lines: [frozen.get(key)] }, false)).join(", ")
        });
    }
    const items = await ProjectProcurementItemModel.find({ ...oldFilter, removedAt: null }).session(session).lean() as TenderRow[];
    const ids = items.map(item => String(item._id));
    const openRequests = await ProjectPurchaseOrderRequestModel.find({ projectId, status: { $in: ["pending_approval", "ready_to_issue", "changes_requested"] } })
      .select({ submittedRevisionId: 1 }).session(session).lean();
    if (ids.length && (await ProjectPurchaseOrderModel.exists({ projectId, status: { $ne: "cancelled" },
      "draftLines.procurementItemId": { $in: ids } }).session(session) ||
      await ProjectPurchaseOrderRequestRevisionModel.exists({ projectId, _id: { $in: openRequests.map(request => request.submittedRevisionId) },
        "lines.procurementItemId": { $in: ids } }).session(session)))
      tenderConflict("PROCUREMENT_BASKET_ITEM_RECONCILIATION_BLOCKED", "A prepared item belongs to an existing purchase request. Reconcile that request first.");
    for (const item of items) {
      const line = source.lineItems.find(line => line.key === item.sourceLineItemKey);
      if (!line) tenderConflict("PROCUREMENT_BASKET_SOURCE_CHANGED", "A prepared item is no longer included.");
      const updated = await ProjectProcurementItemModel.updateOne({ _id: item._id, version: item.version, removedAt: null }, {
        $set: { ...sourceFields, sourceSectionId: line.sectionId, preparationSource: source.preparationSource,
          updatedById: actor.id, updatedAt: timestamp }, $inc: { version: 1 }
      }, { session, runValidators: true, timestamps: false });
      if (updated.matchedCount !== 1) tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "A prepared item changed while reconciling.");
    }
    const id = tenderId("basket-source-reconciliation");
    await ProcurementBasketSourceReconciliationModel.create([{ _id: id, projectId, mainBasketId: basketId,
      enquiryId, boqRevisionId: boq._id, boqDigest: boq.digest, preparationSource: source.preparationSource,
      preparationDigest: basket.preparationDigest, previousEstimateSource: oldSource, unchangedLineKeys: keys,
      reason: input.reason, idempotencyKey: input.idempotencyKey, requestDigest,
      reconciledById: actor.id, reconciledAt: timestamp }], { session });
    if (enquiry.latestAwardId) {
      const award = await ProcurementBasketAwardModel.findById(enquiry.latestAwardId).session(session).lean() as TenderRow | null;
      if (award && award.status === "issued") tenderConflict("PROCUREMENT_BASKET_ALREADY_ISSUED", "An issued work order cannot be reconciled.");
      if (award) {
        const changedAward = await ProcurementBasketAwardModel.updateOne({ _id: award._id, version: award.version }, {
        $set: { status: "draft", requiresRevision: true, autoIssueOnApproval: false, issueBlocker: null,
          updatedById: actor.id, updatedAt: timestamp }, $inc: { version: 1 }
      }, { session, runValidators: true, timestamps: false });
        if (changedAward.matchedCount !== 1) tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "The award changed while reconciling.");
      }
    }
    const changed = await ProcurementBasketEnquiryModel.updateOne({ _id: enquiryId, version: input.expectedVersion }, {
      $set: { status: "sent", updatedById: actor.id, updatedAt: timestamp }, $inc: { version: 1 }
    }, { session, runValidators: true, timestamps: false });
    if (changed.matchedCount !== 1) tenderConflict("PROCUREMENT_BASKET_VERSION_CONFLICT", "This enquiry changed while reconciling.");
    await audit.appendInMongoTransaction({ actorId: actor.id, action: "procurement_basket_source_reconciled",
      entityType: "procurement_basket_enquiry", entityId: enquiryId, occurredAt: timestamp.toISOString(),
      reason: input.reason, newValues: { reconciliationId: id, projectId, mainBasketId: basketId,
        boqRevisionId: boq._id, originalEstimateSource: oldSource, preparationSource: source.preparationSource,
        unchangedLineKeys: keys } }, session);
  });
}
