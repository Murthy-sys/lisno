import type { ZodType } from "zod";
import type { PMEstimateLine, PMEstimateView, PMVendorCandidatePage, PMVendorCandidateQuery,
  PMVendorSuggestionPage, PMVendorSuggestionQuery } from "../../contracts/project-manager-estimates.js";
import { approvedEstimateLineItemKey } from "../../domain/estimate-line-item.js";
import { canonicalEstimateDimensions, readEstimateDimensionRule } from "../../domain/estimate-dimensions.js";
import { pmVendorCandidateQuerySchema, pmVendorSuggestionQuerySchema } from "../../domain/project-manager/estimates.js";
import { readVendorSuggestionWriteAvailability } from "../../domain/project-vendor-suggestion-scope-index.js";
import { ApiError } from "../../middleware/errors.js";
import { AiEstimatorKnowledgeVendorModel } from "../../models/AiEstimatorKnowledgeVendor.js";
import type { PublicUser } from "../auth.service.js";
import { readBasketVendorRecommendationReadiness, vendorReadinessReason } from "../procurement-basket-vendor-eligibility.service.js";
import { resolveEstimatorCatalogueLines } from "../estimator-catalogue.service.js";
import { requireMainLineVendorLinks } from "../main-line-vendor-links.service.js";
import { pmTransaction, requirePMProject, type PMRow } from "./common.js";
import { readPMApprovedSource, readPMMainLineScopes, requirePMApprovedSource, requirePMMainLineScope,
  type PMApprovedSourceRead } from "./approved-source.js";
import { readPMVendorSuggestions } from "./vendor-suggestion-reads.js";

export interface PMEstimateReadService {
  estimate(actor: PublicUser, projectId: string): Promise<PMEstimateView>;
  candidates(actor: PublicUser, projectId: string, query: PMVendorCandidateQuery): Promise<PMVendorCandidatePage>;
  suggestions(actor: PublicUser, projectId: string, query: PMVendorSuggestionQuery): Promise<PMVendorSuggestionPage>;
}

export function createPMEstimateReadService(options: { now?: () => Date } = {}): PMEstimateReadService {
  return {
    estimate: (actor, projectId) => pmTransaction(async session => {
      const project = await requirePMProject(actor, projectId, session);
      const approved = await readPMApprovedSource(projectId, session);
      const ready = await readVendorSuggestionWriteAvailability(session);
      return { project: { id: projectId, name: String(project.name) },
        availability: approved.source ? "available" : "unavailable", reason: approved.issues[0] ?? null,
        source: approved.source, approvedAt: validDate(approved.round?.decidedAt),
        lines: pmEstimateLines(approved), mainLines: await readPMMainLineScopes(approved, session),
        totals: { subtotalPaise: approved.snapshot?.subtotalPaise ?? null, gstPaise: approved.snapshot?.gstPaise ?? null,
          totalPaise: approved.snapshot?.totalPaise ?? null },
        writeAvailability: approved.source ? ready : { available: false, reason: approved.issues[0] ?? "An approved estimate is required." } };
    }),
    candidates: (actor, projectId, value) => pmTransaction(async session => {
      await requirePMProject(actor, projectId, session);
      const query = validatePMEstimateQuery(pmVendorCandidateQuerySchema, value);
      const approved = await readPMApprovedSource(projectId, session);
      const source = requirePMApprovedSource(approved, query.expectedSource);
      const mainLine = await requirePMMainLineScope(approved, query.mainLineId, session);
      const links = await requireMainLineVendorLinks(mainLine.mainLineId, session);
      const filter = { _id: { $in: links.vendorIds }, ...(query.q ? { $or: [{ name: { $regex: literal(query.q), $options: "i" } },
        { code: { $regex: literal(query.q), $options: "i" } }] } : {}) };
      const total = await AiEstimatorKnowledgeVendorModel.countDocuments(filter).session(session);
      const vendors = await AiEstimatorKnowledgeVendorModel.find(filter).select({ code: 1, name: 1, status: 1,
        procurementProfile: 1, kpiRubricGeneration: 1, msmeCertificate: 1 }).sort({ nameNormalized: 1, _id: 1 })
        .skip(query.offset).limit(query.limit).session(session).lean();
      const current = (await resolveEstimatorCatalogueLines([mainLine.mainLineId], session)).get(mainLine.mainLineId);
      const configurationActive = current?.line.itemStatus === "active" && current.line.revisionStatus === "active";
      const items = (await readBasketVendorRecommendationReadiness(projectId, mainLine.mainBasketId!, vendors, session)).map(candidate => ({
        id: candidate.vendorId, code: candidate.code, name: candidate.name, classification: candidate.classification,
        canSuggest: candidate.canSuggest, bidEligible: candidate.eligible && configurationActive,
        reasons: [...candidate.blockers.map(vendorReadinessReason), ...(!configurationActive ? ["Current Main Line Configuration must be activated before a bid request."] : [])]
      }));
      return { source, mainLine, items, total, limit: query.limit, offset: query.offset };
    }),
    suggestions: (actor, projectId, value) => pmTransaction(async session => {
      await requirePMProject(actor, projectId, session);
      const query = validatePMEstimateQuery(pmVendorSuggestionQuerySchema, value);
      return readPMVendorSuggestions(actor, projectId, query, session, (options.now ?? (() => new Date()))());
    })
  };
}

