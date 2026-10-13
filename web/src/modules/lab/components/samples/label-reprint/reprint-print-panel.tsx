"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/core/components/ui/card";
import { LabelPrintControls } from "@/modules/lab/components/samples/label-print-controls";
import type { LabelColumns } from "@/modules/lab/components/samples/print-label-grid";
import type { SampleListItemDTO } from "@/modules/lab/types";
import { IoClose, IoEyeOutline, IoPrintOutline } from "react-icons/io5";

interface ReprintPrintPanelProps {
  selectedSamples: SampleListItemDTO[];
  copies: number;
  onCopiesChange: (copies: number) => void;
  columns: LabelColumns;
  onColumnsChange: (columns: LabelColumns) => void;
  totalLabels: number;
  onClear: () => void;
  onRemove: (id: string) => void;
  onPrint: () => void;
  onPreview: () => void;
}

/** What is about to be printed: the ticked samples, the settings, and Print. */
export function ReprintPrintPanel({
  selectedSamples,
  copies,
  onCopiesChange,
  columns,
  onColumnsChange,
  totalLabels,
  onClear,
  onRemove,
  onPrint,
  onPreview,
}: ReprintPrintPanelProps) {
  const t = useTranslations("samples.labels");
  const nothingSelected = selectedSamples.length === 0;

  return (
    // Pinned under the app header while the list scrolls past, so the
    // count and Print are always beside the boxes being ticked.
    <Card data-tour="labels-settings" className="lg:sticky lg:top-20">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t("printPanelTitle", { count: selectedSamples.length })}</CardTitle>
        <Button
          variant="ghost"
          size="sm"
          disabled={nothingSelected}
          onClick={onClear}
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
                  onClick={() => onRemove(sample.id)}
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
          onCopiesChange={onCopiesChange}
          columns={columns}
          onColumnsChange={onColumnsChange}
          totalLabels={totalLabels}
        />

        <div className="flex flex-col gap-2">
          <Button data-tour="labels-print" className="w-full gap-2" disabled={nothingSelected} onClick={onPrint}>
            <IoPrintOutline className="size-4" />
            {t("printCount", { count: totalLabels })}
          </Button>
          <Button
            variant="outline"
            className="w-full gap-2"
            disabled={nothingSelected}
            onClick={onPreview}
          >
            <IoEyeOutline className="size-4" />
            {t("preview")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
