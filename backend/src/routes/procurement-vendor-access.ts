import { Router, type RequestHandler } from "express";
import { z } from "zod";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody } from "../middleware/validate.js";
import type { AuthService } from "../services/auth.service.js";
import type { createVendorWorkOnboardingService } from "../services/vendor-work-onboarding.service.js";
const vendorInvitationBaseSchema = z.object({
  expectedVendorVersion: z.number().int().positive(),
  invitationId: z.string().min(1).max(512).nullable(),
  expectedInvitationVersion: z.number().int().positive().nullable(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9._:-]{8,128}$/)
}).strict();
const pairedInvitation = (value: { invitationId: string | null; expectedInvitationVersion: number | null }) => (value.invitationId === null) === (value.expectedInvitationVersion === null);
export const vendorInvitationCommandSchema = vendorInvitationBaseSchema.refine(pairedInvitation, "Invitation identity and version must be supplied together.");
export const vendorOrderAccessCommandSchema = vendorInvitationBaseSchema.extend({
  action: z.enum(["send_invitation", "resend_invitation", "send_work_notification"]),
  expectedOrderVersion: z.number().int().positive(), expectedOrderRevision: z.number().int().positive(), expectedAccessVersion: z.number().int().positive().nullable()
}).refine(pairedInvitation, "Invitation identity and version must be supplied together.");
export function createProcurementVendorAccessRouter(auth: AuthService, onboarding: ReturnType<typeof createVendorWorkOnboardingService>, deliveryRateLimit: RequestHandler) {
  const router = Router();
  const protect = authenticate(auth);
  router.get("/procurement/vendors/:vendorId/login-access", protect, requireOperation("GET /procurement/vendors/:vendorId/login-access"), async (req,res,next) => {
    try { res.set("Cache-Control", "private, no-store").json({ data: await onboarding.readVendorAccess(req.authenticatedUser!, String(req.params.vendorId)) }); } catch (error) { next(error); }
  });
  router.post("/procurement/vendors/:vendorId/login-access/send", protect, requireOperation("POST /procurement/vendors/:vendorId/login-access/send"), deliveryRateLimit, validateBody(vendorInvitationCommandSchema), async (req,res,next) => {
    try { res.set("Cache-Control", "private, no-store").json({ data: await onboarding.sendVendorInvitation(req.authenticatedUser!, String(req.params.vendorId), req.body, "send_invitation") }); } catch (error) { next(error); }
  });
  router.post("/procurement/vendors/:vendorId/login-access/resend", protect, requireOperation("POST /procurement/vendors/:vendorId/login-access/resend"), deliveryRateLimit, validateBody(vendorInvitationCommandSchema), async (req,res,next) => {
    try { res.set("Cache-Control", "private, no-store").json({ data: await onboarding.sendVendorInvitation(req.authenticatedUser!, String(req.params.vendorId), req.body, "resend_invitation") }); } catch (error) { next(error); }
  });
  return router;
}