export function pmEstimateLines(approved: PMApprovedSourceRead): PMEstimateLine[] {
  if (!approved.source || !approved.snapshot || !approved.round) return [];
  const frozen = new Map<string, PMRow>((approved.round.estimateSnapshot?.lineItems ?? []).map((line: PMRow, index: number) =>
    [approvedEstimateLineItemKey({ id: line.id, estimateId: approved.source!.estimateId,
      estimateVersion: approved.source!.estimateVersion, index }), line]));
  return approved.snapshot.allLineItems.map(line => {
    const saved = frozen.get(line.key);
    const dimensions = canonicalEstimateDimensions(saved?.dimensions);
    const rule = readEstimateDimensionRule(saved?.dimensionRule);
    return { sourceLineItemKey: line.key, sectionId: line.sectionId, roomId: line.roomId ?? null, roomName: line.roomName,
      mainLineId: line.mainLineId ?? null, mainLineName: line.mainLineName || line.specification || "Estimate item",
      ...(line.itemType === undefined ? {} : { itemType: line.itemType }),
      mainBasketId: line.mainBasketId ?? null, mainBasketName: line.mainBasketName ?? null,
      specification: line.specification, included: line.included, quantity: Number.isFinite(line.quantity) ? line.quantity : null,
      unit: line.unit, ratePaise: frozenRate(saved), amountPaise: line.amountPaise,
      dimensions: dimensions ? (["length", "width", "height"] as const).map(key => ({
        label: key[0]!.toUpperCase() + key.slice(1), value: String(saved!.dimensions[key]), unit: rule?.inputUnit ?? null })) : [] };
  });
}

function frozenRate(saved: PMRow | undefined): number | null {
  if (!saved || saved.componentPricing || saved.pricingBasis === "components") return null;
  if (saved.ratePaise != null) return Number.isSafeInteger(saved.ratePaise) && saved.ratePaise >= 0 ? saved.ratePaise : null;
  if (saved.source === "configuration" || typeof saved.rate !== "number" || !Number.isFinite(saved.rate) || saved.rate < 0) return null;
  // Historical rupee rates may have two decimal places. Convert explicitly without a floating-point multiply.
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(saved.rate));
  if (!match) return null;
  const paise = BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  return paise <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(paise) : null;
}

export function validatePMEstimateQuery<T>(schema: ZodType<T, any, any>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new ApiError(400, "VALIDATION_ERROR", "Request validation failed.");
  return parsed.data;
}
export function validDate(value: unknown): string | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
export const literal = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
