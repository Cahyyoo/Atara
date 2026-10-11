"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InlineNotice } from "@/components/ui/inline-notice";
import { toast } from "@/components/ui/toast";
import { ASSAY_FIELDS } from "@/lib/assay";
import { IMPORT_EXAMPLE_COLUMNS } from "@/lib/lab-record-import";
import { cn } from "@/lib/utils";
import type { ApiResult, ImportPreviewDTO, ImportPreviewRow } from "@/types";
import {
  IoCheckmarkCircle,
  IoClipboardOutline,
  IoCopyOutline,
  IoDocumentAttachOutline,
  IoDownloadOutline,
  IoReloadOutline,
  IoSaveOutline,
  IoWarningOutline,
} from "react-icons/io5";
import { withBasePath } from "@/lib/base-path";

/** The counters carry the totals; the table is there to spot-check. */
const PREVIEW_ROW_LIMIT = 200;

/** Long enough to let a paste settle, short enough that the preview feels immediate. */
const PREVIEW_DELAY_MS = 400;

/** Problems first: they are what somebody has to act on before saving. */
const STATUS_ORDER: Record<ImportPreviewRow["status"], number> = {
  invalid: 0,
  unknown: 1,
  update: 2,
  create: 3,
  unchanged: 4,
};

function labelFor(key: string): string {
  return ASSAY_FIELDS.find((field) => field.key === key)?.shortLabel ?? key;
}

function formatValue(value: number | string | null): string {
  return value === null || value === "" ? "—" : String(value);
}

/**
 * The heading row a sheet needs, in the order the instrument reports.
 *
 * All of them. This used to list the five columns the database table shows,
 * and those are two different questions: five is a sensible default for a
 * table somebody reads, and it was being shown here as though it were the
 * format this screen accepts. It never was -- the importer maps headings
 * through the same fieldForHeader the paste dialog uses, so it has always
 * taken every element plus the instrument's own three columns.
 *
 * An example that under-describes what is accepted costs somebody the work of
 * cutting columns out of a sheet that would have imported untouched.
 */
const EXAMPLE_HEADER = IMPORT_EXAMPLE_COLUMNS.join("\t");

