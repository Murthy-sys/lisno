import { Router, type Response } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { pmCertificationActionSchema, pmCertificationSchema, pmNoticeActionSchema, pmNoticeSchema, pmVendorListSchema } from "../domain/project-manager/vendors.js";
import { pmQualitySaveSchema, pmQualitySignSchema, pmQualityListSchema } from "../domain/project-manager/quality.js";
import type { AuthService } from "../services/auth.service.js";
import type { createProjectManagerVendorsService } from "../services/project-manager/vendors.js";
import type { createProjectManagerQualityService } from "../services/project-manager/quality.js";

export function createProjectManagerVendorsRouter(auth: AuthService, vendors: ReturnType<typeof createProjectManagerVendorsService>, quality: ReturnType<typeof createProjectManagerQualityService>) {
  const router = Router(); const protect = authenticate(auth);
  const json = (res: Response, data: unknown) => res.set("Cache-Control", "private, no-store").json({ data });
  router.get("/projects/:projectId/pm/vendors", protect, requireOperation("GET /projects/:projectId/pm/vendors"), validateQuery(pmVendorListSchema), async (req, res, next) => { try { json(res, await vendors.vendors(req.authenticatedUser!, String(req.params.projectId), res.locals.validatedQuery)); } catch (error) { next(error); } });
  router.get("/projects/:projectId/pm/quality", protect, requireOperation("GET /projects/:projectId/pm/quality"), validateQuery(pmQualityListSchema), async (req, res, next) => { try { json(res, await quality.quality(req.authenticatedUser!, String(req.params.projectId), res.locals.validatedQuery)); } catch (error) { next(error); } });
  router.post("/projects/:projectId/pm/vendor-notices", protect, requireOperation("POST /projects/:projectId/pm/vendor-notices"), validateBody(pmNoticeSchema), async (req, res, next) => { try { json(res, await vendors.createNotice(req.authenticatedUser!, String(req.params.projectId), req.body)); } catch (error) { next(error); } });
  router.post("/projects/:projectId/pm/vendor-notices/:noticeId/actions", protect, requireOperation("POST /projects/:projectId/pm/vendor-notices/:noticeId/actions"), validateBody(pmNoticeActionSchema), async (req, res, next) => { try { json(res, await vendors.actNotice(req.authenticatedUser!, String(req.params.projectId), String(req.params.noticeId), req.body)); } catch (error) { next(error); } });
  router.post("/projects/:projectId/pm/certifications", protect, requireOperation("POST /projects/:projectId/pm/certifications"), validateBody(pmCertificationSchema), async (req, res, next) => { try { json(res, await vendors.createCertification(req.authenticatedUser!, String(req.params.projectId), req.body)); } catch (error) { next(error); } });
  router.post("/projects/:projectId/pm/certifications/:certificationId/actions", protect, requireOperation("POST /projects/:projectId/pm/certifications/:certificationId/actions"), validateBody(pmCertificationActionSchema), async (req, res, next) => { try { json(res, await vendors.actCertification(req.authenticatedUser!, String(req.params.projectId), String(req.params.certificationId), req.body)); } catch (error) { next(error); } });
  router.put("/projects/:projectId/pm/quality-audits/:auditId", protect, requireOperation("PUT /projects/:projectId/pm/quality-audits/:auditId"), validateBody(pmQualitySaveSchema), async (req, res, next) => { try { json(res, await quality.saveAudit(req.authenticatedUser!, String(req.params.projectId), String(req.params.auditId), req.body)); } catch (error) { next(error); } });
  router.post("/projects/:projectId/pm/quality-audits/:auditId/sign", protect, requireOperation("POST /projects/:projectId/pm/quality-audits/:auditId/sign"), validateBody(pmQualitySignSchema), async (req, res, next) => { try { json(res, await quality.signAudit(req.authenticatedUser!, String(req.params.projectId), String(req.params.auditId), req.body)); } catch (error) { next(error); } });
  return router;
}
