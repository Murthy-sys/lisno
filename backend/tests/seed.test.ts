import bcrypt from "bcryptjs";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEMO_ROLE_ACCOUNTS,
  DEMO_SEED_PASSWORD,
  DEMO_SEED_PASSWORD_HASH,
  authorizeDemoSeed,
  loadDemoSeedEnvironment,
  parseSingleHostMongoTarget
} from "../src/seed/config.js";
import { demoSeedData } from "../src/seed/data.js";
import { runDemoSeedCommand, seedMongoDatabase } from "../src/seed/run.js";

const originalEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  ALLOW_DEMO_SEED: process.env.ALLOW_DEMO_SEED,
  DEMO_SEED_DATABASE: process.env.DEMO_SEED_DATABASE,
  MONGODB_URI: process.env.MONGODB_URI
};

afterEach(() => {
  vi.restoreAllMocks();
  restoreEnvironment("NODE_ENV", originalEnvironment.NODE_ENV);
  restoreEnvironment("ALLOW_DEMO_SEED", originalEnvironment.ALLOW_DEMO_SEED);
  restoreEnvironment("DEMO_SEED_DATABASE", originalEnvironment.DEMO_SEED_DATABASE);
  restoreEnvironment("MONGODB_URI", originalEnvironment.MONGODB_URI);
});

