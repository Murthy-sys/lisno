import "dotenv/config";

import { createHash, createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";

import mongoose, { type ClientSession, type Connection } from "mongoose";

import {
  canonicalKnowledgeJson,
  createKnowledgeContentDigest,
  normalizeKnowledgeIdentity
} from "../domain/ai-estimator-knowledge.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES,
  AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS,
  type CanonicalKnowledgePriority
} from "../domain/ai-estimator-knowledge-priority.js";

export const AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_SYSTEM_ACTOR_ID =
  "system-ai-estimator-knowledge-priority-provision-v1" as const;
export const AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MAINTENANCE_CONFIRMATION =
  "ai_estimator_knowledge_priority_provision_has_no_other_writers" as const;
export const AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_BACKUP_CONFIRMATION =
  "verified_backup_covers_ai_estimator_knowledge_priorities_and_audits" as const;

const MINIMUM_APPROVAL_KEY_LENGTH = 32;
const PRIORITY_COLLECTION = "aiEstimatorKnowledgePriorities";
const AUDIT_COLLECTION = "auditevents";
const OPERATION_REASON =
  "Provision the approved canonical AI Estimator Knowledge Priority catalog.";

export const AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST = Object.freeze({
  manifestVersion: "ai-estimator-knowledge-priority-provision-v1",
  priorities: AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES
});

export const AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST_DIGEST =
  createKnowledgeContentDigest(
    AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST
  );

export type AiEstimatorKnowledgePriorityProvisionErrorCode =
  | "INVALID_ARGUMENTS"
  | "INVALID_CONFIGURATION"
  | "TARGET_MISMATCH"
  | "MANIFEST_MISMATCH"
  | "MAINTENANCE_MISMATCH"
  | "BACKUP_CONFIRMATION_MISSING"
  | "APPROVAL_MISMATCH"
  | "BASELINE_CONFLICT"
  | "WRITE_CONFLICT"
  | "TRANSACTION_FAILED"
  | "POST_COMMIT_VERIFICATION_FAILED"
  | "CONNECTION_FAILED"
  | "DISCONNECT_FAILED"
  | "OUTPUT_FAILED";

export class AiEstimatorKnowledgePriorityProvisionError extends Error {
  constructor(
    readonly code: AiEstimatorKnowledgePriorityProvisionErrorCode,
    readonly committed = false
  ) {
    super(code);
    this.name = "AiEstimatorKnowledgePriorityProvisionError";
  }
}

export interface AiEstimatorKnowledgePriorityProvisionConfig {
  readonly mode: "dry_run" | "write";
  readonly mongodbUri: string;
  readonly target: string;
  readonly databaseName: string;
  readonly targetHost: string;
  readonly targetFingerprint: string;
  readonly manifestDigest: string;
  readonly maintenanceConfirmed: true;
  readonly backupConfirmed: boolean;
  readonly approvalKey: string;
  readonly approvalDigest: string;
}

export interface AiEstimatorKnowledgePriorityProvisionSummary {
  readonly id: string;
  readonly semanticTier: CanonicalKnowledgePriority["semanticTier"];
  readonly code: string;
  readonly name: string;
  readonly displayOrder: number;
}

export interface AiEstimatorKnowledgePriorityProvisionRepair {
  readonly id: string;
  readonly kind: "legacy_medium_canonical_repair";
  readonly changedFields: readonly ("semanticTier" | "displayOrder")[];
  readonly before: {
    readonly semanticTier: string | null;
    readonly displayOrder: number;
  };
  readonly after: {
    readonly semanticTier: "medium";
    readonly displayOrder: 2;
  };
}

export interface AiEstimatorKnowledgePriorityProvisionConflict {
  readonly code: "ID_CONFLICT" | "CODE_CONFLICT" | "NAME_CONFLICT" |
    "TIER_CONFLICT" | "AUDIT_CONFLICT";
  readonly canonicalId: string;
  readonly conflictingId: string;
  readonly field: string;
  readonly expected: string | number | null;
  readonly actual: string | number | null;
}

export interface AiEstimatorKnowledgePriorityProvisionWrite {
  readonly operation: "insert" | "repair";
  readonly id: string;
  readonly fields: readonly string[];
}

