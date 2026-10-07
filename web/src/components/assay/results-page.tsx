"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { LabRecordsTable, type LabRecordsAccess } from "@/components/shared/lab-records-table";
import type { LabRecordListItemDTO } from "@/types";

const ASSAY_ACCESS: LabRecordsAccess = { canEdit: false, canExport: false, canViewDeleted: false };

/**
 * The paste dialog, the grid and the whole-sheet import each arrive the first
 * time they are used. The list is what every visit opens on.
 */
const PasteFromExcel = dynamic(
  () => import("@/components/shared/paste-from-excel").then((m) => m.PasteFromExcel),
  { ssr: false }
);
const ResultsEntry = dynamic(
  () => import("@/components/assay/results-entry").then((m) => m.ResultsEntry),
  { ssr: false, loading: () => <div className="h-96 animate-pulse rounded-xl bg-muted/40" /> }
);
const PasteImport = dynamic(
  () => import("@/components/assay/paste-import").then((m) => m.PasteImport),
  { ssr: false, loading: () => <div className="h-52 animate-pulse rounded-xl bg-muted/40" /> }
);

/**
 * Entering results: pick the samples, then fill them in.
 *
 * The list comes first, opened on the samples still waiting for a result, so
 * the choice of which ones to fill is the user's. From the ticked rows:
 *
 *   Paste from Excel -- the common case; a block copied out of the instrument's
 *                       sheet is matched to the ticked rows and saved.
 *   Type manually    -- the grid, for the few read off a printout.
 *
 * A whole sheet covering samples nobody has ticked goes through Import file,
 * which matches against every sample.
 */
export function ResultsPage() {
  const t = useTranslations("assay");
  const tPaste = useTranslations("database.paste");
  const [editing, setEditing] = useState<LabRecordListItemDTO[] | null>(null);
  const [pasteTargets, setPasteTargets] = useState<LabRecordListItemDTO[]>([]);
  const [isPasting, setIsPasting] = useState(false);
  const [pasteMounted, setPasteMounted] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  /** Remounts the list after a save, to re-read the rows and clear the ticks. */
  const [listKey, setListKey] = useState(0);

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
      <LabRecordsTable
        key={listKey}
        // Entering results is this page's whole job, and only the roles with
        // enterResults reach it. Editing a record's identity, exporting and the
        // deleted view belong to the Sample Database.
        access={ASSAY_ACCESS}
        mode="assay"
        onPaste={(records) => {
          setPasteTargets(records);
          setPasteMounted(true);
          setIsPasting(true);
        }}
        onEnterResults={setEditing}
        onImport={() => setIsImporting(true)}
      />

      {pasteMounted ? (
        <PasteFromExcel
          records={pasteTargets}
          open={isPasting}
          onClose={() => setIsPasting(false)}
          onApplied={() => {
            setIsPasting(false);
            toast(tPaste("applied"));
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
