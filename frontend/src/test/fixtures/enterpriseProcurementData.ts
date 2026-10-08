// Synthetic records reused from features/procurement/ProcurementWorkspace.test.tsx. No runtime test imports.
import type {
  FinanceLedgerEntry,
  ProcurementProject
} from "../../api/types";

export const receiptDocument = {
  id: "document-one",
  originalFilename: "carpentry-receipt.png",
  mimeType: "image/png" as const,
  sizeBytes: 1_240,
  createdAt: "2026-08-26T10:00:00.000Z"
};

export const postedExpense: FinanceLedgerEntry = {
  id: "entry-one",
  bucketId: "bucket-one",
  projectId: "project-one",
  type: "direct_spend",
  expenseClass: "procurement",
  category: "Carpentry",
  amountPaise: 125_000,
  incurredAt: "2026-08-25T00:00:00.000Z",
  description: "Living room wardrobe plywood",
  vendor: "Timber House",
  reference: "INV-125",
  sourceSectionId: "CA",
  sourceLineItemKey: "living-room:CA01",
  sourceSectionLabel: "Carpentry",
  sourceLineItemLabel: "Wardrobe plywood and laminate · Living Room",
  supportingDocument: receiptDocument,
  idempotencyKey: "purchase-one",
  status: "posted",
  version: 1,
  createdById: "procurement-user",
  voidedAt: null,
  voidedById: null,
  voidReason: null,
  createdAt: "2026-08-26T10:00:00.000Z",
  updatedAt: "2026-08-26T10:00:00.000Z"
};

export const procurementProject: ProcurementProject = {
  taskId: "task-one",
  taskVersion: 2,
  taskStatus: "in_progress",
  taskProgress: 40,
  openedAt: "2026-08-24T09:00:00.000Z",
  updatedAt: "2026-08-26T10:00:00.000Z",
  projectId: "project-one",
  projectName: "Aurora Villa",
  estimateId: "estimate-one",
  estimateVersion: 4,
  sections: [
    {
      id: "CA",
      label: "Carpentry",
      estimatedAmountPaise: 300_000,
      actualSpendPaise: 125_000,
      items: [
        {
          key: "living-room:CA01",
          catalogueId: "CA01",
          roomName: "Living Room",
          specification: "Wardrobe plywood and laminate",
          unit: "sq ft",
          quantity: 80,
          estimatedAmountPaise: 250_000,
          actualSpendPaise: 125_000,
          expenses: [postedExpense]
        },
        {
          key: "bedroom:CA02",
          catalogueId: "CA02",
          roomName: "Bedroom",
          specification: "Bedside table",
          unit: "nos",
          quantity: 2,
          estimatedAmountPaise: 50_000,
          actualSpendPaise: 0,
          expenses: []
        },
        {
          key: "living-room:CA00",
          catalogueId: "CA00",
          roomName: "Living Room",
          specification: "Zero-value provisional allowance",
          unit: "lot",
          quantity: 1,
          estimatedAmountPaise: 0,
          actualSpendPaise: 0,
          expenses: []
        }
      ]
    },
    {
      id: "EL",
      label: "Electrical",
      estimatedAmountPaise: 75_000,
      actualSpendPaise: 0,
      items: [
        {
          key: "living-room:EL01",
          catalogueId: "EL01",
          roomName: "Living Room",
          specification: "Modular switch set",
          unit: "set",
          quantity: 3,
          estimatedAmountPaise: 75_000,
          actualSpendPaise: 0,
          expenses: []
        }
      ]
    },
    {
      id: "PA",
      label: "Painting",
      estimatedAmountPaise: 0,
      actualSpendPaise: 0,
      items: [
        {
          key: "bedroom:PA01",
          catalogueId: "PA01",
          roomName: "Bedroom",
          specification: "Zero-value paint allowance",
          unit: "lot",
          quantity: 1,
          estimatedAmountPaise: 0,
          actualSpendPaise: 0,
          expenses: []
        }
      ]
    }
  ]
};

