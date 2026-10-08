import { ROLE_CODES, OPERATIONAL_ROLES, type Role } from "../../api/authorization-contract";
import type { Lead, ProjectWorkflowTask, UserInvitationItem, ProjectFinanceBucket } from "../../api/types";
import { superAdminDashboardOverviewFixture, superAdminDashboardProjectsPageFixture, superAdminDashboardWorkforcePageFixture } from "../../features/admin/dashboard/dashboardFixtures";
import type { ProjectPurchaseOrderRequest, PurchaseOrder, PurchaseOrderPreparation, PurchaseOrderRequestQuote, PurchaseOrderRequestLineInput, PurchaseOrderTotals } from "../../features/procurement/purchaseOrderApi";
import type { ProcurementBasketDetail, ProcurementBasketModeGroup, ProcurementVendorCandidate } from "../../features/procurement/procurementBasketApi";
import type { EnterpriseScenario } from "./enterpriseTransport";
import * as admin from "./enterpriseAdminData";
import * as users from "./enterpriseUsersData";
import * as access from "./enterpriseAccessData";
import * as responses from "./enterpriseResponsesData";
import * as designer from "./enterpriseDesignerData";
import * as project from "./enterpriseProjectData";
import * as client from "./enterpriseClientData";
import * as finance from "./enterpriseFinanceData";
import * as procurement from "./enterpriseProcurementData";
import { createProcurementGalleryFixture } from "./enterpriseProcurementGalleryData";
import * as knowledge from "./enterpriseKnowledgeData";
import * as drawing from "./enterpriseDrawingData";
import type { KnowledgeSectionKey } from "../../features/ai-estimator-knowledge/knowledgeTypes";
import type { EstimationCatalogueBasket } from "../../features/leads/estimationCatalogueApi";

