import { Router, type Request, type Response, type RequestHandler } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { chatIssueSchema, chatListQuerySchema, chatMessageQuerySchema, chatOptionsQuerySchema, chatParticipantSchema, chatReadSchema, chatRevokeSchema, chatSendSchema } from "../domain/project-chat.js";
import type { ProjectChatService, ProjectChatTypingService } from "../contracts/project-chat.js";
import { chatTypingSchema } from "../domain/project-chat-typing.js";
import type { AuthService } from "../services/auth.service.js";
import { chatActorFromAuthenticatedRequest } from "../services/project-chat-authentication.js";
export function createProjectChatRouter(auth: AuthService, service: ProjectChatService, typing?: ProjectChatTypingService): Router {
    const router = Router();
    const protectedRoute = authenticate(auth);
    const output = (handler: (request: Request, response: Response) => Promise<unknown>, status = 200): RequestHandler => async (request, response, next) => {
        try {
            const data = await handler(request, response);
            response.setHeader("Cache-Control", "no-store");
            response.status(status).json({ data });
        }
        catch (error) {
            next(error);
        }
    };
    const project = (request: Request) => request.params.projectId as string;
    if (typing) router.put("/projects/:projectId/chat/typing", (_request, response, next) => {
        response.locals.typingReceivedAt = Date.now();
        next();
    }, protectedRoute, requireOperation("PUT /projects/:projectId/chat/typing"), validateBody(chatTypingSchema), output((request, response) => typing.update(chatActorFromAuthenticatedRequest(request), project(request), request.body, response.locals.typingReceivedAt)));
    router.get("/project-messages", protectedRoute, requireOperation("GET /project-messages"), validateQuery(chatListQuerySchema), output((request, response) => service.list(chatActorFromAuthenticatedRequest(request), response.locals.validatedQuery)));
    router.get("/projects/:projectId/chat", protectedRoute, requireOperation("GET /projects/:projectId/chat"), output(request => service.summary(chatActorFromAuthenticatedRequest(request), project(request))));
    router.get("/projects/:projectId/chat/participants", protectedRoute, requireOperation("GET /projects/:projectId/chat/participants"), output(request => service.participants(chatActorFromAuthenticatedRequest(request), project(request))));
    router.get("/projects/:projectId/chat/participant-options", protectedRoute, requireOperation("GET /projects/:projectId/chat/participant-options"), validateQuery(chatOptionsQuerySchema), output((request, response) => service.participantOptions(chatActorFromAuthenticatedRequest(request), project(request), response.locals.validatedQuery)));
    router.post("/projects/:projectId/chat/participants", protectedRoute, requireOperation("POST /projects/:projectId/chat/participants"), validateBody(chatParticipantSchema), output(request => service.addParticipant(chatActorFromAuthenticatedRequest(request), project(request), request.body), 201));
    router.post("/projects/:projectId/chat/participants/:selectionId/revoke", protectedRoute, requireOperation("POST /projects/:projectId/chat/participants/:selectionId/revoke"), validateBody(chatRevokeSchema), output(request => service.revokeParticipant(chatActorFromAuthenticatedRequest(request), project(request), request.params.selectionId as string, request.body)));
    router.get("/projects/:projectId/chat/messages", protectedRoute, requireOperation("GET /projects/:projectId/chat/messages"), validateQuery(chatMessageQuerySchema), output((request, response) => service.messages(chatActorFromAuthenticatedRequest(request), project(request), response.locals.validatedQuery)));
    router.post("/projects/:projectId/chat/messages", protectedRoute, requireOperation("POST /projects/:projectId/chat/messages"), validateBody(chatSendSchema), output(request => service.send(chatActorFromAuthenticatedRequest(request), project(request), request.body), 201));
    router.patch("/projects/:projectId/chat/messages/:messageId/issue", protectedRoute, requireOperation("PATCH /projects/:projectId/chat/messages/:messageId/issue"), validateBody(chatIssueSchema), output(request => service.issue(chatActorFromAuthenticatedRequest(request), project(request), request.params.messageId as string, request.body)));
    router.put("/projects/:projectId/chat/read", protectedRoute, requireOperation("PUT /projects/:projectId/chat/read"), validateBody(chatReadSchema), output(request => service.read(chatActorFromAuthenticatedRequest(request), project(request), request.body)));
    return router;
}
