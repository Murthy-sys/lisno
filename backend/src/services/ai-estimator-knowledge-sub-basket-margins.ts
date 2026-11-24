import type { ClientSession } from "mongoose";

import type { KnowledgeSubBasketMarginMode, KnowledgeSubBasketMarginState, KnowledgeSubBasketMarginSummary, KnowledgeSubBasketSourceConfiguration, MarginComponent, MarginMatrix } from "../contracts/ai-estimator-knowledge-sub-basket-margins.js";
import { createKnowledgeContentDigest } from "../domain/ai-estimator-knowledge.js";
import { buildMarginMatrix, type StoredMarginBaseline, type SubBasketMarginLine } from "../domain/ai-estimator-knowledge-margin-matrix.js";
export { planMarginDecision } from "../domain/ai-estimator-knowledge-margin-decision.js";
export type { SubBasketMarginLine } from "../domain/ai-estimator-knowledge-margin-matrix.js";
import { loadPendingMarginEdits } from "./ai-estimator-knowledge-margin-history.js";
import { selectCurrentMainLineRevision } from "../domain/ai-estimator-knowledge-current-revision.js";
import { knowledgeModeTierPayload, projectKnowledgeModeTierSection, type KnowledgeModeConfigurationScope } from "../domain/ai-estimator-knowledge-mode-tiers.js";
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
async function loadMarginRows(basketId: string, subBasketId: string, session: ClientSession) {
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
  await loadPendingMarginEdits(lines, { basketId, subBasketId }, session);
  return { basket, subBasket, lines };
}

type MarginRows = Awaited<ReturnType<typeof loadMarginRows>>;

async function componentLabels(components: MarginComponent[], session: ClientSession) {
  const labels = new Map<string, string>();
  if (!components.length) return labels;
  const basketIds = [...new Set(components.map(component => component.basketId))];
  const subIds = [...new Set(components.flatMap(component => component.subBasketId ? [component.subBasketId] : []))];
  const baskets = await AiEstimatorKnowledgeBasketModel.find({ _id: { $in: basketIds } }).select({ name: 1 }).session(session).lean().exec();
  const subs = await AiEstimatorKnowledgeSubBasketModel.find({ _id: { $in: subIds } }).select({ name: 1, basketId: 1 }).session(session).lean().exec();
  const parents = new Map(baskets.map(row => [String(row._id), row.name]));
  const children = new Map(subs.map(row => [JSON.stringify([row.basketId, String(row._id)]), row.name]));
  for (const component of components) {
    const key = JSON.stringify([component.basketId, component.subBasketId]);
    const child = component.subBasketId === null ? "Existing In-house settings" : children.get(key) ?? "Unavailable Sub-basket";
    labels.set(key, `${parents.get(component.basketId) ?? "Unavailable Main basket"} / ${child}`);
  }
  return labels;
}

function matrixForRows(rows: MarginRows, basketId: string, subBasketId: string, inHouseScope?: "sub_basket"): MarginMatrix {
  const baseline = rows.subBasket.marginBaseline as StoredMarginBaseline | undefined;
  const versionToken = createKnowledgeContentDigest({
    basketId, subBasketId, ...(inHouseScope ? { inHouseScope } : {}), basketVersion: rows.basket.version, subBasketVersion: rows.subBasket.version, baseline,
    lines: rows.lines.map(({ line, revision, section, pending }) => [pending, line._id, line.version, line.name, line.status, line.displayOrder,
      line.activeRevisionId, line.draftRevisionId, revision?._id, revision?.version, section?._id, section?.version,
      section?.applicability, section?.payload])
  });
  return buildMarginMatrix({ basketId, subBasketId }, rows.lines, baseline, versionToken, inHouseScope);
}

function labelMarginMatrix(matrix: MarginMatrix, labels: ReadonlyMap<string, string>) {
  const label = (entry: { component?: MarginComponent; componentName?: string }) => {
    if (entry.component) entry.componentName = labels.get(JSON.stringify([entry.component.basketId, entry.component.subBasketId]));
  };
  for (const row of matrix.defaults) {
    label(row);
    row.choices?.forEach(label);
  }
  for (const group of matrix.exceptions) {
    label(group);
    group.proposals?.forEach(label);
  }
  matrix.issues.forEach(label);
}

export async function readMarginMatrixSnapshot(basketId: string, subBasketId: string, session: ClientSession, inHouseScope?: "sub_basket") {
  const rows = await loadMarginRows(basketId, subBasketId, session);
  const legacy = matrixForRows(rows, basketId, subBasketId);
  const matrix = inHouseScope ? matrixForRows(rows, basketId, subBasketId, inHouseScope) : legacy;
  const labels = await componentLabels(legacy.defaults.flatMap(row => row.component ? [row.component] : []), session);
  labelMarginMatrix(matrix, labels);
  return { matrix, legacyDefaults: legacy.defaults, lines: rows.lines, subBasket: rows.subBasket, labels };
}

