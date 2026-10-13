"use client";

import { useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/core/components/ui/card";
import { PrintLabelGrid, clampCopies } from "@/modules/lab/components/samples/print-label-grid";
import { useLabelPrintSettings } from "@/modules/lab/components/samples/label-print-controls";
import { LABEL_PAGE_STYLE } from "@/modules/lab/components/samples/label-print-style";
import { IoPrintOutline } from "react-icons/io5";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { useLabelReprint } from "@/modules/lab/components/samples/label-reprint/use-label-reprint";
import { ReprintFilters } from "@/modules/lab/components/samples/label-reprint/reprint-filters";
import { ReprintSampleList } from "@/modules/lab/components/samples/label-reprint/reprint-sample-list";
import { ReprintPrintPanel } from "@/modules/lab/components/samples/label-reprint/reprint-print-panel";
import { ReprintPreviewDialog } from "@/modules/lab/components/samples/label-reprint/reprint-preview-dialog";

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
  const {
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
  } = useLabelReprint();
  const [previewOpen, setPreviewOpen] = useState(false);

  const { copies, setCopies, columns, setColumns } = useLabelPrintSettings();

  const printRef = useRef<HTMLDivElement>(null);
  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: "Nickel Sample Labels",
    pageStyle: LABEL_PAGE_STYLE,
  });

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
            <ReprintFilters
              search={search}
              onSearchChange={setSearch}
              status={status}
              onStatusChange={setStatus}
              stageId={stageId}
              onStageIdChange={setStageId}
              ident={ident}
              onIdentChange={setIdent}
              stages={stages}
            />

            <InlineNotice tone="error">{error}</InlineNotice>

            <ReprintSampleList
              samples={samples}
              selected={selected}
              pagination={pagination}
              remaining={remaining}
              isLoading={isLoading}
              isLoadingMore={isLoadingMore}
              allShownSelected={allShownSelected}
              someShownSelected={someShownSelected}
              onToggleAt={toggleAt}
              onToggleShown={toggleShown}
              onLoadMore={loadMore}
            />

            <p className="hidden text-xs text-muted-foreground lg:block">{t("shiftHint")}</p>
          </CardContent>
        </Card>

        <ReprintPrintPanel
          selectedSamples={selectedSamples}
          copies={copies}
          onCopiesChange={setCopies}
          columns={columns}
          onColumnsChange={setColumns}
          totalLabels={totalLabels}
          onClear={clearSelection}
          onRemove={remove}
          onPrint={handlePrint}
          onPreview={() => setPreviewOpen(true)}
        />
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

      <ReprintPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        samples={selectedSamples}
        copies={copies}
        columns={columns}
        totalLabels={totalLabels}
        onPrint={handlePrint}
      />

      {/* Kept in the document (react-to-print needs a live node) but out of
          view: the preview lives in the dialog now, where it does not push
          the page down. */}
      <div aria-hidden className="pointer-events-none fixed -left-[9999px] top-0">
        <PrintLabelGrid ref={printRef} samples={selectedSamples} copies={copies} columns={columns} />
      </div>
    </div>
  );
}
