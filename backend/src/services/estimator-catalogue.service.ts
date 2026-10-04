import type mongoose from "mongoose";

import { normalizeKnowledgeBudgetAlterationTarget } from "../domain/ai-estimator-knowledge-recommendation.js";
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

type RecommendationRule = {
  id: string;
  requirement: "must" | "can";
  reason: string;
  targetKind: "main_line" | "sub_basket";
  targetBasketId: string;
  targetSubBasketId: string | null;
  targetMainLineId: string | null;
  available: boolean;
  completionRequired: boolean;
  targetRevisionId: string | null;
  targetRevisionVersion: number | null;
  targetItemVersion: number | null;
  children?: { mainLineId: string; available: true; completionRequired: boolean;
    revisionId: string; revisionVersion: number; itemVersion: number }[];
  unavailableChildCount?: number;
};

type SavedRecommendationRule = Omit<RecommendationRule,
  "available" | "completionRequired" | "targetRevisionId" | "targetRevisionVersion" | "targetItemVersion" |
  "children" | "unavailableChildCount"> & { targetType: "catalog" | "temporary" | null };

type RecommendationGuidance = { id: string; name: string; reason: string };

export interface EstimatorCatalogueRecommendationSource {
  mainLineId: string;
  available: boolean;
  revisionId: string | null;
  revisionVersion: number | null;
  itemVersion: number | null;
  rules: RecommendationRule[];
  guidance: RecommendationGuidance[];
}

