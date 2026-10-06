import { createHash, randomUUID } from "node:crypto";
import mongoose, { type ClientSession } from "mongoose";
import { createKnowledgeRevisionDigest } from "../domain/ai-estimator-knowledge-completeness.js";
import { selectCurrentMainLineRevision } from "../domain/ai-estimator-knowledge-current-revision.js";
import { AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS, type KnowledgeSectionApplicability, type KnowledgeSectionKey } from "../domain/ai-estimator-knowledge.js";
import { analyzePurchaseOrderModeSettings, buildPurchaseOrderModeCalculationStages, suggestStandardSubVendorCost,
  purchaseOrderModeDecisionSaveSchema, purchaseOrderModePreviewSchema,
  type PurchaseOrderModeDecisionDto, type PurchaseOrderModeDecisionSaveInput, type PurchaseOrderModeDraftPreview,
  type PurchaseOrderModeDraftPreviewInput, type PurchaseOrderModeIntegrityBasis, type PurchaseOrderModeIssue,
  type PurchaseOrderModeKey, type PurchaseOrderModePriceReference, type PurchaseOrderModeResolution,
  type PurchaseOrderModeStandardSuggestion,
  type PurchaseOrderModeSourceLine } from "../domain/project-purchase-order-mode.js";
import { ApiError } from "../middleware/errors.js";
import { AiEstimatorKnowledgeMainLineModel } from "../models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgePriceVersionModel } from "../models/AiEstimatorKnowledgePriceVersion.js";
import { AiEstimatorKnowledgeRevisionModel } from "../models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeTaxVersionModel } from "../models/AiEstimatorKnowledgeTaxVersion.js";
import { AiEstimatorKnowledgeUomModel } from "../models/AiEstimatorKnowledgeUom.js";
import { ProjectPurchaseOrderModeDecisionModel, ProjectPurchaseOrderModeDecisionReceiptModel } from "../models/ProjectPurchaseOrderModeDecision.js";
import { ProjectPurchaseOrderRequestModel } from "../models/ProjectPurchaseOrderRequest.js";
import type { ProcurementBasketProjectRate } from "../domain/procurement-basket-base-rate.js";
import type { AuditService } from "./audit.service.js";
import type { PublicUser } from "./auth.service.js";
import { assertProcurementProjectAccess, procurementItemSourceSnapshot } from "./procurement.service.js";

type Row = Record<string, any>;
type ModeSource = { estimateId: string; estimateVersion: number; estimateReviewRoundId: string | null;
  allLineItems: readonly PurchaseOrderModeSourceLine[];
  mainBasketClassifications?: Readonly<Record<string, "standard" | "special">> };
export type PurchaseOrderModeChildReference = {
  id: string; sourceLineItemKey: string | null; vendorId: string | null; uomId: string;
  specificationId?: string | null; modeId?: string | null;
};
export type PurchaseOrderModeProposal = {
  mode: PurchaseOrderModeKey | null; quantity: string | null; discountBps: number;
  markupBasis: "starting" | "minimum"; exceptionReason: string | null;
  expectedObservedDigest?: string;
};

export interface ProjectPurchaseOrderModeDecisionService {
  save(actor: PublicUser, projectId: string, input: PurchaseOrderModeDecisionSaveInput): Promise<PurchaseOrderModeDecisionDto>;
  preview(actor: PublicUser, projectId: string, input: PurchaseOrderModeDraftPreviewInput): Promise<PurchaseOrderModeDraftPreview>;
}

