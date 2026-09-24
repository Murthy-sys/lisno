import type { KnowledgeBasket, KnowledgeSubBasket, ProcurementVendorDetail, ProcurementVendorProfile } from "../ai-estimator-knowledge/knowledgeTypes";
export const vendorMetadata = { createdById: "sa", updatedById: "sa", createdAt: "2026-09-24T00:00:00Z", updatedAt: "2026-09-24T00:00:00Z", version: 1 };
export const vendorBasket: KnowledgeBasket = { id: "basket-one", name: "Carpentry", description: null, status: "active", displayOrder: 1, ...vendorMetadata };
export const vendorSubBasket: KnowledgeSubBasket = { id: "sub-one", basketId: vendorBasket.id, name: "Cabinet work", displayOrder: 1, ...vendorMetadata };
export const completeVendorProfile: ProcurementVendorProfile = {
  vendorType: "execution", executionType: ["labor"], supplier: null,
  nameOfRepresentative: "Sample Representative", position: "Owner", gstRegistered: false, msmeRegistered: true,
  turnoverSelfDeclaredPaise: 10000000, turnoverVerifiedPaise: null, reference: "Synthetic reference", workProfile: "Synthetic cabinetry profile",
  email: "sample@example.test", phoneNumber: "+91 90000 00000", address: "Synthetic office address", aadhar: "123456789012", pan: "ABCDE1234F",
  currentAddress: "Synthetic current address", currentAddressVerifiedPhysically: false, mainBasketId: vendorBasket.id, subBasketId: vendorSubBasket.id
};
export const completeVendor: ProcurementVendorDetail = {
  id: "vendor-one", masterType: "vendors", code: "TIMBER", name: "Timber House", description: "Timber supply", displayOrder: 1, status: "active", ...vendorMetadata,
  procurementProfile: { ...completeVendorProfile, physicalAddressVerifiedAt: null, physicalAddressVerifiedById: null },
  procurementSummary: { vendorType: "execution", profileComplete: true, currentAddressVerifiedPhysically: false, mainBasket: { id: vendorBasket.id, name: vendorBasket.name, status: "active" }, subBasket: { id: vendorSubBasket.id, name: vendorSubBasket.name } }, geoTaggedPicture: null
};
