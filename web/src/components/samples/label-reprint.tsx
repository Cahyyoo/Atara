"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { useFormatter, useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PrintLabelGrid, clampCopies } from "@/components/samples/print-label-grid";
import {
  LabelPrintControls,
  useLabelPrintSettings,
} from "@/components/samples/label-print-controls";
import { StatusBadge } from "@/components/samples/status-badge";
import { LABEL_PAGE_STYLE } from "@/components/samples/label-print-style";
import type { ApiResult, PaginationDTO, SampleListItemDTO, SampleStatus, StageDTO } from "@/types";
import { stageLabel } from "@/lib/stages";
import { cn } from "@/lib/utils";
import {
  IoClose,
  IoEyeOutline,
  IoPrintOutline,
  IoReloadOutline,
  IoSearchOutline,
} from "react-icons/io5";
import { InlineNotice } from "@/components/ui/inline-notice";

const STATUS_VALUES = ["ALL", "PENDING", "IN_PROGRESS", "COMPLETED"] as const;

const PAGE_SIZE = "50";

type SamplesPage = { samples: SampleListItemDTO[]; pagination: PaginationDTO };

/**
 * Reprinting labels for samples made at any time.
 *
 * Two panels: the samples on the left, what is about to be printed on the
 * right. The right one stays in view while the list scrolls, which is the
 * point of splitting them -- it used to sit under the list, so somebody ticking
 * boxes could not see how many they had ticked, or where Print was, without
 * scrolling away from what they were ticking.
 *
 * The list is the page's own scroll rather than a box inside it. A scrolling
 * box inside a scrolling page is two scrollbars fighting over one wheel.
 */
