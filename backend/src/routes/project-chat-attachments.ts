import { Router, type Request, type Response, type NextFunction } from "express";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import type { ProjectChatAttachmentService } from "../contracts/project-chat-attachments.js";
import { parseChatInput } from "../domain/project-chat.js";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { consumeChatMultipart } from "../middleware/project-chat-upload.js";
import { chatActorFromAuthenticatedRequest } from "../services/project-chat-authentication.js";
import type { AuthService } from "../services/auth.service.js";

const querySchema = z.object({uploadId: z.string().regex(/^[A-Za-z0-9_-]{8,200}$/), sizeBytes: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER)}).strict();
export function createProjectChatAttachmentsRouter(auth: AuthService, service: ProjectChatAttachmentService): Router {
  const router = Router();
  const authenticated = authenticate(auth);
  router.get("/projects/:projectId/chat/attachment-policy", authenticated, requireOperation("GET /projects/:projectId/chat/attachment-policy"), async (request, response, next) => {
    try { response.set("Cache-Control", "private, no-store").json({data: await service.policy(chatActorFromAuthenticatedRequest(request), request.params.projectId as string)}); }
    catch (error) { next(error); }
  });
  router.post("/projects/:projectId/chat/attachments", authenticated, requireOperation("POST /projects/:projectId/chat/attachments"), async (request, response, next) => {
    let reservation;
    const controller = new AbortController();
    const closed = () => {if (!response.writableEnded) controller.abort();};
    response.once("close", closed);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      const actor = chatActorFromAuthenticatedRequest(request);
      reservation = await service.beginUpload(actor, request.params.projectId as string, parseChatInput(querySchema, request.query));
      deadline = setTimeout(() => controller.abort(), reservation.timeoutMs);
      const result = await consumeChatMultipart(request, {sizeBytes: reservation.record.declaredBytes, signal: controller.signal}, file => service.receiveUpload(actor, reservation!, file));
      response.status(201).set("Cache-Control", "private, no-store").json({data: result});
    } catch (error) {
      if (reservation) await service.abandonUpload(reservation).catch(() => {});
      next(error);
    } finally {if (deadline) clearTimeout(deadline); response.removeListener("close", closed);}
  });
  router.delete("/projects/:projectId/chat/attachments/:attachmentId", authenticated, requireOperation("DELETE /projects/:projectId/chat/attachments/:attachmentId"), async (request, response, next) => {
    try { await service.discard(chatActorFromAuthenticatedRequest(request), request.params.projectId as string, request.params.attachmentId as string); response.set("Cache-Control", "private, no-store").json({data: {id: request.params.attachmentId, discarded: true}}); }
    catch (error) { next(error); }
  });
  const download = (variant: "content" | "preview") => async (request: Request, response: Response, next: NextFunction) => {
    const controller = new AbortController();
    const close = () => {if (!response.writableEnded) controller.abort();};
    response.once("close", close);
    try {
      const file = await service.download(chatActorFromAuthenticatedRequest(request), request.params.projectId as string, request.params.attachmentId as string, variant, controller.signal);
      response.set({"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Length": String(file.byteSize)});
      if (variant === "preview") response.set("Content-Disposition", 'inline; filename="preview.webp"'); else response.attachment(file.filename);
      response.type(file.mimeType);
      await pipeline(file.stream, response);
    } catch (error) {if (response.headersSent) response.destroy(); else next(error);}
    finally {response.removeListener("close", close);}
  };
  router.get("/projects/:projectId/chat/attachments/:attachmentId/content", authenticated, requireOperation("GET /projects/:projectId/chat/attachments/:attachmentId/content"), download("content"));
  router.get("/projects/:projectId/chat/attachments/:attachmentId/preview", authenticated, requireOperation("GET /projects/:projectId/chat/attachments/:attachmentId/preview"), download("preview"));
  return router;
}
