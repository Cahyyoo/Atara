"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePendingDisplay } from "@/core/hooks/use-pending-display";
import { useTableParams } from "@/core/hooks/use-table-params";
import type {
  IdentFilterValue,
  LabRecordFilterValues,
  ResultsFilter,
} from "@/modules/lab/components/shared/lab-record-filters";
import type { ApiResult, PaginationDTO } from "@/core/types";
import type { LabRecordDTO, LabRecordListItemDTO } from "@/modules/lab/types";
import { withBasePath } from "@/core/lib/http/base-path";
import { DEFAULT_PAGE_SIZE } from "@/modules/lab/components/shared/lab-records-table/columns";

/**
 * The rows on screen: the filters, sort and page read from the URL, and the
 * request that answers them.
 */
export function useLabRecordsQuery(isAssay: boolean, loadError: string) {
  const { get, setParams, toggleSort } = useTableParams();

  const filters: LabRecordFilterValues = {
    search: get("search", ""),
    placeId: get("placeId", "ALL"),
    from: get("from", ""),
    to: get("to", ""),
    // The entry page opens on what it is for: samples still waiting for a result.
    results: get("results", isAssay ? "missing" : "all") as ResultsFilter,
    // Barcodes are made first and identified later, so "which still have no
    // Sample ID" is the Database role's to-do list.
    ident: isAssay ? "all" : (get("ident", "all") as IdentFilterValue),
  };
  const sort = get("sort", "shiftDate");
  const order = get("order", "desc");
  const page = get("page", "1");
  const pageSize = get("pageSize", DEFAULT_PAGE_SIZE);
  // Deleted rows are the database's business; results are never entered into them.
  const showDeleted = !isAssay && get("deleted", "") === "true";

  const [result, setResult] = useState<{
    key: string;
    records: LabRecordListItemDTO[];
    pagination: PaginationDTO | null;
    counts?: { missing: number; present: number };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Bumped after a delete, to re-read rows this table did not itself change. */
  const [reloadToken, setReloadToken] = useState(0);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.placeId !== "ALL") params.set("placeId", filters.placeId);
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.results !== "all") params.set("results", filters.results);
    if (filters.ident && filters.ident !== "all") params.set("ident", filters.ident);
    if (showDeleted) params.set("deleted", "true");
    params.set("sort", sort);
    params.set("order", order);
    return params;
  }, [filters.search, filters.placeId, filters.from, filters.to, filters.results, filters.ident, showDeleted, sort, order]);

  /**
   * The counts on the Results filter change only when the filters do, so they
   * are asked for once per filter change and kept across paging and sorting.
   * Each one is a pass over every matching row; on every page turn that was
   * the most expensive part of the request, for a number that had not moved.
   */
  const filterKey = buildParams().toString();
  const [countedFor, setCountedFor] = useState<string | null>(null);
  const wantsCounts = countedFor !== filterKey;

  const queryKey = (() => {
    const params = buildParams();
    params.set("page", page);
    params.set("pageSize", pageSize);
    if (wantsCounts) params.set("counts", "true");
    return params.toString();
  })();

  // The token is part of the key but not of the URL: a reload after a delete
  // asks the same question again and must not be answered from the result in hand.
  const resultKey = `${reloadToken}:${queryKey}`;
  const isLoading = result?.key !== resultKey;
  const showRefreshing = usePendingDisplay(isLoading);
  const records = useMemo(() => result?.records ?? [], [result]);
  const pagination = result?.pagination ?? null;

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(withBasePath(`/api/lab-records?${queryKey}`), { signal: controller.signal });
        const body: ApiResult<{
          records: LabRecordListItemDTO[];
          pagination: PaginationDTO;
          counts?: { missing: number; present: number };
        }> = await response.json();

        if (!body.success) {
          setError(body.error);
          setResult({ key: resultKey, records: [], pagination: null });
          return;
        }
        setError(null);
        setResult((previous) => ({
          key: resultKey,
          records: body.data.records,
          pagination: body.data.pagination,
          // Absent when this page did not ask; the last answer still stands.
          counts: body.data.counts ?? previous?.counts,
        }));
        if (body.data.counts) setCountedFor(filterKey);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setError(loadError);
        setResult({ key: resultKey, records: [], pagination: null });
      }
    })();

    return () => controller.abort();
  }, [resultKey, queryKey, loadError]);

  function handleSaved(updated: LabRecordDTO) {
    setResult((previous) =>
      previous
        ? {
            ...previous,
            records: previous.records.map((record) =>
              record.id === updated.id
                ? { ...record, ...updated }
                : record.subs?.some((sub) => sub.id === updated.id)
                  ? {
                      ...record,
                      subs: record.subs.map((sub) => (sub.id === updated.id ? { ...sub, ...updated } : sub)),
                    }
                  : record
            ),
          }
        : previous
    );
  }

  function reload() {
    setReloadToken((token) => token + 1);
  }

  const total = result?.pagination?.total ?? 0;

  return {
    setParams,
    toggleSort,
    filters,
    sort,
    order,
    pageSize,
    showDeleted,
    buildParams,
    counts: result?.counts ?? null,
    error,
    setError,
    isLoading,
    showRefreshing,
    records,
    pagination,
    total,
    handleSaved,
    reload,
  };
}
