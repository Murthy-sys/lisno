import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import { keyCollectionRemindersQuerySchema, type KeyCollectionRemindersService } from "../services/key-collection-reminders.service.js";

export function createKeyCollectionRemindersRouter(auth: AuthService, service: KeyCollectionRemindersService): Router {
  const router = Router();
  router.get("/designer/key-collection-reminders", authenticate(auth),
    requireOperation("GET /designer/key-collection-reminders"), validateQuery(keyCollectionRemindersQuerySchema),
    async (request, response, next) => {
      try { response.json({ data: await service.list(request.authenticatedUser!, response.locals.validatedQuery) }); }
      catch (error) { next(error); }
    });
  return router;
}
