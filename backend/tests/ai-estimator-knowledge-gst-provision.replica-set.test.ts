import mongoose from "mongoose";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { normalizeKnowledgeIdentity } from "../src/domain/ai-estimator-knowledge.js";
import { AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY } from "../src/domain/ai-estimator-knowledge-fixed-gst.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_BACKUP_CONFIRMATION,
  AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MAINTENANCE_CONFIRMATION,
  AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST_DIGEST,
  AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_SYSTEM_ACTOR_ID,
  AiEstimatorKnowledgeGstProvisionError,
  aiEstimatorKnowledgeGstProvisionApprovalDigest,
  aiEstimatorKnowledgeGstProvisionTargetFingerprint,
  parseAiEstimatorKnowledgeGstProvisionConfig,
  runAiEstimatorKnowledgeGstProvision,
  runAiEstimatorKnowledgeGstProvisionCommand,
  type AiEstimatorKnowledgeGstProvisionConfig
} from "../src/operations/ai-estimator-knowledge-gst-provision.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const DATABASE_NAME = "ai-estimator-knowledge-gst-provision-test";
const APPROVAL_KEY = "synthetic-local-gst-provision-key-000000001";
const TIMESTAMP = new Date("2026-09-02T10:00:00.000Z");
const TAX_RULE_COLLECTION = "aiEstimatorKnowledgeTaxRules";
const TAX_VERSION_COLLECTION = "aiEstimatorKnowledgeTaxVersions";
const AUDIT_COLLECTION = "auditevents";

let replicaSet: Awaited<ReturnType<typeof startMongoReplicaSet>>;

function environment(mode: "dry_run" | "write"): Record<string, string | undefined> {
  const parsed = new URL(replicaSet.uri);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  const target = `${parsed.host.toLowerCase()}/${databaseName}`;
  const targetFingerprint = aiEstimatorKnowledgeGstProvisionTargetFingerprint(
    parsed.host,
    databaseName
  );
  const backupConfirmed = mode === "write";
  const approvalDigest = aiEstimatorKnowledgeGstProvisionApprovalDigest({
    mode,
    target,
    targetFingerprint,
    manifestDigest: AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST_DIGEST,
    backupConfirmed,
    approvalKey: APPROVAL_KEY
  });
  return {
    MONGODB_URI: replicaSet.uri,
    AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_TARGET: target,
    AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_TARGET_FINGERPRINT: targetFingerprint,
    AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST_DIGEST:
      AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST_DIGEST,
    AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MAINTENANCE_CONFIRMATION:
      AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MAINTENANCE_CONFIRMATION,
    AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_BACKUP_CONFIRMATION: backupConfirmed
      ? AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_BACKUP_CONFIRMATION
      : undefined,
    AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_APPROVAL_KEY: APPROVAL_KEY,
    AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_APPROVAL_DIGEST: approvalDigest
  };
}

function config(mode: "dry_run" | "write"): AiEstimatorKnowledgeGstProvisionConfig {
  return parseAiEstimatorKnowledgeGstProvisionConfig({
    argv: mode === "write" ? ["--write"] : [],
    environment: environment(mode)
  });
}

function exactRule(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const rule = AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.rule;
  return {
    _id: rule.id,
    code: rule.code,
    codeNormalized: normalizeKnowledgeIdentity(rule.code),
    name: rule.name,
    nameNormalized: normalizeKnowledgeIdentity(rule.name),
    description: null,
    displayOrder: rule.displayOrder,
    status: rule.status,
    version: 1,
    dependencyEpoch: 0,
    createdById: "existing-owner",
    updatedById: "existing-owner",
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    archivedAt: null,
    archivedById: null,
    ...overrides
  };
}

