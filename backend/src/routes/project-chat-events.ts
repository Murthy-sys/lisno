import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { ProjectChatStreamService } from "../services/project-chat-stream.service.js";

export function createProjectChatEventsRouter(auth: AuthService, stream: ProjectChatStreamService): Router {
  const router = Router();
  router.get("/projects/:projectId/chat/events", authenticate(auth),
    requireOperation("GET /projects/:projectId/chat/events"),
    validateQuery(z.object({ cursor: z.string().max(512).optional() }).strict()),
    async (request, response, next) => {
      try {
        await stream.open(request, response, String(request.params.projectId), response.locals.validatedQuery.cursor);
      } catch (error) { next(error); }
    });
  return router;
}
