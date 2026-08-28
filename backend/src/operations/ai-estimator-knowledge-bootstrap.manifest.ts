import {
  canonicalKnowledgeJson,
  createKnowledgeContentDigest,
  normalizeKnowledgeIdentity
} from "../domain/ai-estimator-knowledge.js";
import { deriveKnowledgeCompleteness } from "../domain/ai-estimator-knowledge-completeness.js";

export const AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_SYSTEM_ACTOR_ID =
  "system-ai-estimator-knowledge-bootstrap-v1" as const;
export const AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_TIMESTAMP =
  "2026-08-28T00:00:00.000Z" as const;

export const AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_SOURCE_WARNINGS = [
  "MISSING_VENDOR_IDENTITY_PRICE_NOT_BOOTSTRAPPED",
  "AMBIGUOUS_LIGHT_FITTINGS_EXCLUSION_NOT_BOOTSTRAPPED",
  "UNMAPPED_RECOMMENDATION_TARGETS_NOT_BOOTSTRAPPED"
] as const;

const basketNames = [
  "POP / Gypsum",
  "On Site Carpentry",
  "Modular",
  "Electrical",
  "Painting",
  "Polishing",
  "Fabrication"
] as const;

const basketId = (name: (typeof basketNames)[number]) =>
  `knowledge-basket-bootstrap-${normalizeKnowledgeIdentity(name)
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "")}`;

export const AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS = Object.freeze({
  popBasket: basketId("POP / Gypsum"),
  electricalBasket: basketId("Electrical"),
  paintingBasket: basketId("Painting"),
  uom: "knowledge-uom-bootstrap-square-feet",
  taxRule: "knowledge-tax-bootstrap-gst-18",
  taxVersion: "knowledge-tax-version-bootstrap-gst-18-v1",
  priority: "knowledge-priority-bootstrap-medium",
  surface: "knowledge-surface-bootstrap-ceiling",
  mode: "knowledge-mode-bootstrap-pmc",
  mainLine: "knowledge-main-line-bootstrap-plain-false-ceiling",
  revision: "knowledge-revision-bootstrap-plain-false-ceiling-v1"
});

export interface AiEstimatorKnowledgeBootstrapManifestResource {
  readonly collection: string;
  readonly kind:
    | "basket"
    | "main_line"
    | "master"
    | "tax_version"
    | "revision"
    | "section";
  readonly document: Readonly<Record<string, unknown>>;
}

const actorMetadata = {
  createdById: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_SYSTEM_ACTOR_ID,
  updatedById: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_SYSTEM_ACTOR_ID,
  createdAt: new Date(AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_TIMESTAMP),
  updatedAt: new Date(AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_TIMESTAMP)
};

const baskets: AiEstimatorKnowledgeBootstrapManifestResource[] = basketNames.map(
  (name, displayOrder) => ({
    collection: "aiEstimatorKnowledgeBaskets",
    kind: "basket",
    document: {
      _id: basketId(name),
      name,
      nameNormalized: normalizeKnowledgeIdentity(name),
      description: null,
      displayOrder,
      status: "active",
      version: 1,
      ...actorMetadata,
      archivedAt: null,
      archivedById: null
    }
  })
);

const masters: AiEstimatorKnowledgeBootstrapManifestResource[] = [
  {
    collection: "aiEstimatorKnowledgeUoms",
    kind: "master",
    document: masterDocument({
      id: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.uom,
      code: "SQ_FT",
      name: "Sq.ft",
      decimalScale: 2
    })
  },
  {
    collection: "aiEstimatorKnowledgeTaxRules",
    kind: "master",
    document: masterDocument({
      id: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.taxRule,
      code: "GST_18",
      name: "GST 18%"
    })
  },
  {
    collection: "aiEstimatorKnowledgePriorities",
    kind: "master",
    document: masterDocument({
      id: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.priority,
      code: "MEDIUM",
      name: "Medium"
    })
  },
  {
    collection: "aiEstimatorKnowledgeSurfaces",
    kind: "master",
    document: masterDocument({
      id: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.surface,
      code: "CEILING",
      name: "Ceiling"
    })
  },
  {
    collection: "aiEstimatorKnowledgeModes",
    kind: "master",
    document: masterDocument({
      id: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.mode,
      code: "PMC",
      name: "PMC"
    })
  }
];

