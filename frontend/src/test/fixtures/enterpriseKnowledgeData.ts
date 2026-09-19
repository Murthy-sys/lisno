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
  completionRequired: false,
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

// Opt-in backend-shaped data for the checklist interaction/legacy-repair checks.
export function scopeSection(state: string): KnowledgeSectionEnvelope<KnowledgeJsonObject> {
  const empty = state === "empty";
  return section("advanced", {
    modeConfigurations: [{
      id: "scope-pmc", modeKind: "pmc", fields: [],
      inclusions: empty ? [] : [
        { id: "transport-in", name: "Transport", selected: true },
        { id: "night-in", name: "Night unloading", selected: false },
        { id: "lift-in", name: "Lift service", selected: false },
        { id: "storage-in", name: "Temporary storage", selected: false }
      ],
      exclusions: empty ? [] : [
        { id: "transport-out", name: "Transport", selected: state === "conflict" },
        { id: "night-out", name: "Night unloading", selected: true },
        { id: "lift-out", name: "Lift service", selected: false },
        { id: "permit-out", name: "Permit handling", selected: false }
      ]
    }, { id: "scope-execution", modeKind: "execution", executionSource: "sub_vendor", fields: [] }]
  });
}

// Opt-in saved values for Lisno margin range and legacy-compatibility visual QA.
export function marginSection(state: string): KnowledgeSectionEnvelope<KnowledgeJsonObject> {
  return section("advanced", {
    modeConfigurations: [{ id: "margin-sub-vendor", modeKind: "execution", executionSource: "sub_vendor", fields: [] }],
    modeCalculations: { pmc: null, sub_vendor: { baseRatePaise: 20_000, lowQuantityLimit: "15", impactBps: 1_000,
      minimumMarkupBps: 2_500, startingMarkupBps: 3_500 }, in_house_labor: null, in_house_material: null },
    ...(state === "empty" ? {} : state === "legacy" ? { subVendorMarginBps: 1_500 }
      : state === "legacy-below-range" ? { subVendorMarginBps: 1_000 }
      : state === "legacy-between-steps" ? { subVendorMarginBps: 1_750 }
      : { subVendorMinimumMarginBps: 1_500, subVendorMarginBps: 2_000 })
  });
}
