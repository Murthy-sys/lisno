import { ApiError, apiClient, type Pagination } from "../../api/client";

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
  itemType?: "main_line";
  name: string;
  displayOrder: number;
  revisionId: string;
  itemStatus?: "draft" | "active" | "inactive";
  revisionStatus?: "draft" | "active";
  itemVersion?: number;
  revisionVersion?: number;
  inHouseBaseRatePaise?: number | null;
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

export const estimationCatalogueKeys = {
  all: ["estimation", "catalogue"] as const,
  ready: ["estimation", "catalogue", "include-ready-non-active"] as const
};

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
