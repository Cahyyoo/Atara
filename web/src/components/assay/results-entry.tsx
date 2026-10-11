"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InlineNotice } from "@/components/ui/inline-notice";
import { toast } from "@/components/ui/toast";
import { ResultsForm } from "@/components/assay/results-form";
import { usePersistedColumns } from "@/hooks/use-persisted-columns";
import {
  ResultsGrid,
  cellId,
  isRowDirty,
  normaliseNumber,
  rowProblems,
  toRowValues,
  type CellField,
  type InstrumentColumn,
  type RowValues,
} from "@/components/assay/results-grid";
import {
  ASSAY_ENTRY_FIELDS,
  ASSAY_FIELDS,
  INSTRUMENT_FIELDS,
  type AssayField,
  type InstrumentField,
} from "@/lib/assay";
import { parseShiftDateInput, parseWitaInput, toWitaInputValue } from "@/lib/shift-date";
import type { PasteRow } from "@/lib/paste-map";
import { findOverwrites, type Overwrite } from "@/lib/overwrite";
import type { ApiResult, LabRecordListItemDTO } from "@/types";
import { IoArrowBack, IoClipboardOutline, IoOptionsOutline, IoReloadOutline, IoSaveOutline } from "react-icons/io5";
import { withBasePath } from "@/lib/base-path";

/** Loaded the first time it is opened; most rows are typed or pasted from the list. */
const PasteFromExcel = dynamic(
  () => import("@/components/shared/paste-from-excel").then((m) => m.PasteFromExcel),
  { ssr: false }
);

/**
 * How many samples still read better as a form than as a grid.
 *
 * Three cards fit a screen at once. Past that the stack grows longer than the
 * sideways scroll it was saving, and comparing a column down the rows -- what
 * a table is for -- starts to be worth more.
 */
const FORM_UP_TO = 3;

type Column = AssayField | InstrumentField | "remarks";

/** One row of the grid as the bulk save takes it. */
function toPayload(id: string, row: RowValues): Record<string, string | number | null> {
  const record: Record<string, string | number | null> = { id };
  for (const field of ASSAY_FIELDS) {
    const raw = normaliseNumber(row[field.key]);
    record[field.key] = raw === "" ? null : Number(raw);
  }
  for (const field of INSTRUMENT_FIELDS) {
    const raw = row[field.key].trim();
    // An empty box means "not recorded" and has to reach the server as
    // null; sending "" would store an empty string as a measurement.
    record[field.key] =
      raw === "" ? null : field.kind === "datetime" ? (parseWitaInput(raw)?.toISOString() ?? null) : raw;
  }
  record.remarks = row.remarks.trim() || null;
  return record;
}

/** Results already there that a save would replace, per record. */
interface Replaced {
  id: string;
  label: string;
  fields: Overwrite[];
}
const ALL_COLUMNS: Column[] = [
  ...ASSAY_FIELDS.map((field) => field.key),
  ...INSTRUMENT_FIELDS.map((field) => field.key),
  "remarks",
];

/**
 * Typing results for the samples ticked on the list, and nothing else.
 *
 * The grid holds exactly the rows it was handed, so it never loads anything of
 * its own. Nothing is saved until Save, and going back to the list with edits
 * on screen stops and asks -- as does leaving the page.
 */
