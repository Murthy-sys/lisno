import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateQuery } from "../middleware/validate.js";
import { chatListQuerySchema } from "../domain/project-chat.js";
import type { NotificationService } from "../contracts/notifications.js";
import type { AuthService } from "../services/auth.service.js";
import type { createNotificationStreamService } from "../services/notification-stream.service.js";
import { chatActorFromAuthenticatedRequest } from "../services/project-chat-authentication.js";
export function createNotificationsRouter(auth: AuthService, service: NotificationService, stream: ReturnType<typeof createNotificationStreamService>) {
  const router = Router();
  router.get("/notifications", authenticate(auth), requireOperation("GET /notifications"), validateQuery(chatListQuerySchema), async (request, response, next) => {
    try { response.setHeader("Cache-Control", "no-store"); response.json({data: await service.list(chatActorFromAuthenticatedRequest(request), response.locals.validatedQuery)}); } catch (error) { next(error); }
  });
  router.put("/notifications/:notificationId/read", authenticate(auth), requireOperation("PUT /notifications/:notificationId/read"), async (request, response, next) => {
    try { response.setHeader("Cache-Control", "no-store"); response.json({data: await service.read(chatActorFromAuthenticatedRequest(request), String(request.params.notificationId))}); } catch (error) { next(error); }
  });
  router.get("/notifications/events", authenticate(auth), requireOperation("GET /notifications/events"), async (request, response, next) => {
    try { await stream.open(request, response); } catch (error) { next(error); }
  });
  return router;
}
