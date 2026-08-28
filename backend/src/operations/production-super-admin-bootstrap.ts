import "dotenv/config";

import { createHash, createHmac, randomUUID as cryptoRandomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

import bcrypt from "bcryptjs";
import mongoose, { type ClientSession, type Connection } from "mongoose";

import {
  RESERVED_DEMO_IDENTITIES,
  isReservedDemoEmail,
  isReservedDevelopmentDemoIdentity
} from "../domain/demo-identities.js";
import {
  invitationEmailSchema,
  invitationNameSchema,
  normalizeInvitationEmail
} from "../domain/user-invitations.js";
import { EstimateModel } from "../models/Estimate.js";
import { LeadModel } from "../models/Lead.js";
import { ProjectModel } from "../models/Project.js";
import { ProjectAccessGrantModel } from "../models/ProjectAccessGrant.js";
import { TaskModel } from "../models/Task.js";
import { UserModel } from "../models/User.js";

export const PRODUCTION_SUPER_ADMIN_TARGET = "linso-cluster/lisno" as const;
export const PRODUCTION_SUPER_ADMIN_DATABASE = "lisno" as const;
export const PRODUCTION_SUPER_ADMIN_MAINTENANCE_CONFIRMATION =
  "lisno_has_no_other_writers" as const;

const BCRYPT_COST = 12;
const MINIMUM_PASSWORD_LENGTH = 12;
const MAXIMUM_PASSWORD_LENGTH = 128;
const MINIMUM_APPROVAL_KEY_LENGTH = 32;
const EXPECTED_LEGACY_DESIGNER_COUNT = 1;
const EXPECTED_LEGACY_DESIGNER_TASK_COUNT = 5;
const USERS_COLLECTION = UserModel.collection.collectionName;
const LEGACY_EMAIL_INDEX = {
  name: "email_1",
  key: { email: 1 },
  unique: true
} as const;

export type ProductionSuperAdminBootstrapErrorCode =
  | "INVALID_ARGUMENTS"
  | "INVALID_CONFIGURATION"
  | "TARGET_MISMATCH"
  | "BASELINE_MISMATCH"
  | "INDEX_CONFLICT"
  | "IDENTITY_CONFLICT"
  | "WRITE_CONFLICT"
  | "TRANSACTION_FAILED"
  | "POST_COMMIT_TARGET_CHANGED"
  | "CONNECTION_FAILED"
  | "DISCONNECT_FAILED"
  | "OUTPUT_FAILED";

export class ProductionSuperAdminBootstrapError extends Error {
  readonly code: ProductionSuperAdminBootstrapErrorCode;
  readonly committed: boolean;

  constructor(code: ProductionSuperAdminBootstrapErrorCode, committed = false) {
    super(code);
    this.name = "ProductionSuperAdminBootstrapError";
    this.code = code;
    this.committed = committed;
  }
}

export interface ProductionSuperAdminBootstrapConfig {
  mode: "dry_run" | "write";
  mongodbUri: string;
  target: typeof PRODUCTION_SUPER_ADMIN_TARGET;
  targetFingerprint: string;
  legacyBaselineFingerprint: string;
  maintenanceConfirmed: true;
  name: string;
  email: string;
  emailNormalized: string;
  password: string;
  approvalKey: string;
}

export interface ProductionSuperAdminBootstrapReport {
  mode: "dry_run" | "write";
  status: "eligible" | "created" | "already_provisioned";
  target: typeof PRODUCTION_SUPER_ADMIN_TARGET;
  targetFingerprint: string;
  collectionCount: number;
  documentCount: number;
  userCount: number;
  legacyDesignerCount: number;
  legacyDesignerTaskCount: number;
  superAdminCount: number;
  targetIdentityCount: number;
  indexState: "compatible";
  proposedQuarantineCount: 0 | 1;
  proposedInsertCount: 0 | 1;
  approvalDigest: string;
}

export interface ProductionSuperAdminBootstrapDependencies {
  connection?: Connection;
  hashPassword?: (password: string, cost: number) => Promise<string>;
  comparePassword?: (password: string, hash: string) => Promise<boolean>;
  randomUUID?: () => string;
  runTransaction?: <T>(operation: (session: ClientSession) => Promise<T>) => Promise<T>;
  afterQuarantine?: (session: ClientSession) => Promise<void>;
  afterInsert?: (session: ClientSession) => Promise<void>;
  afterTransactionCommit?: () => Promise<void>;
}

export interface ProductionSuperAdminBootstrapCommandDependencies
  extends ProductionSuperAdminBootstrapDependencies {
  argv?: string[];
  environment?: Record<string, string | undefined>;
  connect?: (
    uri: string,
    options: { autoIndex: false; autoCreate: false }
  ) => Promise<unknown>;
  disconnect?: () => Promise<unknown>;
  writeOutput?: (output: string) => void;
}

export function parseProductionSuperAdminBootstrapConfig(
  input: {
    argv?: string[];
    environment?: Record<string, string | undefined>;
  } = {}
): ProductionSuperAdminBootstrapConfig {
  const argv = input.argv ?? process.argv.slice(2);
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== "--write")) {
    fail("INVALID_ARGUMENTS");
  }

  const environment = input.environment ?? process.env;
  const mongodbUri = requiredEnvironmentValue(environment, "MONGODB_URI");
  if (
    requiredEnvironmentValue(environment, "PRODUCTION_SUPER_ADMIN_TARGET") !==
    PRODUCTION_SUPER_ADMIN_TARGET
  ) {
    fail("TARGET_MISMATCH");
  }
  const uri = parseProductionMongoUri(mongodbUri);
  const computedTargetFingerprint = targetFingerprint(uri.host);
  const expectedTargetFingerprint = requiredEnvironmentValue(
    environment,
    "PRODUCTION_SUPER_ADMIN_TARGET_FINGERPRINT"
  );
  if (
    !/^[0-9a-f]{64}$/u.test(expectedTargetFingerprint) ||
    expectedTargetFingerprint !== computedTargetFingerprint
  ) {
    fail("TARGET_MISMATCH");
  }
  if (
    requiredEnvironmentValue(
      environment,
      "PRODUCTION_SUPER_ADMIN_MAINTENANCE_CONFIRMATION"
    ) !== PRODUCTION_SUPER_ADMIN_MAINTENANCE_CONFIRMATION
  ) {
    fail("TARGET_MISMATCH");
  }
  const legacyBaselineFingerprint = requiredEnvironmentValue(
    environment,
    "PRODUCTION_SUPER_ADMIN_LEGACY_BASELINE_FINGERPRINT"
  );
  if (!/^[0-9a-f]{64}$/u.test(legacyBaselineFingerprint)) {
    fail("INVALID_CONFIGURATION");
  }

  const nameInput = requiredEnvironmentValue(
    environment,
    "PRODUCTION_SUPER_ADMIN_NAME"
  );
  const emailInput = requiredEnvironmentValue(
    environment,
    "PRODUCTION_SUPER_ADMIN_EMAIL"
  );
  const password = requiredEnvironmentValue(
    environment,
    "PRODUCTION_SUPER_ADMIN_PASSWORD",
    false
  );
  const approvalKey = requiredEnvironmentValue(
    environment,
    "PRODUCTION_SUPER_ADMIN_APPROVAL_KEY",
    false
  );

  let name: string;
  let email: string;
  try {
    name = invitationNameSchema.parse(nameInput);
    email = invitationEmailSchema.parse(emailInput);
  } catch {
    fail("INVALID_CONFIGURATION");
  }
  const emailNormalized = normalizeInvitationEmail(email);
  if (
    isReservedDemoEmail(emailNormalized) ||
    password.length < MINIMUM_PASSWORD_LENGTH ||
    password.length > MAXIMUM_PASSWORD_LENGTH ||
    approvalKey.length < MINIMUM_APPROVAL_KEY_LENGTH
  ) {
    fail("INVALID_CONFIGURATION");
  }

  return {
    mode: argv[0] === "--write" ? "write" : "dry_run",
    mongodbUri,
    target: PRODUCTION_SUPER_ADMIN_TARGET,
    targetFingerprint: computedTargetFingerprint,
    legacyBaselineFingerprint,
    maintenanceConfirmed: true,
    name,
    email,
    emailNormalized,
    password,
    approvalKey
  };
}

