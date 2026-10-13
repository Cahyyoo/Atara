"use client";

import { useState } from "react";
import { downloadFromApi } from "@/core/lib/http/download";

/** The export's own choices, and the download they make. */
export function useRecordsExport({
  buildParams,
  placeId,
  setError,
}: {
  buildParams: () => URLSearchParams;
  placeId: string;
  setError: (error: string | null) => void;
}) {
  /** Export: each sample's sub-samples as rows of their own, right after it. */
  const [exportSubs, setExportSubs] = useState(false);
  /**
   * Which place the export covers. It opens on whatever the table is
   * filtered to, so the file matches what is on screen, and can then be
   * widened to every place or narrowed to one for this download alone.
   */
  const [exportPlace, setExportPlace] = useState<string | null>(null);

  async function handleExport(kind: "xlsx" | "csv", columns: string[]) {
    setError(null);
    const params = buildParams();
    params.set("format", kind);
    params.set("columns", columns.join(","));
    if (exportSubs) params.set("subs", "include");
    // The dialog's own choice wins over the table's filter for this file.
    const place = exportPlace ?? placeId;
    if (place === "ALL") params.delete("placeId");
    else params.set("placeId", place);

    const message = await downloadFromApi(
      `/api/lab-records/export?${params.toString()}`,
      `sample-database.${kind}`
    );
    if (message) setError(message);
  }

  return { exportSubs, setExportSubs, exportPlace, setExportPlace, handleExport };
}
