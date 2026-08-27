import { describe, expect, it, vi } from "vitest";

import type { ServerDependencies } from "../src/server.js";
import { startDevelopmentBackend } from "../src/development/start.js";

const environment = {
  NODE_ENV: "development",
  MONGODB_URI: "mongodb://127.0.0.1:27017/lisno_demo?replicaSet=rs0",
  JWT_SECRET: "development-startup-secret-with-at-least-32-characters",
  OCR_WORKER_TOKEN: "development-worker-token-with-at-least-32-characters"
};

describe("development backend startup loading boundary", () => {
  it.each([
    ["production runtime", { ...environment, NODE_ENV: "production" }],
    [
      "remote Mongo target",
      { ...environment, MONGODB_URI: "mongodb://192.0.2.10:27017/lisno_demo" }
    ]
  ])(
    "rejects %s before loading server or demo account modules",
    async (_name, input) => {
      const loadServer = vi.fn();
      const loadDemoAccounts = vi.fn();

      await expect(
        startDevelopmentBackend({
          environment: input,
          loadServer,
          loadDemoAccounts
        })
      ).rejects.toThrow("Development demo startup is not authorized.");

      expect(loadServer).not.toHaveBeenCalled();
      expect(loadDemoAccounts).not.toHaveBeenCalled();
    }
  );

  it("loads the server after authorization and keeps the writer lazy until preparation", async () => {
    let serverDependencies: ServerDependencies | undefined;
    const runtime = { stop: vi.fn(async () => undefined) };
    const startServer = vi.fn(async (dependencies: ServerDependencies = {}) => {
      serverDependencies = dependencies;
      return runtime;
    });
    const loadServer = vi.fn(async () => ({ startServer }));
    const ensureDevelopmentDemoAccounts = vi.fn(async () => ({
      inserted: 16,
      repaired: 0,
      unchanged: 0
    }));
    const loadDemoAccounts = vi.fn(async () => ({
      ensureDevelopmentDemoAccounts
    }));

    await expect(
      startDevelopmentBackend({ environment, loadServer, loadDemoAccounts })
    ).resolves.toBe(runtime);

    expect(loadServer).toHaveBeenCalledOnce();
    expect(startServer).toHaveBeenCalledOnce();
    expect(loadDemoAccounts).not.toHaveBeenCalled();
    expect(serverDependencies).toMatchObject({
      bindHost: "127.0.0.1",
      developmentDemoAuthorization: {
        databaseName: "lisno_demo",
        bindHost: "127.0.0.1"
      }
    });

    await expect(
      serverDependencies?.prepareDatabase?.({
        mongodbUri: environment.MONGODB_URI
      })
    ).resolves.toBeUndefined();

    expect(loadDemoAccounts).toHaveBeenCalledOnce();
    expect(ensureDevelopmentDemoAccounts).toHaveBeenCalledOnce();
    expect(ensureDevelopmentDemoAccounts).toHaveBeenCalledWith(
      serverDependencies?.developmentDemoAuthorization
    );
  });
});
