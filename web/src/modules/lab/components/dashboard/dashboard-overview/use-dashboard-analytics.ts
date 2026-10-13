"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/core/components/ui/toast";
import { useVisibleInterval } from "@/core/hooks/use-visible-interval";
import { downloadFromApi } from "@/core/lib/http/download";
import { withBasePath } from "@/core/lib/http/base-path";
import type { AnalyticsResult } from "@/modules/lab/lib/analytics/analytics-types";
import type { ApiResult } from "@/core/types";
import type { SubFilter } from "@/modules/lab/validation/records";
import {
  IDENTITY_FILTERS,
  unfilteredIdentity,
  type IdentityKey,
} from "@/modules/lab/components/dashboard/dashboard-overview/identity-filters";

/** Typing into a date field walks through several valid dates; only the last matters. */
const RANGE_DEBOUNCE_MS = 300;

/**
 * How often an open, visible dashboard asks for fresh figures. Twice the
 * server's analytics cache (30 s), so each poll is answered by at most one
 * computation shared with everybody else looking at the same window.
 */
export const AUTO_REFRESH_MS = 60_000;

/**
 * The dashboard's window and filters, the analytics answering them, and the
 * quiet refresh and report download that act on the same query.
 */
export function useDashboardAnalytics(initialAnalytics: AnalyticsResult) {
  const tCommon = useTranslations("common");
  const loadError = tCommon("loadError");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [range, setRange] = useState({ from: "", to: "" });
  // Picked from a dropdown rather than typed, so unlike the dates these need no
  // debounce and apply straight away.
  // One shape for all five rather than five useStates and five setters: the
  // query, the "is anything filtered" test and the reset all read from it, so
  // adding or removing a dimension touches one list.
  const [identity, setIdentity] = useState<Record<IdentityKey, string>>(unfilteredIdentity);
  const activeIdentity = IDENTITY_FILTERS.filter(({ key }) => identity[key] !== "ALL");
  /** Which records the result figures count; the samples alone unless chosen otherwise. */
  const [subs, setSubs] = useState<SubFilter>("parents");
  /**
   * Master option id to code, fetched once. The pickers only ever hand back an
   * id, and a chip reading a cuid would tell the reader nothing about what is
   * filtered. Without activeOnly: a retired code can still be the active filter,
   * and it has to stay readable.
   */
  const [codeById, setCodeById] = useState<Map<string, string>>(new Map());

  // The loaded window is tagged with the query it answers, so "is this stale?"
  // is derived rather than tracked in a second piece of state.
  const [loaded, setLoaded] = useState<{
    key: string;
    data: AnalyticsResult | null;
    error: string | null;
  }>({ key: "", data: initialAnalytics, error: null });

  const queryKey = new URLSearchParams({
    ...(range.from ? { from: range.from } : {}),
    ...(range.to ? { to: range.to } : {}),
    ...Object.fromEntries(activeIdentity.map(({ key }) => [key, identity[key]])),
    ...(subs !== "parents" ? { subs } : {}),
  }).toString();

  useEffect(() => {
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(withBasePath("/api/master-options"), { signal: controller.signal });
        const body: ApiResult<{ options: { id: string; code: string }[] }> = await response.json();
        if (body.success) {
          setCodeById(new Map(body.data.options.map((option) => [option.id, option.code])));
        }
      } catch (caught) {
        // The chips fall back to the kind name; nothing else depends on this.
        if (caught instanceof DOMException && caught.name === "AbortError") return;
      }
    })();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => setRange({ from, to }), RANGE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [from, to]);

  useEffect(() => {
    // The server already supplied the default window; only a changed range
    // needs a request. The key is set on failure too, so an error cannot loop.
    if (loaded.key === queryKey) return;

    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(withBasePath(`/api/analytics?${queryKey}`), { signal: controller.signal });
        const body: ApiResult<AnalyticsResult> = await response.json();
        setLoaded(
          body.success
            ? { key: queryKey, data: body.data, error: null }
            : { key: queryKey, data: null, error: body.error }
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoaded({ key: queryKey, data: null, error: loadError });
      }
    })();

    return () => controller.abort();
  }, [queryKey, loaded.key, loadError]);

  /**
   * The quiet refresh: same window, same filters, fetched again on a timer or
   * the refresh button. Unlike a filter change it does not dim the page, and
   * a failure leaves the figures already on screen alone -- the next tick
   * will try again. Skipped while a filter change is still loading, since
   * that request is about to answer anyway.
   */
  const background = useRef<AbortController | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  async function refreshNow() {
    if (loaded.key !== queryKey || background.current) return;
    const key = queryKey;
    const controller = new AbortController();
    background.current = controller;
    setIsPolling(true);
    try {
      const response = await fetch(withBasePath(`/api/analytics?${key}`), {
        signal: controller.signal,
        cache: "no-store",
      });
      const body: ApiResult<AnalyticsResult> = await response.json();
      if (body.success) {
        // Only if the filters have not moved on while this was in flight.
        setLoaded((previous) =>
          previous.key === key ? { key, data: body.data, error: null } : previous
        );
      }
    } catch {
      // Offline for a moment, or aborted: keep what is on screen.
    } finally {
      background.current = null;
      setIsPolling(false);
    }
  }
  useVisibleInterval(() => void refreshNow(), AUTO_REFRESH_MS);
  useEffect(() => () => background.current?.abort(), []);

  const [isDownloading, setIsDownloading] = useState(false);
  async function downloadReport() {
    setIsDownloading(true);
    const message = await downloadFromApi(
      `/api/analytics/report?${queryKey}`,
      "lab-summary.xlsx"
    );
    setIsDownloading(false);
    if (message) toast(message, "error");
  }

  const data = loaded.data;
  const error = loaded.error;

  // The previous answer stays on screen while a new one is fetched, which is
  // right — but with nothing saying so, changing a filter looked like nothing
  // happened. Derived from the key rather than tracked in more state.
  const isRefreshing = loaded.key !== queryKey && !error;

  const hasFilter = activeIdentity.length > 0 || subs !== "parents";

  function setIdentityAt(key: IdentityKey, value: string | null) {
    setIdentity((previous) => ({ ...previous, [key]: value ?? "ALL" }));
  }

  function clearIdentity(key?: IdentityKey) {
    setIdentity((previous) => (key ? { ...previous, [key]: "ALL" } : unfilteredIdentity()));
  }

  function resetAll() {
    setFrom("");
    setTo("");
    clearIdentity();
    setSubs("parents");
  }

  return {
    from,
    setFrom,
    to,
    setTo,
    range,
    identity,
    setIdentityAt,
    activeIdentity,
    clearIdentity,
    subs,
    setSubs,
    codeById,
    data,
    error,
    isRefreshing,
    hasFilter,
    resetAll,
    isPolling,
    refreshNow,
    isDownloading,
    downloadReport,
  };
}
