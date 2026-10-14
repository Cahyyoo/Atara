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
import { cn } from "@/core/lib/utils";
import type { ImportPreviewDTO, ImportPreviewRow } from "@/modules/lab/types";
import { PREVIEW_ROW_LIMIT, labelFor } from "@/modules/lab/components/shared/paste-preview";
import { formatValue } from "@/modules/lab/components/assay/paste-import-utils";
import { DuplicateBanner } from "@/modules/lab/components/assay/duplicate-alert";
import { duplicateGroups } from "@/modules/lab/lib/records/assay-duplicates";

interface PasteImportPreviewProps {
  summary: ImportPreviewDTO["summary"];
  rows: ImportPreviewRow[];
  problemsOnly: boolean;
  onProblemsOnlyChange: (checked: boolean) => void;
}

/** The counters, and the rows the server read out of the sheet. */
export function PasteImportPreview({ summary, rows, problemsOnly, onProblemsOnlyChange }: PasteImportPreviewProps) {
  const t = useTranslations("assay.paste");
  const tCommon = useTranslations("common");

  const statusLabel: Record<ImportPreviewRow["status"], string> = {
    update: t("status.update"),
    create: t("status.create"),
    unchanged: t("status.unchanged"),
    unknown: t("status.unknown"),
    invalid: t("status.invalid"),
  };
  const problems = summary.invalid + summary.unknown + (summary.duplicate ?? 0);
  const duplicates = duplicateGroups(
    rows.flatMap((row) =>
      row.duplicateLines || row.duplicateOf
        ? [{ row: row.line, label: row.labCode, lines: row.duplicateLines, samples: row.duplicateOf }]
        : []
    )
  );

  return (
    <>
      <DuplicateBanner groups={duplicates} />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-md bg-muted px-2.5 py-1">{t("rowsRead", { count: summary.total })}</span>
        <span className="rounded-md bg-primary/10 px-2.5 py-1 font-medium text-primary">
          {t("toUpdate", { count: summary.update })}
        </span>
        {(summary.create ?? 0) > 0 ? (
          <span className="rounded-md bg-primary/10 px-2.5 py-1 font-medium text-primary">
            {t("toCreate", { count: summary.create })}
          </span>
        ) : null}
        {(summary.overwrite ?? 0) > 0 ? (
          <span className="rounded-md bg-amber-100 px-2.5 py-1 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400">
            {t("toOverwrite", { count: summary.overwrite })}
          </span>
        ) : null}
        {(summary.duplicate ?? 0) > 0 ? (
          <span className="rounded-md bg-amber-100 px-2.5 py-1 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400">
            {t("toDuplicate", { count: summary.duplicate })}
          </span>
        ) : null}
        <span className="rounded-md bg-muted px-2.5 py-1">{t("unchanged", { count: summary.unchanged })}</span>
        {summary.unknown > 0 ? (
          <span className="rounded-md bg-amber-100 px-2.5 py-1 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400">
            {t("unknown", { count: summary.unknown })}
          </span>
        ) : null}
        {summary.invalid > 0 ? (
          <span className="rounded-md bg-destructive/10 px-2.5 py-1 text-destructive">
            {t("invalid", { count: summary.invalid })}
          </span>
        ) : null}
        {problems > 0 ? (
          <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={problemsOnly}
              onChange={(event) => onProblemsOnlyChange(event.target.checked)}
            />
            {t("problemsOnly")}
          </label>
        ) : null}
      </div>

      <div className="max-h-[28rem] overflow-auto rounded-lg border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-14">{t("line")}</TableHead>
              <TableHead>{t("sample")}</TableHead>
              <TableHead>{t("result")}</TableHead>
              <TableHead>{t("changes")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, PREVIEW_ROW_LIMIT).map((row) => (
              <TableRow
                key={`${row.line}-${row.labCode}`}
                className={cn(
                  row.status === "invalid" && "bg-destructive/5",
                  (row.status === "unknown" || row.duplicateLines || row.duplicateOf) &&
                    "bg-amber-50/60 dark:bg-amber-500/5"
                )}
              >
                <TableCell className="text-muted-foreground tabular-nums">{row.line}</TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-mono text-xs font-medium">
                      {row.sampleCode ?? (row.labCode || tCommon("empty"))}
                    </span>
                    {row.sampleCode ? (
                      <span className="font-mono text-xs text-muted-foreground">{row.labCode}</span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell
                  className={cn(
                    "whitespace-normal",
                    row.status === "invalid" && "text-destructive",
                    row.status === "unknown" && "text-amber-700 dark:text-amber-400"
                  )}
                >
                  {statusLabel[row.status]}
                  {row.duplicateLines || row.duplicateOf ? (
                    <span className="ml-2 rounded-full bg-amber-400/90 px-1.5 text-[10px] leading-4 font-semibold text-amber-950">
                      {t("duplicateBadge")}
                    </span>
                  ) : null}
                  {row.subCode ? (
                    <span className="block text-xs text-muted-foreground">{t("subOf", { code: row.subCode })}</span>
                  ) : null}
                  {row.overwrites?.length ? (
                    <span className="block text-xs text-amber-700 dark:text-amber-400">
                      {t("overwrites", { count: row.overwrites.length })}
                    </span>
                  ) : null}
                  {row.duplicateLines ? (
                    <span className="block text-xs text-amber-700 dark:text-amber-400">
                      {t("duplicateLines", { lines: row.duplicateLines.join(", ") })}
                    </span>
                  ) : null}
                  {row.duplicateOf ? (
                    <span className="block text-xs text-amber-700 dark:text-amber-400">
                      {t("duplicateOf", { samples: row.duplicateOf.join(", ") })}
                    </span>
                  ) : null}
                  {row.message ? <span className="block text-xs text-muted-foreground">{row.message}</span> : null}
                </TableCell>
                <TableCell className="whitespace-normal text-sm text-muted-foreground">
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {Object.entries(row.changes).map(([key, change]) => (
                      <span
                        key={key}
                        className={cn(
                          "whitespace-nowrap",
                          row.overwrites?.some((entry) => entry.field === key) &&
                            "text-amber-700 dark:text-amber-400"
                        )}
                      >
                        {labelFor(key)} {formatValue(change.from)} →{" "}
                        <span className="font-medium text-foreground">{formatValue(change.to)}</span>
                      </span>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {rows.length > PREVIEW_ROW_LIMIT ? (
        <p className="text-xs text-muted-foreground">
          {t("previewTruncated", { shown: PREVIEW_ROW_LIMIT, total: rows.length })}
        </p>
      ) : null}
    </>
  );
}
