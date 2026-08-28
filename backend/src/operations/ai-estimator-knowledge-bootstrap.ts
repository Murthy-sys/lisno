import "dotenv/config";

import { createHash, createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";

import mongoose, { type ClientSession, type Connection } from "mongoose";

import type { AuditAction } from "../domain/audit-actions.js";
import { canonicalKnowledgeJson } from "../domain/ai-estimator-knowledge.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST,
  AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST_DIGEST,
  AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_SYSTEM_ACTOR_ID,
  AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_TIMESTAMP,
  type AiEstimatorKnowledgeBootstrapManifestResource
} from "./ai-estimator-knowledge-bootstrap.manifest.js";

export const AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MAINTENANCE_CONFIRMATION =
  "ai_estimator_knowledge_bootstrap_has_no_other_writers" as const;

const MINIMUM_APPROVAL_KEY_LENGTH = 32;
const AUDIT_COLLECTION = "auditevents";
const LEGACY_COLLECTIONS = [
  "estimationBaskets",
  "estimationMainLines",
  "estimationItems",
  "estimationUoms"
] as const;

export type AiEstimatorKnowledgeBootstrapErrorCode =
  | "INVALID_ARGUMENTS"
  | "INVALID_CONFIGURATION"
  | "TARGET_MISMATCH"
  | "MANIFEST_MISMATCH"
  | "APPROVAL_MISMATCH"
  | "BASELINE_CONFLICT"
  | "WRITE_CONFLICT"
  | "TRANSACTION_FAILED"
  | "POST_COMMIT_VERIFICATION_FAILED"
  | "CONNECTION_FAILED"
  | "DISCONNECT_FAILED"
  | "OUTPUT_FAILED";

export class AiEstimatorKnowledgeBootstrapError extends Error {
  constructor(
    readonly code: AiEstimatorKnowledgeBootstrapErrorCode,
    readonly committed = false
  ) {
    super(code);
    this.name = "AiEstimatorKnowledgeBootstrapError";
  }
}

export interface AiEstimatorKnowledgeBootstrapConfig {
  readonly mode: "dry_run" | "write";
  readonly mongodbUri: string;
  readonly target: string;
  readonly databaseName: string;
  readonly targetHost: string;
  readonly targetFingerprint: string;
  readonly manifestDigest: string;
  readonly maintenanceConfirmed: true;
  readonly approvalKey: string;
  readonly approvalDigest: string;
}

export interface AiEstimatorKnowledgeBootstrapConflict {
  readonly code:
    | "DOCUMENT_MISMATCH"
    | "UNMAPPED_EXISTING_DOCUMENT"
    | "LEGACY_COLLECTION_DATA"
    | "AUDIT_MISSING"
    | "AUDIT_WITHOUT_RESOURCE"
    | "AUDIT_MISMATCH";
  readonly collection: string;
  readonly resourceId: string | null;
}

export interface AiEstimatorKnowledgeBootstrapReport {
  readonly mode: "dry_run" | "write";
  readonly status: "eligible" | "blocked" | "created" | "already_applied";
  readonly target: string;
  readonly targetFingerprint: string;
  readonly manifestDigest: string;
  readonly expectedResourceCount: number;
  readonly existingResourceCount: number;
  readonly proposedInsertCount: number;
  readonly insertedResourceIds: readonly string[];
  readonly conflicts: readonly AiEstimatorKnowledgeBootstrapConflict[];
  readonly sourceWarnings: readonly string[];
  readonly backupRequired: true;
  readonly rollbackInstructions: readonly string[];
}

export interface AiEstimatorKnowledgeBootstrapDependencies {
  readonly connection?: Connection;
  readonly runTransaction?: <T>(
    operation: (session: ClientSession) => Promise<T>
  ) => Promise<T>;
  readonly afterInsert?: (session: ClientSession) => Promise<void>;
  readonly afterTransactionCommit?: () => Promise<void>;
}

export interface AiEstimatorKnowledgeBootstrapCommandDependencies
  extends AiEstimatorKnowledgeBootstrapDependencies {
  readonly argv?: string[];
  readonly environment?: Record<string, string | undefined>;
  readonly connect?: (
    uri: string,
    options: { autoIndex: false; autoCreate: false }
  ) => Promise<unknown>;
  readonly disconnect?: () => Promise<unknown>;
  readonly writeOutput?: (output: string) => void;
}

