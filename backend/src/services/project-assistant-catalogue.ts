import type { ClientSession } from "mongoose";
import type { AssistantCatalogueCandidate, AssistantRecommendation, AssistantSourceVersion } from "../contracts/project-chat-assistant.js";
import { selectCurrentMainLineRevision } from "../domain/ai-estimator-knowledge-current-revision.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeBasketModel } from "../models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeRevisionModel } from "../models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeUomModel } from "../models/AiEstimatorKnowledgeUom.js";
import { readEstimatorCatalogueRecommendations, resolveEstimatorCatalogueLines } from "./estimator-catalogue.service.js";
import { sourceWitness } from "./project-assistant-context.js";
import type { AssistantPricingSource } from "./project-assistant-pricing.js";

export interface AssistantLineRead { lines: Map<string, AssistantPricingSource>; freshness: AssistantSourceVersion[] }
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
export function boundedAssistantIds(ids: readonly string[], limit = 32): string[] {
  if (!Array.isArray(ids) || ids.length > limit || ids.some(id => typeof id !== "string" || !id.trim() || id.length > 200)) {
    throw new ApiError(400, "ASSISTANT_INPUT_INVALID", "Choose a bounded set of Main Lines.");
  }
  return [...new Set(ids)].sort();
}

/** Read current lineage and price settings without an actor or any Configuration mutation. */
export async function readAssistantLines(ids: readonly string[], session?: ClientSession): Promise<AssistantLineRead> {
  const selected = boundedAssistantIds(ids);
  const lines = new Map<string, AssistantPricingSource>();
  if (!selected.length) return { lines, freshness: [] };
  // Sequence session reads: Mongo transactions must not use concurrent driver operations.
  const resolved = await resolveEstimatorCatalogueLines(selected, session);
  const raw = await AiEstimatorKnowledgeMainLineModel.find({ _id: { $in: selected } })
    .select({ _id: 1, basketId: 1, subBasketId: 1, itemType: 1, status: 1, version: 1, activeRevisionId: 1, draftRevisionId: 1, name: 1 }).session(session ?? null).lean().exec();
  const revisionIds = raw.flatMap(row => { const current = selectCurrentMainLineRevision(row); return current ? [current.id] : []; });
  const revisions = await AiEstimatorKnowledgeRevisionModel.find({ _id: { $in: revisionIds } })
    .select({ _id: 1, mainLineId: 1, version: 1, status: 1, completeness: 1 }).session(session ?? null).lean().exec();
  const sections = await AiEstimatorKnowledgeSectionModel.find({ revisionId: { $in: revisionIds }, sectionKey: { $in: ["overview", "advanced"] } })
    .select({ _id: 1, revisionId: 1, mainLineId: 1, sectionKey: 1, applicability: 1, payload: 1, version: 1 }).session(session ?? null).lean().exec();
  const uomIds = [...resolved.values()].map(value => value.line.uom.id);
  const uoms = await AiEstimatorKnowledgeUomModel.find({ _id: { $in: uomIds } })
    .select({ _id: 1, version: 1, status: 1, code: 1, name: 1, decimalScale: 1 }).session(session ?? null).lean().exec();
  const freshness: AssistantSourceVersion[] = [];
  for (const id of selected) {
    const original = raw.find(row => String(row._id) === id) ?? null;
    const current = original ? selectCurrentMainLineRevision(original) : null;
    const revision = revisions.find(row => String(row._id) === current?.id) ?? null;
    const lineSections = sections.filter(row => String(row.revisionId) === current?.id).sort((a, b) => String(a.sectionKey).localeCompare(String(b.sectionKey)));
    const value = resolved.get(id);
    const uom = uoms.find(row => String(row._id) === value?.line.uom.id) ?? null;
    freshness.push(sourceWitness("assistant-line", id, { original, revision, sections: lineSections, resolved: value ?? null, uom }));
    if (!value || !original || !revision || String(revision.mainLineId) !== id || revision.status !== current?.status) continue;
    const advanced = lineSections.find(row => row.sectionKey === "advanced" && String(row.mainLineId) === id && row.applicability === "configured");
    const completeness = object(revision.completeness);
    const complete = Array.isArray(completeness?.sections) ? new Set(completeness.sections.flatMap(value => {
      const entry = object(value); return entry?.state === "complete" && typeof entry.sectionKey === "string" ? [entry.sectionKey] : [];
    })) : new Set<string>();
    const available = value.line.itemType === "main_line" && complete.has("overview") && complete.has("advanced") && Boolean(advanced) && uom?.status === "active";
    const candidate: AssistantCatalogueCandidate = {
      mainLineId: id, mainBasketId: value.line.basketId, subBasketId: value.line.subBasketId,
      name: value.line.name, basketName: value.mainBasketName, subBasketName: value.subBasketName,
      revisionId: value.line.revisionId, revisionVersion: value.line.revisionVersion, itemVersion: value.line.itemVersion,
      uom: { ...value.line.uom }, available
    };
    lines.set(id, { candidate, advanced: advanced ? object(advanced.payload) : null, temporary: value.line.itemType === "temporary" });
  }
  return { lines, freshness };
}

