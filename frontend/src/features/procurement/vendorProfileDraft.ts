import type { ProcurementVendorDetail, ProcurementVendorProfile } from "../ai-estimator-knowledge/knowledgeTypes";

export const VENDOR_TEXT_FIELDS = {
  nameOfRepresentative: "Name of Representative", position: "Position", reference: "Reference",
  workProfile: "Work Profile", email: "Email", phoneNumber: "Phone Number", address: "Address",
  aadhar: "AADHAR", pan: "PAN", currentAddress: "Current Address"
} as const;
export type VendorTextField = keyof typeof VENDOR_TEXT_FIELDS;
export type VendorDraft = Record<VendorTextField, string> & {
  name: string; description: string; status: "active" | "inactive";
  vendorType: "" | ProcurementVendorProfile["vendorType"];
  executionType: NonNullable<ProcurementVendorProfile["executionType"]>;
  supplier: "" | "yes" | "no"; gstRegistered: "" | "yes" | "no"; msmeRegistered: "" | "yes" | "no";
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
    name: detail?.name ?? "", description: detail?.description ?? "", status: detail?.status === "inactive" ? "inactive" : "active",
    vendorType: p?.vendorType ?? "", executionType: normalizeExecutionTypes(p?.executionType), supplier: answer(p?.supplier),
    gstRegistered: answer(p?.gstRegistered), msmeRegistered: answer(p?.msmeRegistered), currentAddressVerifiedPhysically: answer(p?.currentAddressVerifiedPhysically),
    turnoverSelfDeclared: paiseInput(p?.turnoverSelfDeclaredPaise), turnoverVerified: paiseInput(p?.turnoverVerifiedPaise),
    mainBasketId: p?.mainBasketId ?? "", subBasketId: p?.subBasketId ?? "",
    ...Object.fromEntries(Object.keys(VENDOR_TEXT_FIELDS).map((key) => [key, p?.[key as VendorTextField] ?? ""])) as Record<VendorTextField, string>
  };
}
export function validateVendorDraft(d: VendorDraft) {
  const errors: Record<string, string> = {};
  if (!d.name.trim() || d.name.trim().length > 240) errors.name = "Enter an Entity Name of up to 240 characters.";
  if (!d.vendorType) errors.vendorType = "Choose a Vendor Type.";
  if (d.vendorType === "execution" && !d.executionType.length) errors.executionType = "Choose at least one Execution Type.";
  if (d.vendorType === "supplier" && !d.supplier) errors.supplier = "Choose Yes or No for Supplier.";
  for (const key of ["gstRegistered", "msmeRegistered", "currentAddressVerifiedPhysically"] as const) if (!d[key]) errors[key] = "Choose Yes or No.";
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
export function profileFromDraft(d: VendorDraft): ProcurementVendorProfile {
  return {
    ...Object.fromEntries(Object.keys(VENDOR_TEXT_FIELDS).map((key) => [key, d[key as VendorTextField].trim()])) as Record<VendorTextField, string>,
    aadhar: d.aadhar.replace(/\s/g, ""), pan: d.pan.trim().toUpperCase(),
    vendorType: d.vendorType as ProcurementVendorProfile["vendorType"], executionType: d.vendorType === "execution" ? normalizeExecutionTypes(d.executionType) : null,
    supplier: d.vendorType === "supplier" ? d.supplier === "yes" : null,
    gstRegistered: d.gstRegistered === "yes", msmeRegistered: d.msmeRegistered === "yes", currentAddressVerifiedPhysically: d.currentAddressVerifiedPhysically === "yes",
    turnoverSelfDeclaredPaise: nonnegativePaise(d.turnoverSelfDeclared)!, turnoverVerifiedPaise: d.turnoverVerified.trim() ? nonnegativePaise(d.turnoverVerified) : null,
    mainBasketId: d.mainBasketId, subBasketId: d.subBasketId
  };
}
