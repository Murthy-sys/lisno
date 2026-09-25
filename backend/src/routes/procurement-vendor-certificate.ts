import { pipeline } from "node:stream/promises";
import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { uploadSingleFile } from "../middleware/upload.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import { PROCUREMENT_VENDOR_CERTIFICATE_MIME_TYPES, type ProcurementVendorCertificateService } from "../services/procurement-vendor-certificate.service.js";

export function createProcurementVendorCertificateRouter(input: { authService: AuthService; certificateService: ProcurementVendorCertificateService; maxUploadBytes: number }): Router {
  const router = Router();
  const base = "/admin/ai-estimator-knowledge/vendors";
  const authenticated = authenticate(input.authService);
  const authorized: RequestHandler = async (request, _response, next) => {
    try { await input.certificateService.authorize(request.authenticatedUser!); next(); }
    catch (error) { next(error); }
  };
  const idempotencyKey = z.string().regex(/^[A-Za-z0-9_-]{8,200}$/u);
  const parseFile = uploadSingleFile(input.maxUploadBytes, { fieldName: "certificate", fieldErrorKey: "msmeCertificate", maxFields: 2, allowedDetectedMimeTypes: PROCUREMENT_VENDOR_CERTIFICATE_MIME_TYPES, allowedTypeMessage: "Choose a PDF, JPEG, PNG, or WebP certificate." });
  router.get(`${base}/msme-certificate-upload-policy`, authenticated, requireOperation("GET /admin/ai-estimator-knowledge/vendors/msme-certificate-upload-policy"), authorized,
    async (request, response, next) => { try { response.set("Cache-Control", "private, no-store").json({ data: await input.certificateService.policy(request.authenticatedUser!) }); } catch (error) { next(error); } });
  router.post(`${base}/msme-certificate-uploads`, authenticated, requireOperation("POST /admin/ai-estimator-knowledge/vendors/msme-certificate-uploads"), authorized, parseFile,
    validateBody(z.object({ idempotencyKey }).strict()),
    async (request, response, next) => { try { response.status(201).json({ data: await input.certificateService.stage(request.authenticatedUser!, request.body, request.validatedUpload!) }); } catch (error) { next(error); } });
  router.post(`${base}/:id/msme-certificate-uploads`, authenticated, requireOperation("POST /admin/ai-estimator-knowledge/vendors/:id/msme-certificate-uploads"), authorized, parseFile,
    validateBody(z.object({ idempotencyKey, expectedVersion: z.coerce.number().int().min(1).max(Number.MAX_SAFE_INTEGER) }).strict()),
    async (request, response, next) => { try { response.status(201).json({ data: await input.certificateService.stage(request.authenticatedUser!, { ...request.body, vendorId: String(request.params.id) }, request.validatedUpload!) }); } catch (error) { next(error); } });
  router.get(`${base}/:id/msme-certificate`, authenticated, requireOperation("GET /admin/ai-estimator-knowledge/vendors/:id/msme-certificate"), authorized,
    validateQuery(z.object({ v: z.string().min(1).max(128).optional() }).strict()),
    async (request, response, next) => {
      try {
        const certificate = await input.certificateService.open(request.authenticatedUser!, String(request.params.id), typeof request.query.v === "string" ? request.query.v : undefined);
        response.set("Cache-Control", "private, no-store").set("X-Content-Type-Options", "nosniff")
          .set("Content-Security-Policy", "default-src 'none'; sandbox")
          .attachment(certificate.descriptor.originalFilename).type(certificate.descriptor.mimeType)
          .set("Content-Length", String(certificate.descriptor.byteSize));
        await pipeline(certificate.stream, response);
      } catch (error) {
        if (response.headersSent) response.destroy(error instanceof Error ? error : undefined);
        else next(error);
      }
    });
  return router;
}
