import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { procurementBasketAwardCreateSchema, procurementBasketAwardDecisionSchema, procurementBasketAwardPreviewSchema,
  procurementBasketAwardSubmitSchema, procurementBasketAwardUpdateSchema,
  procurementBasketAwardWithdrawSchema, procurementBasketCounterofferSchema,
  procurementBasketDispatchSchema, procurementBasketEnquiryCreateSchema, procurementBasketEnquiryUpdateSchema,
  procurementBasketInvitationBatchPreviewSchema, procurementBasketInvitationBatchSubmitSchema,
  procurementBasketPublicInspectSchema, procurementBasketPublicSubmitSchema,
  procurementBasketResendInvitationSchema, procurementBasketWhatsAppShareIntentSchema } from "../domain/procurement-basket-tender.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { ProcurementBasketAwardService } from "../services/procurement-basket-award.service.js";
import type { ProcurementBasketEnquiryService } from "../services/procurement-basket-enquiry.service.js";
import type { ProcurementBasketService } from "../services/procurement-basket.service.js";
import type { ProcurementBasketIssueInput, ProcurementBasketIssueResult } from "../services/project-purchase-order-basket-issue.service.js";
import type { PublicUser } from "../services/auth.service.js";

const basketBase = "/procurement/projects/:projectId/baskets";
const basketDetail = `${basketBase}/:basketId`;
const enquiryBase = `${basketDetail}/enquiries`;
const enquiryDetail = `${enquiryBase}/:enquiryId`;
const historyBase = `${enquiryDetail}/history`;
const historyDetail = `${historyBase}/:revisionId`;
const awardBase = `${enquiryDetail}/awards`;
const awardDetail = `${awardBase}/:awardId`;
const issueSchema = z.object({ expectedVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{8,128}$/u) }).strict();
const historyListQuerySchema = z.object({ beforeRevision: z.coerce.number().int().positive().safe().optional(),
  limit: z.coerce.number().int().min(1).max(20).default(10) }).strict();
const historyDetailQuerySchema = z.object({ bidOffset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  counterofferOffset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  limit: z.coerce.number().int().min(1).max(50).default(25) }).strict();
const publicPolicy: RequestHandler = (request, response, next) => {
  delete request.headers.authorization;
  delete request.headers.cookie;
  response.set("Cache-Control", "no-store").set("Referrer-Policy", "no-referrer").set("X-Robots-Tag", "noindex");
  next();
};
const privatePolicy: RequestHandler = (_request, response, next) => {
  response.set("Cache-Control", "private, no-store");
  next();
};
type IssueService = { issue(actor: PublicUser, projectId: string, basketId: string, enquiryId: string,
  awardId: string, input: ProcurementBasketIssueInput): Promise<ProcurementBasketIssueResult> };