const lead: Lead = { id: "lead-1", projectId: "project-1", ownerId: "estimator_sales-1", clientName: "Asha Shah", clientEmail: "asha@example.com", clientMobile: "+91 90000 00000", projectName: "Asha home — complete residence and terrace refurbishment", location: "Pune", propertyType: "3BHK", budgetMin: 800000, budgetMax: 1200000, source: "Referral", stage: "estimate_in_progress", nextAction: "Review updated living room measurements", nextActionAt: "2026-09-15T10:00:00.000Z", builder: null, areaSqft: 1400, targetHandoverAt: null, notes: "Synthetic project record for visual review.", latestActivityAt: null, createdAt: "2026-08-23T10:00:00.000Z", updatedAt: "2026-09-10T10:00:00.000Z" };
const estimate = { id: "estimate-1", leadId: lead.id, projectId: lead.projectId, propertyType: "3BHK", rooms: [{ id: "living-room", label: "Living Room", type: "living", length: 16, width: 12, height: 10 }], scopes: ["FC"], lineItems: responses.pendingDetail.estimateSnapshot.lineItems, subtotal: 1200, gst: 216, total: 1416, status: "draft", approvalRequired: false, updatedAt: lead.updatedAt, lead };
const estimatorCatalogue: EstimationCatalogueBasket[] = [
  {
    id: "basket-pop", name: "POP / Gypsum", displayOrder: 1, directTemporaryItems: [],
    subBaskets: [{
      id: "sub-pop", basketId: "basket-pop", name: "Gypsum ceilings", displayOrder: 1,
      mainLines: [{ id: "line-pop", mainLineId: "line-pop", itemType: "main_line", basketId: "basket-pop", subBasketId: "sub-pop", name: "Plain gypsum ceiling", displayOrder: 1, revisionId: "revision-pop", inHouseBaseRatePaise: 95_000, uom: { id: "uom-sqft", code: "SQFT", name: "Square foot", decimalScale: 2 } }],
      temporaryItems: []
    }, {
      id: "sub-pop-na", basketId: "basket-pop", name: "NA", displayOrder: 2, mainLines: [],
      temporaryItems: [
        { id: "item-cove", mainLineId: "item-cove", itemType: "temporary", basketId: "basket-pop", subBasketId: "sub-pop-na", name: "Cove in Gypsum", displayOrder: 1, revisionId: "revision-cove", itemStatus: "draft", revisionStatus: "draft", itemVersion: 3, revisionVersion: 5, inHouseBaseRatePaise: 5_000, uom: { id: "uom-rft", code: "RFT", name: "Running foot", decimalScale: 2 } },
        { id: "item-false-ceiling", mainLineId: "item-false-ceiling", itemType: "temporary", basketId: "basket-pop", subBasketId: "sub-pop-na", name: "POP false ceiling", displayOrder: 2, revisionId: "revision-false-ceiling", itemStatus: "inactive", revisionStatus: "active", itemVersion: 4, revisionVersion: 2, inHouseBaseRatePaise: 105_000, uom: { id: "uom-sqft", code: "SQFT", name: "Square foot", decimalScale: 2 } }
      ]
    }]
  },
  {
    id: "basket-paint", name: "Painting", displayOrder: 2, directTemporaryItems: [],
    subBaskets: [{
      id: "sub-paint", basketId: "basket-paint", name: "Decorative paints", displayOrder: 1,
      mainLines: [{ id: "line-paint", mainLineId: "line-paint", itemType: "main_line", basketId: "basket-paint", subBasketId: "sub-paint", name: "Textured wall paint", displayOrder: 1, revisionId: "revision-paint", uom: { id: "uom-sqft", code: "SQFT", name: "Square foot", decimalScale: 2 } }],
      temporaryItems: [{ id: "item-paint-touchup", mainLineId: "item-paint-touchup", itemType: "temporary", basketId: "basket-paint", subBasketId: "sub-paint", name: "Paint touch-up", displayOrder: 2, revisionId: "revision-paint-touchup", uom: { id: "uom-sqft", code: "SQFT", name: "Square foot", decimalScale: 2 } }]
    }]
  },
  {
    id: "basket-general", name: "General Items", displayOrder: 3, subBaskets: [],
    directTemporaryItems: [{ id: "item-site-protection", mainLineId: "item-site-protection", itemType: "temporary", basketId: "basket-general", subBasketId: null, name: "Site protection", displayOrder: 1, revisionId: "revision-site-protection", uom: { id: "uom-set", code: "SET", name: "Set", decimalScale: 0 } }]
  },
  { id: "basket-empty", name: "Building Material", displayOrder: 4, subBaskets: [], directTemporaryItems: [] }
];
const recommendationCatalogue: EstimationCatalogueBasket[] = estimatorCatalogue.map((basket) => ({
  ...basket,
  directTemporaryItems: (basket.directTemporaryItems ?? []).map((line) => ({ ...line, itemVersion: line.itemVersion ?? 1, revisionVersion: line.revisionVersion ?? 1 })),
  subBaskets: basket.subBaskets.map((subBasket) => ({
    ...subBasket,
    mainLines: subBasket.mainLines.map((line) => ({
      ...line, itemVersion: line.itemVersion ?? 1, revisionVersion: line.revisionVersion ?? 1,
      ...(line.id === "line-paint" ? { name: "False ceiling painting", itemStatus: "active" as const, revisionStatus: "active" as const } : {})
    })),
    temporaryItems: (subBasket.temporaryItems ?? []).map((line) => ({ ...line, itemVersion: line.itemVersion ?? 1, revisionVersion: line.revisionVersion ?? 1 }))
  }))
}));
const recommendationSources = recommendationCatalogue.flatMap((basket) => [
  ...(basket.directTemporaryItems ?? []),
  ...basket.subBaskets.flatMap((subBasket) => [...subBasket.mainLines, ...(subBasket.temporaryItems ?? [])])
]);
const qaRequestTotals = { netPaise: 60000000, gstPaise: 10800000, totalPaise: 70800000 };
const qaRequestSectionTotals = [{ sectionId: "LIVING", label: "Living room and dining", totals: qaRequestTotals }];
const qaRequestVendorTotals = [{ vendorId: "vendor-qa", code: "VEN-QA", name: "Synthetic Interior Works", terms: "Deliver and install at the project site.", totals: qaRequestTotals }];
const qaPendingPurchaseRequest: ProjectPurchaseOrderRequest = {
  id: "request-qa-one", projectId: "project-qa-one", projectName: "North Residence — upper floor and garden apartment renovation",
  requestNumber: "POR-QA-001", status: "pending_approval", version: 3, revision: 2, submittedRevisionId: "request-revision-qa-two",
  preparationDigest: "a".repeat(64), estimateSource: { estimateId: "estimate-qa-one", estimateVersion: 2, estimateReviewRoundId: "review-qa-one" },
  approvedEstimatePaise: 90000000, committedPaise: 40000000, committedGstPaise: 0, committedTotalPaise: 40000000, remainingPaise: 50000000,
  totals: qaRequestTotals, sectionTotals: qaRequestSectionTotals, vendorTotals: qaRequestVendorTotals,
  approvedOrderIds: [], decisions: [], revisions: [{
    id: "request-revision-qa-two", revision: 2, submittedAt: "2026-10-01T00:00:00.000Z", submittedById: "buyer-qa",
    modeSnapshotStatus: "historical_unavailable", modeSnapshots: [],
    preparationDigest: "a".repeat(64), approvedEstimatePaise: 90000000, committedPaise: 40000000,
    committedGstPaise: 0, committedTotalPaise: 40000000, remainingPaise: 50000000,
    totals: qaRequestTotals, sectionTotals: qaRequestSectionTotals, vendorTotals: qaRequestVendorTotals,
    lines: [{
      id: "line-qa-one", procurementItemId: "item-qa-one", procurementItemVersion: 2,
      quantityMilliUnits: 2000, unitPricePaise: 30000000, gstBasisPoints: 1800, scopeType: "execution",
      description: "Custom cabinetry and wall panelling for the living and dining spaces",
      targetDate: "2026-11-15", deliveryLocation: "North Residence", netPaise: 60000000, gstPaise: 10800000, totalPaise: 70800000,
      vendorId: "vendor-qa", vendorCode: "VEN-QA", vendorName: "Synthetic Interior Works", allocatedWorkPaise: 60000000,
      sectionLabel: "Living room and dining", sourceSectionId: "LIVING", sourceLineItemKey: "estimate-line-qa-one",
      roomName: "Living and dining", itemName: "Custom cabinetry and wall panelling", brand: "Synthetic", uomCode: "set"
    }]
  }],
  createdAt: "2026-09-30T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z"
};
const qaIndividualOrderTotals = { netPaise: 350000, gstPaise: 63000, totalPaise: 413000 };
const qaPendingIndividualOrder: PurchaseOrder = {
  id: "order-qa-one", orderNumber: "PO-QA-001", projectId: "project-qa-individual",
  vendor: { id: "vendor-qa-individual", code: "VEN-QA-2", name: "Synthetic Workshop and Installations" },
  status: "pending_approval", version: 3, revision: 1,
  estimateSource: { estimateId: "estimate-qa-individual", estimateVersion: 1, estimateReviewRoundId: "review-qa-individual" },
  terms: "Deliver and install at the project site.", draftLines: [], draftTotals: qaIndividualOrderTotals,
  submittedRevisionId: "order-revision-qa-one", approvedRevisionId: null, approvedNetPaise: null,
  approvedGstPaise: null, approvedTotalPaise: null, decisions: [], revisions: [{
    id: "order-revision-qa-one", revision: 1, submittedAt: "2026-10-01T00:00:00.000Z", submittedById: "buyer-qa",
    terms: "Deliver and install at the project site after measurements are confirmed.", totals: qaIndividualOrderTotals,
    lines: [{
      id: "order-line-qa-one", procurementItemId: "item-qa-individual", procurementItemVersion: 1,
      quantityMilliUnits: 1000, unitPricePaise: 350000, gstBasisPoints: 1800, scopeType: "supply_and_execution",
      description: "Supply and install measured living room shelving and joinery",
      targetDate: "2026-11-20", deliveryLocation: "Synthetic project site",
      netPaise: 350000, gstPaise: 63000, totalPaise: 413000,
      itemName: "Living room shelving and joinery", roomName: "Living room", uomCode: "set"
    }]
  }],
  createdAt: "2026-09-30T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z"
};
const qaProcurementModePreparation: PurchaseOrderPreparation = {
  projectId: "project-one", estimateSource: { estimateId: "estimate-one", estimateVersion: 4, estimateReviewRoundId: "review-synthetic-one" },
  approvedEstimatePaise: 375_000, committedPaise: 0, committedGstPaise: 0, committedTotalPaise: 0, remainingPaise: 375_000,
  orderDefaults: { targetDate: "2026-11-30", deliveryLocation: "Synthetic project site" },
  digest: "f".repeat(64), netPaise: 170_000, itemCount: 2, readyItemCount: 2, blockers: [],
  sections: [{ id: "CA", label: "Carpentry", roomName: "Living Room and Bedroom", estimatedPaise: 300_000, netPaise: 170_000, items: [{
    id: "purchase-item-wood", version: 2, sourceSectionId: "CA", sourceLineItemKey: "living-room:CA01", roomName: "Living Room",
    itemName: "Wardrobe plywood and laminate", brand: "Synthetic timber", uom: { id: "uom-sqft", code: "sq ft", name: "Square feet", decimalScale: 2, status: "active" },
    vendor: { id: "vendor-wood", code: "VEN-WOOD", name: "Synthetic Joinery Works", status: "active", vendorType: "execution" },
    plannedOrderQuantityMilliUnits: 1000, pricePaise: 120_000, allocatedWorkPaise: 150_000, plannedLineNetPaise: 120_000, blockers: []
  }, {
    id: "purchase-item-bedside", version: 1, sourceSectionId: "CA", sourceLineItemKey: "bedroom:CA02", roomName: "Bedroom",
    itemName: "Bedside table", brand: "Synthetic finish", uom: { id: "uom-nos", code: "nos", name: "Number", decimalScale: 0, status: "active" },
    vendor: { id: "vendor-furniture", code: "VEN-FURN", name: "Synthetic Furniture Workshop", status: "active", vendorType: "supplier" },
    plannedOrderQuantityMilliUnits: 2000, pricePaise: 25_000, allocatedWorkPaise: 60_000, plannedLineNetPaise: 50_000, blockers: []
  }] }, { id: "EL", label: "Electrical", roomName: "Living Room", estimatedPaise: 75_000, netPaise: 0, items: [] },
  { id: "PA", label: "Painting", roomName: "Bedroom", estimatedPaise: 0, netPaise: 0, items: [] }],
  estimateLines: [{
    key: "living-room:CA01", included: true, source: "configuration", itemType: "main_line", roomId: "room-living", roomName: "Living Room",
    mainBasketId: "basket-carpentry", mainBasketName: "Carpentry", subBasketId: "sub-joinery", subBasketName: "Joinery",
    mainLineId: "main-wardrobe", mainLineName: "Wardrobe plywood and laminate", quantity: "80", unit: "sq ft", amountPaise: 250_000,
    itemIds: ["purchase-item-wood"], mode: {
      state: "ready", options: [{ key: "pmc", label: "PMC" }],
      decision: { id: "decision-wood", version: 2, sourceLineItemKey: "living-room:CA01", mode: "pmc", quantity: "80", discountBps: 0,
        markupBasis: "starting", exceptionReason: null, revisionId: "revision-wood", revisionDigest: "synthetic-wood-digest", updatedAt: "2026-10-01T00:00:00.000Z" },
      preview: { formulaVersion: "mode-calculation-v1", mode: "pmc", quantity: "80", quantityScale: 2, baseCostPaise: 100_000,
        adjustedCostPaise: 110_000, lowQuantityImpactPaise: 10_000, sellingPaise: 137_500, finalVendorChargesPaise: null, floorSellingPaise: null,
        marginBps: 2000, appliedImpactBps: 1000, discountBps: 0, discountAmountPaise: 0, quantityRule: null,
        procurementQuantitySuggestion: "82", settings: { scopes: [{ scope: "pmc", source: "scoped", baseRatePaise: 1250,
          lowQuantityLimit: "100", impactBps: 1000, minimumMarkupBps: 1000, startingMarkupBps: 2000 }],
          configuredMarginBps: 2000, markupBasis: "starting" }, components: [] },
      issues: [], revision: { id: "revision-wood", version: 2, status: "active", contentDigest: "synthetic-wood-digest" },
      uom: { id: "uom-sqft", code: "sq ft", decimalScale: 2 }, priceReferences: { "purchase-item-wood": {
        state: "ready", priceVersionId: "price-wood", priceVersionNumber: 2, taxVersionId: "tax-wood", taxVersionNumber: 1,
        unitPricePaise: 120_000, gstBasisPoints: 1800, treatment: "exclusive", effectiveFrom: "2026-01-01", effectiveTo: null, issues: []
      } }
    }
  }, {
    key: "bedroom:CA02", included: true, source: "legacy", itemType: "main_line", roomId: "room-bedroom", roomName: "Bedroom",
    mainBasketId: "basket-furniture", mainBasketName: "Furniture", subBasketId: "sub-bedroom", subBasketName: "Bedroom furniture",
    mainLineId: null, mainLineName: "Bedside table", quantity: "2", unit: "nos", amountPaise: 50_000,
    itemIds: ["purchase-item-bedside"], mode: { state: "exception", options: [],
      decision: { id: "decision-bedside", version: 1, sourceLineItemKey: "bedroom:CA02", mode: null, quantity: null,
        discountBps: 0, markupBasis: "starting", exceptionReason: "Approved historical line has no saved configuration",
        revisionId: null, revisionDigest: null, updatedAt: "2026-10-01T00:00:00.000Z" },
      preview: null, issues: [], revision: null, uom: null, priceReferences: {} }
  }, {
    key: "living-room:EL01", included: true, source: "legacy", itemType: "main_line", roomId: "room-living", roomName: "Living Room",
    mainBasketId: "basket-electrical", mainBasketName: "Electrical", subBasketId: "sub-switches", subBasketName: "Switches",
    mainLineId: null, mainLineName: "Modular switch set", quantity: "3", unit: "set", amountPaise: 75_000, itemIds: [], mode: null
  }, {
    key: "living-room:CA00", included: true, source: "legacy", itemType: "temporary", roomId: "room-living", roomName: "Living Room",
    mainBasketId: "basket-carpentry", mainBasketName: "Carpentry", subBasketId: "sub-provisional", subBasketName: "Provisional",
    mainLineId: null, mainLineName: "Zero-value provisional allowance", quantity: "1", unit: "lot", amountPaise: 0, itemIds: [], mode: null
  }, {
    key: "bedroom:PA01", included: true, source: "legacy", itemType: "temporary", roomId: "room-bedroom", roomName: "Bedroom",
    mainBasketId: "basket-paint", mainBasketName: "Painting", subBasketId: "sub-paint", subBasketName: "Allowance",
    mainLineId: null, mainLineName: "Zero-value paint allowance", quantity: "1", unit: "lot", amountPaise: 0, itemIds: [], mode: null
  }]
};
const qaDefaultProcurementPreparation: PurchaseOrderPreparation = {
  ...qaProcurementModePreparation,
  digest: "e".repeat(64), netPaise: 0, itemCount: 0, readyItemCount: 0,
  sections: qaProcurementModePreparation.sections.map((section) => ({ ...section, netPaise: 0, items: [] })),
  estimateLines: qaProcurementModePreparation.estimateLines.map((line) => ({
    ...line, source: "legacy", mainLineId: null, itemIds: [], mode: null
  }))
};
const qaMismatchMode = qaProcurementModePreparation.estimateLines[0]!.mode!;
const qaProcurementModeMismatchPreparation: PurchaseOrderPreparation = {
  ...qaProcurementModePreparation,
  netPaise: 0, itemCount: 0, readyItemCount: 0,
  sections: qaProcurementModePreparation.sections.map((section) => ({ ...section, netPaise: 0, items: [] })),
  estimateLines: qaProcurementModePreparation.estimateLines.map((line, index) => index === 0 ? {
    ...line, itemIds: [], mode: {
      ...qaMismatchMode, state: "unavailable", options: [], decision: null, preview: null, priceReferences: {},
      availability: ["pmc", "sub_vendor", "in_house"].map((key) => ({ key: key as "pmc" | "sub_vendor" | "in_house",
        label: key === "pmc" ? "PMC" : key === "sub_vendor" ? "Sub-Vendor" : "In-house",
        available: false, issues: [{ code: "PINNED_DIGEST_MISMATCH", message: "Review current saved values." }] })),
      issues: [{ code: "PINNED_DIGEST_MISMATCH", message: "The saved Configuration content does not match its activated digest." }],
      integrity: { status: "mismatch", activatedDigest: "a".repeat(64), observedDigest: "b".repeat(64),
        candidateAvailability: [
          { key: "pmc", label: "PMC", available: true, issues: [] },
          { key: "sub_vendor", label: "Sub-Vendor", available: true, issues: [] },
          { key: "in_house", label: "In-house", available: false,
            issues: [{ code: "MODE_NOT_CONFIGURED", message: "In-house is not configured for this line." }] }
        ] }
    }
  } : line)
};

