import type { EstimatePmcPricing } from "../../../../shared/estimation/estimatePmcPayable";
import type { RoomCategoryId } from "../../../../shared/estimation/estimateRoomOptions";
import type { EstimateDimensionRule } from "../../../../shared/estimation/estimateDimensions";
import type { KnowledgeModeTier } from "../../../../shared/knowledge/knowledgeModeTiers";
import { ApiError, apiClient, type Pagination } from "../../api/client";
import type { EstimatePricingMode } from "./leadsApi";

/** Legacy name: final unit rates include configured maximum profit; components are priced separately. */
export type EstimationModeBaseRatesPaise = Record<EstimatePricingMode, number | null>;
export type EstimationBasePriceAvailability = Record<"default" | KnowledgeModeTier, Record<EstimatePricingMode, boolean>>;

export interface EstimationCatalogueUom {
  id: string;
  code: string;
  name: string;
  decimalScale: number;
}

export interface EstimationInHouseComponent {
  id: string;
  basketId: string;
  basketName: string;
  subBasketId: string | null;
  subBasketName: string | null;
  baseRatePaise: number | null;
  unavailableReason?: string | null;
}

export interface EstimationTierPricing {
  pmcPricing?: EstimatePmcPricing;
  modeBaseRatesPaise: EstimationModeBaseRatesPaise;
  inHouseComponents?: EstimationInHouseComponent[];
  inHouseUsage?: "estimator" | "execution" | null;
  inHousePricingState?: "ready" | "incomplete" | "invalid";
}

export interface EstimationTierDetails {
  specifications: Array<{
    id: string;
    name: string;
    brands: Array<{ id: string; name: string | null }>;
  }>;
}

export interface EstimationCatalogueMainLine {
  id: string;
  mainLineId: string;
  basketId: string;
  subBasketId: string;
  itemType?: "main_line";
  name: string;
  /** Current server always supplies this; absent legacy metadata retains prior discovery behavior. */
  hasConfiguredBasePrice?: boolean;
  /** Positive raw-base availability for each saved Configuration scope and pricing method. */
  basePriceAvailability?: EstimationBasePriceAvailability;
  estimateNotes?: string[];
  clientVisible?: boolean;
  /** Only explicit true adds an unused preview to default estimation browsing. */
  showByDefault?: boolean;
  applicableRoomCategories?: readonly RoomCategoryId[];
  dimensionsMandatory?: boolean;
  dimensionRule?: EstimateDimensionRule | null;
  displayOrder: number;
  revisionId: string;
  itemStatus?: "draft" | "active" | "inactive";
  revisionStatus?: "draft" | "active";
  itemVersion?: number;
  revisionVersion?: number;
  applicableTiers?: KnowledgeModeTier[];
  tierPricing?: Partial<Record<KnowledgeModeTier, EstimationTierPricing>>;
  /** Server-resolved tier specifications, using current Mode defaults only for absent/empty lists; null or absent means unavailable. */
  tierDetails?: Partial<Record<KnowledgeModeTier, EstimationTierDetails | null>>;
  /** Server-resolved display paragraphs; independent of specification fallback and never saved with estimates. */
  tierDescriptions?: Partial<Record<KnowledgeModeTier, string | null>>;
  inHouseBaseRatePaise?: number | null;
  inHouseComponents?: EstimationInHouseComponent[];
  inHouseUsage?: "estimator" | "execution" | null;
  inHousePricingState?: "ready" | "incomplete" | "invalid";
  pmcPricing?: EstimatePmcPricing;
  modeBaseRatesPaise?: EstimationModeBaseRatesPaise;
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
  temporaryItems?: EstimationCatalogueTemporaryItem[];
}

export interface EstimationCatalogueBasket {
  id: string;
  name: string;
  description?: string | null;
  displayOrder: number;
  subBaskets: EstimationCatalogueSubBasket[];
  directTemporaryItems?: EstimationCatalogueTemporaryItem[];
}

export interface EstimationCataloguePage {
  items: EstimationCatalogueBasket[];
  pagination: Pagination;
  ineligibleLineCount: number;
}

export interface EstimationCatalogue {
  items: EstimationCatalogueBasket[];
  ineligibleLineCount: number;
  readyNonActiveSupported?: boolean;
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
  children?: EstimationRecommendationChild[];
  unavailableChildCount?: number;
  /** Verified display metadata only; availability and Add eligibility remain separate. */
  targetDisplay?: {
    name: string;
    unavailableReason?: "price_not_configured" | "configuration_incomplete";
  };
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

export const estimationCatalogueKeys = {
  all: ["estimation", "catalogue"] as const,
  ready: ["estimation", "catalogue", "include-ready-non-active"] as const,
  recommendations: ["estimation", "catalogue", "recommendations"] as const,
  recommendationSources: (sources: readonly string[]) => ["estimation", "catalogue", "recommendations", sources] as const
};

export async function getEstimationCatalogueRecommendations(mainLineIds: readonly string[]): Promise<EstimationCatalogueRecommendations> {
  const ids = [...new Set(mainLineIds)].sort();
  if (!ids.length) return { sources: [] };
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += 50) chunks.push(ids.slice(index, index + 50));
  const pages = await Promise.all(chunks.map((chunk) => apiClient.get<EstimationCatalogueRecommendations>(
    `/estimation/catalogue/recommendations?${new URLSearchParams({ mainLineIds: chunk.join(","), includeReadyNonActive: "true" })}`,
    { showGlobalLoader: false }
  )));
  return { sources: pages.flatMap((page) => page.sources) };
}

export async function getEstimationCatalogue(options: { includeReadyNonActive?: boolean } = {}): Promise<EstimationCatalogue> {
  const items: EstimationCatalogueBasket[] = [];
  let offset = 0;
  let ineligibleLineCount = 0;
  let useLegacyEndpoint = false;

  while (true) {
    const query = new URLSearchParams({ limit: "100", offset: String(offset) });
    if (options.includeReadyNonActive && !useLegacyEndpoint) query.set("includeReadyNonActive", "true");
    let page: EstimationCataloguePage;
    try {
      page = await apiClient.get<EstimationCataloguePage>(
        `/estimation/catalogue?${query}`,
        { showGlobalLoader: false }
      );
    } catch (error) {
      if (options.includeReadyNonActive && !useLegacyEndpoint && error instanceof ApiError &&
        error.status === 400 && error.code === "VALIDATION_ERROR" && error.fields?.includeReadyNonActive !== undefined) {
        useLegacyEndpoint = true;
        items.length = 0;
        offset = 0;
        ineligibleLineCount = 0;
        continue;
      }
      throw error;
    }
    items.push(...page.items);
    ineligibleLineCount += page.ineligibleLineCount;
    if (!page.pagination.hasMore) return { items, ineligibleLineCount, readyNonActiveSupported: Boolean(options.includeReadyNonActive && !useLegacyEndpoint) };

    const nextOffset = page.pagination.offset + page.items.length;
    if (nextOffset <= offset) throw new Error("Estimation catalogue pagination did not advance.");
    offset = nextOffset;
  }
}