export function createProcurementBasketTenderRouter(auth: AuthService, basket: ProcurementBasketService,
  enquiry: ProcurementBasketEnquiryService, award: ProcurementBasketAwardService, issue: IssueService,
  publicLimit: RequestHandler, deliveryLimit: RequestHandler): Router {
  const router = Router();
  router.get(basketBase, authenticate(auth), requireOperation(`GET ${basketBase}`), privatePolicy,
    async (request, response, next) => { try { response.json({ data: await basket.list(request.authenticatedUser!, String(request.params.projectId)) }); }
      catch (error) { next(error); } });
  router.get(basketDetail, authenticate(auth), requireOperation(`GET ${basketDetail}`), privatePolicy,
    async (request, response, next) => { try { response.json({ data: await basket.get(request.authenticatedUser!, String(request.params.projectId),
      String(request.params.basketId)) }); } catch (error) { next(error); } });
  router.get(enquiryBase, authenticate(auth), requireOperation(`GET ${enquiryBase}`), privatePolicy,
    async (request, response, next) => { try { response.json({ data: await enquiry.list(request.authenticatedUser!, String(request.params.projectId),
      String(request.params.basketId)) }); } catch (error) { next(error); } });
  router.post(enquiryBase, authenticate(auth), requireOperation(`POST ${enquiryBase}`), privatePolicy,
    validateBody(procurementBasketEnquiryCreateSchema), async (request, response, next) => {
      try { response.status(201).json({ data: await enquiry.create(request.authenticatedUser!, String(request.params.projectId),
        String(request.params.basketId), request.body) }); } catch (error) { next(error); }
    });
  router.get(enquiryDetail, authenticate(auth), requireOperation(`GET ${enquiryDetail}`), privatePolicy,
    async (request, response, next) => { try { response.json({ data: await enquiry.get(request.authenticatedUser!, String(request.params.projectId),
      String(request.params.basketId), String(request.params.enquiryId)) }); } catch (error) { next(error); } });
  router.get(historyBase, authenticate(auth), requireOperation(`GET ${historyBase}`), privatePolicy,
    validateQuery(historyListQuerySchema), async (request, response, next) => {
      try { response.json({ data: await enquiry.history(request.authenticatedUser!, String(request.params.projectId),
        String(request.params.basketId), String(request.params.enquiryId), response.locals.validatedQuery) }); }
      catch (error) { next(error); }
    });
  router.get(historyDetail, authenticate(auth), requireOperation(`GET ${historyDetail}`), privatePolicy,
    validateQuery(historyDetailQuerySchema), async (request, response, next) => {
      try { response.json({ data: await enquiry.historyDetail(request.authenticatedUser!, String(request.params.projectId),
        String(request.params.basketId), String(request.params.enquiryId), String(request.params.revisionId),
        response.locals.validatedQuery) }); } catch (error) { next(error); }
    });
  router.put(enquiryDetail, authenticate(auth), requireOperation(`PUT ${enquiryDetail}`), privatePolicy,
    validateBody(procurementBasketEnquiryUpdateSchema), async (request, response, next) => {
      try { response.json({ data: await enquiry.update(request.authenticatedUser!, String(request.params.projectId),
        String(request.params.basketId), String(request.params.enquiryId), request.body) }); } catch (error) { next(error); }
    });
  router.post(`${enquiryDetail}/dispatch`, authenticate(auth), requireOperation(`POST ${enquiryDetail}/dispatch`),
    deliveryLimit, privatePolicy, validateBody(procurementBasketDispatchSchema), async (request, response, next) => {
      try { response.json({ data: await enquiry.dispatch(request.authenticatedUser!, String(request.params.projectId),
        String(request.params.basketId), String(request.params.enquiryId), request.body) }); } catch (error) { next(error); }
    });
  router.post(`${enquiryDetail}/invitation-batches/preview`, authenticate(auth),
    requireOperation(`POST ${enquiryDetail}/invitation-batches/preview`), privatePolicy,
    validateBody(procurementBasketInvitationBatchPreviewSchema), async (request, response, next) => {
      try { response.json({ data: await enquiry.previewInvitationBatch(request.authenticatedUser!,
        String(request.params.projectId), String(request.params.basketId), String(request.params.enquiryId), request.body) }); }
      catch (error) { next(error); }
    });
  router.post(`${enquiryDetail}/invitation-batches`, authenticate(auth),
    requireOperation(`POST ${enquiryDetail}/invitation-batches`), deliveryLimit, privatePolicy,
    validateBody(procurementBasketInvitationBatchSubmitSchema), async (request, response, next) => {
      try { response.json({ data: await enquiry.submitInvitationBatch(request.authenticatedUser!,
        String(request.params.projectId), String(request.params.basketId), String(request.params.enquiryId), request.body) }); }
      catch (error) { next(error); }
    });
  router.post(`${enquiryDetail}/resend-invitation`, authenticate(auth),
    requireOperation(`POST ${enquiryDetail}/resend-invitation`), deliveryLimit, privatePolicy,
    validateBody(procurementBasketResendInvitationSchema), async (request, response, next) => {
      try { response.json({ data: await enquiry.resendInvitation(request.authenticatedUser!, String(request.params.projectId),
        String(request.params.basketId), String(request.params.enquiryId), request.body) }); } catch (error) { next(error); }
    });
  router.post(`${enquiryDetail}/invitations/:vendorId/whatsapp-share-intent`, authenticate(auth),
    requireOperation(`POST ${enquiryDetail}/invitations/:vendorId/whatsapp-share-intent`),
    deliveryLimit, privatePolicy, validateBody(procurementBasketWhatsAppShareIntentSchema),
    async (request, response, next) => {
      try { response.json({ data: await enquiry.whatsAppShareIntent(request.authenticatedUser!,
        String(request.params.projectId), String(request.params.basketId), String(request.params.enquiryId),
        String(request.params.vendorId)) }); } catch (error) { next(error); }
    });
  router.post(`${enquiryDetail}/counteroffers`, authenticate(auth), requireOperation(`POST ${enquiryDetail}/counteroffers`),
    deliveryLimit, privatePolicy, validateBody(procurementBasketCounterofferSchema), async (request, response, next) => {
      try { response.json({ data: await enquiry.requestCounteroffer(request.authenticatedUser!, String(request.params.projectId),
        String(request.params.basketId), String(request.params.enquiryId), request.body) }); } catch (error) { next(error); }
    });
  router.get(`${enquiryDetail}/comparison`, authenticate(auth), requireOperation(`GET ${enquiryDetail}/comparison`), privatePolicy,
    async (request, response, next) => { try { response.json({ data: await award.comparison(request.authenticatedUser!,
      String(request.params.projectId), String(request.params.basketId), String(request.params.enquiryId)) }); }
      catch (error) { next(error); } });
  router.post(`${enquiryDetail}/award-preview`, authenticate(auth), requireOperation(`POST ${enquiryDetail}/award-preview`),
    privatePolicy, validateBody(procurementBasketAwardPreviewSchema), async (request, response, next) => {
      try { response.json({ data: await award.preview(request.authenticatedUser!, String(request.params.projectId),
        String(request.params.basketId), String(request.params.enquiryId), request.body) }); } catch (error) { next(error); }
    });
  router.post(awardBase, authenticate(auth), requireOperation(`POST ${awardBase}`), privatePolicy,
    validateBody(procurementBasketAwardCreateSchema), async (request, response, next) => {
      try { response.status(201).json({ data: await award.create(request.authenticatedUser!, String(request.params.projectId),
        String(request.params.basketId), String(request.params.enquiryId), request.body) }); } catch (error) { next(error); }
    });
  router.get(awardDetail, authenticate(auth), requireOperation(`GET ${awardDetail}`), privatePolicy,
    async (request, response, next) => { try { response.json({ data: await award.get(request.authenticatedUser!,
      String(request.params.projectId), String(request.params.basketId), String(request.params.enquiryId),
      String(request.params.awardId)) }); } catch (error) { next(error); } });
  router.put(awardDetail, authenticate(auth), requireOperation(`PUT ${awardDetail}`), privatePolicy,
    validateBody(procurementBasketAwardUpdateSchema), async (request, response, next) => {
      try { response.json({ data: await award.update(request.authenticatedUser!, String(request.params.projectId),
        String(request.params.basketId), String(request.params.enquiryId), String(request.params.awardId), request.body) }); }
      catch (error) { next(error); }
    });
  router.post(`${awardDetail}/submit`, authenticate(auth), requireOperation(`POST ${awardDetail}/submit`), privatePolicy,
    validateBody(procurementBasketAwardSubmitSchema), async (request, response, next) => {
      try { response.json({ data: await award.submit(request.authenticatedUser!, String(request.params.projectId),
        String(request.params.basketId), String(request.params.enquiryId), String(request.params.awardId), request.body) }); }
      catch (error) { next(error); }
    });
  router.post(`${awardDetail}/withdraw`, authenticate(auth), requireOperation(`POST ${awardDetail}/withdraw`), privatePolicy,
    validateBody(procurementBasketAwardWithdrawSchema), async (request, response, next) => {
      try { response.json({ data: await award.withdraw(request.authenticatedUser!, String(request.params.projectId),
        String(request.params.basketId), String(request.params.enquiryId), String(request.params.awardId), request.body) }); }
      catch (error) { next(error); }
    });
  router.post(`${awardDetail}/issue`, authenticate(auth), requireOperation(`POST ${awardDetail}/issue`), privatePolicy,
    validateBody(issueSchema), async (request, response, next) => {
      try { response.json({ data: await issue.issue(request.authenticatedUser!, String(request.params.projectId),
        String(request.params.basketId), String(request.params.enquiryId), String(request.params.awardId), request.body) }); }
      catch (error) { next(error); }
    });
  router.get("/work-order-approvals", authenticate(auth), requireOperation("GET /work-order-approvals"), privatePolicy,
    async (request, response, next) => { try { response.json({ data: await award.approvalQueue(request.authenticatedUser!) }); }
      catch (error) { next(error); } });
  router.get("/work-order-approvals/:awardId", authenticate(auth), requireOperation("GET /work-order-approvals/:awardId"),
    privatePolicy, async (request, response, next) => { try { response.json({ data: await award.approvalDetail(request.authenticatedUser!,
      String(request.params.awardId)) }); } catch (error) { next(error); } });
  router.post("/work-order-approvals/:awardId/decision", authenticate(auth),
    requireOperation("POST /work-order-approvals/:awardId/decision"), privatePolicy,
    validateBody(procurementBasketAwardDecisionSchema), async (request, response, next) => {
      try { response.json({ data: await award.decide(request.authenticatedUser!, String(request.params.awardId), request.body) }); }
      catch (error) { next(error); }
    });
  router.post("/vendor-boq/inspect", publicPolicy, publicLimit, validateBody(procurementBasketPublicInspectSchema),
    async (request, response, next) => { try { response.json({ data: await enquiry.inspectVendorBoq(request.body.token) }); }
      catch (error) { next(error); } });
  router.post("/vendor-boq/submit", publicPolicy, publicLimit, validateBody(procurementBasketPublicSubmitSchema),
    async (request, response, next) => { try { response.json({ data: await enquiry.submitVendorBid(request.body) }); }
      catch (error) { next(error); } });
  return router;
}
