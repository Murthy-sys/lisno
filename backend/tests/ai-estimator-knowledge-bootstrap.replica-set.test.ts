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
  AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST,
  AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST_DIGEST
} from "../src/operations/ai-estimator-knowledge-bootstrap.manifest.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MAINTENANCE_CONFIRMATION,
  AiEstimatorKnowledgeBootstrapError,
  aiEstimatorKnowledgeBootstrapApprovalDigest,
  aiEstimatorKnowledgeTargetFingerprint,
  parseAiEstimatorKnowledgeBootstrapConfig,
  runAiEstimatorKnowledgeBootstrap,
  runAiEstimatorKnowledgeBootstrapCommand,
  type AiEstimatorKnowledgeBootstrapConfig
} from "../src/operations/ai-estimator-knowledge-bootstrap.js";
import { startMongoReplicaSet } from "./helpers/mongo-replica-set.js";

const DATABASE_NAME = "ai-estimator-knowledge-bootstrap-test";
const APPROVAL_KEY = "synthetic-local-bootstrap-approval-key-000000001";

let replicaSet: Awaited<ReturnType<typeof startMongoReplicaSet>>;

function environment(
  overrides: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  const parsed = new URL(replicaSet.uri);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  const target = `${parsed.host.toLowerCase()}/${databaseName}`;
  const targetFingerprint = aiEstimatorKnowledgeTargetFingerprint(
    parsed.host,
    databaseName
  );
  const approvalDigest = aiEstimatorKnowledgeBootstrapApprovalDigest({
    target,
    targetFingerprint,
    manifestDigest: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST_DIGEST,
    approvalKey: APPROVAL_KEY
  });
  return {
    MONGODB_URI: replicaSet.uri,
    AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_TARGET: target,
    AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_TARGET_FINGERPRINT: targetFingerprint,
    AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST_DIGEST:
      AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST_DIGEST,
    AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MAINTENANCE_CONFIRMATION:
      AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MAINTENANCE_CONFIRMATION,
    AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_APPROVAL_KEY: APPROVAL_KEY,
    AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_APPROVAL_DIGEST: approvalDigest,
    ...overrides
  };
}

function config(write = false): AiEstimatorKnowledgeBootstrapConfig {
  return parseAiEstimatorKnowledgeBootstrapConfig({
    argv: write ? ["--write"] : [],
    environment: environment()
  });
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
      indexes: await mongoose.connection.db!
        .collection(name)
        .listIndexes()
        .toArray()
    }))
  );
}

