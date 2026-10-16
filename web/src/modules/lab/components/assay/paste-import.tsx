"use client";

import { InlineNotice } from "@/core/components/ui/inline-notice";
import { withBasePath } from "@/core/lib/http/base-path";
import { PasteImportDone } from "@/modules/lab/components/assay/paste-import-done";
import { PasteImportInput } from "@/modules/lab/components/assay/paste-import-input";
import { PasteImportPreview } from "@/modules/lab/components/assay/paste-import-preview";
import { PasteImportSaveBar } from "@/modules/lab/components/assay/paste-import-save-bar";
import { usePasteImport } from "@/modules/lab/components/assay/use-paste-import";
import { DuplicateConfirmDialog } from "@/modules/lab/components/assay/duplicate-alert";
import { duplicateGroups } from "@/modules/lab/lib/records/assay-duplicates";

/** The empty sheet, in the shape this screen reads back. */
function downloadTemplate() {
  window.location.href = withBasePath("/api/lab-records/template?shape=keyed");
}

/**
 * Entering results from a file -- the instrument's sheet, saved as Excel or
 * CSV. (Pasting from Excel has its own sheet: Tempel per Sample ID.)
 *
 * Matched on the server against every sample, by Lab Code or Sample ID. The
 * old dialog matched only the twenty-five rows on screen, so a sheet covering
 * two shifts came back half "unknown".
 *
 * Nothing is written until the preview has been seen and Save pressed.
 */
export function PasteImport() {
  const {
    fileName,
    preview,
    error,
    isChecking,
    isSaving,
    problemsOnly,
    setProblemsOnly,
    isDragging,
    setIsDragging,
    done,
    confirmOverwrite,
    setConfirmOverwrite,
    clear,
    readFile,
    handleDrop,
    summary,
    writes,
    canSave,
    save,
    rows,
    importAnother,
  } = usePasteImport();

  const hasDuplicates = (summary?.duplicate ?? 0) > 0;
  // Every flagged row, not only the ones the preview's filter shows.
  const duplicates = duplicateGroups(
    (preview?.rows ?? []).flatMap((row) =>
      row.duplicateLines || row.duplicateOf
        ? [{ row: row.line, label: row.labCode, lines: row.duplicateLines, samples: row.duplicateOf }]
        : []
    )
  );

  if (done !== null) {
    return <PasteImportDone count={done} onImportAnother={importAnother} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PasteImportInput
        fileName={fileName}
        isDragging={isDragging}
        isChecking={isChecking}
        onDraggingChange={setIsDragging}
        onDrop={handleDrop}
        onFile={readFile}
        onDownloadTemplate={downloadTemplate}
      />

      <InlineNotice tone="error">{error}</InlineNotice>

      {summary ? (
        <div className="flex flex-col gap-3">
          <PasteImportPreview
            summary={summary}
            rows={rows}
            problemsOnly={problemsOnly}
            onProblemsOnlyChange={setProblemsOnly}
          />
          <PasteImportSaveBar
            summary={summary}
            writes={writes}
            // Look-alikes are asked about in the dialog below, with the list.
            confirmOverwrite={confirmOverwrite && !hasDuplicates}
            isSaving={isSaving}
            canSave={canSave}
            onCancelOverwrite={() => setConfirmOverwrite(false)}
            onSave={save}
            onClear={clear}
          />
          <DuplicateConfirmDialog
            open={confirmOverwrite && hasDuplicates}
            groups={duplicates}
            overwriteCount={summary.overwrite ?? 0}
            busy={isSaving}
            onCancel={() => setConfirmOverwrite(false)}
            onConfirm={() => void save(true)}
          />
        </div>
      ) : null}
    </div>
  );
}
