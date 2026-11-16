import type { ClientSession } from "mongoose";
import type { EstimationPreparationSource } from "../domain/estimation-lifecycle.js";
import { ProcurementBasketBoqRevisionModel, ProcurementBasketEnquiryModel,
  ProcurementBasketSourceReconciliationModel } from "../models/ProcurementBasketTender.js";

type ExecutionSource = { estimateId: string; estimateVersion: number; estimateReviewRoundId: string | null;
  preparationSource?: EstimationPreparationSource };

/** Reconciled enquiries retain their original estimate source and frozen BOQ. */
export async function procurementBasketExecutionLocked(projectId: string, source: ExecutionSource,
  sourceLineItemKey: string, session: ClientSession, basketId?: string): Promise<boolean> {
  const enquiries = await ProcurementBasketEnquiryModel.find({ projectId,
    ...(basketId ? { mainBasketId: basketId } : {}), status: { $in: ["award_pending", "issued"] } })
    .select({ estimateSource: 1, mainBasketId: 1, currentBoqRevisionId: 1 }).session(session).lean();
  for (const enquiry of enquiries) {
    const sameSource = enquiry.estimateSource.estimateId === source.estimateId &&
      enquiry.estimateSource.estimateVersion === source.estimateVersion &&
      enquiry.estimateSource.estimateReviewRoundId === source.estimateReviewRoundId;
    // A project rate edit has always locked the entire exact-source basket.
    if (sameSource && basketId) return true;
    if (!sameSource && source.preparationSource?.kind !== "approved_final") continue;
    if (!enquiry.currentBoqRevisionId) continue;
    const boq = await ProcurementBasketBoqRevisionModel.findOne({ _id: enquiry.currentBoqRevisionId,
      enquiryId: enquiry._id, projectId, mainBasketId: enquiry.mainBasketId,
      "lines.sourceLineItemKey": sourceLineItemKey }).select({ digest: 1 }).session(session).lean();
    if (!boq) continue;
    if (sameSource) return true;
    const proof = await ProcurementBasketSourceReconciliationModel.exists({ projectId,
      mainBasketId: enquiry.mainBasketId, enquiryId: enquiry._id, boqRevisionId: boq._id, boqDigest: boq.digest,
      "preparationSource.sourceSnapshotId": source.preparationSource!.sourceSnapshotId,
      "preparationSource.sourceDigest": source.preparationSource!.sourceDigest,
      unchangedLineKeys: sourceLineItemKey }).session(session);
    if (proof) return true;
  }
  return false;
}
