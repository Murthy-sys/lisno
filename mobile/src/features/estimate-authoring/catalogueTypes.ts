import type { EstimateDimensionRule } from "../../../../shared/estimation/estimateDimensions";
import type { EstimateModeTier, EstimatePricingMode } from "./types";
export interface Pagination { offset: number; hasMore: boolean; }
export type EstimationModeBaseRatesPaise = Record<EstimatePricingMode, number | null>;
export interface EstimationInHouseComponent {
  id: string;
  basketId: string;
  subBasketId: string | null;
  basketName: string;
  subBasketName: string | null;
  baseRatePaise: number | null;
  unavailableReason?: string | null | undefined;
}

export interface EstimationCatalogueUom {
  id: string;
  code: string;
  name: string;
  decimalScale: number;
}

export interface EstimationCatalogueMainLine {
  id: string;
  mainLineId: string;
  basketId: string;
  subBasketId: string;
  itemType?: "main_line" | undefined;
  name: string;
  estimateNotes?: string[] | undefined;
  displayOrder: number;
  revisionId: string;
  applicableTiers?: EstimateModeTier[] | undefined;
  dimensionsMandatory?: boolean | undefined;
  dimensionRule?: EstimateDimensionRule | null | undefined;
  itemStatus?: "draft" | "active" | "inactive" | undefined;
  revisionStatus?: "draft" | "active" | undefined;
  itemVersion?: number | undefined;
  revisionVersion?: number | undefined;
  inHouseBaseRatePaise?: number | null | undefined;
  modeBaseRatesPaise?: EstimationModeBaseRatesPaise | undefined;
  inHouseComponents?: EstimationInHouseComponent[] | undefined;
  uom: EstimationCatalogueUom;
}

export interface EstimationCatalogueTemporaryItem extends Omit<EstimationCatalogueMainLine, "subBasketId" | "itemType"> {
  itemType: "temporary";
  subBasketId: string | null;
}

export interface EstimationCatalogueSubBasket {
  id: string;
  basketId: string;
  name: string;
  displayOrder: number;
  mainLines: EstimationCatalogueMainLine[];
  temporaryItems?: EstimationCatalogueTemporaryItem[] | undefined;
}

export interface EstimationCatalogueBasket {
  id: string;
  name: string;
  description?: string | null | undefined;
  displayOrder: number;
  subBaskets: EstimationCatalogueSubBasket[];
  directTemporaryItems?: EstimationCatalogueTemporaryItem[] | undefined;
}

export interface EstimationCataloguePage {
  items: EstimationCatalogueBasket[];
  pagination: Pagination;
  ineligibleLineCount: number;
}

export interface EstimationCatalogue {
  items: EstimationCatalogueBasket[];
  ineligibleLineCount: number;
  readyNonActiveSupported?: boolean | undefined;
}

export interface EstimationRecommendationChild {
  mainLineId: string;
  available: true;
  completionRequired: boolean;
  revisionId: string;
  revisionVersion: number;
  itemVersion: number;
}

export interface EstimationRecommendationRule {
  id: string;
  requirement: "must" | "can";
  reason: string;
  targetKind: "main_line" | "sub_basket";
  targetBasketId: string;
  targetSubBasketId: string | null;
  targetMainLineId: string | null;
  targetRevisionId: string | null;
  targetRevisionVersion: number | null;
  targetItemVersion: number | null;
  available: boolean;
  completionRequired: boolean;
  children?: EstimationRecommendationChild[] | undefined;
  unavailableChildCount?: number | undefined;
}

export interface EstimationRecommendationSource {
  mainLineId: string;
  available: boolean;
  revisionId: string | null;
  revisionVersion: number | null;
  itemVersion: number | null;
  rules: EstimationRecommendationRule[];
  guidance: Array<{ id: string; name: string; reason: string }>;
}

export interface EstimationCatalogueRecommendations {
  sources: EstimationRecommendationSource[];
}

