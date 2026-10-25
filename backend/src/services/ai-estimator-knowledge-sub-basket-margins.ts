import type { ClientSession } from "mongoose";

import type { KnowledgeSubBasketMarginMode, KnowledgeSubBasketMarginState, KnowledgeSubBasketMarginSummary, KnowledgeSubBasketSourceConfiguration } from "../contracts/ai-estimator-knowledge-sub-basket-margins.js";
import { createKnowledgeContentDigest } from "../domain/ai-estimator-knowledge.js";
import { selectCurrentMainLineRevision } from "../domain/ai-estimator-knowledge-current-revision.js";
import { SUB_BASKET_MARGIN_MODES, comparableInHouseMarginRanges, configuredInHouseMarginRanges, subBasketMarginRanges, subBasketDefaultModeCalculations, subBasketMarginPatchUnavailableReason, validSubBasketMarginRanges, withSubBasketMarginDefaults } from "../domain/ai-estimator-knowledge-sub-basket-margins.js";
import { validateKnowledgeSectionPayload } from "../domain/ai-estimator-knowledge-validation.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeBasketModel } from "../models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeUomModel } from "../models/AiEstimatorKnowledgeUom.js";

type Row = Record<string, unknown>;
export interface SubBasketMarginLine { line: Row; revision: Row | null; section: Row | null; }
export function marginPayload(section: Row | null): Row {
  return section?.payload && typeof section.payload === "object" && !Array.isArray(section.payload) ? section.payload as Row : {};
}
function unavailable(line: SubBasketMarginLine): string | null {
  if (!line.revision || !line.section) return "The saved Mode section could not be resolved. Open this main line and save its Mode settings.";
  if (line.section.applicability === "not_applicable") return "The Mode section is marked not applicable. Review this main line before applying defaults.";
  if (line.section.applicability !== "configured") return "The Mode section is not configured. Open this main line and save its margins.";
  return null;
}

