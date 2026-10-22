import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { ListPage } from "@/modules/eksplorasi/components/pages/list-page";

export const dynamic = "force-dynamic";

/** The BLANK rows of the data source. */
export default async function BlankPage() {
  await requireCapabilityPage("manageExplorationData");
  return <ListPage view="blank" />;
}
