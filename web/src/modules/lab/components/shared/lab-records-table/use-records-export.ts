"use client";

import { useState } from "react";
import { downloadFromApi } from "@/core/lib/http/download";
import { withBasePath } from "@/core/lib/http/base-path";
import type { ApiResult } from "@/core/types";
import type { ExportPreview, ExportPreviewResult } from "@/modules/lab/components/shared/export-dialog";

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

  /** The table's filters, with the dialog's own choices on top. */
  function exportParams(format: "xlsx" | "csv" | "preview", columns: string[]) {
    const params = buildParams();
    params.set("format", format);
    params.set("columns", columns.join(","));
    if (exportSubs) params.set("subs", "include");
    // The dialog's own choice wins over the table's filter for this file.
    const place = exportPlace ?? placeId;
    if (place === "ALL") params.delete("placeId");
    else params.set("placeId", place);
    return params;
  }

  async function handleExport(kind: "xlsx" | "csv", columns: string[]) {
    setError(null);
    const message = await downloadFromApi(
      `/api/lab-records/export?${exportParams(kind, columns).toString()}`,
      `sample-database.${kind}`
    );
    if (message) setError(message);
  }

  /** The first rows of the file, arranged exactly as it will be. */
  async function handlePreview(columns: string[]): Promise<ExportPreviewResult> {
    try {
      const response = await fetch(
        withBasePath(`/api/lab-records/export?${exportParams("preview", columns).toString()}`)
      );
      const body: ApiResult<ExportPreview> = await response.json();
      return body.success ? { ok: true, preview: body.data } : { ok: false, error: body.error };
    } catch {
      return { ok: false, error: "" };
    }
  }

  return { exportSubs, setExportSubs, exportPlace, setExportPlace, handleExport, handlePreview };
}
