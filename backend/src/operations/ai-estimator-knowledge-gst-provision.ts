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
  AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY,
  AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_SYSTEM_ACTOR_ID,
  fixedGstRuleDocument,
  fixedGstVersionDocument
} from "../domain/ai-estimator-knowledge-fixed-gst.js";

export const AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_SYSTEM_ACTOR_ID =
  AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_SYSTEM_ACTOR_ID;
export const AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MAINTENANCE_CONFIRMATION =
  "ai_estimator_knowledge_gst_provision_has_no_other_writers" as const;
export const AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_BACKUP_CONFIRMATION =
  "verified_backup_covers_ai_estimator_knowledge_tax_policy_and_audits" as const;

const MINIMUM_APPROVAL_KEY_LENGTH = 32;
const TAX_RULE_COLLECTION = "aiEstimatorKnowledgeTaxRules";
const TAX_VERSION_COLLECTION = "aiEstimatorKnowledgeTaxVersions";
const AUDIT_COLLECTION = "auditevents";
const OPERATION_REASON = "Provision the approved fixed GST 18% AI Estimator Knowledge policy.";

export const AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST = Object.freeze({
  manifestVersion: "ai-estimator-knowledge-gst-provision-v1",
  policy: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY
});

export const AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST_DIGEST =
  createKnowledgeContentDigest(AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST);

export type AiEstimatorKnowledgeGstProvisionErrorCode =
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

export class AiEstimatorKnowledgeGstProvisionError extends Error {
  constructor(
    readonly code: AiEstimatorKnowledgeGstProvisionErrorCode,
    readonly committed = false
  ) {
    super(code);
    this.name = "AiEstimatorKnowledgeGstProvisionError";
  }
}

