import { Router, type Request, type RequestHandler } from "express";
import { z } from "zod";
import { AI_ESTIMATOR_KNOWLEDGE_SECTION_APPLICABILITY, AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS, type KnowledgeSectionKey } from "../domain/ai-estimator-knowledge.js";
import type { ProposalScope, ProposalMasterKind } from "../contracts/vendor-basket-proposal.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import type { HumanJwtOperationKey } from "../domain/route-operations.js";
import { ApiError } from "../middleware/errors.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { createVendorBasketProposalService } from "../services/vendor-basket-proposal.service.js";

const name = z.string().transform((value) => value.normalize("NFKC").trim().replace(/\s+/gu, " ")).pipe(z.string().min(1).max(240));
const stableId = z.string().min(1).max(128).regex(/^[A-Za-z0-9:_-]+$/u);
const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u);
const expectedVersion = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const versions = { expectedVersion, expectedRequestVersion: expectedVersion.optional() };
const versionSchema = z.object(versions).strict();
const metadataSchema = z.object({ ...versions, name, description: z.string().max(4000).nullable().optional(), displayOrder: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional() }).strict();
const sectionSchema = z.object({ ...versions, applicability: z.enum(AI_ESTIMATOR_KNOWLEDGE_SECTION_APPLICABILITY), payload: z.record(z.string(), z.unknown()) }).strict();
const masterFields = { ...versions, name, description: z.string().max(4000).nullable().optional() };
const uomMasterSchema = z.object({ ...masterFields, decimalScale: z.number().int().min(0).max(3) }).strict();
const surfaceMasterSchema = z.object(masterFields).strict();
const validateMasterBody: RequestHandler = (request, response, next) =>
  validateBody(request.params.masterKind === "uoms" ? uomMasterSchema : surfaceMasterSchema)(request, response, next);
const qualitySchema = z.object({ ...versions, parameters: z.array(z.unknown()).max(200) }).strict();
const targetSchema = z.discriminatedUnion("kind", [z.object({ kind: z.literal("new_main_basket") }).strict(), z.object({ kind: z.literal("new_sub_basket"), basketId: stableId }).strict()]);
const createSchema = z.object({ target: targetSchema.optional(), vendorId: stableId.nullable().optional(), vendorName: name.nullable().optional(), name, idempotencyKey }).strict();
const submitSchema = z.object({ ...versions, idempotencyKey }).strict();
const decisionSchema = z.object({ ...versions, expectedRequestVersion: expectedVersion, idempotencyKey,
  decision: z.enum(["approve", "reject"]), reason: z.string().trim().min(1).max(1000).nullable().optional() }).strict()
  .refine((value) => value.decision !== "reject" || Boolean(value.reason), { message: "Enter a rejection reason.", path: ["reason"] });
const pagination = { limit: z.coerce.number().int().min(1).max(100).default(20), offset: z.coerce.number().int().min(0).default(0) };
const snapshot = z.enum(["current", "submitted", "approved"]).default("current");
const readQuery = z.object({ snapshot }).strict();
const hierarchyQuery = z.object({ snapshot, ...pagination }).strict();
const listQuery = z.object({ ...pagination, status: z.enum(["draft", "pending", "fulfilled", "rejected"]).optional() }).strict();
const pageQuery = z.object(pagination).strict();
const referenceQuery = z.object({ ...pagination,
  kind: z.enum(["uoms", "taxes", "modes", "surfaces", "priorities", "quality-frequencies", "quality-performers", "baskets", "sub-baskets", "main-lines"]),
  ids: z.string().max(12899).transform((value) => value.split(",")).pipe(z.array(stableId).max(100)).optional() }).strict();
const paramsSchema = z.object({ masterKind: z.enum(["uoms", "surfaces"]).optional(), proposalId: stableId.optional(), subBasketId: stableId.optional(), mainLineId: stableId.optional(), resourceId: stableId.optional(), sectionKey: z.enum(AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS).optional() }).strict();

