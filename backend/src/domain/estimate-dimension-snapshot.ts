import { canonicalEstimateDimensions, estimateLineDimensionsValid, readEstimateDimensionRule,
  type EstimateDimensionRule, type EstimateDimensions } from "./estimate-dimensions.js";

export interface EstimateDimensionMetadata {
  dimensionsMandatory?: boolean;
  dimensions?: EstimateDimensions;
  dimensionRule?: EstimateDimensionRule | null;
}

type DimensionLine = { dimensionsMandatory?: unknown; dimensions?: unknown; dimensionRule?: unknown;
  included?: unknown; quantity?: unknown; uomId?: unknown; uomDecimalScale?: unknown };

/** Frozen boundaries preserve absent legacy fields and reject malformed recorded measurements. */
export function estimateDimensionSnapshotValid(line: DimensionLine): boolean {
  if (line.dimensionsMandatory !== undefined && typeof line.dimensionsMandatory !== "boolean") return false;
  if (line.dimensions !== undefined && !canonicalEstimateDimensions(line.dimensions)) return false;
  if (line.dimensionRule != null && !readEstimateDimensionRule(line.dimensionRule)) return false;
  if (line.included === false && line.dimensions === undefined) return true;
  return estimateLineDimensionsValid(line);
}

/** Invoke after validating the source; cloning prevents later draft mutations changing a snapshot. */
export function estimateDimensionSnapshotFields(line: DimensionLine): EstimateDimensionMetadata {
  return {
    ...(line.dimensionsMandatory === undefined ? {} : { dimensionsMandatory: line.dimensionsMandatory as boolean }),
    ...(line.dimensions === undefined ? {} : { dimensions: structuredClone(line.dimensions as EstimateDimensions) }),
    ...(line.dimensionRule === undefined ? {} : { dimensionRule: structuredClone(line.dimensionRule as EstimateDimensionRule | null) })
  };
}