export interface AiEstimatorKnowledgePriorityProvisionReport {
  readonly mode: "dry_run" | "write";
  readonly status: "eligible" | "blocked" | "applied" | "already_applied";
  readonly target: string;
  readonly targetFingerprint: string;
  readonly manifestDigest: string;
  readonly expectedPriorityCount: number;
  readonly exactMatches: readonly AiEstimatorKnowledgePriorityProvisionSummary[];
  readonly missingPriorities: readonly AiEstimatorKnowledgePriorityProvisionSummary[];
  readonly repairs: readonly AiEstimatorKnowledgePriorityProvisionRepair[];
  readonly conflicts: readonly AiEstimatorKnowledgePriorityProvisionConflict[];
  readonly proposedWrites: readonly AiEstimatorKnowledgePriorityProvisionWrite[];
  readonly appliedWrites: readonly AiEstimatorKnowledgePriorityProvisionWrite[];
  readonly insertedPriorityIds: readonly string[];
  readonly repairedPriorityIds: readonly string[];
  readonly implicitDeleteCount: 0;
  readonly implicitArchiveCount: 0;
  readonly implicitRemapCount: 0;
  readonly customRecordRewriteCount: 0;
  readonly backupRequiredForWrite: true;
  readonly backupConfirmed: boolean;
  readonly rollbackInstructions: readonly string[];
}

export interface AiEstimatorKnowledgePriorityProvisionDependencies {
  readonly connection?: Connection;
  readonly runTransaction?: <T>(
    operation: (session: ClientSession) => Promise<T>
  ) => Promise<T>;
  readonly now?: () => Date;
  readonly beforeTransaction?: () => Promise<void>;
  readonly afterMutation?: (session: ClientSession) => Promise<void>;
  readonly afterTransactionCommit?: () => Promise<void>;
}

export interface AiEstimatorKnowledgePriorityProvisionCommandDependencies
  extends AiEstimatorKnowledgePriorityProvisionDependencies {
  readonly argv?: string[];
  readonly environment?: Record<string, string | undefined>;
  readonly connect?: (
    uri: string,
    options: { autoIndex: false; autoCreate: false }
  ) => Promise<unknown>;
  readonly disconnect?: () => Promise<unknown>;
  readonly writeOutput?: (output: string) => void;
}

type PriorityDocument = {
  _id: string;
  version?: number;
  dependencyEpoch?: number;
  displayOrder?: number;
  [key: string]: unknown;
};
type AuditDocument = { _id: string } & Record<string, unknown>;

interface PlannedRepair {
  readonly canonical: CanonicalKnowledgePriority;
  readonly document: PriorityDocument;
  readonly report: AiEstimatorKnowledgePriorityProvisionRepair;
}

interface TargetInspection {
  readonly documents: readonly PriorityDocument[];
  readonly auditDocuments: readonly AuditDocument[];
  readonly exactMatches: readonly CanonicalKnowledgePriority[];
  readonly missing: readonly CanonicalKnowledgePriority[];
  readonly repairs: readonly PlannedRepair[];
  readonly conflicts: readonly AiEstimatorKnowledgePriorityProvisionConflict[];
  readonly signature: string;
}

interface AppliedChange {
  readonly write: AiEstimatorKnowledgePriorityProvisionWrite;
  readonly audit: AuditDocument;
}

interface TransactionResult {
  readonly changes: readonly AppliedChange[];
  readonly completedSignature: string;
}

export function aiEstimatorKnowledgePriorityProvisionTargetFingerprint(
  host: string,
  databaseName: string
): string {
  return createHash("sha256")
    .update(`${host.toLowerCase()}|${databaseName}`, "utf8")
    .digest("hex");
}

export function aiEstimatorKnowledgePriorityProvisionApprovalDigest(input: {
  mode: "dry_run" | "write";
  target: string;
  targetFingerprint: string;
  manifestDigest: string;
  backupConfirmed: boolean;
  approvalKey: string;
}): string {
  return createHmac("sha256", input.approvalKey)
    .update(canonicalKnowledgeJson({
      operation: "ai-estimator-knowledge-priority-provision-v1",
      mode: input.mode,
      target: input.target,
      targetFingerprint: input.targetFingerprint,
      manifestDigest: input.manifestDigest,
      maintenanceConfirmation:
        AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MAINTENANCE_CONFIRMATION,
      backupConfirmation: input.backupConfirmed
        ? AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_BACKUP_CONFIRMATION
        : null
    }), "utf8")
    .digest("hex");
}

