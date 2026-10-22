import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { EditPage } from "@/modules/eksplorasi/components/pages/edit-page";

export const dynamic = "force-dynamic";

/** One row of this list changed in the sheet. */
export default async function EditBlankPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCapabilityPage("manageExplorationData");
  const { id } = await params;
  return <EditPage view="blank" id={id} />;
}
