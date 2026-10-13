"use client";

import { useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/core/components/ui/table";
import type { PasteChange, PasteResult } from "@/modules/lab/lib/records/paste-map";
import { cn } from "@/core/lib/utils";
import { IoWarningOutline } from "react-icons/io5";
import { PREVIEW_ROW_LIMIT, labelFor } from "@/modules/lab/components/shared/paste-preview";
import { MAX_ROWS, REASON_KEYS, formatChange } from "@/modules/lab/components/shared/paste-from-excel-utils";

interface PasteFromExcelPreviewProps {
  result: PasteResult;
  /** The dialog fills a form instead of saving. */
  filling: boolean;
  tooMany: boolean;
  saveCount: number;
}

/** The counters, what stands in the way of applying, and the mapped rows. */
export function PasteFromExcelPreview({ result, filling, tooMany, saveCount }: PasteFromExcelPreviewProps) {
  const t = useTranslations("database.paste");
  const tCommon = useTranslations("common");

  return (
    <>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="rounded-md bg-muted px-2.5 py-1">
          {t("rowsRead", { count: result.summary.total })}
        </span>
        <span className="rounded-md bg-primary/10 px-2.5 py-1 text-primary">
          {t("toUpdate", { count: result.summary.update })}
        </span>
        {result.summary.create > 0 ? (
          <span className="rounded-md bg-primary/10 px-2.5 py-1 text-primary">
            {t("toCreate", { count: result.summary.create })}
          </span>
        ) : null}
        {result.summary.overwrite > 0 ? (
          <span className="rounded-md bg-amber-100 px-2.5 py-1 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
            {t("toOverwrite", { count: result.summary.overwrite })}
          </span>
        ) : null}
        <span className="rounded-md bg-muted px-2.5 py-1">
          {t("unchanged", { count: result.summary.unchanged })}
        </span>
        {result.summary.unknown > 0 ? (
          <span className="rounded-md bg-destructive/10 px-2.5 py-1 text-destructive">
            {t("unknown", { count: result.summary.unknown })}
          </span>
        ) : null}
        {result.summary.invalid > 0 ? (
          <span className="rounded-md bg-destructive/10 px-2.5 py-1 text-destructive">
            {t("invalid", { count: result.summary.invalid })}
          </span>
        ) : null}
        {/* How rows were paired matters more than anything else here:
            by id is safe, by position depends on the operator having
            ticked the boxes in the sheet's own order. */}
        <span className="rounded-md bg-muted px-2.5 py-1 text-muted-foreground">
          {result.matchedBy === "ident" && result.keyHeader === "labCode"
            ? t("matchedBy.labCode")
            : t(`matchedBy.${result.matchedBy}`)}
        </span>
        {result.matchedBy === "ident" ? (
          <span className="px-1 py-1 text-xs text-muted-foreground">{t("matchNote")}</span>
        ) : null}
      </div>

      {filling ? (
        <p className="text-xs text-muted-foreground">{t("fillHint")}</p>
      ) : null}

      {result.blocker ? (
        <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <IoWarningOutline className="size-4 shrink-0" />
          {result.blocker.kind === "count"
            ? t("countMismatch", {
                pasted: result.blocker.pasted,
                selected: result.blocker.selected,
              })
            : t("noColumns")}
        </p>
      ) : tooMany ? (
        <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <IoWarningOutline className="size-4 shrink-0" />
          {t("tooMany", { count: saveCount, max: MAX_ROWS })}
        </p>
      ) : result.summary.invalid > 0 || result.summary.unknown > 0 ? (
        <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <IoWarningOutline className="size-4 shrink-0" />
          {result.summary.unknown > 0 ? t("fixUnknown") : t("fixRows")}
        </p>
      ) : null}

      {result.rows.length > 0 ? (
        <div className="max-h-72 overflow-auto rounded-lg border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">{t("line")}</TableHead>
                <TableHead>{t("row")}</TableHead>
                <TableHead>{t("result")}</TableHead>
                <TableHead>{t("changes")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.rows.slice(0, PREVIEW_ROW_LIMIT).map((row) => {
                const replaced = new Set(row.overwrites?.map((entry) => entry.field));
                return (
                  <TableRow key={row.line}>
                    <TableCell className="text-muted-foreground">{row.line}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {row.label || tCommon("empty")}
                    </TableCell>
                    <TableCell
                      className={
                        row.status === "unknown" || row.status === "invalid"
                          ? "text-destructive"
                          : row.status === "create"
                            ? "text-primary"
                            : undefined
                      }
                    >
                      {t(`status.${row.status}`)}
                      {row.sub ? (
                        <span className="block text-xs text-muted-foreground">
                          {t("subOf", { code: row.sub.code })}
                        </span>
                      ) : null}
                      {replaced.size > 0 ? (
                        <span className="block text-xs text-amber-700 dark:text-amber-400">
                          {t("overwrites", { count: replaced.size })}
                        </span>
                      ) : null}
                      {row.message ? (
                        <span className="block text-xs text-muted-foreground">
                          {REASON_KEYS.has(row.message)
                            ? t(`reason.${row.message}`)
                            : row.message}
                        </span>
                      ) : null}
                    </TableCell>
                    {/* Wrapping, not one long line: eighteen changes
                        across a single row made the dialog wider than
                        itself, and a preview nobody can read without
                        scrolling sideways is a preview people skip. */}
                    <TableCell className="whitespace-normal text-sm text-muted-foreground">
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                        {Object.entries(row.changes).map(([key, change]: [string, PasteChange]) => (
                          <span
                            key={key}
                            className={cn(
                              "whitespace-nowrap",
                              replaced.has(key) && "font-medium text-amber-700 dark:text-amber-400"
                            )}
                          >
                            {labelFor(key)} {formatChange(key, change.from)} →{" "}
                            {formatChange(key, change.to)}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {result.rows.length > PREVIEW_ROW_LIMIT ? (
        <p className="text-xs text-muted-foreground">
          {t("previewTruncated", { shown: PREVIEW_ROW_LIMIT, total: result.rows.length })}
        </p>
      ) : null}
    </>
  );
}