/** Whether the keystroke that is about to paste belongs to some other box. */
function pastingElsewhere(target: EventTarget | null, own: HTMLElement | null): boolean {
  if (!(target instanceof HTMLElement) || target === own) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Entering results by pasting them out of Excel -- the way most results
 * arrive, because the instrument writes them into a sheet.
 *
 * Matched on the server against every sample, by Lab Code or Sample ID. The
 * old dialog matched only the twenty-five rows on screen, so a sheet covering
 * two shifts came back half "unknown". A saved CSV goes through the same box:
 * one way in, one set of rules.
 *
 * Nothing is written until the preview has been seen and Save pressed.
 */
export function PasteImport() {
  const t = useTranslations("assay.paste");
  const tCommon = useTranslations("common");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<ImportPreviewDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  /** Set after a save, until somebody pastes again. */
  const [done, setDone] = useState<number | null>(null);
  /** Shown before saving a sheet that would replace results already there. */
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  /** Only the answer to the latest paste counts; an older one arriving late is dropped. */
  const requestId = useRef(0);

  const errorFor = useCallback(
    (code: string | undefined, fallback: string) => {
      switch (code) {
        case "import-empty":
          return t("errors.empty");
        case "import-noKey":
          return t("errors.noKey");
        case "import-noFields":
          return t("errors.noFields");
        default:
          return fallback;
      }
    },
    [t]
  );

  const send = useCallback(
    async (csv: string, apply: boolean, overwrite = false) => {
      const id = ++requestId.current;
      const response = await fetch(withBasePath("/api/lab-records/import"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, apply, overwrite, reason: t("auditReason") }),
      });
      const body: ApiResult<ImportPreviewDTO> & { code?: string } = await response.json();
      return { id, body };
    },
    [t]
  );

  // The preview follows the box: paste, and it is checked a moment later.
  useEffect(() => {
    if (text.trim() === "") return;
    const timer = setTimeout(async () => {
      setIsChecking(true);
      try {
        const { id, body } = await send(text, false);
        if (id !== requestId.current) return;
        if (!body.success) {
          setPreview(null);
          setError(errorFor(body.code, body.error));
          return;
        }
        setError(null);
        setPreview(body.data);
      } catch {
        setError(tCommon("networkError"));
      } finally {
        setIsChecking(false);
      }
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, send, errorFor, tCommon]);

  function replaceText(next: string) {
    setText(next);
    setDone(null);
    setConfirmOverwrite(false);
    if (next.trim() === "") {
      // A check still in flight belongs to text that is gone.
      requestId.current += 1;
      setPreview(null);
      setError(null);
    }
  }

  /**
   * Ctrl+V anywhere on the page lands in the box. Pasting is what this page is
   * for, and having to find and click the box first is one step too many --
   * unless the paste is meant for some other field, which keeps it.
   */
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (pastingElsewhere(event.target, boxRef.current)) return;
      if (event.target === boxRef.current) return;
      const pasted = event.clipboardData?.getData("text/plain");
      if (!pasted) return;
      event.preventDefault();
      setText(pasted);
      setDone(null);
      boxRef.current?.focus();
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  /**
   * A spreadsheet is read on the server; anything else is already text.
   *
   * The workbook comes back as the same tab-separated rows a paste would be
   * and lands in the same box, so the preview, the matching and the save all
   * stay on one path -- and whoever uploaded it can see what was read out
   * before anything is written.
   */
  async function readFile(file: File | undefined) {
    if (!file) return;

    if (!/\.xlsx$/i.test(file.name)) {
      replaceText(await file.text());
      return;
    }

    setError(null);
    setIsChecking(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(withBasePath("/api/lab-records/import/sheet"), { method: "POST", body });
      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error ?? tCommon("networkError"));
        return;
      }
      replaceText(result.data.text);
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setIsChecking(false);
    }
  }

  /** The empty sheet, in the shape this screen reads back. */
  function downloadTemplate() {
    window.location.href = withBasePath("/api/lab-records/template?shape=keyed");
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void readFile(event.dataTransfer.files?.[0]);
  }

  async function copyHeader() {
    try {
      await navigator.clipboard.writeText(EXAMPLE_HEADER);
      toast(t("headerCopied"));
    } catch {
      setError(t("headerCopyFailed", { header: EXAMPLE_HEADER.replaceAll("\t", ", ") }));
    }
  }

  const summary = preview?.summary;
  /** Rows a save writes: updates, and new sub-samples. */
  const writes = summary ? summary.update + (summary.create ?? 0) : 0;
  const canSave = Boolean(summary && writes > 0 && summary.invalid === 0 && !isChecking);

  const save = useCallback(
    async (overwrite = false) => {
      if (!canSave || isSaving) return;
      // Results already there are replaced only once that has been confirmed.
      if (!overwrite && (summary?.overwrite ?? 0) > 0) {
        setConfirmOverwrite(true);
        return;
      }
      setIsSaving(true);
      setError(null);
      try {
        const { body } = await send(text, true, overwrite);
        if (!body.success) {
          if (body.code === "overwrite") {
            setConfirmOverwrite(true);
            return;
          }
          setError(errorFor(body.code, body.error));
          return;
        }
        setDone(body.data.summary.update + (body.data.summary.create ?? 0));
        setConfirmOverwrite(false);
        setText("");
        setPreview(null);
      } catch {
        setError(tCommon("networkError"));
      } finally {
        setIsSaving(false);
      }
    },
    [canSave, isSaving, summary, send, text, errorFor, tCommon]
  );

  // Ctrl+S saves here too, as on the manual grid.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  const statusLabel: Record<ImportPreviewRow["status"], string> = {
    update: t("status.update"),
    create: t("status.create"),
    unchanged: t("status.unchanged"),
    unknown: t("status.unknown"),
    invalid: t("status.invalid"),
  };

  const rows = useMemo(() => {
    const all = [...(preview?.rows ?? [])].sort(
      (a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.line - b.line
    );
    return problemsOnly ? all.filter((row) => row.status === "invalid" || row.status === "unknown") : all;
  }, [preview, problemsOnly]);
  const problems = summary ? summary.invalid + summary.unknown : 0;

  if (done !== null) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border bg-background px-6 py-10 text-center">
        <IoCheckmarkCircle aria-hidden className="size-10 text-emerald-600" />
        <p className="text-lg font-medium">{t("doneTitle", { count: done })}</p>
        <p className="max-w-md text-sm text-muted-foreground">{t("doneBody")}</p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Button
            className="gap-2"
            onClick={() => {
              setDone(null);
              requestAnimationFrame(() => boxRef.current?.focus());
            }}
          >
            <IoClipboardOutline className="size-4" />
            {t("pasteAnother")}
          </Button>
          <Link href="/database" className={buttonVariants({ variant: "outline" })}>
            {t("openDatabase")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* What to do, in the order it is done. Numbered because the first step
          happens in another program, and it is easy to start at the second.
          Gone once something is pasted: by then the steps are done, and the
          room is the preview's. */}
      {text.trim() === "" ? (
      <ol className="grid gap-2 text-sm sm:grid-cols-3">
        {[t("step1"), t("step2"), t("step3")].map((step, index) => (
          <li key={index} className="flex gap-2.5 rounded-xl bg-muted/50 px-3 py-2.5">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {index + 1}
            </span>
            <span className="text-muted-foreground">{step}</span>
          </li>
        ))}
      </ol>
      ) : null}

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "relative rounded-2xl border-2 border-dashed bg-background transition-colors",
          isDragging ? "border-primary bg-primary/5" : "border-border"
        )}
      >
        <Textarea
          ref={boxRef}
          aria-label={t("boxLabel")}
          placeholder={t("placeholder")}
          wrap="off"
          autoFocus
          // Smaller once there is a preview to read under it: the pasted text
          // has done its job, and the rows being checked matter more.
          className={cn(
            "resize-y overflow-auto border-0 bg-transparent font-mono text-xs shadow-none focus-visible:ring-0",
            preview ? "h-24 min-h-24" : "h-40 min-h-40"
          )}
          value={text}
          onChange={(event) => replaceText(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-dashed px-3 py-2 text-xs text-muted-foreground">
          <label className="inline-flex cursor-pointer items-center gap-1.5 hover:text-foreground">
            <IoDocumentAttachOutline className="size-3.5" />
            {t("chooseFile")}
            <input
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,text/csv,text/plain"
              className="sr-only"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                void readFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          <button type="button" onClick={copyHeader} className="inline-flex items-center gap-1.5 hover:text-foreground">
            <IoCopyOutline className="size-3.5" />
            {t("copyHeader")}
          </button>
          {/* The whole sheet rather than just its first row, for anyone who
              would rather start from a file than paste a heading in. */}
          <button
            type="button"
            onClick={downloadTemplate}
            className="inline-flex items-center gap-1.5 hover:text-foreground"
          >
            <IoDownloadOutline className="size-3.5" />
            {t("downloadTemplate")}
          </button>
          <span className="hidden sm:inline">{t("headerHint")}</span>
          {isChecking ? (
            <span className="ml-auto inline-flex items-center gap-1.5">
              <IoReloadOutline className="size-3.5 animate-spin" />
              {t("checking")}
            </span>
          ) : null}
        </div>
      </div>

      <InlineNotice tone="error">{error}</InlineNotice>

      {summary ? (
        <div className="flex flex-col gap-3">
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
                  onChange={(event) => setProblemsOnly(event.target.checked)}
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
                      row.status === "unknown" && "bg-amber-50/60 dark:bg-amber-500/5"
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
                      {row.subCode ? (
                        <span className="block text-xs text-muted-foreground">{t("subOf", { code: row.subCode })}</span>
                      ) : null}
                      {row.overwrites?.length ? (
                        <span className="block text-xs text-amber-700 dark:text-amber-400">
                          {t("overwrites", { count: row.overwrites.length })}
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

          {/* Pinned while there is something to decide, so Save is never a
              scroll away from the preview it confirms. */}
          <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-2xl border bg-background/95 px-4 py-3 shadow-raised backdrop-blur-sm">
            {confirmOverwrite ? (
              <span role="alert" className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
                <IoWarningOutline className="size-4 shrink-0" />
                {t("overwriteConfirm", { count: summary.overwrite ?? 0 })}
              </span>
            ) : summary.invalid > 0 ? (
              <span className="flex items-center gap-2 text-sm text-destructive">
                <IoWarningOutline className="size-4 shrink-0" />
                {t("fixInvalid", { count: summary.invalid })}
              </span>
            ) : writes === 0 ? (
              <span className="text-sm text-muted-foreground">{t("nothingToSave")}</span>
            ) : (
              <span className="text-sm">
                <span className="font-medium">{t("ready", { count: writes })}</span>
                {summary.unknown > 0 ? (
                  <span className="text-muted-foreground"> · {t("skipped", { count: summary.unknown })}</span>
                ) : null}
              </span>
            )}
            {confirmOverwrite ? (
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" disabled={isSaving} onClick={() => setConfirmOverwrite(false)}>
                  {tCommon("cancel")}
                </Button>
                <Button className="gap-2" disabled={isSaving} onClick={() => void save(true)}>
                  {isSaving ? <IoReloadOutline className="size-4 animate-spin" /> : null}
                  {t("overwriteAndSave")}
                </Button>
              </div>
            ) : (
              <div className="ml-auto flex gap-2">
                <Button variant="ghost" disabled={isSaving} onClick={() => replaceText("")}>
                  {t("clear")}
                </Button>
                <Button className="gap-2" disabled={!canSave || isSaving} onClick={() => void save()}>
                  {isSaving ? <IoReloadOutline className="size-4 animate-spin" /> : <IoSaveOutline className="size-4" />}
                  {t("save", { count: writes })}
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
