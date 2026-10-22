import "server-only";
import { notFound, redirect } from "next/navigation";
import { ApiError } from "@/core/lib/http/api-response";
import { getDataSource } from "@/modules/eksplorasi/lib/data-source-service";
import { VIEWS, viewOfType } from "@/modules/eksplorasi/lib/data-source-columns";
import { DataSourceSheetPage } from "@/modules/eksplorasi/components/sheet/data-source-sheet-page";
import type { DataSourceView } from "@/modules/eksplorasi/types";

/**
 * One sample changed in a list's sheet: on it already unlocked, with the
 * list's latest samples around it. A QC list only edits its own type; a
 * sample of another type is sent to its own list's sheet.
 */
export async function EditPage({ view, id }: { view: DataSourceView; id: string }) {
  const sample = await getDataSource(id).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  const fixed = VIEWS[view].sampleType;
  if (fixed !== null && sample.sampleType !== fixed) {
    redirect(`${VIEWS[viewOfType(sample.sampleType)].path}/${id}/edit`);
  }
  return <DataSourceSheetPage view={view} editing={sample} />;
}
