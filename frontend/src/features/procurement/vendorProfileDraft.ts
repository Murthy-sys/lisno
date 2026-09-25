import type { ProcurementVendorDetail, ProcurementVendorProfile, ProcurementVendorProfileInput, VendorBankAccount, VendorOrganizationType } from "../ai-estimator-knowledge/knowledgeTypes";

export const VENDOR_ORGANIZATION_OPTIONS = [
  ["individual", "Individual"], ["company", "Company"], ["firm", "Firm"], ["associated_person", "Associated Person"],
  ["huf", "HUF"], ["trust", "Trust"], ["govt", "GOVT"]
] as const satisfies readonly (readonly [VendorOrganizationType, string])[];
export const VENDOR_BANK_FIELDS = {
  accountHolderName: "Account Holder Name", bankName: "Bank Name", accountNumber: "Account Number", ifscCode: "IFSC Code", branchName: "Branch Name"
} as const satisfies Record<keyof VendorBankAccount, string>;
export type VendorBankField = keyof typeof VENDOR_BANK_FIELDS;

export const VENDOR_TEXT_FIELDS = {
  nameOfRepresentative: "Name of Representative", position: "Position",
  workProfile: "Work Profile", email: "Email", phoneNumber: "Phone Number", address: "Address",
  aadhar: "AADHAR", pan: "PAN", currentAddress: "Current Address"
} as const;
export type VendorTextField = keyof typeof VENDOR_TEXT_FIELDS;
export type VendorDraft = Record<VendorTextField | VendorBankField, string> & {
  name: string; gstNumber: string; status: "active" | "inactive";
  organizationType: "" | VendorOrganizationType;
  vendorType: "" | ProcurementVendorProfile["vendorType"];
  executionType: NonNullable<ProcurementVendorProfile["executionType"]>;
  gstRegistered: "" | "yes" | "no"; msmeRegistered: "" | "yes" | "no";
  currentAddressVerifiedPhysically: "" | "yes" | "no";
  turnoverSelfDeclared: string; turnoverVerified: string; mainBasketId: string; subBasketId: string;
};
type ExecutionType = NonNullable<ProcurementVendorProfile["executionType"]>[number];
const executionTypeOrder: ExecutionType[] = ["labor", "material_labour"];
export function normalizeExecutionTypes(value: ProcurementVendorProfile["executionType"] | ExecutionType | undefined): ExecutionType[] {
  const selections = Array.isArray(value) ? [...value] : value ? [value] : [];
  return selections.sort((left, right) => executionTypeOrder.indexOf(left) - executionTypeOrder.indexOf(right));
}
export const paiseInput = (value: number | null | undefined) => value == null ? "" : `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
export function nonnegativePaise(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const result = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  return result > 9_000_000_000_000n ? null : Number(result);
}
export function vendorDraft(detail?: ProcurementVendorDetail): VendorDraft {
  const p = detail?.procurementProfile;
  const answer = (value: boolean | null | undefined) => value == null ? "" : value ? "yes" : "no";
  return {
    name: detail?.name ?? "", gstNumber: p?.gstNumber ?? "", status: detail?.status === "inactive" ? "inactive" : "active",
    organizationType: p?.organizationType ?? "",
    ...Object.fromEntries(Object.keys(VENDOR_BANK_FIELDS).map((key) => [key, p?.bankAccount?.[key as VendorBankField] ?? ""])) as Record<VendorBankField, string>,
    vendorType: p?.vendorType ?? "", executionType: normalizeExecutionTypes(p?.executionType),
    gstRegistered: answer(p?.gstRegistered), msmeRegistered: answer(p?.msmeRegistered), currentAddressVerifiedPhysically: answer(p?.currentAddressVerifiedPhysically),
    turnoverSelfDeclared: paiseInput(p?.turnoverSelfDeclaredPaise), turnoverVerified: paiseInput(p?.turnoverVerifiedPaise),
    mainBasketId: p?.mainBasketId ?? "", subBasketId: p?.subBasketId ?? "",
    ...Object.fromEntries(Object.keys(VENDOR_TEXT_FIELDS).map((key) => [key, p?.[key as VendorTextField] ?? ""])) as Record<VendorTextField, string>
  };
}
export function hasVendorBankAccount(d: VendorDraft): boolean {
  return (Object.keys(VENDOR_BANK_FIELDS) as VendorBankField[]).some((key) => Boolean(d[key].trim()));
}
export function validateVendorDraft(d: VendorDraft, { requireOrganizationType = false } = {}) {
  const errors: Record<string, string> = {};
  if (!d.name.trim() || d.name.trim().length > 240) errors.name = "Enter an Entity Name of up to 240 characters.";
  if ((requireOrganizationType && !d.organizationType) || (d.organizationType && !VENDOR_ORGANIZATION_OPTIONS.some(([value]) => value === d.organizationType))) errors.organizationType = "Choose a Vendor Organization Type.";
  if (hasVendorBankAccount(d)) {
    for (const key of ["accountHolderName", "bankName"] as const) {
      if (!d[key].trim() || d[key].trim().length > 240) errors[`bankAccount.${key}`] = `Enter ${VENDOR_BANK_FIELDS[key]} of up to 240 characters.`;
    }
    if (!/^\d{1,34}$/.test(d.accountNumber.trim())) errors["bankAccount.accountNumber"] = "Enter an Account Number of 1 to 34 digits.";
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(d.ifscCode.trim().toUpperCase())) errors["bankAccount.ifscCode"] = "Enter a valid 11-character IFSC Code.";
    if (d.branchName.trim().length > 240) errors["bankAccount.branchName"] = "Enter a Branch Name of up to 240 characters.";
  }
  if (!d.vendorType) errors.vendorType = "Choose a Vendor Type.";
  if (d.vendorType === "execution" && !d.executionType.length) errors.executionType = "Choose at least one Execution Type.";
  for (const key of ["gstRegistered", "msmeRegistered", "currentAddressVerifiedPhysically"] as const) if (!d[key]) errors[key] = "Choose Yes or No.";
  if (d.gstRegistered === "yes" && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(d.gstNumber.trim().toUpperCase())) errors.gstNumber = "Enter a valid 15-character GST Number.";
  for (const [key, label] of Object.entries(VENDOR_TEXT_FIELDS)) {
    if (!d[key as VendorTextField].trim()) errors[key] = `Enter ${label}.`;
  }
  if (d.phoneNumber.trim().length < 3 || d.phoneNumber.trim().length > 64) errors.phoneNumber = "Enter a phone number of 3 to 64 characters.";
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) errors.email = "Enter a valid email address.";
  if (d.aadhar && !/^\d{12}$/.test(d.aadhar.replace(/\s/g, ""))) errors.aadhar = "Enter the 12 AADHAR digits.";
  if (d.pan && !/^[A-Z]{5}\d{4}[A-Z]$/.test(d.pan.trim().toUpperCase())) errors.pan = "Enter a PAN with five letters, four digits and one letter.";
  if (nonnegativePaise(d.turnoverSelfDeclared) === null) errors.turnoverSelfDeclaredPaise = "Enter a nonnegative amount with up to two decimal places.";
  if (d.turnoverVerified.trim() && nonnegativePaise(d.turnoverVerified) === null) errors.turnoverVerifiedPaise = "Enter a nonnegative amount or leave blank for NA.";
  if (!d.mainBasketId) errors.mainBasketId = "Choose a Main Basket.";
  if (!d.subBasketId) errors.subBasketId = "Choose a Sub Basket.";
  return errors;
}
export function profileFromDraft(d: VendorDraft): ProcurementVendorProfileInput {
  return {
    ...Object.fromEntries(Object.keys(VENDOR_TEXT_FIELDS).map((key) => [key, d[key as VendorTextField].trim()])) as Record<VendorTextField, string>,
    aadhar: d.aadhar.replace(/\s/g, ""), pan: d.pan.trim().toUpperCase(),
    organizationType: d.organizationType || null,
    bankAccount: hasVendorBankAccount(d) ? {
      accountHolderName: d.accountHolderName.trim(), bankName: d.bankName.trim(), accountNumber: d.accountNumber.trim(),
      ifscCode: d.ifscCode.trim().toUpperCase(), branchName: d.branchName.trim() || null
    } : null,
    vendorType: d.vendorType as ProcurementVendorProfile["vendorType"], executionType: d.vendorType === "execution" ? normalizeExecutionTypes(d.executionType) : null,
    supplier: d.vendorType === "supplier" ? true : null,
    gstRegistered: d.gstRegistered === "yes", gstNumber: d.gstRegistered === "yes" ? d.gstNumber.trim().toUpperCase() : null, msmeRegistered: d.msmeRegistered === "yes", currentAddressVerifiedPhysically: d.currentAddressVerifiedPhysically === "yes",
    turnoverSelfDeclaredPaise: nonnegativePaise(d.turnoverSelfDeclared)!, turnoverVerifiedPaise: d.turnoverVerified.trim() ? nonnegativePaise(d.turnoverVerified) : null,
    mainBasketId: d.mainBasketId, subBasketId: d.subBasketId
  };
}
