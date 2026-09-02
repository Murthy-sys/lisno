import { describe, expect, it } from "vitest";

import { AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES } from "../src/domain/ai-estimator-knowledge-priority.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_BACKUP_CONFIRMATION,
  AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MAINTENANCE_CONFIRMATION,
  AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST,
  AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST_DIGEST,
  AiEstimatorKnowledgePriorityProvisionError,
  aiEstimatorKnowledgePriorityProvisionApprovalDigest,
  aiEstimatorKnowledgePriorityProvisionTargetFingerprint,
  parseAiEstimatorKnowledgePriorityProvisionConfig,
  type AiEstimatorKnowledgePriorityProvisionErrorCode
} from "../src/operations/ai-estimator-knowledge-priority-provision.js";

const SYNTHETIC_URI =
  "mongodb+srv://priority-operator:synthetic-password@priority.invalid/lisno_priority_test?retryWrites=true";
const SYNTHETIC_HOST = "priority.invalid";
const SYNTHETIC_DATABASE = "lisno_priority_test";
const SYNTHETIC_TARGET = `${SYNTHETIC_HOST}/${SYNTHETIC_DATABASE}`;
const SYNTHETIC_APPROVAL_KEY =
  "synthetic-priority-provision-approval-key-00001";

function environment(
  mode: "dry_run" | "write",
  overrides: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  const targetFingerprint =
    aiEstimatorKnowledgePriorityProvisionTargetFingerprint(
      SYNTHETIC_HOST,
      SYNTHETIC_DATABASE
    );
  const backupConfirmed = mode === "write";
  const approvalDigest =
    aiEstimatorKnowledgePriorityProvisionApprovalDigest({
      mode,
      target: SYNTHETIC_TARGET,
      targetFingerprint,
      manifestDigest:
        AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST_DIGEST,
      backupConfirmed,
      approvalKey: SYNTHETIC_APPROVAL_KEY
    });
  return {
    MONGODB_URI: SYNTHETIC_URI,
    AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_TARGET: SYNTHETIC_TARGET,
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
    AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_APPROVAL_KEY:
      SYNTHETIC_APPROVAL_KEY,
    AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_APPROVAL_DIGEST: approvalDigest,
    ...overrides
  };
}

