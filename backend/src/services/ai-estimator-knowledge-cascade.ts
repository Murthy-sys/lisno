import type { ClientSession } from "mongoose";

import { ApiError } from "../middleware/errors.js";

import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgePriceVersionModel } from "../models/AiEstimatorKnowledgePriceVersion.js";
import { AiEstimatorKnowledgeRevisionModel } from "../models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../models/AiEstimatorKnowledgeSection.js";

/*
 * Deleting knowledge is permanent, so it has to leave the collections it
 * touches consistent on its own — there is no archived row left behind to
 * absorb a half-finished cascade. Both callers run these inside their own
 * transaction.
 */

type Row = Record<string, unknown>;

/* The payload arrays that can point at a Basket or a Main Line. */
const RELATIONSHIP_FIELDS = ["exclusions", "dependencies", "recommendations", "budgetAlterations"] as const;

export interface DeletionTargets {
  readonly basketIds: ReadonlySet<string>;
  readonly mainLineIds: ReadonlySet<string>;
  readonly subBasketIds?: ReadonlySet<string>;
}

const pointsAtDeletedTarget = (row: unknown, targets: DeletionTargets) => {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const relation = row as Row;
  const basketId = relation.targetBasketId;
  const mainLineId = relation.targetMainLineId;
  return (typeof basketId === "string" && targets.basketIds.has(basketId))
    || (typeof mainLineId === "string" && targets.mainLineIds.has(mainLineId))
    || (typeof relation.targetSubBasketId === "string" && targets.subBasketIds?.has(relation.targetSubBasketId) === true);
};

export function deletedTargetReferences(payload: unknown, targets: DeletionTargets): Row[] {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return [];
  const source = payload as Row;
  return RELATIONSHIP_FIELDS.flatMap((field) => {
    const value = source[field];
    const rows = Array.isArray(value) ? value : value == null ? [] : [value];
    return rows.filter((row) => pointsAtDeletedTarget(row, targets))
      .map((row, index) => ({ field, index, relation: row }));
  });
}

/**
 * Drops every exclusion, dependency and recommendation in the surviving
 * configurations that points at something being deleted.
 *
 * Without this a deletion would leave other people's sections holding stable
 * IDs for rows that no longer exist, which the context service would then try
 * to resolve at estimate time. Sections belonging to the deleted Main Lines
 * are not visited: they are removed wholesale by the caller.
 */
export async function stripReferencesToDeleted(
  targets: DeletionTargets,
  survivingFilter: Record<string, unknown>,
  session: ClientSession
): Promise<number> {
  if (targets.basketIds.size === 0 && targets.mainLineIds.size === 0 && !targets.subBasketIds?.size) return 0;
  const sections = await AiEstimatorKnowledgeSectionModel.find(survivingFilter)
    .select({ payload: 1, mainLineId: 1, revisionId: 1, version: 1 })
    .session(session)
    .lean()
    .exec() as Row[];

  let stripped = 0;
  const changedMainLineIds = new Set<string>();
  const changedRevisionIds = new Set<string>();
  for (const section of sections) {
    const payload = section.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    const row = payload as Row;
    const next: Row = { ...row };
    let changed = false;
    for (const field of RELATIONSHIP_FIELDS) {
      const value = row[field];
      const candidates = Array.isArray(value) ? value : value == null ? [] : [value];
      const kept = candidates.filter((candidate) => !pointsAtDeletedTarget(candidate, targets));
      if (kept.length === candidates.length) continue;
      stripped += candidates.length - kept.length;
      next[field] = kept;
      changed = true;
    }
    if (!changed) continue;
    const updated = await AiEstimatorKnowledgeSectionModel.updateOne(
      { _id: section._id, version: section.version },
      { $set: { payload: next }, $inc: { version: 1 } }
    ).session(session).exec();
    if (updated.modifiedCount !== 1) {
      throw new ApiError(409, "VERSION_CONFLICT", "An affected knowledge section changed elsewhere.");
    }
    changedMainLineIds.add(String(section.mainLineId));
    changedRevisionIds.add(String(section.revisionId));
  }
  // Source editors carry both section and aggregate versions. Advance both so
  // an open draft cannot save its old payload and resurrect a removed target.
  if (changedMainLineIds.size) {
    await AiEstimatorKnowledgeMainLineModel.updateMany(
      { _id: { $in: [...changedMainLineIds] } },
      { $inc: { version: 1 } }
    ).session(session).exec();
    await AiEstimatorKnowledgeRevisionModel.updateMany(
      { _id: { $in: [...changedRevisionIds] }, status: "draft" },
      { $inc: { version: 1 } }
    ).session(session).exec();
  }
  return stripped;
}

/**
 * Removes Main Lines and everything they own. A Main Line is the root of its
 * own revision history, so nothing below it can outlive it.
 */
export async function cascadeDeleteMainLines(
  mainLineIds: readonly string[],
  session: ClientSession
): Promise<{ revisions: number; sections: number; priceVersions: number }> {
  if (mainLineIds.length === 0) return { revisions: 0, sections: 0, priceVersions: 0 };
  const filter = { mainLineId: { $in: mainLineIds } };
  const [revisions, sections, priceVersions] = await Promise.all([
    AiEstimatorKnowledgeRevisionModel.deleteMany(filter).session(session).exec(),
    AiEstimatorKnowledgeSectionModel.deleteMany(filter).session(session).exec(),
    AiEstimatorKnowledgePriceVersionModel.deleteMany(filter).session(session).exec()
  ]);
  await AiEstimatorKnowledgeMainLineModel.deleteMany({ _id: { $in: mainLineIds } })
    .session(session)
    .exec();
  return {
    revisions: revisions.deletedCount ?? 0,
    sections: sections.deletedCount ?? 0,
    priceVersions: priceVersions.deletedCount ?? 0
  };
}