/** Only the combined in-house base rate is projected; source cost details stay in Configuration. */
export async function listEstimatorCatalogue(
  actor: PublicUser,
  pagination: { limit: number; offset: number },
  includeReadyNonActive = false
) {
  await assertCatalogueReadActor(actor);

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

/** Return only selected source relationships, using the catalogue's exact revision and eligibility policy. */
export async function listEstimatorCatalogueRecommendations(
  actor: PublicUser,
  mainLineIds: readonly string[],
  includeReadyNonActive = false
): Promise<{ sources: EstimatorCatalogueRecommendationSource[] }> {
  await assertCatalogueReadActor(actor);
  const sourceRaw = await AiEstimatorKnowledgeMainLineModel.find({
    _id: { $in: mainLineIds },
    status: includeReadyNonActive ? { $in: ["active", "draft", "inactive"] } : "active"
  }).select({ _id: 1, basketId: 1, subBasketId: 1, name: 1, displayOrder: 1,
    itemType: 1, status: 1, version: 1, activeRevisionId: 1, draftRevisionId: 1 }).lean().exec();
  const sources = await eligibleCatalogueLines(sourceRaw);
  const revisions = [...new Set([...sources.values()].map((line) => line.revisionId))];
  const sections = revisions.length === 0 ? [] : await AiEstimatorKnowledgeSectionModel.find({
    revisionId: { $in: revisions }, sectionKey: "recommendations"
  }).select({ revisionId: 1, mainLineId: 1, payload: 1 }).lean().exec();
  const sectionByRevision = new Map(sections.map((section) => [String(section.revisionId), section]));
  const rulesBySource = new Map<string, SavedRecommendationRule[]>();
  const guidanceBySource = new Map<string, RecommendationGuidance[]>();
  for (const [id, line] of sources) {
    const section = sectionByRevision.get(line.revisionId);
    if (!section || String(section.mainLineId) !== id) continue;
    const payload = asObject(section.payload);
    rulesBySource.set(id, Array.isArray(payload?.budgetAlterations)
      ? payload.budgetAlterations.flatMap(parseAddedRecommendationRule) : []);
    guidanceBySource.set(id, Array.isArray(payload?.recommendations)
      ? payload.recommendations.flatMap(parseRecommendationGuidance) : []);
  }
  const allRules = [...rulesBySource.values()].flat();
  const directIds = [...new Set(allRules.flatMap((rule) => rule.targetMainLineId ? [rule.targetMainLineId] : []))];
  const groupIds = [...new Set(allRules.flatMap((rule) => rule.targetKind === "sub_basket" && rule.targetSubBasketId
    ? [rule.targetSubBasketId] : []))];
  const groupBasketIds = [...new Set(allRules.flatMap((rule) => rule.targetKind === "sub_basket"
    ? [rule.targetBasketId] : []))];
  const groupIdSet = new Set(groupIds);
  const [directRaw, groupRaw, groupSubBaskets] = await Promise.all([
    directIds.length
      ? AiEstimatorKnowledgeMainLineModel.find({ _id: { $in: directIds } })
        .select({ _id: 1, basketId: 1, subBasketId: 1, name: 1, displayOrder: 1,
          itemType: 1, status: 1, version: 1, activeRevisionId: 1, draftRevisionId: 1 }).lean().exec()
      : Promise.resolve([]),
    groupIds.length
      ? AiEstimatorKnowledgeMainLineModel.find({
          basketId: { $in: groupBasketIds }, subBasketId: { $in: groupIds }
        }).select({ _id: 1, basketId: 1, subBasketId: 1, name: 1, displayOrder: 1,
          itemType: 1, status: 1, version: 1, activeRevisionId: 1, draftRevisionId: 1 }).lean().exec()
      : Promise.resolve([]),
    groupIds.length
      ? AiEstimatorKnowledgeSubBasketModel.find({ _id: { $in: groupIds } })
          .select({ _id: 1, basketId: 1 }).lean().exec()
      : Promise.resolve([])
  ]);
  const targetRaw = [...new Map([...directRaw, ...groupRaw].map((line) => [String(line._id), line])).values()];
  const eligibleTargets = await eligibleCatalogueLines(targetRaw.filter((line) =>
    line.status === "active" || (includeReadyNonActive && (line.status === "draft" || line.status === "inactive"))));
  const groupById = new Map(groupSubBaskets.map((group) => [String(group._id), group]));
  const rawChildrenByGroup = new Map<string, typeof targetRaw>();
  for (const raw of groupRaw) {
    const groupId = raw.subBasketId == null ? null : String(raw.subBasketId);
    if (!groupId || !groupIdSet.has(groupId) ||
      String(raw.basketId) !== String(groupById.get(groupId)?.basketId)) continue;
    const children = rawChildrenByGroup.get(groupId) ?? [];
    children.push(raw);
    rawChildrenByGroup.set(groupId, children);
  }
  return { sources: mainLineIds.map((mainLineId) => {
    const source = sources.get(mainLineId);
    if (!source) return { mainLineId, available: false, revisionId: null, revisionVersion: null,
      itemVersion: null, rules: [], guidance: [] };
    return {
      mainLineId, available: true, revisionId: source.revisionId,
      revisionVersion: source.revisionVersion, itemVersion: source.itemVersion,
      rules: (rulesBySource.get(mainLineId) ?? []).map((rule): RecommendationRule => {
        if (rule.targetKind === "main_line") {
          const target = eligibleTargets.get(rule.targetMainLineId!);
          const available = Boolean(target && target.basketId === rule.targetBasketId &&
            target.subBasketId === rule.targetSubBasketId &&
            (target.itemType === "temporary" ? "temporary" : "catalog") === rule.targetType);
          return { ...withoutTargetType(rule), available,
            completionRequired: available && target?.itemType === "temporary",
            targetRevisionId: available ? target!.revisionId : null,
            targetRevisionVersion: available ? target!.revisionVersion : null,
            targetItemVersion: available ? target!.itemVersion : null };
        }
        const groupId = rule.targetSubBasketId!;
        const group = groupById.get(groupId);
        if (!group || String(group.basketId) !== rule.targetBasketId) {
          return { ...withoutTargetType(rule), available: false, completionRequired: true,
            targetRevisionId: null, targetRevisionVersion: null, targetItemVersion: null,
            children: [], unavailableChildCount: 0 };
        }
        const rawChildren = rawChildrenByGroup.get(groupId) ?? [];
        const children = rawChildren.flatMap((raw) => {
          const child = eligibleTargets.get(String(raw._id));
          return child && child.basketId === rule.targetBasketId && child.subBasketId === groupId
            ? [{ mainLineId: child.mainLineId, available: true as const,
                completionRequired: child.itemType === "temporary", revisionId: child.revisionId,
                revisionVersion: child.revisionVersion, itemVersion: child.itemVersion }] : [];
        }).sort((left, right) => {
          const first = eligibleTargets.get(left.mainLineId)!;
          const second = eligibleTargets.get(right.mainLineId)!;
          return order(first, second);
        });
        const unavailableChildCount = rawChildren.length - children.length;
        return { ...withoutTargetType(rule), available: children.length > 0,
          completionRequired: children.length === 0 || unavailableChildCount > 0 ||
            children.some((child) => child.completionRequired),
          targetRevisionId: null, targetRevisionVersion: null, targetItemVersion: null,
          children, unavailableChildCount };
      }),
      guidance: guidanceBySource.get(mainLineId) ?? []
    };
  }) };
}

async function assertCatalogueReadActor(actor: PublicUser): Promise<void> {
  if (actor.role !== "estimator_sales" && actor.role !== "super_admin") {
    throw new ApiError(403, "FORBIDDEN", "You are not authorized to read the estimator catalogue.");
  }
  const activeActor = await UserModel.exists({ _id: actor.id, role: actor.role, active: true });
  if (!activeActor) throw new ApiError(403, "FORBIDDEN", "Your account is no longer active.");
  if (actor.role === "super_admin" && await UserModel.countDocuments({ role: "super_admin", active: true }) !== 1) {
    throw new ApiError(409, "SOLE_SUPER_ADMIN_REQUIRED", "Exactly one active Super Admin is required.");
  }
}

async function eligibleCatalogueLines(rawLines: Parameters<typeof projectLines>[0]): Promise<Map<string, EstimatorCatalogueLine>> {
  if (rawLines.length === 0) return new Map();
  const basketIds = [...new Set(rawLines.map((line) => String(line.basketId)))];
  const subBasketIds = [...new Set(rawLines.flatMap((line) => line.subBasketId ? [String(line.subBasketId)] : []))];
  const [baskets, subBaskets, projected] = await Promise.all([
    AiEstimatorKnowledgeBasketModel.find({ _id: { $in: basketIds }, status: "active" })
      .select({ _id: 1 }).lean().exec(),
    AiEstimatorKnowledgeSubBasketModel.find({ _id: { $in: subBasketIds } })
      .select({ _id: 1, basketId: 1 }).lean().exec(),
    projectLines(rawLines)
  ]);
  const activeBasketIds = new Set(baskets.map((basket) => String(basket._id)));
  const subBasketById = new Map(subBaskets.map((subBasket) => [String(subBasket._id), String(subBasket.basketId)]));
  for (const [id, line] of projected) {
    if (!activeBasketIds.has(line.basketId) ||
      (line.subBasketId !== null && subBasketById.get(line.subBasketId) !== line.basketId)) projected.delete(id);
  }
  return projected;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function parseAddedRecommendationRule(value: unknown): SavedRecommendationRule[] {
  const row = asObject(value);
  if (!row || row.active !== true || row.trigger !== "added" || row.action !== "add" ||
    (row.requirement !== "must" && row.requirement !== "can")) return [];
  const target = normalizeKnowledgeBudgetAlterationTarget(row);
  if (!target || typeof row.id !== "string" || !row.id || typeof row.reason !== "string" || !row.reason.trim() ||
    typeof row.targetBasketId !== "string" || !row.targetBasketId) return [];
  if (target.targetKind === "sub_basket") {
    if (typeof row.targetSubBasketId !== "string" || !row.targetSubBasketId || row.targetMainLineId !== null || row.targetType !== null) return [];
    return [{ id: row.id, requirement: row.requirement, reason: row.reason,
      targetKind: "sub_basket", targetBasketId: row.targetBasketId,
      targetSubBasketId: row.targetSubBasketId, targetMainLineId: null, targetType: null }];
  }
  if (typeof row.targetMainLineId !== "string" || !row.targetMainLineId ||
    (row.targetSubBasketId !== null && typeof row.targetSubBasketId !== "string") ||
    (row.targetType !== "catalog" && row.targetType !== "temporary")) return [];
  return [{ id: row.id, requirement: row.requirement, reason: row.reason,
    targetKind: "main_line", targetBasketId: row.targetBasketId,
    targetSubBasketId: row.targetSubBasketId, targetMainLineId: row.targetMainLineId,
    targetType: row.targetType }];
}

function parseRecommendationGuidance(value: unknown): RecommendationGuidance[] {
  const row = asObject(value);
  return row?.active === true && typeof row.id === "string" && row.id &&
    typeof row.name === "string" && row.name.trim()
    ? [{ id: row.id, name: row.name, reason: typeof row.reason === "string" ? row.reason : "" }] : [];
}

function withoutTargetType(rule: SavedRecommendationRule): Omit<RecommendationRule,
  "available" | "completionRequired" | "targetRevisionId" | "targetRevisionVersion" |
  "targetItemVersion" | "children" | "unavailableChildCount"> {
  const { targetType: _targetType, ...projected } = rule;
  return projected;
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
