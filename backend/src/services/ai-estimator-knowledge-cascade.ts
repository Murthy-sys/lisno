import type { ClientSession } from "mongoose";

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

/* The three payload arrays that can point at a Basket or a Main Line. */
const RELATIONSHIP_FIELDS = ["exclusions", "dependencies", "recommendations"] as const;

export interface DeletionTargets {
  readonly basketIds: ReadonlySet<string>;
  readonly mainLineIds: ReadonlySet<string>;
}

const pointsAtDeletedTarget = (row: unknown, targets: DeletionTargets) => {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  const relation = row as Row;
  const basketId = relation.targetBasketId;
  const mainLineId = relation.targetMainLineId;
  return (typeof basketId === "string" && targets.basketIds.has(basketId))
    || (typeof mainLineId === "string" && targets.mainLineIds.has(mainLineId));
};

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
  if (targets.basketIds.size === 0 && targets.mainLineIds.size === 0) return 0;
  const sections = await AiEstimatorKnowledgeSectionModel.find(survivingFilter)
    .select({ payload: 1 })
    .session(session)
    .lean()
    .exec() as Row[];

  let stripped = 0;
  for (const section of sections) {
    const payload = section.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    const row = payload as Row;
    const next: Row = { ...row };
    let changed = false;
    for (const field of RELATIONSHIP_FIELDS) {
      const value = row[field];
      if (!Array.isArray(value)) continue;
      const kept = value.filter((candidate) => !pointsAtDeletedTarget(candidate, targets));
      if (kept.length === value.length) continue;
      stripped += value.length - kept.length;
      next[field] = kept;
      changed = true;
    }
    if (!changed) continue;
    await AiEstimatorKnowledgeSectionModel.updateOne(
      { _id: section._id },
      { $set: { payload: next } }
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
