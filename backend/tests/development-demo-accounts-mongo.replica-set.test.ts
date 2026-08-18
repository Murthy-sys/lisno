import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ensureDevelopmentDemoAccounts } from "../src/development/demo-account-bootstrap.js";
import {
  authorizeDevelopmentDemoStartup,
  type DevelopmentDemoAuthorization
} from "../src/development/demo-account-authorization.js";
import { DEVELOPMENT_DEMO_ACCOUNTS } from "../src/development/demo-account-catalog.js";
import { ProjectModel } from "../src/models/Project.js";
import { UserModel } from "../src/models/User.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const STARTUP_NOW = new Date("2026-08-18T06:00:00.000Z");
const CREATED_AT = new Date("2026-06-01T08:00:00.000Z");
const PREVIOUS_UPDATED_AT = new Date("2026-07-15T08:00:00.000Z");

let replica: Awaited<ReturnType<typeof startMongoReplicaSet>>;
let capability: DevelopmentDemoAuthorization;

beforeAll(async () => {
  replica = await startMongoReplicaSet("lisno_demo");
  await Promise.all([UserModel.syncIndexes(), ProjectModel.syncIndexes()]);
  capability = authorizeDevelopmentDemoStartup(
    { NODE_ENV: "development" },
    replica.uri,
    "127.0.0.1"
  );
}, 120_000);

beforeEach(async () => {
  await replica.clear();
});

afterAll(async () => {
  await replica.stop();
});

describe("development demo account preparation on Mongo replica set", () => {
  it("repairs and inserts transactionally without changing unrelated User or Project data", async () => {
    const target = DEVELOPMENT_DEMO_ACCOUNTS[3];
    await UserModel.collection.insertMany([
      unrelatedUser(),
      {
        _id: target.id,
        name: "Legacy Designer",
        email: "legacy-visible@example.com",
        emailNormalized: target.emailNormalized,
        mobile: "9999999999",
        address: "Preserve this address",
        passwordHash: "legacy-password-hash",
        role: "client",
        active: false,
        accountKind: "standard",
        version: 4,
        managerId: null,
        authorizedClientIds: ["legacy-client"],
        title: "Legacy title",
        legacyPreference: { theme: "violet", density: 2 },
        createdAt: CREATED_AT,
        updatedAt: PREVIOUS_UPDATED_AT
      }
    ]);
    await ProjectModel.collection.insertOne(unrelatedProject());
    const unrelatedUserBefore = await UserModel.collection.findOne({
      _id: "user-unrelated"
    });
    const unrelatedProjectBefore = await ProjectModel.collection.findOne({
      _id: "project-unrelated"
    });

    await expect(
      ensureDevelopmentDemoAccounts(capability, { clock: () => new Date(STARTUP_NOW) })
    ).resolves.toEqual({ inserted: 15, repaired: 1, unchanged: 0 });

    const reserved = await UserModel.find({
      _id: { $in: DEVELOPMENT_DEMO_ACCOUNTS.map(({ id }) => id) }
    })
      .select("+passwordHash")
      .lean()
      .exec();
    expect(reserved).toHaveLength(16);
    expect(new Set(reserved.map(({ _id }) => _id)).size).toBe(16);
    expect(new Set(reserved.map(({ emailNormalized }) => emailNormalized)).size).toBe(
      16
    );

    for (const account of DEVELOPMENT_DEMO_ACCOUNTS) {
      expect(reserved.find(({ _id }) => _id === account.id)).toMatchObject({
        _id: account.id,
        name: account.name,
        email: account.email,
        emailNormalized: account.emailNormalized,
        passwordHash: account.passwordHash,
        role: account.role,
        active: account.active,
        accountKind: account.accountKind,
        managerId: account.managerId,
        authorizedClientIds: [...account.authorizedClientIds],
        title: account.title
      });
    }

    const repaired = await UserModel.collection.findOne({ _id: target.id });
    expect(repaired).toMatchObject({
      version: 5,
      mobile: "9999999999",
      address: "Preserve this address",
      legacyPreference: { theme: "violet", density: 2 },
      createdAt: CREATED_AT,
      updatedAt: STARTUP_NOW
    });
    const inserted = await UserModel.collection.findOne({
      _id: DEVELOPMENT_DEMO_ACCOUNTS[0].id
    });
    expect(inserted).toMatchObject({
      version: 1,
      createdAt: STARTUP_NOW,
      updatedAt: STARTUP_NOW
    });
    expect(
      await UserModel.collection.findOne({ _id: "user-unrelated" })
    ).toEqual(unrelatedUserBefore);
    expect(
      await ProjectModel.collection.findOne({ _id: "project-unrelated" })
    ).toEqual(unrelatedProjectBefore);

    const canonicalBeforeSecondRun = await UserModel.collection
      .find({ _id: { $in: DEVELOPMENT_DEMO_ACCOUNTS.map(({ id }) => id) } })
      .sort({ _id: 1 })
      .toArray();
    await expect(
      ensureDevelopmentDemoAccounts(capability, {
        clock: () => new Date("2026-08-18T07:00:00.000Z")
      })
    ).resolves.toEqual({ inserted: 0, repaired: 0, unchanged: 16 });
    const canonicalAfterSecondRun = await UserModel.collection
      .find({ _id: { $in: DEVELOPMENT_DEMO_ACCOUNTS.map(({ id }) => id) } })
      .sort({ _id: 1 })
      .toArray();
    expect(canonicalAfterSecondRun).toEqual(canonicalBeforeSecondRun);
    expect(
      await UserModel.collection.findOne({ _id: "user-unrelated" })
    ).toEqual(unrelatedUserBefore);
    expect(
      await ProjectModel.collection.findOne({ _id: "project-unrelated" })
    ).toEqual(unrelatedProjectBefore);
  });

  it("converges two concurrent preparations without duplicate IDs or emails", async () => {
    const results = await Promise.all([
      ensureDevelopmentDemoAccounts(capability, { clock: () => new Date(STARTUP_NOW) }),
      ensureDevelopmentDemoAccounts(capability, {
        clock: () => new Date("2026-08-18T06:00:01.000Z")
      })
    ]);

    const stored = await UserModel.find({
      $or: [
        { _id: { $in: DEVELOPMENT_DEMO_ACCOUNTS.map(({ id }) => id) } },
        {
          emailNormalized: {
            $in: DEVELOPMENT_DEMO_ACCOUNTS.map(({ emailNormalized }) => emailNormalized)
          }
        }
      ]
    })
      .lean()
      .exec();
    expect(stored).toHaveLength(16);
    expect(new Set(stored.map(({ _id }) => _id)).size).toBe(16);
    expect(new Set(stored.map(({ emailNormalized }) => emailNormalized)).size).toBe(
      16
    );
    expect(results.reduce((sum, result) => sum + result.inserted, 0)).toBe(16);
    expect(results.reduce((sum, result) => sum + result.unchanged, 0)).toBe(16);
    expect(
      await UserModel.collection.countDocuments({
        _id: { $nin: DEVELOPMENT_DEMO_ACCOUNTS.map(({ id }) => id) }
      })
    ).toBe(0);
    expect(await ProjectModel.collection.countDocuments()).toBe(0);
  });

  it("rolls back every insert when preflight finds a collision", async () => {
    const colliding = unrelatedUser({
      _id: "user-email-owner",
      email: DEVELOPMENT_DEMO_ACCOUNTS[0].email,
      emailNormalized: DEVELOPMENT_DEMO_ACCOUNTS[0].emailNormalized
    });
    await UserModel.collection.insertOne(colliding);
    const before = await UserModel.collection.findOne({ _id: colliding._id });

    await expect(ensureDevelopmentDemoAccounts(capability)).rejects.toThrow(
      "Development demo account collision"
    );

    expect(await UserModel.collection.countDocuments()).toBe(1);
    expect(await UserModel.collection.findOne({ _id: colliding._id })).toEqual(before);
    expect(await ProjectModel.collection.countDocuments()).toBe(0);
  });
});