function expectConfigError(
  operation: () => unknown,
  code: AiEstimatorKnowledgePriorityProvisionErrorCode
): void {
  try {
    operation();
    throw new Error("Expected Priority provisioning configuration to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(AiEstimatorKnowledgePriorityProvisionError);
    expect((error as AiEstimatorKnowledgePriorityProvisionError).code).toBe(
      code
    );
    expect(String(error)).not.toContain(SYNTHETIC_URI);
    expect(String(error)).not.toContain(SYNTHETIC_APPROVAL_KEY);
  }
}

describe("AI Estimator Knowledge Priority provision manifest", () => {
  it("contains the exact four canonical priorities and stable digest", () => {
    expect(AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST).toEqual({
      manifestVersion: "ai-estimator-knowledge-priority-provision-v1",
      priorities: AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES
    });
    expect(
      AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST.priorities.map(
        ({ id, semanticTier, code, name, displayOrder }) => ({
          id,
          semanticTier,
          code,
          name,
          displayOrder
        })
      )
    ).toEqual([
      {
        id: "knowledge-priority-bootstrap-non-negotiable",
        semanticTier: "non_negotiable",
        code: "NON_NEGOTIABLE",
        name: "Non Negotiable",
        displayOrder: 0
      },
      {
        id: "knowledge-priority-bootstrap-high",
        semanticTier: "high",
        code: "HIGH",
        name: "High",
        displayOrder: 1
      },
      {
        id: "knowledge-priority-bootstrap-medium",
        semanticTier: "medium",
        code: "MEDIUM",
        name: "Medium",
        displayOrder: 2
      },
      {
        id: "knowledge-priority-bootstrap-low",
        semanticTier: "low",
        code: "LOW",
        name: "Low",
        displayOrder: 3
      }
    ]);
    expect(
      AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST_DIGEST
    ).toMatch(/^[a-f0-9]{64}$/u);
  });
});

describe("AI Estimator Knowledge Priority provision interlocks", () => {
  it("defaults to dry-run and requires a separately bound write approval", () => {
    const dryRun = parseAiEstimatorKnowledgePriorityProvisionConfig({
      argv: [],
      environment: environment("dry_run")
    });
    expect(dryRun).toMatchObject({
      mode: "dry_run",
      target: SYNTHETIC_TARGET,
      targetHost: SYNTHETIC_HOST,
      databaseName: SYNTHETIC_DATABASE,
      manifestDigest:
        AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST_DIGEST,
      maintenanceConfirmed: true,
      backupConfirmed: false
    });

    const write = parseAiEstimatorKnowledgePriorityProvisionConfig({
      argv: ["--write"],
      environment: environment("write")
    });
    expect(write).toMatchObject({ mode: "write", backupConfirmed: true });
    expect(write.approvalDigest).not.toBe(dryRun.approvalDigest);
  });

  it("fails closed on argument, target, manifest, maintenance, backup and approval mismatches", () => {
    const cases: Array<{
      argv?: string[];
      environment: Record<string, string | undefined>;
      code: AiEstimatorKnowledgePriorityProvisionErrorCode;
    }> = [
      {
        argv: ["--force"],
        environment: environment("dry_run"),
        code: "INVALID_ARGUMENTS"
      },
      {
        environment: environment("dry_run", {
          MONGODB_URI:
            "mongodb+srv://operator:secret@priority.invalid/?retryWrites=true"
        }),
        code: "INVALID_CONFIGURATION"
      },
      {
        environment: environment("dry_run", {
          AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_TARGET:
            "priority.invalid/another_database"
        }),
        code: "TARGET_MISMATCH"
      },
      {
        environment: environment("dry_run", {
          AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_TARGET_FINGERPRINT:
            "0".repeat(64)
        }),
        code: "TARGET_MISMATCH"
      },
      {
        environment: environment("dry_run", {
          AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MANIFEST_DIGEST:
            "0".repeat(64)
        }),
        code: "MANIFEST_MISMATCH"
      },
      {
        environment: environment("dry_run", {
          AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_MAINTENANCE_CONFIRMATION:
            "writers_are_running"
        }),
        code: "MAINTENANCE_MISMATCH"
      },
      {
        argv: ["--write"],
        environment: {
          ...environment("dry_run"),
          AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_APPROVAL_DIGEST:
            environment("write")[
              "AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_APPROVAL_DIGEST"
            ]
        },
        code: "BACKUP_CONFIRMATION_MISSING"
      },
      {
        environment: environment("dry_run", {
          AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_APPROVAL_KEY: "too-short"
        }),
        code: "INVALID_CONFIGURATION"
      },
      {
        environment: environment("dry_run", {
          AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_APPROVAL_DIGEST:
            "0".repeat(64)
        }),
        code: "APPROVAL_MISMATCH"
      }
    ];

    for (const candidate of cases) {
      expectConfigError(
        () =>
          parseAiEstimatorKnowledgePriorityProvisionConfig({
            argv: candidate.argv ?? [],
            environment: candidate.environment
          }),
        candidate.code
      );
    }
  });

  it("does not accept a dry-run approval digest for write mode", () => {
    const dryEnvironment = environment("dry_run");
    expectConfigError(
      () =>
        parseAiEstimatorKnowledgePriorityProvisionConfig({
          argv: ["--write"],
          environment: {
            ...environment("write"),
            AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_APPROVAL_DIGEST:
              dryEnvironment[
                "AI_ESTIMATOR_KNOWLEDGE_PRIORITY_PROVISION_APPROVAL_DIGEST"
              ]
          }
        }),
      "APPROVAL_MISMATCH"
    );
  });
});
