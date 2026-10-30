import { createHash } from "node:crypto";
import type { ClientSession } from "mongoose";
import type { PMApprovedSourceRef, PMMainLineScope } from "../../contracts/project-manager-estimates.js";
import { ApiError } from "../../middleware/errors.js";
import { EstimateModel } from "../../models/Estimate.js";
import { EstimateClientReviewRoundModel } from "../../models/EstimateClientReviewRound.js";
import { AiEstimatorKnowledgeMainLineModel } from "../../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeBasketModel } from "../../models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../../models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeUomModel } from "../../models/AiEstimatorKnowledgeUom.js";
import { approvedProcurementSnapshotFromRows, type ApprovedProcurementSnapshot } from "../procurement.service.js";
import { fenceCollaborativeEstimate } from "../estimate-collaboration-policy.service.js";
import { resolveEstimatorCatalogueLines } from "../estimator-catalogue.service.js";
import type { PMRow } from "./common.js";

export interface PMApprovedSourceRead {
  estimate: PMRow | null;
  round: PMRow | null;
  snapshot: ApprovedProcurementSnapshot | null;
  source: PMApprovedSourceRef | null;
  issues: string[];
}

/** Internal approved commercial source. Never serialize the estimate or round documents. */
export async function readPMApprovedSource(projectId: string, session: ClientSession,
  options: { forWrite?: boolean } = {}): Promise<PMApprovedSourceRead> {
  if (options.forWrite && !session.inTransaction()) throw new Error("PM approved-source writes require a transaction.");
  const estimates = await EstimateModel.find({ projectId }).limit(2).session(session).lean();
  const result: PMApprovedSourceRead = { estimate: null, round: null, snapshot: null, source: null, issues: [] };
  if (estimates.length !== 1) {
    result.issues.push(estimates.length ? "The approved estimate source is ambiguous." : "No approved estimate is available yet.");
    return result;
  }
  const estimate = estimates[0]!;
  result.estimate = estimate;
  const rounds = await EstimateClientReviewRoundModel.find({ estimateId: estimate._id,
    status: "approved", decision: "approve" }).session(session).lean();
  try { result.snapshot = approvedProcurementSnapshotFromRows(estimate, rounds); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status >= 500) throw error;
    result.issues.push("The client-approved estimate source is not available. Reconcile approval lineage before measuring progress.");
    return result;
  }
  if (!result.snapshot.estimateReviewRoundId) {
    result.issues.push("An immutable approved estimate snapshot is required to measure execution value.");
    result.snapshot = null;
    return result;
  }
  result.round = rounds.find(round => String(round._id) === result.snapshot!.estimateReviewRoundId) ?? null;
  if (!result.round) {
    result.snapshot = null;
    result.issues.push("The immutable approved estimate snapshot is unavailable.");
    return result;
  }
  const snapshot = result.snapshot;
  result.source = { estimateId: snapshot.estimateId, estimateVersion: snapshot.estimateVersion,
    estimateReviewRoundId: snapshot.estimateReviewRoundId!, designPlanVersion: snapshot.designPlanVersion,
    phase: snapshot.preparationSource?.phase ?? "legacy",
    sourceSnapshotId: snapshot.preparationSource?.sourceSnapshotId ?? null,
    sourceDigest: snapshot.preparationSource?.sourceDigest ?? null };
  if (options.forWrite) {
    await fenceCollaborativeEstimate(estimate, session);
    const fenced = await EstimateModel.updateOne({ _id: estimate._id, projectId,
      version: estimate.version }, { $inc: { procurementSourceEpoch: 1 } },
    { session, timestamps: false, runValidators: true });
    if (fenced.matchedCount !== 1) sourceConflict();
  }
  return result;
}

export function pmApprovedSourcesEqual(left: PMApprovedSourceRef | null, right: PMApprovedSourceRef | null): boolean {
  return !!left && !!right && left.estimateId === right.estimateId && left.estimateVersion === right.estimateVersion &&
    left.estimateReviewRoundId === right.estimateReviewRoundId && left.designPlanVersion === right.designPlanVersion &&
    left.phase === right.phase && left.sourceSnapshotId === right.sourceSnapshotId && left.sourceDigest === right.sourceDigest;
}

export function requirePMApprovedSource(read: PMApprovedSourceRead, expected: PMApprovedSourceRef): PMApprovedSourceRef {
  if (!read.source || !pmApprovedSourcesEqual(read.source, expected)) sourceConflict();
  return read.source;
}

