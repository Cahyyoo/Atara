import { requireCapabilityPage } from "@/core/lib/http/page-auth";
import { ListPage } from "@/modules/eksplorasi/components/pages/list-page";

export const dynamic = "force-dynamic";

/** Every row of the data source, every sample type. */
export default async function DataSourcePage() {
  await requireCapabilityPage("manageExplorationData");
  return <ListPage view="dataSource" />;
}
