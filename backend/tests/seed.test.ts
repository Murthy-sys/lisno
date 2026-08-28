import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEMO_ROLE_ACCOUNTS,
  DEMO_SEED_PASSWORD,
  DEMO_SEED_PASSWORD_HASH,
  assertAuthorizedDemoSeedTarget,
  authorizeDemoSeed,
  loadDemoSeedEnvironment,
  parseSingleHostMongoTarget
} from "../src/seed/config.js";
import { demoSeedData } from "../src/seed/data.js";
import * as seedRunModule from "../src/seed/run.js";
import {
  assertAuthorizedSeedModels,
  runDemoSeedCommand,
  seedMongoDatabase
} from "../src/seed/run.js";

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

function setSeedEnvironment(environment: {
  NODE_ENV?: string;
  ALLOW_DEMO_SEED?: string;
  DEMO_SEED_DATABASE?: string;
  MONGODB_URI: string;
}) {
  for (const key of [
    "NODE_ENV",
    "ALLOW_DEMO_SEED",
    "DEMO_SEED_DATABASE",
    "MONGODB_URI"
  ] as const) {
    restoreEnvironment(key, environment[key]);
  }
}

function fakeSeedModel(order: string[], name: string, db: object) {
  return {
    db,
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

function fakeSeedModels(order: string[] = [], db: object = { name: "lisno_demo" }) {
  const models = {
    user: fakeSeedModel(order, "user", db),
    project: fakeSeedModel(order, "project", db),
    floor: fakeSeedModel(order, "floor", db),
    designStage: fakeSeedModel(order, "design-stage", db),
    task: fakeSeedModel(order, "task", db),
    taskEvent: fakeSeedModel(order, "task-event", db),
    designVersion: fakeSeedModel(order, "design-version", db),
    designVersionSequence: fakeSeedModel(order, "design-version-sequence", db),
    evaluation: fakeSeedModel(order, "evaluation", db),
    auditEvent: fakeSeedModel(order, "audit-event", db),
    accessRequest: fakeSeedModel(order, "access-request", db),
    projectAccessGrant: fakeSeedModel(order, "project-access-grant", db),
    authorizationCoordination: fakeSeedModel(order, "authorization-coordination", db),
    userInvitation: fakeSeedModel(order, "user-invitation", db),
    emailCoordination: fakeSeedModel(order, "email-coordination", db)
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
  const seedModels = fakeSeedModels(order, mongoose.connection);
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

describe("demo seed authorization", () => {
  it("rebuilds the exact authorized collections and invalidates pre-reset invitations", async () => {
    const environment = {
      NODE_ENV: "test",
      ALLOW_DEMO_SEED: "true",
      DEMO_SEED_DATABASE: "lisno_test",
      MONGODB_URI: "mongodb://localhost:27017/lisno_test"
    };
    setSeedEnvironment(environment);
    const authorization = authorizeDemoSeed(environment, environment.MONGODB_URI);
    const originalConnectionName = mongoose.connection.name;
    mongoose.connection.name = environment.DEMO_SEED_DATABASE;
    const deletedModels: string[] = [];
    let preResetTokenAvailable = true;
    let invitationAuditPresent = true;

    vi.spyOn(mongoose.Model, "deleteMany").mockImplementation(async function () {
      deletedModels.push(this.modelName);
      if (this.modelName === "UserInvitation") preResetTokenAvailable = false;
      if (this.modelName === "AuditEvent") invitationAuditPresent = false;
      return {} as never;
    });
    vi.spyOn(mongoose.Model, "bulkWrite").mockResolvedValue({} as never);
    vi.spyOn(mongoose.Model, "insertMany").mockImplementation(async function (documents) {
      if (
        this.modelName === "AuditEvent" &&
        (documents as Array<{ action?: string }>).some(({ action }) =>
          action?.startsWith("user_invitation.")
        )
      ) {
        invitationAuditPresent = true;
      }
      return [] as never;
    });

    try {
      await seedMongoDatabase(authorization);
    } finally {
      mongoose.connection.name = originalConnectionName;
    }

    expect(new Set(deletedModels)).toEqual(
      new Set([
        "User",
        "Project",
        "Floor",
        "DesignStage",
        "Task",
        "TaskEvent",
        "DesignVersion",
        "DesignVersionSequence",
        "Evaluation",
        "AuditEvent",
        "AccessRequest",
        "ProjectAccessGrant",
        "AuthorizationCoordination",
        "UserInvitation",
        "PasswordResetRequest",
        "EmailCoordination"
      ])
    );
    expect(preResetTokenAvailable).toBe(false);
    expect(invitationAuditPresent).toBe(false);
  });

  it("does not let callers redirect the production command with injected dependencies", async () => {
    const environment = {
      NODE_ENV: "development",
      ALLOW_DEMO_SEED: "true",
      DEMO_SEED_DATABASE: "lisno_demo",
      MONGODB_URI: "mongodb://localhost:27017/lisno_demo"
    };
    setSeedEnvironment(environment);
    const harness = commandHarness(environment);
    const injectedCommand = runDemoSeedCommand as unknown as (
      dependencies: object
    ) => Promise<void>;

    await expect(
      injectedCommand({
        loadEnvironment: harness.loadEnvironment,
        loadMongoose: harness.loadMongoose,
        loadModels: harness.loadModels,
        writeOutput: vi.fn()
      })
    ).rejects.toThrow("Demo seed command does not accept dependencies.");

    expect(harness.loadEnvironment).not.toHaveBeenCalled();
    expect(harness.loadMongoose).not.toHaveBeenCalled();
    expect(harness.mongoose.connect).not.toHaveBeenCalled();
    expect(harness.loadModels).not.toHaveBeenCalled();
  });

  it("does not let callers redirect the exported seed helper with injected dependencies", async () => {
    const environment = {
      NODE_ENV: "test",
      ALLOW_DEMO_SEED: "true",
      DEMO_SEED_DATABASE: "lisno_test",
      MONGODB_URI: "mongodb://localhost:27017/lisno_test"
    };
    setSeedEnvironment(environment);
    const authorization = authorizeDemoSeed(environment, environment.MONGODB_URI);
    const harness = commandHarness(environment);
    harness.mongoose.connection.name = environment.DEMO_SEED_DATABASE;
    const injectedSeedHelper = seedMongoDatabase as unknown as (
      capability: typeof authorization,
      dependencies: object
    ) => Promise<void>;

    await expect(
      injectedSeedHelper(authorization, {
        loadMongoose: harness.loadMongoose,
        loadModels: harness.loadModels
      })
    ).rejects.toThrow("Demo seed helper does not accept dependencies.");

    expect(harness.loadMongoose).not.toHaveBeenCalled();
    expect(harness.loadModels).not.toHaveBeenCalled();
  });

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
  ])("rejects %s in the side-effect-free authorization gate", (_label, environment) => {
    setSeedEnvironment(environment);
    expect(() => authorizeDemoSeed(environment, environment.MONGODB_URI)).toThrow();
  });

  it.each([
    ["development localhost demo", { NODE_ENV: "development", ALLOW_DEMO_SEED: "true", DEMO_SEED_DATABASE: "lisno_demo", MONGODB_URI: "mongodb://localhost:27017/lisno_demo?replicaSet=rs0" }],
    ["test IPv4", { NODE_ENV: "test", ALLOW_DEMO_SEED: "true", DEMO_SEED_DATABASE: "lisno_test", MONGODB_URI: "mongodb://127.0.0.1:27017/lisno_test" }],
    ["test IPv6 suffix", { NODE_ENV: "test", ALLOW_DEMO_SEED: "true", DEMO_SEED_DATABASE: "lisno_test_feature-1", MONGODB_URI: "mongodb://[::1]:27017/lisno_test_feature-1" }]
  ])("authorizes exact %s targets without accepting substituted runtime state", (_label, environment) => {
    setSeedEnvironment(environment);
    const authorization = authorizeDemoSeed(environment, environment.MONGODB_URI);
    expect(authorization.databaseName).toBe(environment.DEMO_SEED_DATABASE);
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
    setSeedEnvironment({
      NODE_ENV: "development",
      ALLOW_DEMO_SEED: "true",
      DEMO_SEED_DATABASE: "lisno_demo",
      MONGODB_URI: "mongodb://localhost:27017/lisno_demo"
    });
    const authorization = authorizeDemoSeed(
      {
        NODE_ENV: "development",
        ALLOW_DEMO_SEED: "true",
        DEMO_SEED_DATABASE: "lisno_demo"
      },
      "mongodb://localhost:27017/lisno_demo"
    );

    expect(Object.isFrozen(authorization)).toBe(true);
    const brand = Object.getOwnPropertySymbols(authorization)[0];
    expect(brand).toBeDefined();
    expect(
      Object.getOwnPropertyDescriptor(authorization, brand!)?.enumerable
    ).toBe(false);
    expect(() => {
      (authorization as { databaseName: string }).databaseName = "lisno";
    }).toThrow();
  });

  it("rejects a copied or retargeted authorization capability", () => {
    setSeedEnvironment({
      NODE_ENV: "test",
      ALLOW_DEMO_SEED: "true",
      DEMO_SEED_DATABASE: "lisno_test",
      MONGODB_URI: "mongodb://localhost:27017/lisno_test"
    });
    const authorization = authorizeDemoSeed(
      {
        NODE_ENV: "test",
        ALLOW_DEMO_SEED: "true",
        DEMO_SEED_DATABASE: "lisno_test"
      },
      "mongodb://localhost:27017/lisno_test"
    );
    const brand = Object.getOwnPropertySymbols(authorization)[0]!;
    const copied = Object.defineProperties(
      {},
      Object.getOwnPropertyDescriptors(authorization)
    );
    const retargeted = Object.freeze({
      [brand]: true,
      databaseName: "lisno_demo"
    });
    for (const candidate of [copied, retargeted]) {
      expect(() =>
        assertAuthorizedDemoSeedTarget(
          candidate as never,
          candidate.databaseName
        )
      ).toThrow("Demo seed authorization does not match the connection.");
    }
  });

  it("cannot mint authorization from caller-supplied flags that differ from the process environment", () => {
    setSeedEnvironment({
      NODE_ENV: "production",
      ALLOW_DEMO_SEED: "false",
      DEMO_SEED_DATABASE: "lisno",
      MONGODB_URI: "mongodb://production.example/lisno"
    });

    expect(() =>
      authorizeDemoSeed(
        {
          NODE_ENV: "development",
          ALLOW_DEMO_SEED: "true",
          DEMO_SEED_DATABASE: "lisno_demo"
        },
        "mongodb://localhost:27017/lisno_demo"
      )
    ).toThrow("Demo seed environment does not match the current process.");
  });

  it.each([
    ["missing capability", undefined],
    ["structurally forged capability", { databaseName: "lisno_demo" }]
  ])("rejects %s in the capability gate", (_label, authorization) => {
    expect(() =>
      assertAuthorizedDemoSeedTarget(authorization as never, "lisno_demo")
    ).toThrow("Demo seed authorization does not match the connection.");
  });

  it("rejects a capability when the connected database differs", () => {
    setSeedEnvironment({
      NODE_ENV: "test",
      ALLOW_DEMO_SEED: "true",
      DEMO_SEED_DATABASE: "lisno_test",
      MONGODB_URI: "mongodb://localhost:27017/lisno_test"
    });
    const authorization = authorizeDemoSeed(
      {
        NODE_ENV: "test",
        ALLOW_DEMO_SEED: "true",
        DEMO_SEED_DATABASE: "lisno_test"
      },
      "mongodb://localhost:27017/lisno_test"
    );
    expect(() =>
      assertAuthorizedDemoSeedTarget(authorization, "lisno_demo")
    ).toThrow("Demo seed authorization does not match the connection.");
  });

  it("rejects models from a different connection before any mutation", async () => {
    setSeedEnvironment({
      NODE_ENV: "test",
      ALLOW_DEMO_SEED: "true",
      DEMO_SEED_DATABASE: "lisno_test",
      MONGODB_URI: "mongodb://localhost:27017/lisno_test"
    });
    const authorization = authorizeDemoSeed(
      {
        NODE_ENV: "test",
        ALLOW_DEMO_SEED: "true",
        DEMO_SEED_DATABASE: "lisno_test"
      },
      "mongodb://localhost:27017/lisno_test"
    );
    const connection = { name: "lisno_test" };
    const seedModels = fakeSeedModels([], { name: "lisno_test" });

    expect(() =>
      assertAuthorizedSeedModels(
        authorization,
        connection as never,
        seedModels.models as never
      )
    ).toThrow("Demo seed models do not match the authorized connection.");

    for (const model of seedModels.all) {
      expect(model.deleteMany).not.toHaveBeenCalled();
      expect(model.bulkWrite).not.toHaveBeenCalled();
      expect(model.insertMany).not.toHaveBeenCalled();
    }
  });

  it("does not expose the destructive reset helper from the module", () => {
    expect(seedRunModule).not.toHaveProperty("resetAuthorizedSeedCollections");
    expect(seedRunModule).not.toHaveProperty("loadSeedModels");
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
    expect(demoSeedData.userInvitations).toEqual([]);
  });

  it("marks every explicit seed user as a development demo account", () => {
    expect(demoSeedData.users).toHaveLength(21);
    expect(demoSeedData.users.every(({ accountKind }) => accountKind === "development_demo")).toBe(
      true
    );
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