export function LabelReprint() {
  const t = useTranslations("samples.labels");
  const tSamples = useTranslations("samples");
  const tCommon = useTranslations("common");
  const tStages = useTranslations("stages");
  const format = useFormatter();
  const loadError = tCommon("loadError");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<SampleStatus | "ALL">("ALL");
  const [stageId, setStageId] = useState("ALL");
  /** Whether the barcode has its Sample ID yet: made first, identified later. */
  const [ident, setIdent] = useState<"ALL" | "has" | "missing">("ALL");
  const [stages, setStages] = useState<StageDTO[]>([]);

  const [result, setResult] = useState<{
    key: string;
    samples: SampleListItemDTO[];
    pagination: PaginationDTO | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  /** Keyed by id so a selection survives changing the filters. */
  const [selected, setSelected] = useState<Map<string, SampleListItemDTO>>(new Map());

  /** Where the last tick was, for shift+click to select everything up to here. */
  const anchor = useRef<number | null>(null);
  /** Whether shift was held for the click that is about to toggle a row. */
  const shiftHeld = useRef(false);

  const { copies, setCopies, columns, setColumns } = useLabelPrintSettings();

  const statusLabels = Object.fromEntries(
    STATUS_VALUES.map((value) => [
      value,
      value === "ALL" ? tSamples("allStatuses") : tSamples(`status.${value}`),
    ])
  );

  const identLabels: Record<string, string> = {
    ALL: t("identAll"),
    has: t("identHas"),
    missing: t("identMissing"),
  };

  const stageLabels: Record<string, string> = {
    ALL: tSamples("allStages"),
    ...Object.fromEntries(
      stages.map((stage) => [stage.id, stageLabel(tStages, stage.key, stage.name)])
    ),
  };

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: "Nickel Sample Labels",
    pageStyle: LABEL_PAGE_STYLE,
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/stages", { signal: controller.signal })
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
          const response = await fetch(`/api/samples?${queryKey}`, { signal: controller.signal });
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
      const response = await fetch(`/api/samples?${next.toString()}`);
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

  function toggleAt(index: number) {
    const sample = samples[index];
    if (!sample) return;
    const withShift = shiftHeld.current;
    shiftHeld.current = false;

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

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Only settable from script: "some of these" is neither ticked nor not.
    if (selectAllRef.current) selectAllRef.current.indeterminate = someShownSelected;
  }, [someShownSelected]);

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

  // A fresh array on every render would defeat the memo on PrintLabelGrid.
  const selectedSamples = useMemo(() => [...selected.values()], [selected]);
  const totalLabels = selectedSamples.length * clampCopies(copies);
  const nothingSelected = selectedSamples.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <Card>
          <CardHeader>
            <CardTitle>{t("findTitle")}</CardTitle>
            <CardDescription>{t("findDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <IoSearchOutline className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label={tSamples("searchPlaceholder")}
                  data-tour="labels-search"
                  placeholder={tSamples("searchPlaceholder")}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-8"
                />
              </div>
              <Select
                value={status}
                items={statusLabels}
                onValueChange={(value) => setStatus((value ?? "ALL") as SampleStatus | "ALL")}
              >
                <SelectTrigger className="w-full sm:w-40" aria-label={tSamples("allStatuses")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_VALUES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value === "ALL" ? tSamples("allStatuses") : tSamples(`status.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={stageId}
                items={stageLabels}
                onValueChange={(value) => setStageId(value ?? "ALL")}
              >
                <SelectTrigger className="w-full sm:w-44" aria-label={tSamples("allStages")}>
                  <SelectValue>{(value) => stageLabels[value as string] ?? ""}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{tSamples("allStages")}</SelectItem>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stageLabel(tStages, stage.key, stage.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={ident}
                items={identLabels}
                onValueChange={(value) => setIdent((value ?? "ALL") as "ALL" | "has" | "missing")}
              >
                <SelectTrigger data-tour="labels-ident" className="w-full sm:w-48" aria-label={t("identLabel")}>
                  <SelectValue>{(value) => identLabels[value as string] ?? ""}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(identLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <InlineNotice tone="error">{error}</InlineNotice>

            <div className="overflow-hidden rounded-lg border">
              {/* The list's own header: select-all belongs over the column of
                  boxes it ticks, not as a button off to one side. */}
              <div className="flex flex-col gap-1 border-b bg-muted/40 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <label className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
                  <input
                    ref={selectAllRef}
                    data-tour="labels-select"
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={allShownSelected}
                    disabled={isLoading || samples.length === 0}
                    onChange={toggleShown}
                  />
                  {t("selectShown", { count: samples.length })}
                </label>
                <p className="text-xs text-muted-foreground">
                  {pagination
                    ? t("showingMatching", { shown: samples.length, total: pagination.total })
                    : tCommon("loading")}
                </p>
              </div>

              {/* Column names for the rows below, where there is room for them. */}
              <div
                aria-hidden
                className="hidden grid-cols-[1rem_minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 border-b px-3 py-1.5 text-xs font-medium text-muted-foreground sm:grid"
              >
                <span />
                <span>{t("columnBarcode")}</span>
                <span>{t("columnSampleId")}</span>
                <span>{t("columnStatus")}</span>
              </div>

              {isLoading ? (
                <p className="flex h-32 items-center justify-center text-muted-foreground">
                  <IoReloadOutline className="size-5 animate-spin" />
                </p>
              ) : samples.length === 0 ? (
                <p className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                  {t("noMatch")}
                </p>
              ) : (
                <ul className="divide-y">
                  {samples.map((sample, index) => {
                    const isSelected = selected.has(sample.id);
                    const stage = sample.currentStage
                      ? stageLabel(tStages, sample.currentStage.key, sample.currentStage.name)
                      : null;
                    return (
                      <li key={sample.id}>
                        <label
                          // Read on the way down, before the checkbox's change
                          // fires: the change event itself does not say
                          // whether shift was held.
                          onMouseDown={(event) => {
                            shiftHeld.current = event.shiftKey;
                          }}
                          className={cn(
                            "grid cursor-pointer select-none grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/60 sm:grid-cols-[1rem_minmax(0,1fr)_minmax(0,1fr)_auto]",
                            isSelected && "bg-primary/5 hover:bg-primary/10"
                          )}
                        >
                          <input
                            type="checkbox"
                            className="size-4 shrink-0 accent-primary"
                            checked={isSelected}
                            onChange={() => toggleAt(index)}
                          />
                          <div className="flex min-w-0 flex-1 flex-col">
                            <span className="truncate font-mono text-sm font-medium">
                              {sample.sampleCode}
                            </span>
                            {/* What tells two batches apart when the codes
                                alone do not: the lab code, where it has got
                                to, and the day it was made. */}
                            <span className="truncate text-xs text-muted-foreground">
                              {[
                                sample.labCode,
                                stage,
                                format.dateTime(new Date(sample.createdAt), { dateStyle: "medium" }),
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </div>
                          {/* Its own column now that barcodes are made before
                              anybody fills the identity in: whether this one
                              has its Sample ID yet is worth seeing at a glance.
                              Below the code on a phone, beside it elsewhere. */}
                          <div className="col-start-2 row-start-2 min-w-0 sm:col-start-auto sm:row-start-auto">
                            {sample.sampleIdent ? (
                              <span className="block truncate font-mono text-xs" title={sample.sampleIdent}>
                                {sample.sampleIdent}
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-300">
                                {t("noIdent")}
                              </span>
                            )}
                          </div>
                          <div className="col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto">
                            <StatusBadge status={sample.status} />
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}

              {!isLoading && remaining > 0 ? (
                <div className="border-t p-2">
                  <Button
                    variant="ghost"
                    className="w-full gap-2"
                    disabled={isLoadingMore}
                    onClick={loadMore}
                  >
                    {isLoadingMore ? <IoReloadOutline className="size-4 animate-spin" /> : null}
                    {t("loadMore", { remaining })}
                  </Button>
                </div>
              ) : null}
            </div>

            <p className="hidden text-xs text-muted-foreground lg:block">{t("shiftHint")}</p>
          </CardContent>
        </Card>

        {/* Pinned under the app header while the list scrolls past, so the
            count and Print are always beside the boxes being ticked. */}
        <Card data-tour="labels-settings" className="lg:sticky lg:top-20">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>{t("printPanelTitle", { count: selectedSamples.length })}</CardTitle>
            <Button
              variant="ghost"
              size="sm"
              disabled={nothingSelected}
              onClick={() => setSelected(new Map())}
            >
              {t("clearAll")}
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {nothingSelected ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                {t("nothingSelected")}
              </p>
            ) : (
              // Its own small scroll, on purpose: a hundred chips must not push
              // Print below the fold of the panel that exists to keep it there.
              <ul className="flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                {selectedSamples.map((sample) => (
                  <li
                    key={sample.id}
                    className="flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2.5 pr-1 font-mono text-xs"
                  >
                    {sample.sampleCode}
                    <button
                      type="button"
                      aria-label={t("removeFromSelection", { code: sample.sampleCode })}
                      onClick={() => remove(sample.id)}
                      className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                    >
                      <IoClose className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <LabelPrintControls
              copies={copies}
              onCopiesChange={setCopies}
              columns={columns}
              onColumnsChange={setColumns}
              totalLabels={totalLabels}
            />

            <div className="flex flex-col gap-2">
              <Button data-tour="labels-print" className="w-full gap-2" disabled={nothingSelected} onClick={handlePrint}>
                <IoPrintOutline className="size-4" />
                {t("printCount", { count: totalLabels })}
              </Button>
              <Button
                variant="outline"
                className="w-full gap-2"
                disabled={nothingSelected}
                onClick={() => setPreviewOpen(true)}
              >
                <IoEyeOutline className="size-4" />
                {t("preview")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* On a phone the panel is below the list, so the count and Print ride
          along at the bottom of the screen instead. */}
      {!nothingSelected ? (
        <div className="sticky bottom-3 z-10 flex items-center justify-between gap-3 rounded-2xl border bg-background/95 px-4 py-3 shadow-raised backdrop-blur-sm lg:hidden">
          <span className="text-sm font-medium">
            {t("printPanelTitle", { count: selectedSamples.length })}
          </span>
          <Button className="gap-2" onClick={handlePrint}>
            <IoPrintOutline className="size-4" />
            {t("printCount", { count: totalLabels })}
          </Button>
        </div>
      ) : null}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("previewTitle", { count: totalLabels })}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 overflow-auto rounded-lg border bg-muted/30 p-3">
            <PrintLabelGrid samples={selectedSamples} copies={copies} columns={columns} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              {tCommon("close")}
            </Button>
            <Button className="gap-2" disabled={nothingSelected} onClick={handlePrint}>
              <IoPrintOutline className="size-4" />
              {t("printCount", { count: totalLabels })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Kept in the document (react-to-print needs a live node) but out of
          view: the preview lives in the dialog now, where it does not push
          the page down. */}
      <div aria-hidden className="pointer-events-none fixed -left-[9999px] top-0">
        <PrintLabelGrid ref={printRef} samples={selectedSamples} copies={copies} columns={columns} />
      </div>
    </div>
  );
}
