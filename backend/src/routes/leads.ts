import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { paginatedEnvelope, paginationShape } from "../middleware/pagination.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { LeadService } from "../services/lead.service.js";

const stages = ["new_lead", "contacted", "site_visit", "design_meeting", "estimate_in_progress", "estimate_sent", "negotiation", "won", "lost"] as const;
const activities = ["call", "whatsapp", "meeting", "email", "note"] as const;
const nullableText = z.string().trim().min(1).nullable().optional();
const leadFields = z.object({ clientName: z.string().trim().min(1), clientEmail: z.string().trim().email(), clientMobile: z.string().trim().min(1), projectName: z.string().trim().min(1), location: z.string().trim().min(1), propertyType: z.string().trim().min(1), budgetMin: z.number().nonnegative().nullable().optional(), budgetMax: z.number().nonnegative().nullable().optional(), source: z.string().trim().min(1), nextAction: z.string().trim().min(1), nextActionAt: z.string().datetime({ offset: true }), builder: nullableText, areaSqft: z.number().positive().nullable().optional(), targetHandoverAt: z.string().datetime({ offset: true }).nullable().optional(), notes: nullableText }).strict();
const budgetValid = (value: { budgetMin?: number | null; budgetMax?: number | null }) => value.budgetMin == null || value.budgetMax == null || value.budgetMax >= value.budgetMin;
const createSchema = leadFields.refine(budgetValid, { path: ["budgetMax"], message: "Maximum budget must be at least the minimum budget." });
const updateSchema = leadFields.partial().extend({ stage: z.enum(stages).optional() }).refine((value) => Object.keys(value).length > 0, { path: ["stage"], message: "Provide at least one lead change." }).refine(budgetValid, { path: ["budgetMax"], message: "Maximum budget must be at least the minimum budget." });
const listSchema = z.object({ ...paginationShape, search: z.string().trim().optional(), stage: z.enum(stages).optional() }).strict();
const activitySchema = z.object({ type: z.enum(activities), note: z.string().trim().min(1), occurredAt: z.string().datetime({ offset: true }) }).strict();

export function createLeadsRouter(
  auth: AuthService,
  leads: LeadService
): Router {
  const router = Router(); const protectedRoute = authenticate(auth);
  router.get("/leads", protectedRoute, requireOperation("GET /leads"), validateQuery(listSchema), async (req, res, next) => { try { const { limit, offset, search, stage } = res.locals.validatedQuery; const pagination = { limit, offset }; res.json({ data: paginatedEnvelope(await leads.page(req.authenticatedUser!, { search, stage }, pagination), pagination) }); } catch (error) { next(error); } });
  router.post("/leads", protectedRoute, requireOperation("POST /leads"), validateBody(createSchema), async (req, res, next) => { try { res.status(201).json({ data: await leads.create(req.authenticatedUser!, req.body) }); } catch (error) { next(error); } });
  router.get("/leads/:leadId", protectedRoute, requireOperation("GET /leads/:leadId"), async (req, res, next) => { try { res.json({ data: await leads.get(req.authenticatedUser!, req.params.leadId as string) }); } catch (error) { next(error); } });
  router.patch("/leads/:leadId", protectedRoute, requireOperation("PATCH /leads/:leadId"), validateBody(updateSchema), async (req, res, next) => { try { res.json({ data: await leads.update(req.authenticatedUser!, req.params.leadId as string, req.body) }); } catch (error) { next(error); } });
  router.get("/leads/:leadId/activities", protectedRoute, requireOperation("GET /leads/:leadId/activities"), validateQuery(z.object(paginationShape).strict()), async (req, res, next) => { try { const { limit, offset } = res.locals.validatedQuery; const items = await leads.listActivities(req.authenticatedUser!, req.params.leadId as string); res.json({ data: paginatedEnvelope({ items: items.slice(offset, offset + limit), total: items.length }, { limit, offset }) }); } catch (error) { next(error); } });
  router.post("/leads/:leadId/activities", protectedRoute, requireOperation("POST /leads/:leadId/activities"), validateBody(activitySchema), async (req, res, next) => { try { res.status(201).json({ data: await leads.addActivity(req.authenticatedUser!, req.params.leadId as string, req.body) }); } catch (error) { next(error); } });
  return router;
}
