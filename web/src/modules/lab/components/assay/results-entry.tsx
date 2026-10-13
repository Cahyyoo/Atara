"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Button } from "@/core/components/ui/button";
import { InlineNotice } from "@/core/components/ui/inline-notice";
import { ResultsForm } from "@/modules/lab/components/assay/results-form";
import { ResultsGrid } from "@/modules/lab/components/assay/results-grid";
import { ResultsColumnPicker } from "@/modules/lab/components/assay/results-column-picker";
import { ResultsSaveBar } from "@/modules/lab/components/assay/results-save-bar";
import { ResultsOverwriteDialog } from "@/modules/lab/components/assay/results-overwrite-dialog";
import { ResultsUnsavedDialog } from "@/modules/lab/components/assay/results-unsaved-dialog";
import { FORM_UP_TO } from "@/modules/lab/components/assay/results-entry-utils";
import { useResultsEntry } from "@/modules/lab/components/assay/use-results-entry";
import type { LabRecordListItemDTO } from "@/modules/lab/types";
import { IoArrowBack, IoClipboardOutline } from "react-icons/io5";

/** Loaded the first time it is opened; most rows are typed or pasted from the list. */
const PasteFromExcel = dynamic(
  () => import("@/modules/lab/components/shared/paste-from-excel").then((m) => m.PasteFromExcel),
  { ssr: false }
);

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
  const {
    original,
    values,
    savedIds,
    error,
    isSaving,
    confirmLeave,
    setConfirmLeave,
    isPasting,
    setIsPasting,
    pasteMounted,
    replacing,
    setReplacing,
    visible,
    columns,
    instrumentColumns,
    showRemarks,
    dirtyIds,
    invalid,
    isDirty,
    setCell,
    discard,
    save,
    back,
    leave,
    saveAndLeave,
    keepOld,
    handleFill,
    openPaste,
    toggleColumn,
    formatDate,
  } = useResultsEntry(records, onDone);

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
          <ResultsColumnPicker visible={visible} showRemarks={showRemarks} onToggle={toggleColumn} />
          <Button variant="outline" className="gap-2" onClick={openPaste}>
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

      {isDirty ? (
        <ResultsSaveBar
          dirtyCount={dirtyIds.length}
          invalidCount={invalid.length}
          isSaving={isSaving}
          onDiscard={discard}
          onSave={() => void save()}
        />
      ) : null}

      <ResultsOverwriteDialog
        replacing={replacing}
        isSaving={isSaving}
        onDismiss={() => setReplacing(null)}
        onKeepOld={keepOld}
        onConfirm={() => void save(true)}
      />

      <ResultsUnsavedDialog
        open={confirmLeave}
        onOpenChange={setConfirmLeave}
        dirtyCount={dirtyIds.length}
        isSaving={isSaving}
        onDiscard={leave}
        onSave={() => void saveAndLeave()}
      />

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
