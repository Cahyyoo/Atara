"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/core/components/ui/dialog";
import { toast } from "@/core/components/ui/toast";
import { LabRecordsTable, type LabRecordsAccess } from "@/modules/lab/components/shared/lab-records-table";
import type { LabRecordListItemDTO } from "@/modules/lab/types";

const ASSAY_ACCESS: LabRecordsAccess = { canEdit: false, canExport: false, canViewDeleted: false };

/**
 * The paste dialog, the grid and the whole-sheet import each arrive the first
 * time they are used. The list is what every visit opens on.
 */
const loadPasteSheet = () =>
  import("@/modules/lab/components/assay/paste-sheet/paste-sheet-dialog").then((m) => m.PasteSheetDialog);
const PasteSheetDialog = dynamic(loadPasteSheet, { ssr: false });
const ResultsEntry = dynamic(
  () => import("@/modules/lab/components/assay/results-entry").then((m) => m.ResultsEntry),
  { ssr: false, loading: () => <div className="h-96 animate-pulse rounded-xl bg-muted/40" /> }
);
const PasteImport = dynamic(
  () => import("@/modules/lab/components/assay/paste-import").then((m) => m.PasteImport),
  { ssr: false, loading: () => <div className="h-52 animate-pulse rounded-xl bg-muted/40" /> }
);

/**
 * Entering results: pick the samples, then fill them in.
 *
 * The list comes first, opened on the samples still waiting for a result, so
 * the choice of which ones to fill is the user's. From the ticked rows, Paste
 * from Excel and Type manually both open the same grid: one row per ticked
 * sample, a box per result, and a block copied out of the instrument's sheet
 * pastes straight into it as it would into another sheet.
 *
 * With nothing ticked, Paste by Sample ID opens the paste sheet -- a Sample ID
 * column beside the results, up to five thousand rows, matched against every
 * sample by the server. A whole file goes through Import file.
 */
export function ResultsPage() {
  const t = useTranslations("assay");
  const [editing, setEditing] = useState<LabRecordListItemDTO[] | null>(null);
  const [isPasting, setIsPasting] = useState(false);
  const [pasteMounted, setPasteMounted] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  /** Remounts the list after a save, to re-read the rows and clear the ticks. */
  const [listKey, setListKey] = useState(0);

  // The paste sheet's code is fetched once the page has settled, while the
  // browser has nothing better to do: by the time "Paste by Sample ID" is
  // pressed it is already here, and the sheet opens at once instead of after
  // a pause with nothing on screen.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((run: () => void) => window.setTimeout(run, 1200));
    const cancel = window.cancelIdleCallback ?? window.clearTimeout;
    const handle = idle(() => void loadPasteSheet());
    return () => cancel(handle);
  }, []);

  // The list, made once per reload: opening or closing the paste sheet
  // changes this page's state, and the fifty-row table behind it would
  // otherwise be drawn again for nothing in the very frames the sheet opens in.
  // Every handler here only calls a state setter, which never changes.
  const list = useMemo(
    () => (
      <LabRecordsTable
        key={listKey}
        // Entering results is this page's whole job, and only the roles with
        // enterResults reach it. Editing a record's identity, exporting and the
        // deleted view belong to the Sample Database.
        access={ASSAY_ACCESS}
        mode="assay"
        // Only the toolbar's "Paste by Sample ID": ticked samples are pasted
        // into in the entry grid itself.
        onPaste={() => {
          setPasteMounted(true);
          setIsPasting(true);
        }}
        onEnterResults={setEditing}
        onImport={() => setIsImporting(true)}
      />
    ),
    [listKey]
  );

  if (editing) {
    return (
      <ResultsEntry
        records={editing}
        onDone={(changed) => {
          setEditing(null);
          if (changed) setListKey((key) => key + 1);
        }}
      />
    );
  }

  return (
    <>
      {list}

      {pasteMounted ? (
        <PasteSheetDialog
          // A fresh sheet after each save: what was saved is gone from it. Its
          // own key, not the list's -- two siblings sharing one key leave React
          // matching the wrong one, and the list stops answering its ticks.
          key={`sheet-${listKey}`}
          open={isPasting}
          onClose={() => setIsPasting(false)}
          onApplied={(count) => {
            setIsPasting(false);
            toast(t("sheet.saved", { count }));
            setListKey((key) => key + 1);
          }}
        />
      ) : null}

      <Dialog
        open={isImporting}
        onOpenChange={(open) => {
          setIsImporting(open);
          // Whatever the import saved should be on the list when it closes.
          if (!open) setListKey((key) => key + 1);
        }}
      >
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{t("importTitle")}</DialogTitle>
            <DialogDescription>{t("importDescription")}</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto">
            <PasteImport />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
