import { presentEstimateInHouseResponse } from "./estimate-in-house-presentation.js";
import { sha256Hex, type EstimateClientReviewSnapshot, type StoredDownload } from "../domain/estimate-client-review.js";
import { ApiError } from "../middleware/errors.js";
import { ClientQuotationRenditionModel } from "../models/ClientQuotationRendition.js";
import type { EstimateClientReviewStorage, StoredEstimatePdfSnapshot } from "./estimate-client-review-storage.js";
import type { EstimatePdfService } from "./estimate-pdf.service.js";
import { CLIENT_QUOTATION_RENDITION_POLICY_VERSION, type ClientQuotationProjectionService } from "./client-quotation-projection.service.js";

export interface ClientQuotationRenditionRound {
  _id?: string;
  id?: string;
  estimateId: string;
  estimateVersion: number;
  recipientEmail: string;
  estimateSnapshot: EstimateClientReviewSnapshot;
}

export interface ClientQuotationRenditionService {
  /** Call only after authorization or acquisition of the existing delivery lease. */
  readForRound(round: ClientQuotationRenditionRound): Promise<StoredDownload>;
}

export function createClientQuotationRenditionService(input: {
  projection: ClientQuotationProjectionService;
  pdf: EstimatePdfService;
  storage: EstimateClientReviewStorage;
  now?: () => Date;
}): ClientQuotationRenditionService {
  return {
    async readForRound(round) {
      const reviewRoundId = round._id ?? round.id;
      if (!reviewRoundId || !round.estimateId || !Number.isSafeInteger(round.estimateVersion) || round.estimateVersion < 1) unavailable();
      const projectForRecipient = async () => {
        const visible = await input.projection.project(round.estimateSnapshot);
        const snapshot = await presentEstimateInHouseResponse(visible.snapshot);
        const visibilityDigest = JSON.stringify(snapshot) === JSON.stringify(visible.snapshot) ? visible.visibilityDigest
          : sha256Hex(JSON.stringify({ visibilityDigest: visible.visibilityDigest, snapshot }));
        return { ...visible, snapshot, visibilityDigest };
      };
      const projected = await projectForRecipient();
      const sourceDigest = sha256Hex(JSON.stringify(round.estimateSnapshot));
      const approvedTotalPaise = projected.snapshot.totalPaise ?? Math.round(projected.snapshot.total * 100);
      if (!Number.isSafeInteger(approvedTotalPaise) || approvedTotalPaise < 0) unavailable();
      const identity = { reviewRoundId, visibilityDigest: projected.visibilityDigest, policyVersion: CLIENT_QUOTATION_RENDITION_POLICY_VERSION };
      let row = await ClientQuotationRenditionModel.findOne(identity).select("+storageReference").lean();
      if (!row) {
        const snapshot = projected.snapshot;
        const generated = await input.pdf.generate({
          ...snapshot, id: round.estimateId, version: round.estimateVersion, status: "sent_to_client",
          lineItems: [...snapshot.lineItems],
          lead: { clientName: snapshot.clientName, clientEmail: round.recipientEmail,
            projectName: snapshot.projectName, location: snapshot.location }
        }, { profile: "compact_client_delivery" });
        let stored: StoredEstimatePdfSnapshot | undefined;
        try {
          stored = await input.storage.savePdfSnapshot(generated);
          const [created] = await ClientQuotationRenditionModel.create([{
            _id: `quotation-rendition-${sha256Hex(JSON.stringify(identity))}`, ...identity, estimateId: round.estimateId,
            estimateVersion: round.estimateVersion, sourceDigest, approvedTotalPaise,
            ...stored, createdAt: input.now?.() ?? new Date()
          }]);
          row = created.toObject();
        } catch (error) {
          // An acknowledged-error response may follow a committed insert. Never delete its live blob.
          row = await ClientQuotationRenditionModel.findOne(identity).select("+storageReference").lean();
          if (stored && row?.storageReference !== stored.storageReference) await input.storage.deleteQuietly(stored.storageReference);
          if (!row) throw error;
        }
      }
      if (!row || row.sourceDigest !== sourceDigest || row.estimateId !== round.estimateId ||
        row.estimateVersion !== round.estimateVersion || row.approvedTotalPaise !== approvedTotalPaise ||
        typeof row.storageReference !== "string") unavailable();
      let bytes: Buffer;
      try { bytes = await input.storage.read(row.storageReference); }
      catch { unavailable(); }
      if (bytes.byteLength !== row.byteSize || sha256Hex(bytes) !== row.sha256) unavailable();
      // A cached artifact never outlives the Configuration visibility from which it was rendered.
      const current = await projectForRecipient();
      if (current.visibilityDigest !== projected.visibilityDigest) {
        throw new ApiError(409, "QUOTATION_VISIBILITY_CHANGED", "Quotation visibility changed. Refresh before downloading or sending it.");
      }
      return { filename: row.filename, mimeType: "application/pdf", bytes };
    }
  };
}

function unavailable(): never {
  throw new ApiError(409, "QUOTATION_RENDITION_UNAVAILABLE", "The client quotation document is unavailable. Please retry later.");
}