export function createProjectPurchaseOrderModeDecisionService(input: { audit: AuditService; now?: () => Date }): ProjectPurchaseOrderModeDecisionService {
  const now = input.now ?? (() => new Date());
  return {
    async preview(actor, projectId, value) {
      const parsed = purchaseOrderModePreviewSchema.safeParse(value);
      if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.",
        Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])));
      const fields = parsed.data;
      return mongoose.connection.transaction(async (session) => {
        await assertProcurementProjectAccess(actor, projectId, session);
        // A preview must never acquire the source write lock or increment its epoch.
        const source = await procurementItemSourceSnapshot(projectId, session, false);
        if (source.estimateId !== fields.estimateSource.estimateId ||
            source.estimateVersion !== fields.estimateSource.estimateVersion ||
            source.estimateReviewRoundId !== fields.estimateSource.estimateReviewRoundId) {
          sourceConflict();
        }
        const line = source.allLineItems.find((candidate) => candidate.key === fields.sourceLineItemKey);
        if (!line || !line.included || line.amountPaise === null || line.amountPaise <= 0) sourceConflict();
        const existing = await ProjectPurchaseOrderModeDecisionModel.findOne(decisionKey(projectId, source, line.key))
          .session(session).lean().exec() as Row | null;
        if (fields.expectedVersion !== (existing?.version ?? 0)) versionConflict();
        const pending = await ProjectPurchaseOrderRequestModel.exists({ projectId, status: "pending_approval" }).session(session);
        if (pending) throw new ApiError(409, "PURCHASE_ORDER_MODE_REQUEST_PENDING", "A submitted purchase order request must be decided before editing mode choices.");
        const proposed: PurchaseOrderModeProposal = { mode: fields.mode, quantity: fields.quantity,
          discountBps: fields.discountBps, markupBasis: fields.markupBasis, exceptionReason: null,
          expectedObservedDigest: fields.expectedObservedDigest };
        const resolutions = await resolvePurchaseOrderModes(projectId, source, session, {
          at: now(), proposals: new Map([[line.key, proposed]])
        });
        const resolution = resolutions.get(line.key);
        if (!resolution) throw new Error("Mode resolution omitted the approved source line.");
        validateRecoveryGuard(resolution, fields.expectedObservedDigest);
        return {
          projectId, estimateSource: fields.estimateSource, sourceLineItemKey: line.key,
          decisionVersion: existing?.version ?? 0, revision: resolution.revision, uom: resolution.uom,
          preview: resolution.preview,
          scopes: resolution.preview ? buildPurchaseOrderModeCalculationStages(resolution.preview) : [],
          issues: resolution.issues,
          ...(resolution.integrity ? { integrity: resolution.integrity } : {})
        };
      }, { readConcern: { level: "snapshot" }, readPreference: "primary" });
    },
    async save(actor, projectId, value) {
      const parsed = purchaseOrderModeDecisionSaveSchema.safeParse(value);
      if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.",
        Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])));
      const fields = parsed.data;
      const requestDigest = digest({ projectId, ...fields });
      try { return await mongoose.connection.transaction(async (session) => {
        await assertProcurementProjectAccess(actor, projectId, session);
        const previousReceipt = await ProjectPurchaseOrderModeDecisionReceiptModel.findOne({ projectId, idempotencyKey: fields.idempotencyKey })
          .session(session).lean().exec() as Row | null;
        if (previousReceipt) {
          if (previousReceipt.requestDigest !== requestDigest) idempotencyConflict();
          return previousReceipt.response as PurchaseOrderModeDecisionDto;
        }
        const source = await procurementItemSourceSnapshot(projectId, session, true);
        if (
          source.estimateId !== fields.expectedEstimateSource.estimateId ||
          source.estimateVersion !== fields.expectedEstimateSource.estimateVersion ||
          source.estimateReviewRoundId !== fields.expectedEstimateSource.estimateReviewRoundId
        ) sourceConflict();
        const line = source.allLineItems.find((candidate) => candidate.key === fields.sourceLineItemKey);
        if (!line || !line.included || line.amountPaise === null || line.amountPaise <= 0) {
          throw new ApiError(409, "PURCHASE_ORDER_MODE_SOURCE_CONFLICT", "Select a current included approved estimate line with a positive amount.");
        }
        const pending = await ProjectPurchaseOrderRequestModel.exists({ projectId, status: "pending_approval" }).session(session);
        if (pending) throw new ApiError(409, "PURCHASE_ORDER_MODE_REQUEST_PENDING", "A submitted purchase order request must be decided before editing mode choices.");
        const existing = await ProjectPurchaseOrderModeDecisionModel.findOne(decisionKey(projectId, source, line.key))
          .session(session).lean().exec() as Row | null;
        if (fields.expectedVersion !== (existing?.version ?? 0)) versionConflict();
        const proposed: PurchaseOrderModeProposal = {
          mode: fields.mode, quantity: fields.quantity, discountBps: fields.discountBps,
          markupBasis: fields.markupBasis, exceptionReason: fields.exceptionReason,
          expectedObservedDigest: fields.recovery?.expectedObservedDigest
        };
        const resolutions = await resolvePurchaseOrderModes(projectId, source, session, {
          at: now(), proposals: new Map([[line.key, proposed]])
        });
        const resolution = resolutions.get(line.key);
        if (!resolution) throw new Error("Mode resolution omitted the approved source line.");
        if (fields.mode && fields.expectedRevisionDigest !== (resolution.revision?.contentDigest ?? null)) sourceConflict();
        if (fields.mode) validateRecoveryGuard(resolution, fields.recovery?.expectedObservedDigest);
        if (fields.mode && !resolution.preview) {
          throw new ApiError(422, "PURCHASE_ORDER_MODE_UNRESOLVED", "The selected mode cannot be calculated from the approved Configuration revision.",
            Object.fromEntries(resolution.issues.map((issue) => [issue.code, issue.message])));
        }
        if (fields.exceptionReason && resolution.options.length > 0) {
          throw new ApiError(422, "PURCHASE_ORDER_MODE_EXCEPTION_NOT_ALLOWED", "A manual exception is reserved for historical lines whose saved Configuration cannot be resolved.");
        }
        const at = now();
        const revisionId = fields.mode ? resolution.revision?.id ?? null : null;
        const revisionDigest = fields.mode ? resolution.revision?.contentDigest ?? null : null;
        const integrityBasis: PurchaseOrderModeIntegrityBasis | undefined = fields.recovery && resolution.integrity ? {
          kind: "observed_unverified", activatedDigest: resolution.integrity.activatedDigest,
          observedDigest: resolution.integrity.observedDigest, reason: fields.recovery.reason,
          actorId: actor.id, acknowledgedAt: at.toISOString()
        } : undefined;
        const update = { revisionId, revisionDigest, mode: fields.mode, quantity: resolution.preview?.quantity ?? null,
          discountBps: fields.discountBps, markupBasis: fields.markupBasis, exceptionReason: fields.exceptionReason,
          ...(integrityBasis ? { integrityBasis } : {}), updatedById: actor.id, updatedAt: at };
        let stored: Row | null;
        if (existing) {
          stored = await ProjectPurchaseOrderModeDecisionModel.findOneAndUpdate({ _id: existing._id, version: fields.expectedVersion },
            { $set: update, ...(integrityBasis ? {} : { $unset: { integrityBasis: 1 } }), $inc: { version: 1 } },
            { returnDocument: "after", runValidators: true, session }).lean().exec() as Row | null;
          if (!stored) versionConflict();
        } else {
          const [created] = await ProjectPurchaseOrderModeDecisionModel.create([{ _id: `pomd-${randomUUID()}`,
            ...decisionKey(projectId, source, line.key), mainLineId: line.mainLineId ?? null,
            ...update, version: 1, createdById: actor.id, createdAt: at }], { session });
          stored = created?.toObject() as Row | undefined ?? null;
        }
        if (!stored) throw new Error("Mode decision transaction did not create a record.");
        const response = decisionDto(stored);
        await input.audit.appendInMongoTransaction({ actorId: actor.id, action: "project_purchase_order_mode_decision_saved",
          entityType: "project_purchase_order_mode_decision", entityId: response.id, occurredAt: at.toISOString(),
          oldValues: existing ? auditValues(decisionDto(existing)) : {}, newValues: auditValues(response),
          reason: fields.recovery?.reason ?? fields.exceptionReason }, session);
        await ProjectPurchaseOrderModeDecisionReceiptModel.create([{ _id: `pomr-${randomUUID()}`, projectId,
          idempotencyKey: fields.idempotencyKey, requestDigest, decisionId: response.id,
          response, createdById: actor.id, createdAt: at }], { session });
        return response;
      }, { readConcern: { level: "snapshot" }, readPreference: "primary" }); }
      catch (error) {
        if (!isDuplicateKey(error)) throw error;
        // A competing transaction may have committed either this receipt or a
        // different first decision. Re-check authorization before replaying it.
        return mongoose.connection.transaction(async (session) => {
          await assertProcurementProjectAccess(actor, projectId, session);
          const receipt = await ProjectPurchaseOrderModeDecisionReceiptModel.findOne({ projectId,
            idempotencyKey: fields.idempotencyKey }).session(session).lean().exec() as Row | null;
          if (!receipt) versionConflict();
          if (receipt.requestDigest !== requestDigest) idempotencyConflict();
          return receipt.response as PurchaseOrderModeDecisionDto;
        }, { readConcern: { level: "snapshot" }, readPreference: "primary" });
      }
    }
  };
}

