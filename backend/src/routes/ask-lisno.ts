import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import { askLisnoSchema, type AskLisnoService } from "../services/ask-lisno.service.js";
import { chatActorFromAuthenticatedRequest } from "../services/project-chat-authentication.js";

export function createAskLisnoRouter(auth: AuthService, service: AskLisnoService): Router {
  const router = Router();
  router.post("/client/ask-lisno", authenticate(auth), requireOperation("POST /client/ask-lisno"), validateBody(askLisnoSchema), async (request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    try { response.json({data: await service.request(chatActorFromAuthenticatedRequest(request), request.body)}); }
    catch (error) { next(error); }
  });
  return router;
}
