import "dotenv/config";

import { pathToFileURL } from "node:url";
import type { Server } from "node:http";
import mongoose from "mongoose";

import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import type { DevelopmentDemoAuthorization } from "./development/demo-account-authorization.js";
import { createMongoRepository } from "./repositories/mongo.js";
import type { AppRepository } from "./repositories/types.js";
import { createLocalStorage } from "./storage/local-storage.js";

type ServerApp = {
  listen(port: number, callback: (error?: Error) => void): Server;
  listen(port: number, host: string, callback: (error?: Error) => void): Server;
};

export interface DatabasePreparationContext {
  readonly mongodbUri: string;
}

export interface ServerDependencies {
  loadEnvironment?: typeof loadEnvironment;
  connect?: (uri: string) => Promise<unknown>;
  disconnect?: () => Promise<unknown>;
  repositoryFactory?: () => AppRepository;
  appFactory?: (dependencies: Parameters<typeof createApp>[0]) => ServerApp;
  bindHost?: string;
  prepareDatabase?: (context: DatabasePreparationContext) => Promise<void>;
  developmentDemoAuthorization?: DevelopmentDemoAuthorization;
  writeOutput?: (message: string) => void;
  registerSignalHandlers?: boolean;
}

export interface RunningServer {
  stop(): Promise<void>;
}

export async function startServer(
  dependencies: ServerDependencies = {}
): Promise<RunningServer> {
  const env = (dependencies.loadEnvironment ?? loadEnvironment)();
  const connect = dependencies.connect ?? ((uri: string) => mongoose.connect(uri));
  const disconnect = dependencies.disconnect ?? (() => mongoose.disconnect());
  const repositoryFactory = dependencies.repositoryFactory ?? createMongoRepository;
  const appFactory = dependencies.appFactory ?? createApp;

  let connected = false;
  let server: Server;
  try {
    await connect(env.MONGODB_URI);
    connected = true;
    await dependencies.prepareDatabase?.({ mongodbUri: env.MONGODB_URI });
    const app = appFactory({
      repository: repositoryFactory(),
      auth: {
        jwtSecret: env.JWT_SECRET,
        jwtExpiresInSeconds: 900
      },
      corsOrigins: env.CORS_ORIGIN,
      storage: createLocalStorage(env.UPLOADS_DIR),
      maxUploadBytes: Math.floor(env.MAX_UPLOAD_MB * 1024 * 1024),
      ocrLeaseSeconds: env.OCR_LEASE_SECONDS,
      ocrRetryPolicy: {
        maxAttempts: env.OCR_MAX_ATTEMPTS,
        initialDelayMs: env.OCR_RETRY_INITIAL_SECONDS * 1000,
        maxDelayMs: env.OCR_RETRY_MAX_SECONDS * 1000
      },
      ocrConfidenceFloor: env.OCR_CONFIDENCE_FLOOR,
      ocrWorkerToken: env.OCR_WORKER_TOKEN,
      developmentDemoAuthorization: dependencies.developmentDemoAuthorization
    });
    server = await listen(app, env.PORT, dependencies.bindHost);
    (dependencies.writeOutput ?? ((message) => process.stdout.write(message)))(
      `Backend ready at http://${dependencies.bindHost ?? "localhost"}:${env.PORT}\n`
    );
  } catch (error) {
    if (connected) await disconnect();
    throw error;
  }

  let stopping: Promise<void> | undefined;
  const stop = () => {
    stopping ??= close(server).then(() => disconnect()).then(() => undefined);
    return stopping;
  };

  if (dependencies.registerSignalHandlers ?? true) {
    const shutdown = (signal: NodeJS.Signals) => {
      void stop().then(
        () => process.exit(0),
        (error: unknown) => {
          process.stderr.write(`Failed to shut down after ${signal}: ${String(error)}\n`);
          process.exit(1);
        }
      );
    };
    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  }

  return { stop };
}

function listen(app: ServerApp, port: number, host?: string): Promise<Server> {
  return new Promise((resolve, reject) => {
    let server: Server | undefined;
    const onListening = (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }
      if (!server) {
        queueMicrotask(onListening);
        return;
      }
      server.off("error", reject);
      resolve(server);
    };
    server =
      host === undefined
        ? app.listen(port, onListening)
        : app.listen(port, host, onListening);
    server.once("error", reject);
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  startServer().then(
    () => undefined,
    (error: unknown) => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    }
  );
}