export function ResultsEntry({
  records,
  onDone,
}: {
  records: LabRecordListItemDTO[];
  /** Back to the list; `changed` says whether anything was saved on the way. */
  onDone: (changed: boolean) => void;
}) {
  const t = useTranslations("assay");
  const tDatabase = useTranslations("database");
  const tCommon = useTranslations("common");
  const format = useFormatter();

  const initial = useMemo(
    () => Object.fromEntries(records.map((record) => [record.id, toRowValues(record)])),
    [records]
  );
  const [original, setOriginal] = useState<Record<string, RowValues>>(initial);
  const [values, setValues] = useState<Record<string, RowValues>>(() => structuredClone(initial));
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [isPasting, setIsPasting] = useState(false);
  const [pasteMounted, setPasteMounted] = useState(false);
  /** Set while the analyst decides about results a save would replace. */
  const [replacing, setReplacing] = useState<Replaced[] | null>(null);

  /**
   * Opens on every assay column, and the key says v2 for that reason.
   *
   * The default used to be the five the database table shows, which is right
   * for reading and wrong here: thirteen of the eighteen were missing from the
   * one screen built for filling them in. Changing the default alone would
   * have reached nobody who had already been to this page -- a remembered
   * choice wins over a fallback, and every remembered choice was made under
   * the old one. So the key moves, the choice is forgotten once, and anyone
   * who wants fewer columns can narrow them again from the picker.
   */
  const [visible, setVisible] = usePersistedColumns<Column>(
    "atara.columns.assay.v2",
    ASSAY_ENTRY_FIELDS,
    ALL_COLUMNS
  );
  const columns = useMemo(() => ASSAY_FIELDS.filter((field) => visible.includes(field.key)), [visible]);
  const instrumentColumns = useMemo<InstrumentColumn[]>(
    () =>
      INSTRUMENT_FIELDS.filter((field) => visible.includes(field.key)).map((field) => ({
        ...field,
        label: tDatabase(field.key),
      })),
    [visible, tDatabase]
  );
  const showRemarks = visible.includes("remarks");

  const dirtyIds = useMemo(
    () =>
      records
        .map((record) => record.id)
        .filter((id) => original[id] && values[id] && isRowDirty(original[id], values[id])),
    [records, original, values]
  );
  const invalid = useMemo(
    () =>
      records.flatMap((record, rowIndex) =>
        values[record.id] ? rowProblems(values[record.id]).map((problem) => ({ ...problem, rowIndex })) : []
      ),
    [records, values]
  );
  const isDirty = dirtyIds.length > 0;

  // Leaving the page -- reload, closing the tab, a link elsewhere -- asks too.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isDirty]);

  const setCell = useCallback(
    (id: string, field: CellField, value: string) => {
      setValues((previous) => ({ ...previous, [id]: { ...previous[id], [field]: value } }));
    },
    [setValues]
  );

  function discard() {
    setValues(structuredClone(original));
    setError(null);
  }

  const labelOf = (id: string) => {
    const record = records.find((entry) => entry.id === id);
    return record?.sampleIdent ?? record?.labCode ?? id;
  };

  /**
   * Saves the edited rows. A result that already had a value is replaced only
   * after the analyst has seen what it was and said so (`overwrite`).
   */
  async function save(overwrite = false): Promise<boolean> {
    if (!isDirty || isSaving) return false;
    if (invalid.length > 0) {
      // Straight to the first box that is wrong, rather than a message that
      // leaves somebody hunting for it.
      const first = invalid[0];
      document.getElementById(cellId(first.rowIndex, first.field))?.focus();
      setError(t("invalidCells", { count: invalid.length }));
      return false;
    }

    const payload = dirtyIds.map((id) => toPayload(id, values[id]));
    if (!overwrite) {
      const replaced = dirtyIds.flatMap((id) => {
        const fields = findOverwrites(toPayload(id, original[id]), toPayload(id, values[id]));
        return fields.length > 0 ? [{ id, label: labelOf(id), fields }] : [];
      });
      if (replaced.length > 0) {
        setReplacing(replaced);
        return false;
      }
    }

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(withBasePath("/api/lab-records/bulk"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: payload, overwrite }),
      });
      const body: ApiResult<{ updated: number }> = await response.json();
      if (!body.success) {
        // Filled in by someone else since this screen was opened: ask, with
        // what the server found.
        if (body.code === "overwrite") {
          const details = body.details as { overwrites?: { id: string; fields: Overwrite[] }[] };
          setReplacing(
            (details.overwrites ?? []).map((entry) => ({ id: entry.id, label: labelOf(entry.id), fields: entry.fields }))
          );
          return false;
        }
        setError(body.error);
        return false;
      }
      setReplacing(null);

      setOriginal((previous) => {
        const next = { ...previous };
        for (const id of dirtyIds) next[id] = { ...values[id] };
        return next;
      });
      setSavedIds((previous) => new Set([...previous, ...dirtyIds]));
      toast(t("saved", { count: body.data.updated }));
      return true;
    } catch {
      setError(tCommon("networkError"));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  // Ctrl+S (Cmd+S) saves instead of offering to download the page.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function back() {
    if (isDirty) setConfirmLeave(true);
    else onDone(savedIds.size > 0);
  }

  /**
   * A pasted block lands in the boxes rather than going to the server, so it
   * is checked on screen like anything typed. Columns it filled that were
   * hidden are shown, or they would be saved without ever being seen.
   */
  function handleFill(rows: PasteRow[]) {
    const filled = new Set(rows.flatMap((row) => Object.keys(row.values)));
    const reveal = ALL_COLUMNS.filter((key) => filled.has(key) && !visible.includes(key));
    if (reveal.length > 0) setVisible([...visible, ...reveal]);

    setValues((previous) => {
      const next = { ...previous };
      for (const row of rows) {
        if (!row.targetId || !next[row.targetId]) continue;
        const current = { ...next[row.targetId] };
        for (const [key, value] of Object.entries(row.values)) {
          if (!(key in current)) continue;
          const isDate = INSTRUMENT_FIELDS.some((field) => field.key === key && field.kind === "datetime");
          current[key as CellField] =
            value === null ? "" : isDate ? toWitaInputValue(String(value)) : String(value);
        }
        next[row.targetId] = current;
      }
      return next;
    });
    setIsPasting(false);
  }

  function toggleColumn(column: Column) {
    setVisible(visible.includes(column) ? visible.filter((key) => key !== column) : [...visible, column]);
  }

  const formatDate = useCallback(
    (shiftDate: string) => {
      const date = parseShiftDateInput(shiftDate);
      return date ? format.dateTime(date, { day: "numeric", month: "short", timeZone: "UTC" }) : shiftDate;
    },
    [format]
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1.5" onClick={back}>
          <IoArrowBack className="size-4" />
          {t("selection.back")}
        </Button>
        <span className="text-sm text-muted-foreground">
          {t("selection.editing", { count: records.length })}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" className="gap-2">
                  <IoOptionsOutline className="size-4" />
                  {tCommon("columns")}
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuGroup>
                <DropdownMenuLabel>{tCommon("columns")}</DropdownMenuLabel>
                {ASSAY_FIELDS.map((field) => (
                  <DropdownMenuCheckboxItem
                    key={field.key}
                    checked={visible.includes(field.key)}
                    onCheckedChange={() => toggleColumn(field.key)}
                    closeOnClick={false}
                  >
                    {field.label}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuLabel>{tDatabase("instrumentColumns")}</DropdownMenuLabel>
                {INSTRUMENT_FIELDS.map((field) => (
                  <DropdownMenuCheckboxItem
                    key={field.key}
                    checked={visible.includes(field.key)}
                    onCheckedChange={() => toggleColumn(field.key)}
                    closeOnClick={false}
                  >
                    {tDatabase(field.key)}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuCheckboxItem
                  checked={showRemarks}
                  onCheckedChange={() => toggleColumn("remarks")}
                  closeOnClick={false}
                >
                  {tDatabase("dialog.remarks")}
                </DropdownMenuCheckboxItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => {
              setPasteMounted(true);
              setIsPasting(true);
            }}
          >
            <IoClipboardOutline className="size-4" />
            {tDatabase("paste.open")}
          </Button>
        </div>
      </div>

      <InlineNotice tone="error">{error}</InlineNotice>

      {/*
        A form for a few samples, the grid for many.

        The grid earns its sideways scroll when there are twenty rows: a
        column can be read straight down and compared, which is most of why
        it is a table. For one sample it earned nothing -- eighteen boxes
        stretched across two screens while the page below sat empty, so
        filling one result meant scrolling back past everything typed.

        Three is where it turns over: up to three cards fit a screen, and
        past that the stack gets longer than the scroll it saves.
      */}
      {records.length > 0 && records.length <= FORM_UP_TO ? (
        <ResultsForm
        records={records}
        values={values}
        original={original}
        savedIds={savedIds}
        columns={columns}
        instrumentColumns={instrumentColumns}
        showRemarks={showRemarks}
        formatDate={formatDate}
        onCellChange={setCell}
        />
      ) : (
        <ResultsGrid
        records={records}
        values={values}
        original={original}
        savedIds={savedIds}
        columns={columns}
        instrumentColumns={instrumentColumns}
        showRemarks={showRemarks}
        formatDate={formatDate}
        onCellChange={setCell}
          isLoading={false}
          emptyMessage={t("noMatch")}
        />
      )}

      {/*
        Pinned to the bottom of the window while there is something to save,
        so Save is never a scroll away from the row just typed in.
      */}
      {isDirty ? (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-2xl border bg-background/95 px-4 py-3 shadow-raised backdrop-blur-sm">
          <span className="text-sm font-medium">{t("dirtyRows", { count: dirtyIds.length })}</span>
          {invalid.length > 0 ? (
            <span className="text-sm text-destructive">{t("invalidCells", { count: invalid.length })}</span>
          ) : (
            <span className="hidden text-xs text-muted-foreground sm:inline">{t("saveHint")}</span>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" disabled={isSaving} onClick={discard}>
              {t("discard")}
            </Button>
            <Button className="gap-2" disabled={isSaving} onClick={() => void save()}>
              {isSaving ? <IoReloadOutline className="size-4 animate-spin" /> : <IoSaveOutline className="size-4" />}
              {t("saveRows", { count: dirtyIds.length })}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Replacing a result the lab already reported is done on purpose. */}
      <Dialog open={replacing !== null} onOpenChange={(open) => (open || isSaving ? null : setReplacing(null))}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {t("overwrite.title", {
                count: (replacing ?? []).reduce((total, entry) => total + entry.fields.length, 0),
              })}
            </DialogTitle>
            <DialogDescription>{t("overwrite.body")}</DialogDescription>
          </DialogHeader>
          <ul className="flex max-h-60 flex-col gap-1 overflow-y-auto font-mono text-xs">
            {(replacing ?? []).map((entry) => (
              <li key={entry.id} className="flex flex-wrap gap-x-3">
                <span className="font-semibold">{entry.label}</span>
                {entry.fields.map((field) => (
                  <span key={field.field} className="whitespace-nowrap text-amber-700 dark:text-amber-400">
                    {ASSAY_FIELDS.find((spec) => spec.key === field.field)?.shortLabel ?? tDatabase(field.field)}{" "}
                    {String(field.from)} → {field.to === null ? "—" : String(field.to)}
                  </span>
                ))}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isSaving}
              onClick={() => {
                // Back to what was there: only the replaced boxes are reset.
                setValues((previous) => {
                  const next = { ...previous };
                  for (const entry of replacing ?? []) {
                    const row = { ...next[entry.id] };
                    for (const field of entry.fields) {
                      row[field.field as CellField] = original[entry.id][field.field as CellField];
                    }
                    next[entry.id] = row;
                  }
                  return next;
                });
                setReplacing(null);
              }}
            >
              {t("overwrite.keepOld")}
            </Button>
            <Button className="gap-2" disabled={isSaving} onClick={() => void save(true)}>
              {isSaving ? <IoReloadOutline className="size-4 animate-spin" /> : null}
              {t("overwrite.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("unsaved.title", { count: dirtyIds.length })}</DialogTitle>
            <DialogDescription>{t("unsaved.body")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmLeave(false)}>
              {tCommon("cancel")}
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => {
                setConfirmLeave(false);
                onDone(savedIds.size > 0);
              }}
            >
              {t("unsaved.discard")}
            </Button>
            <Button
              disabled={isSaving}
              onClick={async () => {
                const saved = await save();
                setConfirmLeave(false);
                if (saved) onDone(true);
              }}
            >
              {t("unsaved.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {pasteMounted ? (
        <PasteFromExcel
          records={records}
          open={isPasting}
          onClose={() => setIsPasting(false)}
          onApplied={() => setIsPasting(false)}
          onFill={handleFill}
        />
      ) : null}
    </div>
  );
}