const qaCompactBasket: ProcurementBasketDetail = {
  id: "basket-carpentry", name: "Carpentry", projectId: "project-one",
  classification: "special", automaticSubVendor: false, boqReady: true, standardCost: null,
  estimateSource: qaProcurementModePreparation.estimateSource,
  preparationDigest: qaProcurementModePreparation.digest,
  includedLineCount: 2, readyLineCount: 2, approvedEstimatePaise: 250_000,
  baseCostPaise: 120_000, adjustedCostPaise: 135_000, workingTotalPaise: 170_000,
  workingTotalComplete: true, committedNetPaise: 0, state: "ready",
  lines: [{
    sourceLineItemKey: "living-room:CA01", roomId: "room-living", roomName: "Living Room",
    subBasketId: "sub-joinery", subBasketName: "Joinery", mainLineId: "main-wardrobe",
    mainLineName: "Wardrobe plywood and laminate", approvedQuantity: "80", approvedUnit: "sq ft",
    approvedAmountPaise: 200_000, included: true, source: "configuration",
    baseUnitRatePaise: 1_250, projectRate: { version: 0, overridePaise: null }, standardCost: null,
    mode: qaProcurementModePreparation.estimateLines[0]!.mode!
  }, {
    sourceLineItemKey: "bedroom:CA02", roomId: "room-bedroom", roomName: "Bedroom",
    subBasketId: "sub-bedroom", subBasketName: "Bedroom furniture", mainLineId: "main-bedside",
    mainLineName: "Bedside table finishing", approvedQuantity: "2", approvedUnit: "nos",
    approvedAmountPaise: 50_000, included: true, source: "configuration",
    baseUnitRatePaise: 10_000, projectRate: { version: 0, overridePaise: null }, standardCost: null,
    mode: { ...qaProcurementModePreparation.estimateLines[0]!.mode!,
      decision: { ...qaProcurementModePreparation.estimateLines[0]!.mode!.decision!, sourceLineItemKey: "bedroom:CA02", quantity: "2" },
      preview: { ...qaProcurementModePreparation.estimateLines[0]!.mode!.preview!, quantity: "2",
        baseCostPaise: 20_000, adjustedCostPaise: 25_000, lowQuantityImpactPaise: 5_000, sellingPaise: 32_500 },
      uom: { id: "uom-nos", code: "nos", decimalScale: 0 }
    }
  }]
};
const qaStandardBasket: ProcurementBasketDetail = {
  ...qaCompactBasket,
  classification: "standard",
  automaticSubVendor: true,
  boqReady: true,
  readyLineCount: 1,
  baseCostPaise: 30_000,
  adjustedCostPaise: 37_500,
  workingTotalPaise: 46_875,
  workingTotalComplete: false,
  state: "partial",
  standardCost: { totalPaise: 135_000, complete: true, provisional: true, pricedLineCount: 2 },
  lines: [{
    ...qaCompactBasket.lines[0]!,
    baseUnitRatePaise: 1_250,
    standardCost: { state: "suggested", mode: "sub_vendor", calculationQuantity: "80",
      baseRates: [{ scope: "sub_vendor", ratePaise: 1_250 }], baseCostPaise: 100_000,
      adjustedCostPaise: 110_000, issues: [] },
    mode: { ...qaCompactBasket.lines[0]!.mode!, state: "selection_required", decision: null, preview: null,
      options: [{ key: "sub_vendor", label: "Sub-vendor" }],
      availability: [{ key: "sub_vendor", label: "Sub-vendor", available: true, issues: [] }] }
  }, {
    ...qaCompactBasket.lines[1]!,
    baseUnitRatePaise: 10_000,
    standardCost: { state: "suggested", mode: "sub_vendor", calculationQuantity: "2",
      baseRates: [{ scope: "sub_vendor", ratePaise: 10_000 }], baseCostPaise: 20_000,
      adjustedCostPaise: 25_000, issues: [] },
    mode: { ...qaCompactBasket.lines[1]!.mode!,
      decision: { ...qaCompactBasket.lines[1]!.mode!.decision!, quantity: "3" },
      preview: { ...qaCompactBasket.lines[1]!.mode!.preview!, quantity: "3",
        baseCostPaise: 30_000, adjustedCostPaise: 37_500, lowQuantityImpactPaise: 7_500, sellingPaise: 46_875,
        settings: { ...qaCompactBasket.lines[1]!.mode!.preview!.settings,
          scopes: [{ scope: "pmc", source: "scoped", baseRatePaise: 10_000,
            lowQuantityLimit: "5", impactBps: 2_500, minimumMarkupBps: 1_000, startingMarkupBps: 2_000 }] } }
    }
  }]
};
function compactBasketModeGroups(basket: ProcurementBasketDetail, mode: "sub_vendor" | "pmc"): ProcurementBasketModeGroup[] {
  // Both saved QA scenarios have two included lines and known, explicit approved modes.
  const cost = mode === "sub_vendor" ? basket.standardCost!.totalPaise! : basket.adjustedCostPaise;
  const metrics = { ...procurement.qaEmptyModeMetrics, includedLineCount: 2, boqReadyLineCount: 2,
    readinessPercent: 100, approvedEstimatePaise: 250_000, currentCostPaise: cost };
  return procurement.qaEmptyModeGroups().map((group) => group.mode !== mode ? group : {
    ...group, ...metrics, basketCount: 1, baskets: [{ ...metrics, id: basket.id, name: basket.name,
      sourceLineItemKeys: ["living-room:CA01", "bedroom:CA02"] }] });
}
export type EnterpriseProjectRate = { version: number; overridePaise: number | null };