interface TargetInspection {
  readonly existing: AiEstimatorKnowledgeBootstrapManifestResource[];
  readonly missing: AiEstimatorKnowledgeBootstrapManifestResource[];
  readonly conflicts: AiEstimatorKnowledgeBootstrapConflict[];
}

export function aiEstimatorKnowledgeTargetFingerprint(
  host: string,
  databaseName: string
): string {
  return createHash("sha256")
    .update(`${host.toLowerCase()}|${databaseName}`, "utf8")
    .digest("hex");
}

export function aiEstimatorKnowledgeBootstrapApprovalDigest(input: {
  target: string;
  targetFingerprint: string;
  manifestDigest: string;
  approvalKey: string;
}): string {
  return createHmac("sha256", input.approvalKey)
    .update(canonicalKnowledgeJson({
      operation: "ai-estimator-knowledge-bootstrap-write-v1",
      target: input.target,
      targetFingerprint: input.targetFingerprint,
      manifestDigest: input.manifestDigest,
      maintenanceConfirmation:
        AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MAINTENANCE_CONFIRMATION
    }), "utf8")
    .digest("hex");
}

export function parseAiEstimatorKnowledgeBootstrapConfig(
  input: {
    argv?: string[];
    environment?: Record<string, string | undefined>;
  } = {}
): AiEstimatorKnowledgeBootstrapConfig {
  const argv = input.argv ?? process.argv.slice(2);
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== "--write")) {
    fail("INVALID_ARGUMENTS");
  }
  const environment = input.environment ?? process.env;
  const mongodbUri = required(environment, "MONGODB_URI", false);
  const parsed = parseMongoTarget(mongodbUri);
  const target = `${parsed.host}/${parsed.databaseName}`;
  if (required(environment, "AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_TARGET") !== target) {
    fail("TARGET_MISMATCH");
  }
  const targetFingerprint = aiEstimatorKnowledgeTargetFingerprint(
    parsed.host,
    parsed.databaseName
  );
  if (
    required(
      environment,
      "AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_TARGET_FINGERPRINT"
    ) !== targetFingerprint
  ) {
    fail("TARGET_MISMATCH");
  }
  const manifestDigest = required(
    environment,
    "AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST_DIGEST"
  );
  if (manifestDigest !== AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST_DIGEST) {
    fail("MANIFEST_MISMATCH");
  }
  if (
    required(
      environment,
      "AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MAINTENANCE_CONFIRMATION"
    ) !== AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MAINTENANCE_CONFIRMATION
  ) {
    fail("TARGET_MISMATCH");
  }
  const approvalKey = required(
    environment,
    "AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_APPROVAL_KEY",
    false
  );
  if (approvalKey.length < MINIMUM_APPROVAL_KEY_LENGTH) {
    fail("INVALID_CONFIGURATION");
  }
  const expectedApprovalDigest = aiEstimatorKnowledgeBootstrapApprovalDigest({
    target,
    targetFingerprint,
    manifestDigest,
    approvalKey
  });
  if (
    required(
      environment,
      "AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_APPROVAL_DIGEST"
    ) !== expectedApprovalDigest
  ) {
    fail("APPROVAL_MISMATCH");
  }
  return {
    mode: argv[0] === "--write" ? "write" : "dry_run",
    mongodbUri,
    target,
    databaseName: parsed.databaseName,
    targetHost: parsed.host,
    targetFingerprint,
    manifestDigest,
    maintenanceConfirmed: true,
    approvalKey,
    approvalDigest: expectedApprovalDigest
  };
}