/** Batch read Configuration in the caller's authorized snapshot transaction. */
export async function resolvePurchaseOrderModes(
  projectId: string,
  source: ModeSource,
  session: ClientSession,
  options: { at?: Date; children?: readonly PurchaseOrderModeChildReference[]; proposals?: ReadonlyMap<string, PurchaseOrderModeProposal>;
    standardSuggestionSink?: Map<string, PurchaseOrderModeStandardSuggestion>;
    currentMainLineNameSink?: Map<string, string>;
    projectRates?: ReadonlyMap<string, ProcurementBasketProjectRate> } = {}
): Promise<Map<string, PurchaseOrderModeResolution>> {
  if (!session.inTransaction()) throw new Error("Purchase order mode resolution requires an active transaction.");
  const at = options.at ?? new Date();
  const relevant = source.allLineItems.filter((line) => line.included && line.amountPaise !== null && line.amountPaise > 0);
  const currentMainLineIds = [...new Set(source.allLineItems.flatMap((line) =>
    line.source === "configuration" && line.mainLineId ? [line.mainLineId] : []))];
  const uomIds = [...new Set(relevant.flatMap((line) => line.uomId ? [line.uomId] : []))];
  // MongoDB transactions require one operation at a time on a session. The reads
  // are batched by revision/project, rather than parallelizing requests per line.
  const mainLines = await AiEstimatorKnowledgeMainLineModel.find({ _id: { $in: currentMainLineIds } })
    .select({ _id: 1, name: 1, status: 1, activeRevisionId: 1, draftRevisionId: 1 }).session(session).lean().exec() as Row[];
  const mainLinesById = new Map(mainLines.map((row) => [String(row._id), row]));
  const applicableRevisions = new Map(mainLines.flatMap((row) => {
    const revision = selectCurrentMainLineRevision(row);
    return revision ? [[String(row._id), revision] as const] : [];
  }));
  for (const row of mainLines) {
    if (applicableRevisions.has(String(row._id)) && typeof row.name === "string" && row.name.trim())
      options.currentMainLineNameSink?.set(String(row._id), row.name.trim());
  }
  const revisionIds = [...new Set([...applicableRevisions.values()].map((revision) => revision.id))];
  const revisions = await AiEstimatorKnowledgeRevisionModel.find({ _id: { $in: revisionIds } })
    .session(session).lean().exec() as Row[];
  const sections = await AiEstimatorKnowledgeSectionModel.find({ revisionId: { $in: revisionIds } })
    .session(session).lean().exec() as Row[];
  const uoms = await AiEstimatorKnowledgeUomModel.find({ _id: { $in: uomIds } })
    .select({ _id: 1, code: 1, name: 1, decimalScale: 1, status: 1 }).session(session).lean().exec() as Row[];
  const decisions = await ProjectPurchaseOrderModeDecisionModel.find({ projectId, estimateId: source.estimateId,
    estimateVersion: source.estimateVersion, estimateReviewRoundId: source.estimateReviewRoundId })
    .session(session).lean().exec() as Row[];
  const revisionsById = new Map(revisions.map((row) => [String(row._id), row]));
  const sectionsByRevision = new Map<string, Row[]>();
  for (const row of sections) {
    const rows = sectionsByRevision.get(String(row.revisionId)) ?? [];
    rows.push(row);
    sectionsByRevision.set(String(row.revisionId), rows);
  }
  const uomsById = new Map(uoms.map((row) => [String(row._id), row]));
  const decisionsByKey = new Map(decisions.map((row) => [String(row.sourceLineItemKey), row]));
  const allPriceIds = [...new Set(sections.flatMap((section) => section.sectionKey === "pricing" ? referencedPriceIds(asRow(section.payload) ?? {}) : []))];
  const prices = allPriceIds.length ? await AiEstimatorKnowledgePriceVersionModel.find({ _id: { $in: allPriceIds },
    revisionId: { $in: revisionIds } }).session(session).lean().exec() as Row[] : [];
  const pricesByRevision = new Map<string, Row[]>();
  for (const row of prices) {
    const rows = pricesByRevision.get(String(row.revisionId)) ?? [];
    rows.push(row);
    pricesByRevision.set(String(row.revisionId), rows);
  }
  const taxIds = [...new Set(prices.map((row) => String(row.taxVersionId)))];
  const taxes = taxIds.length ? await AiEstimatorKnowledgeTaxVersionModel.find({ _id: { $in: taxIds } })
    .session(session).lean().exec() as Row[] : [];
  const taxesById = new Map(taxes.map((row) => [String(row._id), row]));
  const childrenByKey = new Map<string, PurchaseOrderModeChildReference[]>();
  for (const child of options.children ?? []) {
    if (!child.sourceLineItemKey) continue;
    const rows = childrenByKey.get(child.sourceLineItemKey) ?? [];
    rows.push(child);
    childrenByKey.set(child.sourceLineItemKey, rows);
  }
  const result = new Map<string, PurchaseOrderModeResolution>();
  for (const line of source.allLineItems) {
    const decision = decisionsByKey.has(line.key) ? decisionDto(decisionsByKey.get(line.key)!) : null;
    const proposal = options.proposals?.get(line.key);
    const selected = proposal ?? decision;
    const unavailable = (code: string, message: string, revision: PurchaseOrderModeResolution["revision"] = null): PurchaseOrderModeResolution => ({
      state: line.included && line.amountPaise !== null && line.amountPaise > 0 && decision?.exceptionReason ? "exception" : "unavailable",
      options: [], availability: unavailableModeAvailability(code, message), decision, preview: null,
      issues: [{ code, message }], revision, uom: null, priceReferences: {}
    });
    if (!line.included || line.amountPaise === null || line.amountPaise <= 0) {
      result.set(line.key, unavailable("LINE_NOT_ACTIONABLE", "This approved estimate line is reference-only and cannot be ordered."));
      continue;
    }
    if (line.source !== "configuration" || !line.mainLineId || !line.uomId ||
      !Number.isSafeInteger(line.uomDecimalScale) || line.uomDecimalScale! < 0 || line.uomDecimalScale! > 3) {
      result.set(line.key, unavailable("CONFIGURATION_LINEAGE_MISSING", "This historical estimate line has no complete saved Configuration lineage."));
      continue;
    }
    const explicitStandard = isExplicitStandard(line, source);
    const mainLine = mainLinesById.get(line.mainLineId);
    const applicableRevision = applicableRevisions.get(line.mainLineId);
    if (!mainLine || !applicableRevision) {
      result.set(line.key, unavailable("CONFIGURATION_ITEM_UNAVAILABLE",
        "This Configuration item has no applicable saved revision."));
      continue;
    }
    const selectedRevisionId = applicableRevision.id;
    const revisionRow = revisionsById.get(selectedRevisionId);
    if (!revisionRow || String(revisionRow.mainLineId) !== line.mainLineId ||
      revisionRow.status !== applicableRevision.status) {
      result.set(line.key, unavailable("CONFIGURATION_REVISION_UNAVAILABLE",
        "This Configuration item's current saved revision is unavailable."));
      continue;
    }
    const revision: PurchaseOrderModeResolution["revision"] = {
      id: String(revisionRow._id), version: Number(revisionRow.version), status: revisionRow.status,
      contentDigest: typeof revisionRow.contentDigest === "string" ? revisionRow.contentDigest : null
    };
    const sectionRows = sectionsByRevision.get(selectedRevisionId) ?? [];
    const sectionMap = new Map(sectionRows.map((row) => [String(row.sectionKey), row]));
    if (sectionRows.some((row) => String(row.mainLineId) !== line.mainLineId) ||
      sectionRows.length !== sectionMap.size || sectionMap.size !== AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.length ||
      !AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS.every((key) => sectionMap.has(key))) {
      result.set(line.key, unavailable("CONFIGURATION_SECTIONS_MISSING", "The current saved Configuration revision is incomplete.", revision));
      continue;
    }
    const computedDigest = createKnowledgeRevisionDigest({ mainLineId: line.mainLineId,
      revisionNumber: Number(revisionRow.revisionNumber), sections: sectionRows.map((row) => ({
        sectionKey: row.sectionKey as KnowledgeSectionKey, applicability: row.applicability as KnowledgeSectionApplicability,
        payload: row.payload
      })) });
    const digestMismatch = revision.status !== "draft" && computedDigest !== revision.contentDigest;
    if (!digestMismatch && revision.status === "draft") revision.contentDigest = computedDigest;
    const uomRow = uomsById.get(line.uomId);
    if (!uomRow || uomRow.status === "archived" || uomRow.decimalScale !== line.uomDecimalScale ||
      (line.uomCode && uomRow.code !== line.uomCode)) {
      result.set(line.key, unavailable("PINNED_UOM_CHANGED", "The approved UOM precision or identity is unavailable.", revision));
      continue;
    }
    if (sectionPayload(sectionMap.get("overview")).uomId !== line.uomId) {
      result.set(line.key, unavailable("CONFIGURATION_UOM_CHANGED",
        "The current Configuration revision uses a different UOM from the approved line.", revision));
      continue;
    }
    const uom = { id: line.uomId, code: String(uomRow.code), name: String(uomRow.name),
      decimalScale: Number(uomRow.decimalScale) };
    const advanced = sectionPayload(sectionMap.get("advanced"));
    const quantityMargin = sectionPayload(sectionMap.get("quantity-margin"));
    const analysis = analyzePurchaseOrderModeSettings({ advanced, quantityMargin,
      uom, mode: selected?.mode ?? null,
      quantity: selected?.quantity ?? null, discountBps: selected?.discountBps ?? 0,
      markupBasis: selected?.markupBasis ?? "starting" });
    const standardSuggestion: PurchaseOrderModeStandardSuggestion | null = options.standardSuggestionSink &&
      line.mainBasketId && (explicitStandard || (!decision && !proposal &&
        source.mainBasketClassifications?.[line.mainBasketId] !== "special"))
      ? typeof line.quantity === "number" && Number.isFinite(line.quantity)
        ? suggestStandardSubVendorCost({ advanced,
          uom, quantity: String(line.quantity),
          baseRateOverridePaise: explicitStandard ? options.projectRates?.get(line.key)?.overridePaise : null })
        : { preview: null, issues: [{ code: "APPROVED_QUANTITY_UNAVAILABLE",
          message: "The approved quantity cannot be used for the Sub-Vendor calculation." }] }
      : null;
    const integrity = digestMismatch && (revision.status === "active" || revision.status === "superseded") &&
      typeof revision.contentDigest === "string" && /^[a-f0-9]{64}$/u.test(revision.contentDigest) &&
      (analysis.options.length > 0 || Boolean(standardSuggestion?.preview))
      ? { status: "mismatch" as const, activatedDigest: revision.contentDigest,
        observedDigest: computedDigest, candidateAvailability: analysis.availability } : undefined;
    const issues: PurchaseOrderModeIssue[] = [...analysis.issues];
    const childRefs: Record<string, PurchaseOrderModePriceReference> = {};
    for (const child of childrenByKey.get(line.key) ?? []) {
      childRefs[child.id] = resolvePriceReference(child, pricesByRevision.get(selectedRevisionId) ?? [], taxesById, at);
    }
    if (digestMismatch) {
      const basis = decision?.integrityBasis;
      const basisMatches = basis?.kind === "observed_unverified" && basis.activatedDigest === revision.contentDigest &&
        basis.observedDigest === computedDigest && decision?.revisionId === revision.id &&
        decision?.revisionDigest === revision.contentDigest;
      const selectedGuardMatches = proposal ? proposal.expectedObservedDigest === computedDigest : basisMatches;
      const mismatchIssue: PurchaseOrderModeIssue = basis && basis.observedDigest !== computedDigest
        ? { code: "RECOVERY_OBSERVED_DIGEST_CHANGED", message: "The saved Configuration content changed after the unverified mode decision. Review it again." }
        : basis && basis.activatedDigest !== revision.contentDigest
          ? { code: "RECOVERY_ACTIVATION_DIGEST_CHANGED", message: "The recorded Configuration activation changed after the unverified mode decision." }
          : { code: "PINNED_DIGEST_MISMATCH", message: "The saved Configuration content does not match its activated digest." };
      if (options.standardSuggestionSink && standardSuggestion && (integrity || !standardSuggestion.preview)) {
        options.standardSuggestionSink.set(line.key, {
          preview: standardSuggestion.preview, issues: [...standardSuggestion.issues, mismatchIssue]
        });
      }
      if (!integrity || !selectedGuardMatches || issues.length || !selected?.mode || !analysis.preview) {
        result.set(line.key, { state: decision?.exceptionReason ? "exception" : "unavailable", options: [],
          availability: unavailableModeAvailability(mismatchIssue.code, mismatchIssue.message), decision,
          preview: null, issues: [mismatchIssue, ...issues], revision, uom, priceReferences: childRefs,
          ...(integrity ? { integrity } : {}) });
        continue;
      }
      // A proposal can be calculated for review, but only a saved basis makes the
      // project decision orderable. The save transaction creates that basis.
      const recoveredDecisionReady = !proposal && basisMatches;
      result.set(line.key, { state: recoveredDecisionReady ? "ready" : "unavailable",
        options: recoveredDecisionReady ? analysis.options : [],
        availability: recoveredDecisionReady ? analysis.availability : unavailableModeAvailability(mismatchIssue.code, mismatchIssue.message),
        decision, preview: analysis.preview, issues: [],
        revision, uom, priceReferences: childRefs, integrity });
      continue;
    }
    if (decision?.integrityBasis && decision.revisionId === revision.id && !proposal) issues.push({ code: "RECOVERY_OBSERVED_DIGEST_CHANGED",
      message: "The saved Configuration content changed after the unverified mode decision. Review it again." });
    if (options.standardSuggestionSink && standardSuggestion) options.standardSuggestionSink.set(line.key, standardSuggestion);
    const state: PurchaseOrderModeResolution["state"] = decision?.exceptionReason && analysis.options.length === 0 ? "exception"
      : issues.length || analysis.options.length === 0 ? "unavailable"
        : selected?.mode && analysis.preview ? "ready" : "selection_required";
    result.set(line.key, { state, options: analysis.options, availability: analysis.availability, decision,
      preview: issues.length ? null : analysis.preview, issues, revision, uom, priceReferences: childRefs });
  }
  return result;
}

