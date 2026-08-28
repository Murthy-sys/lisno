import "dotenv/config";

import { pathToFileURL } from "node:url";
import type { Server } from "node:http";
import mongoose from "mongoose";

import { createApp } from "./app.js";
import { loadEnvironment } from "./config/env.js";
import type { DevelopmentDemoAuthorization } from "./development/demo-account-authorization.js";
import { initializeApplicationIndexes } from "./models/application-indexes.js";
import { createMongoRepository } from "./repositories/mongo.js";
import type { AppRepository } from "./repositories/types.js";
import { createSmtpEstimateMailer } from "./services/smtp-estimate-mailer.js";
import { createSmtpDesignPlanMailer } from "./services/smtp-design-plan-mailer.js";
import { createSmtpInvitationMailer } from "./services/smtp-invitation-mailer.js";
import { createSmtpPasswordResetMailer } from "./services/smtp-password-reset-mailer.js";
import {
  runProcurementReceiptCleanupJobs,
  runProcurementReceiptReconciliationJobs
} from "./services/procurement.service.js";
import { createLocalStorage } from "./storage/local-storage.js";
import type { FileStorage } from "./storage/storage.js";

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
  prepareApplicationIndexes?: () => Promise<void>;
  /** @deprecated Use prepareApplicationIndexes for the complete index boundary. */
  prepareIdentityIndexes?: () => Promise<void>;
  developmentDemoAuthorization?: DevelopmentDemoAuthorization;
  writeOutput?: (message: string) => void;
  registerSignalHandlers?: boolean;
  receiptMaintenanceIntervalMs?: number;
  receiptMaintenanceRunner?: (storage: FileStorage) => Promise<void>;
  scheduleReceiptMaintenanceInterval?: (
    callback: () => void,
    intervalMs: number
  ) => unknown;
  clearReceiptMaintenanceInterval?: (handle: unknown) => void;
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
  const prepareApplicationIndexes =
    dependencies.prepareApplicationIndexes ??
    dependencies.prepareIdentityIndexes ??
    initializeApplicationIndexes;

  let connected = false;
  let server: Server | undefined;
  let receiptMaintenance: ReceiptMaintenanceScheduler | undefined;
  try {
    await connect(env.MONGODB_URI);
    connected = true;
    await dependencies.prepareDatabase?.({ mongodbUri: env.MONGODB_URI });
    await prepareApplicationIndexes();
    const mailDelivery = env.mailDelivery;
    const invitationMailer = mailDelivery.kind === "smtp"
      ? createSmtpInvitationMailer(mailDelivery)
      : { deliveryKind: "disabled" as const };
    const passwordResetMailer = mailDelivery.kind === "smtp"
      ? createSmtpPasswordResetMailer(mailDelivery)
      : { deliveryKind: "disabled" as const };
    const estimateMailer = mailDelivery.kind === "smtp"
      ? createSmtpEstimateMailer(mailDelivery)
      : { deliveryKind: "disabled" as const };
    const designPlanMailer = mailDelivery.kind === "smtp"
      ? createSmtpDesignPlanMailer(mailDelivery)
      : { deliveryKind: "disabled" as const };
    const clientPortalUrl = mailDelivery.kind === "smtp"
      ? new URL("/client", mailDelivery.publicFrontendUrl).toString()
      : "http://localhost:5173/client";
    const storage = createLocalStorage(env.UPLOADS_DIR);
    const app = appFactory({
      repository: repositoryFactory(),
      auth: {
        jwtSecret: env.JWT_SECRET,
        jwtExpiresInSeconds: 900
      },
      corsOrigins: env.CORS_ORIGIN,
      storage,
      maxUploadBytes: Math.floor(env.MAX_UPLOAD_MB * 1024 * 1024),
      ocrLeaseSeconds: env.OCR_LEASE_SECONDS,
      ocrRetryPolicy: {
        maxAttempts: env.OCR_MAX_ATTEMPTS,
        initialDelayMs: env.OCR_RETRY_INITIAL_SECONDS * 1000,
        maxDelayMs: env.OCR_RETRY_MAX_SECONDS * 1000
      },
      ocrConfidenceFloor: env.OCR_CONFIDENCE_FLOOR,
      ocrWorkerToken: env.OCR_WORKER_TOKEN,
      invitationMailer,
      passwordResetMailer,
      allowDemoAccountExternalEmail: env.allowDemoAccountExternalEmail,
      estimateMailer,
      designPlanMailer,
      clientPortalUrl,
      developmentDemoAuthorization: dependencies.developmentDemoAuthorization,
      apiDocsEnabled: env.apiDocsEnabled
    });
    server = await listen(app, env.PORT, dependencies.bindHost);
    receiptMaintenance = startReceiptMaintenanceScheduler(
      storage,
      dependencies
    );
    (dependencies.writeOutput ?? ((message) => process.stdout.write(message)))(
      `Backend ready at http://${dependencies.bindHost ?? "localhost"}:${env.PORT}\n`
    );
  } catch (error) {
    await receiptMaintenance?.stop();
    if (server) await close(server).catch(() => undefined);
    if (connected) await disconnect();
    throw error;
  }
  if (!server) throw new Error("HTTP server did not start.");
  const runningServer = server;

  let stopping: Promise<void> | undefined;
  const stop = () => {
    stopping ??= (async () => {
      const maintenanceStop = receiptMaintenance?.stop();
      await close(runningServer);
      await maintenanceStop;
      await disconnect();
    })();
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

interface ReceiptMaintenanceScheduler {
  stop(): Promise<void>;
}

function startReceiptMaintenanceScheduler(
  storage: FileStorage,
  dependencies: ServerDependencies
): ReceiptMaintenanceScheduler {
  const intervalMs = dependencies.receiptMaintenanceIntervalMs ?? 60_000;
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1) {
    throw new Error("Receipt maintenance interval must be a positive integer.");
  }
  const runner = dependencies.receiptMaintenanceRunner ?? (async (fileStorage) => {
    await runProcurementReceiptReconciliationJobs({ storage: fileStorage });
    await runProcurementReceiptCleanupJobs({ storage: fileStorage });
  });
  const schedule = dependencies.scheduleReceiptMaintenanceInterval ??
    ((callback: () => void, delayMs: number) => setInterval(callback, delayMs));
  const clear = dependencies.clearReceiptMaintenanceInterval ??
    ((handle: unknown) => clearInterval(handle as NodeJS.Timeout));
  let stopped = false;
  let running: Promise<void> | null = null;
  const tick = () => {
    if (stopped || running) return;
    running = Promise.resolve(runner(storage))
      .catch(() => undefined)
      .finally(() => {
        running = null;
      });
  };
  const handle = schedule(tick, intervalMs);
  if (
    typeof handle === "object" &&
    handle !== null &&
    "unref" in handle &&
    typeof handle.unref === "function"
  ) {
    handle.unref();
  }
  return {
    async stop() {
      if (!stopped) {
        stopped = true;
        clear(handle);
      }
      await running;
    }
  };
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
