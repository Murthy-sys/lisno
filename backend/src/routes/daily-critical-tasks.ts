import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import type { AuthService } from "../services/auth.service.js";
import type { DailyCriticalTasksService } from "../services/daily-critical-tasks.service.js";
import { chatActorFromAuthenticatedRequest } from "../services/project-chat-authentication.js";

export function createDailyCriticalTasksRouter(auth: AuthService, service: DailyCriticalTasksService): Router {
  const router = Router();
  const protectedRoute = authenticate(auth);
  router.get("/chat/availability", protectedRoute, requireOperation("GET /chat/availability"), async (request, response, next) => {
    try { response.setHeader("Cache-Control", "no-store"); response.json({data: await service.availability(chatActorFromAuthenticatedRequest(request))}); }
    catch (error) { next(error); }
  });
  router.get("/daily-critical-tasks", protectedRoute, requireOperation("GET /daily-critical-tasks"), async (request, response, next) => {
    try { response.setHeader("Cache-Control", "no-store"); response.json({data: await service.get(chatActorFromAuthenticatedRequest(request))}); }
    catch (error) { next(error); }
  });
  router.put("/daily-critical-tasks/:localDate/acknowledgment", protectedRoute, requireOperation("PUT /daily-critical-tasks/:localDate/acknowledgment"), async (request, response, next) => {
    try { response.setHeader("Cache-Control", "no-store"); response.json({data: await service.acknowledge(chatActorFromAuthenticatedRequest(request), String(request.params.localDate))}); }
    catch (error) { next(error); }
  });
  return router;
}
