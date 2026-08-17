import express from "express";
import mongoose from "mongoose";
import path from "node:path";

import {
  defaultExtractionRetryPolicy,
  type ExtractionRetryPolicy
} from "./domain/extraction-lifecycle.js";
import { createAuthRateLimit } from "./middleware/auth-rate-limit.js";
import { createAccessRequestRateLimit } from "./middleware/access-request-rate-limit.js";
import { allowCors } from "./middleware/cors.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { createMemoryRepository } from "./repositories/memory.js";
import type { AppRepository } from "./repositories/types.js";
import { createAuditRouter } from "./routes/audit.js";
import { createAccessRequestsRouter } from "./routes/access-requests.js";
import { createAdminUsersRouter } from "./routes/admin-users.js";
import { createAuthRouter } from "./routes/auth.js";
import { createEvaluationsRouter } from "./routes/evaluations.js";
import { createDesignVersionsRouter } from "./routes/design-versions.js";
import { createDesignSectionsRouter } from "./routes/design-sections.js";
import { createExtractionWorkerRouter } from "./routes/extraction-worker.js";
import { createEstimateDesignsRouter } from "./routes/estimate-designs.js";
import { createEstimatePlanReviewRouter } from "./routes/estimate-plan-review.js";
import { createEstimatesRouter } from "./routes/estimates.js";
import { healthRouter } from "./routes/health.js";
import { createKpisRouter } from "./routes/kpis.js";
import { createLeadsRouter } from "./routes/leads.js";
import { createOrganizationRouter } from "./routes/organization.js";
import { createProjectsRouter } from "./routes/projects.js";
import { createTasksRouter } from "./routes/tasks.js";
import { createAuditService } from "./services/audit.service.js";
import { createAccessRequestService } from "./services/access-request.service.js";
import { createUserAdministrationService } from "./services/user-administration.service.js";
import {
  createAuthService,
  type AuthConfig
} from "./services/auth.service.js";
import { createEvaluationService } from "./services/evaluation.service.js";
import { createDesignVersionService } from "./services/design-version.service.js";
import { createDesignSectionService } from "./services/design-section.service.js";
import { createExtractionWorkerService } from "./services/extraction-worker.service.js";
import { createEstimateDesignService } from "./services/estimate-design.service.js";
import { createEstimatePlanReviewService } from "./services/estimate-plan-review.service.js";
import { createHierarchyService } from "./services/hierarchy.service.js";
import { createKpiService } from "./services/kpi.service.js";
import { createLeadService } from "./services/lead.service.js";
import { createProjectActivityService } from "./services/project-activity.service.js";
import { createProjectService } from "./services/project.service.js";
import {
  createEstimatePdfService,
  type EstimatePdfService
} from "./services/estimate-pdf.service.js";
import { createTaskService } from "./services/task.service.js";
import { systemClock, type Clock } from "./services/workflow.js";
import { createLocalStorage } from "./storage/local-storage.js";
import type { FileStorage } from "./storage/storage.js";

export interface AppDependencies {
  repository?: AppRepository;
  auth: AuthConfig;
  clock?: Clock;
  storage?: FileStorage;
  maxUploadBytes?: number;
  ocrLeaseSeconds?: number;
  ocrRetryPolicy?: ExtractionRetryPolicy;
  ocrConfidenceFloor?: number;
  ocrWorkerToken?: string;
  enableEstimateDesignJobs?: boolean;
  corsOrigins?: readonly string[];
  authRateLimit?: { windowMs?: number; maxAttempts?: number; maxEntries?: number };
  accessRequestRateLimit?: {
    windowMs?: number;
    maxAttempts?: number;
    maxEntries?: number;
  };
  estimatePdfService?: EstimatePdfService;
}