import type {
  ProcurementBasketDetail, ProcurementBasketList, ProcurementBasketModeGroup,
  ProcurementEstimateMode, ProcurementModeBasketSubset, ProcurementModeGroupMetrics
} from "../../features/procurement/procurementBasketApi";
import type { PurchaseOrderModeResolution } from "../../features/procurement/purchaseOrderApi";

export const qaEmptyModeMetrics: ProcurementModeGroupMetrics = {
  includedLineCount: 0, boqReadyLineCount: 0, readinessPercent: null,
  approvedEstimatePaise: 0, currentCostPaise: 0, currentCostComplete: true,
  unpricedLineCount: 0, committedNetPaise: 0, modeIssueCount: 0
};
export const qaEmptyModeGroups = (): ProcurementBasketModeGroup[] =>
  (["in_house", "sub_vendor", "pmc"] as const).map((mode) => ({ ...qaEmptyModeMetrics, mode, basketCount: 0, baskets: [] }));

const groupSource = { estimateId: "estimate-one", estimateVersion: 4, estimateReviewRoundId: "round-groups" };
const groupDigest = "e".repeat(64);
function savedCommercialMode(key: string, cost: number): PurchaseOrderModeResolution {
  // Every commercial decision stays PMC, intentionally independent of display mode.
  return { state: "ready", options: [{ key: "pmc", label: "PMC" }], issues: [],
    decision: { id: `decision-${key}`, version: 1, sourceLineItemKey: key, mode: "pmc", quantity: "1",
      discountBps: 0, markupBasis: "starting", exceptionReason: null, revisionId: "revision-groups",
      revisionDigest: groupDigest, updatedAt: "2026-10-08T00:00:00.000Z" },
    preview: { baseCostPaise: cost, adjustedCostPaise: cost, sellingPaise: cost, lowQuantityImpactPaise: 0 },
    revision: { id: "revision-groups", version: 1, status: "active", contentDigest: groupDigest },
    uom: { id: "uom-groups", code: "sq-ft", name: "Square feet", decimalScale: 2 }
  } as unknown as PurchaseOrderModeResolution;
}
function groupLine(key: string, name: string, classification: "standard" | "special" | null,
  selectedMode: ProcurementEstimateMode | null, amount: number, cost: number | null): ProcurementBasketDetail["lines"][number] {
  return { sourceLineItemKey: key, roomId: key.split(":")[0]!, roomName: key.startsWith("bedroom") ? "Bedroom" : "Living Room",
    subBasketId: "sub-ceiling", subBasketName: "Ceiling finishes", mainLineId: key.split(":")[1]!,
    mainLineName: name, approvedQuantity: "1", approvedUnit: "sq-ft", approvedAmountPaise: amount,
    included: true, source: "configuration", baseUnitRatePaise: cost, projectRate: { version: 0, overridePaise: null },
    standardCost: null, mode: cost === null ? null : savedCommercialMode(key, cost),
    estimateMode: { approvedClassification: classification, approvedPricingMode: selectedMode, mode: selectedMode,
      provenance: selectedMode ? "line" : "unrecorded",
      issues: selectedMode ? [] : [{ code: "ESTIMATE_MODE_NOT_RECORDED", message: "The approved estimate does not record a pricing mode." }] } };
}
const mixedLines = [
  groupLine("living:standard", "Standard POP finish", "standard", "sub_vendor", 10_000, 8_000),
  groupLine("living:special-vendor", "Special cove finish", "special", "sub_vendor", 20_000, 16_000),
  groupLine("bedroom:in-house", "In-house ceiling trim", "special", "in_house", 30_000, 24_000),
  groupLine("bedroom:pmc", "PMC ceiling supervision", "special", "pmc", 40_000, 32_000)
];
const mixedDetail: ProcurementBasketDetail = {
  id: "basket-mixed", name: "POP / Gypsum", projectId: "project-one", estimateSource: groupSource,
  preparationDigest: groupDigest, classification: "special", automaticSubVendor: false, boqReady: true,
  standardCost: null, includedLineCount: 4, readyLineCount: 4, approvedEstimatePaise: 100_000,
  baseCostPaise: 80_000, adjustedCostPaise: 80_000, workingTotalPaise: 80_000,
  workingTotalComplete: true, committedNetPaise: 10_000, state: "ready", lines: mixedLines
};
const duplicateDetail: ProcurementBasketDetail = {
  ...mixedDetail, id: "basket-duplicate", includedLineCount: 1, readyLineCount: 0, boqReady: false,
  approvedEstimatePaise: 90_000, baseCostPaise: 0, adjustedCostPaise: 0, workingTotalPaise: 0,
  workingTotalComplete: false, committedNetPaise: 0, state: "partial",
  lines: [groupLine("living:duplicate", "Second basket ceiling trim", "special", "in_house", 90_000, null)]
};
const unknownDetail: ProcurementBasketDetail = {
  ...duplicateDetail, id: "basket-unknown", name: "Specialist conservation finishes with a long custom label",
  approvedEstimatePaise: 7_000,
  lines: [groupLine("living:temporary", "Temporary restoration allowance", "special", null, 7_000, null)]
};
const mixedSubsets: Record<ProcurementEstimateMode, ProcurementModeBasketSubset> = {
  in_house: { id: mixedDetail.id, name: mixedDetail.name, sourceLineItemKeys: ["bedroom:in-house"],
    ...qaEmptyModeMetrics, includedLineCount: 1, boqReadyLineCount: 1, readinessPercent: 100,
    approvedEstimatePaise: 30_000, currentCostPaise: 24_000, committedNetPaise: 3_000 },
  sub_vendor: { id: mixedDetail.id, name: mixedDetail.name, sourceLineItemKeys: ["living:standard", "living:special-vendor"],
    ...qaEmptyModeMetrics, includedLineCount: 2, boqReadyLineCount: 2, readinessPercent: 100,
    approvedEstimatePaise: 30_000, currentCostPaise: 24_000, committedNetPaise: 3_000 },
  pmc: { id: mixedDetail.id, name: mixedDetail.name, sourceLineItemKeys: ["bedroom:pmc"],
    ...qaEmptyModeMetrics, includedLineCount: 1, boqReadyLineCount: 1, readinessPercent: 100,
    approvedEstimatePaise: 40_000, currentCostPaise: 32_000, committedNetPaise: 4_000 }
};
const duplicateSubset: ProcurementModeBasketSubset = { id: duplicateDetail.id, name: duplicateDetail.name,
  sourceLineItemKeys: ["living:duplicate"], ...qaEmptyModeMetrics, includedLineCount: 1, readinessPercent: 0,
  approvedEstimatePaise: 90_000, currentCostPaise: null, currentCostComplete: false, unpricedLineCount: 1 };
