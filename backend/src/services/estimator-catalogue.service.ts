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
  subBasketId: string | null;
  itemType: "main_line" | "temporary";
  name: string;
  displayOrder: number;
  revisionId: string;
  itemStatus: "draft" | "active" | "inactive";
  revisionStatus: "draft" | "active";
  itemVersion: number;
  revisionVersion: number;
  inHouseBaseRatePaise: number | null;
  uom: { id: string; code: string; name: string; decimalScale: number };
}

export interface EstimatorCatalogueSubBasket {
  id: string;
  basketId: string;
  name: string;
  displayOrder: number;
  mainLines: EstimatorCatalogueLine[];
  temporaryItems: EstimatorCatalogueLine[];
}

export interface EstimatorCatalogueBasket {
  id: string;
  name: string;
  displayOrder: number;
  subBaskets: EstimatorCatalogueSubBasket[];
  directTemporaryItems: EstimatorCatalogueLine[];
}

type ResolvedEstimatorCatalogueLine = {
  line: EstimatorCatalogueLine;
  mainBasketName: string;
  subBasketName: string | null;
};

const order = (left: { displayOrder: number; id: string }, right: { displayOrder: number; id: string }) =>
  left.displayOrder - right.displayOrder || left.id.localeCompare(right.id);

/** Only the combined in-house base rate is projected; source cost details stay in Configuration. */
export async function listEstimatorCatalogue(
  actor: PublicUser,
  pagination: { limit: number; offset: number },
  includeReadyNonActive = false
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
    AiEstimatorKnowledgeMainLineModel.find({
      basketId: { $in: basketIds },
      status: includeReadyNonActive ? { $in: ["active", "draft", "inactive"] } : "active"
    })
      .select({ _id: 1, basketId: 1, subBasketId: 1, name: 1, displayOrder: 1, itemType: 1,
        status: 1, version: 1, activeRevisionId: 1, draftRevisionId: 1 })
      .lean().exec()
  ]);
  const projected = await projectLines(rawLines);
  const children = new Map<string, EstimatorCatalogueSubBasket>();
  for (const subBasket of subBaskets) {
    const id = String(subBasket._id);
    children.set(id, {
      id, basketId: String(subBasket.basketId), name: String(subBasket.name),
      displayOrder: Number(subBasket.displayOrder), mainLines: [], temporaryItems: []
    });
  }
  const directTemporaryItems = new Map<string, EstimatorCatalogueLine[]>();
  let ineligibleLineCount = 0;
  for (const rawLine of rawLines) {
    const id = String(rawLine._id);
    const child = rawLine.subBasketId ? children.get(String(rawLine.subBasketId)) : undefined;
    const line = projected.get(id);
    if (!line || (line.subBasketId !== null && (!child || child.basketId !== line.basketId))) {
      ineligibleLineCount += 1;
      continue;
    }
    if (line.subBasketId === null) {
      const direct = directTemporaryItems.get(line.basketId) ?? [];
      direct.push(line);
      directTemporaryItems.set(line.basketId, direct);
    } else if (line.itemType === "temporary") {
      child!.temporaryItems.push(line);
    } else {
      child!.mainLines.push(line);
    }
  }
  for (const child of children.values()) {
    child.mainLines.sort(order);
    child.temporaryItems.sort(order);
  }
  const items = baskets.map((basket): EstimatorCatalogueBasket => ({
    id: String(basket._id), name: String(basket.name), displayOrder: Number(basket.displayOrder),
    subBaskets: [...children.values()].filter((child) => child.basketId === String(basket._id)).sort(order),
    directTemporaryItems: (directTemporaryItems.get(String(basket._id)) ?? []).sort(order)
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
): Promise<Map<string, ResolvedEstimatorCatalogueLine>> {
  if (mainLineIds.length === 0) return new Map();
  const rawLines = await AiEstimatorKnowledgeMainLineModel.find({
    _id: { $in: [...new Set(mainLineIds)] }, status: { $in: ["active", "draft", "inactive"] }
  }).select({ _id: 1, basketId: 1, subBasketId: 1, name: 1, displayOrder: 1, itemType: 1,
    status: 1, version: 1, activeRevisionId: 1, draftRevisionId: 1 })
    .session(session).lean().exec();
  const basketIds = [...new Set(rawLines.map((line) => String(line.basketId)))];
  const subBasketIds = [...new Set(rawLines.filter((line) => line.subBasketId).map((line) => String(line.subBasketId)))];
  const baskets = await AiEstimatorKnowledgeBasketModel.find({ _id: { $in: basketIds }, status: "active" })
    .select({ _id: 1, name: 1 }).session(session).lean().exec();
  const subBaskets = await AiEstimatorKnowledgeSubBasketModel.find({ _id: { $in: subBasketIds } })
    .select({ _id: 1, basketId: 1, name: 1 }).session(session).lean().exec();
  const lines = await projectLines(rawLines, session);
  const basketById = new Map(baskets.map((basket) => [String(basket._id), String(basket.name)]));
  const subBasketById = new Map(subBaskets.map((subBasket) => [String(subBasket._id), subBasket]));
  const resolved = new Map<string, ResolvedEstimatorCatalogueLine>();
  for (const [id, line] of lines) {
    const mainBasketName = basketById.get(line.basketId);
    if (!mainBasketName) continue;
    if (line.subBasketId === null) {
      if (line.itemType === "temporary") resolved.set(id, { line, mainBasketName, subBasketName: null });
      continue;
    }
    const child = subBasketById.get(line.subBasketId);
    if (!child || String(child.basketId) !== line.basketId) continue;
    resolved.set(id, { line, mainBasketName, subBasketName: String(child.name) });
  }
  return resolved;
}

async function projectLines(
  rawLines: readonly {
    _id: unknown; basketId: unknown; subBasketId?: unknown; name: unknown;
    displayOrder: unknown; itemType?: unknown; status?: unknown; version?: unknown;
    activeRevisionId?: unknown; draftRevisionId?: unknown;
  }[],
  session?: mongoose.ClientSession
): Promise<Map<string, EstimatorCatalogueLine>> {
  const candidates = rawLines.filter((line) => {
    if (!sourceRevisionFor(line) || !Number.isSafeInteger(line.version) || Number(line.version) < 1) return false;
    const realSubBasket = typeof line.subBasketId === "string" && line.subBasketId.length > 0;
    if (line.itemType === "temporary") return line.subBasketId == null || realSubBasket;
    return (line.itemType == null || line.itemType === "main_line") && realSubBasket;
  });
  if (candidates.length === 0) return new Map();
  const revisionIds = [...new Set(candidates.map((line) => sourceRevisionFor(line)!.id))];
  const revisionQuery = AiEstimatorKnowledgeRevisionModel.find({ _id: { $in: revisionIds } })
    .select({ _id: 1, mainLineId: 1, status: 1, version: 1, completeness: 1 });
  const overviewQuery = AiEstimatorKnowledgeSectionModel.find({
    revisionId: { $in: revisionIds }, sectionKey: "overview"
  }).select({ revisionId: 1, mainLineId: 1, payload: 1 });
  const advancedQuery = AiEstimatorKnowledgeSectionModel.find({
    revisionId: { $in: revisionIds }, sectionKey: "advanced"
  }).select({ revisionId: 1, mainLineId: 1,
    "payload.modeCalculations.in_house_labor.baseRatePaise": 1,
    "payload.modeCalculations.in_house_material.baseRatePaise": 1,
    "payload.modeCalculations.in_house.baseRatePaise": 1 });
  if (session) { revisionQuery.session(session); overviewQuery.session(session); advancedQuery.session(session); }
  // Keep reads sequential when this resolver runs inside an estimate-save transaction.
  const revisions = await revisionQuery.lean().exec();
  const overviews = await overviewQuery.lean().exec();
  const advancedSections = await advancedQuery.lean().exec();
  const revisionById = new Map(revisions.map((revision) => [String(revision._id), revision]));
  const uomIdByRevision = new Map<string, string>();
  const inHouseBaseRateByRevision = new Map<string, number | null>();
  for (const overview of overviews) {
    const revisionId = String(overview.revisionId);
    const payload = overview.payload as Record<string, unknown> | null;
    if (String(revisionById.get(revisionId)?.mainLineId) !== String(overview.mainLineId) ||
        typeof payload?.uomId !== "string" || !payload.uomId) continue;
    uomIdByRevision.set(revisionId, payload.uomId);
  }
  for (const advanced of advancedSections) {
    const revisionId = String(advanced.revisionId);
    const revision = revisionById.get(revisionId);
    if (!revision || String(revision.mainLineId) !== String(advanced.mainLineId)) continue;
    inHouseBaseRateByRevision.set(revisionId, inHouseBaseRatePaise(advanced.payload));
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
    const source = sourceRevisionFor(raw)!;
    const revisionId = source.id;
    const revision = revisionById.get(revisionId);
    const uomId = uomIdByRevision.get(revisionId);
    const uom = uomId ? uomById.get(uomId) : undefined;
    if (String(revision?.mainLineId) !== id || revision?.status !== source.status ||
      !Number.isSafeInteger(revision.version) || Number(revision.version) < 1 ||
      (raw.status !== "active" && !hasReadyOverviewAndMode(revision.completeness)) || !uom ||
      typeof uom.code !== "string" || !uom.code ||
      typeof uom.name !== "string" || !uom.name ||
      !Number.isSafeInteger(uom.decimalScale) || Number(uom.decimalScale) < 0 || Number(uom.decimalScale) > 3) continue;
    projected.set(id, {
      id, mainLineId: id, basketId: String(raw.basketId),
      subBasketId: raw.subBasketId ? String(raw.subBasketId) : null,
      itemType: raw.itemType === "temporary" ? "temporary" : "main_line",
      name: String(raw.name), displayOrder: Number(raw.displayOrder), revisionId,
      itemStatus: raw.status as EstimatorCatalogueLine["itemStatus"],
      revisionStatus: source.status,
      itemVersion: Number(raw.version), revisionVersion: Number(revision.version),
      inHouseBaseRatePaise: inHouseBaseRateByRevision.get(revisionId) ?? null,
      uom: { id: uomId!, code: String(uom.code), name: String(uom.name), decimalScale: Number(uom.decimalScale) }
    });
  }
  return projected;
}

function inHouseBaseRatePaise(payload: unknown): number | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const calculations = (payload as Record<string, unknown>).modeCalculations;
  if (!calculations || typeof calculations !== "object" || Array.isArray(calculations)) return null;
  const scopes = calculations as Record<string, unknown>;
  const baseRate = (value: unknown): number | null => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const rate = (value as Record<string, unknown>).baseRatePaise;
    return typeof rate === "number" && Number.isSafeInteger(rate) && rate >= 0 ? rate : null;
  };
  if (Object.hasOwn(scopes, "in_house_labor") || Object.hasOwn(scopes, "in_house_material")) {
    const labor = baseRate(scopes.in_house_labor);
    const material = baseRate(scopes.in_house_material);
    if (labor === null || material === null) return null;
    const combined = labor + material;
    return Number.isSafeInteger(combined) ? combined : null;
  }
  return baseRate(scopes.in_house);
}