export interface AiEstimatorKnowledgeGstProvisionConfig {
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

export interface AiEstimatorKnowledgeGstProvisionConflict {
  readonly code:
    | "ID_CONFLICT"
    | "CODE_CONFLICT"
    | "NAME_CONFLICT"
    | "VERSION_NUMBER_CONFLICT"
    | "VALUE_CONFLICT"
    | "AUDIT_CONFLICT";
  readonly canonicalId: string;
  readonly conflictingId: string;
  readonly field: string;
  readonly expected: string | number | null;
  readonly actual: string | number | null;
}

export interface AiEstimatorKnowledgeGstProvisionWrite {
  readonly operation: "insert";
  readonly kind: "tax_rule" | "tax_version";
  readonly id: string;
}

export interface AiEstimatorKnowledgeGstProvisionReport {
  readonly mode: "dry_run" | "write";
  readonly status: "eligible" | "blocked" | "applied" | "already_applied";
  readonly target: string;
  readonly targetFingerprint: string;
  readonly manifestDigest: string;
  readonly exactMatches: readonly ("tax_rule" | "tax_version")[];
  readonly missingRecords: readonly ("tax_rule" | "tax_version")[];
  readonly conflicts: readonly AiEstimatorKnowledgeGstProvisionConflict[];
  readonly proposedWrites: readonly AiEstimatorKnowledgeGstProvisionWrite[];
  readonly appliedWrites: readonly AiEstimatorKnowledgeGstProvisionWrite[];
  readonly implicitDeleteCount: 0;
  readonly implicitArchiveCount: 0;
  readonly implicitRemapCount: 0;
  readonly customRecordRewriteCount: 0;
  readonly backupRequiredForWrite: true;
  readonly backupConfirmed: boolean;
  readonly rollbackInstructions: readonly string[];
}

export interface AiEstimatorKnowledgeGstProvisionDependencies {
  readonly connection?: Connection;
  readonly runTransaction?: <T>(operation: (session: ClientSession) => Promise<T>) => Promise<T>;
  readonly now?: () => Date;
  readonly beforeTransaction?: () => Promise<void>;
  readonly afterMutation?: (session: ClientSession) => Promise<void>;
  readonly afterTransactionCommit?: () => Promise<void>;
}

export interface AiEstimatorKnowledgeGstProvisionCommandDependencies
  extends AiEstimatorKnowledgeGstProvisionDependencies {
  readonly argv?: string[];
  readonly environment?: Record<string, string | undefined>;
  readonly connect?: (
    uri: string,
    options: { autoIndex: false; autoCreate: false }
  ) => Promise<unknown>;
  readonly disconnect?: () => Promise<unknown>;
  readonly writeOutput?: (output: string) => void;
}

type Document = { _id: string } & Record<string, unknown>;
type RecordKind = "tax_rule" | "tax_version";
type AuditDocument = Document;

interface TargetInspection {
  readonly ruleDocuments: readonly Document[];
  readonly versionDocuments: readonly Document[];
  readonly auditDocuments: readonly AuditDocument[];
  readonly exactMatches: readonly RecordKind[];
  readonly missing: readonly RecordKind[];
  readonly conflicts: readonly AiEstimatorKnowledgeGstProvisionConflict[];
  readonly signature: string;
}

interface AppliedChange {
  readonly write: AiEstimatorKnowledgeGstProvisionWrite;
  readonly document: Document;
  readonly audit: AuditDocument;
}

export function aiEstimatorKnowledgeGstProvisionTargetFingerprint(
  host: string,
  databaseName: string
): string {
  return createHash("sha256")
    .update(`${host.toLowerCase()}|${databaseName}`, "utf8")
    .digest("hex");
}

export function aiEstimatorKnowledgeGstProvisionApprovalDigest(input: {
  mode: "dry_run" | "write";
  target: string;
  targetFingerprint: string;
  manifestDigest: string;
  backupConfirmed: boolean;
  approvalKey: string;
}): string {
  return createHmac("sha256", input.approvalKey)
    .update(canonicalKnowledgeJson({
      operation: "ai-estimator-knowledge-gst-provision-v1",
      mode: input.mode,
      target: input.target,
      targetFingerprint: input.targetFingerprint,
      manifestDigest: input.manifestDigest,
      maintenanceConfirmation: AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MAINTENANCE_CONFIRMATION,
      backupConfirmation: input.backupConfirmed
        ? AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_BACKUP_CONFIRMATION
        : null
    }), "utf8")
    .digest("hex");
}

export function parseAiEstimatorKnowledgeGstProvisionConfig(
  input: {
    argv?: string[];
    environment?: Record<string, string | undefined>;
  } = {}
): AiEstimatorKnowledgeGstProvisionConfig {
  const argv = input.argv ?? process.argv.slice(2);
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== "--write")) {
    fail("INVALID_ARGUMENTS");
  }
  const mode = argv[0] === "--write" ? "write" : "dry_run";
  const environment = input.environment ?? process.env;
  const mongodbUri = required(environment, "MONGODB_URI", false);
  const parsed = parseMongoTarget(mongodbUri);
  const target = `${parsed.host}/${parsed.databaseName}`;
  if (required(environment, "AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_TARGET") !== target) {
    fail("TARGET_MISMATCH");
  }
  const targetFingerprint = aiEstimatorKnowledgeGstProvisionTargetFingerprint(
    parsed.host,
    parsed.databaseName
  );
  if (
    required(environment, "AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_TARGET_FINGERPRINT") !==
    targetFingerprint
  ) {
    fail("TARGET_MISMATCH");
  }
  const manifestDigest = required(
    environment,
    "AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST_DIGEST"
  );
  if (manifestDigest !== AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST_DIGEST) {
    fail("MANIFEST_MISMATCH");
  }
  if (
    required(environment, "AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MAINTENANCE_CONFIRMATION") !==
    AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MAINTENANCE_CONFIRMATION
  ) {
    fail("MAINTENANCE_MISMATCH");
  }
  const backup = environment.AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_BACKUP_CONFIRMATION?.trim();
  if (backup !== undefined && backup !== AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_BACKUP_CONFIRMATION) {
    fail("INVALID_CONFIGURATION");
  }
  const backupConfirmed = backup === AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_BACKUP_CONFIRMATION;
  if (mode === "write" && !backupConfirmed) fail("BACKUP_CONFIRMATION_MISSING");
  const approvalKey = required(
    environment,
    "AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_APPROVAL_KEY",
    false
  );
  if (approvalKey.length < MINIMUM_APPROVAL_KEY_LENGTH) fail("INVALID_CONFIGURATION");
  const approvalDigest = aiEstimatorKnowledgeGstProvisionApprovalDigest({
    mode,
    target,
    targetFingerprint,
    manifestDigest,
    backupConfirmed,
    approvalKey
  });
  if (
    required(environment, "AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_APPROVAL_DIGEST") !==
    approvalDigest
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

export async function runAiEstimatorKnowledgeGstProvision(
  config: AiEstimatorKnowledgeGstProvisionConfig,
  dependencies: AiEstimatorKnowledgeGstProvisionDependencies = {}
): Promise<AiEstimatorKnowledgeGstProvisionReport> {
  const connection = dependencies.connection ?? mongoose.connection;
  assertConnectedTarget(connection, config);
  const initial = await inspectTarget(connection);
  if (initial.conflicts.length > 0) {
    if (config.mode === "write") fail("BASELINE_CONFLICT");
    return createReport(config, "blocked", initial, []);
  }
  if (initial.missing.length === 0) {
    return createReport(config, "already_applied", initial, []);
  }
  if (config.mode === "dry_run") {
    return createReport(config, "eligible", initial, []);
  }

  await dependencies.beforeTransaction?.();
  const timestamp = dependencies.now?.() ?? new Date();
  if (Number.isNaN(timestamp.getTime())) fail("INVALID_CONFIGURATION");
  const runTransaction = dependencies.runTransaction ??
    (<T>(operation: (session: ClientSession) => Promise<T>) => connection.transaction(operation));
  let completedSignature: string;
  let changes: readonly AppliedChange[];
  try {
    ({ completedSignature, changes } = await runTransaction(async (session) => {
      const current = await inspectTarget(connection, session);
      if (current.conflicts.length > 0 || current.signature !== initial.signature) {
        fail("WRITE_CONFLICT");
      }
      const planned = current.missing.map((kind) => createChange(kind, timestamp));
      for (const change of planned) {
        const collection = change.write.kind === "tax_rule"
          ? TAX_RULE_COLLECTION
          : TAX_VERSION_COLLECTION;
        const inserted = await connection.collection<Document>(collection).insertOne(
          change.document,
          { session }
        );
        if (!inserted.acknowledged) fail("WRITE_CONFLICT");
      }
      if (planned.length > 0) {
        await connection.collection<AuditDocument>(AUDIT_COLLECTION).insertMany(
          planned.map((change) => change.audit),
          { session }
        );
      }
      await dependencies.afterMutation?.(session);
      const completed = await inspectTarget(connection, session);
      if (completed.conflicts.length > 0 || completed.missing.length > 0) {
        fail("WRITE_CONFLICT");
      }
      await assertExactAudits(connection, planned, session);
      return { completedSignature: completed.signature, changes: planned };
    }));
  } catch (error) {
    if (error instanceof AiEstimatorKnowledgeGstProvisionError) throw error;
    if (isMongoWriteConflict(error)) fail("WRITE_CONFLICT");
    fail("TRANSACTION_FAILED");
  }

  try {
    await dependencies.afterTransactionCommit?.();
  } catch {
    throw new AiEstimatorKnowledgeGstProvisionError("POST_COMMIT_VERIFICATION_FAILED", true);
  }
  const after = await inspectTarget(connection);
  if (
    after.signature !== completedSignature ||
    after.conflicts.length > 0 ||
    after.missing.length > 0
  ) {
    throw new AiEstimatorKnowledgeGstProvisionError("POST_COMMIT_VERIFICATION_FAILED", true);
  }
  try {
    await assertExactAudits(connection, changes);
  } catch {
    throw new AiEstimatorKnowledgeGstProvisionError("POST_COMMIT_VERIFICATION_FAILED", true);
  }
  return createReport(
    config,
    "applied",
    after,
    changes.map((change) => change.write)
  );
}

export async function runAiEstimatorKnowledgeGstProvisionCommand(
  dependencies: AiEstimatorKnowledgeGstProvisionCommandDependencies = {}
): Promise<AiEstimatorKnowledgeGstProvisionReport> {
  const config = parseAiEstimatorKnowledgeGstProvisionConfig(dependencies);
  const connect = dependencies.connect ?? mongoose.connect.bind(mongoose);
  const disconnect = dependencies.disconnect ?? mongoose.disconnect.bind(mongoose);
  const writeOutput = dependencies.writeOutput ?? ((output: string) => process.stdout.write(output));
  let connected = false;
  let committed = false;
  try {
    try {
      await connect(config.mongodbUri, { autoIndex: false, autoCreate: false });
      connected = true;
    } catch {
      fail("CONNECTION_FAILED");
    }
    const report = await runAiEstimatorKnowledgeGstProvision(config, dependencies);
    committed = report.status === "applied";
    try {
      writeOutput(`${JSON.stringify(report)}\n`);
    } catch {
      throw new AiEstimatorKnowledgeGstProvisionError("OUTPUT_FAILED", committed);
    }
    return report;
  } finally {
    if (connected) {
      try {
        await disconnect();
      } catch {
        throw new AiEstimatorKnowledgeGstProvisionError("DISCONNECT_FAILED", committed);
      }
    }
  }
}

async function inspectTarget(
  connection: Connection,
  session?: ClientSession
): Promise<TargetInspection> {
  const policy = AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY;
  const ruleDocuments = await connection.collection<Document>(TAX_RULE_COLLECTION).find({
      $or: [
        { _id: policy.rule.id },
        { codeNormalized: normalizeKnowledgeIdentity(policy.rule.code) },
        { nameNormalized: normalizeKnowledgeIdentity(policy.rule.name) }
      ]
    }, { session }).sort({ _id: 1 }).toArray();
  const versionDocuments = await connection.collection<Document>(TAX_VERSION_COLLECTION).find({
      $or: [
        { _id: policy.version.id },
        { taxRuleId: policy.rule.id }
      ]
    }, { session }).sort({ _id: 1 }).toArray();
  const auditDocuments = await connection.collection<AuditDocument>(AUDIT_COLLECTION).find({
      _id: { $in: [auditIdFor("tax_rule"), auditIdFor("tax_version")] }
    }, { session }).sort({ _id: 1 }).toArray();
  const conflicts: AiEstimatorKnowledgeGstProvisionConflict[] = [];
  const exactMatches: RecordKind[] = [];
  const missing: RecordKind[] = [];
  const rule = ruleDocuments.find((document) => document._id === policy.rule.id);
  const version = versionDocuments.find((document) => document._id === policy.version.id);

  if (!rule) missing.push("tax_rule");
  else {
    const ruleConflicts = canonicalRuleConflicts(rule);
    if (ruleConflicts.length === 0) exactMatches.push("tax_rule");
    else conflicts.push(...ruleConflicts);
  }
  for (const candidate of ruleDocuments) {
    if (candidate._id === policy.rule.id) continue;
    if (matchesIdentity(candidate, "code", policy.rule.code)) {
      conflicts.push(collisionConflict("CODE_CONFLICT", "tax_rule", candidate, "code", policy.rule.code));
    }
    if (matchesIdentity(candidate, "name", policy.rule.name)) {
      conflicts.push(collisionConflict("NAME_CONFLICT", "tax_rule", candidate, "name", policy.rule.name));
    }
  }

  if (!version) missing.push("tax_version");
  else {
    const versionConflicts = canonicalVersionConflicts(version);
    if (versionConflicts.length === 0) exactMatches.push("tax_version");
    else conflicts.push(...versionConflicts);
  }
  for (const candidate of versionDocuments) {
    if (candidate._id === policy.version.id) continue;
    if (candidate.taxRuleId === policy.rule.id) {
      conflicts.push(collisionConflict(
        "VERSION_NUMBER_CONFLICT",
        "tax_version",
        candidate,
        "versionNumber",
        policy.version.versionNumber
      ));
    }
  }

  for (const kind of ["tax_rule", "tax_version"] as const) {
    const audit = auditDocuments.find((document) => document._id === auditIdFor(kind));
    if (!audit) continue;
    if (!exactMatches.includes(kind) || !isValidAudit(audit, kind)) {
      conflicts.push({
        code: "AUDIT_CONFLICT",
        canonicalId: canonicalId(kind),
        conflictingId: String(audit._id),
        field: "operationAudit",
        expected: `valid ${kind} provision audit for an exact record`,
        actual: "audit does not match canonical state"
      });
    }
  }

  conflicts.sort((left, right) =>
    left.canonicalId.localeCompare(right.canonicalId) ||
    left.code.localeCompare(right.code) ||
    left.conflictingId.localeCompare(right.conflictingId)
  );
  return {
    ruleDocuments,
    versionDocuments,
    auditDocuments,
    exactMatches,
    missing,
    conflicts,
    signature: createKnowledgeContentDigest({ ruleDocuments, versionDocuments, auditDocuments })
  };
}

function createChange(kind: RecordKind, timestamp: Date): AppliedChange {
  const write: AiEstimatorKnowledgeGstProvisionWrite = {
    operation: "insert",
    kind,
    id: canonicalId(kind)
  };
  const document = kind === "tax_rule"
    ? createRuleDocument(timestamp)
    : createVersionDocument(timestamp);
  return { write, document, audit: createAuditDocument(kind, timestamp) };
}

function createRuleDocument(timestamp: Date): Document {
  return fixedGstRuleDocument(timestamp) as Document;
}

function createVersionDocument(timestamp: Date): Document {
  return fixedGstVersionDocument(timestamp) as Document;
}

function createAuditDocument(kind: RecordKind, timestamp: Date): AuditDocument {
  const id = canonicalId(kind);
  return {
    _id: auditIdFor(kind),
    actorId: AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_SYSTEM_ACTOR_ID,
    action: kind === "tax_rule"
      ? "ai_estimator_knowledge_master_created"
      : "ai_estimator_knowledge_tax_version_created",
    entityType: kind === "tax_rule"
      ? "ai_estimator_knowledge_tax"
      : "ai_estimator_knowledge_tax_version",
    entityId: id,
    occurredAt: timestamp,
    oldValues: {},
    newValues: {
      gstProvisionManifestDigest: AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST_DIGEST,
      kind,
      fixedGstPolicyId: id
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
  const documents = await connection.collection<AuditDocument>(AUDIT_COLLECTION)
    .find({ _id: { $in: changes.map((change) => change.audit._id) } }, { session })
    .toArray();
  for (const change of changes) {
    const actual = documents.find((document) => document._id === change.audit._id);
    if (!actual || canonicalKnowledgeJson(actual) !== canonicalKnowledgeJson(change.audit)) {
      throw new Error("Fixed GST provisioning audit verification failed.");
    }
  }
}

function isValidAudit(audit: AuditDocument, kind: RecordKind): boolean {
  const expected = createAuditDocument(kind, audit.occurredAt instanceof Date
    ? audit.occurredAt
    : new Date(Number.NaN));
  return audit.occurredAt instanceof Date &&
    audit.createdAt instanceof Date &&
    canonicalKnowledgeJson(audit) === canonicalKnowledgeJson({
      ...expected,
      occurredAt: audit.occurredAt,
      createdAt: audit.createdAt
    });
}

function createReport(
  config: AiEstimatorKnowledgeGstProvisionConfig,
  status: AiEstimatorKnowledgeGstProvisionReport["status"],
  inspection: TargetInspection,
  appliedWrites: readonly AiEstimatorKnowledgeGstProvisionWrite[]
): AiEstimatorKnowledgeGstProvisionReport {
  const proposedWrites = status === "eligible" || status === "blocked"
    ? inspection.missing.map((kind) => ({
        operation: "insert" as const,
        kind,
        id: canonicalId(kind)
      }))
    : [];
  const rollbackWrites = appliedWrites.length > 0 ? appliedWrites : proposedWrites;
  return {
    mode: config.mode,
    status,
    target: config.target,
    targetFingerprint: config.targetFingerprint,
    manifestDigest: config.manifestDigest,
    exactMatches: inspection.exactMatches,
    missingRecords: inspection.missing,
    conflicts: inspection.conflicts,
    proposedWrites,
    appliedWrites,
    implicitDeleteCount: 0,
    implicitArchiveCount: 0,
    implicitRemapCount: 0,
    customRecordRewriteCount: 0,
    backupRequiredForWrite: true,
    backupConfirmed: config.backupConfirmed,
    rollbackInstructions: [
      `Before --write, take and verify a database backup covering ${TAX_RULE_COLLECTION}, ${TAX_VERSION_COLLECTION}, and ${AUDIT_COLLECTION}.`,
      `Exact insert IDs: ${JSON.stringify(rollbackWrites.map((write) => write.id))}.`,
      "Rollback must stop all writers and restore the verified pre-write backup; never overwrite, remap, or delete unrelated Tax records.",
      "Do not delete a provisioned GST record after any Price version references it; restore the backup instead."
    ]
  };
}

function canonicalId(kind: RecordKind): string {
  return kind === "tax_rule"
    ? AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.rule.id
    : AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.version.id;
}

function auditIdFor(kind: RecordKind): string {
  return `audit-ai-estimator-gst-provision-${kind}-${createHash("sha256")
    .update(`${canonicalId(kind)}|${AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST_DIGEST}`, "utf8")
    .digest("hex")}`;
}

function valueConflict(
  code: AiEstimatorKnowledgeGstProvisionConflict["code"],
  kind: RecordKind,
  document: Document,
  field: string,
  expected: string | number | null,
  actual: unknown = document[field]
): AiEstimatorKnowledgeGstProvisionConflict {
  return {
    code,
    canonicalId: canonicalId(kind),
    conflictingId: String(document._id),
    field,
    expected,
    actual: scalar(actual)
  };
}

function canonicalRuleConflicts(document: Document): AiEstimatorKnowledgeGstProvisionConflict[] {
  const policy = AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.rule;
  const conflicts: AiEstimatorKnowledgeGstProvisionConflict[] = [];
  const checks = [
    ["CODE_CONFLICT", "code", policy.code],
    ["CODE_CONFLICT", "codeNormalized", normalizeKnowledgeIdentity(policy.code)],
    ["NAME_CONFLICT", "name", policy.name],
    ["NAME_CONFLICT", "nameNormalized", normalizeKnowledgeIdentity(policy.name)],
    ["VALUE_CONFLICT", "displayOrder", policy.displayOrder],
    ["VALUE_CONFLICT", "status", policy.status]
  ] as const;
  for (const [code, field, expected] of checks) {
    if (document[field] !== expected) {
      conflicts.push(valueConflict(code, "tax_rule", document, field, expected));
    }
  }
  if (!isPositiveSafeInteger(document.version)) {
    conflicts.push(valueConflict(
      "VALUE_CONFLICT",
      "tax_rule",
      document,
      "version",
      "positive safe integer"
    ));
  }
  if (
    document.dependencyEpoch !== undefined &&
    !isNonNegativeSafeInteger(document.dependencyEpoch)
  ) {
    conflicts.push(valueConflict(
      "VALUE_CONFLICT",
      "tax_rule",
      document,
      "dependencyEpoch",
      "non-negative safe integer or absent"
    ));
  }
  return conflicts;
}

function canonicalVersionConflicts(document: Document): AiEstimatorKnowledgeGstProvisionConflict[] {
  const policy = AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY;
  const conflicts: AiEstimatorKnowledgeGstProvisionConflict[] = [];
  const checks = [
    ["ID_CONFLICT", "taxRuleId", policy.rule.id],
    ["VERSION_NUMBER_CONFLICT", "versionNumber", policy.version.versionNumber],
    ["VALUE_CONFLICT", "rateBps", policy.version.rateBps],
    ["VALUE_CONFLICT", "treatment", policy.version.treatment],
    ["VALUE_CONFLICT", "applicability", policy.version.applicability],
    ["VALUE_CONFLICT", "effectiveTo", policy.version.effectiveTo],
    ["VALUE_CONFLICT", "status", policy.version.status]
  ] as const;
  for (const [code, field, expected] of checks) {
    if (document[field] !== expected) {
      conflicts.push(valueConflict(code, "tax_version", document, field, expected));
    }
  }
  const effectiveFrom = isoDate(document.effectiveFrom);
  if (effectiveFrom !== policy.version.effectiveFrom) {
    conflicts.push(valueConflict(
      "VALUE_CONFLICT",
      "tax_version",
      document,
      "effectiveFrom",
      policy.version.effectiveFrom,
      effectiveFrom
    ));
  }
  if (!isPositiveSafeInteger(document.version)) {
    conflicts.push(valueConflict(
      "VALUE_CONFLICT",
      "tax_version",
      document,
      "version",
      "positive safe integer"
    ));
  }
  return conflicts;
}

function collisionConflict(
  code: "CODE_CONFLICT" | "NAME_CONFLICT" | "VERSION_NUMBER_CONFLICT",
  kind: RecordKind,
  document: Document,
  field: string,
  expected: string | number
): AiEstimatorKnowledgeGstProvisionConflict {
  return {
    code,
    canonicalId: canonicalId(kind),
    conflictingId: String(document._id),
    field,
    expected,
    actual: scalar(document[field])
  };
}

function matchesIdentity(document: Document, field: "code" | "name", expected: string): boolean {
  const normalized = normalizeKnowledgeIdentity(expected);
  return document[`${field}Normalized`] === normalized ||
    (typeof document[field] === "string" && normalizeKnowledgeIdentity(document[field]) === normalized);
}

function scalar(value: unknown): string | number | null {
  if (typeof value === "string" || typeof value === "number") return value;
  if (value === null || value === undefined) return null;
  return canonicalKnowledgeJson(value);
}

function isoDate(value: unknown): string | null {
  const date = value instanceof Date
    ? value
    : typeof value === "string"
      ? new Date(value)
      : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
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

function parseMongoTarget(uri: string): { host: string; databaseName: string } {
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
  if (value.hostname.length === 0 || databaseName.length === 0 || databaseName.includes("/")) {
    fail("INVALID_CONFIGURATION");
  }
  return { host: value.host.toLowerCase(), databaseName };
}

function assertConnectedTarget(
  connection: Connection,
  config: AiEstimatorKnowledgeGstProvisionConfig
): void {
  let connectedHost: string | undefined;
  let connectedSeedHosts: string[] = [];
  try {
    const options = connection.getClient().options;
    connectedHost = options.srvHost?.toLowerCase();
    connectedSeedHosts = options.hosts.map((host) => host.toString().toLowerCase());
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

function fail(code: AiEstimatorKnowledgeGstProvisionErrorCode): never {
  throw new AiEstimatorKnowledgeGstProvisionError(code);
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  runAiEstimatorKnowledgeGstProvisionCommand().catch((error) => {
    const provisionError = error instanceof AiEstimatorKnowledgeGstProvisionError
      ? error
      : new AiEstimatorKnowledgeGstProvisionError("TRANSACTION_FAILED");
    process.stderr.write(`${JSON.stringify({
      error: { code: provisionError.code, committed: provisionError.committed }
    })}\n`);
    process.exitCode = 1;
  });
}