const unknownSubset: ProcurementModeBasketSubset = { id: unknownDetail.id, name: unknownDetail.name,
  sourceLineItemKeys: ["living:temporary"], ...qaEmptyModeMetrics, includedLineCount: 1, readinessPercent: 0,
  approvedEstimatePaise: 7_000, currentCostPaise: null, currentCostComplete: false, unpricedLineCount: 1, modeIssueCount: 1 };

// Explicit expected server output, not the production grouping resolver or money reducer.
export function createProcurementGroupFixture() {
  const details = [mixedDetail, duplicateDetail, unknownDetail];
  const list: ProcurementBasketList = { projectId: "project-one", estimateSource: groupSource,
    baskets: details.map(({ lines: _lines, preparationDigest: _digest, projectId: _project, estimateSource: _source, ...basket }) => basket),
    modeGroups: [
      { ...qaEmptyModeMetrics, mode: "in_house", basketCount: 2, baskets: [mixedSubsets.in_house, duplicateSubset],
        includedLineCount: 2, boqReadyLineCount: 1, readinessPercent: 50, approvedEstimatePaise: 120_000,
        currentCostPaise: null, currentCostComplete: false, unpricedLineCount: 1, committedNetPaise: 3_000 },
      { ...qaEmptyModeMetrics, mode: "sub_vendor", basketCount: 1, baskets: [mixedSubsets.sub_vendor],
        includedLineCount: 2, boqReadyLineCount: 2, readinessPercent: 100, approvedEstimatePaise: 30_000,
        currentCostPaise: 24_000, committedNetPaise: 3_000 },
      { ...qaEmptyModeMetrics, mode: "pmc", basketCount: 1, baskets: [mixedSubsets.pmc],
        includedLineCount: 1, boqReadyLineCount: 1, readinessPercent: 100, approvedEstimatePaise: 40_000,
        currentCostPaise: 32_000, committedNetPaise: 4_000 },
      { ...qaEmptyModeMetrics, mode: "unrecorded", basketCount: 1, baskets: [unknownSubset],
        includedLineCount: 1, readinessPercent: 0, approvedEstimatePaise: 7_000, currentCostPaise: null,
        currentCostComplete: false, unpricedLineCount: 1, modeIssueCount: 1 }
    ] };
  return structuredClone({ list, details });
}