function exactVersion(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const policy = AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY;
  return {
    _id: policy.version.id,
    taxRuleId: policy.rule.id,
    versionNumber: policy.version.versionNumber,
    rateBps: policy.version.rateBps,
    treatment: policy.version.treatment,
    applicability: policy.version.applicability,
    effectiveFrom: new Date(policy.version.effectiveFrom),
    effectiveTo: null,
    status: policy.version.status,
    version: 1,
    createdById: "existing-owner",
    updatedById: "existing-owner",
    createdAt: new Date("2026-08-28T00:00:00.000Z"),
    updatedAt: new Date("2026-08-28T00:00:00.000Z"),
    ...overrides
  };
}

async function snapshot(): Promise<{ rules: unknown[]; versions: unknown[]; audits: unknown[] }> {
  return {
    rules: await mongoose.connection.db!.collection(TAX_RULE_COLLECTION).find({}).sort({ _id: 1 }).toArray(),
    versions: await mongoose.connection.db!.collection(TAX_VERSION_COLLECTION).find({}).sort({ _id: 1 }).toArray(),
    audits: await mongoose.connection.db!.collection(AUDIT_COLLECTION).find({}).sort({ _id: 1 }).toArray()
  };
}

async function expectProvisionError(
  operation: Promise<unknown>,
  code: AiEstimatorKnowledgeGstProvisionError["code"]
): Promise<AiEstimatorKnowledgeGstProvisionError> {
  try {
    await operation;
    throw new Error("Expected fixed GST provisioning to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(AiEstimatorKnowledgeGstProvisionError);
    expect(error).toMatchObject({ code });
    expect(String(error)).not.toContain(replicaSet.uri);
    expect(String(error)).not.toContain(APPROVAL_KEY);
    return error as AiEstimatorKnowledgeGstProvisionError;
  }
}

beforeAll(async () => {
  replicaSet = await startMongoReplicaSet(DATABASE_NAME);
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

afterAll(async () => {
  await replicaSet.stop();
});

describe("AI Estimator Knowledge fixed GST provisioning on a local replica set", () => {
  it("dry-runs without writes or touching unrelated populated Tax data", async () => {
    await mongoose.connection.db!.collection(TAX_RULE_COLLECTION).insertOne({
      ...exactRule(),
      _id: "custom-tax",
      code: "CUSTOM",
      codeNormalized: "custom",
      name: "Custom Tax",
      nameNormalized: "custom tax"
    });
    await mongoose.connection.db!.collection(TAX_VERSION_COLLECTION).insertOne({
      ...exactVersion(),
      _id: "custom-tax-version-1",
      taxRuleId: "custom-tax"
    });
    const before = await snapshot();
    const outputs: string[] = [];
    const report = await runAiEstimatorKnowledgeGstProvisionCommand({
      argv: [],
      environment: environment("dry_run"),
      connection: mongoose.connection,
      connect: async () => undefined,
      disconnect: async () => undefined,
      writeOutput: (value) => outputs.push(value)
    });
    expect(report).toMatchObject({
      mode: "dry_run",
      status: "eligible",
      exactMatches: [],
      missingRecords: ["tax_rule", "tax_version"],
      conflicts: [],
      implicitDeleteCount: 0,
      implicitArchiveCount: 0,
      implicitRemapCount: 0,
      customRecordRewriteCount: 0,
      backupRequiredForWrite: true,
      backupConfirmed: false
    });
    expect(report.proposedWrites.map(({ id }) => id)).toEqual([
      AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.rule.id,
      AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.version.id
    ]);
    expect(outputs[0]).not.toContain(replicaSet.uri);
    expect(outputs[0]).not.toContain(APPROVAL_KEY);
    expect(await snapshot()).toEqual(before);
  });

  it("inserts the exact policy and deterministic audits once, then reruns idempotently", async () => {
    const applied = await runAiEstimatorKnowledgeGstProvision(config("write"), {
      now: () => TIMESTAMP
    });
    expect(applied.status).toBe("applied");
    expect(applied.appliedWrites.map(({ kind }) => kind)).toEqual(["tax_rule", "tax_version"]);
    expect(applied.rollbackInstructions.join(" ")).toContain(
      AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.version.id
    );
    const state = await snapshot();
    expect(state.rules).toEqual([expect.objectContaining({
      _id: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.rule.id,
      code: "GST_18",
      status: "active",
      dependencyEpoch: 0,
      createdById: AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_SYSTEM_ACTOR_ID
    })]);
    expect(state.versions).toEqual([expect.objectContaining({
      _id: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.version.id,
      taxRuleId: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.rule.id,
      rateBps: 1_800,
      treatment: "exclusive",
      effectiveTo: null,
      status: "active"
    })]);
    expect(state.audits).toHaveLength(2);

    const rerun = await runAiEstimatorKnowledgeGstProvision(config("write"), {
      now: () => new Date("2026-09-03T00:00:00.000Z")
    });
    expect(rerun).toMatchObject({ status: "already_applied", appliedWrites: [] });
    expect(await snapshot()).toEqual(state);
  });

  it("accepts an independently existing exact policy without rewriting it", async () => {
    await mongoose.connection.db!.collection(TAX_RULE_COLLECTION).insertOne(exactRule());
    await mongoose.connection.db!.collection(TAX_VERSION_COLLECTION).insertOne(exactVersion());
    const before = await snapshot();

    await expect(runAiEstimatorKnowledgeGstProvision(config("dry_run"))).resolves.toMatchObject({
      status: "already_applied",
      exactMatches: ["tax_rule", "tax_version"],
      missingRecords: [],
      conflicts: [],
      appliedWrites: []
    });
    await expect(runAiEstimatorKnowledgeGstProvision(config("write"))).resolves.toMatchObject({
      status: "already_applied",
      appliedWrites: []
    });
    expect(await snapshot()).toEqual(before);
  });

  it.each([
    ["canonical value", async () => {
      await mongoose.connection.db!.collection(TAX_RULE_COLLECTION)
        .insertOne(exactRule({ status: "inactive" }));
    }, "VALUE_CONFLICT"],
    ["code collision", async () => {
      await mongoose.connection.db!.collection(TAX_RULE_COLLECTION).insertOne({
        ...exactRule(),
        _id: "conflicting-tax",
        name: "Another Tax",
        nameNormalized: "another tax"
      });
    }, "CODE_CONFLICT"],
    ["name collision", async () => {
      await mongoose.connection.db!.collection(TAX_RULE_COLLECTION).insertOne({
        ...exactRule(),
        _id: "conflicting-tax",
        code: "OTHER",
        codeNormalized: "other"
      });
    }, "NAME_CONFLICT"],
    ["version number collision", async () => {
      await mongoose.connection.db!.collection(TAX_RULE_COLLECTION).insertOne(exactRule());
      await mongoose.connection.db!.collection(TAX_VERSION_COLLECTION).insertOne({
        ...exactVersion(),
        _id: "conflicting-version"
      });
    }, "VERSION_NUMBER_CONFLICT"],
    ["additional version under the canonical rule", async () => {
      await mongoose.connection.db!.collection(TAX_RULE_COLLECTION).insertOne(exactRule());
      await mongoose.connection.db!.collection(TAX_VERSION_COLLECTION).insertMany([
        exactVersion(),
        {
          ...exactVersion(),
          _id: "unexpected-canonical-tax-version-2",
          versionNumber: 2,
          effectiveFrom: new Date("2026-09-01T00:00:00.000Z")
        }
      ]);
    }, "VERSION_NUMBER_CONFLICT"],
    ["version owner identity", async () => {
      await mongoose.connection.db!.collection(TAX_RULE_COLLECTION).insertOne(exactRule());
      await mongoose.connection.db!.collection(TAX_VERSION_COLLECTION).insertOne(
        exactVersion({ taxRuleId: "another-tax-rule" })
      );
    }, "ID_CONFLICT"]
  ] as const)("reports %s conflict without overwriting populated data", async (_label, arrange, code) => {
    await arrange();
    const before = await snapshot();
    const dryRun = await runAiEstimatorKnowledgeGstProvision(config("dry_run"));
    expect(dryRun.status).toBe("blocked");
    expect(dryRun.conflicts.map((conflict) => conflict.code)).toContain(code);
    expect(await snapshot()).toEqual(before);
    await expectProvisionError(
      runAiEstimatorKnowledgeGstProvision(config("write")),
      "BASELINE_CONFLICT"
    );
    expect(await snapshot()).toEqual(before);
  });

  it("reports a deterministic audit conflict without repairing or overwriting it", async () => {
    await runAiEstimatorKnowledgeGstProvision(config("write"), { now: () => TIMESTAMP });
    await mongoose.connection.db!.collection(AUDIT_COLLECTION).updateOne(
      { action: "ai_estimator_knowledge_tax_version_created" },
      { $set: { "newValues.kind": "tampered" } }
    );
    const before = await snapshot();

    const dryRun = await runAiEstimatorKnowledgeGstProvision(config("dry_run"));
    expect(dryRun).toMatchObject({ status: "blocked" });
    expect(dryRun.conflicts).toContainEqual(expect.objectContaining({
      code: "AUDIT_CONFLICT",
      canonicalId: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.version.id
    }));
    await expectProvisionError(
      runAiEstimatorKnowledgeGstProvision(config("write")),
      "BASELINE_CONFLICT"
    );
    expect(await snapshot()).toEqual(before);
  });

  it("rolls back policy and audits when a transactional verification step fails", async () => {
    const before = await snapshot();
    await expectProvisionError(
      runAiEstimatorKnowledgeGstProvision(config("write"), {
        now: () => TIMESTAMP,
        afterMutation: async () => {
          throw new Error("injected verification failure");
        }
      }),
      "TRANSACTION_FAILED"
    );
    expect(await snapshot()).toEqual(before);
  });

  it("rolls back all inserts when the deterministic audit set fails verification", async () => {
    const before = await snapshot();
    await expectProvisionError(
      runAiEstimatorKnowledgeGstProvision(config("write"), {
        now: () => TIMESTAMP,
        afterMutation: async (session) => {
          await mongoose.connection.db!.collection(AUDIT_COLLECTION).deleteOne({}, { session });
        }
      }),
      "TRANSACTION_FAILED"
    );
    expect(await snapshot()).toEqual(before);
  });

  it("is concurrency-safe and never creates duplicate policy records or audits", async () => {
    const results = await Promise.allSettled([
      runAiEstimatorKnowledgeGstProvision(config("write"), { now: () => TIMESTAMP }),
      runAiEstimatorKnowledgeGstProvision(config("write"), { now: () => TIMESTAMP })
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    expect(results.filter(({ status }) => status === "rejected")).toHaveLength(1);
    const rejection = results.find(({ status }) => status === "rejected") as PromiseRejectedResult;
    expect(rejection.reason).toMatchObject({ code: "WRITE_CONFLICT", committed: false });
    const state = await snapshot();
    expect(state.rules).toHaveLength(1);
    expect(state.versions).toHaveLength(1);
    expect(state.audits).toHaveLength(2);
  });

  it("marks a post-commit verification failure as committed for backup recovery", async () => {
    const error = await expectProvisionError(
      runAiEstimatorKnowledgeGstProvision(config("write"), {
        now: () => TIMESTAMP,
        afterTransactionCommit: async () => {
          throw new Error("injected post-commit failure");
        }
      }),
      "POST_COMMIT_VERIFICATION_FAILED"
    );
    expect(error.committed).toBe(true);
    const state = await snapshot();
    expect(state.rules).toHaveLength(1);
    expect(state.versions).toHaveLength(1);
    expect(state.audits).toHaveLength(2);
  });
});
