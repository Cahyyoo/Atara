"use client";

import { useMemo, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { PrintLabelGrid } from "@/modules/lab/components/samples/print-label-grid";
import { LabelPrintControls } from "@/modules/lab/components/samples/label-print-controls";
import { LABEL_PAGE_STYLE } from "@/modules/lab/components/samples/label-print-style";
import type { SampleListItemDTO } from "@/modules/lab/types";
import { IoPrintOutline } from "react-icons/io5";

/** Reprints one label from the sample detail page, in as many copies as needed. */
export function PrintLabelButton({ sample }: { sample: SampleListItemDTO }) {
  const t = useTranslations("samples.labels");
  const printRef = useRef<HTMLDivElement>(null);

  // Deliberately not the remembered setting: this is a one-off "give me a
  // replacement sticker for this tube", and inheriting copies: 20 from a bulk
  // run would waste a sheet on a single click.
  const [copies, setCopies] = useState(1);

  // A fresh array on every keystroke would defeat the memo on PrintLabelGrid.
  const samples = useMemo(() => [sample], [sample]);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Label ${sample.sampleCode}`,
    pageStyle: LABEL_PAGE_STYLE,
  });

  return (
    <>
      <div data-tour="sample-print" className="flex items-center gap-2">
        <LabelPrintControls compact copies={copies} onCopiesChange={setCopies} />
        <Button variant="outline" className="gap-2" onClick={handlePrint}>
          <IoPrintOutline className="size-4" />
          {t("printOne")}
        </Button>
      </div>

      {/* Kept in the document (react-to-print needs a live node) but out of view. */}
      <div aria-hidden className="pointer-events-none fixed -left-[9999px] top-0">
        <PrintLabelGrid ref={printRef} samples={samples} copies={copies} columns={3} />
      </div>
    </>
  );
}