export function enterpriseStandardBasketForRates(rates: ReadonlyMap<string, EnterpriseProjectRate>): ProcurementBasketDetail {
  const lines = qaStandardBasket.lines.map((line) => {
    const projectRate = rates.get(line.sourceLineItemKey) ?? { version: 0, overridePaise: null };
    const baseUnitRatePaise = projectRate.overridePaise ?? line.baseUnitRatePaise!;
    const originalCost = line.standardCost!;
    const baseCostPaise = BigInt(baseUnitRatePaise) * BigInt(line.approvedQuantity);
    const adjustedCostPaise = (baseCostPaise * BigInt(originalCost.adjustedCostPaise!) +
      BigInt(originalCost.baseCostPaise!) / 2n) / BigInt(originalCost.baseCostPaise!);
    return { ...line, projectRate, baseUnitRatePaise,
      standardCost: { ...originalCost, baseRates: [{ scope: "sub_vendor" as const, ratePaise: baseUnitRatePaise }],
        baseCostPaise: Number(baseCostPaise), adjustedCostPaise: Number(adjustedCostPaise) } };
  });
  const version = [...rates.values()].reduce((sum, rate) => sum + rate.version, 0);
  const baseCostPaise = lines.reduce((sum, line) => sum + line.standardCost!.baseCostPaise!, 0);
  const totalPaise = lines.reduce((sum, line) => sum + line.standardCost!.adjustedCostPaise!, 0);
  return { ...qaStandardBasket, lines, baseCostPaise, adjustedCostPaise: totalPaise,
    standardCost: { ...qaStandardBasket.standardCost!, totalPaise },
    preparationDigest: version === 0 ? qaStandardBasket.preparationDigest : version.toString(16).padStart(64, "0") };
}
const qaConfigurationMismatch = { code: "PINNED_DIGEST_MISMATCH",
  message: "The saved Configuration content does not match its activated digest." };
const qaUnverifiedBasket: ProcurementBasketDetail = {
  ...qaStandardBasket,
  lines: qaStandardBasket.lines.map((line, index) => index === 0 ? {
    ...line,
    standardCost: { ...line.standardCost!, state: "observed_unverified" as const,
      issues: [qaConfigurationMismatch] },
    mode: { ...line.mode!, state: "unavailable" as const, options: [], preview: null,
      issues: [qaConfigurationMismatch],
      availability: [{ key: "sub_vendor" as const, label: "Sub-vendor", available: false,
        issues: [qaConfigurationMismatch] }],
      integrity: { status: "mismatch" as const, activatedDigest: "a".repeat(64),
        observedDigest: "b".repeat(64), candidateAvailability: [{ key: "sub_vendor" as const,
          label: "Sub-vendor", available: true, issues: [] }] } }
  } : line)
};
const qaCompactVendors: ProcurementVendorCandidate[] = [{
  vendorId: "vendor-joinery", code: "VEN-J01", name: "Sharma Interiors", contactEmail: "sharma@example.test",
  kpiScoreBps: 8600, city: { name: "Bengaluru", key: "bengaluru" }, cityVersion: 1,
  cityMatch: "same_city", eligible: true, blockers: []
}, {
  vendorId: "vendor-finish", code: "VEN-F02", name: "Decor Masters", contactEmail: "decor@example.test",
  kpiScoreBps: 5500, city: { name: "Mysuru", key: "mysuru" }, cityVersion: 1,
  cityMatch: "outside_city", eligible: true, blockers: []
}];

function qaQuoteTotals(netPaise: number, gstBasisPoints: number): PurchaseOrderTotals {
  const gstPaise = Math.round(netPaise * gstBasisPoints / 10_000);
  return { netPaise, gstPaise, totalPaise: netPaise + gstPaise };
}

export function enterpriseProcurementQuoteFor(body: unknown): PurchaseOrderRequestQuote {
  const input = body as { expectedPreparationDigest?: unknown; lines?: PurchaseOrderRequestLineInput[];
    vendorTerms?: Array<{ vendorId: string; terms: string }> };
  const prepared = qaProcurementModePreparation;
  const items = prepared.sections.flatMap((section) => section.items);
  if (input?.expectedPreparationDigest !== prepared.digest || !Array.isArray(input.lines) || input.lines.length !== items.length ||
    !Array.isArray(input.vendorTerms) || input.vendorTerms.length !== items.length) throw new Error("Synthetic QA quote does not match prepared items.");
  const terms = new Map(input.vendorTerms.map((entry) => [entry.vendorId, entry.terms]));
  const quoteLines = items.map((item) => {
    const selected = input.lines!.find((entry) => entry.procurementItemId === item.id);
    const line = prepared.estimateLines.find((candidate) => candidate.key === item.sourceLineItemKey)!;
    const reference = line.mode?.priceReferences?.[item.id];
    if (!selected || selected.expectedVersion !== item.version || !Number.isInteger(selected.gstBasisPoints) ||
      selected.gstBasisPoints < 0 || selected.gstBasisPoints > 10_000 || !terms.get(item.vendor!.id)?.trim()) {
      throw new Error("Synthetic QA quote needs current child versions, explicit GST and vendor terms.");
    }
    if ((!reference || reference.state !== "ready" || reference.unitPricePaise !== item.pricePaise || reference.gstBasisPoints !== selected.gstBasisPoints) &&
      (selected.commercialExceptionReason?.trim().length ?? 0) < 10) throw new Error("Explain the agreed price or tax exception before quoting.");
    return { id: `quote-${item.id}`, procurementItemId: item.id, procurementItemVersion: item.version,
      quantityMilliUnits: item.plannedOrderQuantityMilliUnits!, unitPricePaise: item.pricePaise, gstBasisPoints: selected.gstBasisPoints,
      scopeType: selected.scopeType, description: selected.description, targetDate: selected.targetDate,
      deliveryLocation: selected.deliveryLocation, ...qaQuoteTotals(item.plannedLineNetPaise!, selected.gstBasisPoints),
      vendorId: item.vendor!.id, vendorCode: item.vendor!.code, vendorName: item.vendor!.name, allocatedWorkPaise: item.allocatedWorkPaise!,
      sectionLabel: "Carpentry", sourceSectionId: item.sourceSectionId!, sourceLineItemKey: item.sourceLineItemKey!,
      roomName: item.roomName!, itemName: item.itemName, brand: item.brand, uomCode: item.uom.code,
      commercialExceptionReason: selected.commercialExceptionReason?.trim() || null };
  });
  const sum = (lines: typeof quoteLines): PurchaseOrderTotals => lines.reduce((total, line) => ({
    netPaise: total.netPaise + line.netPaise, gstPaise: total.gstPaise + line.gstPaise, totalPaise: total.totalPaise + line.totalPaise
  }), { netPaise: 0, gstPaise: 0, totalPaise: 0 });
  const totals = sum(quoteLines);
  const modeSnapshots = prepared.estimateLines.filter((line) => line.itemIds.length > 0).map((line) => {
    const children = quoteLines.filter((child) => child.sourceLineItemKey === line.key);
    const actualTotals = sum(children);
    const { key, source, roomId, roomName, mainBasketId, mainBasketName, subBasketId, subBasketName, mainLineId, mainLineName } = line;
    return { sourceLineItemKey: key, source, roomId, roomName, mainBasketId, mainBasketName, subBasketId, subBasketName,
      mainLineId, mainLineName, approvedQuantity: line.quantity, approvedUnit: line.unit, approvedAmountPaise: line.amountPaise!,
      referenceAsOf: "2026-10-04", mode: line.mode!, actualChildren: children.map((child) => ({
        procurementItemId: child.procurementItemId, vendorId: child.vendorId, quantityMilliUnits: child.quantityMilliUnits,
        unitPricePaise: child.unitPricePaise, gstBasisPoints: child.gstBasisPoints, allocatedWorkPaise: child.allocatedWorkPaise,
        netPaise: child.netPaise, gstPaise: child.gstPaise, totalPaise: child.totalPaise,
        commercialExceptionReason: child.commercialExceptionReason
      })), actualTotals, actualNetMinusConfiguredCostPaise: line.mode?.preview
        ? actualTotals.netPaise - line.mode.preview.adjustedCostPaise : null };
  });
  return { projectId: prepared.projectId, preparationDigest: prepared.digest, estimateSource: prepared.estimateSource,
    approvedEstimatePaise: prepared.approvedEstimatePaise, committedPaise: 0, committedGstPaise: 0, committedTotalPaise: 0,
    remainingPaise: prepared.remainingPaise, lines: quoteLines, modeSnapshots,
    sectionTotals: [{ sectionId: "CA", label: "Carpentry", totals }],
    vendorTotals: items.map((item) => ({ vendorId: item.vendor!.id, code: item.vendor!.code, name: item.vendor!.name,
      terms: terms.get(item.vendor!.id)!, totals: sum(quoteLines.filter((line) => line.vendorId === item.vendor!.id)) })), totals };
}
const team = [
  { user: { id: "designer-1", name: "Ananya Rao", email: "ananya@lisno.example" }, activeProjectCount: 2, workload: 24, overdueCount: 1, yellowRiskCount: 2, pendingEvaluation: true, kpi: { score: 84, components: designer.components }, projects: designer.projects.map((p) => ({ ...p, progress: 45 })), tasks: designer.kpiTasks },
  { user: { id: "designer-2", name: "Kabir Shah", email: "kabir@lisno.example" }, activeProjectCount: 1, workload: 12, overdueCount: 0, yellowRiskCount: 1, pendingEvaluation: false, kpi: { score: 79, components: designer.components }, projects: [], tasks: [] }
];
const buckets = [finance.baseBucket, finance.overBudgetBucket, finance.unknownCompletionBucket, finance.lateCompletionBucket];
function zeroAggregates(value: unknown): unknown {
  if (typeof value === "number") return 0;
  if (Array.isArray(value)) return [];
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, zeroAggregates(v)]));
  return value;
}

