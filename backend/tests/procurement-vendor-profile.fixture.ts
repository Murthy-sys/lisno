import type { ProcurementVendorProfile } from "../src/contracts/procurement-vendor.js";

export const vendorProfileFixture = (): ProcurementVendorProfile => ({
  vendorType: "execution", executionType: ["labor"], supplier: null,
  nameOfRepresentative: "Synthetic Representative", position: "Owner", gstRegistered: false, msmeRegistered: false,
  turnoverSelfDeclaredPaise: 12_345_678, turnoverVerifiedPaise: null, reference: "Synthetic reference",
  workProfile: "Interior installation", email: "vendor@example.invalid", phoneNumber: "+44 (0) 1234 5678",
  address: "Synthetic office address", aadhar: "123456789012", pan: "ABCDE1234F",
  currentAddress: "Synthetic current address", currentAddressVerifiedPhysically: false,
  mainBasketId: "basket-1", subBasketId: "sub-1"
});

/** Pre-checkbox wire/storage shape, deliberately scalar for compatibility coverage. */
export const legacyVendorProfileFixture = () => ({ ...vendorProfileFixture(), executionType: "labor" as const });
