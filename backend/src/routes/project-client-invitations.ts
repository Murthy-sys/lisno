import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { newPasswordSchema } from "../domain/password-policy.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { ProjectClientInvitationService } from "../services/project-client-invitation.service.js";

const tokenSchema = z.object({ token: z.string().max(128) }).strict();
const versionSchema = z.object({ expectedVersion: z.number().int().positive() }).strict();
const acceptSchema = tokenSchema.extend({ password: newPasswordSchema, passwordConfirmation: z.string().max(128) }).strict().refine(input => input.password === input.passwordConfirmation, { path: ["passwordConfirmation"], message: "Passwords do not match." });
const noStore: RequestHandler = (_request, response, next) => { response.setHeader("Cache-Control", "no-store"); response.setHeader("Referrer-Policy", "no-referrer"); next(); };

export function createProjectClientInvitationsRouter(auth: AuthService, service: ProjectClientInvitationService, publicRateLimit: RequestHandler, deliveryRateLimit: RequestHandler): Router {
  const router = Router();
  router.use(["/auth/project-invitations", "/projects/:projectId/client-invitation"], noStore);
  router.get("/projects/:projectId/client-invitation", authenticate(auth), requireOperation("GET /projects/:projectId/client-invitation"), async (request, response, next) => {
    try { response.json({ data: await service.get(request.authenticatedUser!, request.params.projectId as string) }); } catch (error) { next(error); }
  });
  router.post("/projects/:projectId/client-invitation", authenticate(auth), requireOperation("POST /projects/:projectId/client-invitation"), deliveryRateLimit, validateBody(z.object({}).strict()), async (request, response, next) => {
    try { response.json({ data: await service.send(request.authenticatedUser!, request.params.projectId as string) }); } catch (error) { next(error); }
  });
  router.post("/projects/:projectId/client-invitation/resend", authenticate(auth), requireOperation("POST /projects/:projectId/client-invitation/resend"), deliveryRateLimit, validateBody(versionSchema), async (request, response, next) => {
    try { response.json({ data: await service.resend(request.authenticatedUser!, request.params.projectId as string, request.body.expectedVersion) }); } catch (error) { next(error); }
  });
  router.post("/projects/:projectId/client-invitation/revoke", authenticate(auth), requireOperation("POST /projects/:projectId/client-invitation/revoke"), validateBody(versionSchema), async (request, response, next) => {
    try { response.json({ data: await service.revoke(request.authenticatedUser!, request.params.projectId as string, request.body.expectedVersion) }); } catch (error) { next(error); }
  });
  router.post("/auth/project-invitations/inspect", publicRateLimit, validateBody(tokenSchema), async (request, response, next) => {
    try { response.json({ data: await service.inspect(request.body.token) }); } catch (error) { next(error); }
  });
  router.post("/auth/project-invitations/accept", publicRateLimit, validateBody(acceptSchema), async (request, response, next) => {
    try { response.status(201).json({ data: await service.acceptNew(request.body, { remoteAddress: request.socket.remoteAddress }) }); } catch (error) { next(error); }
  });
  router.post("/auth/project-invitations/accept-existing", publicRateLimit, authenticate(auth), requireOperation("POST /auth/project-invitations/accept-existing"), validateBody(tokenSchema), async (request, response, next) => {
    try { response.json({ data: await service.acceptExisting(request.authenticatedUser!, request.body.token) }); } catch (error) { next(error); }
  });
  return router;
}