export async function runProductionSuperAdminBootstrap(
  config: ProductionSuperAdminBootstrapConfig,
  dependencies: ProductionSuperAdminBootstrapDependencies = {}
): Promise<ProductionSuperAdminBootstrapReport> {
  const connection = dependencies.connection ?? mongoose.connection;
  assertConnectedTarget(connection);
  const comparePassword = dependencies.comparePassword ?? bcrypt.compare;
  const initial = await inspectTarget(connection, config, comparePassword);
  const approvalDigest = approvalDigestFor(config, initial);

  if (initial.state === "provisioned") {
    return reportFor(config, "already_provisioned", initial, approvalDigest, 0, 0);
  }
  if (config.mode === "dry_run") {
    return reportFor(config, "eligible", initial, approvalDigest, 1, 1);
  }

  const preTransaction = await inspectTarget(connection, config, comparePassword);
  if (
    preTransaction.state !== "eligible" ||
    baselineSignature(preTransaction) !== baselineSignature(initial)
  ) {
    fail("WRITE_CONFLICT");
  }

  const id = (dependencies.randomUUID ?? cryptoRandomUUID)();
  if (
    isReservedDevelopmentDemoIdentity({
      id,
      emailNormalized: config.emailNormalized,
      accountKind: "standard"
    })
  ) {
    fail("INVALID_CONFIGURATION");
  }

  let passwordHash: string;
  try {
    passwordHash = await (dependencies.hashPassword ?? bcrypt.hash)(
      config.password,
      BCRYPT_COST
    );
  } catch {
    fail("TRANSACTION_FAILED");
  }

  const now = new Date();
  const runTransaction =
    dependencies.runTransaction ??
    (<T>(operation: (session: ClientSession) => Promise<T>) =>
      connection.transaction(operation));
  try {
    await runTransaction(async (session) => {
      let current: TargetInspection;
      try {
        current = await inspectTarget(connection, config, comparePassword, {
          session,
          trustedIndexes: initial.indexes
        });
      } catch {
        fail("WRITE_CONFLICT");
      }
      if (
        current.state !== "eligible" ||
        baselineSignature(current) !== baselineSignature(initial)
      ) {
        fail("WRITE_CONFLICT");
      }

      const users = connection.db?.collection(USERS_COLLECTION);
      if (!users) fail("WRITE_CONFLICT");
      const quarantine = await users.updateOne(
        exactLegacyDocumentFilter(current.legacyDesigner),
        {
          $set: {
            active: false,
            accountKind: "development_demo",
            version: 1,
            updatedAt: now
          }
        },
        { session }
      );
      if (quarantine.matchedCount !== 1 || quarantine.modifiedCount !== 1) {
        fail("WRITE_CONFLICT");
      }
      await dependencies.afterQuarantine?.(session);

      await UserModel.create(
        [
          {
            _id: id,
            name: config.name,
            email: config.email,
            emailNormalized: config.emailNormalized,
            mobile: null,
            address: null,
            passwordHash,
            role: "super_admin",
            active: true,
            accountKind: "standard",
            version: 1,
            managerId: null,
            authorizedClientIds: [],
            createdAt: now,
            updatedAt: now
          }
        ],
        { session }
      );
      await dependencies.afterInsert?.(session);

      let completedInTransaction: TargetInspection;
      try {
        completedInTransaction = await inspectTarget(
          connection,
          config,
          comparePassword,
          { session, trustedIndexes: initial.indexes }
        );
      } catch {
        fail("WRITE_CONFLICT");
      }
      if (
        completedInTransaction.state !== "provisioned" ||
        !postWriteMatchesBaseline(initial, completedInTransaction, now)
      ) {
        fail("WRITE_CONFLICT");
      }
    });
  } catch (error) {
    const afterConflict = await inspectAfterTransactionFailure(
      connection,
      config,
      comparePassword
    );
    if (afterConflict?.state === "provisioned") {
      if (
        stableSerialize(approvalBaseline(afterConflict)) !==
        stableSerialize(approvalBaseline(initial))
      ) {
        fail("POST_COMMIT_TARGET_CHANGED", true);
      }
      return reportFor(
        config,
        "already_provisioned",
        afterConflict,
        approvalDigest,
        0,
        0
      );
    }
    if (error instanceof ProductionSuperAdminBootstrapError) throw error;
    fail("TRANSACTION_FAILED");
  }

  try {
    await dependencies.afterTransactionCommit?.();
  } catch {
    fail("POST_COMMIT_TARGET_CHANGED", true);
  }

  let completed: TargetInspection;
  try {
    completed = await inspectTarget(connection, config, comparePassword);
  } catch {
    fail("POST_COMMIT_TARGET_CHANGED", true);
  }
  if (
    completed.state !== "provisioned" ||
    !postWriteMatchesBaseline(initial, completed, now)
  ) {
    fail("POST_COMMIT_TARGET_CHANGED", true);
  }
  return reportFor(config, "created", completed, approvalDigest, 0, 0);
}