export function createProcurementGroupBrowserFixture() {
  const fixture = createProcurementGroupFixture();
  // Decorative browser rows use explicit mode assignments and fixed scenario values.
  const categories: Array<[ProcurementEstimateMode, string, string]> = [
    ["in_house", "painting", "Painting"], ["in_house", "electrical", "Electrical Works"],
    ["in_house", "woodwork", "On-Site Carpentry Works"], ["in_house", "general", "General Items"],
    ["sub_vendor", "lights", "Functional Lights Supply and Installation"],
    ["sub_vendor", "modular", "Modular Carpentry Works"], ["sub_vendor", "glass", "GLASS WORK"],
    ["sub_vendor", "fixtures", "Supply of Light Fixtures"], ["sub_vendor", "acp", "ACP WORK"],
    ["pmc", "decorative", "Decorative Ceilings"], ["pmc", "material", "Building Material"],
    ["pmc", "ceiling", "Ceiling work"], ["pmc", "pvc", "PVC CEILING"],
    ["pmc", "metal", "Aluminium / Metal work"], ["pmc", "interior", "INTERIOR MATERIAL"],
    ["pmc", "gl", "GL"]
  ];
  categories.forEach(([mode, id, name]) => {
    const key = `living:${id}`;
    const detail: ProcurementBasketDetail = { ...mixedDetail, id: `basket-${id}`, name,
      includedLineCount: 1, readyLineCount: 1, approvedEstimatePaise: 25_000,
      baseCostPaise: 20_000, adjustedCostPaise: 20_000, workingTotalPaise: 20_000, committedNetPaise: 0,
      lines: [groupLine(key, `${name} approved line`, "special", mode, 25_000, 20_000)] };
    const { lines: _lines, preparationDigest: _digest, projectId: _project, estimateSource: _source, ...summary } = detail;
    fixture.details.push(detail); fixture.list.baskets.push(summary);
    fixture.list.modeGroups!.find((group) => group.mode === mode)!.baskets.push({
      ...qaEmptyModeMetrics, id: detail.id, name, sourceLineItemKeys: [key], includedLineCount: 1,
      boqReadyLineCount: 1, readinessPercent: 100, approvedEstimatePaise: 25_000, currentCostPaise: 20_000 });
  });
  // Frozen aggregate values for this visual scenario, independent of aggregation code.
  Object.assign(fixture.list.modeGroups![0]!, { basketCount: 6, includedLineCount: 6, boqReadyLineCount: 5,
    readinessPercent: 83, approvedEstimatePaise: 220_000 });
  Object.assign(fixture.list.modeGroups![1]!, { basketCount: 6, includedLineCount: 7, boqReadyLineCount: 7,
    readinessPercent: 100, approvedEstimatePaise: 155_000, currentCostPaise: 124_000 });
  Object.assign(fixture.list.modeGroups![2]!, { basketCount: 8, includedLineCount: 8, boqReadyLineCount: 8,
    readinessPercent: 100, approvedEstimatePaise: 215_000, currentCostPaise: 172_000 });
  return fixture;
}