export function parseAiEstimatorKnowledgePriorityProvisionConfig(
  input: {
    argv?: string[];
    environment?: Record<string, string | undefined>;
  } = {}
): AiEstimatorKnowledgePriorityProvisionConfig {
  const argv = input.argv ?? process.argv.slice(2);
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== "--write")) {
    fail("INVALID_ARGUMENTS");
  }
  const mode = argv[0] === "--write" ? "write" : "dry_run";
  const environment = input.environment ?? process.env;
  const mongodbUri = required(environment, "MONGODB_URI", false);
  const parsed = parseMongoTarget(mongodbUri);
  const target = `${parsed.host}/${parsed.databaseName}`;
  if (
    required(environment, "AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_TARGET") !==
    target
  ) {
    fail("TARGET_MISMATCH");
  }
  const targetFingerprint =
    aiEstimatorKnowledgePriorityProvisionTargetFingerprint(
      parsed.host,
      parsed.databaseName
    );
  if (
    required(
      environment,
      "AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_TARGET_FINGERPRINT"
    ) !== targetFingerprint
  ) {
    fail("TARGET_MISMATCH");
  }
  const manifestDigest = required(
    environment,
    "AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST_DIGEST"
  );
  if (
    manifestDigest !==
    AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST_DIGEST
  ) {
    fail("MANIFEST_MISMATCH");
  }
  if (
    required(
      environment,
      "AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MAINTENANCE_CONFIRMATION"
    ) !==
    AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MAINTENANCE_CONFIRMATION
  ) {
    fail("MAINTENANCE_MISMATCH");
  }
  const backupConfirmation = environment[
    "AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_BACKUP_CONFIRMATION"
  ]?.trim();
  if (
    backupConfirmation !== undefined &&
    backupConfirmation !==
      AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_BACKUP_CONFIRMATION
  ) {
    fail("INVALID_CONFIGURATION");
  }
  const backupConfirmed =
    backupConfirmation ===
    AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_BACKUP_CONFIRMATION;
  if (mode === "write" && !backupConfirmed) {
    fail("BACKUP_CONFIRMATION_MISSING");
  }
  const approvalKey = required(
    environment,
    "AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_APPROVAL_KEY",
    false
  );
  if (approvalKey.length < MINIMUM_APPROVAL_KEY_LENGTH) {
    fail("INVALID_CONFIGURATION");
  }
  const approvalDigest =
    aiEstimatorKnowledgePriorityProvisionApprovalDigest({
      mode,
      target,
      targetFingerprint,
      manifestDigest,
      backupConfirmed,
      approvalKey
    });
  if (
    required(
      environment,
      "AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_APPROVAL_DIGEST"
    ) !== approvalDigest
  ) {
    fail("APPROVAL_MISMATCH");
  }
  return {
    mode,
    mongodbUri,
    target,
    databaseName: parsed.databaseName,
    targetHost: parsed.host,
    targetFingerprint,
    manifestDigest,
    maintenanceConfirmed: true,
    backupConfirmed,
    approvalKey,
    approvalDigest
  };
}

export async function runAiEstimatorKnowledgePriorityProvision(
  config: AiEstimatorKnowledgePriorityProvisionConfig,
  dependencies: AiEstimatorKnowledgePriorityProvisionDependencies = {}
): Promise<AiEstimatorKnowledgePriorityProvisionReport> {
  const connection = dependencies.connection ?? mongoose.connection;
  assertConnectedTarget(connection, config);
  const initial = await inspectTarget(connection);
  if (initial.conflicts.length > 0) {
    if (config.mode === "write") fail("BASELINE_CONFLICT");
    return createReport(config, "blocked", initial, []);
  }
  if (initial.missing.length === 0 && initial.repairs.length === 0) {
    return createReport(config, "already_applied", initial, []);
  }
  if (config.mode === "dry_run") {
    return createReport(config, "eligible", initial, []);
  }

  await dependencies.beforeTransaction?.();
  const timestamp = dependencies.now?.() ?? new Date();
  if (Number.isNaN(timestamp.getTime())) fail("INVALID_CONFIGURATION");
  const runTransaction =
    dependencies.runTransaction ??
    (<T>(operation: (session: ClientSession) => Promise<T>) =>
      connection.transaction(operation));
  let transactionResult: TransactionResult;
  try {
    transactionResult = await runTransaction(async (session) => {
      const current = await inspectTarget(connection, session);
      if (
        current.conflicts.length > 0 ||
        current.signature !== initial.signature
      ) {
        fail("WRITE_CONFLICT");
      }
      const changes = planAppliedChanges(current, timestamp);
      if (current.missing.length > 0) {
        await connection.collection<PriorityDocument>(PRIORITY_COLLECTION).insertMany(
          current.missing.map((priority) =>
            createCanonicalPriorityDocument(priority, timestamp)
          ),
          { session }
        );
      }
      for (const repair of current.repairs) {
        const result = await connection.collection<PriorityDocument>(PRIORITY_COLLECTION).updateOne(
          { ...repair.document },
          {
            $set: {
              semanticTier: repair.canonical.semanticTier,
              displayOrder: repair.canonical.displayOrder,
              updatedById:
                AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_SYSTEM_ACTOR_ID,
              updatedAt: timestamp,
              version: (repair.document.version as number) + 1
            }
          },
          { session }
        );
        if (result.matchedCount !== 1 || result.modifiedCount !== 1) {
          fail("WRITE_CONFLICT");
        }
      }
      if (changes.length > 0) {
        await connection.collection<AuditDocument>(AUDIT_COLLECTION).insertMany(
          changes.map((change) => change.audit),
          { session }
        );
      }
      await dependencies.afterMutation?.(session);
      const completed = await inspectTarget(connection, session);
      if (
        completed.conflicts.length > 0 ||
        completed.missing.length > 0 ||
        completed.repairs.length > 0
      ) {
        fail("WRITE_CONFLICT");
      }
      await assertExactAudits(connection, changes, session);
      return { changes, completedSignature: completed.signature };
    });
  } catch (error) {
    if (error instanceof AiEstimatorKnowledgePriorityProvisionError) {
      throw error;
    }
    if (isMongoWriteConflict(error)) fail("WRITE_CONFLICT");
    fail("TRANSACTION_FAILED");
  }

  try {
    await dependencies.afterTransactionCommit?.();
  } catch {
    throw new AiEstimatorKnowledgePriorityProvisionError(
      "POST_COMMIT_VERIFICATION_FAILED",
      true
    );
  }
  const after = await inspectTarget(connection);
  if (
    after.signature !== transactionResult.completedSignature ||
    after.conflicts.length > 0 ||
    after.missing.length > 0 ||
    after.repairs.length > 0
  ) {
    throw new AiEstimatorKnowledgePriorityProvisionError(
      "POST_COMMIT_VERIFICATION_FAILED",
      true
    );
  }
  try {
    await assertExactAudits(connection, transactionResult.changes);
  } catch {
    throw new AiEstimatorKnowledgePriorityProvisionError(
      "POST_COMMIT_VERIFICATION_FAILED",
      true
    );
  }
  return createReport(
    config,
    "applied",
    after,
    transactionResult.changes.map((change) => change.write)
  );
}

