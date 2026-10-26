import { ApiProtocolError } from "../../core/http/apiClient";
import { buildConfiguredLines, configuredLineAmountPaise, configuredQuantityUnits, hasNativeReadOnlyInHousePricing, parseSellingRate, restoreConfiguredLine, type ConfiguredLineDraft } from "./configuredEstimate";
import type { EstimationCatalogue } from "./catalogueTypes";
import { parseBedroomCount, requiresBedroomCount } from "./estimateRoomOptions";
import type { ConfiguredEstimateLine, EstimateClassification, EstimateDraft, EstimateDraftInput, LegacyEstimateLine, StaffLead } from "./types";

export interface RoomDraft { id: string; typeId: string; label: string; sqft: number; length: string; width: string; }
export interface StaffEstimateForm {
  propertyType: string; bedroomCount: string; rooms: RoomDraft[]; selectedMainBasketIds: string[];
  classifications: Record<string, EstimateClassification>; lines: ConfiguredLineDraft[]; legacyLines: LegacyEstimateLine[]; scopes: string[];
}
export function estimateEditable(estimate: EstimateDraft | null): boolean {
  return !estimate?.estimation?.editClosedAt && !estimate?.estimation?.finalApproval && (!estimate || ["draft", "designer_changes_requested", "client_changes_requested"].includes(estimate.estimation?.status ?? estimate.status));
}
export function restoreStaffForm(estimate: EstimateDraft | null, lead: StaffLead, catalogue?: EstimationCatalogue): StaffEstimateForm {
  const rooms = (estimate?.rooms ?? []).map((room) => {
    if (typeof room.id !== "string" || !room.id || typeof room.label !== "string" || !room.label || typeof room.typeId !== "string") throw new ApiProtocolError();
    return { id: room.id, typeId: room.typeId, label: room.label, sqft: typeof room.sqft === "number" ? room.sqft : 0,
      length: typeof room.length === "number" ? String(room.length) : "", width: typeof room.width === "number" ? String(room.width) : "" };
  });
  if (new Set(rooms.map((room) => room.id)).size !== rooms.length) throw new ApiProtocolError();
  const form: StaffEstimateForm = {
    propertyType: estimate?.propertyType || lead.propertyType, bedroomCount: String(estimate?.bedroomCount ?? lead.bedroomCount ?? ""), rooms,
    selectedMainBasketIds: estimate?.selectedMainBasketIds ?? [], classifications: Object.fromEntries(estimate?.selectedMainBasketClassifications?.map((item) => [item.mainBasketId, item.classification]) ?? []),
    lines: (estimate?.lineItems ?? []).filter((line): line is ConfiguredEstimateLine => line.source === "configuration").map(restoreConfiguredLine),
    legacyLines: (estimate?.lineItems ?? []).filter((line): line is LegacyEstimateLine => line.source !== "configuration"), scopes: estimate?.scopes ?? []
  };
  return catalogue ? refreshStaffForm(form, catalogue, !estimateEditable(estimate)) : form;
}
export function refreshStaffForm(form: StaffEstimateForm, catalogue: EstimationCatalogue, preservePublished = false): StaffEstimateForm {
  return { ...form, lines: buildConfiguredLines(catalogue, form.rooms, new Set(form.selectedMainBasketIds), form.lines, preservePublished) };
}
export function validateStaffForm(form: StaffEstimateForm, submitting = false): string | null {
  if (!form.propertyType.trim()) return "Choose the property type.";
  if (requiresBedroomCount(form.propertyType) && parseBedroomCount(form.bedroomCount) === null) return "Enter a bedroom count from 1 to 50.";
  if (submitting && !form.rooms.length) return "Select at least one room.";
  for (const room of form.rooms) {
    if (!room.label.trim()) return "Every room needs a name.";
    if ([room.length, room.width].some((value) => value.trim() && (!/^\d+(\.\d+)?$/.test(value.trim()) || Number(value) <= 0))) return `Enter positive dimensions for ${room.label}.`;
    if (Boolean(room.length.trim()) !== Boolean(room.width.trim())) return `Enter both length and width for ${room.label}, or leave both empty.`;
  }
  for (const line of form.lines.filter((item) => item.included || item.persistedId)) {
    if (line.nativeDimensionsNeedReview) return `${line.mainLineName}: review Length, Width and Height in the web estimate workspace before saving.`;
    if (line.nativeTierNeedsReview) return `${line.mainLineName}: review the selected configuration tier in the web estimate workspace before saving.`;
    if ((line.modeTier ?? "signature") === "signature" && hasNativeReadOnlyInHousePricing(line) && (line.inHouseComponentsNeedReview || !line.selectedInHouseComponentIds?.length)) return `${line.mainLineName}: review In-house components in the web estimate workspace before saving.`;
    if (line.sourceMissing) return `${line.mainLineName}: the current Configuration source is unavailable. Refresh or remove this saved item.`;
    if (line.uomNeedsQuantityReview) return `${line.mainLineName}: confirm the quantity for its updated unit.`;
    if (parseSellingRate(line.rateInput).kind === "invalid" || configuredQuantityUnits(line.quantity, line.uomDecimalScale, line.included) === null) return `${line.mainLineName}: enter a valid quantity and selling rate (up to 2 decimals).`;
    if (submitting && line.included && configuredLineAmountPaise(line) === null) return `${line.mainLineName}: enter a selling rate before submission.`;
  }
  if (form.legacyLines.some((line) => !line.specification.trim() || !Number.isFinite(line.rate) || line.rate < 0 || !Number.isFinite(line.quantity) || line.quantity < 0 || (line.included && line.quantity === 0))) return "Correct the historical item specification, quantity or rate.";
  if (submitting && !form.lines.some((line) => line.included) && !form.legacyLines.some((line) => line.included)) return "Include at least one estimate item before submission.";
  return null;
}
export function staffFormInput(form: StaffEstimateForm, expectedVersion?: number): EstimateDraftInput {
  return {
    propertyType: form.propertyType, bedroomCount: requiresBedroomCount(form.propertyType) ? parseBedroomCount(form.bedroomCount) : null,
    rooms: form.rooms.map((room) => ({ id: room.id, typeId: room.typeId, label: room.label.trim(), icon: room.typeId,
      length: room.length.trim() ? Number(room.length) : null, width: room.width.trim() ? Number(room.width) : null,
      sqft: room.length.trim() && room.width.trim() ? Number(room.length) * Number(room.width) : room.sqft })), scopes: form.scopes,
    selectedMainBasketIds: form.selectedMainBasketIds,
    selectedMainBasketClassifications: form.selectedMainBasketIds.map((mainBasketId) => ({ mainBasketId, classification: form.classifications[mainBasketId] ?? "standard" })),
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
    lineItems: [
      ...form.legacyLines.map(({ id, catalogueId, roomName, specification, unit, rate, quantity, included }) => ({ source: "legacy" as const, ...(id ? { id } : {}), catalogueId, roomName, specification, unit, rate, quantity, included })),
      ...form.lines.filter((line) => line.included || line.persistedId).map((line) => ({ source: "configuration" as const, itemType: line.itemType,
        classification: line.classification ?? form.classifications[line.mainBasketId] ?? "standard", pricingMode: line.pricingMode, rateSource: line.rateSource,
        ...(line.modeTier === undefined ? {} : { modeTier: line.modeTier }),
        ...(line.dimensions === undefined ? {} : { dimensions: { ...line.dimensions },
          ...(line.dimensionsMandatory && line.dimensionRule ? { expectedDimensionRule: { ...line.dimensionRule } } : {}) }),
        ...(line.persistedId ? { id: line.persistedId } : {}), catalogueId: line.mainLineId, mainLineId: line.mainLineId, roomId: line.roomId, roomName: line.roomName,
        mainBasketId: line.mainBasketId, subBasketId: line.subBasketId, revisionId: line.revisionId, uomId: line.uomId,
        ...(line.itemVersion === undefined ? {} : { itemVersion: line.itemVersion }), ...(line.revisionVersion === undefined ? {} : { revisionVersion: line.revisionVersion }),
        ...(line.recommendationSourceMainLineIds === undefined ? {} : { recommendationSourceMainLineIds: line.recommendationSourceMainLineIds }),
        ...(line.selectedInHouseComponentIds === undefined ? {} : { selectedInHouseComponentIds: line.selectedInHouseComponentIds.slice() }),
        quantity: line.quantity, included: line.included, ratePaise: parseSellingRate(line.rateInput).paise
      }))
    ]
  };
}
export function previewEstimateTotals(form: StaffEstimateForm): { subtotalPaise: number; gstPaise: number; totalPaise: number } | null {
  const amounts = form.lines.filter((line) => line.included).map(configuredLineAmountPaise);
  if (amounts.some((value) => value === null)) return null;
  const legacy = form.legacyLines.filter((line) => line.included).map((line) => Math.round(line.rate * line.quantity) * 100);
  if (legacy.some((value) => !Number.isSafeInteger(value) || value < 0)) return null;
  const subtotal = [...amounts, ...legacy].reduce<bigint>((sum, amount) => sum + BigInt(amount!), 0n);
  const hasConfigured = form.lines.some((line) => line.included || line.persistedId);
  const gst = hasConfigured ? (subtotal * 18n + 50n) / 100n : BigInt(Math.round(Number(subtotal) / 100 * .18)) * 100n;
  if (subtotal + gst > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return { subtotalPaise: Number(subtotal), gstPaise: Number(gst), totalPaise: Number(subtotal + gst) };
}
export const estimatePaise = (value: number | null | undefined) => value == null ? "Incomplete" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value / 100);
export function staffFormFingerprint(form: StaffEstimateForm): string { return JSON.stringify(staffFormInput(form)); }
