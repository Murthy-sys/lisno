import type mongoose from "mongoose";

import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeBasketModel } from "../models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeUomModel } from "../models/AiEstimatorKnowledgeUom.js";
import { UserModel } from "../models/User.js";
import type { PublicUser } from "./auth.service.js";

export interface EstimatorCatalogueLine {
  id: string;
  mainLineId: string;
  basketId: string;
  subBasketId: string;
  name: string;
  displayOrder: number;
  revisionId: string;
  uom: { id: string; code: string; name: string; decimalScale: number };
}

export interface EstimatorCatalogueSubBasket {
  id: string;
  basketId: string;
  name: string;
  displayOrder: number;
  mainLines: EstimatorCatalogueLine[];
}

export interface EstimatorCatalogueBasket {
  id: string;
  name: string;
  displayOrder: number;
  subBaskets: EstimatorCatalogueSubBasket[];
}

const order = (left: { displayOrder: number; id: string }, right: { displayOrder: number; id: string }) =>
  left.displayOrder - right.displayOrder || left.id.localeCompare(right.id);

/** This is deliberately a narrow projection: no prices, vendor data, or mutable configuration payloads. */
export async function listEstimatorCatalogue(
  actor: PublicUser,
  pagination: { limit: number; offset: number }
) {
  if (actor.role !== "estimator_sales" && actor.role !== "super_admin") {
    throw new ApiError(403, "FORBIDDEN", "You are not authorized to read the estimator catalogue.");
  }
  const activeActor = await UserModel.exists({ _id: actor.id, role: actor.role, active: true });
  if (!activeActor) throw new ApiError(403, "FORBIDDEN", "Your account is no longer active.");
  if (actor.role === "super_admin" && await UserModel.countDocuments({ role: "super_admin", active: true }) !== 1) {
    throw new ApiError(409, "SOLE_SUPER_ADMIN_REQUIRED", "Exactly one active Super Admin is required.");
  }

  const [baskets, total] = await Promise.all([
    AiEstimatorKnowledgeBasketModel.find({ status: "active" })
      .select({ _id: 1, name: 1, displayOrder: 1 })
      .sort({ displayOrder: 1, _id: 1 })
      .skip(pagination.offset).limit(pagination.limit).lean().exec(),
    AiEstimatorKnowledgeBasketModel.countDocuments({ status: "active" }).exec()
  ]);
  const basketIds = baskets.map((basket) => String(basket._id));
  const [subBaskets, rawLines] = basketIds.length === 0 ? [[], []] : await Promise.all([
    AiEstimatorKnowledgeSubBasketModel.find({ basketId: { $in: basketIds } })
      .select({ _id: 1, basketId: 1, name: 1, displayOrder: 1 }).lean().exec(),
    AiEstimatorKnowledgeMainLineModel.find({ basketId: { $in: basketIds }, status: "active" })
      .select({ _id: 1, basketId: 1, subBasketId: 1, name: 1, displayOrder: 1, itemType: 1, activeRevisionId: 1 })
      .lean().exec()
  ]);
  const projected = await projectLines(rawLines);
  const children = new Map<string, EstimatorCatalogueSubBasket>();
  for (const subBasket of subBaskets) {
    const id = String(subBasket._id);
    children.set(id, {
      id, basketId: String(subBasket.basketId), name: String(subBasket.name),
      displayOrder: Number(subBasket.displayOrder), mainLines: []
    });
  }
  let ineligibleLineCount = 0;
  for (const rawLine of rawLines) {
    const id = String(rawLine._id);
    const child = rawLine.subBasketId ? children.get(String(rawLine.subBasketId)) : undefined;
    const line = projected.get(id);
    if (!child || !line || child.basketId !== String(rawLine.basketId)) {
      ineligibleLineCount += 1;
      continue;
    }
    child.mainLines.push(line);
  }
  for (const child of children.values()) child.mainLines.sort(order);
  const items = baskets.map((basket): EstimatorCatalogueBasket => ({
    id: String(basket._id), name: String(basket.name), displayOrder: Number(basket.displayOrder),
    subBaskets: [...children.values()].filter((child) => child.basketId === String(basket._id)).sort(order)
  }));
  return {
    items,
    pagination: { ...pagination, total, hasMore: pagination.offset + items.length < total },
    ineligibleLineCount
  };
}