async function expectBootstrapError(
  operation: Promise<unknown>,
  code: AiEstimatorKnowledgeBootstrapError["code"]
): Promise<AiEstimatorKnowledgeBootstrapError> {
  try {
    await operation;
    throw new Error("Expected bootstrap operation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(AiEstimatorKnowledgeBootstrapError);
    const bootstrapError = error as AiEstimatorKnowledgeBootstrapError;
    expect(bootstrapError.code).toBe(code);
    expect(String(error)).not.toContain(replicaSet.uri);
    expect(String(error)).not.toContain(APPROVAL_KEY);
    return bootstrapError;
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

describe("AI Estimator Knowledge guarded bootstrap on a local replica set", () => {
  it("dry-runs an empty database without creating collections, indexes or documents", async () => {
    const before = await snapshotDatabase();
    const report = await runAiEstimatorKnowledgeBootstrap(config());

    expect(report).toMatchObject({
      mode: "dry_run",
      status: "eligible",
      expectedResourceCount:
        AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources.length,
      existingResourceCount: 0,
      proposedInsertCount:
        AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources.length,
      insertedResourceIds: [],
      conflicts: [],
      backupRequired: true
    });
    expect(report.rollbackInstructions).toHaveLength(3);
    expect(report.sourceWarnings).toEqual(
      AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.sourceWarnings
    );
    expect(await snapshotDatabase()).toEqual(before);
  });

  it("rejects a connected host that does not match the approved target", async () => {
    const before = await snapshotDatabase();
    await expectBootstrapError(
      runAiEstimatorKnowledgeBootstrap({
        ...config(),
        targetHost: "different-host.invalid"
      }),
      "TARGET_MISMATCH"
    );
    expect(await snapshotDatabase()).toEqual(before);
  });

  it("keeps command output redacted and disables automatic collection and index creation", async () => {
    const before = await snapshotDatabase();
    const connectOptions: unknown[] = [];
    const outputs: string[] = [];
    const report = await runAiEstimatorKnowledgeBootstrapCommand({
      argv: [],
      environment: environment(),
      connection: mongoose.connection,
      connect: async (_uri, options) => {
        connectOptions.push(options);
      },
      disconnect: async () => undefined,
      writeOutput: (output) => outputs.push(output)
    });

    expect(report.status).toBe("eligible");
    expect(connectOptions).toEqual([{ autoIndex: false, autoCreate: false }]);
    expect(outputs).toHaveLength(1);
    expect(outputs[0]).not.toContain(replicaSet.uri);
    expect(outputs[0]).not.toContain(APPROVAL_KEY);
    expect(await snapshotDatabase()).toEqual(before);
  });

  it("creates the stable manifest once and an idempotent rerun makes no changes", async () => {
    const created = await runAiEstimatorKnowledgeBootstrap(config(true));
    expect(created.status).toBe("created");
    expect(created.insertedResourceIds).toHaveLength(
      AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources.length
    );
    expect(created.proposedInsertCount).toBe(0);

    const auditCount = await mongoose.connection.db!
      .collection("auditevents")
      .countDocuments({
        actorId: "system-ai-estimator-knowledge-bootstrap-v1"
      });
    expect(auditCount).toBe(
      AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources.length
    );
    const basketDocuments = await mongoose.connection.db!
      .collection("aiEstimatorKnowledgeBaskets")
      .find({})
      .toArray();
    expect(basketDocuments).toHaveLength(7);
    for (const basket of basketDocuments) {
      expect(basket).not.toHaveProperty("dependencyEpoch");
    }
    const afterFirstRun = await snapshotDatabase();

    const rerun = await runAiEstimatorKnowledgeBootstrap(config(true));
    expect(rerun).toMatchObject({
      mode: "write",
      status: "already_applied",
      existingResourceCount:
        AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources.length,
      proposedInsertCount: 0,
      insertedResourceIds: [],
      conflicts: []
    });
    expect(await snapshotDatabase()).toEqual(afterFirstRun);
  });

  it("inserts only absent stable resources when every existing resource has its exact audit", async () => {
    await runAiEstimatorKnowledgeBootstrap(config(true));
    const removed = AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources.find(
      (resource) => resource.kind === "section" && resource.document.sectionKey === "advanced"
    )!;
    const resourceId = String(removed.document._id);
    await mongoose.connection.db!
      .collection(removed.collection)
      .deleteOne({ _id: resourceId });
    await mongoose.connection.db!
      .collection("auditevents")
      .deleteOne({
        actorId: "system-ai-estimator-knowledge-bootstrap-v1",
        entityId: resourceId
      });

    const report = await runAiEstimatorKnowledgeBootstrap(config(true));
    expect(report.status).toBe("created");
    expect(report.insertedResourceIds).toEqual([resourceId]);
    expect(
      await mongoose.connection.db!
        .collection(removed.collection)
        .countDocuments({ _id: resourceId })
    ).toBe(1);
    expect(
      await mongoose.connection.db!
        .collection("auditevents")
        .countDocuments({
          actorId: "system-ai-estimator-knowledge-bootstrap-v1",
          entityId: resourceId
        })
    ).toBe(1);
  });

  it("reports and aborts on unmapped, conflicting, and legacy data", async () => {
    const cases: Array<{
      collection: string;
      document: Record<string, unknown>;
      expectedCode: string;
    }> = [
      {
        collection: "aiEstimatorKnowledgeBaskets",
        document: { _id: "unmapped-basket", name: "Unmapped" },
        expectedCode: "UNMAPPED_EXISTING_DOCUMENT"
      },
      {
        collection: "aiEstimatorKnowledgeBaskets",
        document: {
          ...AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources.find(
            (resource) => resource.kind === "basket"
          )!.document,
          name: "Conflicting name"
        },
        expectedCode: "DOCUMENT_MISMATCH"
      },
      {
        collection: "estimationBaskets",
        document: { _id: "legacy-basket", name: "Legacy" },
        expectedCode: "LEGACY_COLLECTION_DATA"
      }
    ];

    for (const candidate of cases) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.db!
        .collection(candidate.collection)
        .insertOne(candidate.document);
      const before = await snapshotDatabase();
      const dryRun = await runAiEstimatorKnowledgeBootstrap(config());
      expect(dryRun.status).toBe("blocked");
      expect(dryRun.conflicts.map((conflict) => conflict.code)).toContain(
        candidate.expectedCode
      );
      expect(await snapshotDatabase()).toEqual(before);

      await expectBootstrapError(
        runAiEstimatorKnowledgeBootstrap(config(true)),
        "BASELINE_CONFLICT"
      );
      expect(await snapshotDatabase()).toEqual(before);
    }
  });

  it("rolls back every resource and audit write when the transaction fails", async () => {
    const before = await snapshotDatabase();
    const error = await expectBootstrapError(
      runAiEstimatorKnowledgeBootstrap(config(true), {
        afterInsert: async () => {
          throw new Error("synthetic transaction failure");
        }
      }),
      "TRANSACTION_FAILED"
    );
    expect(error.committed).toBe(false);
    expect(await snapshotDatabase()).toEqual(before);
  });

  it("marks failures after transaction commit as committed for backup restoration", async () => {
    const error = await expectBootstrapError(
      runAiEstimatorKnowledgeBootstrap(config(true), {
        afterTransactionCommit: async () => {
          throw new Error("synthetic post-commit failure");
        }
      }),
      "POST_COMMIT_VERIFICATION_FAILED"
    );
    expect(error.committed).toBe(true);
    expect(
      await mongoose.connection.db!
        .collection("aiEstimatorKnowledgeBaskets")
        .countDocuments({})
    ).toBe(7);
  });
});
