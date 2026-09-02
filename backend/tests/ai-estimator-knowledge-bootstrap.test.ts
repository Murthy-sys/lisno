import { describe, expect, it } from "vitest";

import {
  AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS,
  createKnowledgeContentDigest,
  type KnowledgeSectionKey
} from "../src/domain/ai-estimator-knowledge.js";
import { AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES } from "../src/domain/ai-estimator-knowledge-priority.js";
import { validateKnowledgeSectionPayload } from "../src/domain/ai-estimator-knowledge-validation.js";
import { AiEstimatorKnowledgeBasketModel } from "../src/models/AiEstimatorKnowledgeBasket.js";
import { AiEstimatorKnowledgeMainLineModel } from "../src/models/AiEstimatorKnowledgeMainLine.js";
import { AiEstimatorKnowledgeModeModel } from "../src/models/AiEstimatorKnowledgeMode.js";
import { AiEstimatorKnowledgePriorityModel } from "../src/models/AiEstimatorKnowledgePriority.js";
import { AiEstimatorKnowledgeRevisionModel } from "../src/models/AiEstimatorKnowledgeRevision.js";
import { AiEstimatorKnowledgeSectionModel } from "../src/models/AiEstimatorKnowledgeSection.js";
import { AiEstimatorKnowledgeSurfaceModel } from "../src/models/AiEstimatorKnowledgeSurface.js";
import { AiEstimatorKnowledgeTaxRuleModel } from "../src/models/AiEstimatorKnowledgeTaxRule.js";
import { AiEstimatorKnowledgeTaxVersionModel } from "../src/models/AiEstimatorKnowledgeTaxVersion.js";
import { AiEstimatorKnowledgeUomModel } from "../src/models/AiEstimatorKnowledgeUom.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST,
  AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST_DIGEST,
  AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_SOURCE_WARNINGS,
  serializeAiEstimatorKnowledgeBootstrapManifest
} from "../src/operations/ai-estimator-knowledge-bootstrap.manifest.js";
import {
  AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MAINTENANCE_CONFIRMATION,
  AiEstimatorKnowledgeBootstrapError,
  aiEstimatorKnowledgeBootstrapApprovalDigest,
  aiEstimatorKnowledgeTargetFingerprint,
  parseAiEstimatorKnowledgeBootstrapConfig,
  type AiEstimatorKnowledgeBootstrapErrorCode
} from "../src/operations/ai-estimator-knowledge-bootstrap.js";

const SYNTHETIC_URI =
  "mongodb+srv://bootstrap-operator:synthetic-password@bootstrap.invalid/lisno_knowledge_test?retryWrites=true";
const SYNTHETIC_HOST = "bootstrap.invalid";
const SYNTHETIC_DATABASE = "lisno_knowledge_test";
const SYNTHETIC_TARGET = `${SYNTHETIC_HOST}/${SYNTHETIC_DATABASE}`;
const SYNTHETIC_APPROVAL_KEY =
  "synthetic-ai-knowledge-bootstrap-approval-key-0001";

function environment(
  overrides: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  const targetFingerprint = aiEstimatorKnowledgeTargetFingerprint(
    SYNTHETIC_HOST,
    SYNTHETIC_DATABASE
  );
  const approvalDigest = aiEstimatorKnowledgeBootstrapApprovalDigest({
    target: SYNTHETIC_TARGET,
    targetFingerprint,
    manifestDigest: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST_DIGEST,
    approvalKey: SYNTHETIC_APPROVAL_KEY
  });
  return {
    MONGODB_URI: SYNTHETIC_URI,
    AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_TARGET: SYNTHETIC_TARGET,
    AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_TARGET_FINGERPRINT: targetFingerprint,
    AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST_DIGEST:
      AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST_DIGEST,
    AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MAINTENANCE_CONFIRMATION:
      AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MAINTENANCE_CONFIRMATION,
    AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_APPROVAL_KEY:
      SYNTHETIC_APPROVAL_KEY,
    AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_APPROVAL_DIGEST: approvalDigest,
    ...overrides
  };
}

