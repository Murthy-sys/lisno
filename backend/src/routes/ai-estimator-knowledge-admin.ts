import { Router, type RequestHandler } from "express";
import { z } from "zod";

import type { CalculateKnowledgePreviewInput } from "../domain/ai-estimator-knowledge-calculation.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_DURATION_UNITS,
  AI_ESTIMATOR_KNOWLEDGE_ITEM_STATUSES,
  AI_ESTIMATOR_KNOWLEDGE_MASTER_STATUSES,
  AI_ESTIMATOR_KNOWLEDGE_SECTION_APPLICABILITY,
  AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS,
  AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS,
  AI_ESTIMATOR_KNOWLEDGE_VERSION_STATUSES,
  type KnowledgeSectionKey
} from "../domain/ai-estimator-knowledge.js";
import { validateKnowledgeSectionPayload } from "../domain/ai-estimator-knowledge-validation.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { ApiError } from "../middleware/errors.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AiEstimatorKnowledgeContextService } from "../services/ai-estimator-knowledge-context.service.js";
import type { AiEstimatorKnowledgeItemService } from "../services/ai-estimator-knowledge-item.service.js";
import type {
  AiEstimatorKnowledgeMasterType,
  AiEstimatorKnowledgeReferenceService
} from "../services/ai-estimator-knowledge-reference.service.js";
import type { AuthService } from "../services/auth.service.js";

const stableIdSchema = z.string().trim().min(1).max(128);
const shortTextSchema = z.string().trim().min(1).max(240);
const optionalDescriptionSchema = z.string().trim().min(1).max(4_000).nullable().optional();
const expectedVersionSchema = z.number().int().min(1);
const displayOrderSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const paginationFields = {
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
} as const;
const includeArchivedSchema = z
  .enum(["true", "false"])
  .transform((value) => value === "true")
  .optional();
const canonicalDecimalSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/u, "Expected a canonical nonnegative decimal string.");

const basketListQuerySchema = z
  .object({
    ...paginationFields,
    search: z.string().trim().min(1).max(240).optional(),
    status: z.enum(AI_ESTIMATOR_KNOWLEDGE_MASTER_STATUSES).optional(),
    includeArchived: includeArchivedSchema
  })
  .strict();

const basketCreateSchema = z
  .object({
    name: shortTextSchema,
    description: optionalDescriptionSchema,
    displayOrder: displayOrderSchema.optional(),
    status: z.enum(["active", "inactive"]).optional()
  })
  .strict();

const basketUpdateSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    name: shortTextSchema.optional(),
    description: z.string().trim().min(1).max(4_000).nullable().optional(),
    displayOrder: displayOrderSchema.optional(),
    status: z.enum(["active", "inactive"]).optional()
  })
  .strict()
  .refine(
    ({ expectedVersion: _expectedVersion, ...changes }) =>
      Object.values(changes).some((value) => value !== undefined),
    { message: "At least one Basket field must be changed." }
  );

const archiveSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    reason: z.string().trim().min(1).max(1_000)
  })
  .strict();

const permanentDeleteBasketSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    confirmationName: z.string().min(1).max(240),
    reason: z.string().trim().min(1).max(1_000)
  })
  .strict();

const expectedVersionCommandSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    reason: z.string().trim().min(1).max(1_000).optional()
  })
  .strict();

const mainLineListQuerySchema = z
  .object({
    ...paginationFields,
    search: z.string().trim().min(1).max(240).optional(),
    includeArchived: includeArchivedSchema
  })
  .strict();

const mainLineCreateSchema = z
  .object({
    name: shortTextSchema,
    description: optionalDescriptionSchema,
    displayOrder: displayOrderSchema.optional()
  })
  .strict();

const mainLineUpdateSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    name: shortTextSchema.optional(),
    description: z.string().trim().min(1).max(4_000).nullable().optional(),
    displayOrder: displayOrderSchema.optional()
  })
  .strict()
  .refine(
    ({ expectedVersion: _expectedVersion, ...changes }) =>
      Object.values(changes).some((value) => value !== undefined),
    { message: "At least one Main Line field must be changed." }
  );

const itemListQuerySchema = z
  .object({
    ...paginationFields,
    search: z.string().trim().min(1).max(240).optional(),
    basketId: stableIdSchema.optional(),
    status: z.enum(AI_ESTIMATOR_KNOWLEDGE_ITEM_STATUSES).optional(),
    priorityId: stableIdSchema.optional(),
    modeId: stableIdSchema.optional(),
    surfaceId: stableIdSchema.optional(),
    uomId: stableIdSchema.optional(),
    vendorId: stableIdSchema.optional()
  })
  .strict();

const revisionCreateSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    reason: z.string().trim().min(1).max(1_000).optional()
  })
  .strict();

const sectionUpdateSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    expectedAggregateVersion: expectedVersionSchema.optional(),
    applicability: z.enum(AI_ESTIMATOR_KNOWLEDGE_SECTION_APPLICABILITY).optional(),
    payload: z.record(z.string(), z.unknown())
  })
  .strict();

const activationSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    reason: z.string().trim().min(1).max(1_000).optional()
  })
  .strict();

const duplicateSchema = z
  .object({
    expectedVersion: expectedVersionSchema,
    reason: z.string().trim().min(1).max(1_000).optional(),
    name: shortTextSchema.optional()
  })
  .strict();

const commonMasterFields = {
  code: z.string().trim().min(1).max(64),
  name: shortTextSchema,
  description: optionalDescriptionSchema,
  displayOrder: displayOrderSchema.optional(),
  status: z.enum(["active", "inactive"]).optional()
} as const;

const commonMasterCreateSchema = z.object(commonMasterFields).strict();
const surfaceCreateSchema = z
  .object({
    code: commonMasterFields.code.optional(),
    name: commonMasterFields.name,
    description: commonMasterFields.description,
    displayOrder: commonMasterFields.displayOrder,
    status: commonMasterFields.status
  })
  .strict();
const uomCreateSchema = z
  .object({ ...commonMasterFields, decimalScale: z.number().int().min(0).max(3) })
  .strict();
const taxVersionSchema = z
  .object({
    rateBps: z.number().int().min(0).max(100_000),
    treatment: z.enum(AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS),
    applicability: shortTextSchema,
    effectiveFrom: z.string().datetime({ offset: true }),
    effectiveTo: z.string().datetime({ offset: true }).nullable().optional(),
    status: z.enum(AI_ESTIMATOR_KNOWLEDGE_VERSION_STATUSES).default("draft")
  })
  .strict();
const taxVersionUpdateSchema = taxVersionSchema.extend({
  rolloverFromVersionId: stableIdSchema.optional()
});
const taxCreateSchema = z
  .object({ ...commonMasterFields, taxVersion: taxVersionSchema.optional() })
  .strict();

const commonMasterUpdateFields = {
  expectedVersion: expectedVersionSchema,
  code: z.string().trim().min(1).max(64).optional(),
  name: shortTextSchema.optional(),
  description: z.string().trim().min(1).max(4_000).nullable().optional(),
  displayOrder: displayOrderSchema.optional(),
  status: z.enum(["active", "inactive"]).optional()
} as const;
const commonMasterUpdateSchema = z
  .object(commonMasterUpdateFields)
  .strict()
  .refine(hasMasterChange, { message: "At least one reusable-value field must be changed." });
const surfaceUpdateSchema = z
  .object({ ...commonMasterUpdateFields })
  .strict()
  .refine(hasMasterChange, { message: "At least one reusable-value field must be changed." });
const uomUpdateSchema = z
  .object({ ...commonMasterUpdateFields, decimalScale: z.number().int().min(0).max(3).optional() })
  .strict()
  .refine(hasMasterChange, { message: "At least one reusable-value field must be changed." });
const taxUpdateSchema = z
  .object({ ...commonMasterUpdateFields, taxVersion: taxVersionUpdateSchema.optional() })
  .strict()
  .refine(hasMasterChange, { message: "At least one reusable-value field must be changed." });

function hasMasterChange(input: { expectedVersion: number } & Record<string, unknown>): boolean {
  return Object.entries(input).some(
    ([key, value]) => key !== "expectedVersion" && value !== undefined
  );
}

export const aiEstimatorKnowledgePreviewSchema = z
  .object({
    priceVersionId: stableIdSchema.nullable().optional(),
    taxVersionId: stableIdSchema.nullable().optional(),
    unitRatePaise: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().optional(),
    quantityAdjustmentBps: z.number().int().min(0).max(10_000).nullable().optional(),
    quantity: canonicalDecimalSchema.nullable().optional(),
    quantityScale: z.number().int().min(0).max(18),
    wastageBps: z.number().int().min(0).nullable().optional(),
    taxRateBps: z.number().int().min(0).nullable().optional(),
    taxTreatment: z.enum(AI_ESTIMATOR_KNOWLEDGE_TAX_TREATMENTS).nullable().optional(),
    startMarginBps: z.number().int().min(0).max(9_999).nullable().optional(),
    bottomMarginBps: z.number().int().min(0).max(9_999).nullable().optional(),
    pmcMarkupBps: z.number().int().min(0).nullable().optional(),
    duration: z
      .object({
        productivity: canonicalDecimalSchema,
        productivityScale: z.number().int().min(0).max(18),
        unit: z.enum(AI_ESTIMATOR_KNOWLEDGE_DURATION_UNITS),
        minimum: canonicalDecimalSchema.nullable().optional(),
        maximum: canonicalDecimalSchema.nullable().optional()
      })
      .strict()
      .nullable()
      .optional()
  })
  .strict();

