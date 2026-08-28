import { createHash } from "node:crypto";

import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { isReservedDevelopmentDemoIdentity } from "../src/domain/demo-identities.js";
import { TaskModel } from "../src/models/Task.js";
import { UserModel } from "../src/models/User.js";
import {
  PRODUCTION_SUPER_ADMIN_TARGET,
  PRODUCTION_SUPER_ADMIN_MAINTENANCE_CONFIRMATION,
  ProductionSuperAdminBootstrapError,
  parseProductionSuperAdminBootstrapConfig,
  runProductionSuperAdminBootstrap,
  runProductionSuperAdminBootstrapCommand
} from "../src/operations/production-super-admin-bootstrap.js";
import { createMongoRepository } from "../src/repositories/mongo.js";
import { createAuthService } from "../src/services/auth.service.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const SYNTHETIC_URI =
  "mongodb+srv://bootstrap-operator:synthetic-secret@bootstrap.invalid/lisno?retryWrites=true";
const SYNTHETIC_NAME = "Synthetic Production Owner";
const SYNTHETIC_EMAIL = "Owner@bootstrap.test";
const SYNTHETIC_PASSWORD = "SyntheticPassword!2048";
const SYNTHETIC_APPROVAL_KEY = "synthetic-approval-key-that-is-longer-than-32-characters";
const AUTH_SECRET = "synthetic-auth-secret-that-is-at-least-32-characters";
const SYNTHETIC_TARGET_FINGERPRINT = createHash("sha256")
  .update("bootstrap.invalid|lisno", "utf8")
  .digest("hex");

const LEGACY_ID = "user-designer-ananya";
const LEGACY_NAME = "Synthetic Reserved Designer";
const LEGACY_EMAIL = "ananya@lisno.example";
const LEGACY_PASSWORD = "SyntheticLegacyPassword!1024";
const LEGACY_PASSWORD_HASH = bcrypt.hashSync(LEGACY_PASSWORD, 10);
const LEGACY_CREATED_AT = new Date("2026-01-02T03:04:05.000Z");
const LEGACY_UPDATED_AT = new Date("2026-02-03T04:05:06.000Z");
const ACTIVE_TASK_IDS = Array.from({ length: 5 }, (_, index) =>
  `synthetic-active-task-${index + 1}`
);
const SYNTHETIC_LEGACY_BASELINE_FINGERPRINT = legacyBaselineFingerprint();
const PRIVATE_FIXTURE_VALUES = [
  SYNTHETIC_NAME,
  SYNTHETIC_EMAIL,
  SYNTHETIC_PASSWORD,
  SYNTHETIC_APPROVAL_KEY,
  SYNTHETIC_URI,
  "bootstrap.invalid",
  LEGACY_ID,
  LEGACY_NAME,
  LEGACY_EMAIL,
  LEGACY_PASSWORD,
  LEGACY_PASSWORD_HASH,
  SYNTHETIC_LEGACY_BASELINE_FINGERPRINT,
  ...ACTIVE_TASK_IDS
];

let replicaSet: Awaited<ReturnType<typeof startMongoReplicaSet>>;

function environment(
  overrides: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  return {
    MONGODB_URI: SYNTHETIC_URI,
    PRODUCTION_SUPER_ADMIN_TARGET,
    PRODUCTION_SUPER_ADMIN_TARGET_FINGERPRINT: SYNTHETIC_TARGET_FINGERPRINT,
    PRODUCTION_SUPER_ADMIN_MAINTENANCE_CONFIRMATION,
    PRODUCTION_SUPER_ADMIN_LEGACY_BASELINE_FINGERPRINT:
      SYNTHETIC_LEGACY_BASELINE_FINGERPRINT,
    PRODUCTION_SUPER_ADMIN_NAME: `  ${SYNTHETIC_NAME}  `,
    PRODUCTION_SUPER_ADMIN_EMAIL: `  ${SYNTHETIC_EMAIL}  `,
    PRODUCTION_SUPER_ADMIN_PASSWORD: SYNTHETIC_PASSWORD,
    PRODUCTION_SUPER_ADMIN_APPROVAL_KEY: SYNTHETIC_APPROVAL_KEY,
    ...overrides
  };
}

