import { describe, expect, it } from "vitest";
import { completeVendor, sampleVendorBankAccount } from "./vendorProfile.fixtures";
import { profileFromDraft, validateVendorDraft, vendorDraft } from "./vendorProfileDraft";

const bankDraft = () => ({ ...vendorDraft(completeVendor), ...sampleVendorBankAccount, branchName: sampleVendorBankAccount.branchName ?? "" });

describe("vendor organization and bank draft", () => {
  it("requires an organization for creates and permits legacy edits with empty banking", () => {
    const draft = { ...vendorDraft(completeVendor), organizationType: "" as const };
    expect(validateVendorDraft(draft, { requireOrganizationType: true })).toMatchObject({ organizationType: expect.any(String) });
    expect(validateVendorDraft(draft)).toEqual({});
    expect(profileFromDraft(draft)).toMatchObject({ organizationType: null, bankAccount: null });
  });

  it("normalizes bank text without converting the account number, and hydrates the saved profile", () => {
    const draft = { ...bankDraft(), accountHolderName: "  Synthetic Account Holder  ", bankName: "  Synthetic Sample Bank  ", accountNumber: "  00012345006789  ", ifscCode: " demo0123456 ", branchName: "  " };
    expect(validateVendorDraft(draft)).toEqual({});
    const profile = profileFromDraft(draft);
    expect(profile.bankAccount).toEqual({ ...sampleVendorBankAccount, branchName: null });
    const savedBank = profile.bankAccount ? { ...profile.bankAccount, branchName: profile.bankAccount.branchName ?? null } : null;
    expect(vendorDraft({ ...completeVendor, procurementProfile: { ...completeVendor.procurementProfile!, ...profile, bankAccount: savedBank } })).toMatchObject({ accountNumber: "00012345006789", ifscCode: "DEMO0123456", branchName: "" });
  });

  it("treats a whitespace-only bank section as absent", () => {
    const draft = { ...vendorDraft(completeVendor), accountHolderName: " ", bankName: " ", accountNumber: " ", ifscCode: " ", branchName: " " };
    expect(validateVendorDraft(draft)).toEqual({});
    expect(profileFromDraft(draft).bankAccount).toBeNull();
  });

  it("requires all four core fields when only the optional branch is entered", () => {
    expect(Object.keys(validateVendorDraft({ ...vendorDraft(completeVendor), branchName: "Synthetic Branch" }))).toEqual([
      "bankAccount.accountHolderName", "bankAccount.bankName", "bankAccount.accountNumber", "bankAccount.ifscCode"
    ]);
  });

  it.each(["", "12 34", "12-34", "1e8", "１２３", "1".repeat(35)])("rejects invalid account digits: %s", (accountNumber) => {
    expect(validateVendorDraft({ ...bankDraft(), accountNumber })["bankAccount.accountNumber"]).toEqual(expect.any(String));
  });

  it.each(["0", "0".repeat(34)])("accepts boundary account lengths as strings", (accountNumber) => {
    const draft = { ...bankDraft(), accountNumber };
    expect(validateVendorDraft(draft)).toEqual({});
    expect(profileFromDraft(draft).bankAccount?.accountNumber).toBe(accountNumber);
  });

  it.each(["", "ABCDE123456", "DEMO1123456", "DEM00123456", "DEMO012345", "DEMO01234567", "DEMO0!23456"])("rejects malformed IFSC: %s", (ifscCode) => {
    expect(validateVendorDraft({ ...bankDraft(), ifscCode })["bankAccount.ifscCode"]).toEqual(expect.any(String));
  });

  it.each(["accountHolderName", "bankName", "branchName"] as const)("enforces the 240-character limit for %s", (field) => {
    expect(validateVendorDraft({ ...bankDraft(), [field]: "a".repeat(241) })[`bankAccount.${field}`]).toEqual(expect.any(String));
    expect(validateVendorDraft({ ...bankDraft(), [field]: "a".repeat(240) })).toEqual({});
  });
});

describe("vendor basket draft", () => {
  it("hydrates scalar-only details and sends sorted arrays without compatibility scalars", () => {
    const legacy = { ...completeVendor, procurementProfile: { ...completeVendor.procurementProfile!, mainBasketIds: undefined, subBasketIds: undefined } } as unknown as typeof completeVendor;
    expect(vendorDraft(legacy)).toMatchObject({ mainBasketIds: ["basket-one"], subBasketIds: ["sub-one"] });
    const profile = profileFromDraft({ ...vendorDraft(completeVendor), mainBasketIds: ["basket-z", "basket-a"], subBasketIds: ["sub-z", "sub-a"] });
    expect(profile).toMatchObject({ mainBasketIds: ["basket-a", "basket-z"], subBasketIds: ["sub-a", "sub-z"] });
    expect(profile).not.toHaveProperty("mainBasketId");
    expect(profile).not.toHaveProperty("subBasketId");
  });

  it("requires each selection, rejects duplicate IDs and enforces the shared bounds", () => {
    const draft = vendorDraft(completeVendor);
    expect(validateVendorDraft({ ...draft, mainBasketIds: [] })).toHaveProperty("mainBasketIds");
    expect(validateVendorDraft({ ...draft, subBasketIds: [] })).toHaveProperty("subBasketIds");
    expect(validateVendorDraft({ ...draft, mainBasketIds: ["basket-one", "basket-one"] })).toHaveProperty("mainBasketIds");
    expect(validateVendorDraft({ ...draft, subBasketIds: ["sub-one", "sub-one"] })).toHaveProperty("subBasketIds");
    expect(validateVendorDraft({ ...draft, mainBasketIds: Array.from({ length: 101 }, (_, index) => `basket-${index}`) })).toHaveProperty("mainBasketIds");
    expect(validateVendorDraft({ ...draft, subBasketIds: Array.from({ length: 501 }, (_, index) => `sub-${index}`) })).toHaveProperty("subBasketIds");
  });
});
