import { pipeline } from "node:stream/promises";

import { Router } from "express";
import { z } from "zod";

import { authenticate, authorizeRoles } from "../middleware/auth.js";
import {
  paginatedEnvelope,
  paginationShape
} from "../middleware/pagination.js";
import { uploadSingleFile } from "../middleware/upload.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { DesignVersionService } from "../services/design-version.service.js";

const listQuerySchema = z.object(paginationShape).strict();
const approvalSchema = z
  .object({
    approvalStatus: z.enum(["draft", "in_review", "approved", "rejected"]),
    clientVisible: z.boolean().optional()
  })
  .strict();

export function createDesignVersionsRouter(
  authService: AuthService,
  designVersions: DesignVersionService,
  maxUploadBytes: number
): Router {
  const router = Router();
  const protectedRoute = authenticate(authService);

  router.get(
    "/client/latest-approved-versions",
    protectedRoute,
    authorizeRoles("client"),
    async (request, response, next) => {
      try {
        response.json({ data: await designVersions.listLatestForClient(request.authenticatedUser!) });
      } catch (error) { next(error); }
    }
  );

  router.post(
    "/tasks/:taskId/design-versions",
    protectedRoute,
    authorizeRoles("designer"),
    uploadSingleFile(maxUploadBytes),
    async (request, response, next) => {
      try {
        response.status(201).json({
          data: await designVersions.upload(
            request.authenticatedUser!,
            request.params.taskId as string,
            request.validatedUpload!
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/projects/:projectId/design-versions",
    protectedRoute,
    validateQuery(listQuerySchema),
    async (request, response, next) => {
      try {
        const pagination = response.locals.validatedQuery;
        response.json({
          data: paginatedEnvelope(
            await designVersions.list(
              request.authenticatedUser!,
              request.params.projectId as string,
              pagination
            ),
            pagination
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.patch(
    "/design-versions/:versionId/approval",
    protectedRoute,
    authorizeRoles("design_manager", "design_head"),
    validateBody(approvalSchema),
    async (request, response, next) => {
      try {
        response.json({
          data: await designVersions.approve(
            request.authenticatedUser!,
            request.params.versionId as string,
            request.body
          )
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    "/design-versions/:versionId/download",
    protectedRoute,
    async (request, response, next) => {
      try {
        const download = await designVersions.download(
          request.authenticatedUser!,
          request.params.versionId as string
        );
        response.setHeader("Content-Type", download.mimeType);
        response.setHeader("Content-Length", download.sizeBytes);
        response.setHeader(
          "Content-Disposition",
          safeContentDisposition(download.filename)
        );
        await pipeline(download.stream, response);
      } catch (error) {
        if (response.headersSent) {
          response.destroy(error instanceof Error ? error : undefined);
          return;
        }
        next(error);
      }
    }
  );

  return router;
}

function safeContentDisposition(filename: string) {
  const fallback =
    filename
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\/]/g, "_")
      .replace(/[\r\n]/g, "")
      .trim() || "download";
  const encoded = encodeURIComponent(filename.replace(/[\r\n]/g, "")).replace(
    /['()*]/g,
    (character) =>
      `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