export function createVendorBasketProposalRouter(auth: AuthService, service: ReturnType<typeof createVendorBasketProposalService>): Router {
  const router = Router(); const protectedRoute = authenticate(auth);
  const P = "/procurement/vendor-basket-proposals";
  const A = "/admin/ai-estimator-knowledge/basket-proposals";
  type Operation = (request: Request, query: Record<string, any>) => Promise<unknown>;
  function register(method: "get" | "post" | "put" | "patch" | "delete", path: string, operation: Operation,
    body?: z.ZodTypeAny | RequestHandler, query?: z.ZodTypeAny, created = false): void {
    router[method](path, protectedRoute, requireOperation(`${method.toUpperCase()} ${path}` as HumanJwtOperationKey),
      (request, _response, next) => { const result = paramsSchema.safeParse(request.params);
        if (!result.success) { next(new ApiError(400, "VALIDATION_ERROR", "A resource identifier is invalid.")); return; } next(); },
      ...(body ? [typeof body === "function" ? body : validateBody(body)] : []), ...(query ? [validateQuery(query)] : []), async (request, response, next) => {
        try { response.set("Cache-Control", "private, no-store").status(created ? 201 : 200).json({ data: await operation(request, response.locals.validatedQuery ?? {}) }); }
        catch (error) { next(error); }
      });
  }
  register("post", P, (r) => service.create(r.authenticatedUser!, r.body), createSchema, undefined, true);
  register("get", `${P}/mine`, (r, q) => service.listMine(r.authenticatedUser!, q as z.infer<typeof listQuery>), undefined, listQuery);
  for (const [base, scope] of [[P, "procurement"], [A, "admin"]] as const satisfies ReadonlyArray<readonly [string, ProposalScope]>) {
    const proposal = (r: Request) => String(r.params.proposalId);
    register("get", `${base}/references`, (r, q) => service.references(r.authenticatedUser!, scope, q as z.infer<typeof referenceQuery>), undefined, referenceQuery);
    register("get", `${base}/:proposalId`, (r, q) => service.get(r.authenticatedUser!, scope, proposal(r), q), undefined, readQuery);
    const masterKind = (r: Request) => r.params.masterKind as ProposalMasterKind;
    register("get", `${base}/:proposalId/masters/:masterKind`, (r, q) => service.masters(r.authenticatedUser!, scope, proposal(r), masterKind(r), q as z.infer<typeof hierarchyQuery>), undefined, hierarchyQuery);
    register("post", `${base}/:proposalId/masters/:masterKind`, (r) => service.addMaster(r.authenticatedUser!, scope, proposal(r), masterKind(r), r.body), validateMasterBody, undefined, true);
    register("patch", `${base}/:proposalId/masters/:masterKind/:resourceId`, (r) => service.saveMaster(r.authenticatedUser!, scope, proposal(r), masterKind(r), String(r.params.resourceId), r.body), validateMasterBody);
    register("delete", `${base}/:proposalId/masters/:masterKind/:resourceId`, (r) => service.removeMaster(r.authenticatedUser!, scope, proposal(r), masterKind(r), String(r.params.resourceId), r.body), versionSchema);
    register("get", `${base}/:proposalId/hierarchy`, (r, q) => service.hierarchy(r.authenticatedUser!, scope, proposal(r), q as z.infer<typeof hierarchyQuery>), undefined, hierarchyQuery);
    register("get", `${base}/:proposalId/resources/:resourceId`, (r, q) => service.resource(r.authenticatedUser!, scope, proposal(r), String(r.params.resourceId), q), undefined, readQuery);
    register("get", `${base}/:proposalId/inherited-quality`, (r) => service.inheritedQuality(r.authenticatedUser!, scope, proposal(r)), undefined, z.object({}).strict());
    register("get", `${base}/:proposalId/readiness`, (r) => service.readiness(r.authenticatedUser!, scope, proposal(r)), undefined, z.object({}).strict());
    register("patch", `${base}/:proposalId/basket`, (r) => service.saveBasket(r.authenticatedUser!, scope, proposal(r), r.body), metadataSchema);
    register("post", `${base}/:proposalId/sub-baskets`, (r) => service.addSubBasket(r.authenticatedUser!, scope, proposal(r), r.body), metadataSchema, undefined, true);
    register("patch", `${base}/:proposalId/sub-baskets/:subBasketId`, (r) => service.saveSubBasket(r.authenticatedUser!, scope, proposal(r), String(r.params.subBasketId), r.body), metadataSchema);
    register("delete", `${base}/:proposalId/sub-baskets/:subBasketId`, (r) => service.removeSubBasket(r.authenticatedUser!, scope, proposal(r), String(r.params.subBasketId), r.body), versionSchema);
    register("post", `${base}/:proposalId/sub-baskets/:subBasketId/main-lines`, (r) => service.addMainLine(r.authenticatedUser!, scope, proposal(r), String(r.params.subBasketId), r.body), metadataSchema, undefined, true);
    register("patch", `${base}/:proposalId/main-lines/:mainLineId`, (r) => service.saveMainLine(r.authenticatedUser!, scope, proposal(r), String(r.params.mainLineId), r.body), metadataSchema);
    register("delete", `${base}/:proposalId/main-lines/:mainLineId`, (r) => service.removeMainLine(r.authenticatedUser!, scope, proposal(r), String(r.params.mainLineId), r.body), versionSchema);
    register("put", `${base}/:proposalId/main-lines/:mainLineId/sections/:sectionKey`, (r) => service.saveSection(r.authenticatedUser!, scope, proposal(r), String(r.params.mainLineId), r.params.sectionKey as KnowledgeSectionKey, r.body), sectionSchema);
    register("put", `${base}/:proposalId/quality`, (r) => service.saveQuality(r.authenticatedUser!, scope, proposal(r), r.body), qualitySchema);
  }
  register("post", `${P}/:proposalId/submit`, (r) => service.submit(r.authenticatedUser!, String(r.params.proposalId), r.body), submitSchema);
  register("post", `${P}/:proposalId/revise`, (r) => service.revise(r.authenticatedUser!, String(r.params.proposalId), r.body), submitSchema, undefined, true);
  register("get", `${A}/:proposalId/changes`, (r, q) => service.changes(r.authenticatedUser!, String(r.params.proposalId), q as z.infer<typeof pageQuery>), undefined, pageQuery);
  register("post", `${A}/:proposalId/decision`, (r) => service.decide(r.authenticatedUser!, String(r.params.proposalId), r.body), decisionSchema);
  return router;
}