export async function runAiEstimatorKnowledgePriorityProvisionCommand(
  dependencies: AiEstimatorKnowledgePriorityProvisionCommandDependencies = {}
): Promise<AiEstimatorKnowledgePriorityProvisionReport> {
  const config = parseAiEstimatorKnowledgePriorityProvisionConfig(dependencies);
  const connect = dependencies.connect ?? mongoose.connect.bind(mongoose);
  const disconnect =
    dependencies.disconnect ?? mongoose.disconnect.bind(mongoose);
  const writeOutput =
    dependencies.writeOutput ??
    ((output: string) => process.stdout.write(output));
  let connected = false;
  let committed = false;
  try {
    try {
      await connect(config.mongodbUri, { autoIndex: false, autoCreate: false });
      connected = true;
    } catch {
      fail("CONNECTION_FAILED");
    }
    const value = await runAiEstimatorKnowledgePriorityProvision(
      config,
      dependencies
    );
    committed = value.status === "applied";
    try {
      writeOutput(`${JSON.stringify(value)}\n`);
    } catch {
      throw new AiEstimatorKnowledgePriorityProvisionError(
        "OUTPUT_FAILED",
        committed
      );
    }
    return value;
  } finally {
    if (connected) {
      try {
        await disconnect();
      } catch {
        throw new AiEstimatorKnowledgePriorityProvisionError(
          "DISCONNECT_FAILED",
          committed
        );
      }
    }
  }
}