export async function runProductionSuperAdminBootstrapCommand(
  dependencies: ProductionSuperAdminBootstrapCommandDependencies = {}
): Promise<ProductionSuperAdminBootstrapReport> {
  const config = parseProductionSuperAdminBootstrapConfig({
    argv: dependencies.argv,
    environment: dependencies.environment
  });
  const connect =
    dependencies.connect ??
    ((uri: string, options: { autoIndex: false; autoCreate: false }) =>
      mongoose.connect(uri, options));
  const disconnect = dependencies.disconnect ?? (() => mongoose.disconnect());
  const writeOutput =
    dependencies.writeOutput ?? ((output: string) => process.stdout.write(output));

  try {
    await connect(config.mongodbUri, { autoIndex: false, autoCreate: false });
  } catch {
    fail("CONNECTION_FAILED");
  }

  let report: ProductionSuperAdminBootstrapReport | undefined;
  let primaryError: unknown;
  try {
    report = await runProductionSuperAdminBootstrap(config, dependencies);
  } catch (error) {
    primaryError = error;
  }
  let disconnectFailed = false;
  try {
    await disconnect();
  } catch {
    disconnectFailed = true;
  }
  if (primaryError) throw primaryError;
  if (!report) fail("TRANSACTION_FAILED");
  if (disconnectFailed) {
    fail(
      "DISCONNECT_FAILED",
      report.status === "created" || report.status === "already_provisioned"
    );
  }
  try {
    writeOutput(`${JSON.stringify(report)}\n`);
  } catch {
    fail(
      "OUTPUT_FAILED",
      report.status === "created" || report.status === "already_provisioned"
    );
  }
  return report;
}