export function enterpriseDataFor(path: string, params: URLSearchParams, scenario: EnterpriseScenario,
  projectRates: ReadonlyMap<string, EnterpriseProjectRate> = new Map()): unknown {
  const empty = scenario.state === "empty";
  const estimatorReady = new URLSearchParams(scenario.route.split("?")[1]).get("qaEstimator") === "ready";
  const recommendationReady = new URLSearchParams(scenario.route.split("?")[1]).get("qaRecommendations") === "ready";
  const recommendationCompletionReady = new URLSearchParams(scenario.route.split("?")[1]).get("qaRecommendationCompletion") === "ready";
  const procurementModesReady = new URLSearchParams(scenario.route.split("?")[1]).get("qaProcurementModes") === "ready";
  const procurementModesMismatch = new URLSearchParams(scenario.route.split("?")[1]).get("qaProcurementModes") === "mismatch";
  const procurementGroupsReady = new URLSearchParams(scenario.route.split("?")[1]).get("qaProcurementGroups") === "ready";
  const procurementGalleryState = new URLSearchParams(scenario.route.split("?")[1]).get("qaProcurementGallery");
  const galleryProjects = procurementGalleryState === "ready" || procurementGalleryState === "large"
    ? createProcurementGalleryFixture(procurementGalleryState === "large") : null;
  const groupFixture = galleryProjects ? procurement.createProcurementGroupFixture()
    : procurementGroupsReady ? procurement.createProcurementGroupBrowserFixture() : null;
  const compactBasketReady = new URLSearchParams(scenario.route.split("?")[1]).get("qaCompactBasket") === "ready";
  const standardBasketReady = new URLSearchParams(scenario.route.split("?")[1]).get("qaStandardBasket") === "ready";
  const standardBasketUnverified = new URLSearchParams(scenario.route.split("?")[1]).get("qaStandardBasket") === "unverified";
  const syntheticBasketReady = compactBasketReady || standardBasketReady || standardBasketUnverified;
  const visibleCompactBasket = standardBasketUnverified ? qaUnverifiedBasket : standardBasketReady
    ? enterpriseStandardBasketForRates(projectRates) : qaCompactBasket;
  const list = <T,>(rows: readonly T[]): T[] => empty ? [] : [...rows];
  const page = <T,>(rows: readonly T[]) => {
    const filtered = list(rows).filter((row) => !params.get("search") || JSON.stringify(row).toLowerCase().includes(params.get("search")!.toLowerCase()));
    const limit = Number(params.get("limit") ?? 100), offset = Number(params.get("offset") ?? 0);
    return { items: filtered.slice(offset, offset + limit), pagination: { limit, offset, total: filtered.length, hasMore: offset + limit < filtered.length } };
  };
  if (path === "/admin/dashboard/overview") return empty ? { ...superAdminDashboardOverviewFixture, projects: zeroAggregates(superAdminDashboardOverviewFixture.projects), estimation: zeroAggregates(superAdminDashboardOverviewFixture.estimation), design: zeroAggregates(superAdminDashboardOverviewFixture.design), finance: zeroAggregates(superAdminDashboardOverviewFixture.finance), workforce: zeroAggregates(superAdminDashboardOverviewFixture.workforce), execution: zeroAggregates(superAdminDashboardOverviewFixture.execution), procurement: zeroAggregates(superAdminDashboardOverviewFixture.procurement), governance: zeroAggregates(superAdminDashboardOverviewFixture.governance), risk: zeroAggregates(superAdminDashboardOverviewFixture.risk), trends: [] } : superAdminDashboardOverviewFixture;
  if (path === "/daily-critical-tasks") return { timezone: "Asia/Kolkata", localDate: "2026-10-01", scheduledAt: "2026-10-01T11:30:00.000Z", acknowledgedAt: "2026-10-01T11:35:00.000Z", items: [] };
  if (path === "/chat/availability") return { available: false, reason: "Synthetic QA" };
  if (path === "/admin/purchase-order-requests/pending") return { items: empty ? [] : [qaPendingPurchaseRequest], total: empty ? 0 : 1, limit: 50, offset: 0 };
  if (path === "/admin/purchase-orders/pending") return { items: empty ? [] : [qaPendingIndividualOrder], total: empty ? 0 : 1, limit: 50, offset: 0 };
  if (path === "/admin/project-completion-tasks") return { items: [], total: 0, limit: 100, offset: 0 };
  if (path === "/admin/dashboard/projects") return { ...superAdminDashboardProjectsPageFixture, ...page(superAdminDashboardProjectsPageFixture.items) };
  if (path === "/admin/dashboard/workforce") return { ...superAdminDashboardWorkforcePageFixture, ...page(superAdminDashboardWorkforcePageFixture.items) };
  if (path === "/admin/projects") return page([admin.project, { ...admin.approvedPendingProject, name: "North Residence — upper floor and garden apartment renovation" }]);
  if (/^\/admin\/projects\/[^/]+$/.test(path)) return path.endsWith("project-murthy") ? admin.approvedPendingProject : { ...admin.project, id: decodeURIComponent(path.split("/").at(-1)!) };
  if (path === "/admin/users") {
    // `list` (not `page`) so the summary stays independent of search and
    // pagination, matching the backend's visible-role-scoped aggregation.
    const visible = list(users.directoryRows);
    return {
      ...page(users.directoryRows),
      filterRoles: ROLE_CODES,
      manageableRoles: OPERATIONAL_ROLES,
      summary: {
        total: visible.length,
        active: visible.filter((row) => row.active).length,
        inactive: visible.filter((row) => !row.active).length,
        roleCount: new Set(visible.map((row) => row.role)).size
      }
    };
  }
  if (path === "/admin/user-invitations") return { ...page<UserInvitationItem>([{ id: "invitation-1", email: "new-designer@lisno.example", name: "Synthetic invited designer", role: "designer", mobile: "+91 90000 00000", status: "pending", currentLinkAvailable: true, availableActions: ["resend", "revoke"], invitedBy: { id: "super_admin-1", name: "Synthetic reviewer", email: "reviewer@lisno.example", role: "super_admin" }, deliveryStatus: "sent", deliveryAttemptedAt: "2026-09-12T10:00:00.000Z", sentAt: "2026-09-12T10:00:00.000Z", issuedAt: "2026-09-12T10:00:00.000Z", expiresAt: "2026-09-20T00:00:00.000Z", version: 1, createdAt: "2026-09-12T10:00:00.000Z", updatedAt: "2026-09-12T10:00:00.000Z" }]), invitableRoles: OPERATIONAL_ROLES };
  if (path === "/admin/estimators" || path === "/admin/sales-managers") return page([{ id: "estimator-1", name: "Ravi Estimator", email: "ravi@lisno.example", active: true }]);
  if (path === "/admin/designers") return list(team.map((t) => ({ ...t.user, activeProjectCount: t.activeProjectCount })));
  if (path === "/admin/workers") return list([{ id: "worker-1", name: "Aarav Electrician", email: "electrician@lisno.example", role: "worker_electrician" }]);
  if (path === "/access-requests/review" || path === "/access-requests/mine") return page([access.reviewRow, { ...access.reviewRow, id: "request-approved", status: "approved", activeGrant: access.activeGrant }]);
  if (path === "/admin/estimate-client-response-tasks") return page([responses.pendingDetail]);
  if (/^\/admin\/estimate-client-response-tasks\/[^/]+$/.test(path)) return responses.pendingDetail;
  if (path === "/admin/design-plan-response-tasks") return [];
  if (path === "/projects") return page(designer.projects);
  if (/^\/projects\/[^/]+$/.test(path)) return { ...project.project, id: decodeURIComponent(path.split("/").at(-1)!), progress: 45, ...(empty ? { floors: [] } : {}) };
  if (/^\/projects\/[^/]+\/status$/.test(path)) {
    const projectId = decodeURIComponent(path.split("/")[2]);
    return { projectId, projectName: project.project.name, projectStatus: "active", serverNow: "2026-10-01T10:00:00.000Z", state: "no_pending", currentStage: null, pendingActions: [], issue: null };
  }
  if (/^\/projects\/[^/]+\/vendor-work-progress$/.test(path)) return { projectId: decodeURIComponent(path.split("/")[2]), assignments: [], pendingOwner: "none" };
  if (path === "/vendor/work") return { items: [], total: 0, limit: Number(params.get("limit") ?? 50), offset: Number(params.get("offset") ?? 0) };
  if (/^\/projects\/[^/]+\/design-workflow$/.test(path)) return empty ? { projectId: path.split("/")[2], projectName: "Aurora Villa", estimateApprovalStatus: "approved", serverNow: "2026-09-13T10:00:00.000Z", floors: [] } : { ...drawing.drawingWorkflow(path.split("/")[2], scenario.role === "designer"), estimateApprovalStatus: "approved" };
  if (path === "/design-workflow/payment-confirmations") return [];
  if (/^\/projects\/[^/]+\/design-versions$/.test(path)) return page([{ ...drawing.approvedDocument, projectId: path.split("/")[2] }]);
  if (path === "/design-versions/qa-approved-document/sections") return empty ? { ...drawing.approvedExtraction, pages: [], sections: [] } : drawing.approvedExtraction;
  if (/^\/projects\/[^/]+\/activity$/.test(path)) return page([]);
  if (/^\/admin\/projects\/[^/]+\/(workflow-tasks|section-assignments)$/.test(path)) return [];
  if (path === "/designer/design-plan-tasks") return list(designer.designPlanTasks.map((task) => ({ ...task, rooms: [{ id: "room-living", label: "Living Room" }], scopes: ["EL"], lineItems: [{ catalogueId: "EL01", roomName: "Living Room", specification: "Lighting point", unit: "point", quantity: 6, included: true }] })));
  if (/^\/kpis\/users\/[^/]+\/tasks$/.test(path)) return page(designer.kpiTasks);
  if (/^\/kpis\/users\/[^/]+$/.test(path)) return { userId: path.split("/")[3], periodStartAt: params.get("from"), periodEndAt: params.get("to"), score: empty ? 0 : 84, components: empty ? designer.components.map((c) => ({ ...c, score: null, eligibleCount: 0 })) : designer.components, aggregates: empty ? zeroAggregates(designer.aggregates) : designer.aggregates, tasks: page(designer.kpiTasks) };
  if (/^\/tasks\/[^/]+\/events$/.test(path)) return page(designer.kpiTasks[0].events.items);
  if (path === "/organization/team") return page(team);
  if (path === "/organization/managers") return page([{ id: "manager-1", name: "Aarav Shah", email: "aarav@lisno.example" }]);
  if (path === "/organization/tree") return page([{ id: "manager-1", name: "Aarav Shah", email: "aarav@lisno.example", designers: page(team.map(({ user, ...summary }) => ({ ...user, summary }))), summary: { teamKpi: { score: 82, components: [] }, workload: 36, redCount: 1, yellowCount: 3, evaluationCoverage: 50 } }]);
  if (/^\/designers\/[^/]+\/summary$/.test(path)) return team.find((t) => t.user.id === path.split("/")[2]) ?? team[0];
  if (/^\/(evaluations\/[^/]+|designers\/[^/]+\/audit)$/.test(path)) return page([]);
  if (path === "/client/project-summaries") return page(client.summaries);
  if (path === "/clients/projects/project-villa/site-completion") return {
    projectId: "project-villa", projectStatus: "active", version: 1, progress: 0,
    note: "", status: "draft", currentRound: 0, canSubmit: false,
    needsReverification: false, blockers: [], review: null
  };
  if (path === "/client/latest-approved-versions") return list([drawing.approvedDocument]);
  if (path === "/client/estimates") return list([{ ...estimate, projectId: "project-villa", status: "client_approved", designPlanStatus: "ready_for_client", designPlanVersion: 1, rooms: [{ id: "room-living", label: "Living Room" }], scopes: ["EL"], lineItems: [{ catalogueId: "EL01", roomName: "Living Room", specification: "Lighting point", unit: "point", quantity: 6, rate: 200, amount: 1200, included: true }], lead: { ...lead, _id: lead.id, projectName: "Aurora Villa" } }]);
  if (path === "/client/estimates/estimate-1/design-drawings") return empty ? { uploads: [], pages: [], drawings: [], revisions: [], readiness: { ready: false, total: 0, approved: 0, awaitingReview: 0, changesRequested: 0 } } : drawing.clientDrawingWorkspace("estimate-1");
  if (path === "/client/estimates/estimate-1/plan-review") return empty ? { uploads: [], pages: [], openRequests: [] } : drawing.clientPlanWorkspace("estimate-1");
  if (/^\/client\/projects\/[^/]+\/design-sections$/.test(path)) return empty ? { projectId: path.split("/")[3], sections: [], progress: { total: 0, approved: 0, awaitingReview: 0, rejected: 0 } } : { ...drawing.review, projectId: path.split("/")[3] };
  if (/^\/clients\/projects\/[^/]+\/vendor-work-reviews$/.test(path)) return { items: [], total: 0, pendingTotal: 0, limit: Number(params.get("limit") ?? 50), offset: Number(params.get("offset") ?? 0) };
  if (path === "/leads") return page([lead]);
  if (path === "/leads/lead-1") return lead;
  if (path === "/leads/lead-1/activities") return page([{ id: "activity-1", leadId: lead.id, actorId: lead.ownerId, type: "meeting", note: "Reviewed kitchen and living room measurements with the client.", occurredAt: lead.updatedAt, createdAt: lead.updatedAt }]);
  if (path === "/leads/lead-1/estimate") return empty || estimatorReady ? null : estimate;
  if (path === "/estimation/catalogue/recommendations") return { sources: (params.get("mainLineIds") ?? "").split(",").filter(Boolean).map((mainLineId) => {
    const source = recommendationSources.find((line) => line.mainLineId === mainLineId);
    if (!source || !estimatorReady) return { mainLineId, available: false, revisionId: null, revisionVersion: null, itemVersion: null, rules: [], guidance: [] };
    return {
      mainLineId, available: true, revisionId: source.revisionId,
      revisionVersion: source.revisionVersion ?? 1, itemVersion: source.itemVersion ?? 1,
      rules: recommendationReady && mainLineId === "item-false-ceiling" ? [{
        id: "qa-rule-ceiling-paint", requirement: "must", reason: "Painting protects and finishes the new false ceiling surface.",
        targetKind: "main_line", targetBasketId: "basket-paint", targetSubBasketId: "sub-paint", targetMainLineId: "line-paint",
        targetRevisionId: "revision-paint", targetRevisionVersion: 1, targetItemVersion: 1,
        available: true, completionRequired: false
      }, ...(recommendationCompletionReady ? [{
        id: "qa-rule-paint-touchup", requirement: "can", reason: "Allow for a final paint touch-up after fixture installation.",
        targetKind: "main_line", targetBasketId: "basket-paint", targetSubBasketId: "sub-paint", targetMainLineId: "item-paint-touchup",
        targetRevisionId: "revision-paint-touchup", targetRevisionVersion: 1, targetItemVersion: 1,
        available: true, completionRequired: true
      }, {
        id: "qa-rule-paint-group", requirement: "can", reason: "Review every decorative paint item around the finished ceiling.",
        targetKind: "sub_basket", targetBasketId: "basket-paint", targetSubBasketId: "sub-paint", targetMainLineId: null,
        targetRevisionId: null, targetRevisionVersion: null, targetItemVersion: null,
        available: true, completionRequired: true,
        children: [
          { mainLineId: "line-paint", available: true, completionRequired: false, revisionId: "revision-paint", revisionVersion: 1, itemVersion: 1 },
          { mainLineId: "item-paint-touchup", available: true, completionRequired: true, revisionId: "revision-paint-touchup", revisionVersion: 1, itemVersion: 1 }
        ],
        unavailableChildCount: 0
      }] : [])] : [],
      guidance: recommendationReady && mainLineId === "item-false-ceiling"
        ? [{ id: "qa-guidance-ceiling", name: "Coordinate ceiling services", reason: "Confirm fixture cutouts before closing the ceiling." }]
        : []
    };
  }) };
  if (path === "/estimation/catalogue") return { ...page(estimatorReady ? (recommendationReady ? recommendationCatalogue : estimatorCatalogue) : []), ineligibleLineCount: estimatorReady ? 1 : 0 };
  if (path === "/estimates") return list([estimate]);
  if (/^\/estimates\/(estimate-1|estimate-aurora-villa|estimate-aurora-studio)\/design-uploads$/.test(path)) return empty ? { uploads: [], pages: [], drawings: [], revisions: [] } : drawing.extractedWorkspace(path.split("/")[2]);
  if (/^\/estimates\/(estimate-1|estimate-aurora-villa|estimate-aurora-studio)\/design-plan-documents$/.test(path)) return { manifestHash: `synthetic-${path.split("/")[2]}`, readyForSubmission: false, documents: [], reviewRoundId: null };
  if (path === "/estimates/pending-review" || path === "/estimates/review-queue") return [];
  if (path === "/estimates/designers") return team.map((t) => t.user);
  if (path === "/finance/projects") return { ...page(buckets), summary: empty ? zeroAggregates(finance.portfolioSummary) : finance.portfolioSummary };
  if (/^\/finance\/projects\/[^/]+(?:\/entries)?$/.test(path)) {
    const projectId = decodeURIComponent(path.split("/")[3]);
    const bucket = [...buckets, admin.approvedPendingBucket].find((candidate) => candidate.projectId === projectId);
    if (!bucket) return Response.json({ error: { code: "FINANCE_BUCKET_NOT_FOUND", message: "The synthetic project has no approved finance baseline yet." } }, { status: 404 });
    return path.endsWith("/entries") ? page(financeLedgerFor(bucket)) : bucket;
  }
  if (path === "/procurement/projects") return list(galleryProjects ?? [procurement.procurementProject]);
  if (galleryProjects && /^\/procurement\/projects\/[^/]+\/(baskets|purchase-order-requests|purchase-order-commitments)$/.test(path)) {
    const galleryProject = galleryProjects.find((entry) => entry.projectId === decodeURIComponent(path.split("/")[3]!));
    if (galleryProject && path.endsWith("/purchase-order-requests")) return { items: [], total: 0, limit: 50, offset: 0 };
    if (galleryProject && path.endsWith("/purchase-order-commitments")) {
      const approvedEstimatePaise = galleryProject.sections.reduce((sum, section) => sum + section.estimatedAmountPaise, 0);
      return { approvedEstimatePaise, committedPaise: 0, committedGstPaise: 0, committedTotalPaise: 0, remainingPaise: approvedEstimatePaise };
    }
    if (galleryProject && galleryProject.projectId !== "project-one" && path.endsWith("/baskets")) return {
      projectId: galleryProject.projectId,
      estimateSource: { estimateId: galleryProject.estimateId, estimateVersion: galleryProject.estimateVersion, estimateReviewRoundId: null },
      baskets: [], modeGroups: procurement.qaEmptyModeGroups()
    };
  }
  if (groupFixture && path === "/procurement/projects/project-one/baskets") return empty
    ? { ...groupFixture.list, baskets: [], modeGroups: procurement.qaEmptyModeGroups() } : groupFixture.list;
  if (groupFixture && /^\/procurement\/projects\/project-one\/baskets\/[^/]+(?:\/enquiries|\/vendor-candidates)?$/.test(path)) {
    if (path.endsWith("/enquiries")) return [];
    if (path.endsWith("/vendor-candidates")) return { projectCity: { name: "Bengaluru", key: "bengaluru" },
      items: qaCompactVendors, total: 2, matchingVendorCount: 2, blockedReasonCounts: {}, limit: 50, offset: 0 };
    return groupFixture.details.find((basket) => basket.id === decodeURIComponent(path.split("/").at(-1)!));
  }
  if (path === "/procurement/projects/project-one/baskets") return syntheticBasketReady ? {
    projectId: "project-one", estimateSource: visibleCompactBasket.estimateSource,
    modeGroups: compactBasketModeGroups(visibleCompactBasket, standardBasketReady || standardBasketUnverified ? "sub_vendor" : "pmc"),
    baskets: [{ id: visibleCompactBasket.id, name: visibleCompactBasket.name,
      classification: visibleCompactBasket.classification, automaticSubVendor: visibleCompactBasket.automaticSubVendor,
      boqReady: visibleCompactBasket.boqReady, standardCost: visibleCompactBasket.standardCost,
      includedLineCount: visibleCompactBasket.includedLineCount,
      readyLineCount: visibleCompactBasket.readyLineCount, approvedEstimatePaise: visibleCompactBasket.approvedEstimatePaise,
      baseCostPaise: visibleCompactBasket.baseCostPaise, adjustedCostPaise: visibleCompactBasket.adjustedCostPaise,
      workingTotalPaise: visibleCompactBasket.workingTotalPaise, workingTotalComplete: visibleCompactBasket.workingTotalComplete,
      committedNetPaise: visibleCompactBasket.committedNetPaise, state: visibleCompactBasket.state }]
  } : {
    projectId: "project-one", estimateSource: qaProcurementModePreparation.estimateSource,
    modeGroups: empty ? procurement.qaEmptyModeGroups() : [...procurement.qaEmptyModeGroups(), {
      ...procurement.qaEmptyModeMetrics, mode: "unrecorded", basketCount: 1, includedLineCount: 2,
      readinessPercent: 0, approvedEstimatePaise: 250_000, currentCostPaise: null,
      currentCostComplete: false, unpricedLineCount: 2, modeIssueCount: 2,
      baskets: [{ ...procurement.qaEmptyModeMetrics, id: "basket-carpentry", name: "Carpentry",
        sourceLineItemKeys: ["living-room:CA01", "bedroom:CA02"], includedLineCount: 2,
        readinessPercent: 0, approvedEstimatePaise: 250_000, currentCostPaise: null,
        currentCostComplete: false, unpricedLineCount: 2, modeIssueCount: 2 }] }],
    baskets: empty ? [] : [{ id: "basket-carpentry", name: "Carpentry", includedLineCount: 2,
      classification: "special", automaticSubVendor: false, boqReady: false, standardCost: null,
      readyLineCount: procurementModesReady ? 1 : 0, approvedEstimatePaise: 250_000,
      baseCostPaise: procurementModesReady ? 100_000 : 0,
      adjustedCostPaise: procurementModesReady ? 110_000 : 0,
      workingTotalPaise: 0, workingTotalComplete: false, committedNetPaise: 0, state: "partial" }]
  };
  if (syntheticBasketReady && path === "/procurement/projects/project-one/baskets/basket-carpentry") return visibleCompactBasket;
  if (syntheticBasketReady && path === "/procurement/projects/project-one/baskets/basket-carpentry/enquiries") return [];
  if (syntheticBasketReady && path === "/procurement/projects/project-one/baskets/basket-carpentry/vendor-candidates") {
    const city = params.get("city") ?? "all";
    const search = (params.get("q") ?? "").trim().toLocaleLowerCase();
    const filtered = qaCompactVendors.filter((vendor) => (city === "all" || vendor.cityMatch === city) &&
      (vendor.name.toLocaleLowerCase().includes(search) || vendor.code.toLocaleLowerCase().includes(search)));
    const offset = Number(params.get("offset") ?? 0);
    const limit = Number(params.get("limit") ?? 50);
    return { projectCity: { name: "Bengaluru", key: "bengaluru" }, items: filtered.slice(offset, offset + limit),
      matchingVendorCount: filtered.length, blockedReasonCounts: {}, total: filtered.length, limit, offset };
  }
  if (path === "/procurement/projects/project-one/purchase-order-preparation") return !empty && procurementModesMismatch
    ? qaProcurementModeMismatchPreparation : (procurementModesReady || syntheticBasketReady) && !empty
      ? qaProcurementModePreparation : qaDefaultProcurementPreparation;
  if (path === "/procurement/projects/project-one/purchase-order-requests") return {
    items: [], total: 0, limit: Number(params.get("limit") ?? 50), offset: Number(params.get("offset") ?? 0)
  };
  if (/^\/procurement\/projects\/[^/]+\/items$/.test(path)) return { items: [], total: 0, limit: Number(params.get("limit") ?? 20), offset: Number(params.get("offset") ?? 0) };
  if (/^\/procurement\/projects\/[^/]+\/purchase-orders$/.test(path)) return { items: [], total: 0, limit: Number(params.get("limit") ?? 50), offset: Number(params.get("offset") ?? 0) };
  if (/^\/procurement\/projects\/[^/]+\/purchase-order-commitments$/.test(path)) return { approvedEstimatePaise: 375_000, committedPaise: 0, committedGstPaise: 0, committedTotalPaise: 0, remainingPaise: 375_000 };
  if (path === "/procurement/vendors") {
    const vendorDemo = scenario.route.includes("qaVendor=ready") && !empty;
    const items = vendorDemo && params.get("effectiveStatus") === "active"
      ? [{ id: "qa-vendor-active", code: "QA-V1", name: "Timber House", status: "active", assignable: true,
        readiness: { inductionApproved: false, vendorSelfKpiComplete: true, procurementKpiComplete: true, profileComplete: false, physicalAddressVerified: false } }]
      : [];
    return { items, total: items.length, limit: Number(params.get("limit") ?? 20), offset: Number(params.get("offset") ?? 0) };
  }
  if (path === "/procurement/uoms") return scenario.route.includes("qaVendor=ready") && !empty
    ? [{ id: "qa-uom-sheet", code: "SHT", name: "Sheet" }] : [];
  if (path === "/workflow-tasks") return list([workflowTask(scenario.role)]);
  if (/^\/design-section-revisions\/(revision-1|revision-2|revision-3)\/image$/.test(path)) return drawing.syntheticDrawingResponse(drawing.revision.crop);
  if (/^\/design-source-pages\/(page-1|page-2)\/image$/.test(path)) return drawing.syntheticDrawingResponse();
  if (/^\/(estimate-design-source-pages\/page-|estimate-design-revisions\/revision-)(estimate-1|estimate-aurora-villa|estimate-aurora-studio)\/image$/.test(path)) return drawing.syntheticDrawingResponse();
  if (/^\/client\/estimate-plan-pages\/page-estimate-1\/(thumbnail|current-image)$/.test(path)) return drawing.syntheticDrawingResponse();
  if (path === "/design-versions/qa-approved-document/download" || path === "/client/estimates/estimate-1/pdf" || /^\/projects\/[^/]+\/design-workflow\/history\/qa-internal-document\/proof$/.test(path)) return drawing.syntheticDocumentResponse();
  const prefix = "/admin/ai-estimator-knowledge";
  const temporaryKnowledge = new URLSearchParams(scenario.route.split("?")[1]).get("qaTemporary") === "ready";
  const renameKnowledge = new URLSearchParams(scenario.route.split("?")[1]).get("qaRename") === "ready";
  const baseKnowledgeItem = temporaryKnowledge ? { ...knowledge.item, itemType: "temporary" as const, completionRequired: true } : knowledge.item;
  const knowledgeItem = renameKnowledge ? { ...baseKnowledgeItem, subBasketId: "sub-joinery", subBasketName: "Joinery" } : baseKnowledgeItem;
  if (path === `${prefix}/items`) return { ...page([knowledgeItem]), facets: {} };
  if (path === `${prefix}/main-lines/line-1`) return knowledgeItem;
  if (path === `${prefix}/baskets`) return page([{ id: "basket-1", name: "Carpentry", description: "Furniture and interior timber work", displayOrder: 1, status: "active", version: 1, itemCount: 1, createdAt: knowledge.item.createdAt, updatedAt: knowledge.item.updatedAt }]);
  if (path === `${prefix}/main-lines`) return page([{ id: "line-1", name: "Wall panelling", basketId: "basket-1", status: "active", version: 1, displayOrder: 1 }]);
  if (path === `${prefix}/uoms`) return page([knowledge.squareFoot, knowledge.squareMetre]);
  if (path === `${prefix}/priorities`) return page(knowledge.canonicalPriorities);
  if (path === `${prefix}/surfaces`) return page([knowledge.wallSurface]);
  if (path === `${prefix}/modes`) return page([{ ...knowledge.squareFoot, id: "mode-in-house", masterType: "modes", code: "IN_HOUSE", name: "In-house", modeKind: "in_house" }]);
  if (path === `${prefix}/taxes`) return page([{ ...knowledge.squareFoot, id: "gst-18", masterType: "taxes", code: "GST_18", name: "GST 18%", rateBps: 1800 }]);
  if (path === `${prefix}/baskets/basket-1/main-lines`) return page([{ ...knowledgeItem, name: knowledgeItem.mainLineName }]);
  if (path === `${prefix}/vendors`) return page([{ ...knowledge.squareFoot, id: "vendor-1", masterType: "vendors", code: "TIMBER", name: "Timber House" }]);
  if (path === `${prefix}/main-lines/line-1/history`) return page([]);
  if (path === `${prefix}/quality-control-options`) return { items: [] };
  if (/^\/admin\/ai-estimator-knowledge\/main-lines\/line-1\/revisions\/revision-1\/sections\//.test(path)) {
    const sectionKey = path.split("/").at(-1) as KnowledgeSectionKey;
    if (temporaryKnowledge && sectionKey === "recommendations") return knowledge.section("recommendations", {
      recommendations: [{ id: "synthetic-recommendation", name: "Moisture barrier", priorityId: "priority-high", reason: "Protect the timber during installation", dependency: false, active: true }],
      exclusions: [{ id: "synthetic-exclusion", name: "Existing floor finish", reason: "Retain the installed finish", active: true }]
    });
    const inHouseState = new URLSearchParams(scenario.route.split("?")[1]).get("qaInHouse");
    if (inHouseState === "ready") {
      if (sectionKey === "advanced") return knowledge.inHouseSection();
      if (sectionKey === "overview") return knowledge.section("overview", { uomId: knowledge.squareFoot.id });
    }
    const marginState = new URLSearchParams(scenario.route.split("?")[1]).get("qaMargin");
    if (marginState && ["ready", "legacy", "legacy-below-range", "legacy-between-steps", "empty"].includes(marginState)) {
      if (sectionKey === "advanced") return knowledge.marginSection(marginState);
      if (sectionKey === "overview") return knowledge.section("overview", { uomId: knowledge.squareFoot.id });
    }
    const scopeState = new URLSearchParams(scenario.route.split("?")[1]).get("qaScope");
    if (sectionKey === "advanced" && scopeState && ["ready", "conflict", "empty"].includes(scopeState)) {
      return knowledge.scopeSection(scopeState);
    }
    return knowledge.section(sectionKey);
  }
  if (path === `${prefix}/baskets/basket-1/sub-baskets`) return page(renameKnowledge ? [{
    id: "sub-joinery", basketId: "basket-1", name: "Joinery", displayOrder: 1,
    version: 2, createdById: "super-admin-1", updatedById: "super-admin-1",
    createdAt: knowledge.item.createdAt, updatedAt: knowledge.item.updatedAt
  }] : []);
  if (path === `${prefix}/baskets/basket-1/quality`) return { basketId: "basket-1", basketName: "Carpentry", basketStatus: "active", revisionId: null, revisionNumber: 0, contentDigest: null, parameters: [], updatedAt: null, version: 1 };
  return undefined;
}
function workflowTask(role: Role): ProjectWorkflowTask {
  return { id: "workflow-task-1", projectId: "project-one", projectName: "Aurora Villa", estimateId: "estimate-one", kind: role === "site_manager" ? "site_execution" : role === "procurement" ? "procurement" : role === "finance_head" ? "finance" : "trade_execution", assigneeRole: role, assignedWorker: null, sourceSectionId: "EL", roomName: "Living Room", title: "Install and verify living room electrical points", description: "Review the approved room layout before completing the installation.", status: "in_progress", progress: 40, version: 2, openedAt: "2026-09-10T00:00:00.000Z", updatedAt: "2026-09-12T00:00:00.000Z" };
}

function financeLedgerFor(bucket: ProjectFinanceBucket) {
  const common = { bucketId: bucket.id, projectId: bucket.projectId };
  return [
    finance.financeEntry(`${bucket.id}-procurement`, { ...common, expenseClass: "procurement", category: "Materials", amountPaise: bucket.procurementCostPaise }),
    finance.financeEntry(`${bucket.id}-payroll`, { ...common, expenseClass: "employee_payment", category: "Site team", amountPaise: bucket.employeePaymentPaise }),
    finance.financeEntry(`${bucket.id}-other`, { ...common, category: "Other site expenses", amountPaise: bucket.otherExpensePaise }),
    finance.financeEntry(`${bucket.id}-overhead`, { ...common, type: "overhead", expenseClass: null, category: "Project overhead", amountPaise: bucket.overheadPaise })
  ].filter((entry) => entry.amountPaise > 0);
}
