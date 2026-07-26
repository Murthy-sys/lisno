import { z } from "zod";

import type {
  PageResult,
  PaginationInput
} from "../repositories/types.js";

export const paginationShape = {
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0)
};

export interface PaginatedEnvelope<T> {
  items: T[];
  pagination: PaginationInput & {
    total: number;
    hasMore: boolean;
  };
}

export function paginatedEnvelope<T>(
  page: PageResult<T>,
  pagination: PaginationInput
): PaginatedEnvelope<T> {
  return {
    items: page.items,
    pagination: {
      ...pagination,
      total: page.total,
      hasMore: pagination.offset + page.items.length < page.total
    }
  };
}
