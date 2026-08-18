import { loadDevelopmentEnvironment } from "../config/development-env.js";
import type { RunningServer, ServerDependencies } from "../server.js";
import {
  authorizeDevelopmentDemoStartup,
  type DevelopmentDemoAuthorization
} from "./demo-account-authorization.js";

interface ServerModule {
  startServer(dependencies?: ServerDependencies): Promise<RunningServer>;
}

interface DemoAccountsModule {
  ensureDevelopmentDemoAccounts(
    authorization: DevelopmentDemoAuthorization
  ): Promise<unknown>;
}

export interface DevelopmentBackendDependencies {
  environment?: Record<string, string | undefined>;
  loadServer?: () => Promise<ServerModule>;
  loadDemoAccounts?: () => Promise<DemoAccountsModule>;
}

export async function startDevelopmentBackend(
  dependencies: DevelopmentBackendDependencies = {}
): Promise<RunningServer> {
  const environment = loadDevelopmentEnvironment(
    dependencies.environment ?? process.env
  );
  const bindHost = "127.0.0.1";
  const developmentDemoAuthorization = authorizeDevelopmentDemoStartup(
    environment,
    environment.MONGODB_URI,
    bindHost
  );
  const { startServer } = await (
    dependencies.loadServer ?? (() => import("../server.js"))
  )();

  return startServer({
    loadEnvironment: () => environment,
    bindHost,
    developmentDemoAuthorization,
    prepareDatabase: async () => {
      const { ensureDevelopmentDemoAccounts } = await (
        dependencies.loadDemoAccounts ??
        (() => import("./demo-account-bootstrap.js"))
      )();
      await ensureDevelopmentDemoAccounts(developmentDemoAuthorization);
    }
  });
}
