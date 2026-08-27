import { Router } from "express";
import { z } from "zod";

import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { ProjectFinanceService } from "../services/project-finance.service.js";
import { sendDownload } from "./estimate-client-responses.js";

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
}).strict();

const financeEntryFields = {
  category: z.string().trim().min(1).max(100),
  amountPaise: z.number().int().positive(),
  incurredAt: z.string().datetime({ offset: true }),
  description: z.string().trim().min(1).max(1_000),
  vendor: z.string().trim().min(1).max(200).nullable().optional(),
  reference: z.string().trim().min(1).max(200).nullable().optional(),
  sourceSectionId: z.string().trim().min(1).max(64).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(128)
} as const;

const financeEntrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("direct_spend"),
    // Procurement spending must use the receipt-backed, approved-item route.
    expenseClass: z.enum(["employee_payment", "other"]),
    ...financeEntryFields
  }).strict(),
  z.object({
    type: z.literal("overhead"),
    expenseClass: z.null().optional(),
    ...financeEntryFields
  }).strict()
]);

export function createProjectFinanceRouter(
  auth: AuthService,
  service: ProjectFinanceService
): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);

  router.get(
    "/finance/projects",
    protectedRoute,
    requireOperation("GET /finance/projects"),
    validateQuery(paginationSchema),
    async (request, response, next) => {
      try {
        const pagination = response.locals.validatedQuery;
        const page = await service.listProjects(
          request.authenticatedUser!,
          pagination
        );
        response.json({
          data: {
            items: page.items,
            summary: page.summary,
            pagination: {
              ...pagination,
              total: page.total,
              hasMore: pagination.offset + page.items.length < page.total
            }
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/finance/projects/:projectId",
    protectedRoute,
    requireOperation("GET /finance/projects/:projectId"),
    async (request, response, next) => {
      try {
        response.json({
          data: await service.getBucket(
            request.authenticatedUser!,
            String(request.params.projectId)
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/finance/projects/:projectId/entries",
    protectedRoute,
    requireOperation("GET /finance/projects/:projectId/entries"),
    validateQuery(paginationSchema),
    async (request, response, next) => {
      try {
        const pagination = response.locals.validatedQuery;
        const page = await service.listEntries(
          request.authenticatedUser!,
          String(request.params.projectId),
          pagination
        );
        response.json({
          data: {
            items: page.items,
            pagination: {
              ...pagination,
              total: page.total,
              hasMore: pagination.offset + page.items.length < page.total
            }
          }
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/finance/projects/:projectId/entries/:entryId/document",
    protectedRoute,
    requireOperation("GET /finance/projects/:projectId/entries/:entryId/document"),
    async (request, response, next) => {
      try {
        response
          .set("Cache-Control", "private, no-store")
          .set("X-Content-Type-Options", "nosniff");
        sendDownload(
          response,
          await service.readEntryDocument(
            request.authenticatedUser!,
            String(request.params.projectId),
            String(request.params.entryId)
          )
        );
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    "/finance/projects/:projectId/entries",
    protectedRoute,
    requireOperation("POST /finance/projects/:projectId/entries"),
    validateBody(financeEntrySchema),
    async (request, response, next) => {
      try {
        const result = await service.postEntry(
          request.authenticatedUser!,
          String(request.params.projectId),
          request.body
        );
        response.status(result.replayed ? 200 : 201).json({ data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
