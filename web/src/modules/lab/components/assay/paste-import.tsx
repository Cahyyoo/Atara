"use client";

import { InlineNotice } from "@/core/components/ui/inline-notice";
import { withBasePath } from "@/core/lib/http/base-path";
import { PasteImportDone } from "@/modules/lab/components/assay/paste-import-done";
import { PasteImportInput } from "@/modules/lab/components/assay/paste-import-input";
import { PasteImportPreview } from "@/modules/lab/components/assay/paste-import-preview";
import { PasteImportSaveBar } from "@/modules/lab/components/assay/paste-import-save-bar";
import { usePasteImport } from "@/modules/lab/components/assay/use-paste-import";

/** The empty sheet, in the shape this screen reads back. */
function downloadTemplate() {
  window.location.href = withBasePath("/api/lab-records/template?shape=keyed");
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
  const {
    text,
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
    boxRef,
    replaceText,
    readFile,
    handleDrop,
    copyHeader,
    summary,
    writes,
    canSave,
    save,
    rows,
    pasteAnother,
  } = usePasteImport();

  if (done !== null) {
    return <PasteImportDone count={done} onPasteAnother={pasteAnother} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <PasteImportInput
        text={text}
        hasPreview={Boolean(preview)}
        isDragging={isDragging}
        isChecking={isChecking}
        boxRef={boxRef}
        onDraggingChange={setIsDragging}
        onDrop={handleDrop}
        onTextChange={replaceText}
        onFile={readFile}
        onCopyHeader={copyHeader}
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
            confirmOverwrite={confirmOverwrite}
            isSaving={isSaving}
            canSave={canSave}
            onCancelOverwrite={() => setConfirmOverwrite(false)}
            onSave={save}
            onClear={() => replaceText("")}
          />
        </div>
      ) : null}
    </div>
  );
}
