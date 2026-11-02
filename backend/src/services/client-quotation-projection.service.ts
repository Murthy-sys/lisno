import type mongoose from "mongoose";
import { sha256Hex, type EstimateClientReviewSnapshot } from "../domain/estimate-client-review.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeSectionModel } from "../models/AiEstimatorKnowledgeSection.js";
import { parseClientQuotationSource } from "./estimate-client-presentation.js";
import { resolveEstimatorCatalogueLines } from "./estimator-catalogue.service.js";

export const CLIENT_QUOTATION_RENDITION_POLICY_VERSION = 1;

export interface ClientVisibilityDependency {
  mainLineId: string;
  revisionId: string | null;
  itemVersion: number | null;
  revisionVersion: number | null;
  visible: boolean;
  available: boolean;
}

export interface ClientQuotationProjection {
  snapshot: EstimateClientReviewSnapshot;
  visibilityDigest: string;
  dependencies: ClientVisibilityDependency[];
}

export interface ClientQuotationProjectionService {
  project(snapshot: unknown, session?: mongoose.ClientSession): Promise<ClientQuotationProjection>;
}

type Resolve = typeof resolveEstimatorCatalogueLines;
type Overview = { mainLineId: string; revisionId: string; payload: unknown };

/** Current Configuration governs disclosure; approved prices and source snapshots never change. */
export function createClientQuotationProjectionService(input: {
  resolve?: Resolve;
  readOverviews?: (revisionIds: string[], session?: mongoose.ClientSession) => Promise<Overview[]>;
} = {}): ClientQuotationProjectionService {
  const resolve = input.resolve ?? resolveEstimatorCatalogueLines;
  const readOverviews = input.readOverviews ?? (async (revisionIds, session) => {
    const query = AiEstimatorKnowledgeSectionModel.find({ revisionId: { $in: revisionIds }, sectionKey: "overview" })
      .select({ mainLineId: 1, revisionId: 1, payload: 1 });
    if (session) query.session(session);
    return (await query.lean().exec()).map(row => ({ mainLineId: String(row.mainLineId), revisionId: String(row.revisionId), payload: row.payload }));
  });
  return {
    async project(value, session) {
      const source = parseClientQuotationSource(value);
      if (!source) throw new ApiError(409, "QUOTATION_SOURCE_UNAVAILABLE", "The approved quotation source is unavailable.");
      const ids = [...new Set(source.lineItems.filter(line => line.source === "configuration").map(line => line.mainLineId!))].sort();
      const resolved = await resolve(ids, session);
      const revisions = [...new Set([...resolved.values()].map(row => row.line.revisionId))];
      const overviews = revisions.length ? await readOverviews(revisions, session) : [];
      const dependencies: ClientVisibilityDependency[] = ids.map(mainLineId => {
        const current = resolved.get(mainLineId)?.line;
        if (!current) return { mainLineId, revisionId: null, itemVersion: null, revisionVersion: null, visible: false, available: false };
        const matching = overviews.filter(row => row.mainLineId === mainLineId && row.revisionId === current.revisionId);
        const payload = matching.length === 1 ? matching[0].payload : null;
        if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
          (Object.hasOwn(payload, "clientVisible") && typeof (payload as Record<string, unknown>).clientVisible !== "boolean")) {
          throw new ApiError(409, "QUOTATION_VISIBILITY_UNAVAILABLE", "Quotation visibility could not be verified. Refresh after Configuration is corrected.");
        }
        const visible = (payload as Record<string, unknown>).clientVisible !== false;
        if (current.clientVisible !== visible) throw new ApiError(409, "QUOTATION_VISIBILITY_CHANGED", "Quotation visibility changed. Refresh before continuing.");
        return { mainLineId, revisionId: current.revisionId, itemVersion: current.itemVersion,
          revisionVersion: current.revisionVersion, visible, available: true };
      });
      const visible = new Set(dependencies.filter(row => row.available && row.visible).map(row => row.mainLineId));
      const lineItems = source.lineItems.filter(line => line.clientVisible !== false &&
        (line.source !== "configuration" || visible.has(line.mainLineId!))).map(line => line.source === "configuration"
          ? { ...line, classification: line.classification ?? "standard" as const } : { ...line });
      const baskets = new Set(lineItems.flatMap(line => line.mainBasketId ? [line.mainBasketId] : []));
      const selectedMainBasketIds = source.selectedMainBasketIds?.filter(id => baskets.has(id));
      const snapshot: EstimateClientReviewSnapshot = {
        ...source, lineItems,
        ...(selectedMainBasketIds ? { selectedMainBasketIds,
          selectedMainBasketClassifications: selectedMainBasketIds.map(mainBasketId => ({ mainBasketId,
            classification: source.selectedMainBasketClassifications?.find(row => row.mainBasketId === mainBasketId)?.classification ?? "standard" })) } : {})
      };
      return { snapshot, dependencies, visibilityDigest: sha256Hex(JSON.stringify({
        policyVersion: CLIENT_QUOTATION_RENDITION_POLICY_VERSION, source, dependencies
      })) };
    }
  };
}
