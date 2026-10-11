"use client";

import { useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InlineNotice } from "@/components/ui/inline-notice";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { withBasePath } from "@/lib/base-path";
import { downloadFromApi } from "@/lib/download";
import { CSV_BOM, csvLine } from "@/lib/csv";
import { DRILL_HOLE_COLUMNS } from "@/lib/drill-hole-columns";
import type { ImportError } from "@/lib/drill-hole-import";
import type { ApiResult } from "@/types";
import {
  IoAlertCircleOutline,
  IoCheckmarkCircleOutline,
  IoCloudUploadOutline,
  IoDocumentOutline,
  IoDownloadOutline,
  IoReloadOutline,
} from "react-icons/io5";

/** What the server says a file would do, before anything is written. */
interface ImportPreview {
  total: number;
  valid: number;
  create: number;
  existing: number;
  invalid: number;
  errors: ImportError[];
  errorsTotal: number;
  ignoredHeaders: string[];
}

interface ImportDone {
  created: number;
  updated: number;
  skipped: number;
  invalid: number;
}

type Step =
  | { kind: "pick" }
  | { kind: "previewing" }
  | { kind: "preview"; preview: ImportPreview }
  | { kind: "importing"; preview: ImportPreview; done: number; total: number }
  | { kind: "done"; result: ImportDone };

/** Errors shown on screen; the full list is in the downloadable report. */
const SHOWN_ERRORS = 100;

/**
 * Importing a drilling sheet: pick a file, see what it would do, then do it
 * with a progress bar. Rows that are wrong are left out and handed back as a
 * CSV to fix and import again.
 */
