import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

const createMongoRepository = vi.hoisted(() => vi.fn());
const createSendGridDesignPlanMailer = vi.hoisted(() => vi.fn());
const createSendGridEstimateMailer = vi.hoisted(() => vi.fn());
const createSendGridInvitationMailer = vi.hoisted(() => vi.fn());
const createSendGridPasswordResetMailer = vi.hoisted(() => vi.fn());
const createSmtpDesignPlanMailer = vi.hoisted(() => vi.fn());
const createSmtpInvitationMailer = vi.hoisted(() => vi.fn());
const createSmtpEstimateMailer = vi.hoisted(() => vi.fn());
const createSmtpPasswordResetMailer = vi.hoisted(() => vi.fn());
const prepareEstimateClientReviewIndexes = vi.hoisted(() => vi.fn());

vi.mock("../src/repositories/mongo.js", () => ({ createMongoRepository }));
vi.mock("../src/services/sendgrid-design-plan-mailer.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/services/sendgrid-design-plan-mailer.js")>(),
  createSendGridDesignPlanMailer
}));
vi.mock("../src/services/sendgrid-estimate-mailer.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/services/sendgrid-estimate-mailer.js")>(),
  createSendGridEstimateMailer
}));
vi.mock("../src/services/sendgrid-invitation-mailer.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/services/sendgrid-invitation-mailer.js")>(),
  createSendGridInvitationMailer
}));
vi.mock("../src/services/sendgrid-password-reset-mailer.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/services/sendgrid-password-reset-mailer.js")>(),
  createSendGridPasswordResetMailer
}));
vi.mock("../src/services/smtp-design-plan-mailer.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/services/smtp-design-plan-mailer.js")>(),
  createSmtpDesignPlanMailer
}));
vi.mock("../src/services/smtp-invitation-mailer.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/services/smtp-invitation-mailer.js")>(),
  createSmtpInvitationMailer
}));
vi.mock("../src/services/smtp-estimate-mailer.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/services/smtp-estimate-mailer.js")>(),
  createSmtpEstimateMailer
}));
vi.mock("../src/services/smtp-password-reset-mailer.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/services/smtp-password-reset-mailer.js")>(),
  createSmtpPasswordResetMailer
}));
vi.mock("../src/models/EstimateClientReviewRound.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/models/EstimateClientReviewRound.js")>(),
  prepareEstimateClientReviewIndexes
}));

import { startServer } from "../src/server.js";
import { UserModel } from "../src/models/User.js";
import { UserInvitationModel } from "../src/models/UserInvitation.js";
import { PasswordResetRequestModel } from "../src/models/PasswordResetRequest.js";
import { DesignPlanReviewRoundModel } from "../src/models/DesignPlanReviewRound.js";
import { DesignPlanResponseProofModel } from "../src/models/DesignPlanResponseProof.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import { ProjectFinanceBucketModel } from "../src/models/ProjectFinanceBucket.js";
import { FinanceLedgerEntryModel } from "../src/models/FinanceLedgerEntry.js";
import { FinanceEntryDocumentModel } from "../src/models/FinanceEntryDocument.js";
import { ProcurementReceiptCleanupJobModel } from "../src/models/ProcurementReceiptCleanupJob.js";
import { ProcurementReceiptReconciliationJobModel } from "../src/models/ProcurementReceiptReconciliationJob.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeModeModel } from "../src/models/AiEstimatorKnowledgeMode.js";
import { AiEstimatorKnowledgePriceVersionModel } from "../src/models/AiEstimatorKnowledgePriceVersion.js";
import { AiEstimatorKnowledgePriorityModel } from "../src/models/AiEstimatorKnowledgePriority.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeSurfaceModel } from "../src/models/AiEstimatorKnowledgeSurface.js";
import { AiEstimatorKnowledgeTaxRuleModel } from "../src/models/AiEstimatorKnowledgeTaxRule.js";
import { AiEstimatorKnowledgeTaxVersionModel } from "../src/models/AiEstimatorKnowledgeTaxVersion.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import { AiEstimatorKnowledgeVendorModel } from "../src/models/AiEstimatorKnowledgeVendor.js";
import type { AppRepository } from "../src/repositories/types.js";
import { MailDeliveryError } from "../src/services/smtp-transport.js";

const env = {
  PORT: 3010,
  MONGODB_URI: "mongodb://mongo.example:27017/lisno?replicaSet=rs0",
  JWT_SECRET: "server-runtime-secret-with-at-least-32-characters",
  JWT_EXPIRES_IN_SECONDS: 86_400,
  CORS_ORIGIN: ["http://localhost:5173"],
  UPLOADS_DIR: "uploads",
  MAX_UPLOAD_MB: 25,
  OCR_LEASE_SECONDS: 300,
  OCR_MAX_ATTEMPTS: 5,
  OCR_RETRY_INITIAL_SECONDS: 30,
  OCR_RETRY_MAX_SECONDS: 900,
  OCR_CONFIDENCE_FLOOR: 0.2,
  OCR_WORKER_TOKEN: "server-worker-token-with-at-least-32-characters",
  mailDelivery: { kind: "disabled" as const }
};