function requiredEnvironmentValue(
  environment: Record<string, string | undefined>,
  key: string,
  trim = true
): string {
  const raw = environment[key];
  const value = trim ? raw?.trim() : raw;
  if (!value) fail("INVALID_CONFIGURATION");
  return value;
}

function parseProductionMongoUri(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    fail("TARGET_MISMATCH");
  }
  if (parsed.protocol !== "mongodb+srv:" || parsed.hash !== "" || !parsed.hostname) {
    fail("TARGET_MISMATCH");
  }
  const pathParts = parsed.pathname.split("/").filter(Boolean);
  let databaseName = "";
  try {
    databaseName = pathParts.length === 1 ? decodeURIComponent(pathParts[0]!) : "";
  } catch {
    fail("TARGET_MISMATCH");
  }
  if (databaseName !== PRODUCTION_SUPER_ADMIN_DATABASE) fail("TARGET_MISMATCH");
  return parsed;
}

function targetFingerprint(host: string): string {
  return createHash("sha256")
    .update(`${host.toLowerCase()}|${PRODUCTION_SUPER_ADMIN_DATABASE}`, "utf8")
    .digest("hex");
}

function approvalDigestFor(
  config: ProductionSuperAdminBootstrapConfig,
  inspection: TargetInspection
): string {
  const canonical = JSON.stringify({
    target: config.target,
    targetFingerprint: config.targetFingerprint,
    legacyBaselineFingerprint: config.legacyBaselineFingerprint,
    maintenanceConfirmed: config.maintenanceConfirmed,
    name: config.name,
    email: config.email,
    emailNormalized: config.emailNormalized,
    password: config.password,
    baseline: approvalBaseline(inspection),
    proposedQuarantineCount: 1,
    proposedInsertCount: 1
  });
  return createHmac("sha256", config.approvalKey)
    .update(canonical, "utf8")
    .digest("hex");
}

function assertConnectedTarget(connection: Connection): void {
  if (
    connection.readyState !== 1 ||
    connection.name !== PRODUCTION_SUPER_ADMIN_DATABASE ||
    !connection.db
  ) {
    fail("TARGET_MISMATCH");
  }
}

type PlainDocument = Record<string, unknown>;

interface ResponsibilitySnapshot {
  ownedActiveLeads: number;
  ownedActiveEstimates: number;
  initiatedActiveProjects: number;
  assignedActiveProjects: number;
  managedActiveProjects: number;
  ownedActiveTasks: number;
  directReports: number;
  linkedClientProjects: number;
  adminInitiatorGrants: number;
  activeTaskIds: string[];
}

interface CanonicalIndex {
  name: string;
  key: Record<string, number>;
  unique: boolean;
  partialFilterExpression?: Record<string, unknown>;
}

interface IndexInspection {
  state: "absent" | "missing" | "compatible";
  indexes: CanonicalIndex[];
}

interface TargetInspection {
  state: "eligible" | "provisioned";
  collectionCounts: Array<{ name: string; count: number }>;
  collectionCount: number;
  documentCount: number;
  userCount: number;
  legacyDesignerCount: number;
  legacyDesignerTaskCount: number;
  superAdminCount: number;
  targetIdentityCount: number;
  indexState: "compatible";
  indexes: CanonicalIndex[];
  legacyDesigner: PlainDocument;
  responsibilities: ResponsibilitySnapshot;
}

