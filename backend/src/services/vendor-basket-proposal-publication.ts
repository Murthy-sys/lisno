import mongoose, { type ClientSession, type Model } from "mongoose";

import { PROPOSAL_LIMITS, type ProposalFinding, type ProposalPublicationSnapshot, type ProposalPublishedMapping, type ProposalResource } from "../contracts/vendor-basket-proposal.js";
import { AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY } from "../domain/ai-estimator-knowledge-fixed-gst.js";
import { deriveTaxAmounts } from "../domain/ai-estimator-knowledge-calculation.js";
import { assertValidKnowledgeSectionPayload } from "../domain/ai-estimator-knowledge-validation.js";
import { AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS, normalizeKnowledgeIdentity, type KnowledgeSectionKey } from "../domain/ai-estimator-knowledge.js";
import { normalizeKnowledgeBudgetAlterationTarget } from "../domain/ai-estimator-knowledge-recommendation.js";
import { validateAcyclicGraph, validateSharedQualityChecklistForSave } from "../domain/ai-estimator-knowledge-validation.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeBasketModel } from "../models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeBasketQualityRevisionModel } from "../models/AiEstimatorKnowledgeBasketQualityRevision.js";
import { AiEstimatorKnowledgeSubBasketModel } from "../models/AiEstimatorKnowledgeSubBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeSectionModel } from "../models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeUomModel } from "../models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeModeModel } from "../models/AiEstimatorKnowledgeMode.js";
import { AiEstimatorKnowledgePriorityModel } from "../models/AiEstimatorKnowledgePriority.js";
import { AiEstimatorKnowledgeSurfaceModel } from "../models/AiEstimatorKnowledgeSurface.js";
import type { AuditService } from "./audit.service.js";
import { basketQualityDigest, mandatoryQualityParameters, readBasketQualityRevision } from "./ai-estimator-knowledge-basket-quality.js";
import { allocateAiEstimatorKnowledgeDisplayOrder, observeExplicitAiEstimatorKnowledgeDisplayOrder } from "./ai-estimator-knowledge-display-order.service.js";
import { activateKnowledgeRevisionInSession, completenessForRows, coordinateKnowledgeProposalSectionReferences, createKnowledgeHierarchyInSession, hasKnowledgeSectionContent, itemRelationsForRows, materializePriceCommands, normalizeKnowledgeProposalSectionPayload, normalizeRecommendationPayload, validateKnowledgeProposalPriceCommands, validateKnowledgeProposalSectionRows } from "./ai-estimator-knowledge-item.service.js";
import { validateKnowledgeQualityControlOptionReferences } from "./ai-estimator-knowledge-quality-control-option.service.js";

import { assertProposalMasterAvailable, normalizeProposalMaster, proposalMasterModel, proposalMasterResolver } from "./vendor-basket-proposal-masters.js";

type Row = Record<string, unknown>;