function isExplicitStandard(line: PurchaseOrderModeSourceLine, source: ModeSource): boolean {
  return Boolean(line.mainBasketId && source.mainBasketClassifications?.[line.mainBasketId] === "standard");
}

function unavailableModeAvailability(code: string, message: string): PurchaseOrderModeResolution["availability"] {
  const modes = [
    { key: "pmc", label: "PMC" },
    { key: "sub_vendor", label: "Sub-Vendor" },
    { key: "in_house", label: "In-house" }
  ] satisfies PurchaseOrderModeResolution["options"];
  return modes.map((mode) => ({ ...mode, available: false, issues: [{ code, message }] }));
}

function resolvePriceReference(child: PurchaseOrderModeChildReference, prices: Row[], taxes: Map<string, Row>, at: Date): PurchaseOrderModePriceReference {
  const unavailable = (code: string, message: string): PurchaseOrderModePriceReference => ({ state: "unavailable", priceVersionId: null,
    priceVersionNumber: null, taxVersionId: null, taxVersionNumber: null, unitPricePaise: null,
    gstBasisPoints: null, treatment: null, effectiveFrom: null, effectiveTo: null, issues: [{ code, message }] });
  if (!child.vendorId) return unavailable("PRICE_VENDOR_MISSING", "Assign a vendor before applying a configured price.");
  const matches = prices.filter((row) => row.vendorId === child.vendorId && row.uomId === child.uomId &&
    (row.specificationId ?? null) === (child.specificationId ?? null) && (row.modeId ?? null) === (child.modeId ?? null) &&
    row.status === "active" && inWindow(row, at));
  if (!matches.length && !child.specificationId && !child.modeId && prices.some((row) =>
    row.vendorId === child.vendorId && row.uomId === child.uomId && row.status === "active" && inWindow(row, at) &&
    (row.specificationId != null || row.modeId != null))) {
    return unavailable("PRICE_SCOPE_UNRESOLVED",
      "Saved vendor prices require a specification or mode identity that is not linked to this purchase item. Enter agreed commercial terms with a reason.");
  }
  if (matches.length !== 1) return unavailable(matches.length ? "PRICE_AMBIGUOUS" : "PRICE_NOT_EFFECTIVE",
    matches.length ? "More than one saved price applies to this vendor and order date." : "No saved vendor price applies to this order date.");
  const price = matches[0]!;
  const tax = taxes.get(String(price.taxVersionId));
  if (!tax || tax.status !== "active" || !inWindow(tax, at) || tax.taxRuleId !== price.taxRuleId || tax.treatment !== price.treatment) {
    return unavailable("TAX_NOT_EFFECTIVE", "The price's saved tax version is unavailable or inconsistent.");
  }
  if (!Number.isSafeInteger(price.baseAmountPaise) || price.baseAmountPaise <= 0 ||
    !Number.isSafeInteger(tax.rateBps) || tax.rateBps < 0 || tax.rateBps > 10_000) {
    return unavailable("PRICE_INVALID", "The saved price or tax cannot be used for a purchase order.");
  }
  return { state: "ready", priceVersionId: String(price._id), priceVersionNumber: Number(price.versionNumber),
    taxVersionId: String(tax._id), taxVersionNumber: Number(tax.versionNumber),
    unitPricePaise: Number(price.baseAmountPaise), gstBasisPoints: Number(tax.rateBps),
    treatment: price.treatment,
    effectiveFrom: (price.effectiveFrom as Date).toISOString(),
    effectiveTo: price.effectiveTo ? (price.effectiveTo as Date).toISOString() : null,
    issues: [] };
}

