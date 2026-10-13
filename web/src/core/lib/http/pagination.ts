import { z } from "zod";
import type { PaginationDTO } from "@/core/types";

/**
 * Paging, one way everywhere: the query fields every list accepts, the
 * skip/take they mean, and the block every list answer carries.
 */

/** Spread into a list's query schema. `maxPageSize` is the list's own cap. */
export function paginationQuery(defaultPageSize = 20, maxPageSize = 200) {
  return {
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(maxPageSize).default(defaultPageSize),
  };
}

/** The rows of `page`, for findMany. */
export function pageArgs(query: { page: number; pageSize: number }) {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

/** The pagination block of a list answer. */
export function paginationOf(total: number, query: { page: number; pageSize: number }): PaginationDTO {
  return {
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}
