import mongoose from "mongoose";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it
} from "vitest";

import {
  AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES,
  AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS,
  type CanonicalKnowledgePriority
} from "../src/domain/ai-estimator-knowledge-priority.js";
import { normalizeKnowledgeIdentity } from "../src/domain/ai-estimator-knowledge.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_BACKUP_CONFIRMATION,
  AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MAINTENANCE_CONFIRMATION,
  AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST_DIGEST,
  AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_SYSTEM_ACTOR_ID,
  AiEstimatorKnowledgePriorityProvisionError,
  aiEstimatorKnowledgePriorityProvisionApprovalDigest,
  aiEstimatorKnowledgePriorityProvisionTargetFingerprint,
  parseAiEstimatorKnowledgePriorityProvisionConfig,
  runAiEstimatorKnowledgePriorityProvision,
  runAiEstimatorKnowledgePriorityProvisionCommand,
  type AiEstimatorKnowledgePriorityProvisionConfig
} from "../src/operations/ai-estimator-knowledge-priority-provision.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const DATABASE_NAME = "ai-estimator-knowledge-priority-provision-test";
const APPROVAL_KEY = "synthetic-local-priority-provision-key-00000001";
const FIXED_TIMESTAMP = new Date("2026-09-02T10:00:00.000Z");
const PRIORITY_COLLECTION = "aiEstimatorKnowledgePriorities";
const AUDIT_COLLECTION = "auditevents";

let replicaSet: Awaited<ReturnType<typeof startMongoReplicaSet>>;

function environment(
  mode: "dry_run" | "write",
  overrides: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  const parsed = new URL(replicaSet.uri);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  const target = `${parsed.host.toLowerCase()}/${databaseName}`;
  const targetFingerprint =
    aiEstimatorKnowledgePriorityProvisionTargetFingerprint(
      parsed.host,
      databaseName
    );
  const backupConfirmed = mode === "write";
  const approvalDigest =
    aiEstimatorKnowledgePriorityProvisionApprovalDigest({
      mode,
      target,
      targetFingerprint,
      manifestDigest:
        AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST_DIGEST,
      backupConfirmed,
      approvalKey: APPROVAL_KEY
    });
  return {
    MONGODB_URI: replicaSet.uri,
    AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_TARGET: target,
    AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_TARGET_FINGERPRINT:
      targetFingerprint,
    AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST_DIGEST:
      AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST_DIGEST,
    AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MAINTENANCE_CONFIRMATION:
      AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MAINTENANCE_CONFIRMATION,
    AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_BACKUP_CONFIRMATION:
      backupConfirmed
        ? AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_BACKUP_CONFIRMATION
        : undefined,
    AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_APPROVAL_KEY: APPROVAL_KEY,
    AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_APPROVAL_DIGEST: approvalDigest,
    ...overrides
  };
}

function config(
  mode: "dry_run" | "write"
): AiEstimatorKnowledgePriorityProvisionConfig {
  return parseAiEstimatorKnowledgePriorityProvisionConfig({
    argv: mode === "write" ? ["--write"] : [],
    environment: environment(mode)
  });
}

function priorityDocument(
  priority: CanonicalKnowledgePriority,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> & { _id: string } {
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
    createdById: "existing-priority-owner",
    updatedById: "existing-priority-owner",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    archivedAt: null,
    archivedById: null,
    ...overrides
  };
}

async function insertExactPriorities(
  priorities: readonly CanonicalKnowledgePriority[]
): Promise<void> {
  if (priorities.length === 0) return;
  await mongoose.connection.db!
    .collection(PRIORITY_COLLECTION)
    .insertMany(priorities.map((priority) => priorityDocument(priority)));
}

async function databaseSnapshot(): Promise<{
  priorities: unknown[];
  audits: unknown[];
}> {
  return {
    priorities: await mongoose.connection.db!
      .collection(PRIORITY_COLLECTION)
      .find({})
      .sort({ _id: 1 })
      .toArray(),
    audits: await mongoose.connection.db!
      .collection(AUDIT_COLLECTION)
      .find({})
      .sort({ _id: 1 })
      .toArray()
  };
}