async function inspectTarget(
  connection: Connection,
  config: ProductionSuperAdminBootstrapConfig,
  comparePassword: (password: string, hash: string) => Promise<boolean>,
  options: { session?: ClientSession; trustedIndexes?: CanonicalIndex[] } = {}
): Promise<TargetInspection> {
  const database = connection.db;
  if (!database) fail("TARGET_MISMATCH");

  const collectionCounts = await inspectCollectionCounts(connection, options.session);
  const collectionCount = collectionCounts.length;
  const documentCount = collectionCounts.reduce((total, item) => total + item.count, 0);
  const userCount = collectionCounts.find(({ name }) => name === USERS_COLLECTION)?.count ?? 0;
  const hasUsersCollection = collectionCounts.some(({ name }) => name === USERS_COLLECTION);
  const indexInspection = options.trustedIndexes
    ? { state: "compatible" as const, indexes: options.trustedIndexes }
    : hasUsersCollection
      ? await inspectUserIndexes(database.collection(USERS_COLLECTION))
      : { state: "absent" as const, indexes: [] };
  if (indexInspection.state !== "compatible") fail("INDEX_CONFLICT");

  const rawUsers = await database
    .collection(USERS_COLLECTION)
    .find({}, { session: options.session })
    .toArray() as PlainDocument[];
  if (rawUsers.length !== userCount || !rawUsers.every(validNormalizedIdentity)) {
    fail("BASELINE_MISMATCH");
  }

  const superAdmins = rawUsers.filter(({ role }) => role === "super_admin");
  const targetIdentities = rawUsers.filter(
    ({ emailNormalized }) => emailNormalized === config.emailNormalized
  );
  const legacyDesigners = rawUsers.filter(isExactReservedLegacyDesigner);

  if (superAdmins.length > 0 || targetIdentities.length > 0) {
    if (
      rawUsers.length !== 2 ||
      superAdmins.length !== 1 ||
      targetIdentities.length !== 1 ||
      superAdmins[0] !== targetIdentities[0] ||
      legacyDesigners.length !== EXPECTED_LEGACY_DESIGNER_COUNT
    ) {
      fail("IDENTITY_CONFLICT");
    }
    const legacyDesigner = legacyDesigners[0]!;
    if (!isQuarantinedLegacyDesigner(legacyDesigner)) fail("BASELINE_MISMATCH");
    const responsibilities = await inspectResponsibilities(
      connection,
      String(legacyDesigner._id),
      options.session
    );
    assertExpectedResponsibilities(responsibilities);
    assertLegacyBaselineFingerprint(config, legacyDesigner, responsibilities);
    if (!(await canonicalSuperAdminMatches(superAdmins[0]!, config, comparePassword))) {
      fail("IDENTITY_CONFLICT");
    }
    return targetInspection({
      state: "provisioned",
      collectionCounts,
      userCount,
      legacyDesigner,
      responsibilities,
      superAdminCount: 1,
      targetIdentityCount: 1,
      indexes: indexInspection.indexes
    });
  }

  if (
    rawUsers.length !== 1 ||
    legacyDesigners.length !== EXPECTED_LEGACY_DESIGNER_COUNT ||
    !isActiveUnversionedLegacyDesigner(legacyDesigners[0]!)
  ) {
    fail("BASELINE_MISMATCH");
  }
  const legacyDesigner = legacyDesigners[0]!;
  const responsibilities = await inspectResponsibilities(
    connection,
    String(legacyDesigner._id),
    options.session
  );
  assertExpectedResponsibilities(responsibilities);
  assertLegacyBaselineFingerprint(config, legacyDesigner, responsibilities);
  return targetInspection({
    state: "eligible",
    collectionCounts,
    userCount,
    legacyDesigner,
    responsibilities,
    superAdminCount: 0,
    targetIdentityCount: 0,
    indexes: indexInspection.indexes
  });
}

function targetInspection(input: {
  state: "eligible" | "provisioned";
  collectionCounts: Array<{ name: string; count: number }>;
  userCount: number;
  legacyDesigner: PlainDocument;
  responsibilities: ResponsibilitySnapshot;
  superAdminCount: number;
  targetIdentityCount: number;
  indexes: CanonicalIndex[];
}): TargetInspection {
  return {
    state: input.state,
    collectionCounts: input.collectionCounts,
    collectionCount: input.collectionCounts.length,
    documentCount: input.collectionCounts.reduce((total, item) => total + item.count, 0),
    userCount: input.userCount,
    legacyDesignerCount: 1,
    legacyDesignerTaskCount: input.responsibilities.ownedActiveTasks,
    superAdminCount: input.superAdminCount,
    targetIdentityCount: input.targetIdentityCount,
    indexState: "compatible",
    indexes: input.indexes,
    legacyDesigner: input.legacyDesigner,
    responsibilities: input.responsibilities
  };
}

async function inspectCollectionCounts(
  connection: Connection,
  session?: ClientSession
): Promise<Array<{ name: string; count: number }>> {
  const database = connection.db;
  if (!database) fail("TARGET_MISMATCH");
  const names = (await database.listCollections({}, { nameOnly: true }).toArray())
    .map(({ name }) => name)
    .filter((name) => !name.startsWith("system."))
    .sort((left, right) => left.localeCompare(right));
  const counts: Array<{ name: string; count: number }> = [];
  for (const name of names) {
    counts.push({
      name,
      count: await database.collection(name).countDocuments({}, { session })
    });
  }
  return counts;
}

function validNormalizedIdentity(user: PlainDocument): boolean {
  if (typeof user.email !== "string" || typeof user.emailNormalized !== "string") {
    return false;
  }
  try {
    return (
      user.emailNormalized.length > 0 &&
      normalizeInvitationEmail(invitationEmailSchema.parse(user.email)) ===
        user.emailNormalized
    );
  } catch {
    return false;
  }
}

function isExactReservedLegacyDesigner(user: PlainDocument): boolean {
  return (
    typeof user._id === "string" &&
    typeof user.emailNormalized === "string" &&
    user.role === "designer" &&
    RESERVED_DEMO_IDENTITIES.some(
      ({ id, emailNormalized }) =>
        id === user._id && emailNormalized === user.emailNormalized
    )
  );
}