function row(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function rows(value: unknown): Row[] { return Array.isArray(value) ? value.map(row) : []; }
function activeRows(value: unknown): Row[] { return rows(value).filter((value) => value.active !== false); }
function sectionsFor(snapshot: ProposalPublicationSnapshot, mainLineId: string): Row[] {
  return AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.map((sectionKey) => {
    const resource = snapshot.sections.find((section) => section.parentId === mainLineId && section.payload.sectionKey === sectionKey);
    const payload = structuredClone(resource?.payload.payload ?? {});
    return { mainLineId, sectionKey, applicability: resource?.payload.applicability === "not_applicable" ? "not_applicable"
      : hasKnowledgeSectionContent(payload) ? "configured" : "not_configured", payload };
  });
}
function sectionPayload(sections: Row[], key: string): Row { return row(sections.find((section) => section.sectionKey === key)?.payload); }
function finding(resourceId: string, code: string, message: string, path?: string): ProposalFinding {
  return { resourceId, code, message, ...(path ? { path } : {}) };
}
function errorFindings(error: unknown, resourceId: string, mainLineId?: string): ProposalFinding[] {
  if (!(error instanceof ApiError)) throw error;
  return Object.entries(error.fields ?? { "": error.message }).map(([path, message]) => ({
    ...finding(resourceId, error.code, message, path), ...(mainLineId ? { mainLineId } : {})
  }));
}

/** No Configuration document, dependency counter, price, audit or tax policy is
 * written by readiness. A supplied session joins the caller's saved-head read. */
export type ProposalSaveValidationTarget = { kind: "section"; mainLineId: string; sectionKey: KnowledgeSectionKey } | { kind: "quality" };
export async function validateProposalSnapshot(snapshot: ProposalPublicationSnapshot, existingSession?: ClientSession,
  options: { forSave?: boolean; saveTarget?: ProposalSaveValidationTarget } = {}): Promise<ProposalFinding[]> {
  const session = existingSession ?? await mongoose.startSession();
  try {
    const findings = validateProposalStructure(snapshot, options.forSave === true);
    if (findings.length) return findings;
    const masters = snapshot.masters ?? [];
    const masterResolver = proposalMasterResolver(masters);
    if (!options.forSave) for (const master of masters) {
      try { await assertProposalMasterAvailable(master.kind === "uom" ? "uoms" : "surfaces", master.resourceId, master.payload, masters, session); }
      catch (error) { findings.push(...errorFindings(error, master.resourceId)); }
    }
    const basketId = snapshot.basket.resourceId;
    if (snapshot.target?.kind === "new_sub_basket") {
      const parent = await AiEstimatorKnowledgeBasketModel.findOne({ _id: snapshot.target.basketId, status: "active" }).session(session).lean().exec();
      if (!parent) findings.push(finding(basketId, "PARENT_BASKET_UNAVAILABLE", "The selected Main Basket is no longer active."));
      else {
        try { await readBasketQualityRevision(parent, session); }
        catch (error) { findings.push(...errorFindings(error, basketId)); }
      }
      if (!options.forSave) {
        if (await AiEstimatorKnowledgeSubBasketModel.exists({ basketId, nameNormalized: normalizeKnowledgeIdentity(snapshot.subBaskets[0]!.payload.name) }).session(session)) {
          findings.push(finding(snapshot.subBaskets[0]!.resourceId, "DUPLICATE_IDENTITY", "A Sub-Basket with this name already exists under the selected Main Basket."));
        }
        const existingLines = await AiEstimatorKnowledgeMainLineModel.find({ basketId, nameNormalized: { $in: snapshot.mainLines.map((line) => normalizeKnowledgeIdentity(line.payload.name)) } }).select({ nameNormalized: 1 }).session(session).lean().exec();
        for (const line of snapshot.mainLines) if (existingLines.some((existing) => existing.nameNormalized === normalizeKnowledgeIdentity(line.payload.name))) {
          findings.push(finding(line.resourceId, "DUPLICATE_IDENTITY", "A Main Line with this name already exists under the selected Main Basket."));
        }
      }
    } else {
      const duplicate = await AiEstimatorKnowledgeBasketModel.exists({ nameNormalized: normalizeKnowledgeIdentity(snapshot.basket.payload.name) }).session(session);
      if (duplicate && !options.forSave) findings.push(finding(basketId, "DUPLICATE_IDENTITY", "A Main Basket already uses this name. Rename the proposal before approval."));
    }
    if (snapshot.requestMode === "hierarchy_intake") return findings;
    const byLine = new Map(snapshot.mainLines.map((line) => [line.resourceId, sectionsFor(snapshot, line.resourceId)]));
    // A draft must be repairable one resource at a time when several live
    // references become unavailable. Readiness and publication still inspect all.
    const target = options.forSave ? options.saveTarget : undefined;
    if (target?.kind === "section" && !byLine.has(target.mainLineId)) return [finding(target.mainLineId, "INVALID_SAVE_TARGET", "The edited Main Line does not belong to this proposal.")];
    for (const [mainLineId, sections] of byLine) {
      if (target && (target.kind === "quality" || mainLineId !== target.mainLineId)) continue;
      for (const blocker of options.forSave ? [] : completenessForRows(mainLineId, sections).blockers) findings.push({
        ...finding(snapshot.sections.find((section) => section.parentId === mainLineId && section.payload.sectionKey === blocker.sectionKey)?.resourceId ?? mainLineId, blocker.code, blocker.message),
        mainLineId, sectionKey: blocker.sectionKey
      });
      try {
        await validateKnowledgeProposalSectionRows(target?.kind === "section" ? savedSectionValidationRows(sections, target.sectionKey) : sections, session, masterResolver);
        if (!target || target.kind === "section" && target.sectionKey === "pricing") {
          await validateKnowledgeProposalPriceCommands(sectionPayload(sections, "pricing"), session, masterResolver);
          if (target) validateRetainedSlabSpecifications(sections);
        }
      } catch (error) { findings.push(...errorFindings(error, mainLineId, mainLineId)); }
    }
    try { if (target?.kind !== "quality") await validateRelationships(snapshot, byLine, session, target); }
    catch (error) { findings.push(...errorFindings(error, basketId)); }
    if (snapshot.quality && (!target || target.kind === "quality")) {
      const parameters = snapshot.quality.payload.parameters;
      const issues = validateSharedQualityChecklistForSave(parameters);
      if (!issues.length) issues.push(...await validateKnowledgeQualityControlOptionReferences(parameters, session));
      findings.push(...issues.map((issue) => finding(snapshot.quality!.resourceId, issue.code, issue.message, issue.path)));
    }
    return findings;
  } finally { if (!existingSession) await session.endSession(); }
}

/** Keep actual cross-section dependencies without rechecking unrelated stale
 * references in another editor. Whole-snapshot activation uses the full rows. */
function savedSectionValidationRows(sections: Row[], sectionKey: KnowledgeSectionKey): Row[] {
  const selected = sections.filter((section) => section.sectionKey === sectionKey);
  const addFields = (key: KnowledgeSectionKey, fields: string[]) => {
    const section = sections.find((entry) => entry.sectionKey === key);
    if (!section) return;
    const payload = row(section.payload);
    selected.push({ ...section, payload: Object.fromEntries(fields.filter((field) => Object.hasOwn(payload, field)).map((field) => [field, payload[field]])) });
  };
  if (sectionKey === "overview") addFields("quantity-margin", ["quantitySlabs", "gapBehavior"]);
  if (sectionKey === "quantity-margin") {
    if (rows(sectionPayload(sections, "quantity-margin").quantitySlabs).length) addFields("overview", ["uomId"]);
    addFields("pricing", ["specifications"]);
  }
  return selected;
}
function validateRetainedSlabSpecifications(sections: Row[]): void {
  const ids = new Set(rows(sectionPayload(sections, "pricing").specifications).map((entry) => entry.id ?? entry._id));
  const missing = rows(sectionPayload(sections, "quantity-margin").slabRates).find((entry) => !ids.has(entry.specificationId));
  if (missing) throw new ApiError(409, "KNOWLEDGE_REFERENCE_INVALID", "A saved slab rate still references a removed Specification.",
    { "payload.specifications": "Remove or update the related slab rate before removing this Specification." });
}

export function validateProposalStructure(snapshot: ProposalPublicationSnapshot, forSave = false): ProposalFinding[] {
  const findings: ProposalFinding[] = [];
  const basketId = snapshot.basket.resourceId;
  const all: ProposalResource[] = [snapshot.basket, ...snapshot.subBaskets, ...snapshot.mainLines, ...snapshot.sections, ...(snapshot.quality ? [snapshot.quality] : []), ...(snapshot.masters ?? [])];
  const seen = new Set<string>();
  let bytes = 0;
  for (const resource of all) {
    if (resource.proposalId !== snapshot.proposalId || seen.has(resource.resourceId)) findings.push(finding(resource.resourceId, "INVALID_PROPOSAL_RESOURCE", "Resource identity does not belong to this proposal or is duplicated."));
    seen.add(resource.resourceId);
    const size = Buffer.byteLength(JSON.stringify(resource.payload), "utf8"); bytes += size;
    if (size > PROPOSAL_LIMITS.resourceBytes) findings.push(finding(resource.resourceId, "PROPOSAL_LIMIT_EXCEEDED", "A saved resource exceeds 240 KiB."));
  }
  if (bytes > PROPOSAL_LIMITS.snapshotBytes || snapshot.subBaskets.length > PROPOSAL_LIMITS.subBaskets || snapshot.mainLines.length > PROPOSAL_LIMITS.mainLines) findings.push(finding(basketId, "PROPOSAL_LIMIT_EXCEEDED", "A proposal supports up to 50 Sub-Baskets, 100 Main Lines and 8 MiB of saved content."));
  for (const kind of ["uom", "surface"] as const) {
    const masters = (snapshot.masters ?? []).filter((master) => master.kind === kind);
    if (masters.length > (kind === "uom" ? PROPOSAL_LIMITS.uoms : PROPOSAL_LIMITS.surfaces)) findings.push(finding(basketId, "PROPOSAL_LIMIT_EXCEEDED", "A proposal supports at most 100 proposed values per master kind."));
    const names = new Set<string>(); const codes = new Set<string>();
    for (const master of masters) {
      try {
        const expected = normalizeProposalMaster(kind === "uom" ? "uoms" : "surfaces", master.resourceId, { ...master.payload, expectedVersion: 1 });
        const name = normalizeKnowledgeIdentity(expected.name); const code = normalizeKnowledgeIdentity(expected.code);
        if (master.parentId !== null || master.payload.name !== expected.name || master.payload.code !== expected.code || names.has(name) || codes.has(code)) {
          findings.push(finding(master.resourceId, "INVALID_IDENTITY", "A proposed value must have a unique normalized name and server-generated code."));
        }
        names.add(name); codes.add(code);
      } catch (error) { findings.push(...errorFindings(error, master.resourceId)); }
    }
  }
  if ((snapshot.masters ?? []).some((master) => master.kind !== "uom" && master.kind !== "surface")) findings.push(finding(basketId, "INVALID_PROPOSAL_RESOURCE", "Unsupported proposed master kind."));
  const subTarget = snapshot.target?.kind === "new_sub_basket";
  if (snapshot.requestMode === "hierarchy_intake") {
    if (snapshot.subBaskets.length !== 1 || snapshot.sections.length || snapshot.quality || snapshot.masters?.length) {
      findings.push(finding(basketId, "INVALID_INTAKE_CONTENT", "A hierarchy request contains one Sub Basket and Main Line names without Configuration content."));
    }
    for (const resource of [snapshot.basket, ...snapshot.subBaskets, ...snapshot.mainLines]) {
      if (Object.keys(resource.payload).some((key) => !["name", "description", "displayOrder"].includes(key))
        || (resource.payload.description !== null && (typeof resource.payload.description !== "string" || resource.payload.description.length > 4000))
        || (resource.kind === "main_line" && resource.payload.description !== null)) {
        findings.push(finding(resource.resourceId, "INVALID_INTAKE_CONTENT", "Only basket metadata and Main Line names can be requested."));
      }
    }
    if (!forSave) {
      if (!snapshot.mainLines.length) findings.push(finding(basketId, "PROPOSAL_HIERARCHY_REQUIRED", "Add at least one Main Line before submitting."));
      for (const resource of [...(subTarget ? [] : [snapshot.basket]), ...snapshot.subBaskets]) {
        if (typeof resource.payload.description !== "string" || !resource.payload.description.trim()) findings.push(finding(resource.resourceId, "DESCRIPTION_REQUIRED", "Enter a description before submitting.", `${resource.kind}.description`));
      }
    }
  }
  if (subTarget && (snapshot.target!.kind !== "new_sub_basket" || snapshot.target!.basketId !== basketId || snapshot.subBaskets.length !== 1 || snapshot.quality !== null)) {
    findings.push(finding(basketId, "INVALID_PROPOSAL_TARGET", "A Sub-Basket proposal must contain exactly one child under its immutable existing Main Basket, without shared-quality edits."));
  }
  if (!subTarget && !forSave && (!snapshot.subBaskets.length || !snapshot.mainLines.length)) findings.push(finding(basketId, "PROPOSAL_HIERARCHY_REQUIRED", "Add at least one Sub-Basket and Main Line before submitting."));
  const subIds = new Set(snapshot.subBaskets.map((sub) => sub.resourceId));
  const lineIds = new Set(snapshot.mainLines.map((line) => line.resourceId));
  for (const group of [[snapshot.basket], snapshot.subBaskets, snapshot.mainLines]) {
    const names = new Set<string>();
    for (const resource of group) {
      const name = resource.payload.name;
      const normalized = typeof name === "string" ? normalizeKnowledgeIdentity(name) : "";
      if (!normalized || name.length > 240 || names.has(normalized)) findings.push(finding(resource.resourceId, "INVALID_IDENTITY", "Use a unique name of up to 240 characters.", "name"));
      names.add(normalized);
      if (!Number.isSafeInteger(resource.payload.displayOrder) || resource.payload.displayOrder < 0) findings.push(finding(resource.resourceId, "INVALID_DISPLAY_ORDER", "Display order must be a nonnegative integer.", "displayOrder"));
    }
  }
  for (const sub of snapshot.subBaskets) {
    if (sub.parentId !== basketId) findings.push(finding(sub.resourceId, "INVALID_PARENT", "The Sub-Basket must belong to this proposal's Main Basket."));
    if (!subTarget && !forSave && !snapshot.mainLines.some((line) => line.parentId === sub.resourceId)) findings.push(finding(sub.resourceId, "EMPTY_SUB_BASKET", "Add a Main Line or remove the empty Sub-Basket."));
  }
  for (const line of snapshot.mainLines) if (!line.parentId || !subIds.has(line.parentId)) findings.push(finding(line.resourceId, "INVALID_PARENT", "Select a Sub-Basket in this proposal."));
  const sectionKeys = new Set<string>();
  let priceCount = 0;
  for (const resource of snapshot.sections) {
    const { sectionKey, payload } = resource.payload;
    if (subTarget && sectionKey === "quality" && (resource.payload.applicability !== "not_configured" || Object.keys(payload).length)) {
      findings.push(finding(resource.resourceId, "PROPOSAL_PARENT_READ_ONLY", "The existing Main Basket's Quality Parameters are inherited and read-only."));
    }
    const identity = `${resource.parentId}:${sectionKey}`;
    if (!resource.parentId || !lineIds.has(resource.parentId) || !AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.includes(sectionKey) || sectionKeys.has(identity)) findings.push(finding(resource.resourceId, "INVALID_SECTION", "A Main Line section is missing its parent or has been duplicated."));
    sectionKeys.add(identity);
    if (sectionKey === "pricing") {
      const count = rows(payload.priceEntries).length; priceCount += count;
      if (count > PROPOSAL_LIMITS.pricesPerLine) findings.push(finding(resource.resourceId, "PROPOSAL_LIMIT_EXCEEDED", "A Main Line supports at most 100 saved prices."));
    }
  }
  if (priceCount > PROPOSAL_LIMITS.prices) findings.push(finding(basketId, "PROPOSAL_LIMIT_EXCEEDED", "A proposal supports at most 2,000 saved prices."));
  if (snapshot.quality && snapshot.quality.parentId !== basketId) findings.push(finding(snapshot.quality.resourceId, "INVALID_PARENT", "The quality checklist must belong to this Main Basket."));
  return findings;
}

/** Resolve the virtual graph against active live identities without installing
 * proposal nodes in the Configuration collections. */
async function validateRelationships(snapshot: ProposalPublicationSnapshot, byLine: ReadonlyMap<string, Row[]>, session: ClientSession,
  targetSection?: Extract<ProposalSaveValidationTarget, { kind: "section" }>): Promise<void> {
  const ownBasket = snapshot.basket.resourceId;
  const ownLines = new Map(snapshot.mainLines.map((line) => [line.resourceId, line]));
  const ownSubs = new Map(snapshot.subBaskets.map((sub) => [sub.resourceId, sub]));
  const edges: Array<{ fromId: string; toId: string }> = [];
  const unavailable = (): never => { throw new ApiError(409, "KNOWLEDGE_REFERENCE_INVALID", "A relationship target is unavailable or does not belong to the selected parent."); };
  const basketExists = async (id: unknown): Promise<boolean> => id === ownBasket || Boolean(typeof id === "string" && await AiEstimatorKnowledgeBasketModel.exists({ _id: id, status: "active" }).session(session));
  const subExists = async (id: unknown, basketId: unknown): Promise<boolean> => typeof id === "string" && (ownSubs.has(id) ? basketId === ownBasket : Boolean(await AiEstimatorKnowledgeSubBasketModel.exists({ _id: id, basketId }).session(session)));
  for (const [mainLineId, sections] of byLine) {
    for (const relation of itemRelationsForRows(mainLineId, sections)) if (relation.dependency) edges.push({ fromId: mainLineId, toId: relation.targetMainLineId });
    if (targetSection && targetSection.mainLineId !== mainLineId) continue;
    const editedSections = targetSection ? sections.filter((section) => section.sectionKey === targetSection.sectionKey) : sections;
    for (const relation of itemRelationsForRows(mainLineId, editedSections)) {
      if (relation.targetMainLineId === mainLineId) throw new ApiError(409, "DEPENDENCY_CYCLE", "An estimation item cannot reference itself.");
      const own = ownLines.get(relation.targetMainLineId);
      const target = own ? { basketId: ownBasket } : await AiEstimatorKnowledgeMainLineModel.findOne({ _id: relation.targetMainLineId, status: "active", activeRevisionId: { $ne: null } }).select({ basketId: 1 }).session(session).lean().exec();
      if (!target || (relation.targetBasketId && target.basketId !== relation.targetBasketId) || !await basketExists(target.basketId)) unavailable();
    }
    for (const exclusion of activeRows(sectionPayload(editedSections, "scope").exclusions)) if (exclusion.targetBasketId && !await basketExists(exclusion.targetBasketId)) unavailable();
    for (const rule of activeRows(sectionPayload(editedSections, "recommendations").budgetAlterations)) {
      const target = normalizeKnowledgeBudgetAlterationTarget(rule);
      if (!target || !await basketExists(rule.targetBasketId)) unavailable();
      if (rule.targetSubBasketId && !await subExists(rule.targetSubBasketId, rule.targetBasketId)) unavailable();
      if (target!.targetKind === "sub_basket") {
        if (!rule.targetSubBasketId || !await subExists(rule.targetSubBasketId, rule.targetBasketId)) unavailable();
        if (ownLines.get(mainLineId)?.parentId === rule.targetSubBasketId) throw new ApiError(409, "KNOWLEDGE_REFERENCE_INVALID", "Select a Sub-Basket that does not contain this item.");
      } else {
        if (rule.targetMainLineId === mainLineId) throw new ApiError(409, "KNOWLEDGE_REFERENCE_INVALID", "Select a different related item.");
        const own = ownLines.get(String(rule.targetMainLineId));
        if (own) {
          if (rule.targetType === "temporary" || rule.targetBasketId !== ownBasket || (rule.targetSubBasketId ?? null) !== own.parentId) unavailable();
        } else if (!await AiEstimatorKnowledgeMainLineModel.exists({ _id: rule.targetMainLineId, basketId: rule.targetBasketId, subBasketId: rule.targetSubBasketId ?? null, status: { $in: ["draft", "active"] }, itemType: rule.targetType === "temporary" ? "temporary" : { $ne: "temporary" } }).session(session)) unavailable();
      }
    }
  }
  const activeLines = await AiEstimatorKnowledgeMainLineModel.find({ status: "active", activeRevisionId: { $ne: null } }).select({ activeRevisionId: 1 }).session(session).lean().exec();
  const activeSections = await AiEstimatorKnowledgeSectionModel.find({ revisionId: { $in: activeLines.map((line) => line.activeRevisionId) }, sectionKey: { $in: ["advanced", "scope"] }, applicability: "configured" }).session(session).lean().exec();
  for (const section of activeSections) for (const relation of itemRelationsForRows(String(section.mainLineId), [section])) if (relation.dependency) edges.push({ fromId: String(section.mainLineId), toId: relation.targetMainLineId });
  if (validateAcyclicGraph([...new Set(edges.flatMap((edge) => [edge.fromId, edge.toId]))], edges).length) throw new ApiError(409, "DEPENDENCY_CYCLE", "Estimation item dependencies are invalid.");
}

export interface PublishProposalSnapshotInput {
  snapshot: ProposalPublicationSnapshot; actorId: string; session: ClientSession; occurredAt: Date;
  audit: Pick<AuditService, "appendInMongoTransaction">; createId: () => string;
}

/** The caller guards actor/state/CAS and commits the request decision with this
 * entire result. Never starts or commits an independent transaction. */
export async function publishProposalSnapshot(input: PublishProposalSnapshotInput): Promise<ProposalPublishedMapping> {
  if (!input.session.inTransaction()) throw new Error("Proposal publication requires a caller-owned Mongo transaction.");
  const { snapshot, actorId, session, occurredAt, audit, createId } = input;
  const findings = await validateProposalSnapshot(snapshot, session);
  const duplicate = findings.find((issue) => issue.code === "DUPLICATE_IDENTITY");
  if (duplicate) throw new ApiError(409, "DUPLICATE_IDENTITY", duplicate.message);
  if (findings.length) throw new ApiError(422, "PROPOSAL_NOT_READY", "Resolve the saved proposal findings before approval.", Object.fromEntries(findings.map((issue, index) => [`${issue.resourceId}.${issue.path ?? index}`, issue.message])));
  const publishedMasters: NonNullable<ProposalPublishedMapping["masters"]> = [];
  for (const master of snapshot.masters ?? []) {
    const kind = master.kind === "uom" ? "uoms" : "surfaces";
    const model = proposalMasterModel(kind);
    const displayOrder = await allocateAiEstimatorKnowledgeDisplayOrder({ scope: `masters:${kind}`, resourceModel: model, resourceFilter: {}, session });
    try {
      await model.create([{ _id: master.resourceId, ...master.payload,
        nameNormalized: normalizeKnowledgeIdentity(master.payload.name), codeNormalized: normalizeKnowledgeIdentity(master.payload.code),
        displayOrder, status: "active", version: 1, createdById: actorId, updatedById: actorId, createdAt: occurredAt, updatedAt: occurredAt,
        archivedAt: null, archivedById: null }], { session });
    } catch (error) {
      if (row(error).code === 11000) throw new ApiError(409, "DUPLICATE_IDENTITY", "A proposed UOM or Surface now conflicts with Configuration. Rename it or select the existing shared value.");
      throw error;
    }
    await audit.appendInMongoTransaction({ actorId, action: "ai_estimator_knowledge_master_created", entityType: `ai_estimator_knowledge_${master.kind}`,
      entityId: master.resourceId, occurredAt: occurredAt.toISOString(), newValues: { masterType: kind, sourceProposalId: snapshot.proposalId,
        status: "active", version: 1, displayOrder, ...(kind === "surfaces" ? { code: master.payload.code, name: master.payload.name, description: master.payload.description } : {}) } }, session);
    publishedMasters.push({ kind, resourceId: master.resourceId, masterId: master.resourceId });
  }
  const basketId = snapshot.basket.resourceId;
  const stamps = { createdById: actorId, updatedById: actorId, createdAt: occurredAt, updatedAt: occurredAt };
  const subTarget = snapshot.target?.kind === "new_sub_basket";
  if (subTarget) {
    const sub = snapshot.subBaskets[0]!;
    await createKnowledgeHierarchyInSession({ actorId, basketId, mainLineId: null,
      input: { subBasketName: sub.payload.name }, newSubBasketId: sub.resourceId, newSubBasketDescription: sub.payload.description, requireNewSubBasket: true,
      occurredAt, session, uuid: createId, audit });
  } else {
    const displayOrder = await allocateAiEstimatorKnowledgeDisplayOrder({ scope: "baskets", resourceModel: AiEstimatorKnowledgeBasketModel, resourceFilter: {}, session });
    try {
      await AiEstimatorKnowledgeBasketModel.create([{ _id: basketId, name: snapshot.basket.payload.name, nameNormalized: normalizeKnowledgeIdentity(snapshot.basket.payload.name), description: snapshot.basket.payload.description, displayOrder, status: "active", version: 1, ...stamps }], { session });
    } catch (error) {
      if (row(error).code === 11000) throw new ApiError(409, "DUPLICATE_IDENTITY", "A Main Basket already uses this name. Rename the proposal before approval.");
      throw error;
    }
    await audit.appendInMongoTransaction({ actorId, action: "ai_estimator_knowledge_basket_created", entityType: "ai_estimator_knowledge_basket", entityId: basketId, occurredAt: occurredAt.toISOString(), newValues: { sourceProposalId: snapshot.proposalId, displayOrder, status: "active", version: 1 } }, session);
    for (const sub of snapshot.subBaskets) {
      await observeExplicitAiEstimatorKnowledgeDisplayOrder({ scope: `sub-baskets:${basketId}`, resourceModel: AiEstimatorKnowledgeSubBasketModel, resourceFilter: { basketId }, displayOrder: sub.payload.displayOrder, session });
      await AiEstimatorKnowledgeSubBasketModel.create([{ _id: sub.resourceId, basketId, name: sub.payload.name, nameNormalized: normalizeKnowledgeIdentity(sub.payload.name), description: sub.payload.description, displayOrder: sub.payload.displayOrder, version: 1, ...stamps }], { session });
      await audit.appendInMongoTransaction({ actorId, action: "ai_estimator_knowledge_sub_basket_created", entityType: "ai_estimator_knowledge_sub_basket", entityId: sub.resourceId, occurredAt: occurredAt.toISOString(), newValues: { basketId, sourceProposalId: snapshot.proposalId, displayOrder: sub.payload.displayOrder, version: 1 } }, session);
    }
  }
  const mainLines: ProposalPublishedMapping["mainLines"] = [];
  for (const line of snapshot.mainLines) {
    await createKnowledgeHierarchyInSession({ actorId, basketId, mainLineId: line.resourceId, input: { subBasketId: line.parentId!, name: line.payload.name, description: line.payload.description, ...(subTarget ? {} : { displayOrder: line.payload.displayOrder }) }, occurredAt, session, uuid: createId, audit });
    const created = await AiEstimatorKnowledgeMainLineModel.findById(line.resourceId).session(session).lean().exec();
    mainLines.push({ mainLineId: line.resourceId, revisionId: String(created!.draftRevisionId) });
  }
  const pendingGraph = new Map<string, Row[]>();
  const prices: ProposalPublishedMapping["prices"] = [];
  const publishedSections: ProposalPublishedMapping["sections"] = [];
  let qualityRevisionId: string | null = null;
  if (subTarget) {
    const parent = await AiEstimatorKnowledgeBasketModel.findById(basketId).session(session).lean().exec();
    qualityRevisionId = (await readBasketQualityRevision(parent!, session))?._id ?? null;
  }
  if (snapshot.requestMode === "hierarchy_intake") {
    return { basketId, subBasketIds: snapshot.subBaskets.map((sub) => sub.resourceId), mainLines, prices: [], sections: [], qualityRevisionId };
  }
  for (const line of mainLines) {
    const sections = sectionsFor(snapshot, line.mainLineId);
    for (const section of sections) {
      const key = section.sectionKey as typeof AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS[number];
      let payload = row(section.payload);
      if (key === "pricing") {
        payload = await materializePriceCommands({ mainLineId: line.mainLineId, revisionId: line.revisionId, payload, previousPayload: {}, actorId, occurredAt, session, uuid: createId, audit });
        for (const entry of rows(payload.priceEntries)) prices.push({ mainLineId: line.mainLineId, priceEntryId: String(entry.priceEntryId), priceVersionId: String(entry.priceVersionId) });
      }
      else if (key === "recommendations") payload = normalizeRecommendationPayload(payload);
      await coordinateKnowledgeProposalSectionReferences(key, payload, session);
      section.payload = payload;
      const storedSection = await AiEstimatorKnowledgeSectionModel.findOneAndUpdate(
        { mainLineId: line.mainLineId, revisionId: line.revisionId, sectionKey: key },
        { $set: { payload, applicability: section.applicability, updatedById: actorId, updatedAt: occurredAt } },
        { runValidators: true, returnDocument: "after", session }
      ).select({ _id: 1 }).lean().exec();
      if (!storedSection) throw new Error("A newly created proposal section is unavailable.");
      publishedSections.push({ mainLineId: line.mainLineId, sectionKey: key, sectionId: String(storedSection._id) });
    }
    pendingGraph.set(line.mainLineId, sections);
  }
  await coordinateAdditionalReferences(snapshot, pendingGraph, session);
  if (snapshot.quality) {
    const parameters = mandatoryQualityParameters(snapshot.quality.payload.parameters.map(row));
    const qualityId = `knowledge-basket-quality-${createId()}`;
    qualityRevisionId = qualityId;
    const contentDigest = basketQualityDigest(basketId, parameters);
    await AiEstimatorKnowledgeBasketQualityRevisionModel.create([{ _id: qualityId, basketId, revisionNumber: 1, parameters, contentDigest, createdById: actorId, createdAt: occurredAt }], { session });
    await AiEstimatorKnowledgeBasketModel.updateOne({ _id: basketId }, { $set: { qualityRevisionId: qualityId }, $inc: { version: 1 } }, { session });
    await audit.appendInMongoTransaction({ actorId, action: "ai_estimator_knowledge_basket_updated", entityType: "ai_estimator_knowledge_basket", entityId: basketId, occurredAt: occurredAt.toISOString(), newValues: { qualityRevisionId: qualityId, qualityRevisionNumber: 1, contentDigest, parameterCount: parameters.length } }, session);
  }
  for (const line of mainLines) await activateKnowledgeRevisionInSession({ ...line, actorId, expectedVersion: 1, occurredAt, session, audit, pendingGraph });
  return { basketId, subBasketIds: snapshot.subBaskets.map((sub) => sub.resourceId), mainLines, prices, sections: publishedSections, qualityRevisionId, ...(publishedMasters.length ? { masters: publishedMasters } : {}) };
}

/** Locks all newly used references, including normal activation's read-only UOM
 * and dependency checks, against concurrent archive/delete/status mutations. */
async function coordinateAdditionalReferences(snapshot: ProposalPublicationSnapshot, byLine: ReadonlyMap<string, Row[]>, session: ClientSession): Promise<void> {
  const ids = { uoms: new Set<string>(), modes: new Set<string>(), priorities: new Set<string>(), surfaces: new Set<string>(), baskets: new Set<string>(), lines: new Set<string>() };
  const add = (set: Set<string>, value: unknown) => { if (typeof value === "string" && value) set.add(value); };
  for (const [mainLineId, sections] of byLine) {
    const overview = sectionPayload(sections, "overview");
    add(ids.uoms, overview.uomId);
    for (const key of ["overview", "scope"]) {
      const payload = sectionPayload(sections, key);
      for (const value of Array.isArray(payload.modeIds) ? payload.modeIds : []) add(ids.modes, value);
      for (const value of Array.isArray(payload.surfaceIds) ? payload.surfaceIds : []) add(ids.surfaces, value);
    }
    for (const entry of activeRows(sectionPayload(sections, "execution").productivity)) add(ids.uoms, entry.uomId);
    for (const entry of activeRows(sectionPayload(sections, "recommendations").recommendations)) add(ids.priorities, entry.priorityId);
    for (const relation of itemRelationsForRows(mainLineId, sections)) { add(ids.lines, relation.targetMainLineId); add(ids.baskets, relation.targetBasketId); }
  }
  for (const own of snapshot.mainLines) ids.lines.delete(own.resourceId);
  ids.baskets.delete(snapshot.basket.resourceId);
  const targets: Array<[Model<any>, Set<string>, Row]> = [
    [AiEstimatorKnowledgeUomModel, ids.uoms, { status: "active" }], [AiEstimatorKnowledgeModeModel, ids.modes, { status: "active" }],
    [AiEstimatorKnowledgePriorityModel, ids.priorities, { status: "active" }], [AiEstimatorKnowledgeSurfaceModel, ids.surfaces, { status: "active" }],
    [AiEstimatorKnowledgeBasketModel, ids.baskets, { status: "active" }], [AiEstimatorKnowledgeMainLineModel, ids.lines, { status: "active", activeRevisionId: { $ne: null } }]
  ];
  for (const [model, references, filter] of targets) for (const id of [...references].sort()) {
    const result = await model.updateOne({ _id: id, ...filter }, { $inc: { dependencyEpoch: 1 } }, { session, timestamps: false });
    if (result.matchedCount !== 1) throw new ApiError(409, "KNOWLEDGE_REFERENCE_INVALID", "A referenced configuration value changed. Refresh the saved review before approval.");
  }
}

/** Save canonical values entirely inside the proposal. Browser references can
 * resolve only prices from the previous owned resource, never live prices. */
export function normalizeProposalPriceCommands(payload: Row, previousPayload: Row, createId: () => string): Row {
  assertValidKnowledgeSectionPayload("pricing", payload);
  payload = normalizeKnowledgeProposalSectionPayload("pricing", payload, previousPayload);
  const prior = new Map(rows(previousPayload.priceEntries)
    .filter((command) => command.operation === "append" && typeof command.priceEntryId === "string")
    .map((command) => [String(command.priceEntryId), command]));
  const policy = AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY;
  const used = new Set<string>();
  const priceEntries = rows(payload.priceEntries).map((command) => {
    const reject = (): never => { throw new ApiError(409, "KNOWLEDGE_REFERENCE_INVALID", "The saved proposal price is unavailable. Reload this Main Line before saving."); };
    if (command.operation === "reference") {
      const retained = prior.get(String(command.priceVersionId));
      if (!retained || command.priceEntryId !== command.priceVersionId || used.has(String(command.priceEntryId))) return reject();
      used.add(String(command.priceEntryId));
      return structuredClone(retained);
    }
    if (command.operation === "append") {
      // Compatibility commands also receive server identities; supplied IDs do
      // not grant permission to import another proposal or live price.
      if (command.taxRuleId !== policy.rule.id || command.taxVersionId !== policy.version.id || command.treatment !== policy.version.treatment) throw new ApiError(409, "KNOWLEDGE_TAX_MISMATCH", "Proposal prices use the fixed GST 18% policy.");
      return { ...structuredClone(command), priceEntryId: `proposal-price-${createId()}` };
    }
    const source = command.sourcePriceVersionId == null ? null : prior.get(String(command.sourcePriceVersionId));
    if (command.sourcePriceVersionId != null && !source) return reject();
    const priceEntryId = source ? String(source.priceEntryId) : `proposal-price-${createId()}`;
    if (used.has(priceEntryId)) return reject();
    used.add(priceEntryId);
    return { operation: "append", priceEntryId, vendorId: command.vendorId, uomId: command.uomId,
      specificationId: null, modeId: source?.modeId ?? null, taxRuleId: policy.rule.id,
      taxVersionId: policy.version.id, treatment: policy.version.treatment, inputAmountPaise: command.inputAmountPaise,
      effectiveFrom: command.effectiveFrom, effectiveTo: command.effectiveTo, status: "active" };
  });
  return { ...structuredClone(payload), ...(payload.priceEntries === undefined ? {} : { priceEntries }) };
}

/** Read projection only. The resource's canonical payload/digest stays unchanged;
 * the resource version and head scope these synthetic price identities. */
export function projectProposalPricingPayload(payload: Row, _mainLineId?: string, _revisionId?: string, versionNumber = 1): Row {
  const priceEntries = rows(payload.priceEntries).map((command) => {
    if (command.operation !== "append") return structuredClone(command);
    const amounts = deriveTaxAmounts({ inputAmountPaise: Number(command.inputAmountPaise), rateBps: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.version.rateBps, treatment: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.version.treatment });
    return { operation: "reference", priceEntryId: command.priceEntryId, priceVersionId: command.priceEntryId,
      priceVersion: { id: command.priceEntryId, priceEntryId: command.priceEntryId, versionNumber,
        vendorId: command.vendorId, uomId: command.uomId, specificationId: null, modeId: command.modeId ?? null,
        taxRuleId: command.taxRuleId, taxVersionId: command.taxVersionId,
        ...amounts, effectiveFrom: command.effectiveFrom, effectiveTo: command.effectiveTo, status: command.status, reviewRequired: false } };
  });
  return { ...structuredClone(payload), ...(payload.priceEntries === undefined ? {} : { priceEntries }) };
}