async function expectProvisionError(
  operation: Promise<unknown>,
  code: AiEstimatorKnowledgePriorityProvisionError["code"]
): Promise<AiEstimatorKnowledgePriorityProvisionError> {
  try {
    await operation;
    throw new Error("Expected Priority provisioning to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(AiEstimatorKnowledgePriorityProvisionError);
    const provisionError = error as AiEstimatorKnowledgePriorityProvisionError;
    expect(provisionError.code).toBe(code);
    expect(String(error)).not.toContain(replicaSet.uri);
    expect(String(error)).not.toContain(APPROVAL_KEY);
    return provisionError;
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

describe("AI Estimator Knowledge Priority provisioning on a local replica set", () => {
  it("dry-runs by default with an exact no-write report and redacted command output", async () => {
    const custom = {
      ...priorityDocument(AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES[0]!),
      _id: "custom-priority",
      code: "CUSTOM",
      codeNormalized: "custom",
      name: "Custom",
      nameNormalized: "custom",
      semanticTier: undefined
    };
    delete custom.semanticTier;
    await mongoose.connection.db!
      .collection(PRIORITY_COLLECTION)
      .insertOne(custom);
    const before = await databaseSnapshot();
    const outputs: string[] = [];
    const connectOptions: unknown[] = [];
    const report = await runAiEstimatorKnowledgePriorityProvisionCommand({
      argv: [],
      environment: environment("dry_run"),
      connection: mongoose.connection,
      connect: async (_uri, options) => {
        connectOptions.push(options);
      },
      disconnect: async () => undefined,
      writeOutput: (output) => outputs.push(output)
    });

    expect(report).toMatchObject({
      mode: "dry_run",
      status: "eligible",
      expectedPriorityCount: 4,
      exactMatches: [],
      repairs: [],
      implicitDeleteCount: 0,
      implicitArchiveCount: 0,
      implicitRemapCount: 0,
      customRecordRewriteCount: 0,
      backupRequiredForWrite: true,
      backupConfirmed: false
    });
    expect(report.missingPriorities.map((priority) => priority.id)).toEqual(
      AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES.map((priority) => priority.id)
    );
    expect(report.proposedWrites.map((write) => write.id)).toEqual(
      AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES.map((priority) => priority.id)
    );
    expect(report.rollbackInstructions.join(" ")).toContain(
      AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.medium
    );
    expect(connectOptions).toEqual([{ autoIndex: false, autoCreate: false }]);
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).not.toContain(replicaSet.uri);
    expect(outputs[0]).not.toContain(APPROVAL_KEY);
    expect(await databaseSnapshot()).toEqual(before);
  });

  it("creates the four records and matching audits once, then reruns idempotently", async () => {
    const created = await runAiEstimatorKnowledgePriorityProvision(
      config("write"),
      { now: () => FIXED_TIMESTAMP }
    );
    expect(created.status).toBe("applied");
    expect(created.insertedPriorityIds).toEqual(
      AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES.map((priority) => priority.id)
    );
    expect(created.repairedPriorityIds).toEqual([]);
    expect(created.appliedWrites).toHaveLength(4);
    expect(created.proposedWrites).toEqual([]);

    const priorities = await mongoose.connection.db!
      .collection(PRIORITY_COLLECTION)
      .find({})
      .sort({ displayOrder: 1 })
      .toArray();
    expect(
      priorities.map((priority) => ({
        id: priority._id,
        semanticTier: priority.semanticTier,
        code: priority.code,
        name: priority.name,
        displayOrder: priority.displayOrder,
        version: priority.version,
        dependencyEpoch: priority.dependencyEpoch
      }))
    ).toEqual(
      AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES.map((priority) => ({
        ...priority,
        version: 1,
        dependencyEpoch: 0
      }))
    );
    const audits = await mongoose.connection.db!
      .collection(AUDIT_COLLECTION)
      .find({
        actorId: AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_SYSTEM_ACTOR_ID
      })
      .toArray();
    expect(audits).toHaveLength(4);
    expect(
      audits.every(
        (audit) =>
          audit.action === "ai_estimator_knowledge_master_created" &&
          audit.newValues.priorityProvisionManifestDigest ===
            AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST_DIGEST
      )
    ).toBe(true);
    const afterCreate = await databaseSnapshot();

    const rerun = await runAiEstimatorKnowledgePriorityProvision(config("write"));
    expect(rerun).toMatchObject({
      status: "already_applied",
      missingPriorities: [],
      repairs: [],
      conflicts: [],
      proposedWrites: [],
      appliedWrites: [],
      insertedPriorityIds: [],
      repairedPriorityIds: []
    });
    expect(rerun.exactMatches).toHaveLength(4);
    expect(await databaseSnapshot()).toEqual(afterCreate);
  });

  it("inserts only missing records and leaves unrelated custom records untouched", async () => {
    await insertExactPriorities(
      AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES.slice(0, 2)
    );
    const custom = {
      ...priorityDocument(AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES[0]!),
      _id: "custom-priority",
      code: "CUSTOM",
      codeNormalized: "custom",
      name: "Custom",
      nameNormalized: "custom"
    };
    delete custom.semanticTier;
    await mongoose.connection.db!
      .collection(PRIORITY_COLLECTION)
      .insertOne(custom);
    const customBefore = await mongoose.connection.db!
      .collection(PRIORITY_COLLECTION)
      .findOne({ _id: "custom-priority" });

    const dryRun = await runAiEstimatorKnowledgePriorityProvision(
      config("dry_run")
    );
    expect(dryRun.exactMatches).toHaveLength(2);
    expect(dryRun.missingPriorities.map((priority) => priority.semanticTier)).toEqual([
      "medium",
      "low"
    ]);
    expect(dryRun.conflicts).toEqual([]);

    const applied = await runAiEstimatorKnowledgePriorityProvision(
      config("write"),
      { now: () => FIXED_TIMESTAMP }
    );
    expect(applied.insertedPriorityIds).toEqual([
      AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.medium,
      AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITY_IDS.low
    ]);
    expect(applied.appliedWrites).toHaveLength(2);
    expect(
      await mongoose.connection.db!
        .collection(PRIORITY_COLLECTION)
        .findOne({ _id: "custom-priority" })
    ).toEqual(customBefore);
  });

  it("reports and applies only the exact legacy Medium tier/order repair", async () => {
    await insertExactPriorities(
      AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES.filter(
        (priority) => priority.semanticTier !== "medium"
      )
    );
    const medium = AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES.find(
      (priority) => priority.semanticTier === "medium"
    )!;
    const legacyMedium = priorityDocument(medium, {
      displayOrder: 0,
      version: 3,
      dependencyEpoch: 7,
      description: "Preserve this description"
    });
    delete legacyMedium.semanticTier;
    await mongoose.connection.db!
      .collection(PRIORITY_COLLECTION)
      .insertOne(legacyMedium);

    const dryRun = await runAiEstimatorKnowledgePriorityProvision(
      config("dry_run")
    );
    expect(dryRun.status).toBe("eligible");
    expect(dryRun.missingPriorities).toEqual([]);
    expect(dryRun.repairs).toEqual([
      {
        id: medium.id,
        kind: "legacy_medium_canonical_repair",
        changedFields: ["semanticTier", "displayOrder"],
        before: { semanticTier: null, displayOrder: 0 },
        after: { semanticTier: "medium", displayOrder: 2 }
      }
    ]);
    expect(dryRun.proposedWrites).toEqual([
      {
        operation: "repair",
        id: medium.id,
        fields: ["semanticTier", "displayOrder"]
      }
    ]);

    const applied = await runAiEstimatorKnowledgePriorityProvision(
      config("write"),
      { now: () => FIXED_TIMESTAMP }
    );
    expect(applied.insertedPriorityIds).toEqual([]);
    expect(applied.repairedPriorityIds).toEqual([medium.id]);
    const repaired = await mongoose.connection.db!
      .collection(PRIORITY_COLLECTION)
      .findOne({ _id: medium.id });
    expect(repaired).toMatchObject({
      semanticTier: "medium",
      displayOrder: 2,
      version: 4,
      dependencyEpoch: 7,
      description: "Preserve this description",
      updatedById: AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_SYSTEM_ACTOR_ID,
      updatedAt: FIXED_TIMESTAMP
    });
    expect(repaired?.createdById).toBe("existing-priority-owner");
    const audit = await mongoose.connection.db!
      .collection(AUDIT_COLLECTION)
      .findOne({ entityId: medium.id });
    expect(audit).toMatchObject({
      action: "ai_estimator_knowledge_master_updated",
      oldValues: { semanticTier: null, displayOrder: 0, version: 3 },
      newValues: {
        priorityProvisionManifestDigest:
          AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST_DIGEST,
        semanticTier: "medium",
        displayOrder: 2,
        version: 4
      }
    });
  });

  it("reports ID, code, name, tier, and audit conflicts without mutating data", async () => {
    const high = AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES.find(
      (priority) => priority.semanticTier === "high"
    )!;
    const candidates: Array<{
      document: Record<string, unknown> & { _id: string };
      expectedCode: string;
      expectedField: string;
    }> = [
      {
        document: priorityDocument(high, {
          code: "WRONG",
          codeNormalized: "wrong"
        }),
        expectedCode: "ID_CONFLICT",
        expectedField: "code"
      },
      {
        document: {
          ...priorityDocument(high),
          _id: "custom-code-conflict",
          name: "Custom code conflict",
          nameNormalized: "custom code conflict",
          semanticTier: undefined
        },
        expectedCode: "CODE_CONFLICT",
        expectedField: "code"
      },
      {
        document: {
          ...priorityDocument(high),
          _id: "custom-name-conflict",
          code: "CUSTOM_NAME",
          codeNormalized: "custom_name",
          semanticTier: undefined
        },
        expectedCode: "NAME_CONFLICT",
        expectedField: "name"
      },
      {
        document: {
          ...priorityDocument(high),
          _id: "custom-tier-conflict",
          code: "CUSTOM_TIER",
          codeNormalized: "custom_tier",
          name: "Custom tier conflict",
          nameNormalized: "custom tier conflict"
        },
        expectedCode: "TIER_CONFLICT",
        expectedField: "semanticTier"
      }
    ];

    for (const candidate of candidates) {
      await mongoose.connection.dropDatabase();
      if (candidate.document.semanticTier === undefined) {
        delete candidate.document.semanticTier;
      }
      await mongoose.connection.db!
        .collection(PRIORITY_COLLECTION)
        .insertOne(candidate.document);
      const before = await databaseSnapshot();
      const dryRun = await runAiEstimatorKnowledgePriorityProvision(
        config("dry_run")
      );
      expect(dryRun.status).toBe("blocked");
      expect(dryRun.conflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: candidate.expectedCode,
            field: candidate.expectedField
          })
        ])
      );
      expect(await databaseSnapshot()).toEqual(before);
      await expectProvisionError(
        runAiEstimatorKnowledgePriorityProvision(config("write")),
        "BASELINE_CONFLICT"
      );
      expect(await databaseSnapshot()).toEqual(before);
    }

    await mongoose.connection.dropDatabase();
    const applied = await runAiEstimatorKnowledgePriorityProvision(
      config("write"),
      { now: () => FIXED_TIMESTAMP }
    );
    expect(applied.status).toBe("applied");
    await mongoose.connection.db!
      .collection(AUDIT_COLLECTION)
      .updateOne(
        { actorId: AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_SYSTEM_ACTOR_ID },
        { $set: { reason: "tampered" } }
      );
    const auditConflict = await runAiEstimatorKnowledgePriorityProvision(
      config("dry_run")
    );
    expect(auditConflict.status).toBe("blocked");
    expect(auditConflict.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "AUDIT_CONFLICT" })
      ])
    );
  });

  it("fails closed when Priority data drifts between inspection and transaction", async () => {
    const error = await expectProvisionError(
      runAiEstimatorKnowledgePriorityProvision(config("write"), {
        beforeTransaction: async () => {
          const custom = {
            ...priorityDocument(
              AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES[0]!
            ),
            _id: "concurrent-custom-priority",
            code: "CONCURRENT",
            codeNormalized: "concurrent",
            name: "Concurrent",
            nameNormalized: "concurrent"
          };
          delete custom.semanticTier;
          await mongoose.connection.db!
            .collection(PRIORITY_COLLECTION)
            .insertOne(custom);
        }
      }),
      "WRITE_CONFLICT"
    );
    expect(error.committed).toBe(false);
    expect(
      await mongoose.connection.db!
        .collection(PRIORITY_COLLECTION)
        .countDocuments({ _id: /^knowledge-priority-bootstrap-/u })
    ).toBe(0);
    expect(
      await mongoose.connection.db!
        .collection(PRIORITY_COLLECTION)
        .countDocuments({ _id: "concurrent-custom-priority" })
    ).toBe(1);
    expect(
      await mongoose.connection.db!
        .collection(AUDIT_COLLECTION)
        .countDocuments({})
    ).toBe(0);
  });

  it("rolls back all Priority and audit writes on a transaction failure", async () => {
    const error = await expectProvisionError(
      runAiEstimatorKnowledgePriorityProvision(config("write"), {
        now: () => FIXED_TIMESTAMP,
        afterMutation: async () => {
          throw new Error("synthetic transaction failure");
        }
      }),
      "TRANSACTION_FAILED"
    );
    expect(error.committed).toBe(false);
    expect(
      await mongoose.connection.db!
        .collection(PRIORITY_COLLECTION)
        .countDocuments({})
    ).toBe(0);
    expect(
      await mongoose.connection.db!
        .collection(AUDIT_COLLECTION)
        .countDocuments({})
    ).toBe(0);
  });

  it("marks post-commit verification failures as committed for backup recovery", async () => {
    const error = await expectProvisionError(
      runAiEstimatorKnowledgePriorityProvision(config("write"), {
        now: () => FIXED_TIMESTAMP,
        afterTransactionCommit: async () => {
          throw new Error("synthetic post-commit failure");
        }
      }),
      "POST_COMMIT_VERIFICATION_FAILED"
    );
    expect(error.committed).toBe(true);
    expect(
      await mongoose.connection.db!
        .collection(PRIORITY_COLLECTION)
        .countDocuments({})
    ).toBe(4);
    expect(
      await mongoose.connection.db!
        .collection(AUDIT_COLLECTION)
        .countDocuments({})
    ).toBe(4);
  });

  it("detects Priority drift after commit and reports that canonical writes committed", async () => {
    const error = await expectProvisionError(
      runAiEstimatorKnowledgePriorityProvision(config("write"), {
        now: () => FIXED_TIMESTAMP,
        afterTransactionCommit: async () => {
          const custom = {
            ...priorityDocument(
              AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES[0]!
            ),
            _id: "post-commit-custom-priority",
            code: "POST_COMMIT",
            codeNormalized: "post_commit",
            name: "Post commit",
            nameNormalized: "post commit"
          };
          delete custom.semanticTier;
          await mongoose.connection.db!
            .collection(PRIORITY_COLLECTION)
            .insertOne(custom);
        }
      }),
      "POST_COMMIT_VERIFICATION_FAILED"
    );
    expect(error.committed).toBe(true);
    expect(
      await mongoose.connection.db!
        .collection(PRIORITY_COLLECTION)
        .countDocuments({})
    ).toBe(5);
    expect(
      await mongoose.connection.db!
        .collection(AUDIT_COLLECTION)
        .countDocuments({})
    ).toBe(4);
  });
});
