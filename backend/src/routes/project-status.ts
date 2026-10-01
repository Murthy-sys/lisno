import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import type { AuthService } from "../services/auth.service.js";
import { chatActorFromAuthenticatedRequest } from "../services/project-chat-authentication.js";
import type { ProjectStatusService } from "../services/project-status.service.js";

export function createProjectStatusRouter(service: ProjectStatusService, auth: AuthService): Router {
  const router = Router();
  router.get("/projects/:projectId/status", authenticate(auth), requireOperation("GET /projects/:projectId/status"), async (request, response, next) => {
    try {
      response.setHeader("Cache-Control", "no-store");
      response.json({ data: await service.get(chatActorFromAuthenticatedRequest(request), String(request.params.projectId)) });
    } catch (error) { next(error); }
  });
  return router;
}
