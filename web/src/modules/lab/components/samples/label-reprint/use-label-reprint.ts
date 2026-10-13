"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { ApiResult, PaginationDTO } from "@/core/types";
import type { SampleListItemDTO, SampleStatus, StageDTO } from "@/modules/lab/types";
import { withBasePath } from "@/core/lib/http/base-path";

const PAGE_SIZE = "50";

type SamplesPage = { samples: SampleListItemDTO[]; pagination: PaginationDTO };

/** Whether the barcode has its Sample ID yet: made first, identified later. */
export type IdentFilter = "ALL" | "has" | "missing";

/**
 * The reprint page's state: the filters, the list they fetch, and the
 * selection ticked out of it.
 */
export function useLabelReprint() {
  const tCommon = useTranslations("common");
  const loadError = tCommon("loadError");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SampleStatus | "ALL">("ALL");
  const [stageId, setStageId] = useState("ALL");
  /** Whether the barcode has its Sample ID yet: made first, identified later. */
  const [ident, setIdent] = useState<IdentFilter>("ALL");
  const [stages, setStages] = useState<StageDTO[]>([]);

  const [result, setResult] = useState<{
    key: string;
    samples: SampleListItemDTO[];
    pagination: PaginationDTO | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  /** Keyed by id so a selection survives changing the filters. */
  const [selected, setSelected] = useState<Map<string, SampleListItemDTO>>(new Map());

  /** Where the last tick was, for shift+click to select everything up to here. */
  const anchor = useRef<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(withBasePath("/api/stages"), { signal: controller.signal })
      .then((response) => response.json())
      .then((body: ApiResult<StageDTO[]>) => {
        if (body.success) setStages(body.data);
      })
      .catch(() => {
        // The stage filter is optional.
      });
    return () => controller.abort();
  }, []);

  const params = new URLSearchParams({ pageSize: PAGE_SIZE, sort: "createdAt", order: "desc" });
  if (search) params.set("search", search);
  if (status !== "ALL") params.set("status", status);
  if (stageId !== "ALL") params.set("stageId", stageId);
  if (ident !== "ALL") params.set("ident", ident);
  const queryKey = params.toString();

  const isLoading = result?.key !== queryKey;
  const samples = useMemo(() => result?.samples ?? [], [result]);
  const pagination = result?.pagination ?? null;
  const remaining = pagination ? pagination.total - samples.length : 0;

  useEffect(() => {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      (async () => {
        try {
          const response = await fetch(withBasePath(`/api/samples?${queryKey}`), { signal: controller.signal });
          const body: ApiResult<SamplesPage> = await response.json();

          // A new list means a new order: a range anchored in the old one
          // would select the wrong rows.
          anchor.current = null;
          if (!body.success) {
            setError(body.error);
            setResult({ key: queryKey, samples: [], pagination: null });
            return;
          }
          setError(null);
          setResult({ key: queryKey, samples: body.data.samples, pagination: body.data.pagination });
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setError(loadError);
          setResult({ key: queryKey, samples: [], pagination: null });
        }
      })();
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [queryKey, loadError]);

  /**
   * The next page, added to the bottom of what is already here.
   *
   * Appended rather than paged through: the selection is made by ticking down
   * a list, and turning a page would take the rows already ticked out of
   * sight.
   */
  async function loadMore() {
    if (!pagination || isLoadingMore) return;
    const key = queryKey;
    const next = new URLSearchParams(key);
    next.set("page", String(pagination.page + 1));

    setIsLoadingMore(true);
    try {
      const response = await fetch(withBasePath(`/api/samples?${next.toString()}`));
      const body: ApiResult<SamplesPage> = await response.json();
      if (!body.success) {
        setError(body.error);
        return;
      }
      setResult((previous) => {
        // The filters changed while this was in flight; it belongs to a list
        // that is no longer on screen.
        if (!previous || previous.key !== key) return previous;
        const known = new Set(previous.samples.map((sample) => sample.id));
        return {
          key,
          samples: [...previous.samples, ...body.data.samples.filter((sample) => !known.has(sample.id))],
          pagination: body.data.pagination,
        };
      });
    } catch {
      setError(loadError);
    } finally {
      setIsLoadingMore(false);
    }
  }

  /** `withShift`: whether shift was held for the click that toggles this row. */
  function toggleAt(index: number, withShift: boolean) {
    const sample = samples[index];
    if (!sample) return;

    setSelected((previous) => {
      const next = new Map(previous);
      const select = !previous.has(sample.id);
      // Shift+click carries this row's new state across the whole range from
      // the last row ticked, the way file lists do.
      const from = withShift && anchor.current !== null ? Math.min(anchor.current, index) : index;
      const to = withShift && anchor.current !== null ? Math.max(anchor.current, index) : index;
      for (const row of samples.slice(from, to + 1)) {
        if (select) next.set(row.id, row);
        else next.delete(row.id);
      }
      return next;
    });
    anchor.current = index;
  }

  function remove(id: string) {
    setSelected((previous) => {
      const next = new Map(previous);
      next.delete(id);
      return next;
    });
  }

  const shownSelected = samples.filter((sample) => selected.has(sample.id)).length;
  const allShownSelected = samples.length > 0 && shownSelected === samples.length;
  const someShownSelected = shownSelected > 0 && !allShownSelected;

  function toggleShown() {
    setSelected((previous) => {
      const next = new Map(previous);
      if (allShownSelected) {
        samples.forEach((sample) => next.delete(sample.id));
      } else {
        samples.forEach((sample) => next.set(sample.id, sample));
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Map());
  }

  // A fresh array on every render would defeat the memo on PrintLabelGrid.
  const selectedSamples = useMemo(() => [...selected.values()], [selected]);

  return {
    search,
    setSearch,
    status,
    setStatus,
    stageId,
    setStageId,
    ident,
    setIdent,
    stages,
    error,
    isLoading,
    isLoadingMore,
    samples,
    pagination,
    remaining,
    loadMore,
    selected,
    selectedSamples,
    allShownSelected,
    someShownSelected,
    toggleAt,
    toggleShown,
    remove,
    clearSelection,
  };
}