export async function runAiEstimatorKnowledgeBootstrap(
  config: AiEstimatorKnowledgeBootstrapConfig,
  dependencies: AiEstimatorKnowledgeBootstrapDependencies = {}
): Promise<AiEstimatorKnowledgeBootstrapReport> {
  const connection = dependencies.connection ?? mongoose.connection;
  assertConnectedTarget(connection, config);
  const initial = await inspectTarget(connection);
  if (initial.conflicts.length > 0) {
    if (config.mode === "write") fail("BASELINE_CONFLICT");
    return report(config, "blocked", initial, []);
  }
  if (initial.missing.length === 0) {
    return report(config, "already_applied", initial, []);
  }
  if (config.mode === "dry_run") {
    return report(config, "eligible", initial, []);
  }

  const runTransaction =
    dependencies.runTransaction ??
    (<T>(operation: (session: ClientSession) => Promise<T>) =>
      connection.transaction(operation));
  const insertedIds = initial.missing.map((resource) =>
    String(resource.document._id)
  );
  try {
    await runTransaction(async (session) => {
      const current = await inspectTarget(connection, session);
      if (
        current.conflicts.length > 0 ||
        inspectionSignature(current) !== inspectionSignature(initial)
      ) {
        fail("WRITE_CONFLICT");
      }
      for (const [collectionName, resources] of groupByCollection(current.missing)) {
        await connection.collection(collectionName).insertMany(
          resources.map((resource) => resource.document),
          { session }
        );
      }
      const auditDocuments = current.missing.map(expectedAuditDocument);
      if (auditDocuments.length > 0) {
        await connection.collection(AUDIT_COLLECTION).insertMany(
          auditDocuments,
          { session }
        );
      }
      await dependencies.afterInsert?.(session);
    });
  } catch (error) {
    if (error instanceof AiEstimatorKnowledgeBootstrapError) throw error;
    fail("TRANSACTION_FAILED");
  }

  try {
    await dependencies.afterTransactionCommit?.();
  } catch {
    throw new AiEstimatorKnowledgeBootstrapError(
      "POST_COMMIT_VERIFICATION_FAILED",
      true
    );
  }
  const after = await inspectTarget(connection);
  if (after.conflicts.length > 0 || after.missing.length > 0) {
    throw new AiEstimatorKnowledgeBootstrapError(
      "POST_COMMIT_VERIFICATION_FAILED",
      true
    );
  }
  return report(config, "created", after, insertedIds);
}

export async function runAiEstimatorKnowledgeBootstrapCommand(
  dependencies: AiEstimatorKnowledgeBootstrapCommandDependencies = {}
): Promise<AiEstimatorKnowledgeBootstrapReport> {
  const config = parseAiEstimatorKnowledgeBootstrapConfig(dependencies);
  const connect = dependencies.connect ?? mongoose.connect.bind(mongoose);
  const disconnect = dependencies.disconnect ?? mongoose.disconnect.bind(mongoose);
  const writeOutput = dependencies.writeOutput ?? ((output: string) => process.stdout.write(output));
  let connected = false;
  try {
    try {
      await connect(config.mongodbUri, { autoIndex: false, autoCreate: false });
      connected = true;
    } catch {
      fail("CONNECTION_FAILED");
    }
    const value = await runAiEstimatorKnowledgeBootstrap(config, dependencies);
    try {
      writeOutput(`${JSON.stringify(value)}\n`);
    } catch {
      fail("OUTPUT_FAILED");
    }
    return value;
  } finally {
    if (connected) {
      try {
        await disconnect();
      } catch {
        fail("DISCONNECT_FAILED");
      }
    }
  }
}

