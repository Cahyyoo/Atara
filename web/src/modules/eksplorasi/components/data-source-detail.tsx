"use client";

import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { Badge } from "@/core/components/ui/badge";
import { Button, buttonVariants } from "@/core/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/core/components/ui/dialog";
import { cn } from "@/core/lib/utils";
import { TYPE_VARIANT } from "@/modules/eksplorasi/components/data-source-row";
import {
  ELEMENT_FIELDS,
  ELEMENT_LABELS,
  remarksFieldOf,
  type DataSourceField,
} from "@/modules/eksplorasi/lib/data-source-columns";
import type { DataSourceDTO, DataSourceView } from "@/modules/eksplorasi/types";
import { IoPencilOutline, IoTrashOutline } from "react-icons/io5";

/** Who and where the sample is, in the order the lab's sheet writes it. */
const IDENTITY: readonly (DataSourceField | "fromTo")[] = [
  "campaign",
  "holeId",
  "fromTo",
  "date",
  "weight",
  "control",
  "controlDate",
  "no",
];

const SECTION_TITLE = "text-xs font-medium uppercase tracking-wider text-muted-foreground";

/**
 * Everything about one sample, beside the list rather than instead of it --
 * as the lab's sample database opens a row.
 *
 * Built from the row the list already holds, so opening it costs no request.
 * All sixteen assay results are here: the list shows none of them unless
 * somebody ticks them on, and this is where they are read.
 */
export function DataSourceDetail({
  row,
  view,
  editHref,
  onClose,
  onDelete,
}: {
  row: DataSourceDTO | null;
  /** The list it was opened from: its Remarks is the one shown (remarksFieldOf). */
  view: DataSourceView;
  /** Where the row is changed: its list's sheet, opened at this row. */
  editHref: string;
  onClose: () => void;
  onDelete: (row: DataSourceDTO) => void;
}) {
  const t = useTranslations("dataSource");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const empty = tCommon("empty");
  const remarksField = remarksFieldOf(view);

  const day = (value: string | null) =>
    value ? format.dateTime(new Date(`${value}T00:00:00`), { dateStyle: "medium" }) : null;
  const moment = (value: string) => format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });

  function identity(item: DataSourceDTO, field: (typeof IDENTITY)[number]): string | null {
    if (field === "fromTo") return item.from || item.to ? `${item.from ?? empty}–${item.to ?? empty}` : null;
    if (field === "date") return day(item.date);
    return item[field];
  }

  return (
    <Dialog open={row !== null} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent
        // A panel from the right edge rather than a box in the middle: the
        // list it belongs to stays in view on a wide screen.
        className="top-0 right-0 left-auto h-dvh max-h-dvh w-full translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-none p-0 sm:max-w-md sm:rounded-l-3xl"
      >
        {row ? (
          <>
            <DialogHeader className="sticky top-0 z-10 gap-1 border-b bg-popover px-5 pt-5 pb-4">
              <DialogTitle className="break-all font-mono text-base">{row.sampleId}</DialogTitle>
              <DialogDescription className="text-xs">
                {[row.campaign, row.holeId].filter(Boolean).join(" · ") || empty}
              </DialogDescription>
              <div className="pt-1">
                <Badge variant={TYPE_VARIANT[row.sampleType]}>{t(`sampleType.${row.sampleType}`)}</Badge>
              </div>
            </DialogHeader>

            <div className="flex flex-col gap-5 px-5 py-4">
              <section className="flex flex-col gap-2">
                <h3 className={SECTION_TITLE}>{t("detail.identity")}</h3>
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  {IDENTITY.map((field) => {
                    const value = identity(row, field);
                    return (
                      <div key={field} className="contents">
                        <dt className="text-muted-foreground">{t(`fields.${field}`)}</dt>
                        <dd className={cn("break-all", value === null && "text-muted-foreground")}>{value ?? empty}</dd>
                      </div>
                    );
                  })}
                </dl>
              </section>

              <section className="flex flex-col gap-2">
                <h3 className={SECTION_TITLE}>{t("detail.results")}</h3>
                <dl className="grid grid-cols-4 gap-2">
                  {ELEMENT_FIELDS.map((field) => {
                    const value = row[field];
                    return (
                      <div
                        key={field}
                        className={cn("flex flex-col rounded-lg px-2.5 py-1.5", value === null ? "bg-muted/40" : "bg-muted")}
                      >
                        <dt className="text-xs text-muted-foreground">{ELEMENT_LABELS[field]}</dt>
                        <dd
                          className={cn(
                            "truncate text-sm tabular-nums",
                            value === null ? "text-muted-foreground" : "font-medium"
                          )}
                          title={value ?? undefined}
                        >
                          {value ?? empty}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </section>

              {row[remarksField] ? (
                <section className="flex flex-col gap-2">
                  <h3 className={SECTION_TITLE}>{t(`fields.${remarksField}`)}</h3>
                  <p className="whitespace-pre-wrap break-words text-sm">{row[remarksField]}</p>
                </section>
              ) : null}

              <section className="flex flex-col gap-1 text-xs text-muted-foreground">
                <h3 className={SECTION_TITLE}>{t("detail.history")}</h3>
                <p>{t("detail.created", { name: row.createdBy ?? empty, date: moment(row.createdAt) })}</p>
                {row.updatedAt !== row.createdAt ? (
                  <p>{t("detail.updated", { name: row.updatedBy ?? empty, date: moment(row.updatedAt) })}</p>
                ) : null}
              </section>
            </div>

            <div className="sticky bottom-0 mt-auto flex gap-2 border-t bg-popover px-5 py-4">
              <Link href={editHref} className={cn(buttonVariants(), "flex-1 gap-2")}>
                <IoPencilOutline className="size-4" />
                {tCommon("edit")}
              </Link>
              <Button variant="outline" className="flex-1 gap-2 text-destructive" onClick={() => onDelete(row)}>
                <IoTrashOutline className="size-4" />
                {t("delete.action")}
              </Button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
