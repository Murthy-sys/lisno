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
  MAX_UPLOAD_MB: 25
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
  it("uses the shipped Mongo repository factory when no test override is supplied", async () => {
    const server = fakeServer();
    const repository = {} as AppRepository;
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
      registerSignalHandlers: false
    });

    expect(createMongoRepository).toHaveBeenCalledOnce();
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
      registerSignalHandlers: false
    });

    expect(connect).toHaveBeenCalledWith(env.MONGODB_URI);
    expect(repositoryFactory).toHaveBeenCalledOnce();
    expect(appFactory).toHaveBeenCalledWith(
      expect.objectContaining({ repository, corsOrigins: env.CORS_ORIGIN })
    );
    await runtime.stop();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(shutdownOrder).toEqual(["http", "mongo"]);
  });

  it("fails before listening when Mongo cannot connect", async () => {
    const appFactory = vi.fn();
    const connect = vi.fn(async () => {
      throw new Error("Mongo unavailable");
    });

    await expect(
      startServer({
        loadEnvironment: () => env,
        connect,
        appFactory,
        registerSignalHandlers: false
      })
    ).rejects.toThrow("Mongo unavailable");
    expect(appFactory).not.toHaveBeenCalled();
  });
});