const sectionDefinitions = [
  {
    sectionKey: "overview",
    applicability: "configured",
    payload: {
      description: "Plain False Ceiling",
      uomId: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.uom,
      priorityId: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.priority,
      surfaceIds: [AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.surface],
      modeIds: [AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.mode]
    }
  },
  {
    sectionKey: "pricing",
    applicability: "configured",
    payload: {
      specifications: [
        { id: "spec-bootstrap-channel-expert", name: "Channel from Expert" },
        { id: "spec-bootstrap-board-usg-knauf", name: "Board from USG Knauf" }
      ],
      brands: [
        { id: "brand-bootstrap-expert", name: "Expert" },
        { id: "brand-bootstrap-usg-knauf", name: "USG Knauf" }
      ],
      technicalDescription: null,
      qualityLevel: null,
      internalVendorNotes: null,
      priceEntries: []
    }
  },
  {
    sectionKey: "quantity-margin",
    applicability: "configured",
    payload: {
      quantitySlabs: [{
        id: "quantity-slab-bootstrap-below-200",
        minimumQuantity: "0",
        maximumQuantity: "200",
        adjustmentBps: 500
      }],
      gapBehavior: "no_adjustment",
      startMarginBps: 2_500,
      bottomMarginBps: 1_500,
      pmcMarkupBps: 1_500,
      wastageBps: 0
    }
  },
  {
    sectionKey: "scope",
    applicability: "configured",
    payload: {
      modeIds: [AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.mode],
      surfaceIds: [AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.surface],
      exclusions: [{
        id: "exclusion-bootstrap-painting",
        targetBasketId: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.paintingBasket,
        targetMainLineId: null,
        active: true
      }]
    }
  },
  { sectionKey: "recommendations", applicability: "not_configured", payload: {} },
  { sectionKey: "quality", applicability: "not_configured", payload: {} },
  {
    sectionKey: "execution",
    applicability: "configured",
    payload: {
      steps: [
        {
          id: "execution-step-bootstrap-framing",
          order: 1,
          name: "Framing Activities",
          description: null,
          durationValue: null,
          durationUnit: null,
          crewSize: null,
          skillType: null,
          mandatory: true,
          parallelizable: false,
          active: true,
          dependencyStepIds: []
        },
        {
          id: "execution-step-bootstrap-electrical-wiring",
          order: 2,
          name: "Electrical Wiring",
          description: null,
          durationValue: null,
          durationUnit: null,
          crewSize: null,
          skillType: null,
          mandatory: true,
          parallelizable: false,
          active: true,
          dependencyStepIds: []
        }
      ],
      productivity: null
    }
  },
  { sectionKey: "advanced", applicability: "not_configured", payload: {} }
] as const;

const completeness = deriveKnowledgeCompleteness({
  identity: {
    basketId: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.popBasket,
    mainLineId: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.mainLine,
    uomId: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.uom
  },
  sections: sectionDefinitions
});

const itemResources: AiEstimatorKnowledgeBootstrapManifestResource[] = [
  {
    collection: "aiEstimatorKnowledgeMainLines",
    kind: "main_line",
    document: {
      _id: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.mainLine,
      basketId: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.popBasket,
      name: "Plain False Ceiling",
      nameNormalized: normalizeKnowledgeIdentity("Plain False Ceiling"),
      description: "Plain False Ceiling",
      displayOrder: 0,
      status: "draft",
      activeRevisionId: null,
      draftRevisionId: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.revision,
      version: 1,
      ...actorMetadata,
      deactivatedAt: null,
      deactivatedById: null,
      archivedAt: null,
      archivedById: null
    }
  },
  {
    collection: "aiEstimatorKnowledgeRevisions",
    kind: "revision",
    document: {
      _id: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.revision,
      mainLineId: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.mainLine,
      revisionNumber: 1,
      status: "draft",
      sourceRevisionId: null,
      contentDigest: null,
      completeness,
      version: 1,
      ...actorMetadata,
      activatedAt: null,
      activatedById: null,
      supersededAt: null,
      supersededById: null
    }
  },
  ...sectionDefinitions.map(({ sectionKey, applicability, payload }) => ({
    collection: "aiEstimatorKnowledgeSections",
    kind: "section" as const,
    document: {
      _id: `knowledge-section-bootstrap-plain-false-ceiling-${sectionKey}`,
      mainLineId: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.mainLine,
      revisionId: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.revision,
      sectionKey,
      applicability,
      payload,
      version: 1,
      ...actorMetadata
    }
  }))
];

const taxVersion: AiEstimatorKnowledgeBootstrapManifestResource = {
  collection: "aiEstimatorKnowledgeTaxVersions",
  kind: "tax_version",
  document: {
    _id: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.taxVersion,
    taxRuleId: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_IDS.taxRule,
    versionNumber: 1,
    rateBps: 1_800,
    treatment: "exclusive",
    applicability: "Interior estimation",
    effectiveFrom: new Date(AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_TIMESTAMP),
    effectiveTo: null,
    status: "active",
    version: 1,
    ...actorMetadata
  }
};

export const AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST = Object.freeze({
  manifestVersion: "ai-estimator-knowledge-bootstrap-v1",
  resources: Object.freeze([...baskets, ...masters, taxVersion, ...itemResources]),
  sourceWarnings: AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_SOURCE_WARNINGS
});

export const AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST_DIGEST =
  createKnowledgeContentDigest(AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST);

export function serializeAiEstimatorKnowledgeBootstrapManifest(): string {
  return canonicalKnowledgeJson(AI_ESTIMATOR_KNOWLEDGE_BOOTSTRAP_MANIFEST);
}

function masterDocument(input: {
  id: string;
  code: string;
  name: string;
  decimalScale?: number;
}): Record<string, unknown> {
  return {
    _id: input.id,
    code: input.code,
    codeNormalized: normalizeKnowledgeIdentity(input.code),
    name: input.name,
    nameNormalized: normalizeKnowledgeIdentity(input.name),
    description: null,
    displayOrder: 0,
    status: "active",
    ...(input.decimalScale === undefined ? {} : { decimalScale: input.decimalScale }),
    version: 1,
    ...actorMetadata,
    archivedAt: null,
    archivedById: null
  };
}
