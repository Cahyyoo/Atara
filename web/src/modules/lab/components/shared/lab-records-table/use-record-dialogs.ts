"use client";

import { useEffect, useRef, useState } from "react";
import { prefetchMasterOptions } from "@/modules/lab/hooks/use-master-options";
import type { LabRecordListItemDTO } from "@/modules/lab/types";

/**
 * Which of the table's panels and dialogs are open, and which have been
 * mounted at all: each is loaded on first use.
 */
export function useRecordDialogs(bulkLikely: boolean) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<LabRecordListItemDTO | null>(null);
  // Mounted on first use, then left in place so the closing animation still runs.
  const [sheetMounted, setSheetMounted] = useState(false);
  const [dialogMounted, setDialogMounted] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkMounted, setBulkMounted] = useState(false);
  /**
   * The records the identity dialog was opened for, taken at that moment: it
   * can be minimized while the table is filtered and ticked again, and must
   * keep editing the records it started with.
   */
  const [bulkRecords, setBulkRecords] = useState<LabRecordListItemDTO[]>([]);
  const [bulkMinimized, setBulkMinimized] = useState(false);
  const [weightsOpen, setWeightsOpen] = useState(false);
  const [weightsMounted, setWeightsMounted] = useState(false);
  /** The row whose result history is open, if any. */
  const [historyOf, setHistoryOf] = useState<LabRecordListItemDTO | null>(null);
  const [historyMounted, setHistoryMounted] = useState(false);

  function openHistory(record: LabRecordListItemDTO) {
    setHistoryMounted(true);
    setHistoryOf(record);
  }

  // The identity dialog is one click away once rows are ticked, or the CTA
  // shows: fetch its code and the vocabularies now, so it opens at once and
  // with its codes in place rather than after a round trip.
  const bulkWarmed = useRef(false);
  useEffect(() => {
    if (!bulkLikely || bulkWarmed.current) return;
    bulkWarmed.current = true;
    void import("@/modules/lab/components/database/bulk-identity-dialog");
    void prefetchMasterOptions();
  }, [bulkLikely]);

  /** The same records as a minimized dialog bring it back as it was; others start afresh. */
  function openBulkIdentity(picked: LabRecordListItemDTO[]) {
    setBulkRecords(picked);
    setBulkMounted(true);
    setBulkOpen(true);
    setBulkMinimized(false);
  }

  function closeBulkIdentity() {
    setBulkOpen(false);
    setBulkMinimized(false);
  }

  function openRow(record: LabRecordListItemDTO) {
    setSheetMounted(true);
    setOpenId(record.id);
  }

  function editRecord(record: LabRecordListItemDTO) {
    setDialogMounted(true);
    setEditing(record);
  }

  function openWeights() {
    setWeightsMounted(true);
    setWeightsOpen(true);
  }

  return {
    openId,
    closeRow: () => setOpenId(null),
    openRow,
    editing,
    closeEditing: () => setEditing(null),
    editRecord,
    sheetMounted,
    dialogMounted,
    historyOf,
    historyMounted,
    openHistory,
    closeHistory: () => setHistoryOf(null),
    weightsOpen,
    weightsMounted,
    openWeights,
    closeWeights: () => setWeightsOpen(false),
    bulkOpen,
    bulkMounted,
    bulkRecords,
    bulkMinimized,
    setBulkMinimized,
    openBulkIdentity,
    closeBulkIdentity,
  };
}
