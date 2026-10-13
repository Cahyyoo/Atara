"use client";

import { useState } from "react";
import type { ApiResult } from "@/core/types";
import type { LabRecordListItemDTO } from "@/modules/lab/types";
import { withBasePath } from "@/core/lib/http/base-path";
import type { Confirming } from "@/modules/lab/components/shared/lab-records-table/types";

/** Removing or restoring the ticked samples, and deleting ticked sub-samples. */
export function useRecordRemoval({
  selectedSamples,
  selectedSubs,
  showDeleted,
  setError,
  loadError,
  clearSelection,
  reload,
}: {
  selectedSamples: LabRecordListItemDTO[];
  selectedSubs: LabRecordListItemDTO[];
  showDeleted: boolean;
  setError: (error: string | null) => void;
  loadError: string;
  clearSelection: () => void;
  reload: () => void;
}) {
  /** Removing samples and removing sub-samples are different acts, confirmed apart. */
  const [confirming, setConfirming] = useState<Confirming>(false);
  const [isRemoving, setIsRemoving] = useState(false);

  async function handleRemove() {
    setIsRemoving(true);
    setError(null);

    try {
      const response = await fetch(withBasePath("/api/samples/delete"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The flag lives on the sample, not on its lab record. Sub-samples
          // carry their parent's sample, and are removed on their own.
          ids: selectedSamples.map((record) => record.sample.id),
          restore: showDeleted,
        }),
      });
      const body: ApiResult<{ changed: number }> = await response.json();

      if (!body.success) {
        setError(body.error);
        return;
      }
      // The rows have left this view, so the selection that pointed at them is
      // meaningless; re-reading is the only honest next state.
      clearSelection();
      reload();
    } catch {
      setError(loadError);
    } finally {
      setIsRemoving(false);
      setConfirming(false);
    }
  }

  /** Sub-samples are deleted outright; their parent keeps a note of it. */
  async function handleRemoveSubs() {
    setIsRemoving(true);
    setError(null);
    try {
      const response = await fetch(withBasePath("/api/lab-records/subs"), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selectedSubs.map((record) => record.id) }),
      });
      const body: ApiResult<{ removed: number }> = await response.json();
      if (!body.success) {
        setError(body.error);
        return;
      }
      clearSelection();
      reload();
    } catch {
      setError(loadError);
    } finally {
      setIsRemoving(false);
      setConfirming(false);
    }
  }

  return { confirming, setConfirming, isRemoving, handleRemove, handleRemoveSubs };
}
