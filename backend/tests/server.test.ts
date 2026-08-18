import { EventEmitter } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

const createMongoRepository = vi.hoisted(() => vi.fn());

vi.mock("../src/repositories/mongo.js", () => ({ createMongoRepository }));

import { startServer } from "../src/server.js";
import type { AppRepository } from "../src/repositories/types.js";

const env = {
  PORT: 3010,
  MONGODB_URI: "mongodb://mongo.example:27017/lisno?replicaSet=rs0",
  JWT_SECRET: "server-runtime-secret-with-at-least-32-characters",
  CORS_ORIGIN: ["http://localhost:5173"],
  UPLOADS_DIR: "uploads",
  MAX_UPLOAD_MB: 25,
  OCR_LEASE_SECONDS: 300,
  OCR_WORKER_TOKEN: "server-worker-token-with-at-least-32-characters"
};

afterEach(() => {
  createMongoRepository.mockReset();
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

    expect(events).toEqual(["connect", "prepare", "repository", "app", "listen"]);
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
        repositoryFactory: () => ({} as AppRepository),
        appFactory,
        writeOutput,
        registerSignalHandlers: false
      })
    ).rejects.toBe(listenError);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(writeOutput).not.toHaveBeenCalled();
  });
});
