import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { DataSourceSheetPage } from "@/modules/eksplorasi/components/sheet/data-source-sheet-page";

export const dynamic = "force-dynamic";

/** New rows for this list, typed or pasted into a sheet. */
export default async function NewStandardPage() {
  await requireCapabilityPage("manageExplorationData");
  return <DataSourceSheetPage view="standard" />;
}