export interface AiEstimatorKnowledgeAdminRouterServices {
  readonly reference: AiEstimatorKnowledgeReferenceService;
  readonly item: AiEstimatorKnowledgeItemService;
  readonly context: AiEstimatorKnowledgeContextService;
}

const masterRoutes = [
  { path: "uoms", kind: "uoms", createSchema: uomCreateSchema, updateSchema: uomUpdateSchema },
  { path: "vendors", kind: "vendors", createSchema: commonMasterCreateSchema, updateSchema: commonMasterUpdateSchema },
  { path: "taxes", kind: "taxes", createSchema: taxCreateSchema, updateSchema: taxUpdateSchema },
  { path: "priorities", kind: "priorities", createSchema: commonMasterCreateSchema, updateSchema: commonMasterUpdateSchema },
  { path: "surfaces", kind: "surfaces", createSchema: surfaceCreateSchema, updateSchema: surfaceUpdateSchema },
  { path: "modes", kind: "modes", createSchema: commonMasterCreateSchema, updateSchema: commonMasterUpdateSchema }
] as const;

export function createAiEstimatorKnowledgeAdminRouter(
  auth: AuthService,
  services: AiEstimatorKnowledgeAdminRouterServices
): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);
  const prefix = "/admin/ai-estimator-knowledge";

  router.get(
    `${prefix}/baskets`,
    protectedRoute,
    requireOperation("GET /admin/ai-estimator-knowledge/baskets"),
    validateQuery(basketListQuerySchema),
    handler(async (request, response) => {
      const { filters, pagination } = splitPagination(response.locals.validatedQuery);
      return pageEnvelope(await services.reference.listBaskets(request.authenticatedUser!, filters, pagination), pagination);
    })
  );
  router.post(
    `${prefix}/baskets`,
    protectedRoute,
    requireOperation("POST /admin/ai-estimator-knowledge/baskets"),
    validateBody(basketCreateSchema),
    handler(async (request) => services.reference.createBasket(request.authenticatedUser!, request.body), 201)
  );
  router.patch(
    `${prefix}/baskets/:basketId`,
    protectedRoute,
    requireOperation("PATCH /admin/ai-estimator-knowledge/baskets/:basketId"),
    validateBody(basketUpdateSchema),
    handler(async (request) => services.reference.updateBasket(request.authenticatedUser!, String(request.params.basketId), request.body))
  );
  router.delete(
    `${prefix}/baskets/:basketId`,
    protectedRoute,
    requireOperation("DELETE /admin/ai-estimator-knowledge/baskets/:basketId"),
    validateBody(archiveSchema),
    handler(async (request) => services.reference.archiveBasket(request.authenticatedUser!, String(request.params.basketId), request.body))
  );
  router.get(
    `${prefix}/baskets/:basketId/deletion-impact`,
    protectedRoute,
    requireOperation("GET /admin/ai-estimator-knowledge/baskets/:basketId/deletion-impact"),
    handler(async (request) => services.reference.getBasketDeletionImpact(
      request.authenticatedUser!,
      String(request.params.basketId)
    ))
  );
  router.delete(
    `${prefix}/baskets/:basketId/permanent`,
    protectedRoute,
    requireOperation("DELETE /admin/ai-estimator-knowledge/baskets/:basketId/permanent"),
    validateBody(permanentDeleteBasketSchema),
    handler(async (request) => services.reference.permanentlyDeleteBasket(
      request.authenticatedUser!,
      String(request.params.basketId),
      request.body
    ))
  );
  router.get(
    `${prefix}/baskets/:basketId/main-lines`,
    protectedRoute,
    requireOperation("GET /admin/ai-estimator-knowledge/baskets/:basketId/main-lines"),
    validateQuery(mainLineListQuerySchema),
    handler(async (request, response) => {
      const { filters, pagination } = splitPagination(response.locals.validatedQuery);
      return pageEnvelope(await services.item.listMainLines(request.authenticatedUser!, String(request.params.basketId), filters, pagination), pagination);
    })
  );
  router.post(
    `${prefix}/baskets/:basketId/main-lines`,
    protectedRoute,
    requireOperation("POST /admin/ai-estimator-knowledge/baskets/:basketId/main-lines"),
    validateBody(mainLineCreateSchema),
    handler(async (request) => services.item.createMainLine(request.authenticatedUser!, String(request.params.basketId), request.body), 201)
  );
  router.patch(
    `${prefix}/main-lines/:mainLineId`,
    protectedRoute,
    requireOperation("PATCH /admin/ai-estimator-knowledge/main-lines/:mainLineId"),
    validateBody(mainLineUpdateSchema),
    handler(async (request) => services.item.updateMainLine(request.authenticatedUser!, String(request.params.mainLineId), request.body))
  );
  router.delete(
    `${prefix}/main-lines/:mainLineId`,
    protectedRoute,
    requireOperation("DELETE /admin/ai-estimator-knowledge/main-lines/:mainLineId"),
    validateBody(archiveSchema),
    handler(async (request) => services.item.archiveMainLine(request.authenticatedUser!, String(request.params.mainLineId), request.body))
  );
  router.get(
    `${prefix}/items`,
    protectedRoute,
    requireOperation("GET /admin/ai-estimator-knowledge/items"),
    validateQuery(itemListQuerySchema),
    handler(async (request, response) => {
      const { filters, pagination } = splitPagination(response.locals.validatedQuery);
      return pageEnvelope(await services.item.listItems(request.authenticatedUser!, filters, pagination), pagination);
    })
  );
  router.get(
    `${prefix}/main-lines/:mainLineId`,
    protectedRoute,
    requireOperation("GET /admin/ai-estimator-knowledge/main-lines/:mainLineId"),
    handler(async (request) => services.item.getItem(request.authenticatedUser!, String(request.params.mainLineId)))
  );
  router.get(
    `${prefix}/main-lines/:mainLineId/history`,
    protectedRoute,
    requireOperation("GET /admin/ai-estimator-knowledge/main-lines/:mainLineId/history"),
    validateQuery(z.object(paginationFields).strict()),
    handler(async (request, response) => {
      const { pagination } = splitPagination(response.locals.validatedQuery);
      return pageEnvelope(await services.item.history(request.authenticatedUser!, String(request.params.mainLineId), pagination), pagination);
    })
  );
  router.post(
    `${prefix}/main-lines/:mainLineId/revisions`,
    protectedRoute,
    requireOperation("POST /admin/ai-estimator-knowledge/main-lines/:mainLineId/revisions"),
    validateBody(revisionCreateSchema),
    handler(async (request) => services.item.createRevision(request.authenticatedUser!, String(request.params.mainLineId), request.body), 201)
  );
  router.get(
    `${prefix}/main-lines/:mainLineId/revisions/:revisionId/sections/:sectionKey`,
    protectedRoute,
    requireOperation("GET /admin/ai-estimator-knowledge/main-lines/:mainLineId/revisions/:revisionId/sections/:sectionKey"),
    validateSectionKey,
    handler(async (request) => services.item.getSection(request.authenticatedUser!, String(request.params.mainLineId), String(request.params.revisionId), request.params.sectionKey as KnowledgeSectionKey))
  );
  router.put(
    `${prefix}/main-lines/:mainLineId/revisions/:revisionId/sections/:sectionKey`,
    protectedRoute,
    requireOperation("PUT /admin/ai-estimator-knowledge/main-lines/:mainLineId/revisions/:revisionId/sections/:sectionKey"),
    validateSectionKey,
    validateBody(sectionUpdateSchema),
    validateSectionPayload,
    handler(async (request) => services.item.updateSection(request.authenticatedUser!, String(request.params.mainLineId), String(request.params.revisionId), request.params.sectionKey as KnowledgeSectionKey, request.body))
  );
  router.post(
    `${prefix}/main-lines/:mainLineId/revisions/:revisionId/activate`,
    protectedRoute,
    requireOperation("POST /admin/ai-estimator-knowledge/main-lines/:mainLineId/revisions/:revisionId/activate"),
    validateBody(activationSchema),
    handler(async (request) => services.item.activate(request.authenticatedUser!, String(request.params.mainLineId), String(request.params.revisionId), request.body))
  );
  router.post(
    `${prefix}/main-lines/:mainLineId/deactivate`,
    protectedRoute,
    requireOperation("POST /admin/ai-estimator-knowledge/main-lines/:mainLineId/deactivate"),
    validateBody(expectedVersionCommandSchema),
    handler(async (request) => services.item.deactivate(request.authenticatedUser!, String(request.params.mainLineId), request.body))
  );
  router.post(
    `${prefix}/main-lines/:mainLineId/duplicate`,
    protectedRoute,
    requireOperation("POST /admin/ai-estimator-knowledge/main-lines/:mainLineId/duplicate"),
    validateBody(duplicateSchema),
    handler(async (request) => services.item.duplicate(request.authenticatedUser!, String(request.params.mainLineId), request.body), 201)
  );
  router.post(
    `${prefix}/preview`,
    protectedRoute,
    requireOperation("POST /admin/ai-estimator-knowledge/preview"),
    validateBody(aiEstimatorKnowledgePreviewSchema),
    handler(async (request) => services.context.preview(request.authenticatedUser!, request.body as CalculateKnowledgePreviewInput))
  );

  for (const master of masterRoutes) registerMasterRoutes(router, protectedRoute, services.reference, master);

  return router;
}