/** Names locate candidates; subsequent reads always use stable IDs. No user regex reaches Mongo. */
export async function searchAssistantCatalogue(input: { query: string; limit: number }, session?: ClientSession): Promise<AssistantCatalogueCandidate[]> {
  if (typeof input.query !== "string" || input.query.trim().length < 2 || input.query.length > 200 || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 8) {
    throw new ApiError(400, "ASSISTANT_INPUT_INVALID", "Use a search of 2–200 characters and request at most eight Main Lines.");
  }
  const tokens = input.query.normalize("NFKC").trim().split(/\s+/u).slice(0, 6);
  const expression = new RegExp(tokens.map(token => token.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")).join("|"), "iu");
  const baskets = await AiEstimatorKnowledgeBasketModel.find({ status: "active", name: expression }).select({ _id: 1 }).limit(16).session(session ?? null).lean().exec();
  const subBaskets = await AiEstimatorKnowledgeSubBasketModel.find({ name: expression }).select({ _id: 1 }).limit(16).session(session ?? null).lean().exec();
  const raw = await AiEstimatorKnowledgeMainLineModel.find({ status: { $in: ["active", "draft", "inactive"] }, itemType: { $ne: "temporary" },
    $or: [{ name: expression }, { basketId: { $in: baskets.map(row => String(row._id)) } }, { subBasketId: { $in: subBaskets.map(row => String(row._id)) } }] })
    .select({ _id: 1, name: 1, displayOrder: 1 }).sort({ displayOrder: 1, _id: 1 }).limit(32).session(session ?? null).lean().exec();
  const read = await readAssistantLines(raw.map(row => String(row._id)), session);
  const score = (candidate: AssistantCatalogueCandidate) => tokens.reduce((value, token) => value + (candidate.name.toLocaleLowerCase().includes(token.toLocaleLowerCase()) ? 2 : 0) + (`${candidate.basketName} ${candidate.subBasketName ?? ""}`.toLocaleLowerCase().includes(token.toLocaleLowerCase()) ? 1 : 0), 0);
  return [...read.lines.values()].map(value => value.candidate).sort((a, b) => score(b) - score(a) || a.mainLineId.localeCompare(b.mainLineId)).slice(0, input.limit);
}

export async function readAssistantRecommendations(ids: readonly string[], session?: ClientSession): Promise<{ rules: AssistantRecommendation[]; freshness: AssistantSourceVersion[] }> {
  const selected = boundedAssistantIds(ids);
  const result = await readEstimatorCatalogueRecommendations(selected, true, session);
  const targetIds = [...new Set(result.sources.flatMap(source => source.rules.flatMap(rule => rule.targetKind === "main_line"
    ? rule.targetMainLineId ? [rule.targetMainLineId] : [] : rule.children?.map(child => child.mainLineId) ?? [])))];
  const current = new Map<string, AssistantPricingSource>();
  const lineFreshness: AssistantSourceVersion[] = [];
  // Keep incomplete drafts explicit even when the base-rate catalogue accepts them.
  const idsToRead = [...new Set([...selected, ...targetIds])].slice(0, 256);
  for (let index = 0; index < idsToRead.length; index += 32) {
    const read = await readAssistantLines(idsToRead.slice(index, index + 32), session);
    for (const [id, line] of read.lines) current.set(id, line);
    lineFreshness.push(...read.freshness);
  }
  const rules: AssistantRecommendation[] = result.sources.flatMap(source => source.rules.map(rule => {
    const targets = rule.targetKind === "main_line" ? rule.targetMainLineId ? [rule.targetMainLineId] : [] : rule.children?.map(child => child.mainLineId) ?? [];
    const unavailable = targets.filter(id => !current.get(id)?.candidate.available).length;
    return { sourceMainLineId: source.mainLineId, ruleId: rule.id, requirement: rule.requirement, targetKind: rule.targetKind,
      targetMainLineIds: targets, available: source.available && current.get(source.mainLineId)?.candidate.available === true && rule.available,
      completionRequired: rule.completionRequired || unavailable > 0,
      unavailableChildCount: (rule.unavailableChildCount ?? 0) + unavailable };
  }));
  return { rules, freshness: [sourceWitness("assistant-recommendations", JSON.stringify(selected), { result, lineFreshness })] };
}
