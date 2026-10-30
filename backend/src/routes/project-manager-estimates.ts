import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { pmVendorCandidateQuerySchema, pmVendorSuggestionQuerySchema,
  pmVendorSuggestionCreateSchema, pmVendorSuggestionUpdateSchema } from "../domain/project-manager/estimates.js";
import type { AuthService } from "../services/auth.service.js";
import type { createPMEstimateReadService } from "../services/project-manager/estimates.js";
import type { PMVendorSuggestionCommandService } from "../services/project-manager/vendor-suggestion-commands.js";
import type { createProcurementMainLineSuggestionService } from "../services/procurement-main-line-suggestions.service.js";

export function createProjectManagerEstimatesRouter(auth: AuthService,
  reads: ReturnType<typeof createPMEstimateReadService>, commands: PMVendorSuggestionCommandService,
  procurement: ReturnType<typeof createProcurementMainLineSuggestionService>) {
  const router = Router();
  const protect = authenticate(auth);
  const base = "/projects/:projectId/pm";
  const suggestions = `${base}/vendor-suggestions`;
  const basket = "/procurement/projects/:projectId/baskets/:basketId/vendor-suggestions";
  router.get(`${base}/estimate`, protect, requireOperation(`GET ${base}/estimate`), async (req, res, next) => {
    try { res.set("Cache-Control", "private, no-store").json({ data: await reads.estimate(req.authenticatedUser!, String(req.params.projectId)) }); }
    catch (error) { next(error); }
  });
  router.get(`${base}/vendor-suggestion-candidates`, protect, requireOperation(`GET ${base}/vendor-suggestion-candidates`),
    validateQuery(pmVendorCandidateQuerySchema), async (req, res, next) => {
      try { res.set("Cache-Control", "private, no-store").json({ data: await reads.candidates(req.authenticatedUser!, String(req.params.projectId), res.locals.validatedQuery) }); }
      catch (error) { next(error); }
    });
  router.get(suggestions, protect, requireOperation(`GET ${suggestions}`), validateQuery(pmVendorSuggestionQuerySchema), async (req, res, next) => {
    try { res.set("Cache-Control", "private, no-store").json({ data: await reads.suggestions(req.authenticatedUser!, String(req.params.projectId), res.locals.validatedQuery) }); }
    catch (error) { next(error); }
  });
  router.post(suggestions, protect, requireOperation(`POST ${suggestions}`), validateBody(pmVendorSuggestionCreateSchema), async (req, res, next) => {
    try { res.set("Cache-Control", "private, no-store").status(201).json({ data: await commands.create(req.authenticatedUser!, String(req.params.projectId), req.body) }); }
    catch (error) { next(error); }
  });
  router.patch(`${suggestions}/:suggestionId`, protect, requireOperation(`PATCH ${suggestions}/:suggestionId`), validateBody(pmVendorSuggestionUpdateSchema), async (req, res, next) => {
    try { res.set("Cache-Control", "private, no-store").json({ data: await commands.update(req.authenticatedUser!, String(req.params.projectId), String(req.params.suggestionId), req.body) }); }
    catch (error) { next(error); }
  });
  router.get(basket, protect, requireOperation(`GET ${basket}`), validateQuery(pmVendorSuggestionQuerySchema), async (req, res, next) => {
    try { res.set("Cache-Control", "private, no-store").json({ data: await procurement.list(req.authenticatedUser!, String(req.params.projectId), String(req.params.basketId), res.locals.validatedQuery) }); }
    catch (error) { next(error); }
  });
  return router;
}