afterEach(() => {
  createMongoRepository.mockReset();
  createSendGridDesignPlanMailer.mockReset();
  createSendGridEstimateMailer.mockReset();
  createSendGridInvitationMailer.mockReset();
  createSendGridPasswordResetMailer.mockReset();
  createSmtpDesignPlanMailer.mockReset();
  createSmtpInvitationMailer.mockReset();
  createSmtpEstimateMailer.mockReset();
  createSmtpPasswordResetMailer.mockReset();
  prepareEstimateClientReviewIndexes.mockReset();
  vi.restoreAllMocks();
});

function fakeServer(onClose?: () => void) {
  const server = new EventEmitter() as EventEmitter & {
    close: (callback: (error?: Error) => void) => void;
  };
  server.close = (callback) => {
    onClose?.();
    callback();
  };
  return server;
}

describe("production server bootstrap", () => {
  it("prepares the connected database before creating the repository, app, or listener", async () => {
    const events: string[] = [];
    const server = fakeServer();
    const repository = {} as AppRepository;
    const authorization = Object.freeze({
      databaseName: "lisno_demo",
      bindHost: "127.0.0.1"
    }) as never;
    const appDependencies: unknown[] = [];
    const app = {
      listen: vi.fn((_port: number, _host: string, callback: () => void) => {
        events.push("listen");
        callback();
        return server;
      })
    };

    const runtime = await startServer({
      loadEnvironment: () => env,
      connect: async () => {
        events.push("connect");
      },
      prepareDatabase: async (context) => {
        events.push("prepare");
        expect(context).toEqual({ mongodbUri: env.MONGODB_URI });
      },
      prepareIdentityIndexes: async () => {
        events.push("indexes");
      },
      repositoryFactory: () => {
        events.push("repository");
        return repository;
      },
      appFactory: (dependencies) => {
        events.push("app");
        appDependencies.push(dependencies);
        return app;
      },
      bindHost: "127.0.0.1",
      developmentDemoAuthorization: authorization,
      writeOutput: () => undefined,
      disconnect: async () => undefined,
      registerSignalHandlers: false
    });

    expect(events).toEqual([
      "connect",
      "prepare",
      "indexes",
      "repository",
      "app",
      "listen"
    ]);
    expect(app.listen).toHaveBeenCalledWith(
      env.PORT,
      "127.0.0.1",
      expect.any(Function)
    );
    expect(appDependencies).toEqual([
      expect.objectContaining({
        auth: {
          jwtSecret: env.JWT_SECRET,
          jwtExpiresInSeconds: env.JWT_EXPIRES_IN_SECONDS
        },
        developmentDemoAuthorization: authorization
      })
    ]);
    await runtime.stop();
  });

  it("keeps the unspecified-host listen overload for default startup", async () => {
    const server = fakeServer();
    const listen = vi.fn((_port: number, callback: () => void) => {
      callback();
      return server;
    });
    const writeOutput = vi.fn();

    const runtime = await startServer({
      loadEnvironment: () => env,
      connect: async () => undefined,
      disconnect: async () => undefined,
      prepareIdentityIndexes: async () => undefined,
      repositoryFactory: () => ({} as AppRepository),
      appFactory: () => ({ listen }),
      writeOutput,
      registerSignalHandlers: false
    });

    expect(listen).toHaveBeenCalledWith(env.PORT, expect.any(Function));
    expect(writeOutput).toHaveBeenCalledWith(
      `Backend ready at http://localhost:${env.PORT}\n`
    );
    await runtime.stop();
  });

  it("reports the explicit development host after listening", async () => {
    const server = fakeServer();
    const writeOutput = vi.fn();

    const runtime = await startServer({
      loadEnvironment: () => env,
      connect: async () => undefined,
      disconnect: async () => undefined,
      prepareIdentityIndexes: async () => undefined,
      repositoryFactory: () => ({} as AppRepository),
      appFactory: () => ({
        listen: vi.fn(
          (_port: number, _host: string, callback: () => void) => {
            callback();
            return server;
          }
        )
      }),
      bindHost: "127.0.0.1",
      writeOutput,
      registerSignalHandlers: false
    });

    expect(writeOutput).toHaveBeenCalledWith(
      `Backend ready at http://127.0.0.1:${env.PORT}\n`
    );
    await runtime.stop();
  });

  it("disconnects exactly once without creating downstream resources when preparation fails", async () => {
    const preparationError = new Error("Demo preparation failed");
    const disconnect = vi.fn(async () => undefined);
    const repositoryFactory = vi.fn();
    const appFactory = vi.fn();
    const writeOutput = vi.fn();

    await expect(
      startServer({
        loadEnvironment: () => env,
        connect: async () => undefined,
        disconnect,
        prepareDatabase: async () => {
          throw preparationError;
        },
        repositoryFactory,
        appFactory,
        writeOutput,
        registerSignalHandlers: false
      })
    ).rejects.toBe(preparationError);

    expect(disconnect).toHaveBeenCalledOnce();
    expect(repositoryFactory).not.toHaveBeenCalled();
    expect(appFactory).not.toHaveBeenCalled();
    expect(writeOutput).not.toHaveBeenCalled();
  });

  it("uses the shipped Mongo repository factory when no test override is supplied", async () => {
    const server = fakeServer();
    const repository = {} as AppRepository;
    const writeOutput = vi.fn();
    createMongoRepository.mockReturnValue(repository);
    const appFactory = vi.fn(() => ({
      listen: vi.fn((_port: number, callback: () => void) => {
        callback();
        return server;
      })
    }));

    const runtime = await startServer({
      loadEnvironment: () => env,
      connect: async () => undefined,
      disconnect: async () => undefined,
      prepareIdentityIndexes: async () => undefined,
      appFactory,
      writeOutput,
      registerSignalHandlers: false
    });

    expect(createMongoRepository).toHaveBeenCalledOnce();
    expect(writeOutput).toHaveBeenCalledOnce();
    expect(appFactory).toHaveBeenCalledWith(
      expect.objectContaining({ repository })
    );
    await runtime.stop();
  });

  it("connects with MONGODB_URI and injects the Mongo repository instead of an in-memory fallback", async () => {
    const shutdownOrder: string[] = [];
    const server = fakeServer(() => shutdownOrder.push("http"));
    const repository = {} as AppRepository;
    const connect = vi.fn(async () => undefined);
    const disconnect = vi.fn(async () => {
      shutdownOrder.push("mongo");
    });
    const writeOutput = vi.fn();
    const repositoryFactory = vi.fn(() => repository);
    const appFactory = vi.fn(() => ({
      listen: vi.fn((_port: number, callback: () => void) => {
        callback();
        return server;
      })
    }));

    const runtime = await startServer({
      loadEnvironment: () => env,
      connect,
      disconnect,
      prepareIdentityIndexes: async () => undefined,
      repositoryFactory,
      appFactory,
      writeOutput,
      registerSignalHandlers: false
    });

    expect(connect).toHaveBeenCalledWith(env.MONGODB_URI);
    expect(repositoryFactory).toHaveBeenCalledOnce();
    expect(appFactory).toHaveBeenCalledWith(
      expect.objectContaining({ repository, corsOrigins: env.CORS_ORIGIN })
    );
    expect(writeOutput).toHaveBeenCalledOnce();
    expect(writeOutput).toHaveBeenCalledWith(
      `Backend ready at http://localhost:${env.PORT}\n`
    );
    await runtime.stop();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(shutdownOrder).toEqual(["http", "mongo"]);
  });

  it("fails before listening when Mongo cannot connect", async () => {
    const appFactory = vi.fn();
    const disconnect = vi.fn(async () => undefined);
    const prepareDatabase = vi.fn();
    const connect = vi.fn(async () => {
      throw new Error("Mongo unavailable");
    });

    await expect(
      startServer({
        loadEnvironment: () => env,
        connect,
        disconnect,
        prepareDatabase,
        appFactory,
        registerSignalHandlers: false
      })
    ).rejects.toThrow("Mongo unavailable");
    expect(disconnect).not.toHaveBeenCalled();
    expect(prepareDatabase).not.toHaveBeenCalled();
    expect(appFactory).not.toHaveBeenCalled();
  });

  it("rejects and disconnects when Express reports a listen error", async () => {
    const listenError = Object.assign(new Error("address already in use"), {
      code: "EADDRINUSE"
    });
    const server = fakeServer();
    const disconnect = vi.fn(async () => undefined);
    const writeOutput = vi.fn();
    const appFactory = vi.fn(() => ({
      listen: vi.fn(
        (_port: number, callback: (error?: Error) => void) => {
          callback(listenError);
          return server;
        }
      )
    }));

    await expect(
      startServer({
        loadEnvironment: () => env,
        connect: async () => undefined,
        disconnect,
        prepareIdentityIndexes: async () => undefined,
        repositoryFactory: () => ({} as AppRepository),
        appFactory,
        writeOutput,
        registerSignalHandlers: false
      })
    ).rejects.toBe(listenError);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(writeOutput).not.toHaveBeenCalled();
  });

  it("initializes every application index before repository creation and listen", async () => {
    const events: string[] = [];
    const server = fakeServer();
    vi.spyOn(UserModel, "init").mockImplementation(async () => {
      events.push("user-index");
      return UserModel as never;
    });
    vi.spyOn(UserInvitationModel, "init").mockImplementation(async () => {
      events.push("invitation-index");
      return UserInvitationModel as never;
    });
    vi.spyOn(PasswordResetRequestModel, "init").mockImplementation(async () => {
      events.push("password-reset-index");
      return PasswordResetRequestModel as never;
    });
    prepareEstimateClientReviewIndexes.mockImplementation(async () => {
      events.push("estimate-client-review-indexes");
    });
    vi.spyOn(DesignPlanReviewRoundModel, "init").mockImplementation(async () => {
      events.push("design-plan-review-index");
      return DesignPlanReviewRoundModel as never;
    });
    vi.spyOn(DesignPlanResponseProofModel, "init").mockImplementation(async () => {
      events.push("design-plan-proof-index");
      return DesignPlanResponseProofModel as never;
    });
    vi.spyOn(ProjectWorkflowTaskModel, "init").mockImplementation(async () => {
      events.push("project-workflow-task-index");
      return ProjectWorkflowTaskModel as never;
    });
    vi.spyOn(ProjectFinanceBucketModel, "init").mockImplementation(async () => {
      events.push("project-finance-bucket-index");
      return ProjectFinanceBucketModel as never;
    });
    vi.spyOn(FinanceLedgerEntryModel, "init").mockImplementation(async () => {
      events.push("finance-ledger-entry-index");
      return FinanceLedgerEntryModel as never;
    });
    vi.spyOn(FinanceEntryDocumentModel, "init").mockImplementation(async () => {
      events.push("finance-entry-document-index");
      return FinanceEntryDocumentModel as never;
    });
    vi.spyOn(ProcurementReceiptCleanupJobModel, "init").mockImplementation(async () => {
      events.push("procurement-receipt-cleanup-index");
      return ProcurementReceiptCleanupJobModel as never;
    });
    vi.spyOn(ProcurementReceiptReconciliationJobModel, "init").mockImplementation(async () => {
      events.push("procurement-receipt-reconciliation-index");
      return ProcurementReceiptReconciliationJobModel as never;
    });
    vi.spyOn(AiEstimatorKnowledgeBasketModel, "init").mockImplementation(async () => {
      events.push("ai-estimator-knowledge-basket-index");
      return AiEstimatorKnowledgeBasketModel as never;
    });
    vi.spyOn(AiEstimatorKnowledgeMainLineModel, "init").mockImplementation(async () => {
      events.push("ai-estimator-knowledge-main-line-index");
      return AiEstimatorKnowledgeMainLineModel as never;
    });
    vi.spyOn(AiEstimatorKnowledgeRevisionModel, "init").mockImplementation(async () => {
      events.push("ai-estimator-knowledge-revision-index");
      return AiEstimatorKnowledgeRevisionModel as never;
    });
    vi.spyOn(AiEstimatorKnowledgeSectionModel, "init").mockImplementation(async () => {
      events.push("ai-estimator-knowledge-section-index");
      return AiEstimatorKnowledgeSectionModel as never;
    });
    vi.spyOn(AiEstimatorKnowledgePriceVersionModel, "init").mockImplementation(async () => {
      events.push("ai-estimator-knowledge-price-version-index");
      return AiEstimatorKnowledgePriceVersionModel as never;
    });
    vi.spyOn(AiEstimatorKnowledgeUomModel, "init").mockImplementation(async () => {
      events.push("ai-estimator-knowledge-uom-index");
      return AiEstimatorKnowledgeUomModel as never;
    });
    vi.spyOn(AiEstimatorKnowledgeVendorModel, "init").mockImplementation(async () => {
      events.push("ai-estimator-knowledge-vendor-index");
      return AiEstimatorKnowledgeVendorModel as never;
    });
    vi.spyOn(AiEstimatorKnowledgeTaxRuleModel, "init").mockImplementation(async () => {
      events.push("ai-estimator-knowledge-tax-rule-index");
      return AiEstimatorKnowledgeTaxRuleModel as never;
    });
    vi.spyOn(AiEstimatorKnowledgeTaxVersionModel, "init").mockImplementation(async () => {
      events.push("ai-estimator-knowledge-tax-version-index");
      return AiEstimatorKnowledgeTaxVersionModel as never;
    });
    vi.spyOn(AiEstimatorKnowledgePriorityModel, "init").mockImplementation(async () => {
      events.push("ai-estimator-knowledge-priority-index");
      return AiEstimatorKnowledgePriorityModel as never;
    });
    vi.spyOn(AiEstimatorKnowledgeSurfaceModel, "init").mockImplementation(async () => {
      events.push("ai-estimator-knowledge-surface-index");
      return AiEstimatorKnowledgeSurfaceModel as never;
    });
    vi.spyOn(AiEstimatorKnowledgeModeModel, "init").mockImplementation(async () => {
      events.push("ai-estimator-knowledge-mode-index");
      return AiEstimatorKnowledgeModeModel as never;
    });

    const runtime = await startServer({
      loadEnvironment: () => env,
      connect: async () => {
        events.push("connect");
      },
      disconnect: async () => undefined,
      repositoryFactory: () => {
        events.push("repository");
        return {} as AppRepository;
      },
      appFactory: () => {
        events.push("app");
        return {
          listen: vi.fn((_port: number, callback: () => void) => {
            events.push("listen");
            callback();
            return server;
          })
        };
      },
      writeOutput: () => undefined,
      registerSignalHandlers: false
    });

    expect(events).toEqual([
      "connect",
      "user-index",
      "invitation-index",
      "password-reset-index",
      "estimate-client-review-indexes",
      "design-plan-review-index",
      "design-plan-proof-index",
      "project-workflow-task-index",
      "project-finance-bucket-index",
      "finance-ledger-entry-index",
      "finance-entry-document-index",
      "procurement-receipt-cleanup-index",
      "procurement-receipt-reconciliation-index",
      "ai-estimator-knowledge-basket-index",
      "ai-estimator-knowledge-main-line-index",
      "ai-estimator-knowledge-revision-index",
      "ai-estimator-knowledge-section-index",
      "ai-estimator-knowledge-price-version-index",
      "ai-estimator-knowledge-uom-index",
      "ai-estimator-knowledge-vendor-index",
      "ai-estimator-knowledge-tax-rule-index",
      "ai-estimator-knowledge-tax-version-index",
      "ai-estimator-knowledge-priority-index",
      "ai-estimator-knowledge-surface-index",
      "ai-estimator-knowledge-mode-index",
      "repository",
      "app",
      "listen"
    ]);
    await runtime.stop();
  });

  it("prepares all application indexes after optional database preparation and before construction or listen", async () => {
    const events: string[] = [];
    const server = fakeServer();

    const runtime = await startServer({
      loadEnvironment: () => env,
      connect: async () => {
        events.push("connect");
      },
      prepareDatabase: async () => {
        events.push("database-preparation");
      },
      // The application-wide seam takes precedence over the historical alias.
      prepareIdentityIndexes: async () => undefined,
      prepareApplicationIndexes: async () => {
        events.push("application-indexes");
      },
      repositoryFactory: () => {
        events.push("repository");
        return {} as AppRepository;
      },
      appFactory: () => {
        events.push("app");
        return {
          listen: vi.fn((_port: number, callback: () => void) => {
            events.push("listen");
            callback();
            return server;
          })
        };
      },
      disconnect: async () => undefined,
      writeOutput: () => undefined,
      registerSignalHandlers: false
    });

    expect(events).toEqual([
      "connect",
      "database-preparation",
      "application-indexes",
      "repository",
      "app",
      "listen"
    ]);
    await runtime.stop();
  });

  it("disconnects and never constructs or listens when application index readiness fails", async () => {
    const failure = new Error("application index collision");
    const disconnect = vi.fn(async () => undefined);
    const repositoryFactory = vi.fn();
    const server = fakeServer();
    const listen = vi.fn((_port: number, callback: () => void) => {
      callback();
      return server;
    });
    const appFactory = vi.fn(() => ({ listen }));
    const writeOutput = vi.fn();
    const smtpPassword = "index-failure-smtp-password";
    const smtpUsername = "index-failure-smtp-user";

    const outcome = await startServer({
      loadEnvironment: () => ({
        ...env,
        mailDelivery: {
          kind: "smtp" as const,
          publicFrontendUrl: "https://app.example.test",
          host: "smtp.example.test",
          port: 587,
          tlsMode: "starttls" as const,
          username: smtpUsername,
          password: smtpPassword,
          from: "Lisno <mail@example.test>",
          deliveryTimeoutMs: 120_000
        }
      }),
      connect: async () => undefined,
      disconnect,
      prepareIdentityIndexes: async () => undefined,
      prepareApplicationIndexes: async () => {
        throw failure;
      },
      repositoryFactory,
      appFactory,
      writeOutput,
      registerSignalHandlers: false
    }).then(
      (runtime) => ({ kind: "started" as const, runtime }),
      (error: unknown) => ({ kind: "failed" as const, error })
    );

    if (outcome.kind === "started") await outcome.runtime.stop();

    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.error).toBe(failure);
      expect(String(outcome.error)).not.toContain(smtpUsername);
      expect(String(outcome.error)).not.toContain(smtpPassword);
    }
    expect(disconnect).toHaveBeenCalledOnce();
    expect(repositoryFactory).not.toHaveBeenCalled();
    expect(appFactory).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
    expect(writeOutput).not.toHaveBeenCalled();
  });

  it("disconnects exactly once and never constructs or listens when identity index readiness fails", async () => {
    const failure = new Error("identity index collision");
    const disconnect = vi.fn(async () => undefined);
    const repositoryFactory = vi.fn();
    const appFactory = vi.fn();
    const writeOutput = vi.fn();

    await expect(startServer({
      loadEnvironment: () => env,
      connect: async () => undefined,
      disconnect,
      prepareIdentityIndexes: async () => {
        throw failure;
      },
      repositoryFactory,
      appFactory,
      writeOutput,
      registerSignalHandlers: false
    })).rejects.toBe(failure);

    expect(disconnect).toHaveBeenCalledOnce();
    expect(repositoryFactory).not.toHaveBeenCalled();
    expect(appFactory).not.toHaveBeenCalled();
    expect(writeOutput).not.toHaveBeenCalled();
  });

  it("injects every disabled delivery boundary without constructing an external provider", async () => {
    const server = fakeServer();
    const appFactory = vi.fn(() => ({
      listen: vi.fn((_port: number, callback: () => void) => {
        callback();
        return server;
      })
    }));

    const runtime = await startServer({
      loadEnvironment: () => env,
      connect: async () => undefined,
      disconnect: async () => undefined,
      prepareIdentityIndexes: async () => undefined,
      repositoryFactory: () => ({} as AppRepository),
      appFactory,
      writeOutput: () => undefined,
      registerSignalHandlers: false
    });

    expect(createSmtpInvitationMailer).not.toHaveBeenCalled();
    expect(createSmtpEstimateMailer).not.toHaveBeenCalled();
    expect(createSmtpPasswordResetMailer).not.toHaveBeenCalled();
    expect(createSmtpDesignPlanMailer).not.toHaveBeenCalled();
    expect(createSendGridInvitationMailer).not.toHaveBeenCalled();
    expect(createSendGridEstimateMailer).not.toHaveBeenCalled();
    expect(createSendGridPasswordResetMailer).not.toHaveBeenCalled();
    expect(createSendGridDesignPlanMailer).not.toHaveBeenCalled();
    expect(appFactory).toHaveBeenCalledWith(expect.objectContaining({
      invitationMailer: { deliveryKind: "disabled" },
      passwordResetMailer: { deliveryKind: "disabled" },
      estimateMailer: { deliveryKind: "disabled" },
      designPlanMailer: { deliveryKind: "disabled" },
      clientPortalUrl: "http://localhost:5173/client"
    }));
    await runtime.stop();
  });

  it("maps one complete SMTP union through every mail factory without exposing credentials to the app", async () => {
    const smtp = {
      kind: "smtp" as const,
      publicFrontendUrl: "https://app.example.test",
      host: "smtp.example.test",
      port: 587,
      tlsMode: "starttls" as const,
      username: "smtp-user",
      password: "smtp-password",
      from: "Lisno Invitations <invitations@example.test>",
      deliveryTimeoutMs: 120_000
    };
    const externalMailer = {
      deliveryKind: "external" as const,
      sendInvitation: vi.fn(async () => undefined)
    };
    const externalEstimateMailer = {
      deliveryKind: "external" as const,
      send: vi.fn(async () => ({ kind: "sent" as const }))
    };
    const externalPasswordResetMailer = {
      deliveryKind: "external" as const,
      sendResetLink: vi.fn(async () => undefined),
      sendPasswordChanged: vi.fn(async () => undefined)
    };
    const externalDesignPlanMailer = {
      deliveryKind: "external" as const,
      sendDesignPlan: vi.fn(async () => ({ kind: "sent" as const }))
    };
    createSmtpInvitationMailer.mockReturnValue(externalMailer);
    createSmtpEstimateMailer.mockReturnValue(externalEstimateMailer);
    createSmtpPasswordResetMailer.mockReturnValue(externalPasswordResetMailer);
    createSmtpDesignPlanMailer.mockReturnValue(externalDesignPlanMailer);
    const server = fakeServer();
    const appFactory = vi.fn(() => ({
      listen: vi.fn((_port: number, callback: () => void) => {
        callback();
        return server;
      })
    }));

    const runtime = await startServer({
      loadEnvironment: () => ({ ...env, mailDelivery: smtp }),
      connect: async () => undefined,
      disconnect: async () => undefined,
      prepareIdentityIndexes: async () => undefined,
      repositoryFactory: () => ({} as AppRepository),
      appFactory,
      writeOutput: () => undefined,
      registerSignalHandlers: false
    });

    expect(createSmtpInvitationMailer).toHaveBeenCalledOnce();
    expect(createSmtpInvitationMailer).toHaveBeenCalledWith(smtp);
    expect(createSmtpEstimateMailer).toHaveBeenCalledOnce();
    expect(createSmtpEstimateMailer).toHaveBeenCalledWith(smtp);
    expect(createSmtpPasswordResetMailer).toHaveBeenCalledOnce();
    expect(createSmtpPasswordResetMailer).toHaveBeenCalledWith(smtp);
    expect(createSmtpDesignPlanMailer).toHaveBeenCalledOnce();
    expect(createSmtpDesignPlanMailer).toHaveBeenCalledWith(smtp);
    expect(createSendGridInvitationMailer).not.toHaveBeenCalled();
    expect(createSendGridEstimateMailer).not.toHaveBeenCalled();
    expect(createSendGridPasswordResetMailer).not.toHaveBeenCalled();
    expect(createSendGridDesignPlanMailer).not.toHaveBeenCalled();
    expect(appFactory).toHaveBeenCalledWith(expect.objectContaining({
      invitationMailer: externalMailer,
      passwordResetMailer: externalPasswordResetMailer,
      estimateMailer: externalEstimateMailer,
      designPlanMailer: externalDesignPlanMailer,
      clientPortalUrl: "https://app.example.test/client"
    }));

    const capturedDependencies = appFactory.mock.calls[0]?.[0];
    const capturedJson = JSON.stringify(capturedDependencies);
    expect(capturedJson).not.toContain(smtp.username);
    expect(capturedJson).not.toContain(smtp.password);
    const portalUrl = new URL(String(capturedDependencies?.clientPortalUrl));
    expect({
      username: portalUrl.username,
      password: portalUrl.password,
      search: portalUrl.search,
      hash: portalUrl.hash,
      pathname: portalUrl.pathname
    }).toEqual({
      username: "",
      password: "",
      search: "",
      hash: "",
      pathname: "/client"
    });
    await runtime.stop();
  });

  it("maps one complete SendGrid union through every SendGrid factory without exposing credentials to the app", async () => {
    const sendGrid = {
      kind: "sendgrid_web_api" as const,
      publicFrontendUrl: "https://app.example.test",
      apiKey: "SG.server-fabricated-private-key",
      from: "Lisno <mail@example.test>",
      deliveryTimeoutMs: 120_000
    };
    const invitationMailer = {
      deliveryKind: "external" as const,
      sendInvitation: vi.fn(async () => undefined)
    };
    const estimateMailer = {
      deliveryKind: "external" as const,
      send: vi.fn(async () => ({ kind: "sent" as const }))
    };
    const passwordResetMailer = {
      deliveryKind: "external" as const,
      sendResetLink: vi.fn(async () => undefined),
      sendPasswordChanged: vi.fn(async () => undefined)
    };
    const designPlanMailer = {
      deliveryKind: "external" as const,
      sendDesignPlan: vi.fn(async () => ({ kind: "sent" as const }))
    };
    createSendGridInvitationMailer.mockReturnValue(invitationMailer);
    createSendGridEstimateMailer.mockReturnValue(estimateMailer);
    createSendGridPasswordResetMailer.mockReturnValue(passwordResetMailer);
    createSendGridDesignPlanMailer.mockReturnValue(designPlanMailer);
    const server = fakeServer();
    const appFactory = vi.fn(() => ({
      listen: vi.fn((_port: number, callback: () => void) => {
        callback();
        return server;
      })
    }));

    const runtime = await startServer({
      loadEnvironment: () => ({ ...env, mailDelivery: sendGrid }),
      connect: async () => undefined,
      disconnect: async () => undefined,
      prepareIdentityIndexes: async () => undefined,
      repositoryFactory: () => ({} as AppRepository),
      appFactory,
      writeOutput: () => undefined,
      registerSignalHandlers: false
    });

    expect(createSendGridInvitationMailer).toHaveBeenCalledOnce();
    expect(createSendGridInvitationMailer).toHaveBeenCalledWith(sendGrid);
    expect(createSendGridEstimateMailer).toHaveBeenCalledOnce();
    expect(createSendGridEstimateMailer).toHaveBeenCalledWith(sendGrid);
    expect(createSendGridPasswordResetMailer).toHaveBeenCalledOnce();
    expect(createSendGridPasswordResetMailer).toHaveBeenCalledWith(sendGrid);
    expect(createSendGridDesignPlanMailer).toHaveBeenCalledOnce();
    expect(createSendGridDesignPlanMailer).toHaveBeenCalledWith(sendGrid);
    expect(createSmtpInvitationMailer).not.toHaveBeenCalled();
    expect(createSmtpEstimateMailer).not.toHaveBeenCalled();
    expect(createSmtpPasswordResetMailer).not.toHaveBeenCalled();
    expect(createSmtpDesignPlanMailer).not.toHaveBeenCalled();
    expect(appFactory).toHaveBeenCalledWith(expect.objectContaining({
      invitationMailer,
      passwordResetMailer,
      estimateMailer,
      designPlanMailer,
      clientPortalUrl: "https://app.example.test/client"
    }));

    const capturedDependencies = appFactory.mock.calls[0]?.[0];
    const capturedJson = JSON.stringify(capturedDependencies);
    expect(capturedJson).not.toContain(sendGrid.apiKey);
    expect(capturedJson).not.toContain(sendGrid.from);
    const portalUrl = new URL(String(capturedDependencies?.clientPortalUrl));
    expect({
      username: portalUrl.username,
      password: portalUrl.password,
      search: portalUrl.search,
      hash: portalUrl.hash,
      pathname: portalUrl.pathname
    }).toEqual({
      username: "",
      password: "",
      search: "",
      hash: "",
      pathname: "/client"
    });
    await runtime.stop();
  });

  it("disconnects without listening when SendGrid construction fails with a bounded secret-safe error", async () => {
    const sendGrid = {
      kind: "sendgrid_web_api" as const,
      publicFrontendUrl: "https://app.example.test",
      apiKey: "SG.server-construction-private-key",
      from: "Lisno Private Sender <mail@example.test>",
      deliveryTimeoutMs: 120_000
    };
    const failure = new MailDeliveryError("SENDGRID_AUTH_FAILED");
    createSendGridInvitationMailer.mockImplementation(() => {
      throw failure;
    });
    const disconnect = vi.fn(async () => undefined);
    const repositoryFactory = vi.fn();
    const appFactory = vi.fn();
    const writeOutput = vi.fn();

    const outcome = await startServer({
      loadEnvironment: () => ({ ...env, mailDelivery: sendGrid }),
      connect: async () => undefined,
      disconnect,
      prepareIdentityIndexes: async () => undefined,
      repositoryFactory,
      appFactory,
      writeOutput,
      registerSignalHandlers: false
    }).then(
      (runtime) => ({ kind: "started" as const, runtime }),
      (error: unknown) => ({ kind: "failed" as const, error })
    );

    if (outcome.kind === "started") await outcome.runtime.stop();

    expect(outcome.kind).toBe("failed");
    if (outcome.kind === "failed") {
      expect(outcome.error).toBe(failure);
      const exposed = `${String(outcome.error)} ${JSON.stringify(outcome.error)}`;
      expect(exposed).not.toContain(sendGrid.apiKey);
      expect(exposed).not.toContain(sendGrid.from);
      expect(exposed).not.toContain("mail@example.test");
    }
    expect(createSendGridInvitationMailer).toHaveBeenCalledOnce();
    expect(createSendGridInvitationMailer).toHaveBeenCalledWith(sendGrid);
    expect(createSendGridEstimateMailer).not.toHaveBeenCalled();
    expect(createSendGridPasswordResetMailer).not.toHaveBeenCalled();
    expect(createSendGridDesignPlanMailer).not.toHaveBeenCalled();
    expect(repositoryFactory).not.toHaveBeenCalled();
    expect(appFactory).not.toHaveBeenCalled();
    expect(writeOutput).not.toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalledOnce();
  });

  it("does not connect when environment loading rejects a partial SMTP group", async () => {
    const connect = vi.fn();

    await expect(startServer({
      loadEnvironment: () => {
        throw new Error("Mail delivery configuration must be supplied as one complete group.");
      },
      connect,
      registerSignalHandlers: false
    })).rejects.toThrow("Mail delivery configuration must be supplied as one complete group.");

    expect(connect).not.toHaveBeenCalled();
  });

  it("runs receipt maintenance out of band without overlap and clears the unref timer on shutdown", async () => {
    const server = fakeServer();
    let tick: (() => void) | undefined;
    let releaseRun: (() => void) | undefined;
    const maintenanceRunner = vi.fn(
      () => new Promise<void>((resolve) => {
        releaseRun = resolve;
      })
    );
    const intervalHandle = { unref: vi.fn() };
    const schedule = vi.fn((callback: () => void, _intervalMs: number) => {
      tick = callback;
      return intervalHandle;
    });
    const clear = vi.fn();
    const disconnect = vi.fn(async () => undefined);

    const runtime = await startServer({
      loadEnvironment: () => env,
      connect: async () => undefined,
      disconnect,
      prepareApplicationIndexes: async () => undefined,
      repositoryFactory: () => ({} as AppRepository),
      appFactory: () => ({
        listen: vi.fn((_port: number, callback: () => void) => {
          callback();
          return server;
        })
      }),
      receiptMaintenanceIntervalMs: 30_000,
      receiptMaintenanceRunner: maintenanceRunner,
      scheduleReceiptMaintenanceInterval: schedule,
      clearReceiptMaintenanceInterval: clear,
      writeOutput: () => undefined,
      registerSignalHandlers: false
    });

    expect(schedule).toHaveBeenCalledWith(expect.any(Function), 30_000);
    expect(intervalHandle.unref).toHaveBeenCalledOnce();
    tick?.();
    tick?.();
    expect(maintenanceRunner).toHaveBeenCalledOnce();

    let stopped = false;
    const stopping = runtime.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(clear).toHaveBeenCalledOnce();
    expect(stopped).toBe(false);
    releaseRun?.();
    await stopping;
    expect(disconnect).toHaveBeenCalledOnce();
    tick?.();
    expect(maintenanceRunner).toHaveBeenCalledOnce();
  });
});