async function inspectTarget(
  connection: Connection,
  session?: ClientSession
): Promise<TargetInspection> {
  const documents = (await connection
    .collection<PriorityDocument>(PRIORITY_COLLECTION)
    .find({}, { session })
    .sort({ _id: 1 })
    .toArray()) as PriorityDocument[];
  const auditIds = AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES.flatMap(
    (priority) => [auditIdFor(priority.id, "insert"), auditIdFor(priority.id, "repair")]
  );
  const auditDocuments = (await connection
    .collection<AuditDocument>(AUDIT_COLLECTION)
    .find({ _id: { $in: auditIds } }, { session })
    .sort({ _id: 1 })
    .toArray()) as AuditDocument[];
  const conflicts: AiEstimatorKnowledgePriorityProvisionConflict[] = [];
  const exactMatches: CanonicalKnowledgePriority[] = [];
  const missing: CanonicalKnowledgePriority[] = [];
  const repairs: PlannedRepair[] = [];
  const byId = new Map(documents.map((document) => [String(document._id), document]));

  for (const canonical of AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES) {
    const document = byId.get(canonical.id);
    if (!document) {
      missing.push(canonical);
    } else {
      classifyCanonicalDocument(
        canonical,
        document,
        exactMatches,
        repairs,
        conflicts
      );
    }
    for (const candidate of documents) {
      const candidateId = String(candidate._id);
      if (candidateId === canonical.id) continue;
      if (matchesNormalizedCode(candidate, canonical.code)) {
        conflicts.push(collisionConflict(
          "CODE_CONFLICT",
          canonical,
          candidateId,
          "code",
          canonical.code,
          scalar(candidate.code)
        ));
      }
      if (matchesNormalizedName(candidate, canonical.name)) {
        conflicts.push(collisionConflict(
          "NAME_CONFLICT",
          canonical,
          candidateId,
          "name",
          canonical.name,
          scalar(candidate.name)
        ));
      }
      if (candidate.semanticTier === canonical.semanticTier) {
        conflicts.push(collisionConflict(
          "TIER_CONFLICT",
          canonical,
          candidateId,
          "semanticTier",
          canonical.semanticTier,
          scalar(candidate.semanticTier)
        ));
      }
    }
  }

  const exactIds = new Set(exactMatches.map((priority) => priority.id));
  for (const canonical of AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES) {
    const insertAudit = auditDocuments.find(
      (audit) => String(audit._id) === auditIdFor(canonical.id, "insert")
    );
    const repairAudit = auditDocuments.find(
      (audit) => String(audit._id) === auditIdFor(canonical.id, "repair")
    );
    if (insertAudit && repairAudit) {
      conflicts.push(auditConflict(
        canonical,
        "operationAudit",
        "at most one insert or repair audit",
        "both audits exist"
      ));
      continue;
    }
    const audit = insertAudit ?? repairAudit;
    if (!audit) continue;
    const kind = insertAudit ? "insert" : "repair";
    if (!exactIds.has(canonical.id) || !isValidExistingAudit(audit, canonical, kind)) {
      conflicts.push(auditConflict(
        canonical,
        "operationAudit",
        `valid ${kind} audit for an exact canonical record`,
        "audit does not match canonical state"
      ));
    }
  }

  conflicts.sort(compareConflicts);
  return {
    documents,
    auditDocuments,
    exactMatches,
    missing,
    repairs,
    conflicts,
    signature: createKnowledgeContentDigest({ documents, auditDocuments })
  };
}

function classifyCanonicalDocument(
  canonical: CanonicalKnowledgePriority,
  document: PriorityDocument,
  exactMatches: CanonicalKnowledgePriority[],
  repairs: PlannedRepair[],
  conflicts: AiEstimatorKnowledgePriorityProvisionConflict[]
): void {
  const invariantConflicts: AiEstimatorKnowledgePriorityProvisionConflict[] = [];
  expectIdField(canonical, document, invariantConflicts, "code", canonical.code);
  expectIdField(canonical, document, invariantConflicts, "name", canonical.name);
  expectIdField(
    canonical,
    document,
    invariantConflicts,
    "codeNormalized",
    normalizeKnowledgeIdentity(canonical.code)
  );
  expectIdField(
    canonical,
    document,
    invariantConflicts,
    "nameNormalized",
    normalizeKnowledgeIdentity(canonical.name)
  );
  expectIdField(canonical, document, invariantConflicts, "status", "active");
  if (!isPositiveSafeInteger(document.version)) {
    invariantConflicts.push(idConflict(
      canonical,
      "version",
      "positive safe integer",
      scalar(document.version)
    ));
  }
  if (
    document.dependencyEpoch !== undefined &&
    !isNonNegativeSafeInteger(document.dependencyEpoch)
  ) {
    invariantConflicts.push(idConflict(
      canonical,
      "dependencyEpoch",
      "non-negative safe integer or absent",
      scalar(document.dependencyEpoch)
    ));
  }
  if (!isNonNegativeSafeInteger(document.displayOrder)) {
    invariantConflicts.push(idConflict(
      canonical,
      "displayOrder",
      canonical.displayOrder,
      scalar(document.displayOrder)
    ));
  }

  const semanticTier = document.semanticTier;
  const tierIsMissing = semanticTier === undefined || semanticTier === null;
  const isMedium =
    canonical.id === AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.medium;
  const tierIsRepairable =
    isMedium && (tierIsMissing || semanticTier === canonical.semanticTier);
  const orderNeedsRepair = document.displayOrder !== canonical.displayOrder;
  const tierNeedsRepair = semanticTier !== canonical.semanticTier;
  if (
    invariantConflicts.length === 0 &&
    tierIsRepairable &&
    (tierNeedsRepair || orderNeedsRepair)
  ) {
    if ((document.version as number) >= Number.MAX_SAFE_INTEGER) {
      conflicts.push(idConflict(
        canonical,
        "version",
        `less than ${Number.MAX_SAFE_INTEGER}`,
        document.version as number
      ));
      return;
    }
    const changedFields: ("semanticTier" | "displayOrder")[] = [];
    if (tierNeedsRepair) changedFields.push("semanticTier");
    if (orderNeedsRepair) changedFields.push("displayOrder");
    repairs.push({
      canonical,
      document,
      report: {
        id: canonical.id,
        kind: "legacy_medium_canonical_repair",
        changedFields,
        before: {
          semanticTier: typeof semanticTier === "string" ? semanticTier : null,
          displayOrder: document.displayOrder as number
        },
        after: { semanticTier: "medium", displayOrder: 2 }
      }
    });
    return;
  }

  if (semanticTier !== canonical.semanticTier) {
    invariantConflicts.push(idConflict(
      canonical,
      "semanticTier",
      canonical.semanticTier,
      scalar(semanticTier)
    ));
  }
  if (document.displayOrder !== canonical.displayOrder) {
    invariantConflicts.push(idConflict(
      canonical,
      "displayOrder",
      canonical.displayOrder,
      scalar(document.displayOrder)
    ));
  }
  if (invariantConflicts.length === 0) {
    exactMatches.push(canonical);
  } else {
    conflicts.push(...invariantConflicts);
  }
}

