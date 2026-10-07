import { requireCapabilityPage } from "@/lib/page-auth";

/** Reprinting labels is an admin action; operators are sent back to the dashboard. */
export default async function LabelsLayout({ children }: { children: React.ReactNode }) {
  await requireCapabilityPage("printLabels");
  return <>{children}</>;
}
