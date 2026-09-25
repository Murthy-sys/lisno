import { describe, expect, it } from "vitest";
import { procurementVendorProfileSchema, procurementVendorProfileComplete, storedProcurementVendorProfile, validateProcurementVendorProfile } from "../src/services/procurement-vendor-profile.js";
import { legacyVendorProfileFixture, vendorBankAccountFixture, vendorProfileFixture } from "./procurement-vendor-profile.fixture.js";
import { vendorSaveCommand } from "../src/services/procurement-vendor-save-command.js";

describe("procurement vendor profile validation", () => {
  it("accepts the seven organization types and preserves legacy null/omission without changing completeness", () => {
    for (const organizationType of ["individual", "company", "firm", "associated_person", "huf", "trust", "govt", null]) {
      expect(validateProcurementVendorProfile({ ...vendorProfileFixture(), organizationType }).organizationType).toBe(organizationType);
    }
    for (const organizationType of ["Company", "association", "", 1, {}, []]) {
      expect(procurementVendorProfileSchema.safeParse({ ...vendorProfileFixture(), organizationType }).success).toBe(false);
    }
    const { organizationType: _organizationType, bankAccount: _bankAccount, ...legacy } = vendorProfileFixture();
    expect(validateProcurementVendorProfile(legacy)).toMatchObject({ organizationType: null, bankAccount: null });
    const stored = storedProcurementVendorProfile(legacy);
    expect(stored).toMatchObject({ ...legacy, organizationType: null, bankAccount: null });
    expect(procurementVendorProfileComplete(stored, null)).toBe(true);
    const input = procurementVendorProfileSchema.parse(legacy);
    expect(input).not.toHaveProperty("organizationType");
    expect(input).not.toHaveProperty("bankAccount");
  });
  it("normalizes complete bank details while preserving leading zeroes and optional branch", () => {
    const bankAccount = vendorBankAccountFixture();
    expect(validateProcurementVendorProfile({ ...vendorProfileFixture(), bankAccount: {
      accountHolderName: ` ${bankAccount.accountHolderName} `, bankName: ` ${bankAccount.bankName} `,
      accountNumber: ` ${bankAccount.accountNumber} `, ifscCode: " synb0123456 "
    } }).bankAccount).toEqual({ ...bankAccount, branchName: null });
    for (const branchName of [undefined, null, "", "  "]) {
      expect(validateProcurementVendorProfile({ ...vendorProfileFixture(), bankAccount: { ...bankAccount, branchName } }).bankAccount?.branchName).toBeNull();
    }
    for (const accountNumber of ["0", "0".repeat(34)]) {
      expect(validateProcurementVendorProfile({ ...vendorProfileFixture(), bankAccount: { ...bankAccount, accountNumber } }).bankAccount?.accountNumber).toBe(accountNumber);
    }
  });
  it("rejects incomplete, extra, numeric and malformed bank data without including values in errors", () => {
    const bankAccount = vendorBankAccountFixture();
    for (const field of ["accountHolderName", "bankName", "accountNumber", "ifscCode"]) {
      const incomplete = { ...bankAccount } as Record<string, unknown>;
      delete incomplete[field];
      expect(procurementVendorProfileSchema.safeParse({ ...vendorProfileFixture(), bankAccount: incomplete }).success, field).toBe(false);
    }
    for (const invalid of [{}, [], "bank", 1,
      { ...bankAccount, accountHolderName: " " }, { ...bankAccount, accountHolderName: "a".repeat(241) },
      { ...bankAccount, bankName: " " }, { ...bankAccount, bankName: "b".repeat(241) },
      { ...bankAccount, branchName: "c".repeat(241) }, { ...bankAccount, accountNumber: 123456 },
      ...["", "1 234", "001-23", "1e10", "+123", "1.23", "1".repeat(35)].map(accountNumber => ({ ...bankAccount, accountNumber })),
      ...["", "SYNB1123456", "SYNB012345", "SYNB01234567", "SYN_0123456"].map(ifscCode => ({ ...bankAccount, ifscCode })),
      { ...bankAccount, pin: "private-extra-value" }
    ]) {
      expect(() => validateProcurementVendorProfile({ ...vendorProfileFixture(), bankAccount: invalid })).toThrow();
    }
    try { validateProcurementVendorProfile({ ...vendorProfileFixture(), bankAccount: { ...bankAccount, ifscCode: "private-invalid-value" } }); }
    catch (error) {
      expect(error).toMatchObject({ fields: { "procurementProfile.bankAccount.ifscCode": expect.any(String) } });
      expect(JSON.stringify(error)).not.toContain("private-invalid-value");
      expect(JSON.stringify(error)).not.toContain(bankAccount.accountNumber);
    }
  });
  it("fingerprints normalized banking contents while distinguishing omission, null and changed values", () => {
    const bankAccount = vendorBankAccountFixture();
    const input = { expectedVersion: 1, idempotencyKey: "synthetic-banking-save", procurementProfile: { ...vendorProfileFixture(), bankAccount } };
    const command = vendorSaveCommand("synthetic-actor", "synthetic-vendor", input);
    expect(vendorSaveCommand("synthetic-actor", "synthetic-vendor", { ...input, procurementProfile: { ...input.procurementProfile,
      bankAccount: { branchName: " Synthetic Branch ", ifscCode: " synb0123456 ", accountNumber: ` ${bankAccount.accountNumber} `, bankName: " Synthetic Bank ", accountHolderName: " Synthetic Account Holder " }
    } })).toEqual(command);
    for (const change of [{ organizationType: "firm" as const }, { bankAccount: null }, { bankAccount: { ...bankAccount, accountNumber: "0098765432101234" } }]) {
      const changed = vendorSaveCommand("synthetic-actor", "synthetic-vendor", { ...input, procurementProfile: { ...input.procurementProfile, ...change } });
      expect(changed?.id).toBe(command?.id);
      expect(changed?.fingerprint).not.toBe(command?.fingerprint);
    }
    const { organizationType: _organizationType, bankAccount: _bankAccount, ...legacy } = input.procurementProfile;
    const omitted = vendorSaveCommand("synthetic-actor", "synthetic-vendor", { ...input, procurementProfile: legacy });
    const cleared = vendorSaveCommand("synthetic-actor", "synthetic-vendor", { ...input, procurementProfile: { ...legacy, organizationType: null, bankAccount: null } });
    expect(omitted?.fingerprint).not.toBe(cleared?.fingerprint);
  });
  it("accepts each classification and derives Supplier without a secondary answer", () => {
    for (const classification of [
      { vendorType: "execution", executionType: "labor", supplier: null },
      { vendorType: "execution", executionType: "material_labour", supplier: null },
      { vendorType: "execution", executionType: ["labor"], supplier: null },
      { vendorType: "execution", executionType: ["material_labour"], supplier: null },
      { vendorType: "execution", executionType: ["labor", "material_labour"], supplier: null },
      { vendorType: "supplier", executionType: null, supplier: true },
      { vendorType: "supplier", executionType: null, supplier: false },
      { vendorType: "supplier", executionType: null, supplier: null },
      { vendorType: "supplier", executionType: null, supplier: undefined }
    ]) expect(procurementVendorProfileSchema.safeParse({ ...vendorProfileFixture(), ...classification }).success).toBe(true);
    expect(validateProcurementVendorProfile({ ...vendorProfileFixture(), vendorType: "supplier", executionType: null, supplier: false }).supplier).toBe(true);
  });
  it("normalizes scalar and reversed selections without mutating submitted arrays", () => {
    expect(validateProcurementVendorProfile(legacyVendorProfileFixture()).executionType).toEqual(["labor"]);
    expect(validateProcurementVendorProfile({ ...legacyVendorProfileFixture(), executionType: "material_labour" }).executionType).toEqual(["material_labour"]);
    const selections = ["material_labour", "labor"];
    expect(validateProcurementVendorProfile({ ...vendorProfileFixture(), executionType: selections }).executionType).toEqual(["labor", "material_labour"]);
    expect(selections).toEqual(["material_labour", "labor"]);
  });
  it("rejects empty, repeated, unknown and malformed selections", () => {
    for (const executionType of [[], ["labor", "labor"], ["material_labour", "material_labour"], ["labor", "material_labour", "labor"], ["unknown"], [null], ["labor", null], {}, 1, true, undefined]) {
      expect(procurementVendorProfileSchema.safeParse({ ...vendorProfileFixture(), executionType }).success, JSON.stringify(executionType)).toBe(false);
    }
  });
  it("normalizes legacy stored profiles while retaining verification and basket metadata", () => {
    const stored = { ...legacyVendorProfileFixture(), currentAddressVerifiedPhysically: true,
      physicalAddressVerifiedAt: "2026-09-01T00:00:00.000Z", physicalAddressVerifiedById: "synthetic-verifier" };
    expect(storedProcurementVendorProfile(stored)).toEqual({ ...stored, executionType: ["labor"] });
    expect(storedProcurementVendorProfile({ ...stored, executionType: ["material_labour", "labor"] })).toEqual({ ...stored, executionType: ["labor", "material_labour"] });
    expect(storedProcurementVendorProfile({ ...stored, executionType: ["labor", "labor"] })).toBeNull();
    expect(storedProcurementVendorProfile(undefined)).toBeNull();
  });
  it("rejects contradictory and missing conditional answers", () => {
    for (const classification of [
      { vendorType: "execution", executionType: null, supplier: null },
      { vendorType: "execution", executionType: "labor", supplier: false },
      { vendorType: "supplier", executionType: "labor", supplier: true },
      { vendorType: "supplier", executionType: ["labor", "material_labour"], supplier: false }
    ]) expect(procurementVendorProfileSchema.safeParse({ ...vendorProfileFixture(), ...classification }).success).toBe(false);
  });
  it("requires visible fields and rejects forged server metadata", () => {
    for (const field of Object.keys(vendorProfileFixture()).filter(key => !["supplier", "gstNumber", "reference", "organizationType", "bankAccount"].includes(key))) {
      const value = { ...vendorProfileFixture() } as Record<string, unknown>;
      delete value[field];
      expect(procurementVendorProfileSchema.safeParse(value).success, field).toBe(false);
    }
    expect(procurementVendorProfileSchema.safeParse({ ...vendorProfileFixture(), physicalAddressVerifiedById: "forged" }).success).toBe(false);
  });
  it("accepts omitted Reference, requires valid GST only for Yes, and normalizes its value", () => {
    const { reference: _reference, ...profile } = vendorProfileFixture();
    expect(validateProcurementVendorProfile(profile)).toMatchObject({ reference: null, gstNumber: null });
    for (const gstNumber of [undefined, null, "", "29ABCDE1234F1Z", "29ABCDE1234F0Z5"]) {
      expect(procurementVendorProfileSchema.safeParse({ ...profile, gstRegistered: true, gstNumber }).success).toBe(false);
    }
    expect(validateProcurementVendorProfile({ ...profile, gstRegistered: true, gstNumber: " 29abcde1234f1z5 " }).gstNumber).toBe("29ABCDE1234F1Z5");
    expect(validateProcurementVendorProfile({ ...profile, gstRegistered: false, gstNumber: "draft-invalid" }).gstNumber).toBeNull();
  });
  it("reads legacy registration Yes without evidence while marking its profile incomplete", () => {
    const { gstNumber: _gstNumber, reference: _reference, ...profile } = vendorProfileFixture();
    const legacy = storedProcurementVendorProfile({ ...profile, vendorType: "supplier", executionType: null, supplier: false,
      gstRegistered: true, msmeRegistered: true, currentAddressVerifiedPhysically: true,
      physicalAddressVerifiedAt: "2026-09-01T00:00:00.000Z", physicalAddressVerifiedById: "synthetic-admin" });
    expect(legacy).toMatchObject({ supplier: false, reference: null, gstNumber: null, email: profile.email, mainBasketId: profile.mainBasketId, currentAddressVerifiedPhysically: true });
    expect(procurementVendorProfileComplete(legacy, null)).toBe(false);
    expect(procurementVendorProfileComplete({ ...legacy!, gstNumber: "29ABCDE1234F1Z5" }, null)).toBe(false);
    expect(procurementVendorProfileComplete({ ...legacy!, gstNumber: "29ABCDE1234F1Z5" }, { id: "certificate-id" })).toBe(true);
  });
  it("keeps paise exact, null different from zero, and rejects unsafe amounts", () => {
    expect(validateProcurementVendorProfile({ ...vendorProfileFixture(), turnoverVerifiedPaise: 0 })).toMatchObject({ turnoverSelfDeclaredPaise: 12_345_678, turnoverVerifiedPaise: 0 });
    for (const amount of [-1, 1.25, Number.MAX_SAFE_INTEGER + 1, "NA", NaN]) expect(procurementVendorProfileSchema.safeParse({ ...vendorProfileFixture(), turnoverVerifiedPaise: amount }).success).toBe(false);
  });
  it("normalizes identity strings while preserving international phone formats", () => {
    expect(validateProcurementVendorProfile({ ...vendorProfileFixture(), aadhar: "1234 5678 9012", pan: " abcde1234f " })).toMatchObject({ aadhar: "123456789012", pan: "ABCDE1234F", phoneNumber: "+44 (0) 1234 5678" });
    for (const change of [{ aadhar: "12345678901" }, { pan: "ABCDE12345" }, { email: "not-an-email" }, { workProfile: " " }]) expect(() => validateProcurementVendorProfile({ ...vendorProfileFixture(), ...change })).toThrow();
  });
});
