import { apiClient, type Pagination } from "../../api/client";

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
  name: string;
  displayOrder: number;
  revisionId: string;
  uom: EstimationCatalogueUom;
}

export interface EstimationCatalogueSubBasket {
  id: string;
  basketId: string;
  name: string;
  displayOrder: number;
  mainLines: EstimationCatalogueMainLine[];
}

export interface EstimationCatalogueBasket {
  id: string;
  name: string;
  displayOrder: number;
  subBaskets: EstimationCatalogueSubBasket[];
}

export interface EstimationCataloguePage {
  items: EstimationCatalogueBasket[];
  pagination: Pagination;
  ineligibleLineCount: number;
}

export interface EstimationCatalogue {
  items: EstimationCatalogueBasket[];
  ineligibleLineCount: number;
}

export const estimationCatalogueKeys = {
  all: ["estimation", "catalogue"] as const
};

export async function getEstimationCatalogue(): Promise<EstimationCatalogue> {
  const items: EstimationCatalogueBasket[] = [];
  let offset = 0;
  let ineligibleLineCount = 0;

  while (true) {
    const page = await apiClient.get<EstimationCataloguePage>(
      `/estimation/catalogue?limit=100&offset=${offset}`,
      { showGlobalLoader: false }
    );
    items.push(...page.items);
    ineligibleLineCount += page.ineligibleLineCount;
    if (!page.pagination.hasMore) return { items, ineligibleLineCount };

    const nextOffset = page.pagination.offset + page.items.length;
    if (nextOffset <= offset) throw new Error("Estimation catalogue pagination did not advance.");
    offset = nextOffset;
  }
}
