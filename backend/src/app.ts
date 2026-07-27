import express from "express";
import path from "node:path";

import { allowCors } from "./middleware/cors.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { createMemoryRepository } from "./repositories/memory.js";
import type { AppRepository } from "./repositories/types.js";
import { createAuditRouter } from "./routes/audit.js";
import { createAuthRouter } from "./routes/auth.js";
import { createEvaluationsRouter } from "./routes/evaluations.js";
import { createDesignVersionsRouter } from "./routes/design-versions.js";
import { createDesignSectionsRouter } from "./routes/design-sections.js";
import { createExtractionWorkerRouter } from "./routes/extraction-worker.js";
import { healthRouter } from "./routes/health.js";
import { createKpisRouter } from "./routes/kpis.js";
import { createOrganizationRouter } from "./routes/organization.js";
import { createProjectsRouter } from "./routes/projects.js";
import { createTasksRouter } from "./routes/tasks.js";
import { createAuditService } from "./services/audit.service.js";
import {
  createAuthService,
  type AuthConfig
} from "./services/auth.service.js";
import { createEvaluationService } from "./services/evaluation.service.js";
import { createDesignVersionService } from "./services/design-version.service.js";
import { createDesignSectionService } from "./services/design-section.service.js";
import { createExtractionWorkerService } from "./services/extraction-worker.service.js";
import { createHierarchyService } from "./services/hierarchy.service.js";
import { createKpiService } from "./services/kpi.service.js";
import { createProjectActivityService } from "./services/project-activity.service.js";
import { createProjectService } from "./services/project.service.js";
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
  ocrWorkerToken?: string;
  corsOrigins?: readonly string[];
}

export function createApp(dependencies: AppDependencies) {
  const app = express();
  const repository = dependencies.repository ?? createMemoryRepository();
  const clock = dependencies.clock ?? systemClock;
  const storage =
    dependencies.storage ??
    createLocalStorage(path.resolve(process.cwd(), "uploads"));
  const maxUploadBytes = dependencies.maxUploadBytes ?? 25 * 1024 * 1024;
  const authService = createAuthService(repository, dependencies.auth);
  const auditService = createAuditService(repository);
  const projectActivityService = createProjectActivityService(repository);
  const projectService = createProjectService(repository, auditService, clock);
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
  const extractionWorkerService = dependencies.ocrWorkerToken
    ? createExtractionWorkerService(
        repository,
        auditService,
        storage,
        clock,
        dependencies.ocrLeaseSeconds ?? 300,
        maxUploadBytes
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
  app.use(express.json());
  app.use("/api/v1", healthRouter);
  app.use("/api/v1", createAuthRouter(authService));
  app.use("/api/v1", createProjectsRouter(authService, projectService));
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