export function createApp(dependencies: AppDependencies) {
  const app = express();
  const repository = dependencies.repository ?? createMemoryRepository();
  const clock = dependencies.clock ?? systemClock;
  const storage =
    dependencies.storage ??
    createLocalStorage(path.resolve(process.cwd(), "uploads"));
  const maxUploadBytes = dependencies.maxUploadBytes ?? 25 * 1024 * 1024;
  const ocrRetryPolicy =
    dependencies.ocrRetryPolicy ?? defaultExtractionRetryPolicy;
  const auditService = createAuditService(repository);
  const authService = createAuthService(repository, dependencies.auth, {
    auditService,
    clock
  });
  const authRateLimit = createAuthRateLimit({
    windowMs: dependencies.authRateLimit?.windowMs ?? 15 * 60_000,
    maxAttempts: dependencies.authRateLimit?.maxAttempts ?? 20,
    maxEntries: dependencies.authRateLimit?.maxEntries,
    clock: () => clock().getTime()
  });
  const accessRequestRateLimit = createAccessRequestRateLimit({
    windowMs: dependencies.accessRequestRateLimit?.windowMs ?? 15 * 60_000,
    maxAttempts: dependencies.accessRequestRateLimit?.maxAttempts ?? 10,
    maxEntries: dependencies.accessRequestRateLimit?.maxEntries ?? 10_000,
    clock: () => clock().getTime()
  });
  const accessRequestService = createAccessRequestService(
    repository,
    auditService,
    clock
  );
  const userAdministrationService = createUserAdministrationService(
    repository,
    auditService,
    clock
  );
  const projectActivityService = createProjectActivityService(repository);
  const projectService = createProjectService(repository, auditService, clock);
  const leadService = createLeadService(repository, auditService, clock);
  const estimatePdfService =
    dependencies.estimatePdfService ?? createEstimatePdfService();
  const taskService = createTaskService(repository, auditService, clock);
  const hierarchyService = createHierarchyService(repository, clock);
  const kpiService = createKpiService(repository, clock);
  const evaluationService = createEvaluationService(repository, auditService, clock);
  const designVersionService = createDesignVersionService(
    repository,
    auditService,
    storage,
    clock
  );
  const designSectionService = createDesignSectionService(
    repository,
    auditService,
    storage,
    clock
  );
  const estimateDesignService = createEstimateDesignService({
    storage,
    audit: auditService,
    maxUploadBytes,
    ocrRetryPolicy,
    now: clock
  });
  const estimatePlanReviewService = createEstimatePlanReviewService({
    estimateDesigns: estimateDesignService,
    storage,
    audit: auditService,
    now: clock
  });
  const extractionWorkerService = dependencies.ocrWorkerToken
    ? createExtractionWorkerService(
        repository,
        auditService,
        storage,
        clock,
        dependencies.ocrLeaseSeconds ?? 300,
        maxUploadBytes,
        dependencies.ocrConfidenceFloor ?? 0.2,
        dependencies.enableEstimateDesignJobs ?? mongoose.connection.readyState === 1
          ? estimateDesignService
          : undefined,
        ocrRetryPolicy
      )
    : null;

  app.use(allowCors(dependencies.corsOrigins ?? []));
  if (extractionWorkerService && dependencies.ocrWorkerToken) {
    app.use(
      "/api/v1",
      createExtractionWorkerRouter(
        dependencies.ocrWorkerToken,
        extractionWorkerService
      )
    );
  }
  // Annotation documents are capped at 256 KiB by their domain schema.
  app.use(express.json({ limit: "300kb" }));
  app.use("/api/v1", healthRouter);
  app.use("/api/v1", createAuthRouter(authService, authRateLimit));
  app.use(
    "/api/v1",
    createAccessRequestsRouter(
      authService,
      accessRequestService,
      accessRequestRateLimit
    )
  );
  app.use(
    "/api/v1",
    createAdminUsersRouter(authService, userAdministrationService)
  );
  app.use(
    "/api/v1",
    createEstimateDesignsRouter(authService, estimateDesignService, maxUploadBytes)
  );
  app.use("/api/v1", createEstimatePlanReviewRouter(authService, estimatePlanReviewService));
  app.use("/api/v1", createProjectsRouter(authService, projectService));
  app.use(
    "/api/v1",
    createLeadsRouter(
      authService,
      leadService
    )
  );
  app.use(
    "/api/v1",
    createEstimatesRouter(
      authService,
      leadService,
      estimatePdfService,
      estimateDesignService,
      auditService
    )
  );
  app.use("/api/v1", createTasksRouter(authService, taskService));
  app.use("/api/v1", createOrganizationRouter(authService, hierarchyService));
  app.use("/api/v1", createKpisRouter(authService, kpiService));
  app.use("/api/v1", createEvaluationsRouter(authService, evaluationService));
  app.use(
    "/api/v1",
    createDesignVersionsRouter(
      authService,
      designVersionService,
      maxUploadBytes
    )
  );
  app.use(
    "/api/v1",
    createDesignSectionsRouter(authService, designSectionService)
  );
  app.use(
    "/api/v1",
    createAuditRouter(authService, auditService, projectActivityService)
  );
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
