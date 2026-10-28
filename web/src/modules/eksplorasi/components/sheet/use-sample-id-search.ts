"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/core/lib/http/api-client";
import { SAMPLE_ID_SEARCH_LIMIT } from "@/modules/eksplorasi/validation";

/** How long typing has to pause before the server is asked: one request per word, not per key. */
export const SAMPLE_ID_SEARCH_DELAY_MS = 250;

interface Answer {
  search: string;
  ids: string[];
  error: string | null;
}

/**
 * The FIELD samples' Sample IDs holding `query`, asked of the server while
 * the dropdown is `open` -- the data source holds thousands, so they are
 * never all sent. An answer overtaken by more typing is cancelled; until the
 * new one is in, the last one stays on screen and `loading` says so.
 */
export function useSampleIdSearch(open: boolean, query: string, networkError: string) {
  const search = query.trim();
  const [answer, setAnswer] = useState<Answer | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    // The list as it opens comes at once; a search waits for typing to pause.
    const timer = setTimeout(
      async () => {
        const params = new URLSearchParams({ limit: String(SAMPLE_ID_SEARCH_LIMIT) });
        if (search) params.set("search", search);
        try {
          const outcome = await apiFetch<string[]>(`/api/data-sources/sample-ids?${params}`, {
            signal: controller.signal,
            networkError,
          });
          setAnswer(
            outcome.ok ? { search, ids: outcome.data, error: null } : { search, ids: [], error: outcome.error }
          );
        } catch {
          // Aborted: overtaken by more typing, or the dropdown closed.
        }
      },
      search ? SAMPLE_ID_SEARCH_DELAY_MS : 0
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, search, networkError]);

  const current = answer?.search === search ? answer : null;
  return {
    ids: answer?.ids ?? [],
    loading: open && current === null,
    error: current?.error ?? null,
    /** As many as one answer holds: there may be more, found by typing more. */
    truncated: current !== null && current.ids.length >= SAMPLE_ID_SEARCH_LIMIT,
  };
}
