import { notFound } from "next/navigation";
import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { ApiError } from "@/core/lib/http/api-response";
import { getDrillHole } from "@/modules/eksplorasi/lib/drill-hole-service";
import { DrillHoleSheetPage } from "@/modules/eksplorasi/components/sheet/drill-hole-sheet-page";

export const dynamic = "force-dynamic";

/** One drill hole changed in the sheet: on it already unlocked, with the latest holes around it. */
export default async function EditDrillHolePage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapabilityPage("manageDrilling");
  const { id } = await params;
  const hole = await getDrillHole(id).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  return <DrillHoleSheetPage editing={hole} />;
}
