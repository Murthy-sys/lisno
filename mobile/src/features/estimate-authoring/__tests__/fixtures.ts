import { AUTHORIZATION_POLICY_VERSION } from "../../../contracts/authorization";
import { PROTECTED_OPERATIONS } from "../../../contracts/operations";
import type { AuthenticatedSession } from "../../../contracts/session";
import type { EstimateDraft, StaffLead, ConfiguredEstimateLine, EstimationLifecycle } from "../types";
import type { EstimationCatalogue } from "../catalogueTypes";
export const leadFixture: StaffLead = { id: "lead-one", clientName: "Client One", clientEmail: "one@example.invalid", clientMobile: "0000000000", projectName: "Lake House", propertyType: "2BHK", location: "Kochi", projectId: "project-one" };
export const catalogueFixture: EstimationCatalogue = { items: [{ id: "basket-one", name: "Cabinetry", displayOrder: 1, subBaskets: [{ id: "sub-one", basketId: "basket-one", name: "Storage", displayOrder: 1, mainLines: [{ id: "main-one", mainLineId: "main-one", basketId: "basket-one", subBasketId: "sub-one", name: "Oak cabinet", displayOrder: 1, revisionId: "revision-current", revisionVersion: 5, itemVersion: 3, itemStatus: "active", revisionStatus: "draft", uom: { id: "uom-one", name: "Square feet", code: "SFT", decimalScale: 2 }, modeBaseRatesPaise: { pmc: 12345, sub_vendor: 23456, in_house: 34567 }, estimateNotes: ["Subject to availability at procurement."] }] }] }], ineligibleLineCount: 0, readyNonActiveSupported: true };
export const lineFixture: ConfiguredEstimateLine = { source: "configuration", itemType: "main_line", id: "saved-line-one", catalogueId: "main-one", mainLineId: "main-one", roomId: "room-one", roomName: "Kitchen", mainBasketId: "basket-one", mainBasketName: "Old cabinetry name", subBasketId: "sub-one", subBasketName: "Old storage name", revisionId: "revision-old", itemVersion: 1, revisionVersion: 2, uomId: "uom-one", uomName: "Square feet", uomCode: "SFT", uomDecimalScale: 2, mainLineName: "Old cabinet name", quantity: 2.5, included: true, classification: "special", pricingMode: "sub_vendor", rateSource: "manual", ratePaise: 11111, rate: 111.11, amount: 277.78, amountPaise: 27778, unit: "SFT", specification: null };
export function componentCatalogueFixture(): EstimationCatalogue {
 const catalogue = structuredClone(catalogueFixture);
 const mainLine = catalogue.items[0]!.subBaskets[0]!.mainLines[0]!;
 mainLine.modeBaseRatesPaise!.in_house = null;
 mainLine.inHouseComponents = [{ id: "component-one", basketId: "basket-one", subBasketId: "sub-one", basketName: "Cabinetry", subBasketName: "Storage", baseRatePaise: 11111 }, { id: "component-two", basketId: "basket-two", subBasketId: "sub-two", basketName: "Finishing", subBasketName: "Paint", baseRatePaise: 0 }];
 return catalogue;
}
export const componentLineFixture: ConfiguredEstimateLine = { ...lineFixture, pricingMode: "in_house", rateSource: "configuration", selectedInHouseComponentIds: ["component-one"], revisionId: "revision-current", itemVersion: 3, revisionVersion: 5 };
export const componentAmountLineFixture: ConfiguredEstimateLine = { ...componentLineFixture, pricingBasis: "in_house_components_v1",
 rate: null, ratePaise: null, quantity: 2, amount: 783.33, amountPaise: 78333, sourceItemVersion: 3, sourceRevisionVersion: 5,
 componentPricing: { formulaVersion: "in_house_components_v1", mainLineId: "main-one", revisionId: "revision-current", sourceItemVersion: 3, sourceRevisionVersion: 5,
  modeTier: "signature", quantity: "2", uom: { id: "uom-one", name: "Square feet", code: "SFT", decimalScale: 2 },
  selectedComponentIds: ["component-one"], components: [{ id: "component-one", basketId: "basket-one", subBasketId: "sub-one", basketName: "Cabinetry", subBasketName: "Storage",
   laborSellingPaise: 25000, materialSellingPaise: 53333, totalPaise: 78333 }], totalPaise: 78333, inputFingerprint: "a".repeat(64) } };
export const lifecycleFixture: EstimationLifecycle = { workflowVersion: 2, phase: "pre", status: "draft", requirementsVersion: 3, editClosedAt: null, preApproval: null, finalApproval: null, designScopeRevision: 2, approvedDesignScopeRevision: null, pendingReviewRoundId: null, preparationSnapshotId: null };
export function estimateFixture(patch: Partial<EstimateDraft> = {}): EstimateDraft {
 return { id: "estimate-one", version: 7, propertyType: "2BHK", bedroomCount: null, projectId: "project-one", rooms: [{ id: "room-one", typeId: "kitchen", label: "Kitchen", sqft: 120, length: 12, width: 10 }], scopes: [], selectedMainBasketIds: ["basket-one"], selectedMainBasketClassifications: [{ mainBasketId: "basket-one", classification: "special" }], lineItems: [{ ...lineFixture }], subtotal: 277.78, gst: 50, total: 327.78, subtotalPaise: 27778, gstPaise: 5000, totalPaise: 32778, status: "draft", approvalRequired: false, ...patch };
}
export function actor(role: AuthenticatedSession["user"]["role"] = "estimator_sales", operations?: readonly string[]): AuthenticatedSession {
 return { user: { id: `${role}-one`, name: "Test User", email: "test@example.invalid", role }, authorization: { role, policyVersion: AUTHORIZATION_POLICY_VERSION, permissions: PROTECTED_OPERATIONS.filter((op) => !operations || operations.includes(op.operation)).map((op) => op.permission) } } as AuthenticatedSession;
}