async function inspectTarget(
  connection: Connection,
  session?: ClientSession
): Promise<TargetInspection> {
  const conflicts: AiEstimatorKnowledgeBootstrapConflict[] = [];
  for (const legacyCollection of LEGACY_COLLECTIONS) {
    if (
      (await connection.collection(legacyCollection).countDocuments({}, { session })) > 0
    ) {
      conflicts.push({
        code: "LEGACY_COLLECTION_DATA",
        collection: legacyCollection,
        resourceId: null
      });
    }
  }

  const expectedByCollection = groupByCollection(
    AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources
  );
  const existing: AiEstimatorKnowledgeBootstrapManifestResource[] = [];
  const missing: AiEstimatorKnowledgeBootstrapManifestResource[] = [];
  for (const [collectionName, resources] of expectedByCollection) {
    const documents = await connection
      .collection(collectionName)
      .find({}, { session })
      .toArray();
    const expectedById = new Map(
      resources.map((resource) => [String(resource.document._id), resource])
    );
    for (const document of documents) {
      const id = String(document._id);
      if (!expectedById.has(id)) {
        conflicts.push({
          code: "UNMAPPED_EXISTING_DOCUMENT",
          collection: collectionName,
          resourceId: id
        });
      }
    }
    for (const resource of resources) {
      const id = String(resource.document._id);
      const document = documents.find((candidate) => String(candidate._id) === id);
      if (!document) {
        missing.push(resource);
      } else if (
        canonicalKnowledgeJson(document) !==
        canonicalKnowledgeJson(resource.document)
      ) {
        conflicts.push({
          code: "DOCUMENT_MISMATCH",
          collection: collectionName,
          resourceId: id
        });
      } else {
        existing.push(resource);
      }
    }
  }

  const auditIds = AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources.map(
    auditIdFor
  );
  const auditDocuments = await connection
    .collection<{ _id: string } & Record<string, unknown>>(AUDIT_COLLECTION)
    .find({ _id: { $in: auditIds } }, { session })
    .toArray();
  for (const resource of AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources) {
    const id = auditIdFor(resource);
    const document = auditDocuments.find((candidate) => String(candidate._id) === id);
    const resourceExists = existing.includes(resource);
    if (!document && resourceExists) {
      conflicts.push({ code: "AUDIT_MISSING", collection: AUDIT_COLLECTION, resourceId: id });
    } else if (document && !resourceExists) {
      conflicts.push({ code: "AUDIT_WITHOUT_RESOURCE", collection: AUDIT_COLLECTION, resourceId: id });
    } else if (document && canonicalKnowledgeJson(document) !== canonicalKnowledgeJson(expectedAuditDocument(resource))) {
      conflicts.push({ code: "AUDIT_MISMATCH", collection: AUDIT_COLLECTION, resourceId: id });
    }
  }

  return { existing, missing, conflicts };
}

function expectedAuditDocument(
  resource: AiEstimatorKnowledgeBootstrapManifestResource
): Record<string, unknown> {
  const actions: Record<
    AiEstimatorKnowledgeBootstrapManifestResource["kind"],
    AuditAction
  > = {
    basket: "ai_estimator_knowledge_basket_created",
    main_line: "ai_estimator_knowledge_main_line_created",
    master: "ai_estimator_knowledge_master_created",
    tax_version: "ai_estimator_knowledge_tax_version_created",
    revision: "ai_estimator_knowledge_revision_created",
    section: "ai_estimator_knowledge_section_updated"
  };
  return {
    _id: auditIdFor(resource),
    actorId: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_SYSTEM_ACTOR_ID,
    action: actions[resource.kind],
    entityType: auditEntityType(resource),
    entityId: String(resource.document._id),
    occurredAt: new Date(AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_TIMESTAMP),
    oldValues: {},
    newValues: {
      bootstrapManifestDigest:
        AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST_DIGEST,
      version: resource.document.version ?? 1,
      status: resource.document.status ?? null
    },
    reason: "Initial approved AI Estimator Knowledge bootstrap manifest.",
    createdAt: new Date(AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_TIMESTAMP)
  };
}

function auditEntityType(
  resource: AiEstimatorKnowledgeBootstrapManifestResource
): string {
  const masterEntityTypes: Record<string, string> = {
    aiEstimatorKnowledgeUoms: "ai_estimator_knowledge_uom",
    aiEstimatorKnowledgeTaxRules: "ai_estimator_knowledge_tax",
    aiEstimatorKnowledgePriorities: "ai_estimator_knowledge_priority",
    aiEstimatorKnowledgeSurfaces: "ai_estimator_knowledge_surface",
    aiEstimatorKnowledgeModes: "ai_estimator_knowledge_mode"
  };
  return masterEntityTypes[resource.collection] ??
    `ai_estimator_knowledge_${resource.kind}`;
}

function auditIdFor(resource: AiEstimatorKnowledgeBootstrapManifestResource): string {
  return `audit-ai-estimator-bootstrap-${createHash("sha256")
    .update(`${resource.collection}|${String(resource.document._id)}`, "utf8")
    .digest("hex")}`;
}