export function DrillHoleImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const t = useTranslations("drilling.import");
  const tCommon = useTranslations("common");
  const format = useFormatter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [error, setError] = useState<string | null>(null);
  const busy = step.kind === "previewing" || step.kind === "importing";
  const n = (value: number) => format.number(value);

  function reset() {
    setFile(null);
    setUpdateExisting(false);
    setStep({ kind: "pick" });
    setError(null);
    if (input.current) input.current.value = "";
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  function formFor(chosen: File, apply: boolean) {
    const form = new FormData();
    form.set("file", chosen);
    form.set("apply", apply ? "1" : "0");
    form.set("updateExisting", updateExisting ? "1" : "0");
    return form;
  }

  async function preview(chosen: File) {
    setError(null);
    setStep({ kind: "previewing" });
    try {
      const response = await fetch(withBasePath("/api/drill-holes/import"), {
        method: "POST",
        body: formFor(chosen, false),
      });
      const result: ApiResult<ImportPreview> = await response.json();
      if (!result.success) {
        setError(result.error);
        setStep({ kind: "pick" });
        return;
      }
      setStep({ kind: "preview", preview: result.data });
    } catch {
      setError(tCommon("networkError"));
      setStep({ kind: "pick" });
    }
  }

  async function runImport(previewed: ImportPreview) {
    if (!file) return;
    setError(null);
    const writes = previewed.create + (updateExisting ? previewed.existing : 0);
    setStep({ kind: "importing", preview: previewed, done: 0, total: writes });
    try {
      const response = await fetch(withBasePath("/api/drill-holes/import"), {
        method: "POST",
        body: formFor(file, true),
      });
      // A refusal before the write starts is an ordinary JSON error.
      if (!response.ok || !response.body) {
        const result = await response.json().catch(() => null);
        setError(result?.error ?? tCommon("networkError"));
        setStep({ kind: "preview", preview: previewed });
        return;
      }

      // NDJSON: one line per chunk written, then the totals.
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished: ImportDone | null = null;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.phase === "write") {
            setStep({ kind: "importing", preview: previewed, done: event.done, total: event.total });
          } else if (event.phase === "done") {
            finished = event;
          } else if (event.phase === "error") {
            setError(event.message);
          }
        }
      }

      if (finished) {
        setStep({ kind: "done", result: finished });
        toast(t("doneToast", { created: finished.created, updated: finished.updated }));
      } else {
        setStep({ kind: "preview", preview: previewed });
      }
      // Whatever was written is on the list now, finished or not.
      onImported();
    } catch {
      setError(tCommon("networkError"));
      setStep({ kind: "preview", preview: previewed });
      onImported();
    }
  }

  /** Every error, as a CSV to fix the file by. Built here: the server already sent them. */
  function downloadErrors(errors: ImportError[]) {
    const lines = [
      csvLine([t("report.line"), "Hole ID", t("report.column"), t("report.error")]),
      ...errors.map((e) => {
        const column = DRILL_HOLE_COLUMNS.find((c) => c.key === e.field)?.header ?? "";
        return csvLine([e.line, e.holeId, column, e.message]);
      }),
    ];
    const blob = new Blob([CSV_BOM + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `drill-holes-import-errors-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function template(fileFormat: "xlsx" | "csv") {
    const failure = await downloadFromApi(
      `/api/drill-holes/template?format=${fileFormat}`,
      `drill-holes-template.${fileFormat}`
    );
    if (failure) setError(failure);
  }

  const shownPreview = step.kind === "preview" || step.kind === "importing" ? step.preview : null;

  return (
    <Dialog open={open} onOpenChange={(value) => (!value ? close() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        {step.kind === "done" ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <IoCheckmarkCircleOutline className="size-10 text-primary" />
            <p className="text-base font-medium">{t("doneTitle")}</p>
            <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label={t("summary.created")} value={n(step.result.created)} />
              <Stat label={t("summary.updated")} value={n(step.result.updated)} />
              <Stat label={t("summary.skipped")} value={n(step.result.skipped)} />
              <Stat label={t("summary.invalid")} value={n(step.result.invalid)} tone={step.result.invalid ? "error" : undefined} />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* 1. The file. */}
            <div className="flex flex-col gap-2 rounded-lg border border-dashed p-4">
              <input
                ref={input}
                type="file"
                accept=".xlsx,.csv"
                className="sr-only"
                id="drill-import-file"
                disabled={busy}
                onChange={(event) => {
                  const chosen = event.target.files?.[0] ?? null;
                  setFile(chosen);
                  if (chosen) void preview(chosen);
                }}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  disabled={busy}
                  onClick={() => input.current?.click()}
                >
                  <IoCloudUploadOutline className="size-4" />
                  {file ? t("chooseAnother") : t("choose")}
                </Button>
                {file ? (
                  <span className="flex min-w-0 items-center gap-1.5 text-sm">
                    <IoDocumentOutline className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{file.name}</span>
                    <span className="shrink-0 text-muted-foreground">
                      ({format.number(file.size / 1024 / 1024, { maximumFractionDigits: 1 })} MB)
                    </span>
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("columnsHint", { columns: DRILL_HOLE_COLUMNS.map((c) => c.header).join(", ") })}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="text-muted-foreground">{t("template")}:</span>
                <button type="button" className="font-medium text-primary hover:underline" onClick={() => template("xlsx")}>
                  Excel (.xlsx)
                </button>
                <button type="button" className="font-medium text-primary hover:underline" onClick={() => template("csv")}>
                  CSV
                </button>
              </div>
            </div>

            {step.kind === "previewing" ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <IoReloadOutline className="size-4 animate-spin" />
                {t("reading")}
              </p>
            ) : null}

            {/* 2. What it would do. */}
            {shownPreview ? (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label={t("summary.rows")} value={n(shownPreview.total)} />
                  <Stat label={t("summary.new")} value={n(shownPreview.create)} />
                  <Stat
                    label={updateExisting ? t("summary.toUpdate") : t("summary.toSkip")}
                    value={n(shownPreview.existing)}
                  />
                  <Stat label={t("summary.invalid")} value={n(shownPreview.invalid)} tone={shownPreview.invalid ? "error" : undefined} />
                </div>

                {shownPreview.existing > 0 ? (
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-primary"
                      checked={updateExisting}
                      disabled={busy}
                      onChange={(event) => setUpdateExisting(event.target.checked)}
                    />
                    <span className="flex flex-col">
                      <span className="font-medium">{t("updateExisting", { count: shownPreview.existing })}</span>
                      <span className="text-xs text-muted-foreground">{t("updateExistingHint")}</span>
                    </span>
                  </label>
                ) : null}

                {shownPreview.ignoredHeaders.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {t("ignoredHeaders", { headers: shownPreview.ignoredHeaders.join(", ") })}
                  </p>
                ) : null}

                {shownPreview.errors.length > 0 ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                        <IoAlertCircleOutline className="size-4" />
                        {t("errorsTitle", { count: shownPreview.invalid })}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => downloadErrors(shownPreview.errors)}
                      >
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
                          {shownPreview.errors.slice(0, SHOWN_ERRORS).map((e, index) => (
                            <TableRow key={`${e.line}-${index}`}>
                              <TableCell className="font-mono text-xs">{e.line}</TableCell>
                              <TableCell className="font-mono text-xs">{e.holeId ?? tCommon("empty")}</TableCell>
                              <TableCell className="text-xs">{e.message}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {shownPreview.errorsTotal > SHOWN_ERRORS ? (
                      <p className="text-xs text-muted-foreground">
                        {t("moreErrors", { shown: SHOWN_ERRORS, total: shownPreview.errorsTotal })}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}

            {/* 3. The write. */}
            {step.kind === "importing" ? (
              <div className="flex flex-col gap-1.5" role="status">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-300"
                    style={{ width: `${step.total ? Math.round((step.done / step.total) * 100) : 0}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("progress", { done: n(step.done), total: n(step.total) })}
                </p>
              </div>
            ) : null}
          </div>
        )}

        <InlineNotice tone="error">{error}</InlineNotice>

        <DialogFooter>
          {step.kind === "done" ? (
            <>
              <Button type="button" variant="outline" onClick={reset}>
                {t("another")}
              </Button>
              <Button type="button" onClick={close}>
                {tCommon("close")}
              </Button>
            </>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={close} disabled={busy}>
                {tCommon("cancel")}
              </Button>
              <Button
                type="button"
                className="gap-2"
                disabled={
                  busy ||
                  !shownPreview ||
                  shownPreview.create + (updateExisting ? shownPreview.existing : 0) === 0
                }
                onClick={() => shownPreview && runImport(shownPreview)}
              >
                {step.kind === "importing" ? <IoReloadOutline className="size-4 animate-spin" /> : null}
                {shownPreview
                  ? t("run", { count: n(shownPreview.create + (updateExisting ? shownPreview.existing : 0)) })
                  : t("runEmpty")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "error" }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-2 text-left">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={tone === "error" ? "text-lg font-semibold text-destructive" : "text-lg font-semibold"}>{value}</p>
    </div>
  );
}
