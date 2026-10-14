"use client";

import dynamic from "next/dynamic";
import type { LabRecordDTO, LabRecordListItemDTO } from "@/modules/lab/types";
import type { useRecordDialogs } from "@/modules/lab/components/shared/lab-records-table/use-record-dialogs";

/**
 * Loaded when first needed: the edit form with its identity pickers, and the
 * detail panel. Looking things up is what this page is for, and looking things
 * up needs neither until a row is opened.
 */
const LabRecordDialog = dynamic(
  () => import("@/modules/lab/components/database/lab-record-dialog").then((m) => m.LabRecordDialog),
  { ssr: false }
);
const LabRecordSheet = dynamic(
  () => import("@/modules/lab/components/database/lab-record-sheet").then((m) => m.LabRecordSheet),
  { ssr: false }
);
/** A row's result history, read when it is first asked for. */
const RecordHistoryDialog = dynamic(
  () => import("@/modules/lab/components/shared/record-history-dialog").then((m) => m.RecordHistoryDialog),
  { ssr: false }
);

/** Wp/W0/Wd pasted from a sheet: the Database role's optional shortcut. */
const PasteWeightsDialog = dynamic(
  () => import("@/modules/lab/components/database/paste-weights").then((m) => m.PasteWeightsDialog),
  { ssr: false }
);

const BulkIdentityDialog = dynamic(
  () => import("@/modules/lab/components/database/bulk-identity-dialog").then((m) => m.BulkIdentityDialog),
  { ssr: false }
);

/** The panels and dialogs a row or the toolbar opens, each mounted on first use. */
export function RecordDialogs({
  dialogs,
  openRecord,
  canEdit,
  canAddOption,
  formatDate,
  onSaved,
  onReload,
  onClearSelection,
}: {
  dialogs: ReturnType<typeof useRecordDialogs>;
  openRecord: LabRecordListItemDTO | null;
  canEdit: boolean;
  /** Whether the identity pickers may add a missing code to the master data. */
  canAddOption: boolean;
  formatDate: (shiftDate: string) => string;
  onSaved: (updated: LabRecordDTO) => void;
  onReload: () => void;
  onClearSelection: () => void;
}) {
  return (
    <>
      {dialogs.historyMounted ? (
        <RecordHistoryDialog record={dialogs.historyOf} onClose={dialogs.closeHistory} />
      ) : null}

      {dialogs.sheetMounted ? (
        <LabRecordSheet
          record={openRecord}
          canEdit={canEdit}
          formatDate={formatDate}
          onClose={dialogs.closeRow}
          onEdit={dialogs.editRecord}
        />
      ) : null}

      {dialogs.dialogMounted ? (
        <LabRecordDialog
          record={dialogs.editing}
          canAddOption={canAddOption}
          onClose={dialogs.closeEditing}
          onSaved={onSaved}
        />
      ) : null}

      {dialogs.weightsMounted ? (
        <PasteWeightsDialog open={dialogs.weightsOpen} onClose={dialogs.closeWeights} onSaved={onReload} />
      ) : null}

      {dialogs.bulkMounted ? (
        <BulkIdentityDialog
          open={dialogs.bulkOpen}
          records={dialogs.bulkRecords}
          canAddOption={canAddOption}
          minimized={dialogs.bulkMinimized}
          onMinimizedChange={dialogs.setBulkMinimized}
          onClose={dialogs.closeBulkIdentity}
          onSaved={() => {
            // The Sample IDs changed on the server; re-read rather than guess.
            onClearSelection();
            onReload();
          }}
        />
      ) : null}
    </>
  );
}
