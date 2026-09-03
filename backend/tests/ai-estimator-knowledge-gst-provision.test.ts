import { describe, expect, it } from "vitest";

import { AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY } from "../src/domain/ai-estimator-knowledge-fixed-gst.js";
import { AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST } from "../src/operations/ai-estimator-knowledge-bootstrap.manifest.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_BACKUP_CONFIRMATION,
  AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MAINTENANCE_CONFIRMATION,
  AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST,
  AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST_DIGEST,
  AiEstimatorKnowledgeGstProvisionError,
  aiEstimatorKnowledgeGstProvisionApprovalDigest,
  aiEstimatorKnowledgeGstProvisionTargetFingerprint,
  parseAiEstimatorKnowledgeGstProvisionConfig,
  type AiEstimatorKnowledgeGstProvisionErrorCode
} from "../src/operations/ai-estimator-knowledge-gst-provision.js";

const URI = "mongodb+srv://gst-operator:synthetic-password@gst.invalid/lisno_gst_test?retryWrites=true";
const HOST = "gst.invalid";
const DATABASE = "lisno_gst_test";
const TARGET = `${HOST}/${DATABASE}`;
const APPROVAL_KEY = "synthetic-gst-provision-approval-key-0000001";

function environment(
  mode: "dry_run" | "write",
  overrides: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  const targetFingerprint = aiEstimatorKnowledgeGstProvisionTargetFingerprint(HOST, DATABASE);
  const backupConfirmed = mode === "write";
  const approvalDigest = aiEstimatorKnowledgeGstProvisionApprovalDigest({
    mode,
    target: TARGET,
    targetFingerprint,
    manifestDigest: AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST_DIGEST,
    backupConfirmed,
    approvalKey: APPROVAL_KEY
  });
  return {
    MONGODB_URI: URI,
    AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_TARGET: TARGET,
    AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_TARGET_FINGERPRINT: targetFingerprint,
    AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST_DIGEST:
      AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST_DIGEST,
    AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MAINTENANCE_CONFIRMATION:
      AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MAINTENANCE_CONFIRMATION,
    AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_BACKUP_CONFIRMATION: backupConfirmed
      ? AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_BACKUP_CONFIRMATION
      : undefined,
    AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_APPROVAL_KEY: APPROVAL_KEY,
    AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_APPROVAL_DIGEST: approvalDigest,
    ...overrides
  };
}

function expectConfigError(
  operation: () => unknown,
  code: AiEstimatorKnowledgeGstProvisionErrorCode
): void {
  expect(operation).toThrowError(AiEstimatorKnowledgeGstProvisionError);
  try {
    operation();
  } catch (error) {
    expect(error).toMatchObject({ code, committed: false });
    expect(String(error)).not.toContain(URI);
    expect(String(error)).not.toContain(APPROVAL_KEY);
  }
}

describe("AI Estimator Knowledge fixed GST provision manifest", () => {
  it("shares one exact canonical policy with the full bootstrap manifest", () => {
    expect(AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST).toEqual({
      manifestVersion: "ai-estimator-knowledge-gst-provision-v1",
      policy: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY
    });
    expect(AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST_DIGEST).toMatch(/^[a-f0-9]{64}$/u);
    const taxRule = AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources.find(
      ({ document }) => document._id === AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.rule.id
    );
    const taxVersion = AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources.find(
      ({ document }) => document._id === AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.version.id
    );
    expect(taxRule?.document).toMatchObject({
      code: "GST_18",
      name: "GST 18%",
      displayOrder: 0,
      status: "active"
    });
    expect(taxVersion?.document).toMatchObject({
      taxRuleId: AI_ESTIMATOR_KNOWLEDGE_FIXED_GST_POLICY.rule.id,
      rateBps: 1_800,
      treatment: "exclusive",
      effectiveTo: null,
      status: "active"
    });
  });
});

describe("AI Estimator Knowledge fixed GST provision interlocks", () => {
  it("defaults to dry-run and requires a separately bound write approval", () => {
    const dryRun = parseAiEstimatorKnowledgeGstProvisionConfig({
      argv: [],
      environment: environment("dry_run")
    });
    expect(dryRun).toMatchObject({
      mode: "dry_run",
      target: TARGET,
      targetHost: HOST,
      databaseName: DATABASE,
      maintenanceConfirmed: true,
      backupConfirmed: false
    });
    const write = parseAiEstimatorKnowledgeGstProvisionConfig({
      argv: ["--write"],
      environment: environment("write")
    });
    expect(write).toMatchObject({ mode: "write", backupConfirmed: true });
    expect(write.approvalDigest).not.toBe(dryRun.approvalDigest);
  });

  it("fails closed on arguments, target, manifest, maintenance, backup, key, and approval", () => {
    const cases: Array<{
      argv?: string[];
      environment: Record<string, string | undefined>;
      code: AiEstimatorKnowledgeGstProvisionErrorCode;
    }> = [
      { argv: ["--force"], environment: environment("dry_run"), code: "INVALID_ARGUMENTS" },
      {
        environment: environment("dry_run", { MONGODB_URI: "mongodb://gst.invalid/" }),
        code: "INVALID_CONFIGURATION"
      },
      {
        environment: environment("dry_run", {
          AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_TARGET: "gst.invalid/another"
        }),
        code: "TARGET_MISMATCH"
      },
      {
        environment: environment("dry_run", {
          AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_TARGET_FINGERPRINT: "0".repeat(64)
        }),
        code: "TARGET_MISMATCH"
      },
      {
        environment: environment("dry_run", {
          AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MANIFEST_DIGEST: "0".repeat(64)
        }),
        code: "MANIFEST_MISMATCH"
      },
      {
        environment: environment("dry_run", {
          AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_MAINTENANCE_CONFIRMATION: "writers_running"
        }),
        code: "MAINTENANCE_MISMATCH"
      },
      {
        argv: ["--write"],
        environment: {
          ...environment("dry_run"),
          AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_APPROVAL_DIGEST:
            environment("write").AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_APPROVAL_DIGEST
        },
        code: "BACKUP_CONFIRMATION_MISSING"
      },
      {
        environment: environment("dry_run", {
          AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_APPROVAL_KEY: "short"
        }),
        code: "INVALID_CONFIGURATION"
      },
      {
        environment: environment("dry_run", {
          AI_ESTIMATOR_KNOWLEDGE_GST_PROVISION_APPROVAL_DIGEST: "0".repeat(64)
        }),
        code: "APPROVAL_MISMATCH"
      }
    ];
    for (const candidate of cases) {
      expectConfigError(
        () => parseAiEstimatorKnowledgeGstProvisionConfig({
          argv: candidate.argv ?? [],
          environment: candidate.environment
        }),
        candidate.code
      );
    }
  });
});