function isActiveUnversionedLegacyDesigner(user: PlainDocument): boolean {
  return (
    user.active === true &&
    !Object.prototype.hasOwnProperty.call(user, "accountKind") &&
    !Object.prototype.hasOwnProperty.call(user, "version")
  );
}

function isQuarantinedLegacyDesigner(user: PlainDocument): boolean {
  return (
    user.active === false &&
    user.accountKind === "development_demo" &&
    user.version === 1
  );
}

async function inspectResponsibilities(
  connection: Connection,
  userId: string,
  session?: ClientSession
): Promise<ResponsibilitySnapshot> {
  const database = connection.db;
  if (!database) fail("TARGET_MISMATCH");
  const count = (collectionName: string, filter: PlainDocument) =>
    database.collection(collectionName).countDocuments(filter, { session });
  const activeTasks = await database
    .collection(TaskModel.collection.collectionName)
    .find(
      { ownerId: userId, status: { $ne: "completed" } },
      { projection: { _id: 1 }, session }
    )
    .sort({ _id: 1 })
    .toArray();

  const [
    ownedActiveLeads,
    ownedActiveEstimates,
    initiatedActiveProjects,
    assignedActiveProjects,
    managedActiveProjects,
    directReports,
    linkedClientProjects,
    adminInitiatorGrants
  ] = await Promise.all([
    count(LeadModel.collection.collectionName, {
      ownerId: userId,
      stage: { $nin: ["won", "lost"] }
    }),
    count(EstimateModel.collection.collectionName, {
      ownerId: userId,
      status: { $ne: "client_approved" }
    }),
    count(ProjectModel.collection.collectionName, {
      initiatingDesignerId: userId,
      status: { $ne: "completed" }
    }),
    count(ProjectModel.collection.collectionName, {
      assignedDesignerIds: userId,
      status: { $ne: "completed" }
    }),
    count(ProjectModel.collection.collectionName, {
      managerId: userId,
      status: { $ne: "completed" }
    }),
    count(USERS_COLLECTION, { managerId: userId }),
    count(ProjectModel.collection.collectionName, { clientId: userId }),
    count(ProjectAccessGrantModel.collection.collectionName, {
      userId,
      module: "projects",
      source: "admin_initiator",
      active: true
    })
  ]);

  return {
    ownedActiveLeads,
    ownedActiveEstimates,
    initiatedActiveProjects,
    assignedActiveProjects,
    managedActiveProjects,
    ownedActiveTasks: activeTasks.length,
    directReports,
    linkedClientProjects,
    adminInitiatorGrants,
    activeTaskIds: activeTasks.map(({ _id }) => String(_id))
  };
}

function assertExpectedResponsibilities(responsibilities: ResponsibilitySnapshot): void {
  if (
    responsibilities.ownedActiveTasks !== EXPECTED_LEGACY_DESIGNER_TASK_COUNT ||
    responsibilities.ownedActiveLeads !== 0 ||
    responsibilities.ownedActiveEstimates !== 0 ||
    responsibilities.initiatedActiveProjects !== 0 ||
    responsibilities.assignedActiveProjects !== 0 ||
    responsibilities.managedActiveProjects !== 0 ||
    responsibilities.directReports !== 0 ||
    responsibilities.linkedClientProjects !== 0 ||
    responsibilities.adminInitiatorGrants !== 0
  ) {
    fail("BASELINE_MISMATCH");
  }
}

function assertLegacyBaselineFingerprint(
  config: ProductionSuperAdminBootstrapConfig,
  legacyDesigner: PlainDocument,
  responsibilities: ResponsibilitySnapshot
): void {
  const actual = privateFingerprint({
    stableLegacyIdentity: stableLegacyIdentity(legacyDesigner),
    activeTaskIds: responsibilities.activeTaskIds
  });
  if (actual !== config.legacyBaselineFingerprint) {
    fail("BASELINE_MISMATCH");
  }
}

async function canonicalSuperAdminMatches(
  existing: PlainDocument,
  config: ProductionSuperAdminBootstrapConfig,
  comparePassword: (password: string, hash: string) => Promise<boolean>
): Promise<boolean> {
  if (
    typeof existing._id !== "string" ||
    existing.name !== config.name ||
    existing.email !== config.email ||
    existing.emailNormalized !== config.emailNormalized ||
    typeof existing.passwordHash !== "string" ||
    existing.role !== "super_admin" ||
    existing.active !== true ||
    existing.accountKind !== "standard" ||
    existing.version !== 1 ||
    existing.mobile != null ||
    existing.address != null ||
    existing.managerId != null ||
    !Array.isArray(existing.authorizedClientIds) ||
    existing.authorizedClientIds.length !== 0 ||
    isReservedDevelopmentDemoIdentity({
      id: existing._id,
      emailNormalized: config.emailNormalized,
      accountKind: "standard"
    })
  ) {
    return false;
  }
  try {
    return await comparePassword(config.password, existing.passwordHash);
  } catch {
    return false;
  }
}

