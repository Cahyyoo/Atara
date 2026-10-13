"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/core/components/ui/dialog";
import { PrintLabelGrid, type LabelColumns } from "@/modules/lab/components/samples/print-label-grid";
import type { SampleListItemDTO } from "@/modules/lab/types";
import { IoPrintOutline } from "react-icons/io5";

interface ReprintPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  samples: SampleListItemDTO[];
  copies: number;
  columns: LabelColumns;
  totalLabels: number;
  onPrint: () => void;
}

/** The sheet as it will print, in a dialog where it does not push the page down. */
export function ReprintPreviewDialog({
  open,
  onOpenChange,
  samples,
  copies,
  columns,
  totalLabels,
  onPrint,
}: ReprintPreviewDialogProps) {
  const t = useTranslations("samples.labels");
  const tCommon = useTranslations("common");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("previewTitle", { count: totalLabels })}</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-auto rounded-lg border bg-muted/30 p-3">
          <PrintLabelGrid samples={samples} copies={copies} columns={columns} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {tCommon("close")}
          </Button>
          <Button className="gap-2" disabled={samples.length === 0} onClick={onPrint}>
            <IoPrintOutline className="size-4" />
            {t("printCount", { count: totalLabels })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