function config(
  write = false,
  overrides: Record<string, string | undefined> = {}
) {
  return parseProductionSuperAdminBootstrapConfig({
    argv: write ? ["--write"] : [],
    environment: environment(overrides)
  });
}

async function expectBootstrapError(
  operation: Promise<unknown> | (() => unknown),
  code:
    | ProductionSuperAdminBootstrapError["code"]
    | readonly ProductionSuperAdminBootstrapError["code"][]
): Promise<ProductionSuperAdminBootstrapError> {
  try {
    if (typeof operation === "function") operation();
    else await operation;
    throw new Error("Expected bootstrap operation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(ProductionSuperAdminBootstrapError);
    const bootstrapError = error as ProductionSuperAdminBootstrapError;
    const expectedCodes: readonly ProductionSuperAdminBootstrapError["code"][] =
      typeof code === "string" ? [code] : code;
    expect(expectedCodes).toContain(bootstrapError.code);
    assertRedacted(String(error));
    return bootstrapError;
  }
}

function assertRedacted(value: string): void {
  for (const privateValue of PRIVATE_FIXTURE_VALUES) {
    expect(value).not.toContain(privateValue);
  }
}

function legacyUserDocument(overrides: Record<string, unknown> = {}) {
  return {
    _id: LEGACY_ID,
    name: LEGACY_NAME,
    email: LEGACY_EMAIL,
    emailNormalized: LEGACY_EMAIL,
    mobile: "0000000000",
    address: "Synthetic address",
    passwordHash: LEGACY_PASSWORD_HASH,
    role: "designer",
    active: true,
    managerId: null,
    authorizedClientIds: ["synthetic-client-reference"],
    avatar: "opaque-synthetic-avatar-reference",
    title: "Synthetic Legacy Designer",
    createdAt: LEGACY_CREATED_AT,
    updatedAt: LEGACY_UPDATED_AT,
    ...overrides
  };
}

function legacyBaselineFingerprint(
  user: Record<string, unknown> = legacyUserDocument(),
  activeTaskIds: string[] = ACTIVE_TASK_IDS
): string {
  const stableLegacyIdentity = { ...user };
  for (const field of ["active", "accountKind", "version", "updatedAt"]) {
    delete stableLegacyIdentity[field];
  }
  return createHash("sha256")
    .update(stableSerialize({ stableLegacyIdentity, activeTaskIds }), "utf8")
    .digest("hex");
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Buffer.isBuffer(value)) return { $buffer: value.toString("hex") };
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown> & {
      toHexString?: () => string;
    };
    if (typeof candidate.toHexString === "function") {
      return { $hex: candidate.toHexString() };
    }
    return Object.fromEntries(
      Object.keys(candidate)
        .sort((left, right) => left.localeCompare(right))
        .map((key) => [key, canonicalValue(candidate[key])])
    );
  }
  return value;
}

function activeTaskDocument(id: string, index: number, ownerId = LEGACY_ID) {
  const plannedStartAt = new Date(
    `2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`
  );
  const currentDeadlineAt = new Date(
    `2026-04-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`
  );
  return {
    _id: id,
    projectId: "synthetic-project",
    floorId: "synthetic-floor",
    stageId: "synthetic-stage",
    title: `Synthetic active responsibility ${index + 1}`,
    description: "Synthetic baseline task",
    order: index,
    ownerId,
    plannedStartAt,
    originalDeadlineAt: currentDeadlineAt,
    currentDeadlineAt,
    plannedEffort: null,
    progress: index * 10,
    status: index === 0 ? "in_progress" : "not_started",
    completedAt: null,
    dependencyTaskIds: [],
    latestUpdateAt: null,
    approvalVersion: null,
    approvalStatus: null,
    revisionCount: null,
    updateEvents: [],
    createdAt: plannedStartAt,
    updatedAt: plannedStartAt,
    __v: 0
  };
}

