"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/core/lib/http/api-client";
import type { PaginationDTO } from "@/core/types";

/**
 * One page of a list from the API, kept in step with its filters: refetched
 * (after a short pause while typing) whenever `params` change, the request
 * before it aborted so a slow answer for an older search can never land on
 * top of a newer one.
 *
 * `pick` takes the rows out of the answer -- each list names them its own way
 * (`users`, `drillHoles`) -- and `setItems` lets a page update a row in place
 * after an edit, without refetching.
 */
export function useApiList<T, R extends { pagination: PaginationDTO }>(
  path: string,
  params: Record<string, string | number | undefined | null>,
  pick: (result: R) => T[],
  { debounceMs = 300, errorMessage }: { debounceMs?: number; errorMessage: string }
) {
  const [items, setItems] = useState<T[]>([]);
  const [pagination, setPagination] = useState<PaginationDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // The picker is usually an inline arrow; read it from a ref so a new one
  // each render does not refetch.
  const pickRef = useRef(pick);
  useEffect(() => {
    pickRef.current = pick;
  });

  const query = new URLSearchParams(
    Object.entries(params).flatMap(([key, value]) =>
      value === undefined || value === null || value === "" ? [] : [[key, String(value)]]
    )
  ).toString();

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const outcome = await apiFetch<R>(`${path}?${query}`, {
          signal: controller.signal,
          networkError: errorMessage,
        });
        if (!outcome.ok) {
          setError(outcome.error);
          return;
        }
        setItems(pickRef.current(outcome.data));
        setPagination(outcome.data.pagination);
      } catch {
        // Aborted: a newer request is on its way.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, debounceMs);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [path, query, debounceMs, errorMessage, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  return { items, setItems, pagination, setPagination, loading, error, reload };
}