function registerMasterRoutes(
  router: Router,
  protectedRoute: RequestHandler,
  service: AiEstimatorKnowledgeReferenceService,
  master: (typeof masterRoutes)[number]
): void {
  const basePath = `/admin/ai-estimator-knowledge/${master.path}` as const;
  const listOperation = `GET ${basePath}` as const;
  const createOperation = `POST ${basePath}` as const;
  const updateOperation = `PATCH ${basePath}/:id` as const;
  const archiveOperation = `DELETE ${basePath}/:id` as const;
  const listSchema = z.object({
    ...paginationFields,
    search: z.string().trim().min(1).max(240).optional(),
    status: z.enum(AI_ESTIMATOR_KNOWLEDGE_MASTER_STATUSES).optional(),
    includeArchived: includeArchivedSchema
  }).strict();

  router.get(basePath, protectedRoute, requireOperation(listOperation), validateQuery(listSchema),
    handler(async (request, response) => {
      const { filters, pagination } = splitPagination(response.locals.validatedQuery);
      return pageEnvelope(await service.listMasters(request.authenticatedUser!, master.kind as AiEstimatorKnowledgeMasterType, filters, pagination), pagination);
    }));
  router.post(basePath, protectedRoute, requireOperation(createOperation), validateBody(master.createSchema),
    handler(async (request) => service.createMaster(request.authenticatedUser!, master.kind, request.body), 201));
  router.patch(`${basePath}/:id`, protectedRoute, requireOperation(updateOperation), validateBody(master.updateSchema),
    handler(async (request) => service.updateMaster(request.authenticatedUser!, master.kind, String(request.params.id), request.body)));
  router.delete(`${basePath}/:id`, protectedRoute, requireOperation(archiveOperation), validateBody(archiveSchema),
    handler(async (request) => service.archiveMaster(request.authenticatedUser!, master.kind, String(request.params.id), request.body)));
}