async function seedCompatibleBaseline(
  options: {
    legacyUsers?: Array<Record<string, unknown>>;
    activeTaskCount?: number;
    activeTaskOwnerId?: string;
  } = {}
): Promise<void> {
  await mongoose.connection.db!.createCollection(UserModel.collection.collectionName);
  await UserModel.createIndexes();
  await mongoose.connection.db!
    .collection(UserModel.collection.collectionName)
    .createIndex({ email: 1 }, { name: "email_1", unique: true });

  const legacyUsers = options.legacyUsers ?? [legacyUserDocument()];
  if (legacyUsers.length > 0) {
    await mongoose.connection.db!
      .collection(UserModel.collection.collectionName)
      .insertMany(legacyUsers);
  }

  const activeTaskCount = options.activeTaskCount ?? ACTIVE_TASK_IDS.length;
  if (activeTaskCount > 0) {
    const taskIds = Array.from(
      { length: activeTaskCount },
      (_, index) => ACTIVE_TASK_IDS[index] ?? `synthetic-active-task-extra-${index + 1}`
    );
    await mongoose.connection.db!
      .collection(TaskModel.collection.collectionName)
      .insertMany(
        taskIds.map((id, index) =>
          activeTaskDocument(id, index, options.activeTaskOwnerId)
        )
      );
  }
}

async function snapshotDatabase(): Promise<
  Array<{ name: string; documents: unknown[]; indexes: unknown[] }>
> {
  const collections = (
    await mongoose.connection.db!.listCollections({}, { nameOnly: true }).toArray()
  )
    .filter(({ name }) => !name.startsWith("system."))
    .sort(({ name: left }, { name: right }) => left.localeCompare(right));
  return Promise.all(
    collections.map(async ({ name }) => ({
      name,
      documents: await mongoose.connection.db!
        .collection(name)
        .find({})
        .sort({ _id: 1 })
        .toArray(),
      indexes: await mongoose.connection.db!.collection(name).listIndexes().toArray()
    }))
  );
}

async function assertBaselineUnchanged(
  before: Awaited<ReturnType<typeof snapshotDatabase>>
): Promise<void> {
  expect(await snapshotDatabase()).toEqual(before);
}

