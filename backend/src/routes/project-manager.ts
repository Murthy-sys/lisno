import { pmClientQuerySchema } from "../domain/project-manager/client.js";
import { Router } from "express";
import { authenticate } from "../middleware/auth.js";
import { requireOperation } from "../middleware/authorization.js";
import { validateQuery } from "../middleware/validate.js";
import { uploadWorkflowEvidence } from "../middleware/workflow-evidence-upload.js";
import type { AuthService } from "../services/auth.service.js";
import { pmPortfolioQuerySchema, type createProjectManagerWorkspace } from "../services/project-manager/workspace.js";
import type { createPMEvidenceService } from "../services/project-manager/evidence.js";
import { pipeline } from "node:stream/promises";
export function createProjectManagerRouter(auth: AuthService, service: ReturnType<typeof createProjectManagerWorkspace>, evidence: ReturnType<typeof createPMEvidenceService>, maxUploadBytes: number) {
  const router = Router(); const protect = authenticate(auth);
  router.get("/project-manager/projects", protect, requireOperation("GET /project-manager/projects"), validateQuery(pmPortfolioQuerySchema), async(req,res,next)=>{ try { res.set("Cache-Control","private, no-store").json({data:await service.portfolio(req.authenticatedUser!,res.locals.validatedQuery)}); }catch(e){next(e);} });
  router.get("/project-manager/alerts", protect, requireOperation("GET /project-manager/alerts"), validateQuery(pmPortfolioQuerySchema), async(req,res,next)=>{ try { res.set("Cache-Control","private, no-store").json({data:await service.alerts(req.authenticatedUser!,res.locals.validatedQuery)}); }catch(e){next(e);} });
  router.get("/projects/:projectId/pm/overview", protect, requireOperation("GET /projects/:projectId/pm/overview"), async(req,res,next)=>{ try { res.set("Cache-Control","private, no-store").json({data:await service.overview(req.authenticatedUser!,String(req.params.projectId))}); }catch(e){next(e);} });
  router.get("/projects/:projectId/pm/site", protect, requireOperation("GET /projects/:projectId/pm/site"), async(req,res,next)=>{ try { res.set("Cache-Control","private, no-store").json({data:await service.site(req.authenticatedUser!,String(req.params.projectId))}); }catch(e){next(e);} });
  router.get("/project-manager/performance", protect, requireOperation("GET /project-manager/performance"), async(req,res,next)=>{ try { res.set("Cache-Control","private, no-store").json({data:await service.performance(req.authenticatedUser!)}); }catch(e){next(e);} });
  router.get("/project-manager/leaderboard", protect, requireOperation("GET /project-manager/leaderboard"), async(req,res,next)=>{ try { res.set("Cache-Control","private, no-store").json({data:await service.leaderboard(req.authenticatedUser!)}); }catch(e){next(e);} });
  router.get("/project-manager/bonus", protect, requireOperation("GET /project-manager/bonus"), async(req,res,next)=>{ try { res.set("Cache-Control","private, no-store").json({data:await service.bonus(req.authenticatedUser!)}); }catch(e){next(e);} });
  router.get("/project-manager/notifications", protect, requireOperation("GET /project-manager/notifications"), validateQuery(pmClientQuerySchema), async(req,res,next)=>{ try { res.set("Cache-Control","private, no-store").json({data:await service.notifications(req.authenticatedUser!,res.locals.validatedQuery)}); }catch(e){next(e);} });
  router.post("/project-manager/notifications/:notificationId/read", protect, requireOperation("POST /project-manager/notifications/:notificationId/read"), async(req,res,next)=>{ try { res.set("Cache-Control","private, no-store").json({data:await service.readNotification(req.authenticatedUser!,String(req.params.notificationId))}); }catch(e){next(e);} });
  router.post("/projects/:projectId/pm/evidence/:entityId", protect, requireOperation("POST /projects/:projectId/pm/evidence/:entityId"), uploadWorkflowEvidence(maxUploadBytes), async(req,res,next)=>{ const release=req.workflowEvidence?.hold(); try { res.set("Cache-Control","private, no-store").status(201).json({data:await evidence.upload(req.authenticatedUser!,String(req.params.projectId),String(req.params.entityId),req.validatedWorkflowMedia??[],req.validatedUpload,req.workflowEvidence?.signal)}); }catch(e){next(e);}finally{release?.();} });
  router.get("/projects/:projectId/pm/evidence/:evidenceId", protect, requireOperation("GET /projects/:projectId/pm/evidence/:evidenceId"), async(req,res,next)=>{ try { const file=await evidence.read(req.authenticatedUser!,String(req.params.projectId),String(req.params.evidenceId)); res.set({"Cache-Control":"private, no-store","Content-Type":file.mimeType,"X-Content-Type-Options":"nosniff","Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`}); await pipeline(file.stream,res); }catch(e){next(e);} });
  return router;
}