/** Resolve only newly selected rows in the save transaction; saved snapshots never re-resolve. */
export async function resolveEstimatorCatalogueLines(
  mainLineIds: readonly string[],
  session: mongoose.ClientSession
): Promise<Map<string, { line: EstimatorCatalogueLine; mainBasketName: string; subBasketName: string }>> {
  if (mainLineIds.length === 0) return new Map();
  const rawLines = await AiEstimatorKnowledgeMainLineModel.find({
    _id: { $in: [...new Set(mainLineIds)] }, status: "active", itemType: { $ne: "temporary" }, subBasketId: { $ne: null }
  }).select({ _id: 1, basketId: 1, subBasketId: 1, name: 1, displayOrder: 1, itemType: 1, activeRevisionId: 1 })
    .session(session).lean().exec();
  const basketIds = [...new Set(rawLines.map((line) => String(line.basketId)))];
  const subBasketIds = [...new Set(rawLines.map((line) => String(line.subBasketId)))];
  const baskets = await AiEstimatorKnowledgeBasketModel.find({ _id: { $in: basketIds }, status: "active" })
    .select({ _id: 1, name: 1 }).session(session).lean().exec();
  const subBaskets = await AiEstimatorKnowledgeSubBasketModel.find({ _id: { $in: subBasketIds } })
    .select({ _id: 1, basketId: 1, name: 1 }).session(session).lean().exec();
  const lines = await projectLines(rawLines, session);
  const basketById = new Map(baskets.map((basket) => [String(basket._id), String(basket.name)]));
  const subBasketById = new Map(subBaskets.map((subBasket) => [String(subBasket._id), subBasket]));
  const resolved = new Map<string, { line: EstimatorCatalogueLine; mainBasketName: string; subBasketName: string }>();
  for (const [id, line] of lines) {
    const mainBasketName = basketById.get(line.basketId);
    const child = subBasketById.get(line.subBasketId);
    if (!mainBasketName || !child || String(child.basketId) !== line.basketId) continue;
    resolved.set(id, { line, mainBasketName, subBasketName: String(child.name) });
  }
  return resolved;
}

async function projectLines(
  rawLines: readonly {
    _id: unknown; basketId: unknown; subBasketId?: unknown; name: unknown;
    displayOrder: unknown; itemType?: unknown; activeRevisionId?: unknown;
  }[],
  session?: mongoose.ClientSession
): Promise<Map<string, EstimatorCatalogueLine>> {
  const candidates = rawLines.filter((line) =>
    line.itemType !== "temporary" && Boolean(line.subBasketId) && Boolean(line.activeRevisionId));
  if (candidates.length === 0) return new Map();
  const revisionIds = [...new Set(candidates.map((line) => String(line.activeRevisionId)))];
  const revisionQuery = AiEstimatorKnowledgeRevisionModel.find({ _id: { $in: revisionIds }, status: "active" })
    .select({ _id: 1, mainLineId: 1 });
  const overviewQuery = AiEstimatorKnowledgeSectionModel.find({
    revisionId: { $in: revisionIds }, sectionKey: "overview"
  }).select({ revisionId: 1, mainLineId: 1, payload: 1 });
  if (session) { revisionQuery.session(session); overviewQuery.session(session); }
  const revisions = await revisionQuery.lean().exec();
  const overviews = await overviewQuery.lean().exec();
  const revisionById = new Map(revisions.map((revision) => [String(revision._id), String(revision.mainLineId)]));
  const uomIdByRevision = new Map<string, string>();
  for (const overview of overviews) {
    const revisionId = String(overview.revisionId);
    const payload = overview.payload as Record<string, unknown> | null;
    if (revisionById.get(revisionId) !== String(overview.mainLineId) ||
        typeof payload?.uomId !== "string" || !payload.uomId) continue;
    uomIdByRevision.set(revisionId, payload.uomId);
  }
  const uomQuery = AiEstimatorKnowledgeUomModel.find({
    _id: { $in: [...new Set(uomIdByRevision.values())] }, status: { $in: ["active", "inactive"] }
  }).select({ _id: 1, code: 1, name: 1, decimalScale: 1 });
  if (session) uomQuery.session(session);
  const uoms = await uomQuery.lean().exec();
  const uomById = new Map(uoms.map((uom) => [String(uom._id), uom]));
  const projected = new Map<string, EstimatorCatalogueLine>();
  for (const raw of candidates) {
    const id = String(raw._id);
    const revisionId = String(raw.activeRevisionId);
    const uomId = uomIdByRevision.get(revisionId);
    const uom = uomId ? uomById.get(uomId) : undefined;
    if (revisionById.get(revisionId) !== id || !uom) continue;
    projected.set(id, {
      id, mainLineId: id, basketId: String(raw.basketId), subBasketId: String(raw.subBasketId),
      name: String(raw.name), displayOrder: Number(raw.displayOrder), revisionId,
      uom: { id: uomId!, code: String(uom.code), name: String(uom.name), decimalScale: Number(uom.decimalScale) }
    });
  }
  return projected;
}