function unrelatedUser(overrides: Record<string, unknown> = {}) {
  return {
    _id: "user-unrelated",
    name: "Unrelated User",
    email: "unrelated@example.com",
    emailNormalized: "unrelated@example.com",
    mobile: "8888888888",
    address: "Unrelated address",
    passwordHash: "unrelated-password-hash",
    role: "designer",
    active: true,
    accountKind: "standard",
    version: 9,
    managerId: null,
    authorizedClientIds: [],
    title: "Unrelated title",
    arbitraryData: { keep: true },
    createdAt: CREATED_AT,
    updatedAt: PREVIOUS_UPDATED_AT,
    ...overrides
  };
}

function unrelatedProject() {
  return {
    _id: "project-unrelated",
    name: "Unrelated Project",
    clientId: null,
    clientName: "Independent Client",
    clientEmail: "independent@example.com",
    clientEmailNormalized: "independent@example.com",
    clientMobile: "7777777777",
    clientAddress: "Independent address",
    initiatingDesignerId: "user-unrelated",
    assignedDesignerIds: ["user-unrelated"],
    managerId: "user-unrelated",
    status: "active",
    location: "Pune",
    plannedStartAt: CREATED_AT,
    plannedEndAt: new Date("2026-12-01T08:00:00.000Z"),
    actualStartAt: null,
    actualEndAt: null,
    arbitraryData: { keep: true },
    createdAt: CREATED_AT,
    updatedAt: PREVIOUS_UPDATED_AT
  };
}