function groupByCollection(
  resources: readonly AiEstimatorKnowledgeBootstrapManifestResource[]
): Map<string, AiEstimatorKnowledgeBootstrapManifestResource[]> {
  const grouped = new Map<string, AiEstimatorKnowledgeBootstrapManifestResource[]>();
  for (const resource of resources) {
    const current = grouped.get(resource.collection) ?? [];
    current.push(resource);
    grouped.set(resource.collection, current);
  }
  return grouped;
}

function inspectionSignature(inspection: TargetInspection): string {
  return canonicalKnowledgeJson({
    existing: inspection.existing.map((resource) => String(resource.document._id)).sort(),
    missing: inspection.missing.map((resource) => String(resource.document._id)).sort(),
    conflicts: inspection.conflicts
  });
}

function report(
  config: AiEstimatorKnowledgeBootstrapConfig,
  status: AiEstimatorKnowledgeBootstrapReport["status"],
  inspection: TargetInspection,
  insertedResourceIds: readonly string[]
): AiEstimatorKnowledgeBootstrapReport {
  const collections = [
    ...new Set(
      AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources.map(
        (resource) => resource.collection
      )
    ),
    AUDIT_COLLECTION
  ];
  return {
    mode: config.mode,
    status,
    target: config.target,
    targetFingerprint: config.targetFingerprint,
    manifestDigest: config.manifestDigest,
    expectedResourceCount:
      AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources.length,
    existingResourceCount: inspection.existing.length,
    proposedInsertCount: inspection.missing.length,
    insertedResourceIds,
    conflicts: inspection.conflicts,
    sourceWarnings: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.sourceWarnings,
    backupRequired: true,
    rollbackInstructions: [
      `Before --write, take and verify a database backup covering: ${collections.join(", ")}.`,
      "If rollback is required, stop all writers and restore the verified pre-write backup.",
      "Do not delete by collection or manifest digest without comparing the recorded insertedResourceIds and stable audit IDs."
    ]
  };
}

function parseMongoTarget(uri: string): {
  host: string;
  databaseName: string;
} {
  let value: URL;
  try {
    value = new URL(uri);
  } catch {
    fail("INVALID_CONFIGURATION");
  }
  if (value.protocol !== "mongodb:" && value.protocol !== "mongodb+srv:") {
    fail("INVALID_CONFIGURATION");
  }
  const databaseName = decodeURIComponent(value.pathname.replace(/^\//u, ""));
  if (
    value.hostname.length === 0 ||
    databaseName.length === 0 ||
    databaseName.includes("/")
  ) {
    fail("INVALID_CONFIGURATION");
  }
  return { host: value.host.toLowerCase(), databaseName };
}

function assertConnectedTarget(
  connection: Connection,
  config: AiEstimatorKnowledgeBootstrapConfig
): void {
  const clientOptions = connection.getClient().options;
  const connectedHost = clientOptions.srvHost?.toLowerCase();
  const connectedSeedHosts = clientOptions.hosts.map((host) =>
    host.toString().toLowerCase()
  );
  if (
    connection.readyState !== 1 ||
    !connection.db ||
    connection.db.databaseName !== config.databaseName ||
    (connectedHost === undefined
      ? !connectedSeedHosts.includes(config.targetHost)
      : connectedHost !== config.targetHost)
  ) {
    fail("TARGET_MISMATCH");
  }
}

function required(
  environment: Record<string, string | undefined>,
  key: string,
  trim = true
): string {
  const raw = environment[key];
  const value = trim ? raw?.trim() : raw;
  if (!value) fail("INVALID_CONFIGURATION");
  return value;
}

function fail(code: AiEstimatorKnowledgeBootstrapErrorCode): never {
  throw new AiEstimatorKnowledgeBootstrapError(code);
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  runAiEstimatorKnowledgeBootstrapCommand().catch((error) => {
    const code =
      error instanceof AiEstimatorKnowledgeBootstrapError
        ? error.code
        : "TRANSACTION_FAILED";
    process.stderr.write(`${JSON.stringify({ error: { code } })}\n`);
    process.exitCode = 1;
  });
}
