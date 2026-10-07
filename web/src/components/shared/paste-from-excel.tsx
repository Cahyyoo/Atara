"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ASSAY_FIELDS } from "@/lib/assay";
import { detectDelimiter, parseCsv } from "@/lib/csv-parse";
import {
  mapPastedRows,
  pastedKeys,
  type PasteChange,
  type PasteRow,
  type PasteTarget,
} from "@/lib/paste-map";
import type { Overwrite } from "@/lib/overwrite";
import { formatWitaDateTime } from "@/lib/shift-date";
import { cn } from "@/lib/utils";
import type { ApiResult, LabRecordListItemDTO } from "@/types";
import {
  IoClipboardOutline,
  IoDownloadOutline,
  IoReloadOutline,
  IoWarningOutline,
} from "react-icons/io5";
import { InlineNotice } from "@/components/ui/inline-notice";

/** The counters carry the totals; the table is there to spot-check. */
const PREVIEW_ROW_LIMIT = 200;

/** One save is one transaction, matching the limit the bulk endpoint enforces. */
const MAX_ROWS = 200;

/** The most keys one look-up takes, matching the resolve endpoint. */
const MAX_KEYS = 500;

/** A pause in typing long enough to look the pasted Sample IDs up. */
const RESOLVE_DEBOUNCE_MS = 300;

function labelFor(key: string): string {
  return ASSAY_FIELDS.find((field) => field.key === key)?.shortLabel ?? key;
}

/**
 * The stored instant is an ISO string, but an operator reads a wall clock —
 * the lab's own, which is WITA, not whatever this browser is set to. Showing it
 * that way is what makes a date read the wrong way round visible before it is
 * saved.
 */
function formatChange(key: string, value: number | string | null): string {
  if (value === null || value === "") return "—";
  if (key !== "measurementFinished") return String(value);

  return formatWitaDateTime(String(value)) ?? String(value);
}

/**
 * Messages the mapper sends as a key rather than as prose, so they can be
 * translated. Anything else is text meant to be read as written.
 */
const REASON_KEYS = new Set(["noMatch", "notFound", "ambiguous", "noRow", "duplicate", "futureDate"]);

/** What the mapper needs of a record: how to recognise it, and what it holds now. */
function toTarget(record: Omit<LabRecordListItemDTO, "sample" | "subs">): PasteTarget {
  const values: PasteTarget["values"] = {
    measurementMethod: record.measurementMethod,
    solutionId: record.solutionId,
    measurementFinished: record.measurementFinished,
    remarks: record.remarks,
  };
  for (const field of ASSAY_FIELDS) {
    values[field.key] = record[field.key];
  }

  return {
    id: record.id,
    labCode: record.labCode,
    sampleIdent: record.sampleIdent,
    parentId: record.parentId,
    sackCount: record.sackCount,
    values,
  };
}

type Resolution =
  | { key: string; status: "found"; record: LabRecordListItemDTO }
  | { key: string; status: "newSub"; parent: LabRecordListItemDTO; code: string }
  | { key: string; status: "ambiguous" }
  | { key: string; status: "unknown" };

/** Results already there that a save would replace, per record. */
interface OverwriteEntry {
  targetId: string | null;
  label: string;
  fields: Overwrite[];
}

interface PasteFromExcelProps {
  /**
   * The rows the operator ticked; the paste is applied to these and no others.
   * Empty: nothing was ticked, and the pasted Sample IDs find their own
   * records across the whole database.
   */
  records: LabRecordListItemDTO[];
  open: boolean;
  onClose: () => void;
  onApplied: () => void;
  /**
   * When given, the dialog fills instead of saving: the mapped rows are handed
   * back and the caller writes them into its own inputs, so nothing reaches the
   * server until that form is saved.
   *
   * The assay grid uses this — its whole shape is type, check, save, and a paste
   * that wrote straight through would skip the checking.
   */
  onFill?: (rows: PasteRow[]) => void;
}