function planAppliedChanges(
  inspection: TargetInspection,
  timestamp: Date
): readonly AppliedChange[] {
  const inserts: AppliedChange[] = inspection.missing.map((priority) => {
    const write: AiEstimatorKnowledgePriorityProvisionWrite = {
      operation: "insert",
      id: priority.id,
      fields: [
        "code",
        "name",
        "semanticTier",
        "displayOrder",
        "status",
        "version",
        "dependencyEpoch"
      ]
    };
    return { write, audit: createAuditDocument(priority, write, timestamp) };
  });
  const repairs: AppliedChange[] = inspection.repairs.map((repair) => {
    const write: AiEstimatorKnowledgePriorityProvisionWrite = {
      operation: "repair",
      id: repair.canonical.id,
      fields: repair.report.changedFields
    };
    return {
      write,
      audit: createAuditDocument(
        repair.canonical,
        write,
        timestamp,
        repair.document
      )
    };
  });
  return [...inserts, ...repairs];
}

function createCanonicalPriorityDocument(
  priority: CanonicalKnowledgePriority,
  timestamp: Date
): PriorityDocument {
  return {
    _id: priority.id,
    code: priority.code,
    codeNormalized: normalizeKnowledgeIdentity(priority.code),
    name: priority.name,
    nameNormalized: normalizeKnowledgeIdentity(priority.name),
    description: null,
    displayOrder: priority.displayOrder,
    status: "active",
    semanticTier: priority.semanticTier,
    version: 1,
    dependencyEpoch: 0,
    createdById: AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_SYSTEM_ACTOR_ID,
    updatedById: AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_SYSTEM_ACTOR_ID,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    archivedById: null
  };
}

function createAuditDocument(
  priority: CanonicalKnowledgePriority,
  write: AiEstimatorKnowledgePriorityProvisionWrite,
  timestamp: Date,
  previous?: PriorityDocument
): AuditDocument {
  const isInsert = write.operation === "insert";
  const previousVersion = isPositiveSafeInteger(previous?.version)
    ? previous.version
    : null;
  return {
    _id: auditIdFor(priority.id, write.operation),
    actorId: AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_SYSTEM_ACTOR_ID,
    action: isInsert
      ? "ai_estimator_knowledge_master_created"
      : "ai_estimator_knowledge_master_updated",
    entityType: "ai_estimator_knowledge_priority",
    entityId: priority.id,
    occurredAt: timestamp,
    oldValues: isInsert
      ? {}
      : {
          semanticTier:
            typeof previous?.semanticTier === "string"
              ? previous.semanticTier
              : null,
          displayOrder: previous?.displayOrder,
          version: previousVersion
        },
    newValues: isInsert
      ? {
          priorityProvisionManifestDigest:
            AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST_DIGEST,
          priority: summary(priority),
          status: "active",
          version: 1
        }
      : {
          priorityProvisionManifestDigest:
            AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST_DIGEST,
          semanticTier: priority.semanticTier,
          displayOrder: priority.displayOrder,
          version: (previousVersion ?? 0) + 1
        },
    reason: OPERATION_REASON,
    createdAt: timestamp
  };
}

async function assertExactAudits(
  connection: Connection,
  changes: readonly AppliedChange[],
  session?: ClientSession
): Promise<void> {
  if (changes.length === 0) return;
  const expectedIds = changes.map((change) => String(change.audit._id));
  const documents = await connection
    .collection<AuditDocument>(AUDIT_COLLECTION)
    .find({ _id: { $in: expectedIds } }, { session })
    .toArray();
  for (const change of changes) {
    const actual = documents.find(
      (document) => String(document._id) === String(change.audit._id)
    );
    if (
      !actual ||
      canonicalKnowledgeJson(actual) !== canonicalKnowledgeJson(change.audit)
    ) {
      throw new Error("Priority provisioning audit verification failed.");
    }
  }
}

