import type { ProcurementVendorProfile, VendorBankAccount } from "../src/contracts/procurement-vendor.js";

export const vendorBankAccountFixture = (): VendorBankAccount => ({
  accountHolderName: "Synthetic Account Holder", bankName: "Synthetic Bank",
  accountNumber: "0012345678901234", ifscCode: "SYNB0123456", branchName: "Synthetic Branch"
});

export const vendorProfileFixture = (): ProcurementVendorProfile => ({
  organizationType: "company", bankAccount: null,
  vendorType: "execution", executionType: ["labor"], supplier: null,
  nameOfRepresentative: "Synthetic Representative", position: "Owner", gstRegistered: false, gstNumber: null, msmeRegistered: false,
  turnoverSelfDeclaredPaise: 12_345_678, turnoverVerifiedPaise: null, reference: "Synthetic reference",
  workProfile: "Interior installation", email: "vendor@example.invalid", phoneNumber: "+44 (0) 1234 5678",
  address: "Synthetic office address", aadhar: "123456789012", pan: "ABCDE1234F",
  currentAddress: "Synthetic current address", currentAddressVerifiedPhysically: false,
  mainBasketId: "basket-1", subBasketId: "sub-1"
});

/** Pre-checkbox wire/storage shape, deliberately scalar for compatibility coverage. */
export const legacyVendorProfileFixture = () => ({ ...vendorProfileFixture(), executionType: "labor" as const });
