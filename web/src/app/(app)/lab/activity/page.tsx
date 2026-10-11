import { requireCapabilityPage } from "@/lib/page-auth";
import { loadStages } from "@/lib/stages-cache";
import { ActivityTabs } from "@/components/activity/activity-tabs";

export const dynamic = "force-dynamic";

/**
 * Who moved which sample. The sign-in trail moved to the super admin
 * (/admin/sign-ins), since it covers every department.
 *
 * Lab admin only, like Users and Master Data, because this is data about
 * people as much as about samples. Operators keep what they already had: the timeline on
 * a sample's own page, which has always named who did each step.
 */
export default async function ActivityPage() {
  await requireCapabilityPage("viewActivity");

  // Only what the stage filter row reads; the tables ask for nothing more,
  // and the sign-in trail loads its own list of people from its route.
  const stages = (await loadStages()).map(({ id, key, name }) => ({ id, key, name }));

  return <ActivityTabs stages={stages} tabs={["stages"]} />;
}
