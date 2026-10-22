import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { ListPage } from "@/modules/eksplorasi/components/pages/list-page";

export const dynamic = "force-dynamic";

/** The DUPLICATE rows of the data source. */
export default async function DuplicatePage() {
  await requireCapabilityPage("manageExplorationData");
  return <ListPage view="duplicate" />;
}
