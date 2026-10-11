import { requireCapabilityPage } from "@/lib/page-auth";

/** Generating samples is an admin action; operators are sent back to the dashboard. */
export default async function GenerateLayout({ children }: { children: React.ReactNode }) {
  await requireCapabilityPage("generateSamples");
  return <>{children}</>;
}
