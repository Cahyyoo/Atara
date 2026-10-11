"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineNotice } from "@/components/ui/inline-notice";
import { HistoryEntries } from "@/components/shared/history-entries";
import { useTableParams } from "@/hooks/use-table-params";
import { cn } from "@/lib/utils";
import type { ApiResult, PaginationDTO, RecordHistoryEntry } from "@/types";
import { IoArrowBack, IoChevronBack, IoChevronForward, IoReloadOutline } from "react-icons/io5";
import { withBasePath } from "@/lib/base-path";

/** Typing a search walks through several values; only the last one is asked for. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Every change to the results, newest first: who, when, which sample, from
 * what to what, and why. Searched by Sample ID, Lab Code or barcode, within a
 * range of days; by default only the changes that touch a result. Filters in
 * the URL, so a view can be shared.
 */
export function ResultsHistory() {
  const t = useTranslations("history");
  const tCommon = useTranslations("common");
  const { get, setParams } = useTableParams();
  const search = get("search", "");
  const from = get("from", "");
  const to = get("to", "");
  const changes = get("changes", "results") === "all" ? "all" : "results";
  const page = Math.max(1, Number(get("page", "1")) || 1);

  // The box updates at once; the URL, and so the request, a moment later.
  const [typed, setTyped] = useState(search);
  useEffect(() => {
    if (typed === search) return;
    const timer = setTimeout(() => setParams({ search: typed.trim() || null, page: null }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [typed, search, setParams]);

  const query = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    changes,
    page: String(page),
  }).toString();

  const [loaded, setLoaded] = useState<{
    key: string;
    entries: RecordHistoryEntry[] | null;
    pagination: PaginationDTO | null;
    error: string | null;
  }>({ key: "", entries: null, pagination: null, error: null });

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const response = await fetch(withBasePath(`/api/lab-records/history?${query}`), { signal: controller.signal });
        const body: ApiResult<{ entries: RecordHistoryEntry[]; pagination: PaginationDTO }> = await response.json();
        setLoaded(
          body.success
            ? { key: query, entries: body.data.entries, pagination: body.data.pagination, error: null }
            : { key: query, entries: null, pagination: null, error: body.error }
        );
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setLoaded({ key: query, entries: null, pagination: null, error: tCommon("networkError") });
      }
    })();
    return () => controller.abort();
  }, [query, tCommon]);

  const isLoading = loaded.key !== query;
  const pagination = loaded.pagination;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 basis-64 flex-col gap-1.5">
          <Label htmlFor="history-search">{t("search")}</Label>
          <Input
            id="history-search"
            placeholder={t("searchPlaceholder")}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="history-from">{t("from")}</Label>
          <Input
            id="history-from"
            type="date"
            className="w-44"
            value={from}
            onChange={(event) => setParams({ from: event.target.value || null, page: null })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="history-to">{t("to")}</Label>
          <Input
            id="history-to"
            type="date"
            className="w-44"
            value={to}
            onChange={(event) => setParams({ to: event.target.value || null, page: null })}
          />
        </div>
        <div role="group" aria-label={t("which")} className="flex gap-1 rounded-xl bg-muted p-1">
          {(["results", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={changes === value}
              onClick={() => setParams({ changes: value === "results" ? null : value, page: null })}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm transition-colors",
                changes === value
                  ? "bg-background font-medium text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {value === "results" ? t("resultsOnly") : t("allChanges")}
            </button>
          ))}
        </div>
      </div>

      <InlineNotice tone="error">{loaded.error}</InlineNotice>

      <div className={cn("transition-opacity", isLoading && loaded.entries && "opacity-60")}>
        {loaded.entries === null && !loaded.error ? (
          <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <IoReloadOutline aria-hidden className="size-4 animate-spin" />
            {tCommon("loading")}
          </p>
        ) : loaded.entries && loaded.entries.length > 0 ? (
          <HistoryEntries entries={loaded.entries} showSample />
        ) : loaded.entries ? (
          <p className="rounded-xl border px-3 py-10 text-center text-sm text-muted-foreground">{t("emptyAll")}</p>
        ) : null}
      </div>

      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>{t("pageOf", { page: pagination.page, pages: pagination.totalPages, total: pagination.total })}</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={pagination.page <= 1 || isLoading}
              onClick={() => setParams({ page: pagination.page - 1 === 1 ? null : String(pagination.page - 1) })}
            >
              <IoChevronBack className="size-4" />
              {t("previous")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              disabled={pagination.page >= pagination.totalPages || isLoading}
              onClick={() => setParams({ page: String(pagination.page + 1) })}
            >
              {t("next")}
              <IoChevronForward className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** Back to where the history was opened from. */
export function HistoryBackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <IoArrowBack aria-hidden className="size-4" />
      {label}
    </Link>
  );
}
