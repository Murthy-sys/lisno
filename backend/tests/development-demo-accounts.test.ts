import { compare } from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  authorizeDevelopmentDemoStartup,
  type DevelopmentDemoAuthorization
} from "../src/development/demo-account-authorization.js";
import {
  DEVELOPMENT_DEMO_ACCOUNTS,
  DEVELOPMENT_DEMO_PASSWORD,
  DEVELOPMENT_DEMO_PASSWORD_HASH,
  type DevelopmentDemoAccount
} from "../src/development/demo-account-catalog.js";
import type { ServerDependencies } from "../src/server.js";

const fakes = vi.hoisted(() => {
  const session = { id: "unit-session" };
  const query = {
    select: vi.fn(),
    session: vi.fn(),
    lean: vi.fn(),
    exec: vi.fn()
  };
  query.select.mockReturnValue(query);
  query.session.mockReturnValue(query);
  query.lean.mockReturnValue(query);

  const connection = {
    name: "lisno_demo",
    transaction: vi.fn()
  };
  const userModel = {
    db: connection,
    find: vi.fn(() => query),
    insertMany: vi.fn(),
    updateOne: vi.fn(),
    deleteMany: vi.fn(),
    replaceOne: vi.fn(),
    bulkWrite: vi.fn()
  };
  const projectModel = {
    find: vi.fn(),
    insertMany: vi.fn(),
    updateOne: vi.fn(),
    deleteMany: vi.fn(),
    replaceOne: vi.fn(),
    bulkWrite: vi.fn()
  };
  return { connection, projectModel, query, session, userModel };
});

vi.mock("mongoose", () => ({
  default: { connection: fakes.connection }
}));

vi.mock("../src/models/User.js", () => ({
  UserModel: fakes.userModel
}));

vi.mock("../src/models/Project.js", () => ({
  ProjectModel: fakes.projectModel
}));

import { ensureDevelopmentDemoAccounts } from "../src/development/demo-account-bootstrap.js";
import { startDevelopmentBackend } from "../src/development/start.js";

const DEMO_URI = "mongodb://127.0.0.1:27017/lisno_demo?replicaSet=rs0";
const STARTUP_NOW = new Date("2026-08-18T05:30:00.000Z");
const ORIGINAL_CREATED_AT = new Date("2026-06-01T08:00:00.000Z");
const ORIGINAL_UPDATED_AT = new Date("2026-07-15T08:00:00.000Z");

function authorization(): DevelopmentDemoAuthorization {
  return authorizeDevelopmentDemoStartup(
    { NODE_ENV: "development" },
    DEMO_URI,
    "127.0.0.1"
  );
}

function storedAccount(
  account: DevelopmentDemoAccount,
  overrides: Record<string, unknown> = {}
) {
  return {
    _id: account.id,
    name: account.name,
    email: account.email,
    emailNormalized: account.emailNormalized,
    mobile: null,
    address: null,
    passwordHash: account.passwordHash,
    role: account.role,
    active: account.active,
    accountKind: account.accountKind,
    version: 1,
    managerId: account.managerId,
    authorizedClientIds: [...account.authorizedClientIds],
    title: account.title,
    createdAt: ORIGINAL_CREATED_AT,
    updatedAt: ORIGINAL_UPDATED_AT,
    ...overrides
  };
}

function setStoredRows(rows: readonly Record<string, unknown>[]) {
  fakes.query.exec.mockResolvedValue(rows);
}

function expectNoUserIo() {
  expect(fakes.userModel.find).not.toHaveBeenCalled();
  expect(fakes.userModel.insertMany).not.toHaveBeenCalled();
  expect(fakes.userModel.updateOne).not.toHaveBeenCalled();
  expect(fakes.userModel.deleteMany).not.toHaveBeenCalled();
  expect(fakes.userModel.replaceOne).not.toHaveBeenCalled();
  expect(fakes.userModel.bulkWrite).not.toHaveBeenCalled();
}

function expectNoWrites() {
  expect(fakes.userModel.insertMany).not.toHaveBeenCalled();
  expect(fakes.userModel.updateOne).not.toHaveBeenCalled();
  expect(fakes.userModel.deleteMany).not.toHaveBeenCalled();
  expect(fakes.userModel.replaceOne).not.toHaveBeenCalled();
  expect(fakes.userModel.bulkWrite).not.toHaveBeenCalled();
  expect(
    Object.values(fakes.projectModel).every((spy) => spy.mock.calls.length === 0)
  ).toBe(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.connection.name = "lisno_demo";
  fakes.userModel.db = fakes.connection;
  fakes.query.select.mockReturnValue(fakes.query);
  fakes.query.session.mockReturnValue(fakes.query);
  fakes.query.lean.mockReturnValue(fakes.query);
  fakes.connection.transaction.mockImplementation(async (work) => work(fakes.session));
  fakes.userModel.insertMany.mockResolvedValue([]);
  fakes.userModel.updateOne.mockResolvedValue({
    acknowledged: true,
    matchedCount: 1,
    modifiedCount: 1
  });
  setStoredRows([]);
});