function expectConfigError(
  operation: () => unknown,
  code: AiEstimatorKnowledgeBootstrapErrorCode
): void {
  try {
    operation();
    throw new Error("Expected bootstrap configuration to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(AiEstimatorKnowledgeBootstrapError);
    expect((error as AiEstimatorKnowledgeBootstrapError).code).toBe(code);
    expect(String(error)).not.toContain(SYNTHETIC_URI);
    expect(String(error)).not.toContain(SYNTHETIC_APPROVAL_KEY);
  }
}

describe("AI Estimator Knowledge bootstrap manifest", () => {
  it("contains only the seven approved baskets and representable Plain False Ceiling data", () => {
    const basketDocuments = AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources
      .filter((resource) => resource.kind === "basket")
      .map((resource) => resource.document);
    expect(basketDocuments.map((document) => document.name)).toEqual([
      "POP / Gypsum",
      "On Site Carpentry",
      "Modular",
      "Electrical",
      "Painting",
      "Polishing",
      "Fabrication"
    ]);
    expect(basketDocuments).toHaveLength(7);
    for (const basket of basketDocuments) {
      expect(basket).toMatchObject({ version: 1 });
      expect(basket).not.toHaveProperty("dependencyEpoch");
    }

    const mainLines = AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources.filter(
      (resource) => resource.kind === "main_line"
    );
    expect(mainLines).toHaveLength(1);
    expect(mainLines[0]?.document).toMatchObject({
      name: "Plain False Ceiling",
      status: "draft",
      activeRevisionId: null
    });

    expect(
      AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources.filter(
        (resource) => resource.collection === "aiEstimatorKnowledgeVendors"
      )
    ).toHaveLength(0);
    expect(
      AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources.filter(
        (resource) => resource.collection === "aiEstimatorKnowledgePriceVersions"
      )
    ).toHaveLength(0);
    expect(AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.sourceWarnings).toEqual(
      AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_SOURCE_WARNINGS
    );

    const priorities = AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources
      .filter(
        (resource) =>
          resource.collection === "aiEstimatorKnowledgePriorities"
      )
      .map((resource) => resource.document);
    expect(priorities).toHaveLength(4);
    expect(
      priorities.map((priority) => ({
        id: priority._id,
        semanticTier: priority.semanticTier,
        code: priority.code,
        name: priority.name,
        displayOrder: priority.displayOrder,
        dependencyEpoch: priority.dependencyEpoch
      }))
    ).toEqual(
      AI_ESTIMATOR_KNOWLEDGE_CANONICAL_PRIORITIES.map((priority) => ({
        ...priority,
        dependencyEpoch: 0
      }))
    );
  });

  it("has one valid payload for every section and a stable canonical digest", () => {
    const sections = AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources.filter(
      (resource) => resource.kind === "section"
    );
    expect(sections.map((resource) => resource.document.sectionKey)).toEqual(
      AI_ESTIMATOR_KNOWLEDGE_SECTION_KEYS
    );
    const pricing = sections.find(
      (resource) => resource.document.sectionKey === "pricing"
    );
    expect(pricing?.document.payload).toMatchObject({
      specifications: [
        { id: "spec-bootstrap-channel-expert", name: "Channel from Expert" },
        { id: "spec-bootstrap-board-usg-knauf", name: "Board from USG Knauf" }
      ],
      brands: [
        { id: "brand-bootstrap-expert", name: "Expert" },
        { id: "brand-bootstrap-usg-knauf", name: "USG Knauf" }
      ]
    });
    for (const section of sections) {
      expect(
        validateKnowledgeSectionPayload(
          section.document.sectionKey as KnowledgeSectionKey,
          section.document.payload
        )
      ).toEqual([]);
    }
    expect(AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources).toHaveLength(26);
    expect(AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST_DIGEST).toMatch(
      /^[a-f0-9]{64}$/u
    );
    expect(AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST_DIGEST).toBe(
      createKnowledgeContentDigest(AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST)
    );
    expect(serializeAiEstimatorKnowledgeBootstrapManifest()).toBe(
      serializeAiEstimatorKnowledgeBootstrapManifest()
    );
  });

  it("conforms every direct-insert resource to its strict persistence schema", async () => {
    const validators: Record<
      string,
      (document: Record<string, unknown>) => Promise<unknown>
    > = {
      aiEstimatorKnowledgeBaskets: (document) =>
        AiEstimatorKnowledgeBasketModel.validate(document),
      aiEstimatorKnowledgeMainLines: (document) =>
        AiEstimatorKnowledgeMainLineModel.validate(document),
      aiEstimatorKnowledgeModes: (document) =>
        AiEstimatorKnowledgeModeModel.validate(document),
      aiEstimatorKnowledgePriorities: (document) =>
        AiEstimatorKnowledgePriorityModel.validate(document),
      aiEstimatorKnowledgeRevisions: (document) =>
        AiEstimatorKnowledgeRevisionModel.validate(document),
      aiEstimatorKnowledgeSections: (document) =>
        AiEstimatorKnowledgeSectionModel.validate(document),
      aiEstimatorKnowledgeSurfaces: (document) =>
        AiEstimatorKnowledgeSurfaceModel.validate(document),
      aiEstimatorKnowledgeTaxRules: (document) =>
        AiEstimatorKnowledgeTaxRuleModel.validate(document),
      aiEstimatorKnowledgeTaxVersions: (document) =>
        AiEstimatorKnowledgeTaxVersionModel.validate(document),
      aiEstimatorKnowledgeUoms: (document) =>
        AiEstimatorKnowledgeUomModel.validate(document)
    };

    for (const resource of AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST.resources) {
      const validate = validators[resource.collection];
      expect(validate, resource.collection).toBeDefined();
      await expect(validate!(resource.document)).resolves.toBeDefined();
    }
  });
});

describe("AI Estimator Knowledge bootstrap interlocks", () => {
  it("defaults to dry-run and binds the exact URI target, fingerprint, manifest and approval", () => {
    const config = parseAiEstimatorKnowledgeBootstrapConfig({
      argv: [],
      environment: environment()
    });
    expect(config).toMatchObject({
      mode: "dry_run",
      target: SYNTHETIC_TARGET,
      targetHost: SYNTHETIC_HOST,
      databaseName: SYNTHETIC_DATABASE,
      manifestDigest: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST_DIGEST,
      maintenanceConfirmed: true
    });
    expect(config.targetFingerprint).toBe(
      aiEstimatorKnowledgeTargetFingerprint(SYNTHETIC_HOST, SYNTHETIC_DATABASE)
    );

    const writeConfig = parseAiEstimatorKnowledgeBootstrapConfig({
      argv: ["--write"],
      environment: environment()
    });
    expect(writeConfig.mode).toBe("write");
  });

  it("fails closed before connecting on argument, target, manifest and approval mismatches", () => {
    const cases: Array<{
      argv?: string[];
      overrides?: Record<string, string | undefined>;
      code: AiEstimatorKnowledgeBootstrapErrorCode;
    }> = [
      { argv: ["--force"], code: "INVALID_ARGUMENTS" },
      {
        overrides: {
          MONGODB_URI:
            "mongodb+srv://operator:secret@bootstrap.invalid/?retryWrites=true"
        },
        code: "INVALID_CONFIGURATION"
      },
      {
        overrides: {
          AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_TARGET:
            "bootstrap.invalid/another_database"
        },
        code: "TARGET_MISMATCH"
      },
      {
        overrides: {
          AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_TARGET_FINGERPRINT: "0".repeat(64)
        },
        code: "TARGET_MISMATCH"
      },
      {
        overrides: {
          AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST_DIGEST: "0".repeat(64)
        },
        code: "MANIFEST_MISMATCH"
      },
      {
        overrides: {
          AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MAINTENANCE_CONFIRMATION:
            "writers_are_running"
        },
        code: "TARGET_MISMATCH"
      },
      {
        overrides: {
          AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_APPROVAL_KEY: "too-short"
        },
        code: "INVALID_CONFIGURATION"
      },
      {
        overrides: {
          AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_APPROVAL_DIGEST: "0".repeat(64)
        },
        code: "APPROVAL_MISMATCH"
      }
    ];

    for (const candidate of cases) {
      expectConfigError(
        () =>
          parseAiEstimatorKnowledgeBootstrapConfig({
            argv: candidate.argv ?? [],
            environment: environment(candidate.overrides)
          }),
        candidate.code
      );
    }
  });

  it("changes approval proof when any approved target identity changes", () => {
    const fingerprint = aiEstimatorKnowledgeTargetFingerprint(
      SYNTHETIC_HOST,
      SYNTHETIC_DATABASE
    );
    const approved = aiEstimatorKnowledgeBootstrapApprovalDigest({
      target: SYNTHETIC_TARGET,
      targetFingerprint: fingerprint,
      manifestDigest: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST_DIGEST,
      approvalKey: SYNTHETIC_APPROVAL_KEY
    });
    const changedTarget = aiEstimatorKnowledgeBootstrapApprovalDigest({
      target: `${SYNTHETIC_HOST}/different_database`,
      targetFingerprint: fingerprint,
      manifestDigest: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST_DIGEST,
      approvalKey: SYNTHETIC_APPROVAL_KEY
    });
    expect(approved).toMatch(/^[a-f0-9]{64}$/u);
    expect(changedTarget).not.toBe(approved);
  });
});
