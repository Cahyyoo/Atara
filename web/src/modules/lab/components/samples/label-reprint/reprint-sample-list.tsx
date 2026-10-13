"use client";

import { useEffect, useRef } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { StatusBadge } from "@/modules/lab/components/samples/status-badge";
import type { PaginationDTO } from "@/core/types";
import type { SampleListItemDTO } from "@/modules/lab/types";
import { stageLabel } from "@/modules/lab/lib/stages/stages";
import { cn } from "@/core/lib/utils";
import { IoReloadOutline } from "react-icons/io5";

interface ReprintSampleListProps {
  samples: SampleListItemDTO[];
  selected: Map<string, SampleListItemDTO>;
  pagination: PaginationDTO | null;
  remaining: number;
  isLoading: boolean;
  isLoadingMore: boolean;
  allShownSelected: boolean;
  someShownSelected: boolean;
  onToggleAt: (index: number, withShift: boolean) => void;
  onToggleShown: () => void;
  onLoadMore: () => void;
}

/** The samples to tick, with select-all over the column of boxes. */
export function ReprintSampleList({
  samples,
  selected,
  pagination,
  remaining,
  isLoading,
  isLoadingMore,
  allShownSelected,
  someShownSelected,
  onToggleAt,
  onToggleShown,
  onLoadMore,
}: ReprintSampleListProps) {
  const t = useTranslations("samples.labels");
  const tCommon = useTranslations("common");
  const tStages = useTranslations("stages");
  const format = useFormatter();

  /** Whether shift was held for the click that is about to toggle a row. */
  const shiftHeld = useRef(false);

  function toggleAt(index: number) {
    const withShift = shiftHeld.current;
    shiftHeld.current = false;
    onToggleAt(index, withShift);
  }

  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Only settable from script: "some of these" is neither ticked nor not.
    if (selectAllRef.current) selectAllRef.current.indeterminate = someShownSelected;
  }, [someShownSelected]);

  return (
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
            onChange={onToggleShown}
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
            onClick={onLoadMore}
          >
            {isLoadingMore ? <IoReloadOutline className="size-4 animate-spin" /> : null}
            {t("loadMore", { remaining })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