export async function readSubBasketMarginSnapshot(basketId: string, subBasketId: string, session: ClientSession, modeTier: KnowledgeModeConfigurationScope = "signature", inHouseScope?: "sub_basket"): Promise<{
  summary: KnowledgeSubBasketMarginSummary; lines: SubBasketMarginLine[]; sourceUom: Row | null;
}> {
  const rows = await loadMarginRows(basketId, subBasketId, session);
  const { basket, subBasket, lines } = rows;
  const matrix = modeTier !== "default" ? matrixForRows(rows, basketId, subBasketId) : null;
  const owned = Boolean(matrix?.baselineVersion);
  const source = lines[0];
  const tierSection = (section: Row | null): Row | null => section ? projectKnowledgeModeTierSection(section, modeTier) : null;
  const tierPayload = (section: Row | null): Row => knowledgeModeTierPayload(marginPayload(section), modeTier);
  const sourceSection = tierSection(source?.section ?? null);
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
    && sourceSection?.applicability === "configured" ? {
      revisionId: String(source.revision._id), revisionStatus: source.revision.status as "draft" | "active",
      itemVersion: Number(source.line.version), revisionVersion: Number(source.revision.version), sectionVersion: Number(source.section.version),
      uom, modes: subBasketDefaultModeCalculations(tierPayload(source.section))
    } : null;
  const owner = { basketId, subBasketId };
  const modes = Object.fromEntries(SUB_BASKET_MARGIN_MODES.map((mode): [KnowledgeSubBasketMarginMode, KnowledgeSubBasketMarginState] => {
    const sourcePayload = tierPayload(source?.section ?? null);
    const savedRanges = subBasketMarginRanges(sourcePayload, mode);
    const storedRanges = matrix?.defaults.filter(scope => scope.tier === modeTier && scope.mode === mode)
      .flatMap(scope => scope.ranges.map(range => ({ ...range, ...(scope.component ? { component: { ...scope.component } } : {}) }))) ?? [];
    const ranges = owned ? storedRanges : mode === "in_house" && Object.hasOwn(sourcePayload, "inHouseComponents")
      ? configuredInHouseMarginRanges(savedRanges, owner) : savedRanges;
    const sourceReason = owned ? validSubBasketMarginRanges(ranges, mode) ? null : "Configure Sub-Basket margins for this scope first."
      : !source ? "No main lines are available in this Sub-Basket."
      : unavailable({ ...source, section: sourceSection }) ?? (!validSubBasketMarginRanges(ranges, mode) ? "Save valid margins on the first main line before applying defaults." : null);
    if (sourceReason) return [mode, { ranges, mismatchCount: null, mismatches: [], canApply: false, unavailableReason: sourceReason }];
    const mismatches = (owned ? lines : lines.slice(1)).flatMap((entry) => {
      const payload = tierPayload(entry.section);
      const savedTargetRanges = subBasketMarginRanges(payload, mode);
      const comparison = mode === "in_house" ? comparableInHouseMarginRanges(ranges, savedTargetRanges, owner)
        : { source: ranges, target: savedTargetRanges };
      const targetRanges = comparison.target;
      // Missing or incomplete saved margins are not differences from the default.
      if (unavailable({ ...entry, section: tierSection(entry.section) }) || !validSubBasketMarginRanges(targetRanges, mode)) return [];
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
  // Keep the explicit Signature restore token and its per-component target ranges compatible.
  // The web editor can request the shared display projection alongside that same reviewed restore.
  const displayMatrix = matrix && inHouseScope ? matrixForRows(rows, basketId, subBasketId, inHouseScope) : matrix;
  const defaults = displayMatrix?.defaults.filter(row => row.tier === modeTier);
  const labels = await componentLabels([...componentRanges.map(({ component }) => component!),
    ...(matrix?.defaults ?? []).flatMap(scope => scope.component ? [scope.component] : [])], session);
  for (const { component } of componentRanges) {
    Object.assign(component!, { name: labels.get(JSON.stringify([component!.basketId, component!.subBasketId])) });
  }
  if (displayMatrix) labelMarginMatrix(displayMatrix, labels);
  return { lines, sourceUom, summary: {
    ...(displayMatrix ? { ownedMargins: owned, exceptions: displayMatrix.exceptions.filter(row => row.tier === modeTier), defaults } : {}),
    basketId, subBasketId, source: source ? { mainLineId: String(source.line._id), mainLineName: String(source.line.name) } : null,
    sourceConfiguration, totalMainLines: lines.length,
    versionToken: createKnowledgeContentDigest({ modeTier, basketId, basketVersion: basket.version, basketStatus: basket.status,
      subBasketId, subBasketVersion: subBasket.version, marginBaselineVersion: matrix?.baselineVersion, marginVersionToken: matrix?.versionToken,
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
