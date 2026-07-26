import express from "express";

import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { createMemoryRepository } from "./repositories/memory.js";
import type { AppRepository } from "./repositories/types.js";
import { createAuthRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import {
  createAuthService,
  type AuthConfig
} from "./services/auth.service.js";

export interface AppDependencies {
  repository?: AppRepository;
  auth: AuthConfig;
}

export function createApp(dependencies: AppDependencies) {
  const app = express();
  const repository = dependencies.repository ?? createMemoryRepository();
  const authService = createAuthService(repository, dependencies.auth);

  app.use(express.json());
  app.use("/api/v1", healthRouter);
  app.use("/api/v1", createAuthRouter(authService));
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