type MongoCollection = NonNullable<Connection["db"]> extends infer Database
  ? Database extends { collection(name: string): infer Collection }
    ? Collection
    : never
  : never;

async function inspectUserIndexes(collection: MongoCollection): Promise<IndexInspection> {
  let actual: Array<Record<string, unknown>>;
  try {
    actual = await collection.listIndexes().toArray() as Array<Record<string, unknown>>;
  } catch {
    fail("INDEX_CONFLICT");
  }
  const expected: CanonicalIndex[] = [
    // MongoDB guarantees _id uniqueness but omits `unique: true` from
    // listIndexes() metadata, so compare the representation the server returns.
    { name: "_id_", key: { _id: 1 }, unique: false },
    ...expectedUserIndexes(),
    { ...LEGACY_EMAIL_INDEX }
  ];
  const expectedNames = new Set(expected.map(({ name }) => name));
  if (
    actual.some(
      (index) => typeof index.name !== "string" || !expectedNames.has(index.name)
    )
  ) {
    fail("INDEX_CONFLICT");
  }

  let missing = false;
  for (const requirement of expected) {
    const candidate = actual.find((index) => index.name === requirement.name);
    if (!candidate) {
      missing = true;
      continue;
    }
    if (
      !keysEqual(candidate.key, requirement.key) ||
      Boolean(candidate.unique) !== requirement.unique ||
      !partialFiltersEqual(
        candidate.partialFilterExpression,
        requirement.partialFilterExpression
      )
    ) {
      fail("INDEX_CONFLICT");
    }
  }

  const indexes = actual
    .map(canonicalIndex)
    .sort((left, right) => left.name.localeCompare(right.name));
  return { state: missing ? "missing" : "compatible", indexes };
}

function canonicalIndex(index: Record<string, unknown>): CanonicalIndex {
  if (
    typeof index.name !== "string" ||
    !index.key ||
    typeof index.key !== "object"
  ) {
    fail("INDEX_CONFLICT");
  }
  const key = Object.fromEntries(
    Object.entries(index.key as Record<string, unknown>).map(([field, direction]) => {
      if (direction !== 1 && direction !== -1) fail("INDEX_CONFLICT");
      return [field, direction];
    })
  );
  return {
    name: index.name,
    key,
    unique: Boolean(index.unique),
    ...(index.partialFilterExpression === undefined
      ? {}
      : {
          partialFilterExpression: index.partialFilterExpression as Record<
            string,
            unknown
          >
        })
  };
}

function expectedUserIndexes(): CanonicalIndex[] {
  const schemaIndexes = UserModel.schema.indexes() as Array<[
    Record<string, number>,
    {
      name?: unknown;
      unique?: boolean;
      partialFilterExpression?: Record<string, unknown>;
    }
  ]>;
  return schemaIndexes.map(([key, options]) => ({
    name:
      typeof options.name === "string"
        ? options.name
        : Object.entries(key)
            .map(([field, direction]) => `${field}_${String(direction)}`)
            .join("_"),
    key,
    unique: options.unique === true,
    ...(options.partialFilterExpression
      ? { partialFilterExpression: options.partialFilterExpression }
      : {})
  }));
}

function keysEqual(actual: unknown, expected: Record<string, number>): boolean {
  if (!actual || typeof actual !== "object") return false;
  const actualEntries = Object.entries(actual as Record<string, unknown>);
  const expectedEntries = Object.entries(expected);
  return (
    actualEntries.length === expectedEntries.length &&
    actualEntries.every(
      ([field, direction], index) =>
        field === expectedEntries[index]?.[0] && direction === expectedEntries[index]?.[1]
    )
  );
}

function partialFiltersEqual(actual: unknown, expected: unknown): boolean {
  if (actual === undefined && expected === undefined) return true;
  return stableSerialize(actual) === stableSerialize(expected);
}

function baselineSignature(inspection: TargetInspection): string {
  return privateFingerprint({
    ...approvalBaseline(inspection),
    fullLegacyDocument: inspection.legacyDesigner
  });
}

function approvalBaseline(inspection: TargetInspection): Record<string, unknown> {
  const postState = inspection.state === "provisioned";
  const collectionCounts = inspection.collectionCounts.map(({ name, count }) => ({
    name,
    count: postState && name === USERS_COLLECTION ? count - 1 : count
  }));
  return {
    state: "eligible",
    collectionCounts,
    collectionCount: inspection.collectionCount,
    documentCount: inspection.documentCount - (postState ? 1 : 0),
    userCount: inspection.userCount - (postState ? 1 : 0),
    legacyDesignerCount: inspection.legacyDesignerCount,
    legacyDesignerTaskCount: inspection.legacyDesignerTaskCount,
    superAdminCount: 0,
    targetIdentityCount: 0,
    indexState: inspection.indexState,
    indexes: inspection.indexes,
    stableLegacyIdentityFingerprint: privateFingerprint(
      stableLegacyIdentity(inspection.legacyDesigner)
    ),
    responsibilityCounts: {
      ownedActiveLeads: inspection.responsibilities.ownedActiveLeads,
      ownedActiveEstimates: inspection.responsibilities.ownedActiveEstimates,
      initiatedActiveProjects: inspection.responsibilities.initiatedActiveProjects,
      assignedActiveProjects: inspection.responsibilities.assignedActiveProjects,
      managedActiveProjects: inspection.responsibilities.managedActiveProjects,
      ownedActiveTasks: inspection.responsibilities.ownedActiveTasks,
      directReports: inspection.responsibilities.directReports,
      linkedClientProjects: inspection.responsibilities.linkedClientProjects,
      adminInitiatorGrants: inspection.responsibilities.adminInitiatorGrants
    },
    taskReferenceFingerprint: privateFingerprint(
      inspection.responsibilities.activeTaskIds
    )
  };
}