function sourceRevisionFor(line: {
  status?: unknown; activeRevisionId?: unknown; draftRevisionId?: unknown;
}): { id: string; status: "draft" | "active" } | null {
  if (line.status === "active") {
    return typeof line.activeRevisionId === "string" && line.activeRevisionId
      ? { id: line.activeRevisionId, status: "active" } : null;
  }
  if (line.status === "draft" ||
    (line.status === "inactive" && line.draftRevisionId !== null && line.draftRevisionId !== undefined)) {
    return typeof line.draftRevisionId === "string" && line.draftRevisionId
      ? { id: line.draftRevisionId, status: "draft" } : null;
  }
  if (line.status === "inactive") {
    return typeof line.activeRevisionId === "string" && line.activeRevisionId
      ? { id: line.activeRevisionId, status: "active" } : null;
  }
  return null;
}

function hasReadyOverviewAndMode(completeness: unknown): boolean {
  if (!completeness || typeof completeness !== "object") return false;
  const sections = (completeness as { sections?: unknown }).sections;
  if (!Array.isArray(sections)) return false;
  const complete = new Set(sections.filter((entry): entry is { sectionKey: string; state: string } =>
    entry && typeof entry === "object" && typeof entry.sectionKey === "string" &&
    entry.state === "complete").map((entry) => entry.sectionKey));
  return complete.has("overview") && (complete.has("advanced") || complete.has("pricing"));
}
