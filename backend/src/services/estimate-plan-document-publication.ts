import type { PublicUser } from "./auth.service.js";
import type { PlanDocumentManifest } from "../contracts/estimate-plan-document.js";
import { hashPlanDocumentManifest } from "../domain/estimate-plan-document.js";
import { EstimateDesignPlanDocumentModel } from "../models/EstimateDesignPlanDocument.js";
import { planDocumentNotFound, requirePlanDocumentClientRound } from "./estimate-plan-document-access.js";
import { loadEstimatePlanDocumentManifest } from "./estimate-plan-document-manifest.js";

export async function loadPublishedPlanDocuments(user: PublicUser, estimateId: string, roundId?: string) {
  const round = await requirePlanDocumentClientRound(user, estimateId, roundId);
  const documents: Array<{ documentId: string | null; manifestHash: string; pageCount: number; manifest: PlanDocumentManifest }> = [];
  if (round.planDocuments?.length) {
    for (const pin of round.planDocuments) {
      const row = await EstimateDesignPlanDocumentModel.findOne({ _id: pin.documentId, estimateId, sourceUploadId: pin.sourceUploadId, manifestHash: pin.manifestHash, status: "ready" }).select("+manifest").lean();
      if (!row || hashPlanDocumentManifest(row.manifest) !== pin.manifestHash) throw planDocumentNotFound();
      documents.push({ documentId: String(row._id), manifestHash: String(row.manifestHash), pageCount: Number(row.pageCount), manifest: row.manifest });
    }
  } else {
    const snapshot = await loadEstimatePlanDocumentManifest(estimateId, { revisionIds: round.submittedRevisionIds.map(String) });
    for (const manifest of snapshot.documents) documents.push({ documentId: null, manifestHash: hashPlanDocumentManifest(manifest), pageCount: manifest.pages.length, manifest });
  }
  return { round, documents };
}
