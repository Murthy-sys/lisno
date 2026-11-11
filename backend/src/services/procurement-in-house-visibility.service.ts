import type { ClientSession } from "mongoose";
import { selectCurrentMainLineRevision } from "../domain/ai-estimator-knowledge-current-revision.js";
import { isKnowledgeModeTier, knowledgeModeTierPayload, projectKnowledgeModeTierSection } from "../domain/ai-estimator-knowledge-mode-tiers.js";
import { procurementInHouseVisibility, projectProcurementModeResolution } from "../domain/procurement-in-house-visibility.js";
import type { PurchaseOrderRequestModeSnapshot } from "../domain/project-purchase-order-request.js";
import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../models/AiEstimatorKnowledgeSection.js";
import { EstimateClientReviewRoundModel } from "../models/EstimateClientReviewRound.js";

type Row = Record<string, any>;
const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : {};

/** Apply current disclosure to immutable historical request evidence without recalculating or writing it. */
export async function projectCurrentProcurementSnapshots(snapshots: readonly PurchaseOrderRequestModeSnapshot[],
  source: { estimateId: string; estimateVersion: number; estimateReviewRoundId: string | null }, session: ClientSession): Promise<PurchaseOrderRequestModeSnapshot[]> {
  const relevant = snapshots.filter(snapshot => snapshot.source === "configuration" && snapshot.mainLineId && snapshot.mode.preview?.mode === "in_house");
  if (!relevant.length) return [...snapshots];
  const mainLineIds = [...new Set(relevant.map(snapshot => snapshot.mainLineId!))];
  const mainLines = await AiEstimatorKnowledgeMainLineModel.find({ _id: { $in: mainLineIds } })
    .select({ _id: 1, status: 1, draftRevisionId: 1, activeRevisionId: 1 }).session(session).lean();
  const current = new Map(mainLines.map(line => [String(line._id), selectCurrentMainLineRevision(line)]));
  const revisionIds = [...new Set([...current.values()].flatMap(value => value ? [value.id] : []))];
  const revisions = await AiEstimatorKnowledgeRevisionModel.find({ _id: { $in: revisionIds } })
    .select({ _id: 1, mainLineId: 1, status: 1 }).session(session).lean();
  const revisionMap = new Map(revisions.map(revision => [String(revision._id), revision]));
  const sections = await AiEstimatorKnowledgeSectionModel.find({ revisionId: { $in: revisionIds }, sectionKey: { $in: ["overview", "advanced"] } })
    .select({ mainLineId: 1, revisionId: 1, sectionKey: 1, applicability: 1, payload: 1 }).session(session).lean();
  const sectionsByRevision = new Map<string, Row[]>();
  for (const section of sections) {
    const list = sectionsByRevision.get(String(section.revisionId)) ?? [];
    list.push(section); sectionsByRevision.set(String(section.revisionId), list);
  }
  // Older mode snapshots did not retain tier identity. Recover it only from their immutable source.
  const round = source.estimateReviewRoundId ? await EstimateClientReviewRoundModel.findOne({ _id: source.estimateReviewRoundId,
    estimateId: source.estimateId, estimateVersion: source.estimateVersion }).select({ "estimateSnapshot.lineItems": 1 }).session(session).lean() : null;
  const approvedLines = (round?.estimateSnapshot?.lineItems ?? []) as Row[];
  return snapshots.map(snapshot => {
    if (!relevant.includes(snapshot)) return snapshot;
    let visibility: ReturnType<typeof procurementInHouseVisibility> = { inHouseComponentVisibility: "hidden",
      inHouseComponentVisibilityIssue: { code: "IN_HOUSE_USAGE_UNAVAILABLE", message: "Current In-house use configuration is unavailable. Component details are hidden." } };
    const selected = current.get(snapshot.mainLineId!);
    const revision = selected ? revisionMap.get(selected.id) : undefined;
    const selectedSections = selected ? sectionsByRevision.get(selected.id) ?? [] : [];
    const advanced = selectedSections.find(section => section.sectionKey === "advanced");
    const overviewSection = selectedSections.find(section => section.sectionKey === "overview");
    const overview = object(overviewSection?.payload);
    const approved = approvedLines.find(line => line.id === snapshot.sourceLineItemKey && line.mainLineId === snapshot.mainLineId);
    const modeTier = snapshot.modeTier ?? (approved ? approved.modeTier ?? "signature" : undefined);
    if (selected && revision && String(revision.mainLineId) === snapshot.mainLineId && revision.status === selected.status &&
      selectedSections.length === 2 && selectedSections.every(section => String(section.mainLineId) === snapshot.mainLineId) && advanced && overviewSection) {
      const payload = object(advanced.payload);
      const applicableTiers = overview.applicableTiers === undefined ? ["signature"] : overview.applicableTiers;
      if (isKnowledgeModeTier(modeTier) && Array.isArray(applicableTiers) && applicableTiers.includes(modeTier) &&
        (modeTier === "signature" || projectKnowledgeModeTierSection(advanced, modeTier).applicability === "configured")) {
        visibility = procurementInHouseVisibility(knowledgeModeTierPayload(payload, modeTier));
      } else if (modeTier === undefined && ["signature", "premium", "functional"].every(tier =>
        !Object.hasOwn(knowledgeModeTierPayload(payload, tier as "signature" | "premium" | "functional"), "inHouseUsage") &&
        !Object.hasOwn(knowledgeModeTierPayload(payload, tier as "signature" | "premium" | "functional"), "inHousePresetComponentIds"))) {
        // No restriction exists in any possible legacy tier. Do not manufacture a tier or a price.
        visibility = {};
      }
    }
    const { inHouseComponentVisibility: _oldVisibility, inHouseComponentVisibilityIssue: _oldIssue, ...storedMode } = snapshot.mode;
    return { ...snapshot, mode: projectProcurementModeResolution({ ...storedMode, ...visibility })! };
  });
}