function restoreEnvironment(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function fakeSeedModel(order: string[], name: string) {
  return {
    deleteMany: vi.fn(async () => {
      order.push(`delete:${name}`);
      return {};
    }),
    bulkWrite: vi.fn(async () => {
      order.push(`bulk:${name}`);
      return {};
    }),
    insertMany: vi.fn(async () => {
      order.push(`insert:${name}`);
      return [];
    })
  };
}

function fakeSeedModels(order: string[] = []) {
  const models = {
    user: fakeSeedModel(order, "user"),
    project: fakeSeedModel(order, "project"),
    floor: fakeSeedModel(order, "floor"),
    designStage: fakeSeedModel(order, "design-stage"),
    task: fakeSeedModel(order, "task"),
    taskEvent: fakeSeedModel(order, "task-event"),
    designVersion: fakeSeedModel(order, "design-version"),
    designVersionSequence: fakeSeedModel(order, "design-version-sequence"),
    evaluation: fakeSeedModel(order, "evaluation"),
    auditEvent: fakeSeedModel(order, "audit-event"),
    accessRequest: fakeSeedModel(order, "access-request"),
    projectAccessGrant: fakeSeedModel(order, "project-access-grant"),
    authorizationCoordination: fakeSeedModel(order, "authorization-coordination")
  };
  return {
    models,
    all: Object.values(models)
  };
}

function commandHarness(input: {
  NODE_ENV?: string;
  ALLOW_DEMO_SEED?: string;
  DEMO_SEED_DATABASE?: string;
  MONGODB_URI: string;
}) {
  const order: string[] = [];
  const seedModels = fakeSeedModels(order);
  const loadEnvironment = vi.fn(() => input);
  const mongoose = {
    connection: { name: "" },
    connect: vi.fn(async (uri: string) => {
      order.push("connect");
      mongoose.connection.name = decodeURIComponent(new URL(uri).pathname.slice(1));
    }),
    disconnect: vi.fn(async () => {
      order.push("disconnect");
    })
  };
  const loadMongoose = vi.fn(async () => mongoose);
  const loadModels = vi.fn(async () => {
    order.push("load-models");
    return seedModels.models;
  });
  return {
    loadEnvironment,
    mongoose,
    loadMongoose,
    loadModels,
    order,
    ...seedModels
  };
}

function expectNoDatabaseSideEffects(
  harness: ReturnType<typeof commandHarness>
) {
  expect(harness.loadEnvironment).toHaveBeenCalledOnce();
  expect(harness.loadMongoose).not.toHaveBeenCalled();
  expect(harness.mongoose.connect).not.toHaveBeenCalled();
  expect(harness.loadModels).not.toHaveBeenCalled();
  for (const model of harness.all) {
    expect(model.deleteMany).not.toHaveBeenCalled();
    expect(model.bulkWrite).not.toHaveBeenCalled();
    expect(model.insertMany).not.toHaveBeenCalled();
  }
}

describe("demo seed authorization", () => {
  it.each([
    ["production with opt-in", { NODE_ENV: "production", ALLOW_DEMO_SEED: "true", DEMO_SEED_DATABASE: "lisno_demo", MONGODB_URI: "mongodb://127.0.0.1:27017/lisno_demo" }],
    ["development without opt-in", { NODE_ENV: "development", DEMO_SEED_DATABASE: "lisno_demo", MONGODB_URI: "mongodb://127.0.0.1:27017/lisno_demo" }],
    ["uppercase opt-in", { NODE_ENV: "test", ALLOW_DEMO_SEED: "TRUE", DEMO_SEED_DATABASE: "lisno_test", MONGODB_URI: "mongodb://127.0.0.1:27017/lisno_test" }],
    ["numeric opt-in", { NODE_ENV: "test", ALLOW_DEMO_SEED: "1", DEMO_SEED_DATABASE: "lisno_test", MONGODB_URI: "mongodb://127.0.0.1:27017/lisno_test" }],
    ["empty opt-in", { NODE_ENV: "test", ALLOW_DEMO_SEED: "", DEMO_SEED_DATABASE: "lisno_test", MONGODB_URI: "mongodb://127.0.0.1:27017/lisno_test" }],
    ["whitespace opt-in", { NODE_ENV: "test", ALLOW_DEMO_SEED: " true ", DEMO_SEED_DATABASE: "lisno_test", MONGODB_URI: "mongodb://127.0.0.1:27017/lisno_test" }],
    ["missing runtime", { ALLOW_DEMO_SEED: "true", DEMO_SEED_DATABASE: "lisno_test", MONGODB_URI: "mongodb://127.0.0.1:27017/lisno_test" }],
    ["remote host", { NODE_ENV: "development", ALLOW_DEMO_SEED: "true", DEMO_SEED_DATABASE: "lisno_demo", MONGODB_URI: "mongodb://db.example.com:27017/lisno_demo" }],
    ["SRV target", { NODE_ENV: "development", ALLOW_DEMO_SEED: "true", DEMO_SEED_DATABASE: "lisno_demo", MONGODB_URI: "mongodb+srv://localhost/lisno_demo" }],
    ["production-like database", { NODE_ENV: "development", ALLOW_DEMO_SEED: "true", DEMO_SEED_DATABASE: "lisno", MONGODB_URI: "mongodb://localhost:27017/lisno" }],
    ["different URI database", { NODE_ENV: "development", ALLOW_DEMO_SEED: "true", DEMO_SEED_DATABASE: "lisno_demo", MONGODB_URI: "mongodb://localhost:27017/lisno_test" }],
    ["missing database", { NODE_ENV: "development", ALLOW_DEMO_SEED: "true", DEMO_SEED_DATABASE: "lisno_demo", MONGODB_URI: "mongodb://localhost:27017" }],
    ["multi-host target", { NODE_ENV: "development", ALLOW_DEMO_SEED: "true", DEMO_SEED_DATABASE: "lisno_demo", MONGODB_URI: "mongodb://localhost,127.0.0.1/lisno_demo" }],
    ["malformed target", { NODE_ENV: "development", ALLOW_DEMO_SEED: "true", DEMO_SEED_DATABASE: "lisno_demo", MONGODB_URI: "not-a-mongo-uri" }]
  ])("rejects %s before connection, model loading, or mutation", async (_label, environment) => {
    const harness = commandHarness(environment);

    await expect(
      runDemoSeedCommand({
        loadEnvironment: harness.loadEnvironment,
        loadMongoose: harness.loadMongoose,
        loadModels: harness.loadModels,
        writeOutput: vi.fn()
      })
    ).rejects.toThrow();

    expectNoDatabaseSideEffects(harness);
  });

  it.each([
    ["development localhost demo", { NODE_ENV: "development", ALLOW_DEMO_SEED: "true", DEMO_SEED_DATABASE: "lisno_demo", MONGODB_URI: "mongodb://localhost:27017/lisno_demo?replicaSet=rs0" }],
    ["test IPv4", { NODE_ENV: "test", ALLOW_DEMO_SEED: "true", DEMO_SEED_DATABASE: "lisno_test", MONGODB_URI: "mongodb://127.0.0.1:27017/lisno_test" }],
    ["test IPv6 suffix", { NODE_ENV: "test", ALLOW_DEMO_SEED: "true", DEMO_SEED_DATABASE: "lisno_test_feature-1", MONGODB_URI: "mongodb://[::1]:27017/lisno_test_feature-1" }]
  ])("authorizes %s and resets only after connecting", async (_label, environment) => {
    const harness = commandHarness(environment);

    await runDemoSeedCommand({
      loadEnvironment: harness.loadEnvironment,
      loadMongoose: harness.loadMongoose,
      loadModels: harness.loadModels,
      writeOutput: vi.fn()
    });

    expect(harness.loadEnvironment).toHaveBeenCalledOnce();
    expect(harness.loadMongoose).toHaveBeenCalledOnce();
    expect(harness.mongoose.connect).toHaveBeenCalledWith(environment.MONGODB_URI);
    expect(harness.loadModels).toHaveBeenCalledOnce();
    expect(harness.order.indexOf("connect")).toBeLessThan(
      harness.order.indexOf("load-models")
    );
    expect(harness.order.indexOf("load-models")).toBeLessThan(
      harness.order.findIndex((entry) => entry.startsWith("delete:"))
    );
    for (const model of harness.all) {
      expect(model.deleteMany).toHaveBeenCalledOnce();
      expect(model.deleteMany).toHaveBeenCalledWith({});
    }
    expect(harness.mongoose.disconnect).toHaveBeenCalledOnce();
  });

  it("honors shell values when loading the seed environment", () => {
    process.env.NODE_ENV = "test";
    process.env.ALLOW_DEMO_SEED = "true";
    process.env.DEMO_SEED_DATABASE = "lisno_test_shell";
    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/lisno_test_shell";

    expect(loadDemoSeedEnvironment()).toEqual({
      NODE_ENV: "test",
      ALLOW_DEMO_SEED: "true",
      DEMO_SEED_DATABASE: "lisno_test_shell",
      MONGODB_URI: "mongodb://127.0.0.1:27017/lisno_test_shell"
    });
  });

  it.each([
    "mongodb+srv://localhost/lisno_demo",
    "mongodb://localhost",
    "mongodb://localhost,127.0.0.1/lisno_demo",
    "not-a-mongo-uri"
  ])("rejects invalid single-host target %s", (uri) => {
    expect(() => parseSingleHostMongoTarget(uri)).toThrow();
  });

  it("mints a frozen private-brand capability", () => {
    const authorization = authorizeDemoSeed(
      {
        NODE_ENV: "development",
        ALLOW_DEMO_SEED: "true",
        DEMO_SEED_DATABASE: "lisno_demo"
      },
      "mongodb://localhost:27017/lisno_demo"
    );

    expect(Object.isFrozen(authorization)).toBe(true);
    expect(() => {
      (authorization as { databaseName: string }).databaseName = "lisno";
    }).toThrow();
  });

  it.each([
    ["missing capability", undefined],
    ["structurally forged capability", { databaseName: "lisno_demo" }]
  ])("rejects direct seed helper invocation with %s before model loading", async (_label, authorization) => {
    const seedModels = fakeSeedModels();
    const loadModels = vi.fn(async () => seedModels.models);

    await expect(
      seedMongoDatabase(authorization as never, {
        loadMongoose: async () => ({ connection: { name: "lisno_demo" } }),
        loadModels
      })
    ).rejects.toThrow("Demo seed authorization does not match the connection.");

    expect(loadModels).not.toHaveBeenCalled();
    for (const model of seedModels.all) {
      expect(model.deleteMany).not.toHaveBeenCalled();
      expect(model.bulkWrite).not.toHaveBeenCalled();
      expect(model.insertMany).not.toHaveBeenCalled();
    }
  });

  it("rejects a capability when the connected database differs before model loading", async () => {
    const authorization = authorizeDemoSeed(
      {
        NODE_ENV: "test",
        ALLOW_DEMO_SEED: "true",
        DEMO_SEED_DATABASE: "lisno_test"
      },
      "mongodb://localhost:27017/lisno_test"
    );
    const loadModels = vi.fn();

    await expect(
      seedMongoDatabase(authorization, {
        loadMongoose: async () => ({ connection: { name: "lisno_demo" } }),
        loadModels
      })
    ).rejects.toThrow("Demo seed authorization does not match the connection.");
    expect(loadModels).not.toHaveBeenCalled();
  });
});

describe("deterministic demo seed", () => {
  it("contains exactly one active account for every approved new role", () => {
    const expected = [
      ["super_admin", "user-super-admin", "super-admin@lisno.example"],
      ["admin", "user-admin", "admin@lisno.example"],
      ["procurement", "user-procurement", "procurement@lisno.example"],
      ["finance_head", "user-finance-head", "finance-head@lisno.example"],
      ["site_manager", "user-site-manager", "site-manager@lisno.example"],
      ["worker_electrician", "user-worker-electrician", "worker-electrician@lisno.example"],
      ["worker_plumber", "user-worker-plumber", "worker-plumber@lisno.example"],
      ["worker_carpenter", "user-worker-carpenter", "worker-carpenter@lisno.example"],
      ["worker_painter", "user-worker-painter", "worker-painter@lisno.example"],
      ["worker_civil", "user-worker-civil", "worker-civil@lisno.example"],
      ["worker_other", "user-worker-other", "worker-other@lisno.example"]
    ] as const;

    expect(DEMO_ROLE_ACCOUNTS).toHaveLength(expected.length);
    for (const [role, id, email] of expected) {
      const users = demoSeedData.users.filter((user) => user.role === role);
      expect(users).toHaveLength(1);
      expect(users[0]).toMatchObject({ id, email, active: true, version: 1 });
      expect(users[0]?.passwordHash).toBe(DEMO_SEED_PASSWORD_HASH);
    }
    expect(demoSeedData.accessRequests).toEqual([]);
    expect(demoSeedData.projectAccessGrants).toEqual([]);
  });

  it("uses a configured hash compatible with the documented local password", async () => {
    expect(DEMO_SEED_PASSWORD).toBe("LisnoDemo2026!");
    await expect(
      bcrypt.compare(DEMO_SEED_PASSWORD, DEMO_SEED_PASSWORD_HASH)
    ).resolves.toBe(true);
  });

  it("preserves normalized client identity and existing project relationships", () => {
    expect(demoSeedData.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "user-client-aurora",
          emailNormalized: "client@aurora.example"
        })
      ])
    );
    expect(demoSeedData.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "project-aurora-villa",
          clientId: "user-client-aurora",
          clientEmailNormalized: "client@aurora.example"
        })
      ])
    );
    expect(demoSeedData.estimateResponsibilities).toEqual([]);
  });
});
