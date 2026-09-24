import { describe, expect, it } from "vitest";
import { procurementVendorProfileSchema, storedProcurementVendorProfile, validateProcurementVendorProfile } from "../src/services/procurement-vendor-profile.js";
import { legacyVendorProfileFixture, vendorProfileFixture } from "./procurement-vendor-profile.fixture.js";

describe("procurement vendor profile validation", () => {
  it("accepts each classification, including an explicit supplier false", () => {
    for (const classification of [
      { vendorType: "execution", executionType: "labor", supplier: null },
      { vendorType: "execution", executionType: "material_labour", supplier: null },
      { vendorType: "execution", executionType: ["labor"], supplier: null },
      { vendorType: "execution", executionType: ["material_labour"], supplier: null },
      { vendorType: "execution", executionType: ["labor", "material_labour"], supplier: null },
      { vendorType: "supplier", executionType: null, supplier: true },
      { vendorType: "supplier", executionType: null, supplier: false }
    ]) expect(procurementVendorProfileSchema.safeParse({ ...vendorProfileFixture(), ...classification }).success).toBe(true);
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
      { vendorType: "supplier", executionType: null, supplier: null },
      { vendorType: "supplier", executionType: "labor", supplier: true },
      { vendorType: "supplier", executionType: ["labor", "material_labour"], supplier: false }
    ]) expect(procurementVendorProfileSchema.safeParse({ ...vendorProfileFixture(), ...classification }).success).toBe(false);
  });
  it("requires every field and rejects forged server metadata", () => {
    for (const field of Object.keys(vendorProfileFixture())) {
      const value = { ...vendorProfileFixture() } as Record<string, unknown>;
      delete value[field];
      expect(procurementVendorProfileSchema.safeParse(value).success, field).toBe(false);
    }
    expect(procurementVendorProfileSchema.safeParse({ ...vendorProfileFixture(), physicalAddressVerifiedById: "forged" }).success).toBe(false);
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