/** Group frozen occurrences by identity, never by room/name or basket membership alone. */
export function pmApprovedMainLineScopes(read: PMApprovedSourceRead): PMMainLineScope[] {
  if (!read.snapshot || !read.source) return [];
  const groups = new Map<string, typeof read.snapshot.allLineItems>();
  for (const line of read.snapshot.allLineItems) {
    if (!line.included || line.source !== "configuration" || !line.mainLineId) continue;
    const group = groups.get(line.mainLineId) ?? [];
    group.push(line); groups.set(line.mainLineId, group);
  }
  return [...groups].map(([mainLineId, lines]) => {
    // Older Configuration approvals predate itemType and represent regular Main Lines.
    const itemTypes = [...new Set(lines.map(line => line.itemType ?? "main_line"))];
    const itemType = itemTypes.length === 1 ? itemTypes[0]! : undefined;
    const baskets = [...new Set(lines.map(line => line.mainBasketId ?? null))];
    const mainBasketId = baskets.length === 1 ? baskets[0]! : null;
    const occurrences = lines.map(line => ({ sourceLineItemKey: line.key, sectionId: line.sectionId,
      roomId: line.roomId ?? null, roomName: line.roomName })).sort((a, b) => a.sourceLineItemKey.localeCompare(b.sourceLineItemKey));
    const uniqueKeys = new Set(occurrences.map(line => line.sourceLineItemKey));
    const reason = !itemType ? "The approved scope has conflicting item types." :
      !mainBasketId ? "This Main Line needs a verified Main Basket mapping." :
      uniqueKeys.size !== occurrences.length ? "The approved Main Line scope has ambiguous item identities." : null;
    return { mainLineId, ...(itemType ? { itemType } : {}), mainLineName: lines[0]!.mainLineName || "Main Line", mainBasketId,
      mainBasketName: mainBasketId ? lines[0]!.mainBasketName ?? null : null, occurrences,
      // Keep established regular-scope digests stable; temporary scopes are newly supported.
      scopeDigest: createHash("sha256").update(JSON.stringify({ source: read.source, mainLineId, mainBasketId, occurrences,
        ...(itemType === "temporary" ? { itemType } : {}) })).digest("hex"),
      canSuggest: reason === null, unavailableReason: reason };
  });
}

/** Current Configuration is used for identity/readiness; frozen commercial rows are never repriced. */
export async function readPMMainLineScopes(read: PMApprovedSourceRead, session: ClientSession): Promise<PMMainLineScope[]> {
  const scopes = pmApprovedMainLineScopes(read);
  const current = await resolveEstimatorCatalogueLines(scopes.map(scope => scope.mainLineId), session);
  return scopes.map(scope => {
    const resolved = current.get(scope.mainLineId);
    const lines = read.snapshot!.allLineItems.filter(line => line.included && line.mainLineId === scope.mainLineId);
    const reason = scope.unavailableReason ?? (!resolved ? "Current Main Line Configuration is unavailable. Reconcile Configuration before suggesting a vendor." :
      resolved.line.itemType !== scope.itemType || resolved.line.basketId !== scope.mainBasketId ||
        lines.some(line => (line.subBasketId ?? null) !== resolved.line.subBasketId)
        ? "Current Main Line mapping differs from the approved scope." :
      lines.some(line => (line.uomId ? line.uomId !== resolved.line.uom.id : line.unit !== resolved.line.uom.code) ||
        line.uomCode !== undefined && line.uomCode !== resolved.line.uom.code ||
        line.uomDecimalScale !== undefined && line.uomDecimalScale !== resolved.line.uom.decimalScale)
        ? "Current Main Line UOM differs from the approved scope." : null);
    return { ...scope, mainLineName: resolved?.line.name ?? scope.mainLineName,
      mainBasketName: resolved?.mainBasketName ?? scope.mainBasketName, canSuggest: reason === null, unavailableReason: reason };
  });
}

export async function requirePMMainLineScope(read: PMApprovedSourceRead, mainLineId: string, session: ClientSession,
  options: { forWrite?: boolean } = {}): Promise<PMMainLineScope> {
  const scope = (await readPMMainLineScopes(read, session)).find(line => line.mainLineId === mainLineId);
  if (!scope || !scope.canSuggest) throw new ApiError(409, "PM_MAIN_LINE_UNAVAILABLE",
    scope?.unavailableReason ?? "Choose an included Main Line with a verified approved scope.");
  if (options.forWrite) {
    if (!session.inTransaction()) throw new Error("Main Line scope writes require a transaction.");
    const current = (await resolveEstimatorCatalogueLines([mainLineId], session)).get(mainLineId);
    if (!current) sourceConflict();
    // Section saves and revision activation both write this aggregate/version. The
    // existing dependency epoch also coordinates reference deletion/status changes.
    const locked = await AiEstimatorKnowledgeMainLineModel.updateOne({ _id: mainLineId,
      basketId: current.line.basketId, version: current.line.itemVersion,
      [current.line.revisionStatus === "draft" ? "draftRevisionId" : "activeRevisionId"]: current.line.revisionId },
    { $inc: { dependencyEpoch: 1 } }, { session, timestamps: false });
    const basket = await AiEstimatorKnowledgeBasketModel.updateOne({ _id: current.line.basketId, status: "active" },
      { $inc: { dependencyEpoch: 1 } }, { session, timestamps: false });
    const uom = await AiEstimatorKnowledgeUomModel.updateOne({ _id: current.line.uom.id,
      code: current.line.uom.code, decimalScale: current.line.uom.decimalScale, status: { $in: ["active", "inactive"] } },
    { $inc: { dependencyEpoch: 1 } }, { session, timestamps: false });
    const subBasket = current.line.subBasketId ? await AiEstimatorKnowledgeSubBasketModel.updateOne({
      _id: current.line.subBasketId, basketId: current.line.basketId }, { $inc: { dependencyEpoch: 1 } },
    { session, timestamps: false }) : null;
    if (locked.matchedCount !== 1 || basket.matchedCount !== 1 || uom.matchedCount !== 1 || subBasket?.matchedCount === 0) sourceConflict();
  }
  return scope;
}

function sourceConflict(): never {
  throw new ApiError(409, "PM_ESTIMATE_SOURCE_CHANGED", "The approved estimate changed or is unavailable. Refresh and review the current source before saving.");
}
