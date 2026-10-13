import type { ReactNode } from "react";
import { requireCapabilityPage } from "@/core/lib/http/page-auth";

/**
 * The lab module: sample monitoring. Only the lab's people come in; everybody
 * else is sent back to the portal. Each page still checks its own capability,
 * since a layout is not re-run on every move between the pages below it.
 */
export default async function LabLayout({ children }: { children: ReactNode }) {
  await requireCapabilityPage("viewDashboard");
  return children;
}
