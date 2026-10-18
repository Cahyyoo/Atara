import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { DrillHoleSheetPage } from "@/modules/eksplorasi/components/sheet/drill-hole-sheet-page";

export const dynamic = "force-dynamic";

/** New drill holes, typed or pasted into a sheet. */
export default async function NewDrillHolesPage() {
  await requireCapabilityPage("manageDrilling");
  return <DrillHoleSheetPage />;
}
