"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useReactToPrint } from "react-to-print";
import { Button } from "@/core/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/core/components/ui/card";
import { GenerateForm } from "@/modules/lab/components/samples/generate-form";
import { PrintLabelGrid, clampCopies } from "@/modules/lab/components/samples/print-label-grid";
import {
  LabelPrintControls,
  useLabelPrintSettings,
} from "@/modules/lab/components/samples/label-print-controls";
import { StatusBadge } from "@/modules/lab/components/samples/status-badge";
import { LABEL_PAGE_STYLE } from "@/modules/lab/components/samples/label-print-style";
import type { SampleListItemDTO } from "@/modules/lab/types";
import { IoArrowBack, IoArrowForward, IoCheckboxOutline, IoPrintOutline, IoSquareOutline } from "react-icons/io5";

export default function GenerateSamplePage() {
  const t = useTranslations("samples.generate");
  const [batch, setBatch] = useState<SampleListItemDTO[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  /**
   * Which of the two steps is on screen.
   *
   * Held rather than derived from whether the batch is empty: if the screen
   * followed the list, going back to the form would mean throwing the labels
   * away first, and there would be no way to reach them again afterwards.
   */
  const [view, setView] = useState<"form" | "labels">("form");
  const { copies, setCopies, columns, setColumns } = useLabelPrintSettings();
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: "Nickel Sample Labels",
    pageStyle: LABEL_PAGE_STYLE,
  });

  const selectedSamples = useMemo(
    () => batch.filter((sample) => selectedIds.has(sample.id)),
    [batch, selectedIds]
  );

  const totalLabels = selectedSamples.length * clampCopies(copies);

  function handleGenerated(samples: SampleListItemDTO[]) {
    // Replaces rather than accumulates: this screen is the batch just made.
    // Anything from an earlier run is reprinted from the Reprint Labels page,
    // which looks samples up by code rather than keeping them in memory.
    setBatch(samples);
    setSelectedIds(new Set(samples.map((sample) => sample.id)));
    setView("labels");
  }

  function toggleSample(id: string) {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    if (selectedIds.size === batch.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(batch.map((sample) => sample.id)));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      {view === "form" ? (
        <>
          {/* Pressing "create more" by mistake would otherwise strand the batch
              until the next generate overwrote it. */}
          {batch.length > 0 ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setView("labels")}
            >
              {t("viewBatch", { count: batch.length })}
              <IoArrowForward className="size-4" />
            </button>
          ) : null}

          <GenerateForm onGenerated={handleGenerated} />
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              onClick={() => setView("form")}
            >
              <IoArrowBack className="size-4" />
              {t("backToForm")}
            </button>
            {/* The next step for these barcodes: giving them an identity. */}
            <Link
              href="/lab/database?ident=missing"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              {t("openDatabase")}
              <IoArrowForward className="size-4" />
            </Link>
          </div>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{t("sessionTitle", { count: batch.length })}</CardTitle>
                <CardDescription>{t("sessionDescription")}</CardDescription>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <LabelPrintControls
                  copies={copies}
                  onCopiesChange={setCopies}
                  columns={columns}
                  onColumnsChange={setColumns}
                  totalLabels={totalLabels}
                />
                <Button variant="outline" size="sm" className="gap-2" onClick={toggleAll}>
                  {selectedIds.size === batch.length ? (
                    <IoCheckboxOutline className="size-4" />
                  ) : (
                    <IoSquareOutline className="size-4" />
                  )}
                  {t("selectAll")}
                </Button>
                <Button
                  size="sm"
                  className="gap-2"
                  disabled={selectedSamples.length === 0}
                  onClick={handlePrint}
                >
                  <IoPrintOutline className="size-4" />
                  {t("print")}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                {batch.map((sample) => (
                  <label
                    key={sample.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted/60"
                  >
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={selectedIds.has(sample.id)}
                      onChange={() => toggleSample(sample.id)}
                    />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-mono text-xs font-medium">
                        {sample.sampleCode}
                      </span>
                      <span className="truncate font-mono text-xs text-primary">
                        {sample.labRecord?.labCode ?? "—"}
                      </span>
                    </div>
                    <StatusBadge status={sample.status} />
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* The print button targets this grid, and both live on this step, so
              Print never points at something that is not mounted. */}
          {selectedSamples.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("previewTitle")}</CardTitle>
                <CardDescription>
                  {t("previewDescription", { count: selectedSamples.length })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border bg-muted/30 p-4">
                  <PrintLabelGrid
                    ref={printRef}
                    samples={selectedSamples}
                    copies={copies}
                    columns={columns}
                  />
                </div>
              </CardContent>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}