function inWindow(row: Row, at: Date): boolean {
  const from = row.effectiveFrom instanceof Date ? row.effectiveFrom : new Date(row.effectiveFrom);
  const to = row.effectiveTo == null ? null : row.effectiveTo instanceof Date ? row.effectiveTo : new Date(row.effectiveTo);
  return !Number.isNaN(from.getTime()) && from <= at && (to === null || (!Number.isNaN(to.getTime()) && to > at));
}
function referencedPriceIds(pricing: Record<string, unknown>): string[] {
  if (!Array.isArray(pricing.priceEntries)) return [];
  return pricing.priceEntries.flatMap((value) => {
    const row = asRow(value);
    return row?.operation === "reference" && typeof row.priceVersionId === "string" ? [row.priceVersionId] : [];
  });
}
function sectionPayload(section: Row | undefined): Record<string, unknown> {
  return section?.applicability === "configured" ? asRow(section.payload) ?? {} : {};
}
function asRow(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function decisionKey(projectId: string, source: ModeSource, sourceLineItemKey: string) {
  return { projectId, estimateId: source.estimateId, estimateVersion: source.estimateVersion,
    estimateReviewRoundId: source.estimateReviewRoundId, sourceLineItemKey };
}
function decisionDto(row: Row): PurchaseOrderModeDecisionDto {
  const integrityBasis = parseIntegrityBasis(row.integrityBasis);
  return { id: String(row._id), version: Number(row.version), sourceLineItemKey: String(row.sourceLineItemKey),
    mode: row.mode ?? null, quantity: row.quantity ?? null, discountBps: Number(row.discountBps),
    markupBasis: row.markupBasis, exceptionReason: row.exceptionReason ?? null,
    revisionId: row.revisionId ?? null, revisionDigest: row.revisionDigest ?? null,
    ...(integrityBasis ? { integrityBasis } : {}),
    updatedAt: (row.updatedAt instanceof Date ? row.updatedAt : new Date(row.updatedAt)).toISOString() };
}
function parseIntegrityBasis(value: unknown): PurchaseOrderModeIntegrityBasis | null {
  const basis = asRow(value);
  if (!basis || basis.kind !== "observed_unverified" ||
    typeof basis.activatedDigest !== "string" || !/^[a-f0-9]{64}$/u.test(basis.activatedDigest) ||
    typeof basis.observedDigest !== "string" || !/^[a-f0-9]{64}$/u.test(basis.observedDigest) ||
    typeof basis.reason !== "string" || basis.reason.trim().length < 10 ||
    typeof basis.actorId !== "string" || !basis.actorId) return null;
  const acknowledgedAt = basis.acknowledgedAt instanceof Date ? basis.acknowledgedAt : new Date(String(basis.acknowledgedAt));
  if (Number.isNaN(acknowledgedAt.getTime())) return null;
  return { kind: "observed_unverified", activatedDigest: basis.activatedDigest,
    observedDigest: basis.observedDigest, reason: basis.reason, actorId: basis.actorId,
    acknowledgedAt: acknowledgedAt.toISOString() };
}
function auditValues(row: PurchaseOrderModeDecisionDto) {
  return { version: row.version, sourceLineItemKey: row.sourceLineItemKey, mode: row.mode, quantity: row.quantity,
    discountBps: row.discountBps, markupBasis: row.markupBasis, exceptionReason: row.exceptionReason,
    revisionId: row.revisionId, revisionDigest: row.revisionDigest,
    ...(row.integrityBasis ? { integrityBasis: row.integrityBasis } : {}) };
}
function validateRecoveryGuard(resolution: PurchaseOrderModeResolution, expectedObservedDigest: string | undefined): void {
  if (!resolution.integrity) {
    if (expectedObservedDigest && resolution.issues.length === 0) throw new ApiError(422, "PURCHASE_ORDER_MODE_RECOVERY_NOT_APPLICABLE",
      "The pinned Configuration content does not have a valid unverified-value recovery candidate.");
    return;
  }
  if (!expectedObservedDigest) throw new ApiError(422, "PURCHASE_ORDER_MODE_RECOVERY_REQUIRED",
    "Review the current unverified Configuration values before calculating this mode.");
  if (expectedObservedDigest !== resolution.integrity.observedDigest) {
    throw new ApiError(409, "PURCHASE_ORDER_MODE_OBSERVED_DIGEST_CONFLICT",
      "The saved Configuration values changed. Refresh and review them before choosing this mode.");
  }
}
function digest(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function versionConflict(): never { throw new ApiError(409, "PURCHASE_ORDER_MODE_VERSION_CONFLICT", "The mode decision changed. Refresh and try again."); }
function sourceConflict(): never { throw new ApiError(409, "PURCHASE_ORDER_MODE_SOURCE_CONFLICT", "The approved estimate source changed. Refresh before choosing a mode."); }
function idempotencyConflict(): never { throw new ApiError(409, "IDEMPOTENCY_KEY_CONFLICT", "This idempotency key was used for another mode decision."); }
function isDuplicateKey(value: unknown): boolean {
  return value !== null && typeof value === "object" && "code" in value && value.code === 11000;
}
