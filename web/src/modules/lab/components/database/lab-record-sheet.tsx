"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/core/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/core/components/ui/dialog";
import { StatusBadge } from "@/modules/lab/components/samples/status-badge";
import { ASSAY_FIELDS, INSTRUMENT_FIELDS } from "@/modules/lab/lib/records/assay";
import { formatWitaDateTime } from "@/core/lib/wita-time";
import { stageLabel } from "@/modules/lab/lib/stages/stages";
import { cn } from "@/core/lib/utils";
import type { LabRecordListItemDTO } from "@/modules/lab/types";
import { IoOpenOutline, IoPencilOutline } from "react-icons/io5";
import { samplePath } from "@/modules/lab/lib/samples/sample-ident";

/**
 * Everything about one row, beside the list rather than instead of it.
 *
 * Built from the row the table already holds, so opening it costs no request.
 * All eighteen elements are here -- the table shows the handful somebody chose
 * as columns, and this is where the rest are read without switching columns
 * on and off.
 */
export function LabRecordSheet({
  record,
  canEdit,
  formatDate,
  onClose,
  onEdit,
}: {
  record: LabRecordListItemDTO | null;
  canEdit: boolean;
  /** The table's own date formatting, so both say the same day the same way. */
  formatDate: (shiftDate: string) => string;
  onClose: () => void;
  onEdit: (record: LabRecordListItemDTO) => void;
}) {
  const t = useTranslations("database");
  const tSamples = useTranslations("samples");
  const tStages = useTranslations("stages");
  const tCommon = useTranslations("common");

  return (
    <Dialog open={record !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent
        // A panel from the right edge rather than a box in the middle: the
        // list it belongs to stays in view on a wide screen.
        className="top-0 right-0 left-auto h-dvh max-h-dvh w-full translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-none p-0 sm:max-w-md sm:rounded-l-3xl"
      >
        {record ? (
          <>
            <DialogHeader className="sticky top-0 z-10 gap-1 border-b bg-popover px-5 pt-5 pb-4">
              <DialogTitle className="font-mono text-base">{record.sample.sampleCode}</DialogTitle>
              <DialogDescription className="font-mono text-xs">{record.labCode}</DialogDescription>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <StatusBadge status={record.sample.status} />
                <span className="text-xs text-muted-foreground">
                  {record.sample.currentStage
                    ? stageLabel(tStages, record.sample.currentStage.key, record.sample.currentStage.name)
                    : tSamples("notStarted")}
                </span>
              </div>
            </DialogHeader>

            <div className="flex flex-col gap-5 px-5 py-4">
              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t("sheet.identity")}
                </h3>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">{t("sampleIdent")}</dt>
                  <dd className="break-all font-mono text-xs leading-5">{record.sampleIdent ?? "—"}</dd>
                  <dt className="text-muted-foreground">{t("shiftDate")}</dt>
                  <dd>{formatDate(record.shiftDate)}</dd>
                </dl>
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t("sheet.results")}
                </h3>
                <dl className="grid grid-cols-3 gap-2">
                  {ASSAY_FIELDS.map((field) => {
                    const value = record[field.key];
                    return (
                      <div
                        key={field.key}
                        className={cn(
                          "flex flex-col rounded-lg px-2.5 py-1.5",
                          value === null ? "bg-muted/40" : "bg-muted"
                        )}
                      >
                        <dt className="text-xs text-muted-foreground">{field.shortLabel}</dt>
                        <dd
                          className={cn(
                            "text-sm tabular-nums",
                            value === null ? "text-muted-foreground" : "font-medium"
                          )}
                        >
                          {value === null ? "—" : value.toFixed(3).replace(/\.?0+$/, "")}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t("instrumentColumns")}
                </h3>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  {INSTRUMENT_FIELDS.map((field) => {
                    const value = record[field.key];
                    const shown =
                      value == null || value === ""
                        ? "—"
                        : field.kind === "datetime"
                          ? (formatWitaDateTime(value) ?? "—")
                          : String(value);
                    return (
                      <div key={field.key} className="contents">
                        <dt className="text-muted-foreground">{t(field.key)}</dt>
                        <dd>{shown}</dd>
                      </div>
                    );
                  })}
                </dl>
              </section>

              {record.remarks ? (
                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {t("dialog.remarks")}
                  </h3>
                  <p className="whitespace-pre-wrap text-sm">{record.remarks}</p>
                </section>
              ) : null}
            </div>

            <div className="sticky bottom-0 mt-auto flex gap-2 border-t bg-popover px-5 py-4">
              {canEdit ? (
                <Button className="flex-1 gap-2" onClick={() => onEdit(record)}>
                  <IoPencilOutline className="size-4" />
                  {tCommon("edit")}
                </Button>
              ) : null}
              <Link
                href={samplePath(record.sample.sampleCode)}
                className={cn(buttonVariants({ variant: "outline" }), "flex-1 gap-2")}
              >
                <IoOpenOutline className="size-4" />
                {t("sheet.openSample")}
              </Link>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