describe("development demo account preparation boundary", () => {
  it("defers the first User access until post-connect preparation runs", async () => {
    let serverDependencies: ServerDependencies | undefined;
    const loadDemoAccounts = vi.fn(async () => ({
      ensureDevelopmentDemoAccounts
    }));

    await startDevelopmentBackend({
      environment: {
        NODE_ENV: "development",
        MONGODB_URI: DEMO_URI,
        JWT_SECRET: "development-demo-secret-with-at-least-32-characters",
        OCR_WORKER_TOKEN:
          "development-demo-worker-token-with-at-least-32-characters"
      },
      loadServer: async () => ({
        startServer: async (dependencies = {}) => {
          serverDependencies = dependencies;
          return { stop: async () => undefined };
        }
      }),
      loadDemoAccounts
    });

    expect(loadDemoAccounts).not.toHaveBeenCalled();
    expectNoUserIo();
    expect(serverDependencies?.prepareDatabase).toBeTypeOf("function");

    await serverDependencies?.prepareDatabase?.({ mongodbUri: DEMO_URI });

    expect(loadDemoAccounts).toHaveBeenCalledOnce();
    expect(fakes.userModel.find).toHaveBeenCalledOnce();
  });

  it("proves the canonical password hash is bcrypt-compatible", async () => {
    await expect(
      compare(DEVELOPMENT_DEMO_PASSWORD, DEVELOPMENT_DEMO_PASSWORD_HASH)
    ).resolves.toBe(true);
  });

  it.each([
    ["missing", undefined],
    ["forged", { databaseName: "lisno_demo", bindHost: "127.0.0.1" }]
  ])("rejects a %s capability before any User read or write", async (_name, capability) => {
    await expect(
      ensureDevelopmentDemoAccounts(capability as DevelopmentDemoAuthorization)
    ).rejects.toThrow("Development demo startup is not authorized.");
    expectNoUserIo();
  });

  it("rejects a wrong connected database before any User read or write", async () => {
    fakes.connection.name = "lisno";

    await expect(ensureDevelopmentDemoAccounts(authorization())).rejects.toThrow(
      "Development demo startup is not authorized."
    );
    expectNoUserIo();
  });

  it("rejects a User model from another connection before any User read or write", async () => {
    fakes.userModel.db = {} as typeof fakes.connection;

    await expect(ensureDevelopmentDemoAccounts(authorization())).rejects.toThrow(
      "Development demo startup is not authorized."
    );
    expectNoUserIo();
  });

  it("inserts all sixteen catalog accounts with one startup clock instant", async () => {
    const clock = vi.fn(() => new Date(STARTUP_NOW));

    await expect(
      ensureDevelopmentDemoAccounts(authorization(), { clock })
    ).resolves.toEqual({ inserted: 16, repaired: 0, unchanged: 0 });

    expect(clock).toHaveBeenCalledTimes(1);
    expect(fakes.connection.transaction).toHaveBeenCalledTimes(1);
    expect(fakes.userModel.find).toHaveBeenCalledWith({
      $or: [
        { _id: { $in: DEVELOPMENT_DEMO_ACCOUNTS.map(({ id }) => id) } },
        {
          emailNormalized: {
            $in: DEVELOPMENT_DEMO_ACCOUNTS.map(({ emailNormalized }) => emailNormalized)
          }
        }
      ]
    });
    expect(fakes.query.select).toHaveBeenCalledWith("+passwordHash");
    expect(fakes.query.session).toHaveBeenCalledWith(fakes.session);

    const [documents, options] = fakes.userModel.insertMany.mock.calls[0];
    expect(options).toEqual({ session: fakes.session, timestamps: false });
    expect(documents).toHaveLength(16);
    expect(documents).toEqual(
      DEVELOPMENT_DEMO_ACCOUNTS.map((account) => ({
        _id: account.id,
        name: account.name,
        email: account.email,
        emailNormalized: account.emailNormalized,
        passwordHash: account.passwordHash,
        role: account.role,
        active: true,
        accountKind: "development_demo",
        version: 1,
        managerId: account.managerId,
        authorizedClientIds: [...account.authorizedClientIds],
        title: account.title,
        createdAt: STARTUP_NOW,
        updatedAt: STARTUP_NOW
      }))
    );
    expect(fakes.userModel.updateOne).not.toHaveBeenCalled();
    expectNoDestructiveOrOtherModelWrites();
  });

  it("uses a bounded fresh User transaction after an E11000 race", async () => {
    const duplicateKeyError = Object.assign(new Error("E11000 duplicate key"), {
      code: 11000
    });
    fakes.connection.transaction
      .mockRejectedValueOnce(duplicateKeyError)
      .mockImplementationOnce(async (work) => work(fakes.session));
    setStoredRows(
      DEVELOPMENT_DEMO_ACCOUNTS.map((account) => storedAccount(account))
    );
    const clock = vi.fn(() => new Date(STARTUP_NOW));

    await expect(
      ensureDevelopmentDemoAccounts(authorization(), { clock })
    ).resolves.toEqual({ inserted: 0, repaired: 0, unchanged: 16 });

    expect(fakes.connection.transaction).toHaveBeenCalledTimes(2);
    expect(fakes.userModel.find).toHaveBeenCalledTimes(1);
    expect(clock).toHaveBeenCalledTimes(1);
    expectNoWrites();
  });

  it("repairs only catalog-owned fields with version CAS and preserves creation time", async () => {
    const target = DEVELOPMENT_DEMO_ACCOUNTS[3];
    const rows = DEVELOPMENT_DEMO_ACCOUNTS.map((account) => storedAccount(account));
    rows[3] = storedAccount(target, {
      name: "Legacy Name",
      email: "legacy-visible@example.com",
      passwordHash: "legacy-hash",
      role: "client",
      active: false,
      accountKind: "standard",
      title: "Legacy Title",
      managerId: null,
      authorizedClientIds: ["legacy-client"],
      version: 7,
      mobile: "9999999999",
      address: "Preserved address",
      legacyPreference: { theme: "violet" }
    });
    setStoredRows(rows);
    const clock = vi.fn(() => new Date(STARTUP_NOW));

    await expect(
      ensureDevelopmentDemoAccounts(authorization(), { clock })
    ).resolves.toEqual({ inserted: 0, repaired: 1, unchanged: 15 });

    expect(fakes.userModel.updateOne).toHaveBeenCalledTimes(1);
    expect(fakes.userModel.updateOne).toHaveBeenCalledWith(
      {
        _id: target.id,
        emailNormalized: target.emailNormalized,
        version: 7
      },
      {
        $set: {
          name: target.name,
          email: target.email,
          emailNormalized: target.emailNormalized,
          passwordHash: target.passwordHash,
          role: target.role,
          active: target.active,
          accountKind: target.accountKind,
          title: target.title,
          managerId: target.managerId,
          authorizedClientIds: [...target.authorizedClientIds],
          updatedAt: STARTUP_NOW
        },
        $inc: { version: 1 }
      },
      { session: fakes.session, timestamps: false }
    );
    expect(fakes.userModel.insertMany).not.toHaveBeenCalled();
    expect(clock).toHaveBeenCalledTimes(1);
    expectNoDestructiveOrOtherModelWrites();
  });

  it("keeps canonical rows byte-identical and performs no write", async () => {
    const rows = DEVELOPMENT_DEMO_ACCOUNTS.map((account) => storedAccount(account));
    const before = structuredClone(rows);
    setStoredRows(rows);

    await expect(
      ensureDevelopmentDemoAccounts(authorization(), { clock: () => new Date(STARTUP_NOW) })
    ).resolves.toEqual({ inserted: 0, repaired: 0, unchanged: 16 });

    expect(rows).toEqual(before);
    expectNoWrites();
  });

  it.each([
    [
      "reserved ID belongs to another email",
      [
        {
          ...storedAccount(DEVELOPMENT_DEMO_ACCOUNTS[15]),
          emailNormalized: "someone-else@example.com"
        }
      ]
    ],
    [
      "reserved email belongs to another ID",
      [{ ...storedAccount(DEVELOPMENT_DEMO_ACCOUNTS[15]), _id: "user-someone-else" }]
    ],
    [
      "two reserved records cross IDs and emails",
      [
        {
          ...storedAccount(DEVELOPMENT_DEMO_ACCOUNTS[14]),
          emailNormalized: DEVELOPMENT_DEMO_ACCOUNTS[15].emailNormalized
        },
        {
          ...storedAccount(DEVELOPMENT_DEMO_ACCOUNTS[15]),
          emailNormalized: DEVELOPMENT_DEMO_ACCOUNTS[14].emailNormalized
        }
      ]
    ]
  ])(
    "preflights the complete set and makes zero writes when %s",
    async (_name, rows) => {
      setStoredRows(rows);

      await expect(
        ensureDevelopmentDemoAccounts(authorization())
      ).rejects.toThrow("Development demo account collision");

      expect(fakes.userModel.find).toHaveBeenCalledTimes(1);
      expectNoWrites();
    }
  );
});

function expectNoDestructiveOrOtherModelWrites() {
  expect(fakes.userModel.deleteMany).not.toHaveBeenCalled();
  expect(fakes.userModel.replaceOne).not.toHaveBeenCalled();
  expect(fakes.userModel.bulkWrite).not.toHaveBeenCalled();
  expect(
    Object.values(fakes.projectModel).every((spy) => spy.mock.calls.length === 0)
  ).toBe(true);
}