function isValidExistingAudit(
  audit: AuditDocument,
  priority: CanonicalKnowledgePriority,
  kind: "insert" | "repair"
): boolean {
  if (
    audit.actorId !== AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_SYSTEM_ACTOR_ID ||
    audit.action !== (kind === "insert"
      ? "ai_estimator_knowledge_master_created"
      : "ai_estimator_knowledge_master_updated") ||
    audit.entityType !== "ai_estimator_knowledge_priority" ||
    audit.entityId !== priority.id ||
    audit.reason !== OPERATION_REASON ||
    !(audit.occurredAt instanceof Date) ||
    !(audit.createdAt instanceof Date)
  ) {
    return false;
  }
  const oldValues = record(audit.oldValues);
  const newValues = record(audit.newValues);
  if (
    !oldValues ||
    !newValues ||
    newValues.priorityProvisionManifestDigest !==
      AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST_DIGEST
  ) {
    return false;
  }
  if (kind === "insert") {
    return Object.keys(oldValues).length === 0 &&
      canonicalKnowledgeJson(newValues.priority) ===
        canonicalKnowledgeJson(summary(priority)) &&
      newValues.status === "active" &&
      newValues.version === 1;
  }
  return priority.id === AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.medium &&
    (oldValues.semanticTier === null || oldValues.semanticTier === "medium") &&
    isNonNegativeSafeInteger(oldValues.displayOrder) &&
    isPositiveSafeInteger(oldValues.version) &&
    newValues.semanticTier === "medium" &&
    newValues.displayOrder === 2 &&
    newValues.version === (oldValues.version as number) + 1;
}

function createReport(
  config: AiEstimatorKnowledgePriorityProvisionConfig,
  status: AiEstimatorKnowledgePriorityProvisionReport["status"],
  inspection: TargetInspection,
  appliedWrites: readonly AiEstimatorKnowledgePriorityProvisionWrite[]
): AiEstimatorKnowledgePriorityProvisionReport {
  const proposedWrites = status === "eligible" || status === "blocked"
    ? proposedWritesFor(inspection)
    : [];
  const rollbackWrites = appliedWrites.length > 0
    ? appliedWrites
    : proposedWrites;
  const insertedPriorityIds = appliedWrites
    .filter((write) => write.operation === "insert")
    .map((write) => write.id);
  const repairedPriorityIds = appliedWrites
    .filter((write) => write.operation === "repair")
    .map((write) => write.id);
  return {
    mode: config.mode,
    status,
    target: config.target,
    targetFingerprint: config.targetFingerprint,
    manifestDigest: config.manifestDigest,
    expectedPriorityCount:
      AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES.length,
    exactMatches: inspection.exactMatches.map(summary),
    missingPriorities: inspection.missing.map(summary),
    repairs: inspection.repairs.map((repair) => repair.report),
    conflicts: inspection.conflicts,
    proposedWrites,
    appliedWrites,
    insertedPriorityIds,
    repairedPriorityIds,
    implicitDeleteCount: 0,
    implicitArchiveCount: 0,
    implicitRemapCount: 0,
    customRecordRewriteCount: 0,
    backupRequiredForWrite: true,
    backupConfirmed: config.backupConfirmed,
    rollbackInstructions: rollbackInstructions(rollbackWrites)
  };
}

function proposedWritesFor(
  inspection: TargetInspection
): AiEstimatorKnowledgePriorityProvisionWrite[] {
  return [
    ...inspection.missing.map((priority) => ({
      operation: "insert" as const,
      id: priority.id,
      fields: [
        "code",
        "name",
        "semanticTier",
        "displayOrder",
        "status",
        "version",
        "dependencyEpoch"
      ]
    })),
    ...inspection.repairs.map((repair) => ({
      operation: "repair" as const,
      id: repair.canonical.id,
      fields: repair.report.changedFields
    }))
  ];
}

function rollbackInstructions(
  writes: readonly AiEstimatorKnowledgePriorityProvisionWrite[]
): string[] {
  const inserted = writes
    .filter((write) => write.operation === "insert")
    .map((write) => write.id);
  const repaired = writes
    .filter((write) => write.operation === "repair")
    .map((write) => write.id);
  return [
    `Before --write, take and verify a database backup covering ${PRIORITY_COLLECTION} and ${AUDIT_COLLECTION}.`,
    `Exact inserted Priority IDs: ${JSON.stringify(inserted)}. Exact repaired Priority IDs: ${JSON.stringify(repaired)}.`,
    "Rollback must use the verified pre-write backup and the exact IDs above after stopping all writers; do not rewrite custom Priority records or remap Main Line references.",
    "Never delete an inserted Priority that is referenced from a Knowledge section (including payload.priorityId or payload.recommendations.priorityId); preserve it or restore the backup instead."
  ];
}

