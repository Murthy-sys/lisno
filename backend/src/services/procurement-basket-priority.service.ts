import type { ClientSession } from "mongoose";
import { selectCurrentMainLineRevision } from "../domain/ai-estimator-knowledge-current-revision.js";
import { resolveProcurementPriority, type ProcurementPriorityResolution } from "../domain/procurement-basket-priority-groups.js";
import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../models/AiEstimatorKnowledgeSection.js";

/** Called only after project authorization, using its existing snapshot transaction. */
export async function readProcurementPriorities(mainLineIds: readonly string[], session: ClientSession): Promise<Map<string, ProcurementPriorityResolution>> {
  if (!session.inTransaction()) throw new Error("Procurement priority reads require an active transaction.");
  const ids = [...new Set(mainLineIds)];
  if (ids.length === 0) return new Map();
  // Queries are batched, and intentionally sequential on one Mongo session.
  const lines = await AiEstimatorKnowledgeMainLineModel.find({ _id: { $in: ids } })
    .select({ _id: 1, status: 1, draftRevisionId: 1, activeRevisionId: 1 }).session(session).lean();
  const selected = new Map(lines.map(line => [String(line._id), selectCurrentMainLineRevision(line)]));
  const revisionIds = [...new Set([...selected.values()].flatMap(revision => revision ? [revision.id] : []))];
  const revisions = revisionIds.length ? await AiEstimatorKnowledgeRevisionModel.find({ _id: { $in: revisionIds } })
    .select({ _id: 1, mainLineId: 1, status: 1, version: 1 }).session(session).lean() : [];
  const overviews = revisionIds.length ? await AiEstimatorKnowledgeSectionModel.find({ revisionId: { $in: revisionIds }, sectionKey: "overview" })
    .select({ mainLineId: 1, revisionId: 1, sectionKey: 1, payload: 1 }).session(session).lean() : [];
  const revisionsById = new Map(revisions.map(revision => [String(revision._id), revision]));
  const overviewsByRevision = new Map(overviews.map(section => [String(section.revisionId), section]));
  return new Map(ids.map(id => {
    const current = selected.get(id) ?? null;
    return [id, resolveProcurementPriority(id, current, current ? revisionsById.get(current.id) : null,
      current ? overviewsByRevision.get(current.id) : null)];
  }));
}