beforeAll(async () => {
  replicaSet = await startMongoReplicaSet("lisno");
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

afterAll(async () => {
  await replicaSet.stop();
});

describe("production Super Admin bootstrap for the existing lisno database", () => {
  it("fails closed on arguments, target, fingerprint, maintenance, and private inputs", async () => {
    const cases: Array<{
      argv?: string[];
      overrides?: Record<string, string | undefined>;
      code: ProductionSuperAdminBootstrapError["code"];
    }> = [
      { argv: ["--password", SYNTHETIC_PASSWORD], code: "INVALID_ARGUMENTS" },
      {
        overrides: { PRODUCTION_SUPER_ADMIN_TARGET: "linso-cluster/lisno_prod" },
        code: "TARGET_MISMATCH"
      },
      {
        overrides: { PRODUCTION_SUPER_ADMIN_TARGET_FINGERPRINT: "0".repeat(64) },
        code: "TARGET_MISMATCH"
      },
      {
        overrides: { PRODUCTION_SUPER_ADMIN_MAINTENANCE_CONFIRMATION: "unconfirmed" },
        code: "TARGET_MISMATCH"
      },
      {
        overrides: {
          PRODUCTION_SUPER_ADMIN_LEGACY_BASELINE_FINGERPRINT: "not-a-fingerprint"
        },
        code: "INVALID_CONFIGURATION"
      },
      {
        overrides: {
          MONGODB_URI:
            "mongodb+srv://bootstrap:synthetic@bootstrap.invalid/lisno_prod?retryWrites=true"
        },
        code: "TARGET_MISMATCH"
      },
      {
        overrides: { PRODUCTION_SUPER_ADMIN_PASSWORD: "short" },
        code: "INVALID_CONFIGURATION"
      },
      {
        overrides: { PRODUCTION_SUPER_ADMIN_EMAIL: "super-admin@lisno.example" },
        code: "INVALID_CONFIGURATION"
      }
    ];

    for (const candidate of cases) {
      await expectBootstrapError(
        () =>
          parseProductionSuperAdminBootstrapConfig({
            argv: candidate.argv ?? [],
            environment: environment(candidate.overrides)
          }),
        candidate.code
      );
    }
  });

  it("dry-runs the compatible legacy baseline with zero writes and redacted output", async () => {
    await seedCompatibleBaseline();
    const before = await snapshotDatabase();
    const outputs: string[] = [];
    const report = await runProductionSuperAdminBootstrapCommand({
      argv: [],
      environment: environment(),
      connect: async (_uri, options) => {
        expect(options).toEqual({ autoIndex: false, autoCreate: false });
      },
      disconnect: async () => undefined,
      writeOutput: (output) => outputs.push(output)
    });

    expect(report).toMatchObject({
      mode: "dry_run",
      status: "eligible",
      target: PRODUCTION_SUPER_ADMIN_TARGET,
      collectionCount: 2,
      documentCount: 6,
      userCount: 1,
      legacyDesignerCount: 1,
      legacyDesignerTaskCount: 5,
      superAdminCount: 0,
      targetIdentityCount: 0,
      indexState: "compatible",
      proposedQuarantineCount: 1,
      proposedInsertCount: 1
    });
    await assertBaselineUnchanged(before);
    expect(outputs).toHaveLength(1);
    assertRedacted(outputs[0]!);
    expect(outputs[0]).not.toContain("passwordHash");
  });

  it("quarantines only approved fields, preserves five task links, and creates an authenticatable Super Admin", async () => {
    await seedCompatibleBaseline();
    const users = mongoose.connection.db!.collection(UserModel.collection.collectionName);
    const tasks = mongoose.connection.db!.collection(TaskModel.collection.collectionName);
    const legacyBefore = await users.findOne({ _id: LEGACY_ID });
    const taskLinksBefore = await tasks
      .find({ ownerId: LEGACY_ID })
      .sort({ _id: 1 })
      .toArray();

    const report = await runProductionSuperAdminBootstrap(config(true));
    expect(report).toMatchObject({
      mode: "write",
      status: "created",
      userCount: 2,
      legacyDesignerCount: 1,
      legacyDesignerTaskCount: 5,
      superAdminCount: 1,
      targetIdentityCount: 1,
      indexState: "compatible",
      proposedQuarantineCount: 0,
      proposedInsertCount: 0
    });

    const legacyAfter = await users.findOne({ _id: LEGACY_ID });
    expect(legacyAfter).toMatchObject({
      _id: LEGACY_ID,
      name: legacyBefore!.name,
      email: legacyBefore!.email,
      emailNormalized: legacyBefore!.emailNormalized,
      mobile: legacyBefore!.mobile,
      address: legacyBefore!.address,
      passwordHash: legacyBefore!.passwordHash,
      role: legacyBefore!.role,
      active: false,
      accountKind: "development_demo",
      version: 1,
      managerId: legacyBefore!.managerId,
      authorizedClientIds: legacyBefore!.authorizedClientIds,
      avatar: legacyBefore!.avatar,
      title: legacyBefore!.title,
      createdAt: legacyBefore!.createdAt
    });
    expect(legacyAfter!.updatedAt).toBeInstanceOf(Date);
    expect(legacyAfter!.updatedAt).not.toEqual(legacyBefore!.updatedAt);
    const beforePreserved = { ...legacyBefore } as Record<string, unknown>;
    const afterPreserved = { ...legacyAfter } as Record<string, unknown>;
    for (const field of ["active", "accountKind", "version", "updatedAt"]) {
      delete beforePreserved[field];
      delete afterPreserved[field];
    }
    expect(afterPreserved).toEqual(beforePreserved);
    expect(await tasks.find({ ownerId: LEGACY_ID }).sort({ _id: 1 }).toArray()).toEqual(
      taskLinksBefore
    );

    const stored = await UserModel.findOne({ role: "super_admin" })
      .select("+passwordHash")
      .lean()
      .exec();
    expect(stored).toMatchObject({
      name: SYNTHETIC_NAME,
      email: SYNTHETIC_EMAIL,
      emailNormalized: SYNTHETIC_EMAIL.toLowerCase(),
      role: "super_admin",
      active: true,
      accountKind: "standard",
      version: 1,
      managerId: null,
      authorizedClientIds: []
    });
    expect(isReservedDevelopmentDemoIdentity({
      id: String(stored!._id),
      emailNormalized: stored!.emailNormalized,
      accountKind: stored!.accountKind
    })).toBe(false);
    expect(stored!.passwordHash.startsWith("$2b$12$")).toBe(true);
    await expect(bcrypt.compare(SYNTHETIC_PASSWORD, stored!.passwordHash)).resolves.toBe(true);

    const auth = createAuthService(createMongoRepository(), {
      jwtSecret: AUTH_SECRET,
      jwtExpiresInSeconds: 900
    });
    const loggedIn = await auth.login(
      SYNTHETIC_EMAIL.toLowerCase(),
      SYNTHETIC_PASSWORD,
      { remoteAddress: "198.51.100.24" }
    );
    expect(loggedIn.user).toMatchObject({ role: "super_admin" });
    await expect(
      auth.authenticate(loggedIn.token, { remoteAddress: "198.51.100.24" })
    ).resolves.toMatchObject({ role: "super_admin" });
  });

  it("rejects existing Super Admin and target-email conflicts without mutation", async () => {
    await seedCompatibleBaseline();
    await UserModel.create({
      _id: "synthetic-existing-super-admin",
      name: "Synthetic Existing Owner",
      email: "existing-owner@bootstrap.test",
      emailNormalized: "existing-owner@bootstrap.test",
      passwordHash: await bcrypt.hash("SyntheticExistingPassword!3000", 12),
      role: "super_admin",
      active: true,
      accountKind: "standard",
      version: 1,
      managerId: null,
      authorizedClientIds: []
    });
    let before = await snapshotDatabase();
    await expectBootstrapError(
      runProductionSuperAdminBootstrap(config()),
      "IDENTITY_CONFLICT"
    );
    await assertBaselineUnchanged(before);

    await mongoose.connection.dropDatabase();
    await seedCompatibleBaseline({
      legacyUsers: [
        legacyUserDocument(),
        legacyUserDocument({
          _id: "synthetic-target-email-collision",
          name: "Synthetic Collision",
          email: SYNTHETIC_EMAIL,
          emailNormalized: SYNTHETIC_EMAIL.toLowerCase(),
          role: "admin",
          active: false,
          accountKind: "standard",
          version: 1
        })
      ]
    });
    before = await snapshotDatabase();
    await expectBootstrapError(
      runProductionSuperAdminBootstrap(config()),
      "IDENTITY_CONFLICT"
    );
    await assertBaselineUnchanged(before);
  });

  it("rejects missing, extra, or changed legacy responsibility baselines", async () => {
    const cases: Array<{
      legacyUsers?: Array<Record<string, unknown>>;
      activeTaskCount?: number;
      activeTaskOwnerId?: string;
    }> = [
      { legacyUsers: [] },
      {
        legacyUsers: [
          legacyUserDocument(),
          legacyUserDocument({
            _id: "user-designer-kabir",
            name: "Synthetic Additional Reserved Designer",
            email: "kabir@lisno.example",
            emailNormalized: "kabir@lisno.example"
          })
        ],
        activeTaskOwnerId: "user-designer-kabir"
      },
      {
        legacyUsers: [
          legacyUserDocument({
            _id: "user-designer-kabir",
            name: "Synthetic Replacement Reserved Designer",
            email: "kabir@lisno.example",
            emailNormalized: "kabir@lisno.example"
          })
        ],
        activeTaskOwnerId: "user-designer-kabir"
      },
      { activeTaskCount: 4 },
      { activeTaskCount: 6 }
    ];

    for (const candidate of cases) {
      await mongoose.connection.dropDatabase();
      await seedCompatibleBaseline(candidate);
      const before = await snapshotDatabase();
      await expectBootstrapError(
        runProductionSuperAdminBootstrap(config()),
        "BASELINE_MISMATCH"
      );
      await assertBaselineUnchanged(before);
    }
  });

  it("rejects legacy state, other responsibility, and full-index drift", async () => {
    await seedCompatibleBaseline({
      legacyUsers: [legacyUserDocument({ version: 1 })]
    });
    let before = await snapshotDatabase();
    await expectBootstrapError(
      runProductionSuperAdminBootstrap(config()),
      "BASELINE_MISMATCH"
    );
    await assertBaselineUnchanged(before);

    await mongoose.connection.dropDatabase();
    await seedCompatibleBaseline();
    await mongoose.connection.db!.collection("projects").insertOne({
      _id: "synthetic-owned-project",
      initiatingDesignerId: LEGACY_ID,
      status: "in_progress"
    });
    before = await snapshotDatabase();
    await expectBootstrapError(
      runProductionSuperAdminBootstrap(config()),
      "BASELINE_MISMATCH"
    );
    await assertBaselineUnchanged(before);

    await mongoose.connection.dropDatabase();
    await seedCompatibleBaseline();
    const users = mongoose.connection.db!.collection(UserModel.collection.collectionName);
    await users.dropIndex("one_super_admin");
    await users.createIndex({ role: 1 }, { name: "one_super_admin", unique: false });
    before = await snapshotDatabase();
    await expectBootstrapError(
      runProductionSuperAdminBootstrap(config()),
      "INDEX_CONFLICT"
    );
    await assertBaselineUnchanged(before);
  });

  it("rolls back quarantine and insert after an injected transaction failure", async () => {
    await seedCompatibleBaseline();
    const before = await snapshotDatabase();
    await expectBootstrapError(
      runProductionSuperAdminBootstrap(config(true), {
        afterInsert: async () => {
          throw new Error(
            `private failure ${SYNTHETIC_EMAIL} ${SYNTHETIC_PASSWORD} ${LEGACY_PASSWORD_HASH}`
          );
        }
      }),
      "TRANSACTION_FAILED"
    );
    await assertBaselineUnchanged(before);
    await expect(runProductionSuperAdminBootstrap(config(true))).resolves.toMatchObject({
      status: "created",
      userCount: 2
    });
  });

  it("handles concurrency and permits only exact immutable reruns with a stable digest", async () => {
    await seedCompatibleBaseline();
    const initialDryRun = await runProductionSuperAdminBootstrap(config());
    const first = config(true);
    const second = config(true, {
      PRODUCTION_SUPER_ADMIN_NAME: "Other Synthetic Owner",
      PRODUCTION_SUPER_ADMIN_EMAIL: "other-owner@bootstrap.test",
      PRODUCTION_SUPER_ADMIN_PASSWORD: "OtherSyntheticPassword!4096"
    });
    const attempts = await Promise.allSettled([
      runProductionSuperAdminBootstrap(first),
      runProductionSuperAdminBootstrap(second)
    ]);
    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(await UserModel.countDocuments({ role: "super_admin" })).toBe(1);
    expect(await UserModel.countDocuments()).toBe(2);

    const winnerDocument = await UserModel.findOne({ role: "super_admin" })
      .select("+passwordHash")
      .lean()
      .exec();
    const winner = winnerDocument!.emailNormalized === first.emailNormalized ? first : second;
    const loser = winner === first ? second : first;
    const beforeRerun = await snapshotDatabase();
    const rerun = await runProductionSuperAdminBootstrap(winner);
    expect(rerun).toMatchObject({
      status: "already_provisioned",
      userCount: 2,
      proposedQuarantineCount: 0,
      proposedInsertCount: 0
    });
    if (winner === first) expect(rerun.approvalDigest).toBe(initialDryRun.approvalDigest);
    await assertBaselineUnchanged(beforeRerun);
    await expectBootstrapError(
      runProductionSuperAdminBootstrap(loser),
      "IDENTITY_CONFLICT"
    );
    await expectBootstrapError(
      runProductionSuperAdminBootstrap({
        ...winner,
        password: `${winner.password}-different`
      }),
      "IDENTITY_CONFLICT"
    );
    await assertBaselineUnchanged(beforeRerun);
  });

  it("reports sanitized post-commit and command cleanup failures as committed", async () => {
    await seedCompatibleBaseline();
    const changed = await expectBootstrapError(
      runProductionSuperAdminBootstrap(config(true), {
        afterTransactionCommit: async () => {
          await mongoose.connection.db!.collection("projects").insertOne({
            _id: "synthetic-post-commit-drift",
            marker: "external-write"
          });
        }
      }),
      "POST_COMMIT_TARGET_CHANGED"
    );
    expect(changed.committed).toBe(true);
    expect(await UserModel.countDocuments()).toBe(2);

    await mongoose.connection.dropDatabase();
    await seedCompatibleBaseline();
    const outputs: string[] = [];
    const disconnectError = await expectBootstrapError(
      runProductionSuperAdminBootstrapCommand({
        argv: ["--write"],
        environment: environment(),
        connect: async () => undefined,
        disconnect: async () => {
          throw new Error(`synthetic disconnect ${SYNTHETIC_EMAIL}`);
        },
        writeOutput: (output) => outputs.push(output)
      }),
      "DISCONNECT_FAILED"
    );
    expect(disconnectError.committed).toBe(true);
    expect(outputs).toEqual([]);

    await mongoose.connection.dropDatabase();
    await seedCompatibleBaseline();
    const outputError = await expectBootstrapError(
      runProductionSuperAdminBootstrapCommand({
        argv: ["--write"],
        environment: environment(),
        connect: async () => undefined,
        disconnect: async () => undefined,
        writeOutput: () => {
          throw new Error(`synthetic output ${LEGACY_NAME}`);
        }
      }),
      "OUTPUT_FAILED"
    );
    expect(outputError.committed).toBe(true);
  });

  it("rejects concurrent exact provisioning when unrelated baseline data also drifts", async () => {
    await seedCompatibleBaseline();
    const writeConfig = config(true);
    const users = mongoose.connection.db!.collection(
      UserModel.collection.collectionName
    );
    const changed = await expectBootstrapError(
      runProductionSuperAdminBootstrap(writeConfig, {
        runTransaction: async () => {
          const now = new Date("2026-07-08T09:10:11.000Z");
          await users.updateOne(
            { _id: LEGACY_ID },
            {
              $set: {
                active: false,
                accountKind: "development_demo",
                version: 1,
                updatedAt: now
              }
            }
          );
          await users.insertOne({
            _id: "synthetic-concurrent-super-admin",
            name: writeConfig.name,
            email: writeConfig.email,
            emailNormalized: writeConfig.emailNormalized,
            mobile: null,
            address: null,
            passwordHash: await bcrypt.hash(writeConfig.password, 12),
            role: "super_admin",
            active: true,
            accountKind: "standard",
            version: 1,
            managerId: null,
            authorizedClientIds: [],
            createdAt: now,
            updatedAt: now
          });
          await mongoose.connection.db!.collection("projects").insertOne({
            _id: "synthetic-concurrent-unrelated-drift",
            marker: "external-write"
          });
          throw new Error("synthetic concurrent transaction winner");
        }
      }),
      "POST_COMMIT_TARGET_CHANGED"
    );
    expect(changed.committed).toBe(true);
    expect(await UserModel.countDocuments()).toBe(2);
    expect(
      await mongoose.connection.db!
        .collection("projects")
        .countDocuments({ _id: "synthetic-concurrent-unrelated-drift" })
    ).toBe(1);
  });

  it("fails transaction rechecks on CAS drift and redacts connection failures", async () => {
    await seedCompatibleBaseline();
    const users = mongoose.connection.db!.collection(UserModel.collection.collectionName);
    await expectBootstrapError(
      runProductionSuperAdminBootstrap(config(true), {
        runTransaction: async (operation) => {
          await users.updateOne(
            { _id: LEGACY_ID },
            { $set: { updatedAt: new Date("2026-07-08T09:10:11.000Z") } }
          );
          return mongoose.connection.transaction(operation);
        }
      }),
      "WRITE_CONFLICT"
    );
    expect(await UserModel.countDocuments({ role: "super_admin" })).toBe(0);

    const error = await expectBootstrapError(
      runProductionSuperAdminBootstrapCommand({
        argv: [],
        environment: environment(),
        connect: async () => {
          throw new Error(`${SYNTHETIC_URI} ${SYNTHETIC_PASSWORD}`);
        },
        disconnect: async () => undefined,
        writeOutput: () => undefined
      }),
      "CONNECTION_FAILED"
    );
    expect(error.committed).toBe(false);
  });
});
