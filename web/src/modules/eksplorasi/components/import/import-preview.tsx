"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/core/components/ui/table";
import { StatTile } from "@/core/components/feedback/stat-tile";
import { downloadBlob } from "@/core/lib/http/api-client";
import { CSV_BOM, csvLine } from "@/core/lib/sheets/csv";
import { DRILL_HOLE_COLUMNS } from "@/modules/eksplorasi/lib/drill-hole-columns";
import type { ImportError } from "@/modules/eksplorasi/lib/drill-hole-import";
import type { ImportPreview as Preview } from "@/modules/eksplorasi/components/import/use-drill-import";
import { IoAlertCircleOutline, IoDownloadOutline } from "react-icons/io5";

/** Errors shown on screen; the full list is in the downloadable report. */
const SHOWN_ERRORS = 100;

/** Step 2: what the file would do, and every row that would be left out. */
export function ImportPreview({
  preview,
  updateExisting,
  disabled,
  onUpdateExisting,
}: {
  preview: Preview;
  updateExisting: boolean;
  disabled: boolean;
  onUpdateExisting: (value: boolean) => void;
}) {
  const t = useTranslations("drilling.import");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const n = (value: number) => format.number(value);

  /** Every error, as a CSV to fix the file by. Built here: the server already sent them. */
  function downloadErrors(errors: ImportError[]) {
    const lines = [
      csvLine([t("report.line"), "Hole ID", t("report.column"), t("report.error")]),
      ...errors.map((e) => csvLine([e.line, e.holeId, DRILL_HOLE_COLUMNS.find((c) => c.key === e.field)?.header ?? "", e.message])),
    ];
    downloadBlob(new Blob([CSV_BOM + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), `drill-holes-import-errors-${Date.now()}.csv`);
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatTile label={t("summary.rows")} value={n(preview.total)} />
        <StatTile label={t("summary.new")} value={n(preview.create)} />
        <StatTile label={updateExisting ? t("summary.toUpdate") : t("summary.toSkip")} value={n(preview.existing)} />
        <StatTile label={t("summary.invalid")} value={n(preview.invalid)} tone={preview.invalid ? "error" : undefined} />
      </div>

      {preview.existing > 0 ? (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            checked={updateExisting}
            disabled={disabled}
            onChange={(event) => onUpdateExisting(event.target.checked)}
          />
          <span className="flex flex-col">
            <span className="font-medium">{t("updateExisting", { count: preview.existing })}</span>
            <span className="text-xs text-muted-foreground">{t("updateExistingHint")}</span>
          </span>
        </label>
      ) : null}

      {preview.ignoredHeaders.length > 0 ? (
        <p className="text-xs text-muted-foreground">{t("ignoredHeaders", { headers: preview.ignoredHeaders.join(", ") })}</p>
      ) : null}

      {preview.errors.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
              <IoAlertCircleOutline className="size-4" />
              {t("errorsTitle", { count: preview.invalid })}
            </p>
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => downloadErrors(preview.errors)}>
              <IoDownloadOutline className="size-3.5" />
              {t("downloadErrors")}
            </Button>
          </div>
          <div className="max-h-56 overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">{t("report.line")}</TableHead>
                  <TableHead>Hole ID</TableHead>
                  <TableHead>{t("report.error")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.errors.slice(0, SHOWN_ERRORS).map((e, index) => (
                  <TableRow key={`${e.line}-${index}`}>
                    <TableCell className="font-mono text-xs">{e.line}</TableCell>
                    <TableCell className="font-mono text-xs">{e.holeId ?? tCommon("empty")}</TableCell>
                    <TableCell className="text-xs">{e.message}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {preview.errorsTotal > SHOWN_ERRORS ? (
            <p className="text-xs text-muted-foreground">{t("moreErrors", { shown: SHOWN_ERRORS, total: preview.errorsTotal })}</p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
