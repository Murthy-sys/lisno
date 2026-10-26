import { canonicalEstimateDimensions, readEstimateDimensionRule, type EstimateDimensions, type EstimateDimensionRule } from "../../../../shared/estimation/estimateDimensions";
import { ESTIMATE_COMPONENT_PRICING_BASIS, readEstimateComponentPricing, type EstimateComponentPricing, type EstimateComponentPricingLine } from "../../../../shared/estimation/estimateComponentPricing";
import { z } from "zod";
import { ApiProtocolError } from "../../core/http/apiClient";
import { privateQueryKey } from "../../core/query/queryClient";
import type { MobileRuntime } from "../../runtime/createRuntime";
import type { RequestScope } from "../../contracts/http";
import type { EstimateDraft, EstimateDraftInput, EstimateReviewSummary, SavedEstimate, StaffLead } from "./types";
import type { EstimationCatalogue, EstimationCatalogueRecommendations } from "./catalogueTypes";

type Scope = Pick<RequestScope, "environmentId" | "userId">;
const enc = encodeURIComponent;
export const staffEstimateKey = (scope: Scope, leadId: string) => privateQueryKey(scope, "estimates", "staff-estimate", leadId);
export const staffLeadKey = (scope: Scope, leadId: string) => privateQueryKey(scope, "leads", "estimate-lead", leadId);
export const staffCatalogueKey = (scope: Scope) => privateQueryKey(scope, "estimates", "catalogue", "ready");
export const staffEstimateQueueKey = (scope: Scope, path: string) => privateQueryKey(scope, "estimates", "staff-queue", path);
const id = z.string().min(1);
const money = z.number().finite().nonnegative();
const paise = z.number().int().safe().nonnegative();
const componentId = z.string().trim().min(1).max(128);
const selectedComponentIds = z.array(componentId).max(50).refine(ids => new Set(ids).size === ids.length);
const status = z.enum(["draft", "pending_manager_assignment", "pending_designer_approval", "designer_changes_requested", "ready_for_client", "sent_to_client", "client_changes_requested", "client_approved"]);
const reviewSchema = z.object({ id, version: z.number().int().positive(), status: z.enum(["pending", "approved", "changes_requested", "superseded"]), deliveryStatus: z.enum(["queued", "sending", "sent", "failed", "disabled"]), deliveryAttemptCount: z.number().int().nonnegative(), deliveredAt: z.string().nullable() }).passthrough();
const configuredMetadata = {
  dimensionsMandatory: z.boolean().optional(),
  dimensions: z.custom<EstimateDimensions>(value => canonicalEstimateDimensions(value) !== null).optional(),
  dimensionRule: z.custom<EstimateDimensionRule>(value => readEstimateDimensionRule(value) !== null).nullable().optional(),
  configurationDimensionsChanged: z.boolean().optional(),
  modeTier: z.enum(["signature", "premium", "functional"]).optional(),
  configurationTierUnavailable: z.boolean().optional(),
  selectedInHouseComponentIds: selectedComponentIds.optional(),
  pricingBasis: z.literal(ESTIMATE_COMPONENT_PRICING_BASIS).optional(),
  componentPricing: z.custom<EstimateComponentPricing>(value => readEstimateComponentPricing(value) !== null).optional(),
  itemType: z.enum(["main_line", "temporary"]).optional(), classification: z.enum(["standard", "special"]).optional(), pricingMode: z.enum(["pmc", "sub_vendor", "in_house"]).optional(), rateSource: z.enum(["manual", "configuration"]).optional(),
  itemVersion: z.number().int().positive().optional(), revisionVersion: z.number().int().positive().optional(), recommendationSourceMainLineIds: z.array(id).optional(), estimateNotes: z.array(z.string()).optional(),
  configurationUomChanged: z.boolean().optional(), configurationSourceUnavailable: z.boolean().optional(), previousUomName: z.string().optional()
};
const commonLine = { catalogueId: id, roomName: id, quantity: money, included: z.boolean() };
// Editable responses may overlay current source versions. Retain the stored amount for review;
// the authoring model separately blocks it until its source evidence is current again.
function validStoredComponentAmount(line: EstimateComponentPricingLine): boolean {
  const pricing = readEstimateComponentPricing(line.componentPricing);
  const ids = line.selectedInHouseComponentIds;
  return !!pricing && line.pricingBasis === ESTIMATE_COMPONENT_PRICING_BASIS && line.source === "configuration" && line.pricingMode === "in_house" && line.rateSource === "configuration" &&
    line.mainLineId === pricing.mainLineId && (line.modeTier ?? "signature") === pricing.modeTier && line.quantity === Number(pricing.quantity) &&
    line.ratePaise === null && line.rate === null && line.amountPaise === pricing.totalPaise && line.amount === pricing.totalPaise / 100 &&
    Array.isArray(ids) && ids.length === pricing.selectedComponentIds.length && new Set(ids).size === ids.length && ids.every(id => pricing.selectedComponentIds.includes(id));
}
const lineSchema = z.union([
  z.object({ ...commonLine, ...configuredMetadata, source: z.literal("configuration"), id, mainBasketId: id, subBasketId: id.nullable(), mainLineId: id, revisionId: id, roomId: id, uomId: id,
    mainBasketName: z.string(), subBasketName: z.string().nullable(), mainLineName: z.string(), uomName: z.string(), uomCode: z.string(), uomDecimalScale: z.number().int().min(0).max(6),
    ratePaise: paise.nullable(), rate: money.nullable(), amount: money.nullable(), amountPaise: paise.nullable(), unit: z.string(), specification: z.null()
  }).passthrough().refine((line) => line.catalogueId === line.mainLineId &&
    (line.pricingBasis === undefined && line.componentPricing === undefined || validStoredComponentAmount(line))),
  z.object({ ...commonLine, source: z.literal("legacy").optional(), id: id.optional(), specification: z.string(), unit: z.string(), rate: money, amount: money.optional() }).passthrough()
]);
const estimateSchema = z.object({ id, leadId: id.optional(), version: z.number().int().positive(), propertyType: z.string(), bedroomCount: z.number().int().min(1).max(50).nullish(),
  rooms: z.array(z.record(z.string(), z.unknown())), scopes: z.array(z.string()), lineItems: z.array(lineSchema), status,
  subtotal: money, gst: money, total: money, subtotalPaise: paise.optional(), gstPaise: paise.optional(), totalPaise: paise.optional(), approvalRequired: z.boolean(),
  projectId: id.nullish(), clientReview: reviewSchema.nullish(),
  selectedMainBasketIds: z.array(id).optional(), selectedMainBasketClassifications: z.array(z.object({ mainBasketId: id, classification: z.enum(["standard", "special"]) })).optional(), assignedDesignerId: id.nullish(),
  clientFeedback: z.object({ note: z.string(), occurredAt: z.string(), reviewRoundId: id.nullable() }).nullish(), designPlanStatus: z.string().nullish(), designPlanVersion: z.number().int().nonnegative().optional(),
  estimation: z.object({ workflowVersion: z.literal(2), phase: z.enum(["pre", "post"]), status,
    requirementsVersion: z.number().int().nonnegative(), editClosedAt: z.string().nullable(), preApproval: z.object({ reviewRoundId: id, estimateVersion: z.number().int().positive(), approvedAt: z.string() }).nullable(),
    finalApproval: z.object({ reviewRoundId: id, estimateVersion: z.number().int().positive(), approvedAt: z.string(), requirementsVersion: z.number().int().nonnegative(), designReviewRoundId: id, designPlanVersion: z.number().int().positive(), designScopeRevision: z.number().int().nonnegative() }).nullable(),
    designScopeRevision: z.number().int().nonnegative(), approvedDesignScopeRevision: z.number().int().nonnegative().nullable(), pendingReviewRoundId: id.nullable(), preparationSnapshotId: id.nullable()
  }).nullish()
}).passthrough();
export function parseStaffEstimate(value: unknown, expectedLeadId?: string): EstimateDraft {
  const result = estimateSchema.safeParse(value);
  if (!result.success || (expectedLeadId && result.data.leadId && result.data.leadId !== expectedLeadId)) throw new ApiProtocolError();
  const lineIds = result.data.lineItems.flatMap((line) => line.id ? [line.id] : []);
  if (new Set(lineIds).size !== lineIds.length) throw new ApiProtocolError();
  return result.data as unknown as EstimateDraft;
}
export const leadSchema = z.object({ stage: z.enum(["new_lead", "contacted", "site_visit", "design_meeting", "estimate_in_progress", "estimate_sent", "negotiation", "won", "lost"]).optional(), nextAction: z.string().optional(), nextActionAt: z.string().optional(), createdAt: z.string().optional(), updatedAt: z.string().optional(), budgetMin: money.nullish(), budgetMax: money.nullish(), id, clientName: z.string(), clientEmail: z.string(), clientMobile: z.string(), projectName: z.string(), propertyType: z.string(), location: z.string(), projectId: id.nullish(), bedroomCount: z.number().int().nullish(), estimationWorkflowVersion: z.number().optional() });
export async function getStaffLead(runtime: MobileRuntime, leadId: string, signal?: AbortSignal): Promise<StaffLead> {
  const result = leadSchema.safeParse(await runtime.api.authenticated.get(`/leads/${enc(leadId)}`, { signal }));
  if (!result.success || result.data.id !== leadId) throw new ApiProtocolError();
  return result.data;
}
export async function getStaffEstimate(runtime: MobileRuntime, leadId: string, signal?: AbortSignal): Promise<EstimateDraft | null> {
  const value = await runtime.api.authenticated.get(`/leads/${enc(leadId)}/estimate`, { signal });
  return value === null ? null : parseStaffEstimate(value, leadId);
}
export async function saveStaffEstimate(runtime: MobileRuntime, leadId: string, input: EstimateDraftInput): Promise<EstimateDraft> {
  const estimate = parseStaffEstimate(await runtime.api.authenticated.put(`/leads/${enc(leadId)}/estimate`, input), leadId);
  if (input.expectedVersion !== undefined && estimate.version! <= input.expectedVersion) throw new ApiProtocolError();
  return estimate;
}
export async function submitStaffEstimate(runtime: MobileRuntime, leadId: string, expectedVersion: number): Promise<EstimateDraft> {
  return parseStaffEstimate(await runtime.api.authenticated.post(`/leads/${enc(leadId)}/estimate/submit`, { expectedVersion }), leadId);
}
export async function estimateCommand(runtime: MobileRuntime, estimateId: string, action: "send-client" | "assign" | "designer-decision" | "enable-collaboration" | "withdraw-review", input: object): Promise<EstimateDraft> {
  const estimate = parseStaffEstimate(await runtime.api.authenticated.post(`/estimates/${enc(estimateId)}/${action}`, input));
  if (estimate.id !== estimateId) throw new ApiProtocolError();
  return estimate;
}
export async function retryEstimateEmail(runtime: MobileRuntime, estimateId: string, review: Pick<EstimateReviewSummary, "id" | "version">): Promise<EstimateReviewSummary> {
  const result = reviewSchema.safeParse(await runtime.api.authenticated.post(`/estimates/${enc(estimateId)}/client-email/retry`, { roundId: review.id, version: review.version }));
  if (!result.success || result.data.id !== review.id) throw new ApiProtocolError();
  return result.data;
}
export async function releaseEstimatePreparation(runtime: MobileRuntime, estimateId: string, expectedVersion: number): Promise<void> {
  const result = z.object({ estimateId: id, estimateVersion: z.number().int().positive(), sourceSnapshotId: id }).safeParse(await runtime.api.authenticated.post(`/estimates/${enc(estimateId)}/preparation-snapshots`, { expectedVersion }));
  if (!result.success || result.data.estimateId !== estimateId || result.data.estimateVersion !== expectedVersion) throw new ApiProtocolError();
}
export async function getStaffEstimateQueue(runtime: MobileRuntime, path: "/estimates" | "/estimates/review-queue", signal?: AbortSignal): Promise<SavedEstimate[]> {
  const raw = z.array(z.unknown()).safeParse(await runtime.api.authenticated.get(path, { signal }));
  if (!raw.success) throw new ApiProtocolError();
  return raw.data.map((value) => {
    const parsed = parseStaffEstimate(value);
    const row = value as Record<string, unknown>;
    const lead = leadSchema.safeParse(row.lead && typeof row.lead === "object" ? { ...row.lead, id: (row.lead as Record<string, unknown>).id ?? (row.lead as Record<string, unknown>)._id } : null);
    const leadId = typeof row.leadId === "string" ? row.leadId : lead.success ? lead.data.id : null;
    if (!leadId) throw new ApiProtocolError();
    return { ...parsed, leadId, updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "", lead: lead.success ? lead.data : null };
  });
}
export async function getAssignableEstimateDesigners(runtime: MobileRuntime, signal?: AbortSignal) {
  const result = z.array(z.object({ id, name: z.string(), email: z.string(), title: z.string().nullable() })).safeParse(await runtime.api.authenticated.get("/estimates/designers", { signal }));
  if (!result.success) throw new ApiProtocolError();
  return result.data;
}
const catalogueLine = z.object({ applicableTiers: z.array(z.enum(["signature", "premium", "functional"])).optional(), ...configuredMetadata, id, mainLineId: id, basketId: id, subBasketId: id.nullable(), name: z.string(), displayOrder: z.number(), revisionId: id,
  inHouseComponents: z.array(z.object({ id: componentId, basketId: id, subBasketId: id.nullable(), basketName: z.string(), subBasketName: z.string().nullable(), baseRatePaise: paise.nullable(), unavailableReason: z.string().nullable().optional() }).passthrough()).max(50).refine(rows => new Set(rows.map(row => row.id)).size === rows.length).optional(),
  itemVersion: z.number().int().positive().optional(), revisionVersion: z.number().int().positive().optional(),
  uom: z.object({ id, code: z.string(), name: z.string(), decimalScale: z.number().int().min(0).max(6) }),
  modeBaseRatesPaise: z.object({ pmc: paise.nullable(), sub_vendor: paise.nullable(), in_house: paise.nullable() }).optional()
}).passthrough();
const basketSchema = z.object({ id, name: z.string(), displayOrder: z.number(), description: z.string().nullish(),
  directTemporaryItems: z.array(catalogueLine).optional(), subBaskets: z.array(z.object({ id, basketId: id, name: z.string(), displayOrder: z.number(), mainLines: z.array(catalogueLine), temporaryItems: z.array(catalogueLine).optional() }).passthrough())
}).passthrough();
export async function getStaffCatalogue(runtime: MobileRuntime, signal?: AbortSignal): Promise<EstimationCatalogue> {
  const items: EstimationCatalogue["items"] = [];
  const basketIds = new Set<string>(); const subBasketIds = new Set<string>(); const lineIds = new Set<string>();
  let offset = 0; let ineligibleLineCount = 0;
  for (let pageNumber = 0; pageNumber < 1000; pageNumber += 1) {
    const result = z.object({ items: z.array(basketSchema), ineligibleLineCount: z.number().int().nonnegative(), pagination: z.object({ offset: z.number().int().nonnegative(), hasMore: z.boolean() }) }).safeParse(
      await runtime.api.authenticated.get(`/estimation/catalogue?limit=100&offset=${offset}&includeReadyNonActive=true`, { signal }));
    if (!result.success || result.data.pagination.offset !== offset) throw new ApiProtocolError();
    for (const basket of result.data.items) {
      if (basketIds.has(basket.id)) throw new ApiProtocolError();
      basketIds.add(basket.id);
      const verifyLine = (line: z.infer<typeof catalogueLine>, subId: string | null) => {
        if (line.basketId !== basket.id || line.subBasketId !== subId || line.id !== line.mainLineId || lineIds.has(line.mainLineId)) throw new ApiProtocolError();
        lineIds.add(line.mainLineId);
      };
      for (const line of basket.directTemporaryItems ?? []) verifyLine(line, null);
      for (const sub of basket.subBaskets) {
        if (sub.basketId !== basket.id || subBasketIds.has(sub.id)) throw new ApiProtocolError();
        subBasketIds.add(sub.id);
        for (const line of [...sub.mainLines, ...(sub.temporaryItems ?? [])]) verifyLine(line, sub.id);
      }
    }
    items.push(...result.data.items as unknown as EstimationCatalogue["items"]);
    ineligibleLineCount += result.data.ineligibleLineCount;
    if (!result.data.pagination.hasMore) return { items, ineligibleLineCount, readyNonActiveSupported: true };
    if (!result.data.items.length) throw new ApiProtocolError();
    offset += result.data.items.length;
  }
  throw new ApiProtocolError();
}
export async function getStaffRecommendations(runtime: MobileRuntime, mainLineIds: readonly string[], signal?: AbortSignal): Promise<EstimationCatalogueRecommendations> {
  const ids = [...new Set(mainLineIds)].sort();
  const sources: EstimationCatalogueRecommendations["sources"] = [];
  for (let start = 0; start < ids.length; start += 50) {
    const value = await runtime.api.authenticated.get(`/estimation/catalogue/recommendations?mainLineIds=${enc(ids.slice(start, start + 50).join(","))}&includeReadyNonActive=true`, { signal });
    const result = z.object({ sources: z.array(z.object({ mainLineId: id, available: z.boolean(), revisionId: id.nullable(), revisionVersion: z.number().int().positive().nullable(), itemVersion: z.number().int().positive().nullable(), rules: z.array(z.object({ id, requirement: z.enum(["must", "can"]), reason: z.string(), targetKind: z.enum(["main_line", "sub_basket"]), targetBasketId: id, targetSubBasketId: id.nullable(), targetMainLineId: id.nullable(), targetRevisionId: id.nullable(), targetRevisionVersion: z.number().int().positive().nullable(), targetItemVersion: z.number().int().positive().nullable(), available: z.boolean(), completionRequired: z.boolean(), children: z.array(z.object({ mainLineId: id, available: z.literal(true), completionRequired: z.boolean(), revisionId: id, revisionVersion: z.number().int().positive(), itemVersion: z.number().int().positive() })).optional(), unavailableChildCount: z.number().int().nonnegative().optional() }).passthrough()), guidance: z.array(z.object({ id, name: z.string(), reason: z.string() })) }).passthrough()) }).safeParse(value);
    if (!result.success || result.data.sources.some((source) => !ids.slice(start, start + 50).includes(source.mainLineId))) throw new ApiProtocolError();
    sources.push(...result.data.sources as EstimationCatalogueRecommendations["sources"]);
  }
  return { sources };
}
