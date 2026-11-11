import { readInHouseUsagePolicy } from "./in-house-usage-policy.js";
import type { PurchaseOrderModePreview, PurchaseOrderModeResolution } from "./project-purchase-order-mode.js";
import type { ProjectPurchaseOrderPreparationDto } from "./project-purchase-order-preparation.js";

export type InHouseComponentVisibility = "hidden" | "visible";

/** Current Configuration controls disclosure; approved component IDs still control calculation. */
export function procurementInHouseVisibility(advanced: Record<string, unknown>): {
  inHouseComponentVisibility?: InHouseComponentVisibility;
  inHouseComponentVisibilityIssue?: { code: string; message: string };
} {
  const policy = readInHouseUsagePolicy(advanced);
  if (policy.state === "legacy") return {};
  return {
    inHouseComponentVisibility: policy.state !== "invalid" && policy.usage === "execution" ? "visible" : "hidden",
    ...(policy.state === "invalid" ? { inHouseComponentVisibilityIssue: {
      code: "IN_HOUSE_USAGE_INVALID", message: "The saved In-house use configuration needs review. Component details are unavailable."
    } } : {})
  };
}

/** Presentation only. Call after totals, fingerprints, snapshots and commercial checks are calculated. */
export function projectProcurementModePreview(preview: PurchaseOrderModePreview | null,
  visibility: InHouseComponentVisibility | undefined): PurchaseOrderModePreview | null {
  if (!preview || preview.mode !== "in_house" || visibility !== "hidden") return preview;
  return { ...preview, components: [], settings: { ...preview.settings, scopes: [] } };
}

export function projectProcurementModeResolution(mode: PurchaseOrderModeResolution | null): PurchaseOrderModeResolution | null {
  if (!mode || mode.inHouseComponentVisibility !== "hidden") return mode;
  return { ...mode, preview: projectProcurementModePreview(mode.preview, mode.inHouseComponentVisibility) };
}

export function projectProcurementPreparation(preparation: ProjectPurchaseOrderPreparationDto): ProjectPurchaseOrderPreparationDto {
  return { ...preparation, estimateLines: preparation.estimateLines.map(line => {
    if (line.mode?.inHouseComponentVisibility !== "hidden") return line;
    const { selectedInHouseComponentIds: _selectedIds, ...visible } = line;
    return { ...visible, mode: projectProcurementModeResolution(line.mode) };
  }) };
}
