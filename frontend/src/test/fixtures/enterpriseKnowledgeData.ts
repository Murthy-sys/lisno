// Synthetic records reused from features/ai-estimator-knowledge/KnowledgeScreens.test.tsx. No runtime test imports.
import type {
  KnowledgeCompleteness,
  KnowledgeItemDetail,
  KnowledgeJsonObject,
  KnowledgeMaster,
  KnowledgeRevision,
  KnowledgeSectionEnvelope,
  KnowledgeSectionMutationEnvelope,
  KnowledgeSectionKey,
  KnowledgeSurface
} from "../../features/ai-estimator-knowledge/knowledgeTypes";

export const page = { limit: 100, offset: 0, total: 0, hasMore: false } as const;

export const completeness: KnowledgeCompleteness = { percentage: 50, sections: [], blockers: [], warnings: [] };

export const revision: KnowledgeRevision = {
  id: "revision-1",
  mainLineId: "line-1",
  revisionNumber: 1,
  status: "draft",
  sourceRevisionId: null,
  contentDigest: null,
  completeness,
  activatedAt: null,
  activatedById: null,
  supersededAt: null,
  supersededById: null,
  version: 1,
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: "2026-08-28T08:00:00.000Z",
  updatedAt: "2026-08-28T08:00:00.000Z"
};

export const item: KnowledgeItemDetail = {
  id: "line-1",
  mainLineId: "line-1",
  mainLineName: "Wall panelling",
  basketId: "basket-1",
  basketName: "Carpentry",
  description: "Wall panelling knowledge",
  status: "draft",
  activeRevisionId: null,
  draftRevisionId: "revision-1",
  revisionNumber: 1,
  uomId: null,
  priorityId: null,
  modeIds: [],
  surfaceIds: [],
  vendorIds: [],
  completeness,
  allowedActions: ["update_section", "review_and_activate", "duplicate", "archive"],
  activeRevision: null,
  draftRevision: revision,
  blockers: [],
  warnings: [],
  version: 4,
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: "2026-08-28T08:00:00.000Z",
  updatedAt: "2026-08-28T08:00:00.000Z"
};

export const squareFoot: KnowledgeMaster = {
  id: "uom-square-foot",
  masterType: "uoms",
  code: "SQFT",
  name: "Square foot",
  description: null,
  displayOrder: 0,
  status: "active",
  decimalScale: 2,
  version: 1,
  createdById: "super-admin-1",
  updatedById: "super-admin-1",
  createdAt: item.createdAt,
  updatedAt: item.updatedAt
};

export const squareMetre: KnowledgeMaster = {
  ...squareFoot,
  id: "uom-square-metre",
  code: "SQM",
  name: "Square metre"
};

export const wallSurface: KnowledgeMaster = {
  ...squareFoot,
  id: "surface-wall",
  masterType: "surfaces",
  code: "WALL",
  name: "Wall",
  decimalScale: undefined
};

export const canonicalPriorities: readonly KnowledgeMaster[] = [
  { id: "priority-low", name: "Low", code: "LOW", semanticTier: "low" },
  { id: "priority-high", name: "High", code: "HIGH", semanticTier: "high" },
  { id: "priority-medium", name: "Medium", code: "MEDIUM", semanticTier: "medium" },
  {
    id: "priority-non-negotiable",
    name: "Non Negotiable",
    code: "NON_NEGOTIABLE",
    semanticTier: "non_negotiable"
  }
].map((priority, displayOrder) => ({
  ...squareFoot,
  ...priority,
  masterType: "priorities" as const,
  semanticTier: priority.semanticTier as KnowledgeMaster["semanticTier"],
  description: null,
  displayOrder,
  decimalScale: undefined
}));

export const serverPricingSpecification = {
  id: "spec-mode-1",
  name: "Server specification"
} as const;

export function section(sectionKey: KnowledgeSectionKey, payload: KnowledgeJsonObject = {}, version = 2): KnowledgeSectionEnvelope<KnowledgeJsonObject> {
  return {
    id: `section-${sectionKey}`,
    mainLineId: "line-1",
    revisionId: "revision-1",
    sectionKey,
    applicability: "configured",
    payload,
    version,
    createdById: "super-admin-1",
    updatedById: "super-admin-1",
    createdAt: "2026-08-28T08:00:00.000Z",
    updatedAt: "2026-08-28T08:00:00.000Z"
  };
}