export function PasteFromExcel({
  records,
  open,
  onClose,
  onApplied,
  onFill,
}: PasteFromExcelProps) {
  const t = useTranslations("database.paste");
  const tCommon = useTranslations("common");

  const [text, setText] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Set while the operator decides about results that would be replaced. */
  const [confirm, setConfirm] = useState<OverwriteEntry[] | null>(null);

  /** Nothing ticked: the sheet names its own records. */
  const free = records.length === 0 && !onFill;
  const ticked = useMemo(() => records.map(toTarget), [records]);

  const parsed = useMemo(() => (text.trim() === "" ? null : parseCsv(text, detectDelimiter(text))), [text]);
  const keys = useMemo(() => (free && parsed ? pastedKeys(parsed) : null), [free, parsed]);
  const lookupKey = keys ? keys.keys.join("\n") : "";

  // The pasted Sample IDs, looked up across every record once typing pauses.
  const [lookup, setLookup] = useState<{
    key: string;
    targets: PasteTarget[] | null;
    /** Sample IDs that fit more than one sample once the sack count is left out. */
    ambiguous: string[];
    error: string | null;
  }>({ key: "", targets: null, ambiguous: [], error: null });
  useEffect(() => {
    if (!free || !keys || keys.keys.length === 0 || keys.keys.length > MAX_KEYS) return;
    const controller = new AbortController();
    const key = lookupKey;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/lab-records/resolve", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: keys.keys }),
          signal: controller.signal,
        });
        const body: ApiResult<{ results: Resolution[] }> = await response.json();
        if (!body.success) {
          setLookup({ key, targets: null, ambiguous: [], error: body.error });
          return;
        }
        // The records found, and the parents of the sub-samples still to make.
        const byId = new Map<string, PasteTarget>();
        for (const entry of body.data.results) {
          if (entry.status === "found") byId.set(entry.record.id, toTarget(entry.record));
          if (entry.status === "newSub") byId.set(entry.parent.id, toTarget(entry.parent));
        }
        const ambiguous = body.data.results.flatMap((entry) => (entry.status === "ambiguous" ? [entry.key] : []));
        setLookup({ key, targets: [...byId.values()], ambiguous, error: null });
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setLookup({ key, targets: null, ambiguous: [], error: tCommon("networkError") });
      }
    }, RESOLVE_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [free, keys, lookupKey, tCommon]);

  const freeTargets = lookup.key === lookupKey ? lookup.targets : null;
  const freeProblem: "needKey" | "tooManyKeys" | null =
    free && parsed ? (!keys ? "needKey" : keys.keys.length > MAX_KEYS ? "tooManyKeys" : null) : null;
  const resolving = free && parsed !== null && freeProblem === null && freeTargets === null && !lookup.error;

  // Re-read on every keystroke: the block is at most a couple of hundred rows,
  // and a preview that lags behind the box is worse than one that is recomputed.
  const result = useMemo(() => {
    if (!parsed) return null;
    if (free) {
      return freeTargets
        ? mapPastedRows(parsed, freeTargets, new Date(), { scope: "all", ambiguous: lookup.ambiguous })
        : null;
    }
    // Filling the grid writes into rows that exist: no sub-sample is made there.
    return mapPastedRows(parsed, ticked, new Date(), { subs: !onFill });
  }, [parsed, free, freeTargets, lookup.ambiguous, ticked, onFill]);

  const toSave = result?.rows.filter((row) => row.status === "update" || row.status === "create") ?? [];

  const tooMany = toSave.length > MAX_ROWS;
  const canApply =
    result !== null &&
    result.blocker === null &&
    result.summary.invalid === 0 &&
    // An unknown row blocks the whole paste, ticked or not: a sheet that
    // half-lands is harder to put right than one that does not land at all.
    result.summary.unknown === 0 &&
    toSave.length > 0 &&
    !tooMany;

  /** What a save would replace, as the rows found it. */
  const localOverwrites: OverwriteEntry[] = toSave.flatMap((row) =>
    row.overwrites?.length ? [{ targetId: row.targetId, label: row.label, fields: row.overwrites }] : []
  );

  function payload(rows: PasteRow[], keep: OverwriteEntry[] | null) {
    return rows.flatMap((row) => {
      // "Save without replacing": each record keeps what it already holds.
      const skip = new Set(keep?.find((entry) => entry.targetId === row.targetId)?.fields.map((field) => field.field));
      const values = Object.fromEntries(Object.entries(row.values).filter(([key]) => !skip.has(key)));
      if (Object.keys(values).length === 0) return [];
      return [row.sub ? { parentId: row.sub.parentId, subCode: row.sub.code, ...values } : { id: row.targetId, ...values }];
    });
  }

  async function save(mode: "overwrite" | "keep" | "plain") {
    setIsBusy(true);
    setError(null);
    const keep = mode === "keep" ? (confirm ?? localOverwrites) : null;
    const records = payload(toSave, keep);
    if (records.length === 0) {
      setIsBusy(false);
      setConfirm(null);
      setError(t("nothingLeft"));
      return;
    }

    try {
      const response = await fetch("/api/lab-records/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records, reason: t("auditReason"), overwrite: mode === "overwrite" }),
      });
      const body: ApiResult<{ updated: number }> = await response.json();

      if (!body.success) {
        // Someone filled these in since the preview was read: ask again, with
        // what the server found.
        if (body.code === "overwrite") {
          const details = body.details as {
            overwrites?: { id: string; labCode: string; sampleIdent: string | null; fields: Overwrite[] }[];
          };
          setConfirm(
            (details.overwrites ?? []).map((entry) => ({
              targetId: entry.id,
              label: entry.sampleIdent ?? entry.labCode,
              fields: entry.fields,
            }))
          );
          return;
        }
        setError(body.error);
        return;
      }

      setText("");
      setConfirm(null);
      onApplied();
    } catch {
      setError(tCommon("networkError"));
    } finally {
      setIsBusy(false);
    }
  }

  function apply() {
    // Filling is the caller's business and cannot fail on the network; the
    // grid asks about replaced results itself, when it is saved.
    if (onFill) {
      onFill(toSave);
      setText("");
      onClose();
      return;
    }
    if (localOverwrites.length > 0) {
      setConfirm(localOverwrites);
      return;
    }
    void save("plain");
  }

  function close() {
    setText("");
    setError(null);
    setConfirm(null);
    onClose();
  }

  const replacedCount = (confirm ?? []).reduce((total, entry) => total + entry.fields.length, 0);

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {free ? t("descriptionAll") : t("description", { count: records.length })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
          <Textarea
            aria-label={t("boxLabel")}
            placeholder={free ? t("placeholderAll") : t("placeholder")}
            // Ready for Ctrl+V the moment it opens: pasting is the only thing
            // this dialog is for.
            autoFocus
            wrap="off"
            className="h-28 overflow-auto font-mono text-xs"
            value={text}
            disabled={confirm !== null}
            onChange={(event) => {
              setText(event.target.value);
              setConfirm(null);
            }}
          />

          <InlineNotice tone="error">{error ?? lookup.error}</InlineNotice>

          {freeProblem ? (
            <p className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <IoWarningOutline className="size-4 shrink-0" />
              {freeProblem === "needKey" ? t("needKey") : t("tooManyKeys", { max: MAX_KEYS })}
            </p>
          ) : resolving ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <IoReloadOutline className="size-4 animate-spin" />
              {t("resolving")}
            </p>
          ) : null}

          {confirm ? (
            // Results already there are replaced only on purpose.
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-500/40 dark:bg-amber-500/10"
            >
              <p className="flex items-center gap-2 font-medium text-amber-800 dark:text-amber-300">
                <IoWarningOutline className="size-4 shrink-0" />
                {t("overwriteTitle", { count: replacedCount, records: confirm.length })}
              </p>
              <p className="text-muted-foreground">{t("overwriteBody")}</p>
              <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto font-mono text-xs">
                {confirm.map((entry) => (
                  <li key={`${entry.targetId}-${entry.label}`} className="flex flex-wrap gap-x-3">
                    <span className="font-semibold">{entry.label}</span>
                    {entry.fields.map((field) => (
                      <span key={field.field} className="whitespace-nowrap">
                        {labelFor(field.field)} {formatChange(field.field, field.from)} →{" "}
                        {formatChange(field.field, field.to)}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {result && !confirm ? (
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

              {onFill ? (
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
                  {t("tooMany", { count: toSave.length, max: MAX_ROWS })}
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
          ) : null}
        </div>

        <DialogFooter>
          {confirm ? (
            <>
              <Button variant="outline" className="sm:mr-auto" onClick={() => setConfirm(null)} disabled={isBusy}>
                {t("backToPreview")}
              </Button>
              <Button variant="outline" onClick={() => void save("keep")} disabled={isBusy}>
                {t("saveWithoutOverwrite")}
              </Button>
              <Button className="gap-2" onClick={() => void save("overwrite")} disabled={isBusy}>
                {isBusy ? <IoReloadOutline className="size-4 animate-spin" /> : null}
                {t("overwriteAndSave")}
              </Button>
            </>
          ) : (
            <>
              {/*
                The instrument's own layout, with no sample named in it, for
                ticked rows: they are matched in order, so nothing in the sheet
                has to identify them. With nothing ticked, the sheet has to name
                its samples, so the template carries the key column.
              */}
              <Button
                variant="ghost"
                className="gap-2 sm:mr-auto"
                onClick={() => {
                  window.location.href = free
                    ? "/api/lab-records/template?shape=keyed"
                    : "/api/lab-records/template?shape=instrument";
                }}
              >
                <IoDownloadOutline className="size-4" />
                {t("downloadTemplate")}
              </Button>
              <Button variant="outline" onClick={close} disabled={isBusy}>
                {tCommon("cancel")}
              </Button>
              <Button className="gap-2" disabled={!canApply || isBusy} onClick={apply}>
                {isBusy ? (
                  <IoReloadOutline className="size-4 animate-spin" />
                ) : (
                  <IoClipboardOutline className="size-4" />
                )}
                {onFill ? t("fill", { count: toSave.length }) : t("apply", { count: toSave.length })}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