function summary(
  priority: CanonicalKnowledgePriority
): AiEstimatorKnowledgePriorityProvisionSummary {
  return {
    id: priority.id,
    semanticTier: priority.semanticTier,
    code: priority.code,
    name: priority.name,
    displayOrder: priority.displayOrder
  };
}

function expectIdField(
  canonical: CanonicalKnowledgePriority,
  document: PriorityDocument,
  conflicts: AiEstimatorKnowledgePriorityProvisionConflict[],
  field: string,
  expected: string | number
): void {
  if (document[field] !== expected) {
    conflicts.push(idConflict(
      canonical,
      field,
      expected,
      scalar(document[field])
    ));
  }
}

function idConflict(
  canonical: CanonicalKnowledgePriority,
  field: string,
  expected: string | number | null,
  actual: string | number | null
): AiEstimatorKnowledgePriorityProvisionConflict {
  return {
    code: "ID_CONFLICT",
    canonicalId: canonical.id,
    conflictingId: canonical.id,
    field,
    expected,
    actual
  };
}

function collisionConflict(
  code: "CODE_CONFLICT" | "NAME_CONFLICT" | "TIER_CONFLICT",
  canonical: CanonicalKnowledgePriority,
  conflictingId: string,
  field: string,
  expected: string,
  actual: string | number | null
): AiEstimatorKnowledgePriorityProvisionConflict {
  return {
    code,
    canonicalId: canonical.id,
    conflictingId,
    field,
    expected,
    actual
  };
}

function auditConflict(
  canonical: CanonicalKnowledgePriority,
  field: string,
  expected: string,
  actual: string
): AiEstimatorKnowledgePriorityProvisionConflict {
  return {
    code: "AUDIT_CONFLICT",
    canonicalId: canonical.id,
    conflictingId: canonical.id,
    field,
    expected,
    actual
  };
}

function compareConflicts(
  left: AiEstimatorKnowledgePriorityProvisionConflict,
  right: AiEstimatorKnowledgePriorityProvisionConflict
): number {
  return left.canonicalId.localeCompare(right.canonicalId) ||
    left.code.localeCompare(right.code) ||
    left.conflictingId.localeCompare(right.conflictingId) ||
    left.field.localeCompare(right.field);
}

function matchesNormalizedCode(
  document: PriorityDocument,
  expectedCode: string
): boolean {
  const expected = normalizeKnowledgeIdentity(expectedCode);
  return document.codeNormalized === expected ||
    (typeof document.code === "string" &&
      normalizeKnowledgeIdentity(document.code) === expected);
}

function matchesNormalizedName(
  document: PriorityDocument,
  expectedName: string
): boolean {
  const expected = normalizeKnowledgeIdentity(expectedName);
  return document.nameNormalized === expected ||
    (typeof document.name === "string" &&
      normalizeKnowledgeIdentity(document.name) === expected);
}

function auditIdFor(
  priorityId: string,
  operation: "insert" | "repair"
): string {
  return `audit-ai-estimator-priority-provision-${operation}-${createHash("sha256")
    .update(`${priorityId}|${AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST_DIGEST}`, "utf8")
    .digest("hex")}`;
}

function scalar(value: unknown): string | number | null {
  if (typeof value === "string" || typeof value === "number") return value;
  if (value === undefined || value === null) return null;
  return canonicalKnowledgeJson(value);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 1;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isMongoWriteConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === 11000 || code === 112 || code === 251;
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
  config: AiEstimatorKnowledgePriorityProvisionConfig
): void {
  let connectedHost: string | undefined;
  let connectedSeedHosts: string[] = [];
  try {
    const clientOptions = connection.getClient().options;
    connectedHost = clientOptions.srvHost?.toLowerCase();
    connectedSeedHosts = clientOptions.hosts.map((host) =>
      host.toString().toLowerCase()
    );
  } catch {
    fail("TARGET_MISMATCH");
  }
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

function fail(code: AiEstimatorKnowledgePriorityProvisionErrorCode): never {
  throw new AiEstimatorKnowledgePriorityProvisionError(code);
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  runAiEstimatorKnowledgePriorityProvisionCommand().catch((error) => {
    const provisionError =
      error instanceof AiEstimatorKnowledgePriorityProvisionError
        ? error
        : new AiEstimatorKnowledgePriorityProvisionError("TRANSACTION_FAILED");
    process.stderr.write(`${JSON.stringify({
      error: {
        code: provisionError.code,
        committed: provisionError.committed
      }
    })}\n`);
    process.exitCode = 1;
  });
}
