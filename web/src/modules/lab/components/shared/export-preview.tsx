"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { IoReloadOutline } from "react-icons/io5";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/core/components/ui/table";
import { cn } from "@/core/lib/utils";

/** The first rows of an export, as the server would write them. */
export interface ExportPreview {
  /** Every row the file would hold. */
  total: number;
  columns: { key: string; header: string }[];
  rows: { id: string; sheet: string; sub: boolean; cells: Record<string, string | number | null> }[];
}
export type ExportPreviewResult = { ok: true; preview: ExportPreview } | { ok: false; error: string };
export type PreviewState =
  | { status: "loading" }
  | { status: "ready"; data: ExportPreview }
  | { status: "error"; error: string };

/**
 * The preview's state: null while the columns are being chosen. Only the
 * latest request's answer is shown, so going back while one is on its way
 * does not bring a stale table up later.
 */
export function useExportPreview(onPreview?: (columns: string[]) => Promise<ExportPreviewResult>) {
  const tCommon = useTranslations("common");
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const latest = useRef(0);

  async function show(columns: string[]) {
    if (!onPreview) return;
    const mine = ++latest.current;
    setPreview({ status: "loading" });
    const result = await onPreview(columns);
    if (latest.current !== mine) return;
    setPreview(
      result.ok
        ? { status: "ready", data: result.preview }
        : { status: "error", error: result.error || tCommon("networkError") }
    );
  }

  /** Back to the choice of columns: whatever changes there makes a new preview. */
  function back() {
    latest.current += 1;
    setPreview(null);
  }

  return { preview, show, back };
}

/**
 * The file's first rows, column for column and in the file's order, with the
 * tab each row lands on. A sub-sample is set in under its sample.
 */
export function ExportPreviewPanel({ state }: { state: PreviewState }) {
  const t = useTranslations("exportDialog");
  const tCommon = useTranslations("common");

  if (state.status === "loading") {
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <IoReloadOutline aria-hidden className="size-4 animate-spin" />
        {tCommon("loading")}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {state.error}
      </p>
    );
  }
  const { columns, rows } = state.data;
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{t("previewEmpty")}</p>;
  return (
    <div className="min-h-0 overflow-auto rounded-xl border">
      <Table className="text-xs">
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead className="whitespace-nowrap">{t("previewSheet")}</TableHead>
            {columns.map((column) => (
              <TableHead key={column.key} className="whitespace-nowrap">
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className={row.sub ? "text-muted-foreground" : undefined}>
              <TableCell className="whitespace-nowrap">{row.sheet}</TableCell>
              {columns.map((column, index) => (
                <TableCell
                  key={column.key}
                  className={cn("whitespace-nowrap tabular-nums", row.sub && index === 0 ? "pl-5" : undefined)}
                >
                  {row.cells[column.key] ?? "—"}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