function splitPagination(input: Record<string, unknown>): {
  filters: Record<string, unknown>;
  pagination: { limit: number; offset: number };
} {
  const { limit, offset, ...filters } = input;
  return {
    filters,
    pagination: { limit: Number(limit), offset: Number(offset) }
  };
}

function pageEnvelope<T>(
  page: { items: T[]; total: number },
  pagination: { limit: number; offset: number }
) {
  return {
    items: page.items,
    pagination: {
      ...pagination,
      total: page.total,
      hasMore: pagination.offset + page.items.length < page.total
    }
  };
}

function handler(
  operation: (request: Parameters<RequestHandler>[0], response: Parameters<RequestHandler>[1]) => Promise<unknown>,
  successStatus = 200
): RequestHandler {
  return async (request, response, next) => {
    try {
      response.status(successStatus).json({ data: await operation(request, response) });
    } catch (error) {
      next(error);
    }
  };
}

const validateSectionKey: RequestHandler = (request, _response, next) => {
  const parsed = z.enum(AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS).safeParse(request.params.sectionKey);
  if (!parsed.success) {
    next(new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", {
      sectionKey: "Knowledge section is invalid."
    }));
    return;
  }
  request.params.sectionKey = parsed.data;
  next();
};

const validateSectionPayload: RequestHandler = (request, _response, next) => {
  const sectionKey = request.params.sectionKey as KnowledgeSectionKey;
  const issues = validateKnowledgeSectionPayload(sectionKey, request.body.payload);
  if (issues.length > 0) {
    next(new ApiError(400, "VALIDATION_ERROR", "Request validation failed.", Object.fromEntries(
      issues.map((issue) => [issue.path, issue.message])
    )));
    return;
  }
  next();
};
