import { requireCapabilityPage } from "@/lib/page-auth";
import { ActivityTabs } from "@/components/activity/activity-tabs";

export const dynamic = "force-dynamic";

/**
 * Who signed in, from where, and who was refused -- across every department,
 * so it is the super admin's. The table loads its own list of people.
 */
export default async function SignInsPage() {
  await requireCapabilityPage("viewSignInAudit");
  return <ActivityTabs stages={[]} tabs={["signIn"]} />;
}
