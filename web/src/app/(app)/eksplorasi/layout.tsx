import type { ReactNode } from "react";
import { requireCapabilityPage } from "@/lib/page-auth";

/**
 * The Eksplorasi module. Only its people come in; everybody else is sent back
 * to the portal. Each page still checks its own capability.
 */
export default async function EksplorasiLayout({ children }: { children: ReactNode }) {
  await requireCapabilityPage("manageDrilling");
  return children;
}