function stableLegacyIdentity(document: PlainDocument): PlainDocument {
  const stable = { ...document };
  delete stable.active;
  delete stable.accountKind;
  delete stable.version;
  delete stable.updatedAt;
  return stable;
}

function privateFingerprint(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value), "utf8").digest("hex");
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (value instanceof Date) return { $date: value.toISOString() };
  if (Buffer.isBuffer(value)) return { $buffer: value.toString("hex") };
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown> & { toHexString?: () => string };
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

function exactLegacyDocumentFilter(document: PlainDocument): PlainDocument {
  return {
    ...document,
    $and: [
      { accountKind: { $exists: false } },
      { version: { $exists: false } }
    ]
  };
}

function postWriteMatchesBaseline(
  before: TargetInspection,
  after: TargetInspection,
  quarantineTimestamp: Date
): boolean {
  if (
    before.state !== "eligible" ||
    after.state !== "provisioned" ||
    after.collectionCount !== before.collectionCount ||
    after.documentCount !== before.documentCount + 1 ||
    after.userCount !== before.userCount + 1 ||
    after.legacyDesignerCount !== before.legacyDesignerCount ||
    after.legacyDesignerTaskCount !== before.legacyDesignerTaskCount ||
    after.superAdminCount !== 1 ||
    after.targetIdentityCount !== 1 ||
    stableSerialize(after.indexes) !== stableSerialize(before.indexes) ||
    stableSerialize(after.responsibilities) !== stableSerialize(before.responsibilities)
  ) {
    return false;
  }
  const expectedCollectionCounts = before.collectionCounts.map(({ name, count }) => ({
    name,
    count: name === USERS_COLLECTION ? count + 1 : count
  }));
  if (stableSerialize(after.collectionCounts) !== stableSerialize(expectedCollectionCounts)) {
    return false;
  }
  const expectedLegacyDesigner: PlainDocument = {
    ...before.legacyDesigner,
    active: false,
    accountKind: "development_demo",
    version: 1,
    updatedAt: quarantineTimestamp
  };
  return stableSerialize(after.legacyDesigner) === stableSerialize(expectedLegacyDesigner);
}

async function inspectAfterTransactionFailure(
  connection: Connection,
  config: ProductionSuperAdminBootstrapConfig,
  comparePassword: (password: string, hash: string) => Promise<boolean>
): Promise<TargetInspection | null> {
  try {
    return await inspectTarget(connection, config, comparePassword);
  } catch {
    return null;
  }
}

function reportFor(
  config: ProductionSuperAdminBootstrapConfig,
  status: ProductionSuperAdminBootstrapReport["status"],
  inspection: TargetInspection,
  approvalDigest: string,
  proposedQuarantineCount: 0 | 1,
  proposedInsertCount: 0 | 1
): ProductionSuperAdminBootstrapReport {
  return {
    mode: config.mode,
    status,
    target: PRODUCTION_SUPER_ADMIN_TARGET,
    targetFingerprint: config.targetFingerprint,
    collectionCount: inspection.collectionCount,
    documentCount: inspection.documentCount,
    userCount: inspection.userCount,
    legacyDesignerCount: inspection.legacyDesignerCount,
    legacyDesignerTaskCount: inspection.legacyDesignerTaskCount,
    superAdminCount: inspection.superAdminCount,
    targetIdentityCount: inspection.targetIdentityCount,
    indexState: "compatible",
    proposedQuarantineCount,
    proposedInsertCount,
    approvalDigest
  };
}

function fail(
  code: ProductionSuperAdminBootstrapErrorCode,
  committed = false
): never {
  throw new ProductionSuperAdminBootstrapError(code, committed);
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  runProductionSuperAdminBootstrapCommand().catch((error: unknown) => {
    const code =
      error instanceof ProductionSuperAdminBootstrapError
        ? error.code
        : "TRANSACTION_FAILED";
    const committed =
      error instanceof ProductionSuperAdminBootstrapError
        ? error.committed
        : false;
    process.stderr.write(
      `${JSON.stringify({ status: "error", code, committed })}\n`
    );
    process.exitCode = 1;
  });
}