/** Load a consistent full Sub-Basket, including lines outside the visible index page. */
export async function readSubBasketMarginSnapshot(basketId: string, subBasketId: string, session: ClientSession): Promise<{
  summary: KnowledgeSubBasketMarginSummary; lines: SubBasketMarginLine[]; sourceUom: Row | null;
}> {
  const basket = await AiEstimatorKnowledgeBasketModel.findOne({ _id: basketId, status: { $ne: "archived" } }).session(session).lean().exec() as Row | null;
  const subBasket = await AiEstimatorKnowledgeSubBasketModel.findOne({ _id: subBasketId, basketId }).session(session).lean().exec() as Row | null;
  if (!basket || !subBasket) throw new ApiError(404, "NOT_FOUND", "The Sub-Basket could not be found.");
  const documents = await AiEstimatorKnowledgeMainLineModel.find({ basketId, subBasketId, status: { $ne: "archived" } })
    .sort({ displayOrder: 1, _id: 1 }).session(session).lean().exec() as Row[];
  const revisionIds = documents.map((line) => selectCurrentMainLineRevision(line)?.id).filter((id): id is string => Boolean(id));
  const revisions = await AiEstimatorKnowledgeRevisionModel.find({ _id: { $in: revisionIds } }).session(session).lean().exec() as Row[];
  const sections = await AiEstimatorKnowledgeSectionModel.find({ revisionId: { $in: revisionIds }, sectionKey: "advanced" }).session(session).lean().exec() as Row[];
  const revisionById = new Map(revisions.map((revision) => [String(revision._id), revision]));
  const sectionByRevision = new Map(sections.map((section) => [String(section.revisionId), section]));
  const lines = documents.map((line): SubBasketMarginLine => {
    const selected = selectCurrentMainLineRevision(line);
    const revision = selected ? revisionById.get(selected.id) : undefined;
    const section = selected ? sectionByRevision.get(selected.id) : undefined;
    return { line, revision: revision && revision.mainLineId === line._id && revision.status === selected?.status ? revision : null,
      section: section && section.mainLineId === line._id ? section : null };
  });
  const source = lines[0];
  const sourceOverview = source?.revision ? await AiEstimatorKnowledgeSectionModel.findOne({
    mainLineId: source.line._id, revisionId: source.revision._id, sectionKey: "overview"
  }).session(session).lean().exec() as Row | null : null;
  const uomId = marginPayload(sourceOverview).uomId;
  const sourceUom = typeof uomId === "string" ? await AiEstimatorKnowledgeUomModel.findById(uomId).session(session).lean().exec() as Row | null : null;
  const uom = sourceOverview?.applicability === "configured" && sourceUom?.status === "active"
    && typeof sourceUom.code === "string" && typeof sourceUom.name === "string"
    && typeof sourceUom.decimalScale === "number" && Number.isSafeInteger(sourceUom.decimalScale) && sourceUom.decimalScale >= 0 && sourceUom.decimalScale <= 3
    ? { id: String(sourceUom._id), code: sourceUom.code, name: sourceUom.name, decimalScale: sourceUom.decimalScale } : null;
  const sourceConfiguration: KnowledgeSubBasketSourceConfiguration | null = source?.revision && source.section
    && source.section.applicability === "configured" ? {
      revisionId: String(source.revision._id), revisionStatus: source.revision.status as "draft" | "active",
      itemVersion: Number(source.line.version), revisionVersion: Number(source.revision.version), sectionVersion: Number(source.section.version),
      uom, modes: subBasketDefaultModeCalculations(marginPayload(source.section))
    } : null;
  const owner = { basketId, subBasketId };
  const modes = Object.fromEntries(SUB_BASKET_MARGIN_MODES.map((mode): [KnowledgeSubBasketMarginMode, KnowledgeSubBasketMarginState] => {
    const sourcePayload = marginPayload(source?.section ?? null);
    const savedRanges = subBasketMarginRanges(sourcePayload, mode);
    const ranges = mode === "in_house" && Object.hasOwn(sourcePayload, "inHouseComponents")
      ? configuredInHouseMarginRanges(savedRanges, owner) : savedRanges;
    const sourceReason = !source ? "No main lines are available in this Sub-Basket."
      : unavailable(source) ?? (!validSubBasketMarginRanges(ranges, mode) ? "Save valid margins on the first main line before applying defaults." : null);
    if (sourceReason) return [mode, { ranges, mismatchCount: null, mismatches: [], canApply: false, unavailableReason: sourceReason }];
    const mismatches = lines.slice(1).flatMap((entry) => {
      const payload = marginPayload(entry.section);
      const savedTargetRanges = subBasketMarginRanges(payload, mode);
      const comparison = mode === "in_house" ? comparableInHouseMarginRanges(ranges, savedTargetRanges, owner)
        : { source: ranges, target: savedTargetRanges };
      const targetRanges = comparison.target;
      // Missing or incomplete saved margins are not differences from the default.
      if (unavailable(entry) || !validSubBasketMarginRanges(targetRanges, mode)) return [];
      if (targetRanges.every((range, index) => range.minimumBps === comparison.source[index]!.minimumBps && range.maximumBps === comparison.source[index]!.maximumBps)) return [];
      const patched = withSubBasketMarginDefaults(payload, mode, ranges, owner);
      const blockedReason = !patched ? subBasketMarginPatchUnavailableReason(payload, ranges, owner)
        : validateKnowledgeSectionPayload("advanced", patched).length ? "The saved Mode settings need review. Open this main line and resolve the validation issues first." : null;
      return [{ mainLineId: String(entry.line._id), mainLineName: String(entry.line.name), ranges: targetRanges, blockedReason }];
    });
    const blocked = mismatches.some(({ blockedReason }) => blockedReason !== null);
    return [mode, { ranges, mismatchCount: mismatches.length, mismatches, canApply: mismatches.length > 0 && !blocked,
      unavailableReason: blocked ? "Some mismatched main lines need review before these defaults can be applied." : null }];
  })) as Record<KnowledgeSubBasketMarginMode, KnowledgeSubBasketMarginState>;
  const componentRanges = [...modes.in_house.ranges, ...modes.in_house.mismatches.flatMap(({ ranges }) => ranges),
    ...(sourceConfiguration?.modes.in_house.calculations ?? [])].filter(({ component }) => component);
  if (componentRanges.length) {
    const basketIds = [...new Set(componentRanges.map(({ component }) => component!.basketId))];
    const subIds = [...new Set(componentRanges.flatMap(({ component }) => component!.subBasketId ? [component!.subBasketId] : []))];
    const componentBaskets = await AiEstimatorKnowledgeBasketModel.find({ _id: { $in: basketIds } }).select({ name: 1 }).session(session).lean().exec();
    const componentSubs = await AiEstimatorKnowledgeSubBasketModel.find({ _id: { $in: subIds } }).select({ name: 1, basketId: 1 }).session(session).lean().exec();
    for (const range of componentRanges) {
      const component = range.component!;
      const parent = componentBaskets.find((entry) => String(entry._id) === component.basketId);
      const sub = componentSubs.find((entry) => String(entry._id) === component.subBasketId && entry.basketId === component.basketId);
      Object.assign(component, { name: `${parent?.name ?? "Unavailable Main basket"} / ${component.subBasketId === null ? "Existing In-house settings" : sub?.name ?? "Unavailable Sub-basket"}` });
    }
  }
  return { lines, sourceUom, summary: {
    basketId, subBasketId, source: source ? { mainLineId: String(source.line._id), mainLineName: String(source.line.name) } : null,
    sourceConfiguration, totalMainLines: lines.length,
    versionToken: createKnowledgeContentDigest({ basketId, basketVersion: basket.version, basketStatus: basket.status,
      subBasketId, subBasketVersion: subBasket.version,
      sourceOverview: sourceOverview ? { id: sourceOverview._id, version: sourceOverview.version, applicability: sourceOverview.applicability, payload: sourceOverview.payload } : null,
      sourceUom: sourceUom ? { id: sourceUom._id, version: sourceUom.version, status: sourceUom.status,
        code: sourceUom.code, name: sourceUom.name, decimalScale: sourceUom.decimalScale } : null,
      lines: lines.map(({ line, revision, section }) => ({ id: line._id, version: line.version, status: line.status,
        displayOrder: line.displayOrder, activeRevisionId: line.activeRevisionId, draftRevisionId: line.draftRevisionId,
        revision: revision ? { id: revision._id, version: revision.version, status: revision.status } : null,
        section: section ? { id: section._id, version: section.version, applicability: section.applicability, payload: section.payload } : null })) }),
    modes
  } };
}
