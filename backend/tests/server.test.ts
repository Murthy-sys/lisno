import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

const createMongoRepository = vi.hoisted(() => vi.fn());
const createSmtpInvitationMailer = vi.hoisted(() => vi.fn());
const createSmtpEstimateMailer = vi.hoisted(() => vi.fn());
const prepareEstimateClientReviewIndexes = vi.hoisted(() => vi.fn());

vi.mock("../src/repositories/mongo.js", () => ({ createMongoRepository }));
vi.mock("../src/services/smtp-invitation-mailer.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/services/smtp-invitation-mailer.js")>(),
  createSmtpInvitationMailer
}));
vi.mock("../src/services/smtp-estimate-mailer.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/services/smtp-estimate-mailer.js")>(),
  createSmtpEstimateMailer
}));
vi.mock("../src/models/EstimateClientReviewRound.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../src/models/EstimateClientReviewRound.js")>(),
  prepareEstimateClientReviewIndexes
}));

import { startServer } from "../src/server.js";
import { UserModel } from "../src/models/User.js";
import { UserInvitationModel } from "../src/models/UserInvitation.js";
import { DesignPlanReviewRoundModel } from "../src/models/DesignPlanReviewRound.js";
import { DesignPlanResponseProofModel } from "../src/models/DesignPlanResponseProof.js";
import { ProjectWorkflowTaskModel } from "../src/models/ProjectWorkflowTask.js";
import type { AppRepository } from "../src/repositories/types.js";

const env = {
  PORT: 3010,
  MONGODB_URI: "mongodb://mongo.example:27017/lisno?replicaSet=rs0",
  JWT_SECRET: "server-runtime-secret-with-at-least-32-characters",
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
  createSmtpInvitationMailer.mockReset();
  createSmtpEstimateMailer.mockReset();
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
      expect.objectContaining({ developmentDemoAuthorization: authorization })
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
      "estimate-client-review-indexes",
      "design-plan-review-index",
      "design-plan-proof-index",
      "project-workflow-task-index",
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
          from: "Lisno <mail@example.test>"
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

  it("injects both disabled delivery boundaries without constructing SMTP", async () => {
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
    expect(appFactory).toHaveBeenCalledWith(expect.objectContaining({
      invitationMailer: { deliveryKind: "disabled" },
      estimateMailer: { deliveryKind: "disabled" },
      clientPortalUrl: "http://localhost:5173/client"
    }));
    await runtime.stop();
  });

  it("maps one complete SMTP union through both factories without exposing credentials to the app", async () => {
    const smtp = {
      kind: "smtp" as const,
      publicFrontendUrl: "https://app.example.test",
      host: "smtp.example.test",
      port: 587,
      tlsMode: "starttls" as const,
      username: "smtp-user",
      password: "smtp-password",
      from: "Lisno Invitations <invitations@example.test>"
    };
    const externalMailer = {
      deliveryKind: "external" as const,
      sendInvitation: vi.fn(async () => undefined)
    };
    const externalEstimateMailer = {
      deliveryKind: "external" as const,
      send: vi.fn(async () => ({ kind: "sent" as const }))
    };
    createSmtpInvitationMailer.mockReturnValue(externalMailer);
    createSmtpEstimateMailer.mockReturnValue(externalEstimateMailer);
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
    expect(appFactory).toHaveBeenCalledWith(expect.objectContaining({
      invitationMailer: externalMailer,
      estimateMailer: externalEstimateMailer,
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
});
